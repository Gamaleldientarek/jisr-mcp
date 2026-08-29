# Implementation Plan: Jisr MCP Server — Complete Authorized Read Surface

**Branch**: `001-jisr-mcp-server` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-jisr-mcp-server/spec.md`

## Summary

Deliver a self-hosted, single-organization MCP server that exposes all 20 documented Jisr read
operations as purpose-built tools, plus 3 discovery tools, over live Jisr data with no database.
The server is distributed on npm so an adopter runs it with one command, and it is verified against
at least five independent MCP clients.

The technical approach is a **transport-agnostic domain core** — Jisr client, authorization, field
policy, result envelope, cursors, error mapping — with thin MCP adapters bound to it. That boundary
does three jobs at once: it satisfies the spec's deployment-boundary requirement (FR-002) so the
deferred hosted deployment is additive, it lets one codebase serve both the current MCP SDK v2 line
and the v1 line clients are still migrating from (research R3), and it keeps every safety property
enforced in code the SDK cannot bypass.

Phase 0 verification changed two things materially. The live Jisr specification confirms the plan's
29-operation inventory exactly, so no endpoint guesswork is required. But it also revealed that the
general employee list returns salary fields whenever the connected API key holds finance permission
(research R2) — so field-level policy is load-bearing from the first commit rather than a hardening
pass, and the quickstart documents a separate finance-scoped credential as the default posture.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js ≥20 (forced by `@modelcontextprotocol/core` 2.0.0 `engines`)

**Primary Dependencies**: `@modelcontextprotocol/server` 2.0.0 with `@modelcontextprotocol/node` 2.0.0
(default adapter, 2026-07-28 spec); `@modelcontextprotocol/sdk` 1.30.0 (compatibility adapter,
2025-11-25 spec); Zod 4 for input/output schemas and upstream response validation; native `fetch`
for the Jisr client

**Storage**: None. This release holds no Jisr records, requires no database, queue, or worker
(spec FR-045). The only in-process state is a Jisr access-token cache keyed by organization and
credential identity, never by connection (research R4)

**Testing**: Vitest for unit, contract, authorization, and field-policy suites, against fixtures
derived from the specification's own examples; official MCP Inspector for protocol contract
validation against both adapters

**Target Platform**: Cross-platform Node.js ≥20; distributed on npm with a `bin` entry so `npx`
runs it without a build step

**Project Type**: Single project — an MCP server distributed as a CLI-invocable npm package

**Performance Goals**: No server-side latency target is set for this release. End-to-end tool
latency is dominated by the upstream Jisr call, whose rate limits and response times are
undocumented (see Open Dependencies), so any number here would be invented rather than derived.
What is bounded and enforced: upstream page size at Jisr's documented maximum of 100 records, and a
per-invocation total-record ceiling on every collection tool. A latency target becomes meaningful
once upstream behaviour is characterised against a real tenant

**Constraints**: No secret, token, or credential value in any output, log, trace, or test artifact;
no write code path present in the build; no generic HTTP, arbitrary-path, or arbitrary-URL tool;
every collection traversed only by opaque server-issued cursor

**Scale/Scope**: 29 documented upstream operations, of which 20 reads become tools; plus 3 discovery
tools = **23 tools**. One organization per process. Seven role profiles selected by configuration

## Constitution Check

*GATE: evaluated before Phase 0 research, re-evaluated after Phase 1 design. Both passes recorded.*

| Principle | Gate | Pre-Phase 0 | Post-Phase 1 |
|---|---|---|---|
| **I. Documented Surface Only** (NON-NEGOTIABLE) | Every tool traces to an operation in a dated specification snapshot; no invented endpoint, field, permission, or limit | **PASS** — snapshot committed, 29 operations verified against the plan with zero divergence | **PASS** — endpoint manifest is generated from the snapshot; undocumented items (rate limits, token lifetime, permission mapping) are carried as open dependencies, not filled in |
| **II. Least Privilege by Construction** | Two independent gates: caller authorization and Jisr key permission | **PASS** — role profile from configuration, key capability probed at connection | **PASS** — both gates are separate modules; neither infers the other; finance requires explicit opt-in beyond key permission |
| **III. Classify Before You Expose** | Every field classified before it is returned or logged | **PASS** with a named risk: upstream leaks salary into the employee list under a broad key | **PASS** — resolved by an explicit mapper allowlist and a dedicated field-policy test (research R2) |
| **IV. Tenant Isolation** (NON-NEGOTIABLE) | Explicit organization context on every operation, never ambient | **PASS** — single organization this release, but context is a required parameter throughout | **PASS, partly dormant** — organization context is a constructor argument on every service and is bound into every cursor. The principle's storage clauses (record-level `organization_id`, composite uniqueness, separate finance encryption and retention) are vacuously true because nothing is stored, and are recorded as dormant in spec Assumptions so they are not mistaken for satisfied when persistence arrives |
| **V. Truthful Tool Contracts** | Annotations match behavior; read-only means zero upstream mutation | **PASS** | **PASS** — all 23 tools are `readOnlyHint: true`, and the guarantee is structural: no write code path exists to misannotate. Annotations are hints, so enforcement stays server-side (research R6) |
| **VI. Read-First Release Order** | Release 1 is read-only; writes absent, not disabled | **PASS** | **PASS** — the 8 upstream write operations are recorded in the manifest as `release: 2` with no tool binding; no write client method exists |
| **VII. Verified, Not Asserted** (NON-NEGOTIABLE) | No completion claim without passing tests, coverage gate, and Inspector validation | **PASS** | **PASS** — the coverage gate fails the build on manifest/snapshot divergence; Inspector validation against both adapters is a release gate |

**Additional constitutional constraints carried into design**: no credentials in `.env.example`,
fixtures, tests, or documentation; audit record per tool call without sensitive payloads; correlation
identifier spanning request, authorization decision, upstream call, and audit record; PDPL legal
review tracked as an external release dependency, not a design input.

**Result: all gates pass. No unjustified violations.** One justified complexity is recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/001-jisr-mcp-server/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — 8 verified findings
├── data-model.md        # Phase 1 output — entities and field classification
├── quickstart.md        # Phase 1 output — validation guide
├── contracts/           # Phase 1 output
│   ├── jisr-openapi-snapshot-2026-08-29.yaml   # Verified upstream snapshot
│   ├── endpoint-manifest.md                    # 29 operations → tool bindings
│   ├── tool-contracts.md                       # 23 tool input/output contracts
│   └── result-envelope-and-errors.md           # Envelope, cursor, error model
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16 passing)
└── tasks.md             # Phase 2 output — created by /speckit-tasks, NOT by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── core/                          # Domain core — imports no MCP SDK type
│   ├── jisr/
│   │   ├── client.ts              # Typed request helper, retries, timeouts
│   │   ├── authentication.ts      # Token acquisition, cache, one-shot re-auth
│   │   ├── endpoint-manifest.ts   # Generated from the snapshot; coverage gate source
│   │   ├── pagination.ts          # page/rpp ↔ opaque cursor translation
│   │   ├── query-encoding.ts      # Bracket-syntax filter encoding
│   │   ├── schemas/               # Zod schemas per domain, from the snapshot
│   │   ├── mappers/               # Upstream shape → normalized, allowlist-based
│   │   └── errors.ts              # Upstream failure → stable error code
│   ├── authorization/
│   │   ├── principal.ts           # Caller identity, role profile, scopes
│   │   ├── role-profiles.ts       # The seven profiles
│   │   ├── capabilities.ts        # Four-way capability resolution
│   │   ├── policies.ts            # Per-tool authorization decisions
│   │   └── field-policy.ts        # Classification-driven field allowlists
│   ├── services/                  # One per domain, organization context required
│   ├── envelope.ts                # Stable result envelope
│   ├── cursor.ts                  # Opaque, bound, expiring cursors
│   ├── errors.ts                  # Stable error codes
│   └── tools/                     # 23 tool definitions: schema + handler + annotations
│       ├── discovery/             # connection status, capabilities, catalog
│       ├── employees/  attendance/  leave/  accruals/
│       ├── finance/    accounting/  lookups/
│       └── webhooks/   audit/
├── adapters/
│   ├── mcp-v2/                    # @modelcontextprotocol/server 2.0.0 — default
│   └── mcp-v1/                    # @modelcontextprotocol/sdk 1.30.0 — compatibility
├── config/
│   ├── environment.ts             # Validated configuration, actionable failures
│   └── feature-flags.ts           # Finance opt-in and surface narrowing
├── observability/
│   ├── logger.ts  metrics.ts  redaction.ts  audit.ts
└── bin/
    └── jisr-mcp.ts                # npx entry point, adapter selection

tests/
├── contract/          # MCP protocol contracts, both adapters
├── integration/       # Domain connector behaviour against fixtures
├── unit/
├── authorization/     # Role-profile × tool matrix
├── field-policy/      # Includes the employee-list salary-leak case
├── security/          # Cursor tampering, injection, enumeration, redaction
└── fixtures/jisr/     # Derived from specification examples; never real data

scripts/
├── snapshot-jisr-spec.ts       # Refresh the upstream snapshot
├── verify-endpoint-coverage.ts # Coverage gate — fails the build on divergence
└── verify-mcp.ts               # Inspector-driven validation
```

**Structure Decision**: Single project with a hard internal boundary between `src/core/` and
`src/adapters/`. The rule that makes the boundary real and testable: **nothing under `src/core/`
may import an MCP SDK type**, enforced by lint. That single constraint is what delivers the
deployment boundary of FR-002, the dual-SDK support of research R3, and the guarantee that
authorization and field policy cannot be bypassed by an adapter.

This departs from the baseline plan's `src/mcp/` + `src/integrations/` layout, which assumed one SDK
and a hosted deployment. Layers with a clear counterpart are preserved in intent: the baseline's
`integrations/jisr/` becomes `core/jisr/`, `authorization/` and `services/` keep their shape, and
`database/`, `workers/`, and the analytics tool group are absent because this release is live-only
and read-only.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Two MCP adapters (`mcp-v1`, `mcp-v2`) instead of one | Spec FR-003 and SC-006 commit to working across ≥5 independent MCP clients with no client-specific code. SDK v2 (2026-07-28) is the stable line and the correct target; v1 (2025-11-25) is what part of the client ecosystem still speaks one month after the revision landed | **v2 only** was rejected because it would silently exclude clients that have not migrated, breaking the central adoption promise. **v1 only** was rejected because it starts a public project on a line already in maintenance. The adapter is thin — tool registration and transport wiring — because the core imports no SDK type, so the duplicated surface is small and lint-enforced. Parity between adapters is now a specification requirement (FR-002a) with its own success criterion (SC-014), rather than a plan-level intention. The v1 adapter is deleted once the verified client set reports 2026-07-28 support, and that removal is tracked as a release-note item, not left to drift |

## Open Dependencies

Carried from research R7. Principle I forbids filling these by assumption; each blocks only the
behaviour it touches, not the release.

| Unknown | Blocks | Interim treatment |
|---|---|---|
| Access-token lifetime | Token cache tuning | Re-authenticate on rejection, never on a timer; at most one retry |
| Rate limits per organization and endpoint | Client-side throttling defaults | Conservative concurrency; surface upstream 429 as a distinct retryable error |
| Permission-to-endpoint mapping | Precise capability reporting | Probe on connection and record observed permissions; report what was observed, never inferred |
| Whether a capability-discovery endpoint exists | Capability tool fidelity | Derive from connection-time probe results |
| Complete schemas for accruals, monthly payables, payroll transactions | Full field coverage in three tools | Implement documented fields; treat anything else as drift rather than exposing it |
| Webhook signing, retry, ordering, replay guarantees | Nothing in this release | Read-only webhook listing only; deferred with Release 2 |
| External-aggregator onboarding | The `external_aggregator` auth source | Keep the auth source extensible; do not implement until confirmed |

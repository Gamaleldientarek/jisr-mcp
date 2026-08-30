# Phase 0 Research: Jisr MCP Server

**Feature**: `001-jisr-mcp-server` | **Date**: 2026-08-29
**Purpose**: Resolve every unknown in Technical Context before design. Constitution Principle I
forbids implementing against remembered or assumed contracts, so each finding below was verified
against a primary source on the date shown.

---

## R1. The live Jisr OpenAPI surface

**Decision**: Treat `https://openapi.jisr.net/v1/jisr_be/public/openapis.yaml` as the authoritative
specification. A snapshot is committed at
`contracts/jisr-openapi-snapshot-2026-08-29.yaml` (344 KB, `openapi: 3.0.3`, `JisrOpenApi v1.0.0`).

**Rationale**: The documentation portal at `openapi.jisr.net` is a Swagger UI shell that loads its
document from `/v1/api_documentation`, which returns `show_login: false` and points at the YAML
above. The document is publicly retrievable without credentials, so the coverage gate can run in CI.

**Finding — the plan's endpoint inventory is correct.** The live specification contains exactly
**29 operations**, matching `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` §6 with no divergence:

| Category | Count | Operations |
|---|---|---|
| Read (GET) | 20 | employees, employees/basic_info, employees/financial_info, attendance/summary, attendance_logs, employee_leaves/summary, accrual_transactions, employee_monthly_payables, payroll_transactions, gl_transaction_types, paygroups, accounting/journals/{id}, audit_events, webhooks, and 6 lookups |
| Write (POST/PUT/DELETE) | 8 | employees, attendance_logs, accounting/journals, webhooks (create/update/delete/test), payroll_transactions/{id} delete |
| Authentication | 1 | POST /openapi/v1/auth |

Release 1 therefore implements **20 read tools + 3 discovery tools = 23 tools**. The `sync status`
tool named in the original brief is dropped: this release is live-only, so a synchronization status
tool would report on machinery that does not exist.

**Alternatives considered**: Scraping the rendered documentation portal — rejected, it is a
client-side shell with no server-rendered content. Transcribing the plan's tables by hand — rejected,
it would make the plan its own source of truth and violate Principle I.

---

## R2. Financial fields leak through the general employee list

**Decision**: Field-level policy is load-bearing from the first tool, not a later hardening pass.
`jisr_employees_list` MUST strip `basic_salary`, `first_salary_pay_date`, and
`last_salary_pay_date` unless the caller holds finance authorization.

**Rationale**: The specification states verbatim for `GET /openapi/v1/employees`:

> If the API key has the "Get Employee Financial Info" permission, the response will include
> additional financial fields for each employee: `basic_salary`, `first_salary_pay_date`,
> `last_salary_pay_date`. These fields will be omitted if the API key does not have the required
> permission.

Upstream field visibility is therefore governed by the **key's** permission, not the **caller's**.
A single broadly-permissioned Jisr key — exactly what a convenience-minded self-hoster will create —
puts salary data into the ordinary HR listing for every caller. This is a direct collision with
spec FR-026 and Constitution Principle III.

**Consequences**:
1. The employee mapper needs an explicit allowlist, not a passthrough, from the first commit.
2. Spec FR-023b (recommend a separate finance-scoped credential) is upgraded from good practice to
   the documented default in the quickstart.
3. This becomes a named field-policy test: broad key + non-finance caller must yield zero financial
   fields.

**Alternatives considered**: Relying on the operator to provision a narrow key — rejected, it makes
correctness depend on configuration the project does not control. Passing the upstream shape through
and filtering at the edge — rejected, it means sensitive values transit more layers than necessary.

---

## R2a. The finance permission does not strip fields from the employee list

**Observed against the live AZMX tenant, 2026-08-30.**

Jisr's specification states, of `GET /openapi/v1/employees`:

> These fields will be omitted if the API key does not have the required
> permission.

**They are not omitted.** With the financial permission excluded from the key,
the employee list still returns `basic_salary`, `first_salary_pay_date`,
`last_salary_pay_date`, and an undocumented `bank` object.

This is not a case of the permission system failing generally. Excluding
attendance from the same key produces a clean `403 Not authorized` on
`/attendance/summary`, so exclusions do take effect at the endpoint level. The
employee list simply does not honour the documented field-level behaviour.

**Consequence, and it is the important one.** R2 treated the allowlist mapper as
defence in depth over a permission the organization controls. It is not. It is
the **only** thing keeping salary and banking details out of an ordinary employee
listing. A passthrough mapper trusting the key's permission would be leaking
payroll to every caller right now.

Nothing in the design changes — the allowlist was already built this way — but
the risk it carries is higher than R2 assumed, and it should never be relaxed on
the grounds that "the key does not have finance permission anyway".

**Caveats worth checking before reporting to Jisr:** permission changes may
propagate with a delay, and the exact checkbox semantics are not documented.
Re-verify before raising it. If it holds, it is a Jisr defect worth reporting —
any integrator following their documentation would assume those fields are gone.

## R3. MCP protocol version and SDK line

**Decision**: Build the domain core independent of any MCP SDK, and ship **`@modelcontextprotocol/server` v2.0.0**
(2026-07-28 spec) as the default entry point, with a thin v1 adapter on `@modelcontextprotocol/sdk` 1.30.0
(2025-11-25 spec) retained until the verified client set has migrated.

**Rationale**: Verified on 2026-08-29:

| Package | Version | Spec implemented | Node | Status |
|---|---|---|---|---|
| `@modelcontextprotocol/sdk` | 1.30.0 | `LATEST_PROTOCOL_VERSION = '2025-11-25'` | ≥18 | v1 line, bug/security fixes only for ~6 months |
| `@modelcontextprotocol/server` + `/core` + `/node` | 2.0.0 | 2026-07-28 | ≥20 | **stable release line** |

The SDK repository states plainly: *"v2 is the stable release line, released alongside the
2026-07-28 spec."* Building only on v1 would ship a public server onto a maintenance branch on day
one. Building only on v2 risks excluding clients that have not yet migrated — and spec FR-003 and
SC-006 commit us to working across at least five independent clients.

The adapter cost is small because the SDK boundary is thin: the Jisr client, authorization, field
policy, envelope, cursors, and error mapping — the overwhelming majority of the code — never import
an SDK type. Only tool registration and transport wiring differ. This is tracked as a justified
complexity in `plan.md`.

**Alternatives considered**: v2 only — rejected for now on client-compatibility grounds; revisit
once the verified client set reports 2026-07-28 support, at which point the v1 adapter is deleted.
v1 only — rejected, it starts the project on a deprecating line.

---

## R4. Consequences of the 2026-07-28 stateless core

**Decision**: Design for the stateless core from the outset; never hold per-connection server state.

**Rationale**: The 2026-07-28 revision removed the `initialize`/`initialized` handshake and the
`Mcp-Session-Id` header. Protocol version, client identity, and client capabilities now travel in
`_meta` on every request; Streamable HTTP requests carry `Mcp-Method` and `Mcp-Name` headers so
gateways can route and meter without parsing bodies. HTTP+SSE is deprecated.

Consequences for this server:

- **Nothing may live in connection state.** The Jisr access-token cache keys on organization plus
  credential identity, never on a connection. This suits the deferred hosted deployment, where any
  request may land on any instance.
- **Server instructions move.** Spec FR-005 assumed instructions delivered at connection time. Under
  v2 they are obtained through capability discovery rather than an initialize response; the v1
  adapter still supplies them via `initialize`. FR-005's intent is unchanged — the delivery point
  differs per adapter.
- **Multi Round-Trip Requests replace elicitation.** Servers return `resultType: "input_required"`
  and clients retry with `inputResponses`. Release 1 is read-only and needs none of it, but this is
  the mechanism the deferred Release 2 prepare/commit confirmations will use. Recording it now
  prevents a design that assumes held-open streams.

**Alternatives considered**: Ignoring v2 semantics because Release 1 is read-only — rejected;
statefulness is far cheaper to avoid than to remove later.

---

## R5. Cacheable tool lists versus per-caller tool filtering

**Decision**: Set `cacheScope` so that a filtered tool list can never be served to a different
principal, and keep `ttlMs` short. Treat the tool list as authorization-dependent output.

**Rationale**: 2026-07-28 added `ttlMs` and `cacheScope` to `tools/list`, `prompts/list`,
`resources/list`, and `resources/read` so clients can cache catalogs. Spec FR-018 requires the tool
list to be filtered per caller so unauthorized capabilities are undiscoverable. These interact
dangerously: a tool list cached at too broad a scope would let one principal observe another's
capability set, converting a caching feature into a disclosure.

This is a **release gate**, tested explicitly: two principals with different authorization must never
observe each other's tool list under any caching behavior.

**Alternatives considered**: Declining to advertise cacheability — rejected, it degrades every
client for a problem correct scoping solves. Returning an unfiltered list and refusing on call —
rejected, it violates FR-018's undiscoverability requirement.

---

## R6. MCP annotations are hints, not controls

**Decision**: Set annotations accurately per FR-037, and never rely on them for enforcement.

**Rationale**: The SDK's own type definition states that all `ToolAnnotations` properties are hints,
"not guaranteed to provide a faithful description of tool behavior", and that clients "should never
make tool use decisions based on ToolAnnotations received from untrusted servers." The specification
repeats this under Tool Safety.

For this server that cuts both ways: our annotations must be honest because clients and users rely
on them for consent decisions, but our own safety properties must be enforced server-side —
authorization checks, field policy, absent write surface — never by annotation. Release 1's strongest
guarantee is structural: no write code path exists to annotate.

---

## R7. Jisr authentication, pagination, and filter conventions

**Decision**: Model the upstream contract exactly as specified; wrap its conventions so no model ever
constructs them.

**Verified from the specification snapshot**:

- **Auth**: `POST /openapi/v1/auth` with headers `slug`, `api-key`, `secret`, `api-version: 1`,
  `source: open_api | external_aggregator`, plus `username` when source is `external_aggregator`.
  Subsequent calls send `Slug`, `Access-Token`, `api-version`. Token lifetime is **not documented** —
  the example token's claims imply an expiry but no contract states one, so the server must treat
  lifetime as unknown and drive re-authentication from rejection, never from a timer.
- **Pagination**: offset-based `page` + `rpp`, with `rpp` **minimum 1, maximum 100, default 100** on
  the employee list. Opaque MCP cursors therefore wrap a page number, an operation, an organization,
  and a filter hash — never an upstream URL (spec FR-033).
- **Filters use bracket syntax**: `joining_date[from]`, `terminate_date[to]`, `delete_date[from]`,
  `employee_ids[]`, `transaction_type_ids[]`, and the audit-event `filter[...]` family. Tool inputs
  expose ordinary named fields; the client layer encodes brackets. No model is ever asked to build a
  bracketed query string.
- **`locale` is a documented parameter.** This is how Arabic and English representations are
  requested, which is what makes the spec's bilingual expectation implementable rather than
  aspirational.
- **Bulk limit**: the leave summary accepts at most 100 employee codes, enforced server-side.

**Not documented, and therefore not assumed** — carried into `plan.md` as open dependencies:
rate limits, access-token lifetime, the permission-to-endpoint mapping, any capability-discovery
endpoint, webhook signing/retry/ordering guarantees, and the external-aggregator onboarding process.

---

## R8. Runtime, packaging, and verification toolchain

**Decision**: TypeScript on Node.js ≥20, distributed on npm with a `bin` entry so `npx` runs it with
no build step. Validation with Zod 4 (the version both SDK lines accept). Tests with Vitest against
recorded fixtures derived from the specification's own examples. Contract validation with the
official MCP Inspector.

**Rationale**: Node ≥20 is forced by `@modelcontextprotocol/core` 2.0.0's `engines`. Zod 4 is a
direct dependency of the v2 line and within v1's accepted range (`^3.25 || ^4.0`), so one validation
library serves both adapters. `npx` distribution is what makes spec SC-001's ten-minute,
no-extra-services target reachable.

**Alternatives considered**: A container image as the primary distribution — rejected as the default
because it adds a prerequisite most MCP client users do not have; it remains a documented secondary
option. Bun or Deno as the primary runtime — rejected on client-ecosystem familiarity, though the
SDK supports both and nothing in the design precludes them.

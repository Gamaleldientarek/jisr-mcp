# Implementation Plan: Controlled Writes — Release 2

**Branch**: `002-controlled-writes` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-controlled-writes/spec.md`

## Summary

Add the first write capability to the shipped read-only server (v0.1.0): shared prepare/commit
machinery built once, then three domains on top of it — attendance punch creation and employee
creation (active, `hr_operations` only), and payroll transaction deletion (built, tested, dormant
behind its own flag). Journals and webhooks stay recorded-and-unbound.

The architecture is the delta, not a rebuild: writes are new tool definitions and services inside
the existing SDK-free core, gated by the existing dual authorization plus per-domain opt-ins, and
confirmed through a server-issued reference no model can forge. The defining constraint from Phase
0: **write contracts cannot be live-probed the way reads were** — each tool ships disabled until
verified in a controlled window (FR-012), and the documentation is already known to be wrong about
`emp_code`'s type.

## Technical Context

**Language/Version**: unchanged — TypeScript 5.x on Node ≥20

**Primary Dependencies**: unchanged. The `*_prepare`/`*_commit` tool pair is the whole
confirmation contract on both adapters; MRTR is deferred to a future feature that amends FR-002a
deliberately — a v2-only flow would break the tested parity requirement (research W2, analysis I1)

**Storage**: still none. Confirmation references live in-process — HMAC-signed like cursors,
5-minute TTL, single-use; a restart invalidates them, which is correct (research W3)

**Testing**: same six Vitest suites, extended; plus an e2e write-protocol test that drives
prepare/commit over stdio with a stubbed upstream — the live window is the only place real writes
happen

**Target Platform / Project Type**: unchanged

**Performance Goals**: unchanged; still no invented latency targets

**Constraints**: no write reaches Jisr without a server-issued confirmation; no batch writes; write
tools absent-by-default per domain; ambiguous outcomes never auto-retried

**Scale/Scope**: 3 upstream write operations bound (of the 8 recorded); 6 new tools
(3 × prepare/commit); 3 config flags; ~5 new core modules

## Constitution Check

| Principle | Pre-Phase 0 | Post-Phase 1 |
|---|---|---|
| I. Documented Surface Only | **PASS** — the 3 operations are in the manifest and snapshot | **PASS** — contracts built from the snapshot's prose tables; the two documented-vs-live doubts (`emp_code` type, punch `id` meaning) are named release-gating questions, not guesses |
| II. Least Privilege by Construction | **PASS** | **PASS** — profile gate + key gate + per-domain opt-in, independently; references bound to caller/org/operation/target; model-composed confirmations structurally rejected |
| III. Classify Before You Expose | **PASS** | **PASS** — previews and re-reads pass through the existing field policy; webhook-secret rule inherited; no new classes needed |
| IV. Tenant Isolation | **PASS** | **PASS** — references carry organizationId and refuse mismatches, same as cursors |
| V. Truthful Tool Contracts | **PASS** | **PASS** — prepare tools are read-only-annotated (they only read and reserve); commit tools annotated as writes; payroll delete as destructive. The registry's read-only-only guard is lifted by an explicit, tested allowlist tied to the manifest |
| VI. Read-First Release Order | **PASS** — Release 1 shipped as v0.1.0 | **PASS** — three writes arrive individually, each behind its own flag and live-window verification |
| VII. Verified, Not Asserted | **PASS** | **PASS** — SC-009 makes the live window a per-tool release gate; `docs/write-contract-verification.md` is the evidence artifact |

**Result: all gates pass.** One deliberate change to existing machinery: the ToolRegistry currently
refuses any non-read-only tool at registration (a Release 1 structural guarantee). It becomes a
manifest-driven allowlist — a tool may register as write/destructive only if the manifest binds it
as such — preserving the property that an unmanifested write cannot exist.

## Project Structure

### Documentation (this feature)

```text
specs/002-controlled-writes/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/write-tool-contracts.md
└── checklists/requirements.md
```

### Source Code (delta on the existing tree)

```text
src/core/
├── writes/
│   ├── confirmation.ts        # reference issue/validate: HMAC, TTL 5m, single-use, bound
│   ├── duplicate-guard.ts     # payload-hash window (research W4)
│   └── preview.ts             # preview shapes shared by prepare tools
├── services/
│   ├── attendance-write-service.ts
│   ├── employees-write-service.ts
│   └── payroll-delete-service.ts
├── tools/
│   ├── attendance/punch-create.{prepare,commit}.ts
│   ├── employees/employee-create.{prepare,commit}.ts
│   └── finance/payroll-delete.{prepare,commit}.ts
└── jisr/schemas/writes.ts     # request/response schemas from the snapshot prose

src/config/environment.ts      # + three write-domain flags
src/core/tools/registry.ts     # manifest-driven annotation allowlist
tests/                         # + write suites incl. e2e-write-protocol
docs/write-contract-verification.md   # live-window evidence, one section per tool
```

**Structure Decision**: writes live inside the same SDK-free core under the same lint boundary; the
manifest stays the single authority on what may mutate.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Registry accepts non-read-only tools | Release 2 exists | Keeping the blanket refusal and registering writes elsewhere would create a second registry and break the one-surface guarantees (catalog, capabilities, parity). The allowlist keys off the manifest, so the structural property — no unmanifested write — survives |
| Prepare/commit pairs double the tool count for writes | The server-issued reference is the security boundary; one-shot writes would need the model to be trusted | MRTR-only was rejected (v1 has no elicitation surface), and even MRTR-as-sugar was cut: any v2-only flow breaks the tested FR-002a parity requirement |

## Open Dependencies

| Unknown | Blocks | Interim treatment |
|---|---|---|
| `emp_code` type on punch creation (docs say Integer; tenant codes are alphanumeric) | Punch tool enablement | Accept both in inputs; live window decides; recorded in W1 |
| Meaning of required punch `id` | Possible upstream idempotency | Treated as client-supplied event id; probed in the window |
| Employee-create duplicate behaviour | FR-015 mechanics | Server-side warning from a pre-read of employees by code/name; upstream behaviour observed in the window |
| `punch_time` zone handling upstream | Punch correctness | Explicit zone required at input regardless; window observes storage |
| Employee `id: null` in the create response | Whether re-read is the only id source | FR-008 re-read is mandatory anyway |

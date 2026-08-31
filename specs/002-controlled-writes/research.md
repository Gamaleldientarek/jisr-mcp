# Phase 0 Research: Controlled Writes

**Feature**: `002-controlled-writes` | **Date**: 2026-08-31
**Method note**: feature 001's reads were verified against the live tenant. **Writes cannot be
probed the same way** — a probe would mutate production HR data. Everything below comes from the
committed snapshot and the installed SDKs; live verification of each write contract happens in a
controlled window at implementation, as FR-012 requires. That asymmetry is the defining constraint
of this feature.

## W1. The three write contracts, as documented

From `jisr-openapi-snapshot-2026-08-29.yaml`. The OpenAPI schemas are empty for all three; the
contracts live in the prose tables, which feature 001 established as the more reliable half.

**`POST /openapi/v1/attendance_logs`** — body is `data: []` of punches, each requiring
`terminal_sn` (string), `punch_time` (DateTime), `id` (integer), `emp_code` (integer).

Two red flags:
- **`emp_code` is documented as Integer — the live tenant uses alphanumeric codes (`AZMX117`).**
  The exact bug found in the leave summary. Inputs accept both; the live window decides what Jisr
  truly takes.
- **`id` is a required integer per punch, undocumented in meaning.** Likely a terminal event id.
  If client-supplied, it may be Jisr's own de-duplication handle — which would give us upstream
  idempotency for free. Top question for the live window.
- `punch_time` zone semantics undocumented (already an Open Question in the baseline plan). Our
  input demands an explicit zone regardless; what Jisr does with it must be observed.

**`POST /openapi/v1/employees`** — body fields: `code`, `full_name_en`/`full_name_ar` (each "at
least contain two parts"), `department_id`/`employment_type_id`/`location_id`/`nationality_id`
(from lookups), `joining_date`, `email`, `gender` (Male|Female), `marital_status`
(Single|Married|Divorced|Widowed), `document_number`, `contract_type` (Fixed term|Indefinite),
`contract_period` (1 year|2 years|Custom), `end_date`. No field is marked required in the body
table; the response example returns the full employee — **with `id: null`**, meaning the UUID may
not be assigned synchronously. The post-write re-read (FR-008) is therefore not a nicety: it may be
the only way to obtain the identifier. Duplicate-handling behaviour: undocumented, unresolvable
before the live window (the deferral from clarify).

**`DELETE /openapi/v1/payroll_transactions/{id}`** — path id only. No response schema. Behaviour on
an already-deleted id: undocumented; the prepare re-read handles it either way.

## W2. Confirmation flow: MRTR on v2, tool-pair on v1

**Decision**: expose every consequential write as an explicit `*_prepare` / `*_commit` tool pair on
both adapters. On the v2 adapter (2026-07-28), additionally return `inputRequired` from a single
combined tool where the client supports multi-round-trip requests, so conversational clients get a
native confirmation prompt.

**Rationale**: the installed `@modelcontextprotocol/server` 2.0.0 exports the full MRTR surface
(`inputRequired`, `InputRequiredResult`, `acceptedContent`) — verified. The v1 SDK's `McpServer`
exposes no elicitation surface, so the tool pair is the portable floor. Making the pair the
canonical contract keeps adapter parity (FR-002a from feature 001) intact: MRTR becomes sugar, not
a divergence. The server-issued reference is the security boundary in both shapes.

## W3. Confirmation reference storage

**Decision**: in-process store, TTL 5 minutes (per clarification), single-use, keyed by reference
and validated against organization + caller + operation + target hash.

**Rationale**: a stdio server is one long-lived process per client session, so prepare and commit
land in the same process by construction; no persistence needed, and none wanted — a reference that
survives a restart would outlive the preview's truth. HMAC-signed like cursors, using the same
per-process key: a restart invalidates outstanding references, which is the correct behaviour, and
the hosted deployment inherits a documented constraint (sticky routing or a shared store) recorded
for feature 00N.

## W4. Idempotency and duplicates

**Decision**: three layers, server-side regardless of upstream behaviour: (1) single-use references
— a replayed commit refuses; (2) a short-window payload-hash guard per organization+operation, so an
identical write re-prepared and re-committed within 10 minutes warns and requires fresh
acknowledgment; (3) whatever upstream handle exists (`id` on punches, `code` on employees) passed
deliberately. Ambiguous outcomes (timeout after submit) are never auto-retried (FR-009) — with
undocumented upstream idempotency, an automatic retry is a possible double write.

## W5. Write-domain configuration

**Decision**: `JISR_WRITE_ATTENDANCE`, `JISR_WRITE_EMPLOYEES`, `JISR_WRITE_PAYROLL_DELETE` — each
`enabled|disabled`, all defaulting disabled, mirroring `JISR_FINANCE_SURFACE`. Payroll delete
additionally requires the finance surface and profile. The four-way capability report gains nothing
new: `enabledByConfiguration` already expresses per-domain opt-ins.

## W6. The live verification window (operational, gates enablement)

Per FR-012 and SC-009, before any write tool is enabled anywhere: a Jisr admin widens a key
(attendance write; employee write) for a bounded window; punch creation is verified against a test
employee and time already in the past-month window; employee creation is verified with an
obviously-fictional person then handled per AZMX's data hygiene (Jisr has no documented employee
delete — flag to AZMX that a test record persists); results recorded in
`docs/write-contract-verification.md`; the key is narrowed back. Payroll deletion is verified only
if AZMX ever activates it, against a transaction created for the purpose.

# Data Model: Controlled Writes

**Feature**: `002-controlled-writes` | **Date**: 2026-08-31
Extends feature 001's model; nothing there changes. Still no persistence — every entity below is
in-process state or a wire shape.

## 1. Confirmation Reference

The security boundary of every write (FR-004/FR-005).

| Field | Notes |
|---|---|
| `reference` | Opaque, HMAC-signed with the per-process key (same construction as cursors) |
| `organizationId` / `principalRef` / `operationId` | Bound; any mismatch at commit refuses |
| `targetHash` | Hash of the previewed payload or target record; commit re-validates against it |
| `issuedAt` / `expiresAt` | TTL exactly 5 minutes (clarification 2026-08-31) |
| `consumed` | Single-use; a second commit under the same reference refuses |

Lifecycle: `issued → consumed | expired | invalidated(restart)`. Never persisted; never logged in
full (prefix only in audit records).

## 2. Write Preview

What prepare returns and the caller confirms. Field-policy filtered like any read result.

- **Punch preview**: employee (code + resolved name), punch time with zone, terminal, reason,
  and the backdating-window check already passed.
- **Employee preview**: the full record as it will be created, every `*_id` resolved to its lookup
  name in both languages, plus `duplicateWarning?` listing apparent matches (code or exact-name)
  that the confirmation must explicitly acknowledge (FR-015).
- **Deletion preview**: the payroll transaction exactly as Jisr holds it at prepare (re-read), plus
  the required `reason`.

## 3. Upstream write shapes (snapshot prose; schemas in `src/core/jisr/schemas/writes.ts`)

**Punch** (`POST /attendance_logs`, body `data: [...]` — we always send exactly one):
`terminal_sn: string` · `punch_time: DateTime` (zone semantics unverified) · `id: integer`
(meaning unverified — possibly upstream idempotency handle) · `emp_code: Integer per docs,
alphanumeric per tenant — accept both`.

**Employee** (`POST /employees`): `code`, `full_name_en`/`full_name_ar` (≥2 parts each),
`department_id`, `employment_type_id`, `location_id`, `nationality_id`, `joining_date`, `email`,
`gender: Male|Female`, `marital_status: Single|Married|Divorced|Widowed`, `document_number`,
`contract_type: Fixed term|Indefinite`, `contract_period: 1 year|2 years|Custom`, `end_date`.
Response returns the created employee — example shows `id: null`, so the FR-008 re-read may be the
only source of the UUID.

**Payroll delete** (`DELETE /payroll_transactions/{id}`): path id only.

## 4. Duplicate Guard

Per organization+operation: `payloadHash → firstSeenAt`, 10-minute window, in-process. A match
turns commit into a refusal carrying `DUPLICATE_WRITE_SUSPECTED` until re-acknowledged via a fresh
prepare (research W4).

## 5. Audit extensions

`WriteAuditRecord = AuditRecord + { phase: 'prepare'|'commit', referencePrefix, targetIds,
reason?, outcome: committed|refused|ambiguous }`. Ambiguous is a first-class outcome (FR-009).
Deletion records carry the strong finance marking.

## 6. New error codes

`WRITE_NOT_ENABLED` · `WRITE_CONFIRMATION_REQUIRED` · `WRITE_PREPARATION_EXPIRED` ·
`WRITE_TARGET_CHANGED` · `DUPLICATE_WRITE_SUSPECTED` · `WRITE_OUTCOME_UNKNOWN` (ambiguous; names
the read tool that resolves it) · `DESTRUCTIVE_ACTION_DISABLED` · `BACKDATING_WINDOW_EXCEEDED`.
The `WRITE_*`/`DESTRUCTIVE_*` names deliberately match the baseline plan §19, which reserved them.

## 7. Validation rules

1. Punch time: explicit zone required; date within current or previous calendar month at prepare
   (FR-013a), evaluated in the organization's time context.
2. Employee names: both languages, each with ≥2 parts (documented rule).
3. Every `*_id`: resolved against live lookups at prepare; unknown → refuse at prepare.
4. Reason: required for punches and deletions; recorded in audit, never empty.
5. One target per confirmation; arrays of punches are rejected at the tool boundary (no batch).
6. Enum fields: exact documented values only; unknowns refuse at prepare, not at Jisr.

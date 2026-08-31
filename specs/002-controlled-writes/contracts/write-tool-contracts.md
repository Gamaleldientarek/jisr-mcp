# Write Tool Contracts

**Feature**: `002-controlled-writes`. Six tools; shared envelope/error semantics from feature 001.
Prepare tools are read-only-annotated (they read and reserve; they mutate nothing). Commit tools
are write-annotated; payroll deletion commit is destructive-annotated.

## Shared shape

Every `*_prepare` returns `{ preview, confirmationReference, expiresAt }` and every `*_commit`
takes `{ confirmationReference }` (plus acknowledgments where the preview carried warnings) and
returns the post-write state re-read from Jisr, in the standard envelope, `source: live_jisr`.

## `jisr_attendance_punch_create_prepare` / `_commit`

Prepare in: `employeeCode: string|number` · `punchTime: ISO-8601 with explicit zone` ·
`terminalSerial?: string` · `reason: string (non-empty)`.
Prepare validates: zone present; date within current/previous month (`BACKDATING_WINDOW_EXCEEDED`);
employee exists and is reachable; reason recorded.
Gates: `hr_operations` + key permission + `JISR_WRITE_ATTENDANCE=enabled`.

## `jisr_employee_create_prepare` / `_commit`

Prepare in: the documented body fields, camelCased; every `*Id` from lookups; both full names.
Prepare validates: lookup resolution live; name two-part rule; enum exactness; duplicate pre-read
by code and exact name → `duplicateWarning` requiring `acknowledgeDuplicates: true` at commit.
Commit returns Jisr's created record; if the response carries `id: null`, the re-read supplies the
UUID and the result says so.
Gates: `hr_operations` + key permission + `JISR_WRITE_EMPLOYEES=enabled`.

## `jisr_payroll_transaction_delete_prepare` / `_commit` — DORMANT

Prepare in: `transactionId` · `reason: string (non-empty)`.
Prepare re-reads the transaction and previews it in full; commit re-validates the target hash and
refuses `WRITE_TARGET_CHANGED` if it moved, `RECORD_NOT_FOUND` if it vanished.
Gates: `finance` profile + finance surface + key permission + `JISR_WRITE_PAYROLL_DELETE=enabled`
(default disabled → tools undiscoverable, SC-006). Single target; no batch form exists.

## Annotations

| Tool | readOnly | destructive | idempotent |
|---|---|---|---|
| `*_prepare` (all) | true | false | true |
| punch/employee `_commit` | false | false | false |
| payroll delete `_commit` | false | **true** | false |

## Undiscoverability

A missing domain flag removes both halves of the pair from `tools/list` for every profile;
capabilities reports `enabledByConfiguration: false` with the operator named as the fixer.

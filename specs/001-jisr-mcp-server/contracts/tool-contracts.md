# Tool Contracts

**Feature**: `001-jisr-mcp-server` | 23 tools. All read-only.
Shared envelope, cursor, and error semantics: [result-envelope-and-errors.md](./result-envelope-and-errors.md).

## Conventions

- **Naming**: `jisr_<domain>_<action>`, stable once published (spec FR-009).
- **Identifiers**: `employeeId` is a UUID (`employee_id`); `employeeCode` is an integer (`code`).
  Distinct types, never interchanged. Name-based lookup is not an input on any tool — ambiguity
  returns `AMBIGUOUS_EMPLOYEE_MATCH` rather than a silent pick.
- **Pagination**: every collection tool accepts `pageSize` (1–100) and `cursor`. Callers never
  construct upstream addresses.
- **Locale**: tools accept `locale` where the upstream operation supports it. Records carrying
  `*_en` / `*_ar` pairs return **both**; Arabic is never transliterated (spec User Story 2,
  scenario 4).
- **Unknown input fields are rejected**, not ignored (data-model §7.6).
- **Durations** are returned as upstream **and** normalized to minutes where unambiguous.

## Discovery (3)

| Tool | Input | Returns |
|---|---|---|
| `jisr_connection_status_get` | none | `organizationId`, `status`, `jisrHostType`, `lastSuccessfulAuthentication`, `lastAuthenticationError`. **No slug, no key identifier, no token** (spec FR-013) |
| `jisr_capabilities_get` | none | Per domain: `supportedBySpecification`, `permittedByJisrKey`, `allowedByPrincipal`, `enabledByConfiguration`, `unavailableReason`, `suggestedAction` (spec FR-014, FR-016) |
| `jisr_data_catalog_get` | `domain?` | Domains, field names, classifications, pagination behaviour, freshness semantics. **Never record data** (spec FR-015) |

## Core HR (2 + 1 finance)

### `jisr_employees_list`
**In**: `status?` (`active`\|`inactive`), `createdFrom?`, `joiningFrom?`, `joiningTo?`,
`terminationFrom?`, `terminationTo?`, `pageSize?`, `cursor?`, `locale?`
**Out**: employee records per data-model §3.
**Field policy — load-bearing**: `basic_salary`, `first_salary_pay_date`, `last_salary_pay_date`
arrive from upstream whenever the API key holds finance permission. They are **stripped** unless the
caller holds the finance profile *and* the finance surface is enabled. `EMPLOYEE_SENSITIVE` fields
(passport, document number, date of birth, address block, gender, marital status) are withheld by
default. Redactions are reported in `warnings[]` and set `isPartial`.
Upstream filters use bracket syntax (`joining_date[from]`); encoding is the server's job.

### `jisr_employee_basic_info_get`
**In**: `employeeId` (UUID, required), `locale?` — **Out**: one record, same policy as above.

### `jisr_employee_financial_info_get`
High-sensitivity. Requires the finance profile, the explicit finance opt-in, and the key permission.
**In**: `employeeId` — **Out**: approved-schema fields only, never a passthrough.
No caching. No request-body logging. Emits a strong audit event.

## Time, attendance, leave, accruals (4)

| Tool | Input | Notes |
|---|---|---|
| `jisr_attendance_summary_get` | `employeeId?`, `status?`, `from`, `to`, `pageSize?`, `cursor?` | Returns data-model §4, including `businiess_trip_days` mapped verbatim from the upstream misspelling |
| `jisr_attendance_logs_list` | `status?`, `from`, `to`, `pageSize?`, `cursor?` | Upstream keys by employee `code`; returns both `employeeCode` and resolved `employeeId` where resolution is possible. Timestamps without an unambiguous zone are refused (`TIMEZONE_REQUIRED`) |
| `jisr_employee_leave_summary_get` | `employeeCodes[]` (≤100 upstream), `leaveType?`, `pageSize?`, `cursor?` | Above 100 the server splits within its own invocation ceiling, or refuses with `BULK_LIMIT_EXCEEDED` — never silently truncates |
| `jisr_accrual_transactions_list` | `accrualType?`, `from?`, `to?`, `pageSize?`, `cursor?` | Documented fields only; schema incomplete upstream, so anything else is drift, not output |

## Finance (5) — all require the finance profile and the explicit opt-in

`jisr_employee_monthly_payables_list` (`payPeriod?`, `paygroupId?`, page/cursor) ·
`jisr_payroll_transactions_list` (`transactionTypeIds[]?`, `from?`, `to?`, page/cursor — preserves
transaction identifiers) · `jisr_gl_transaction_types_list` · `jisr_paygroups_list` ·
`jisr_accounting_journal_get` (`journalId` required and validated).

## Lookups (6)

`jisr_departments_list`, `jisr_employment_types_list`, `jisr_business_units_list`,
`jisr_locations_list`, `jisr_nationalities_list`, `jisr_outsourcing_companies_list`.
**In**: `pageSize?`, `cursor?`, `locale?` — **Out**: `{ id, nameEn, nameAr }`. Class
`PUBLIC_REFERENCE`; available to any authorized caller.

## Integration and audit (2)

| Tool | Input | Notes |
|---|---|---|
| `jisr_webhooks_list` | `pageSize?`, `cursor?` | Subscription metadata and event names. **Stored webhook authentication secrets are stripped** (spec FR-025) |
| `jisr_audit_events_list` | `moduleName?`, `eventName?`, `eventType?`, `fromDate?`, `toDate?`, `pageSize?`, `cursor?` | Ordinary named inputs; the server encodes the upstream `filter[...]` bracket syntax. No model ever builds a bracketed query string |

## Server instructions

Delivered at capability discovery under spec 2026-07-28, and via `initialize` under the v1 adapter
(research R4). Content is identical and must let an agent work without external documentation
(spec FR-005): the domain, that `employeeId` is a UUID and `employeeCode` an integer, that pagination
is cursor-driven, that a missing tool means a gate failed rather than a missing feature, that
financial data lives behind separate tools, and that all data is live.

## Cross-cutting requirements

Every tool: explicit `organizationId` from context (never caller-supplied); dual authorization gate
before any upstream call; audit event on completion or refusal; correlation identifier throughout;
no secret in output, log, or error.

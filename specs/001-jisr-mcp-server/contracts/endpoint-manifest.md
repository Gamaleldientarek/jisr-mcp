# Endpoint Manifest

**Source of truth**: `jisr-openapi-snapshot-2026-08-29.yaml` — 29 operations, verified 2026-08-29.
This document is the human-readable form of `src/core/jisr/endpoint-manifest.ts`. The coverage gate
(`scripts/verify-endpoint-coverage.ts`) fails the build when the two diverge, or when the live
specification gains or loses an operation relative to the snapshot.

**Rule**: no code path may reach a Jisr operation absent from this table (Constitution Principle I,
spec FR-008).

## Release 1 — read tools (20)

| # | Method | Path | Tool | Sensitivity | Required profile(s) |
|---|---|---|---|---|---|
| 1 | GET | `/openapi/v1/employees` | `jisr_employees_list` | Employee personal | `hr_operations`, `manager` |
| 2 | GET | `/openapi/v1/employees/basic_info` | `jisr_employee_basic_info_get` | Employee personal | `hr_operations`, `manager`, `employee_self` |
| 3 | GET | `/openapi/v1/employees/financial_info` | `jisr_employee_financial_info_get` | Financial confidential | `finance` |
| 4 | GET | `/openapi/v1/attendance/summary` | `jisr_attendance_summary_get` | Internal operational | `hr_operations`, `manager`, `employee_self` |
| 5 | GET | `/openapi/v1/attendance_logs` | `jisr_attendance_logs_list` | Internal operational | `hr_operations`, `manager`, `employee_self` |
| 6 | GET | `/openapi/v1/employee_leaves/summary` | `jisr_employee_leave_summary_get` | Internal operational | `hr_operations`, `manager`, `employee_self` |
| 7 | GET | `/openapi/v1/accrual_transactions` | `jisr_accrual_transactions_list` | Internal operational | `hr_operations` |
| 8 | GET | `/openapi/v1/employee_monthly_payables` | `jisr_employee_monthly_payables_list` | Financial confidential | `finance` |
| 9 | GET | `/openapi/v1/payroll_transactions` | `jisr_payroll_transactions_list` | Financial confidential | `finance` |
| 10 | GET | `/openapi/v1/gl_transaction_types` | `jisr_gl_transaction_types_list` | Financial confidential | `finance` |
| 11 | GET | `/openapi/v1/paygroups` | `jisr_paygroups_list` | Financial confidential | `finance` |
| 12 | GET | `/openapi/v1/accounting/journals/{id}` | `jisr_accounting_journal_get` | Financial confidential | `finance` |
| 13 | GET | `/openapi/v1/audit_events` | `jisr_audit_events_list` | Internal operational | `auditor`, `integration_admin` |
| 14 | GET | `/openapi/v1/webhooks` | `jisr_webhooks_list` | Internal operational | `integration_admin` |
| 15 | GET | `/openapi/v1/lookups/departments` | `jisr_departments_list` | Public reference | all except `platform_operator` |
| 16 | GET | `/openapi/v1/lookups/employment_types` | `jisr_employment_types_list` | Public reference | all except `platform_operator` |
| 17 | GET | `/openapi/v1/lookups/business_units` | `jisr_business_units_list` | Public reference | all except `platform_operator` |
| 18 | GET | `/openapi/v1/lookups/locations` | `jisr_locations_list` | Public reference | all except `platform_operator` |
| 19 | GET | `/openapi/v1/lookups/nationalities` | `jisr_nationalities_list` | Public reference | all except `platform_operator` |
| 20 | GET | `/openapi/v1/lookups/outsourcing_companies` | `jisr_outsourcing_companies_list` | Public reference | all except `platform_operator` |

**Canonical role profiles** (spec FR-019). These exact identifiers are the input to the
authorization matrix; no informal synonym may appear in this table.

`employee_self` · `manager` · `hr_operations` · `finance` · `integration_admin` · `auditor` ·
`platform_operator`

`manager` reaches direct reports only — an employee whose `line_manager` resolves to the caller.
No indirect reporting tree is derived (spec FR-019a). `employee_self` reaches only its own record.
`platform_operator` holds no organization data access by construction (spec FR-021).

## Release 1 — discovery tools (3, no upstream operation)

| Tool | Purpose | Required profile(s) |
|---|---|---|
| `jisr_connection_status_get` | Connection health without secrets (spec FR-013) | all seven |
| `jisr_capabilities_get` | The four-way capability statement (spec FR-014) | all seven |
| `jisr_data_catalog_get` | Domains, fields, sensitivity, freshness, pagination — no record data (spec FR-015) | all seven |

`jisr_sync_status_get` from the baseline plan is **intentionally absent**: this release is live-only,
so there is no synchronization to report on.

## Internal — not exposed as a tool (1)

| Method | Path | Handled by |
|---|---|---|
| POST | `/openapi/v1/auth` | `src/core/jisr/authentication.ts`. Never a tool: exposing it would place credentials in a tool contract |

## Release 2 — recorded, deliberately unbound (8)

Present in the manifest so the coverage gate can assert they are *known and unimplemented* rather
than *missed*. No tool, no client method, no code path (spec FR-012).

| Method | Path | Future tool | Class |
|---|---|---|---|
| POST | `/openapi/v1/employees` | `jisr_employee_create_*` | Non-destructive write |
| POST | `/openapi/v1/attendance_logs` | `jisr_attendance_logs_create` | Non-destructive write |
| POST | `/openapi/v1/accounting/journals` | `jisr_accounting_journal_create_*` | Non-destructive write |
| POST | `/openapi/v1/webhooks` | `jisr_webhook_create` | Non-destructive write, SSRF-sensitive |
| PUT | `/openapi/v1/webhooks/{id}` | `jisr_webhook_update` | Non-destructive write, SSRF-sensitive |
| DELETE | `/openapi/v1/webhooks/{id}` | `jisr_webhook_delete` | **Destructive** |
| POST | `/openapi/v1/webhooks/{id}/test` | `jisr_webhook_test` | Write — outbound network action, not a read |
| DELETE | `/openapi/v1/payroll_transactions/{id}` | `jisr_payroll_transaction_delete_*` | **Destructive**, two-step, disabled by default |

## Manifest entry shape

```text
domain, operationId, method, path, readOrWrite, sensitivity,
requiredJisrPermission, requiredProfile, implementedTool, release
```

## Gate assertions

1. Every snapshot operation appears exactly once.
2. Every `release: 1` read operation has a bound, registered tool.
3. Every `release: 2` operation has **no** tool and no client method.
4. No registered tool lacks a manifest entry.
5. Method and path match the snapshot byte-for-byte.
6. Re-fetching the live specification produces no unreviewed divergence from the snapshot.

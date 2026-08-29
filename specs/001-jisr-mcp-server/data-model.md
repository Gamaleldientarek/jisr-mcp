# Data Model: Jisr MCP Server

**Feature**: `001-jisr-mcp-server` | **Date**: 2026-08-29
**Source**: `contracts/jisr-openapi-snapshot-2026-08-29.yaml`. Every upstream field name below was
read from that snapshot. Nothing here is inferred.

This release persists nothing (spec FR-045). "Entities" are therefore in-memory shapes: what the
server accepts, what it returns, and what it refuses to return.

---

## 1. Classification scheme

Every field carries exactly one class, assigned before it can be returned or logged
(Constitution Principle III).

| Class | May be returned to | May be logged |
|---|---|---|
| `PUBLIC_REFERENCE` | Any authorized caller | Yes |
| `INTERNAL_OPERATIONAL` | Any authorized caller | Yes |
| `EMPLOYEE_PERSONAL` | Self, manager of record, HR, auditor under investigation | Identifiers only, never values |
| `EMPLOYEE_SENSITIVE` | Requires documented purpose beyond ordinary HR access | Never |
| `FINANCIAL_CONFIDENTIAL` | Finance profile only, finance surface explicitly enabled | Never |
| `AUTHENTICATION_SECRET` | **Never, in any mode** | Never |

---

## 2. Upstream response envelope

Every Jisr response shares one shape, confirmed across all inspected operations:

```text
success      boolean
message      string | null
data         object            # domain payload
error        object | absent   # on failure
status_code  integer | absent
```

Collection payloads carry Jisr's own pagination block:

```text
pagination { current_page, next_page, previous_page, total_pages, per_page, total_entries }
```

`next_page` is a **page number**, not a URL. It is consumed internally and never surfaced; callers
receive an opaque cursor instead (spec FR-033).

---

## 3. Employee

Upstream: `GET /openapi/v1/employees` (collection) and `GET /openapi/v1/employees/basic_info`
(single). Both return the same record shape.

| Upstream field | Class | Notes |
|---|---|---|
| `employee_id` | `INTERNAL_OPERATIONAL` | UUID. The stable identifier for all follow-up calls |
| `code` | `INTERNAL_OPERATIONAL` | Employee code. The join key for attendance logs and leave summary |
| `full_name_en`, `full_name_ar` | `EMPLOYEE_PERSONAL` | **Both returned.** The Arabic form is authoritative for Arabic-language output and is never transliterated |
| `email`, `telephone` | `EMPLOYEE_PERSONAL` | |
| `avatar` | `EMPLOYEE_PERSONAL` | URL |
| `job_title`, `department`, `business_unit`, `employment_type`, `location` | `INTERNAL_OPERATIONAL` | Nested `{ name_en, name_ar }` |
| `line_manager` | `INTERNAL_OPERATIONAL` | Nested. The basis of the manager role profile's reachable set |
| `status`, `is_active`, `is_invited` | `INTERNAL_OPERATIONAL` | `status` ∈ {`active`, `inactive`} |
| `joining_date`, `created_at`, `updated_at`, `last_active_time`, `working_experience_period` | `INTERNAL_OPERATIONAL` | |
| `nationality` | `EMPLOYEE_PERSONAL` | |
| `gender`, `marital_status`, `date_of_birth` | `EMPLOYEE_SENSITIVE` | Withheld without documented purpose |
| `passport_number`, `document_number` | `EMPLOYEE_SENSITIVE` | Identity documents. Withheld by default |
| `address` block — `address_en`, `address_ar`, `building_number`, `street_name`, `district`, `home_city`, `home_postal_code`, `home_country`, `home_po_box`, `saudi_city`, `saudi_postal_code`, `saudi_country` | `EMPLOYEE_SENSITIVE` | Home address. Withheld by default |
| `basic_salary`, `first_salary_pay_date`, `last_salary_pay_date` | `FINANCIAL_CONFIDENTIAL` | **Conditional upstream field — see §3.1** |

### 3.1 The conditional salary fields (critical)

The snapshot states that these three fields appear in the **ordinary employee list** whenever the
connected API key holds "Get Employee Financial Info" permission, and are omitted otherwise.

Upstream visibility is governed by the **key**, not by the **caller**. Therefore:

- The employee mapper is an **allowlist**, never a passthrough.
- These three fields are dropped from `jisr_employees_list` and `jisr_employee_basic_info_get`
  output unless the caller holds the finance profile **and** the finance surface is explicitly
  enabled (spec FR-023a).
- Their presence upstream is not an error and is not reported as drift — it is documented behaviour.
- This is a named field-policy test case, not an incidental one.

---

## 4. Attendance summary

Upstream: `GET /openapi/v1/attendance/summary`. Class `INTERNAL_OPERATIONAL` throughout except the
employee identity fields, which follow §3.

| Upstream field | Notes |
|---|---|
| `code`, `name` | Employee identity within the summary row |
| `total_working_hours`, `total_working_hours_inside_the_shifts` | Duration. Preserved as returned **and** normalized to minutes |
| `late_arrival`, `excuse_late_arrival`, `early_departure`, `excuse_early_departure` | Duration |
| `extra_working_time`, `approved_overtime` | Duration |
| `absence`, `no_records`, `leave_days`, `off_days`, `full_day_excuses` | Counts |
| `late_arrival_days`, `early_departure_days` | Counts |
| `businiess_trip_days` | **Spelled exactly this way upstream.** Consumed verbatim; exposed as `businessTripDays`. The upstream spelling is never "corrected" in a request |

The upstream misspelling is mapped explicitly and covered by a test, so that a future Jisr fix
surfaces as a mapping failure rather than a silently missing value.

---

## 5. Remaining read domains

Shapes are taken from the snapshot at implementation time. Classification is fixed now.

| Domain | Upstream operation | Class of payload |
|---|---|---|
| Attendance logs | `GET /attendance_logs` | `INTERNAL_OPERATIONAL`; keyed by employee `code`, resolved to `employee_id` where possible |
| Leave summary | `GET /employee_leaves/summary` | `INTERNAL_OPERATIONAL`; accepts at most **100** employee codes per upstream call |
| Accruals | `GET /accrual_transactions` | `INTERNAL_OPERATIONAL`; schema incomplete in documentation — see plan Open Dependencies |
| Monthly payables | `GET /employee_monthly_payables` | `FINANCIAL_CONFIDENTIAL` |
| Payroll transactions | `GET /payroll_transactions` | `FINANCIAL_CONFIDENTIAL`; transaction identifiers preserved for authorized follow-up |
| GL transaction types | `GET /gl_transaction_types` | `FINANCIAL_CONFIDENTIAL` |
| Paygroups | `GET /paygroups` | `FINANCIAL_CONFIDENTIAL` |
| Accounting journal | `GET /accounting/journals/{id}` | `FINANCIAL_CONFIDENTIAL` |
| Lookups (6) | `GET /lookups/*` | `PUBLIC_REFERENCE`; each returns `{ id, name_en, name_ar }` |
| Webhooks | `GET /webhooks` | `INTERNAL_OPERATIONAL`; **stored webhook authentication secrets are stripped** |
| Audit events | `GET /audit_events` | `INTERNAL_OPERATIONAL`; bracketed `filter[...]` parameters encoded by the server |

---

## 6. Server-side entities

### Organization Connection
`organizationId`, `baseUrl` (validated against the two documented hosts), `slug`,
`credentialRef`, `authSource` (`open_api` | `external_aggregator`), `aggregatorUsername?`,
`observedPermissions[]`, `financeSurfaceEnabled`.
`apiKey` and `apiSecret` are `AUTHENTICATION_SECRET` — held only as references resolved at call
time, never returned, never logged, never placed in an error.

### Principal
`organizationId`, `roleProfile` (one of the seven), `scopes[]`, `subjectEmployeeId?`.
In this release the profile comes from configuration; the shape is what an identity provider would
later populate unchanged (spec FR-019).

### Capability Record
Four independent booleans per domain — `supportedBySpecification`, `permittedByJisrKey`,
`allowedByPrincipal`, `enabledByConfiguration` — plus `unavailableReason` and `suggestedAction`.
Drives both dynamic tool exposure and the unavailability explanations of FR-016.

### Result Envelope
`operation`, `source` (`live_jisr`), `organizationId`, `dataAsOf`, `isStale`, `isPartial`,
`records[]`, `pagination { nextCursor, pageSize }`, `warnings[]`.
`source` is present from day one even though only one value is possible, so a later synchronized
store is additive (spec FR-045).

### Cursor
Opaque, integrity-protected, expiring. Binds `organizationId`, `operationId`, upstream `page`, and a
hash of the approved filter set. Any mismatch on any bound element is refused. Never contains a
credential; never accepts an upstream URL.

### Audit Event
`correlationId`, `timestamp`, `organizationId`, `principalRef`, `tool`, `authorizationDecision`,
`outcome`, `recordCount`. Carries **no** record contents.

### Drift Record
`operationId`, `unknownFieldPath`, `detectedAt`, `snapshotVersion`. Records that an unknown field
appeared; does not capture its value where the field may be sensitive.

---

## 7. Validation rules

1. `pageSize` ∈ [1, 100] — Jisr's documented maximum. Above it: `PAGE_SIZE_EXCEEDED`.
2. Leave summary employee codes ≤ 100 per upstream call. Above the server's own invocation total:
   `BULK_LIMIT_EXCEEDED`.
3. Date ranges must be well-formed and `from` ≤ `to`; otherwise `INVALID_DATE_RANGE`.
4. Attendance timestamps without an unambiguous zone are refused, never assumed.
5. `employee_id` must be a UUID; employee `code` is an integer. They are distinct types and are never
   interchanged.
6. Unknown input fields are rejected rather than ignored.
7. Unknown **upstream** fields are recorded as drift and withheld — never passed through.
8. Every service call requires explicit `organizationId`. There is no default and no ambient value.

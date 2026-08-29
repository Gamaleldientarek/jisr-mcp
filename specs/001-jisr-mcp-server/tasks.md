---
description: "Task list for Jisr MCP Server — complete authorized read surface"
---

# Tasks: Jisr MCP Server — Complete Authorized Read Surface

**Input**: Design documents from `/specs/001-jisr-mcp-server/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. Tests are explicitly required by spec FR-043, the twelve validation scenarios
in `quickstart.md`, and Constitution Principle VII (Verified, Not Asserted).

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1–US4, mapping to spec.md user stories
- Paths follow the structure in `plan.md` → Project Structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository scaffold, toolchain, and the guardrails that make later phases enforceable

- [ ] T001 Resolve and record the published package name and registry scope, replacing the `@<scope>/jisr-mcp` placeholder in `specs/001-jisr-mcp-server/quickstart.md` (checklist adoption CHK010)
- [ ] T002 Initialize the TypeScript project with a `bin` entry for `npx` execution in `package.json`, targeting Node ≥20
- [ ] T003 [P] Configure TypeScript in `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`
- [ ] T004 [P] Configure lint and format in `eslint.config.js`, including the `no-restricted-imports` rule forbidding any `@modelcontextprotocol/*` import under `src/core/`
- [ ] T005 [P] Configure Vitest in `vitest.config.ts` with separate projects for unit, contract, integration, authorization, field-policy, and security suites
- [ ] T006 [P] Add `.env.example` in the repository root containing placeholder values only, never a real credential (spec FR-042)
- [ ] T007 [P] Add `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` skeletons in the repository root (spec FR-041)
- [ ] T008 [P] Add the CI workflow in `.github/workflows/ci.yml` running build, lint, all test projects, the coverage gate, and a secret scan on every pull request (spec FR-043)
- [ ] T009 Implement the specification snapshot refresher in `scripts/snapshot-jisr-spec.ts`, writing to `specs/001-jisr-mcp-server/contracts/`
- [ ] T010 Install and pin dependencies in `package.json`: `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/sdk`, and `zod`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The core every user story depends on — Jisr access, authorization, field policy, result
contract, and both adapters

**⚠️ CRITICAL**: No user story work begins until this phase completes

### Decisions that must precede code

- [ ] T011 Decide and record where audit events are written and how long they are retained, given this release has no database; update `spec.md` FR-038 and the Decision Log in `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` (checklist security CHK001, CHK002)
- [ ] T012 Decide and record whether the manager profile reaches direct reports only or the full reporting tree; update `spec.md` FR-019 (checklist security CHK014)
- [ ] T013 Add an adapter-parity requirement and its success criterion to `spec.md`, which currently exist only as a plan decision (checklist protocol CHK001)

### Configuration

- [ ] T014 Implement validated configuration loading in `src/config/environment.ts`, failing with a message naming the specific invalid setting and never echoing a credential (spec FR-006)
- [ ] T015 [P] Implement feature flags in `src/config/feature-flags.ts`, including the explicit finance-surface opt-in (spec FR-023a)

### Jisr integration core

- [ ] T016 Generate the endpoint manifest in `src/core/jisr/endpoint-manifest.ts` from the committed snapshot, covering all 29 operations with release bindings per `contracts/endpoint-manifest.md`
- [ ] T017 Implement the coverage gate in `scripts/verify-endpoint-coverage.ts`, asserting all six gate conditions and failing the build on divergence (spec FR-010)
- [ ] T018 [P] Define Zod schemas for employees and attendance in `src/core/jisr/schemas/employees.ts` and `src/core/jisr/schemas/attendance.ts`, from the snapshot
- [ ] T019 [P] Define Zod schemas for leave, accruals, finance, lookups, webhooks, and audit in `src/core/jisr/schemas/`, from the snapshot
- [ ] T020 Implement approved-host validation in `src/core/jisr/client.ts` accepting only the two documented base URLs (spec FR-006)
- [ ] T021 Implement the typed request helper in `src/core/jisr/client.ts` with timeouts, bounded retries, and required headers
- [ ] T022 Implement authentication in `src/core/jisr/authentication.ts` with a token cache keyed by organization and credential identity, never by connection, and at most one re-authentication per rejection with no refresh loop (research R4, R7)
- [ ] T023 [P] Implement bracket-syntax filter encoding in `src/core/jisr/query-encoding.ts` so no caller ever constructs `filter[...]` or `date[from]` strings (research R7)
- [ ] T024 [P] Implement page/rpp translation in `src/core/jisr/pagination.ts`, enforcing the documented maximum of 100
- [ ] T025 Implement upstream failure mapping to stable codes in `src/core/jisr/errors.ts` per `contracts/result-envelope-and-errors.md`

### Result contract

- [ ] T026 [P] Implement the result envelope in `src/core/envelope.ts` with source, freshness, partial, and pagination fields (spec FR-030, FR-031)
- [ ] T027 [P] Implement opaque cursors in `src/core/cursor.ts`, binding organization, operation, page, and filter hash with an expiry, refusing any mismatch (spec FR-033)
- [ ] T028 [P] Implement the stable error model in `src/core/errors.ts` with retryability and suggested action, exposing no upstream body (spec FR-035)

### Authorization and data protection

- [ ] T029 Implement the data-classification registry in `src/core/authorization/field-policy.ts`, covering every field in `data-model.md` §3–§5 and rejecting any unclassified field (spec FR-024)
- [ ] T030 Implement allowlist-based mappers in `src/core/jisr/mappers/`, stripping `basic_salary`, `first_salary_pay_date`, and `last_salary_pay_date` from employee results for non-finance callers (research R2, spec FR-026)
- [ ] T031 [P] Implement the principal and the seven role profiles in `src/core/authorization/principal.ts` and `src/core/authorization/role-profiles.ts` (spec FR-019)
- [ ] T032 Implement four-way capability resolution in `src/core/authorization/capabilities.ts` producing supported, permitted, allowed, enabled, plus reason and suggested action (spec FR-014, FR-016)
- [ ] T033 Implement per-tool authorization in `src/core/authorization/policies.ts` enforcing both gates independently (spec FR-017)
- [ ] T034 Enforce required organization context on every service constructor in `src/core/services/`, with no ambient or default value (spec FR-022)

### Observability

- [ ] T035 [P] Implement redacting logger in `src/observability/logger.ts` and `src/observability/redaction.ts`, failing closed on redaction error (spec FR-029)
- [ ] T036 [P] Implement audit event emission in `src/observability/audit.ts` per the sink decided in T011 (spec FR-038)
- [ ] T037 [P] Implement correlation identifiers in `src/observability/correlation.ts` spanning request, authorization, upstream call, and audit (spec FR-039)
- [ ] T038 [P] Implement operational metrics in `src/observability/metrics.ts` (spec FR-040)

### MCP adapters

- [ ] T039 Define the SDK-free tool definition shape and registry in `src/core/tools/registry.ts`, carrying schema, handler, annotations, and required authorization
- [ ] T040 Implement dynamic tool filtering in `src/core/tools/registry.ts` so unauthorized tools are absent from the list, not merely refused (spec FR-018)
- [ ] T041 Author the server instructions content in `src/core/server-instructions.ts` covering domain, identifier types, pagination, unavailability, and liveness (spec FR-005)
- [ ] T042 Implement the v2 adapter in `src/adapters/mcp-v2/`, including `ttlMs` and `cacheScope` set so a filtered tool list can never be served to another principal (research R5)
- [ ] T043 Implement the v1 adapter in `src/adapters/mcp-v1/`, delivering server instructions via `initialize` (research R3, R4)
- [ ] T044 Implement the executable entry point in `src/bin/jisr-mcp.ts` with stdio transport and adapter selection

### Foundational tests

- [ ] T045 [P] Create fixtures in `tests/fixtures/jisr/` derived from the snapshot's own examples, containing no real employee or payroll data (spec FR-042)
- [ ] T046 [P] Test the coverage gate in `tests/contract/endpoint-coverage.test.ts`, asserting it fails on an injected divergence
- [ ] T047 [P] Test that no `@modelcontextprotocol/*` import exists under `src/core/` in `tests/unit/core-boundary.test.ts`
- [ ] T048 [P] Test authentication behaviour in `tests/integration/authentication.test.ts`: invalid slug, key, and secret; expired token; exactly one retry; no refresh loop
- [ ] T049 [P] Test cursor binding and expiry in `tests/security/cursor.test.ts` covering tampering, expiry, and operation mismatch
- [ ] T050 Implement the repository-wide secret-absence assertion in `tests/security/no-secrets.test.ts`, scanning all test output, logs, and artifacts (spec SC-003)

**Checkpoint**: Core, adapters, and guardrails ready — user story work can begin

---

## Phase 3: User Story 1 — Connect my own Jisr in minutes (Priority: P1) 🎯 MVP

**Goal**: An adopter goes from the README to an authorized answer about their own Jisr data in under
ten minutes, from any of the named MCP clients.

**Independent Test**: On a clean machine, following only the README, connect to a Jisr organization
and retrieve employee and attendance data through an MCP client — under ten minutes, no source
reading, no additional service installed.

### Tests for User Story 1

- [ ] T051 [P] [US1] Contract test for the three discovery tools in `tests/contract/discovery-tools.test.ts`
- [ ] T052 [P] [US1] Test startup failure messages in `tests/integration/startup-failures.test.ts` for missing slug, wrong secret, and unapproved base URL, asserting no stack trace and no credential echo (quickstart V2)
- [ ] T053 [P] [US1] Test that connection status returns no slug, key identifier, or token in `tests/field-policy/connection-status.test.ts` (spec FR-013)
- [ ] T054 [P] [US1] Test unavailability explanations in `tests/integration/unavailability.test.ts`, asserting each of the four causes is distinguishable with a suggested action (spec FR-016)

### Implementation for User Story 1

- [ ] T055 [P] [US1] Implement `jisr_connection_status_get` in `src/core/tools/discovery/connection-status.ts`
- [ ] T056 [P] [US1] Implement `jisr_capabilities_get` in `src/core/tools/discovery/capabilities.ts`
- [ ] T057 [P] [US1] Implement `jisr_data_catalog_get` in `src/core/tools/discovery/data-catalog.ts`
- [ ] T058 [US1] Implement the employees service in `src/core/services/employees-service.ts`
- [ ] T059 [US1] Implement `jisr_employees_list` in `src/core/tools/employees/employees-list.ts` with the allowlist mapper applied
- [ ] T060 [US1] Implement `jisr_employee_basic_info_get` in `src/core/tools/employees/basic-info-get.ts`
- [ ] T061 [US1] Implement the attendance service in `src/core/services/attendance-service.ts`
- [ ] T062 [US1] Implement `jisr_attendance_summary_get` in `src/core/tools/attendance/summary-get.ts`, mapping `businiess_trip_days` verbatim from the upstream spelling (data-model §4)
- [ ] T063 [US1] Write the README quick start in `README.md`: prerequisites, the two-credential posture, configuration, and first query (spec SC-001)
- [ ] T064 [P] [US1] Document the **Claude Code** installation block in `README.md`, naming its configuration mechanism and both installation scopes (checklist adoption CHK001)
- [ ] T065 [P] [US1] Document the **Cursor** installation block in `README.md`, covering project-scoped and user-scoped installation (checklist adoption CHK003)
- [ ] T066 [P] [US1] Document the **Codex** installation block in `README.md`, using its own configuration format rather than the JSON used by other clients (checklist adoption CHK002)
- [ ] T067 [US1] Document Claude Desktop and MCP Inspector connection in `README.md`, completing the five verified clients (spec SC-006)

**Checkpoint**: A working, installable, single-organization read server — the MVP

---

## Phase 4: User Story 2 — Ask anything the organization's permissions allow (Priority: P2)

**Goal**: Complete non-financial read coverage, so questions spanning several Jisr domains are
answerable in one session.

**Independent Test**: Exercise every non-financial documented read operation through its tool and
confirm via the coverage gate that none is unreachable and no undocumented operation is reachable.

### Tests for User Story 2

- [ ] T068 [P] [US2] Test pagination to exhaustion in `tests/integration/pagination.test.ts`, asserting no unbounded response and no caller-constructed upstream address (quickstart V7)
- [ ] T069 [P] [US2] Test page-size and bulk limits in `tests/integration/limits.test.ts` for `PAGE_SIZE_EXCEEDED` and `BULK_LIMIT_EXCEEDED`
- [ ] T070 [P] [US2] Test Arabic name integrity in `tests/integration/bilingual.test.ts`, asserting `full_name_ar` survives intact and is usable in a follow-up lookup (quickstart V10)
- [ ] T071 [P] [US2] Test the four non-success states are distinguishable in `tests/contract/result-states.test.ts` (spec FR-036)
- [ ] T072 [P] [US2] Test ambiguous employee matching returns `AMBIGUOUS_EMPLOYEE_MATCH` in `tests/integration/employee-resolution.test.ts`

### Implementation for User Story 2

- [ ] T073 [US2] Implement `jisr_attendance_logs_list` in `src/core/tools/attendance/logs-list.ts`, returning employee code and resolved identifier, refusing ambiguous time zones
- [ ] T074 [US2] Implement the leave service and `jisr_employee_leave_summary_get` in `src/core/services/leave-service.ts` and `src/core/tools/leave/summary-get.ts`, enforcing the 100-code upstream limit
- [ ] T075 [US2] Implement the accruals service and `jisr_accrual_transactions_list` in `src/core/services/accruals-service.ts` and `src/core/tools/accruals/transactions-list.ts`, documented fields only
- [ ] T076 [P] [US2] Implement the lookups service in `src/core/services/lookups-service.ts`
- [ ] T077 [P] [US2] Implement all six lookup tools in `src/core/tools/lookups/`, each returning `{ id, nameEn, nameAr }`
- [ ] T078 [P] [US2] Implement `jisr_webhooks_list` in `src/core/tools/webhooks/webhooks-list.ts`, stripping stored authentication secrets (spec FR-025)
- [ ] T079 [P] [US2] Implement `jisr_audit_events_list` in `src/core/tools/audit/audit-events-list.ts`, encoding the upstream `filter[...]` syntax internally
- [ ] T080 [US2] Extend `jisr_data_catalog_get` to describe every domain now implemented

**Checkpoint**: All 14 non-financial read tools plus 3 discovery tools operational

---

## Phase 5: User Story 3 — Financial and sensitive data stays behind its own door (Priority: P3)

**Goal**: The finance surface exists, is reachable only by finance-authorized callers with the
surface explicitly enabled, and is undiscoverable to everyone else.

**Independent Test**: Run the full role-profile-by-tool matrix and confirm every cell resolves as
expected, with denied capabilities absent from the tool list rather than refused on call.

### Tests for User Story 3

- [ ] T081 [US3] Implement the salary-leak test in `tests/field-policy/employee-list-financial-leak.test.ts`: finance-permissioned key, non-finance caller, finance surface disabled — assert zero salary fields reach the caller (quickstart V4, research R2)
- [ ] T082 [P] [US3] Implement the role-profile-by-tool authorization matrix in `tests/authorization/role-matrix.test.ts` covering all seven profiles against all 23 tools (spec SC-004)
- [ ] T083 [P] [US3] Test that denied capabilities are absent from the tool list in `tests/authorization/tool-list-filtering.test.ts` (spec FR-018)
- [ ] T084 [P] [US3] Test enumeration resistance in `tests/security/enumeration.test.ts`, asserting refusals do not reveal whether a record exists
- [ ] T085 [P] [US3] Test the financial-info field allowlist in `tests/field-policy/financial-info.test.ts`, asserting only approved schema fields are returned

### Implementation for User Story 3

- [ ] T086 [US3] Implement the finance surface opt-in and optional separate finance credential in `src/config/environment.ts` and `src/config/feature-flags.ts` (spec FR-023a, FR-023b)
- [ ] T087 [US3] Implement the finance service in `src/core/services/finance-service.ts` with stricter interfaces than the HR services
- [ ] T088 [US3] Implement `jisr_employee_financial_info_get` in `src/core/tools/finance/financial-info-get.ts` with no caching, no body logging, and a strong audit event
- [ ] T089 [P] [US3] Implement `jisr_employee_monthly_payables_list` in `src/core/tools/finance/monthly-payables-list.ts`
- [ ] T090 [P] [US3] Implement `jisr_payroll_transactions_list` in `src/core/tools/finance/payroll-transactions-list.ts`, preserving transaction identifiers
- [ ] T091 [P] [US3] Implement `jisr_gl_transaction_types_list` and `jisr_paygroups_list` in `src/core/tools/finance/`
- [ ] T092 [P] [US3] Implement `jisr_accounting_journal_get` in `src/core/tools/accounting/journal-get.ts` with a validated journal identifier
- [ ] T093 [US3] Document the finance opt-in and separate-credential posture in `README.md`

**Checkpoint**: All 23 tools implemented; finance provably separated

---

## Phase 6: User Story 4 — Prove what happened and notice when Jisr changes (Priority: P4)

**Goal**: Every call is auditable, and upstream schema change surfaces as drift rather than reaching
a caller.

**Independent Test**: Replay a session and confirm a complete audit trail with no sensitive payloads;
separately, inject an unknown upstream field and confirm it is withheld and recorded.

### Tests for User Story 4

- [ ] T094 [P] [US4] Test audit completeness in `tests/integration/audit-trail.test.ts`, asserting one record per call including refusals, and no sensitive payload (spec SC-011)
- [ ] T095 [P] [US4] Test drift handling in `tests/integration/schema-drift.test.ts` with an injected unknown field, asserting it is withheld, recorded, and marks the result partial (quickstart V8)
- [ ] T096 [P] [US4] Test that the four capability facts are independently observable in `tests/contract/capabilities.test.ts`

### Implementation for User Story 4

- [ ] T097 [US4] Implement drift detection in `src/core/jisr/schemas/drift.ts`, recording the field path without capturing potentially sensitive values (spec FR-027)
- [ ] T098 [US4] Wire drift into every mapper so unknown fields set `isPartial` and add a warning
- [ ] T099 [US4] Complete audit coverage across all 23 tool handlers in `src/core/tools/`, including authorization refusals

**Checkpoint**: Feature complete against the specification

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The release gates that span stories

- [ ] T100 [P] Test tool-list caching cannot cross principals in `tests/security/tool-list-cache.test.ts` with two differently-authorized principals (quickstart V9, research R5)
- [ ] T101 [P] Test adapter parity in `tests/contract/adapter-parity.test.ts`, asserting identical inputs, outputs, envelopes, error codes, and annotations across v1 and v2 (T013)
- [ ] T102 [P] Test degradation honesty in `tests/integration/degradation.test.ts` for upstream unreachable, 429, and mid-pagination token expiry (quickstart V12)
- [ ] T103 [P] Test prompt-injection content in employee fields cannot alter behaviour in `tests/security/prompt-injection.test.ts`
- [ ] T104 [P] Test annotation accuracy across all 23 tools in `tests/contract/annotations.test.ts` (spec FR-037)
- [ ] T105 Implement Inspector-driven validation in `scripts/verify-mcp.ts` and run it against both adapters (spec Definition of Done)
- [ ] T106 Verify against all five named MCP clients and record results in `docs/client-compatibility.md` (spec SC-006)
- [ ] T107 [P] Write `docs/authorization-matrix.md` from the role-profile matrix
- [ ] T108 [P] Write `docs/endpoint-coverage.md` from the manifest
- [ ] T109 [P] Complete `SECURITY.md` with a disclosure contact and response expectation (checklist compliance CHK012)
- [ ] T110 Resolve the license decision and add `LICENSE` in the repository root (spec Dependencies)
- [ ] T111 Record the publisher of record and add an unofficial-project statement to `README.md` (checklist compliance CHK009, CHK010)
- [ ] T112 Commission the PDPL legal review and record its outcome in `docs/privacy.md` (spec Dependencies)
- [ ] T113 Confirm all 20 items of the Definition of Done in `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` §27 (spec SC-012)

---

## Dependencies

### Phase order

```text
Phase 1 Setup → Phase 2 Foundational → Phase 3 US1 → Phase 4 US2 → Phase 5 US3 → Phase 6 US4 → Phase 7 Polish
```

Phase 2 blocks everything. Within Phase 2, T011–T013 are decisions that block the code depending on
them: T011 blocks T036, T012 blocks T031 and T033, T013 blocks T101.

### Story dependencies

| Story | Depends on | Why |
|---|---|---|
| US1 (P1) | Phase 2 | MVP; independently shippable |
| US2 (P2) | Phase 2 | Independent of US1, but US1 first delivers the adoption path |
| US3 (P3) | Phase 2, and T029–T030 in particular | Field policy must exist before the finance surface does |
| US4 (P4) | Phase 2; full value after US2 and US3 | Auditing an incomplete surface proves little |

**Note on ordering**: the field-policy engine (T029, T030) sits in Phase 2 rather than US3 even
though it protects financial data. The employee list leaks salary fields the moment it exists
(research R2), so the protection cannot wait for the finance story.

### Key task dependencies

- T016 blocks T017 and every tool task
- T022 blocks all upstream calls
- T029 blocks T030; T030 blocks T059 and T060
- T039 blocks T040, T042, T043
- T042 and T043 block T044, T101, T105

---

## Parallel Execution Examples

**Phase 1**: T003–T008 run together after T002.

**Phase 2 schemas and contract**: T018, T019, T023, T024, T026, T027, T028 run together once T016
lands. Observability T035–T038 runs alongside them.

**Phase 3 discovery tools**: T055, T056, T057 run together. Client documentation T064, T065, T066
runs in parallel with each other and with tool work.

**Phase 4 lookups and independents**: T076–T079 run together once T073 patterns are established;
tests T068–T072 run together.

**Phase 5 finance tools**: T089, T090, T091, T092 run together after T087. Tests T082–T085 run
together, but T081 is written first and must fail before T086.

**Phase 7**: T100–T104 and T107–T109 all run in parallel.

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (T001–T067)**. That is an installable, single-organization server with
three discovery tools and three core read tools, working from any of the five named clients, with
field policy, authorization, cursors, audit, and both adapters already in place. It is publishable
and useful on its own.

### Incremental delivery

1. **MVP** — US1. Adopters can connect and ask about people and attendance.
2. **+ US2** — complete non-financial coverage. The product replaces manual Jisr lookups.
3. **+ US3** — the finance surface, provably separated. Payroll conversations become possible.
4. **+ US4** — audit and drift. The system stays trustworthy over time.
5. **+ Polish** — the release gates, including the two that are not code: license and legal review.

### Sequencing note

T081 (the salary-leak test) is written before T086 and must fail first. It is the single test that
justifies the field-policy design, and writing it after the implementation would prove nothing.

---
description: "Task list for Jisr MCP Server — complete authorized read surface"
---

# Tasks: Jisr MCP Server — Complete Authorized Read Surface

**Input**: Design documents from `/specs/001-jisr-mcp-server/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. Required by spec FR-043, the validation scenarios in `quickstart.md`, and
Constitution Principle VII (Verified, Not Asserted).

**Organization**: Grouped by user story so each is independently implementable and testable.

**Revision**: Regenerated after `/speckit-analyze`. Four decisions are now settled and folded in —
audit records go to stderr (FR-038a), the manager profile reaches direct reports only (FR-019a),
adapter parity is a requirement (FR-002a/SC-014), and Principle IV's storage clauses are recorded as
dormant. The tool-list cache test and the adapter parity test moved from Phase 7 into Phase 2,
beside the controls they exercise.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1–US4, mapping to spec.md user stories
- Paths follow the structure in `plan.md` → Project Structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository scaffold, toolchain, and the guardrails that make later phases enforceable

- [X] T001 Resolve and record the published package name and registry scope, replacing the `@<scope>/jisr-mcp` placeholder in `specs/001-jisr-mcp-server/quickstart.md` (checklist adoption CHK010)
- [X] T002 Initialize the TypeScript project with a `bin` entry and a prepublish build so `npx` runs a prebuilt artifact, in `package.json`, targeting Node ≥20 (spec FR-001)
- [X] T003 [P] Configure TypeScript in `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`
- [X] T004 [P] Configure lint and format in `eslint.config.js`, including the `no-restricted-imports` rule forbidding any `@modelcontextprotocol/*` import under `src/core/`
- [X] T005 [P] Configure Vitest in `vitest.config.ts` with separate projects for unit, contract, integration, authorization, field-policy, and security suites
- [X] T006 [P] Add `.env.example` in the repository root containing placeholder values only, never a real credential (spec FR-042)
- [X] T007 [P] Add `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` skeletons in the repository root (spec FR-041)
- [X] T008 [P] Add the CI workflow in `.github/workflows/ci.yml` running build, lint, all test projects, the coverage gate, and a secret scan on every pull request (spec FR-043)
- [X] T009 Implement the specification snapshot refresher in `scripts/snapshot-jisr-spec.ts`, writing to `specs/001-jisr-mcp-server/contracts/`
- [X] T010 Install and pin dependencies in `package.json`: `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/sdk`, and `zod`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The core every user story depends on — Jisr access, authorization, field policy, result
contract, both adapters, and the tests for the controls built here

**⚠️ CRITICAL**: No user story work begins until this phase completes

### Configuration

- [X] T011 Implement validated configuration loading in `src/config/environment.ts`, failing with a message naming the specific invalid setting and never echoing a credential (spec FR-006)
- [X] T012 [P] Implement feature flags in `src/config/feature-flags.ts`, including the explicit finance-surface opt-in (spec FR-023a)

### Jisr integration core

- [X] T013 Generate the endpoint manifest in `src/core/jisr/endpoint-manifest.ts` from the committed snapshot, covering all 29 operations with release bindings and canonical role profiles per `contracts/endpoint-manifest.md`
- [X] T014 Implement the coverage gate in `scripts/verify-endpoint-coverage.ts`, asserting all six gate conditions and failing the build on divergence (spec FR-010)
- [X] T015 [P] Define Zod schemas for employees and attendance in `src/core/jisr/schemas/employees.ts` and `src/core/jisr/schemas/attendance.ts`, from the snapshot
- [X] T016 [P] Define Zod schemas for leave, accruals, finance, lookups, webhooks, and audit in `src/core/jisr/schemas/`, from the snapshot
- [X] T017 Implement approved-host validation in `src/core/jisr/client.ts` accepting only the two documented base URLs (spec FR-006)
- [X] T018 Implement the typed request helper in `src/core/jisr/client.ts` with timeouts, bounded retries, and required headers
- [X] T019 Implement authentication in `src/core/jisr/authentication.ts` with a token cache keyed by organization and credential identity, never by connection, and at most one re-authentication per rejection with no refresh loop (research R4, R7)
- [X] T020 [P] Implement bracket-syntax filter encoding in `src/core/jisr/query-encoding.ts` so no caller ever constructs `filter[...]` or `date[from]` strings (research R7)
- [X] T021 [P] Implement page/rpp translation in `src/core/jisr/pagination.ts`, enforcing the documented maximum of 100
- [X] T022 Implement upstream failure mapping to stable codes in `src/core/jisr/errors.ts` per `contracts/result-envelope-and-errors.md`

### Result contract

- [X] T023 [P] Implement the result envelope in `src/core/envelope.ts` with source, freshness, partial, and pagination fields (spec FR-030, FR-031)
- [X] T024 [P] Implement opaque cursors in `src/core/cursor.ts`, binding organization, operation, page, and filter hash with an expiry, refusing any mismatch (spec FR-033)
- [X] T025 [P] Implement the stable error model in `src/core/errors.ts` with retryability and suggested action, exposing no upstream body (spec FR-035)
- [X] T026 [P] Implement the human-readable result summary generator in `src/core/summary.ts`, producing the short prose that accompanies every structured result (spec FR-032)

### Authorization and data protection

- [X] T027 Implement the data-classification registry in `src/core/authorization/field-policy.ts`, covering every field in `data-model.md` §3–§5 and rejecting any unclassified field (spec FR-024)
- [X] T028 Implement allowlist-based mappers in `src/core/jisr/mappers/`, stripping `basic_salary`, `first_salary_pay_date`, and `last_salary_pay_date` from employee results for non-finance callers (research R2, spec FR-026)
- [X] T029 [P] Implement the principal and the seven canonical role profiles in `src/core/authorization/principal.ts` and `src/core/authorization/role-profiles.ts`, with the manager profile resolving direct reports only and never deriving an indirect tree (spec FR-019, FR-019a)
- [X] T030 Implement four-way capability resolution in `src/core/authorization/capabilities.ts` producing supported, permitted, allowed, enabled, plus reason and suggested action (spec FR-014, FR-016)
- [X] T031 Implement per-tool authorization in `src/core/authorization/policies.ts` enforcing both gates independently (spec FR-017)
- [X] T032 Enforce required organization context on every service constructor in `src/core/services/`, with no ambient or default value (spec FR-022)
- [X] T033 Implement reachable-set scoping in `src/core/services/`, so every collection is filtered to the caller's reachable records before pagination and no count or pagination field reveals a record outside it (spec FR-018a)
- [X] T034 Implement per-tool declared field groups in `src/core/tools/registry.ts`, so every tool declares which classified groups it returns and why, and responses cannot exceed the declaration (spec FR-028)

### Observability

- [X] T035 [P] Implement redacting logger in `src/observability/logger.ts` and `src/observability/redaction.ts`, suppressing any entry whose values cannot be classified with certainty (spec FR-029)
- [X] T036 [P] Implement audit emission in `src/observability/audit.ts` as structured JSON on the standard error stream, writing nothing to disk (spec FR-038, FR-038a)
- [X] T037 [P] Implement correlation identifiers in `src/observability/correlation.ts` spanning request, authorization, upstream call, and audit (spec FR-039)
- [X] T038 [P] Implement operational metrics in `src/observability/metrics.ts` (spec FR-040)

### MCP adapters

- [X] T039 Define the SDK-free tool definition shape and registry in `src/core/tools/registry.ts`, carrying schema, handler, annotations, declared field groups, and required authorization
- [X] T040 Implement dynamic tool filtering in `src/core/tools/registry.ts` so unauthorized tools are absent from the list, not merely refused (spec FR-018)
- [X] T041 Author the server instructions in `src/core/server-instructions.ts` covering all six enumerated subjects (spec FR-005)
- [X] T042 Document the tool naming convention and the cross-release name stability and deprecation policy in `docs/tool-naming.md` (spec FR-009)
- [X] T043 Implement the v2 adapter in `src/adapters/mcp-v2/`, including `ttlMs` and `cacheScope` set so a filtered tool list can never be served to another principal (research R5)
- [X] T044 Implement the v1 adapter in `src/adapters/mcp-v1/`, delivering server instructions via `initialize` (research R3, R4)
- [X] T045 Implement the executable entry point in `src/bin/jisr-mcp.ts` with stdio transport and adapter selection

### Foundational tests

- [X] T046 [P] Create fixtures in `tests/fixtures/jisr/` derived from the snapshot's own examples, containing no real employee or payroll data (spec FR-042)
- [X] T047 [P] Test the coverage gate in `tests/contract/endpoint-coverage.test.ts`, asserting it fails on an injected divergence and that no write client method or write code path exists (spec FR-010, FR-012)
- [X] T048 [P] Test that no registered tool accepts a caller-supplied path, URL, or HTTP method in `tests/security/no-generic-tool.test.ts` (spec FR-008)
- [X] T049 [P] Test that no `@modelcontextprotocol/*` import exists under `src/core/` in `tests/unit/core-boundary.test.ts`
- [X] T050 [P] Test authentication behaviour in `tests/integration/authentication.test.ts`: invalid slug, key, and secret; expired token; exactly one retry; no refresh loop
- [X] T051 [P] Test cursor binding and expiry in `tests/security/cursor.test.ts` covering tampering, expiry, and operation mismatch
- [X] T052 Implement the repository-wide secret-absence assertion in `tests/security/no-secrets.test.ts`, scanning all test output, logs, and artifacts (spec SC-003)
- [X] T053 [P] Test that a cached tool list cannot cross principals in `tests/security/tool-list-cache.test.ts`, using two differently-authorized principals (quickstart V9, research R5)
- [X] T054 [P] Test adapter parity in `tests/contract/adapter-parity.test.ts`, asserting identical inputs, outputs, envelopes, error codes, and annotations through v1 and v2 (spec FR-002a, SC-014)

**Checkpoint**: Core, adapters, and the controls built here are implemented **and tested**

---

## Phase 3: User Story 1 — Connect my own Jisr in minutes (Priority: P1) 🎯 MVP

**Goal**: An adopter goes from the README to an authorized answer about their own Jisr data in under
ten minutes, from any of the named MCP clients.

**Independent Test**: On a clean machine, following only the README, connect to a Jisr organization
and retrieve employee and attendance data through an MCP client — under ten minutes, no source
reading, no additional service installed.

### Tests for User Story 1

- [X] T055 [P] [US1] Contract test for the three discovery tools in `tests/contract/discovery-tools.test.ts`
- [X] T056 [P] [US1] Test startup failure messages in `tests/integration/startup-failures.test.ts` for missing slug, wrong secret, and unapproved base URL, asserting no stack trace and no credential echo (quickstart V2)
- [X] T057 [P] [US1] Test that connection status returns no slug, key identifier, or token in `tests/field-policy/connection-status.test.ts` (spec FR-013)
- [X] T058 [P] [US1] Test unavailability explanations in `tests/integration/unavailability.test.ts`, asserting each of the four causes is distinguishable with a suggested action (spec FR-016)

### Implementation for User Story 1

- [X] T059 [P] [US1] Implement `jisr_connection_status_get` in `src/core/tools/discovery/connection-status.ts`
- [X] T060 [P] [US1] Implement `jisr_capabilities_get` in `src/core/tools/discovery/capabilities.ts`
- [X] T061 [P] [US1] Implement `jisr_data_catalog_get` in `src/core/tools/discovery/data-catalog.ts`, including each tool's declared field groups (spec FR-028)
- [X] T062 [US1] Implement the employees service in `src/core/services/employees-service.ts`
- [X] T063 [US1] Implement `jisr_employees_list` in `src/core/tools/employees/employees-list.ts` with the allowlist mapper applied
- [X] T064 [US1] Implement `jisr_employee_basic_info_get` in `src/core/tools/employees/basic-info-get.ts`
- [X] T065 [US1] Implement the attendance service in `src/core/services/attendance-service.ts`
- [X] T066 [US1] Implement `jisr_attendance_summary_get` in `src/core/tools/attendance/summary-get.ts`, mapping `businiess_trip_days` verbatim from the upstream spelling (data-model §4)
- [X] T067 [US1] Write the README quick start in `README.md`: prerequisites, the two-credential posture, configuration, and first query (spec SC-001)
- [X] T068 [P] [US1] Document the **Claude Code** installation block in `README.md`, naming its configuration mechanism and both installation scopes (checklist adoption CHK001)
- [X] T069 [P] [US1] Document the **Cursor** installation block in `README.md`, covering project-scoped and user-scoped installation (checklist adoption CHK003)
- [X] T070 [P] [US1] Document the **Codex** installation block in `README.md`, using its own configuration format rather than the JSON used by other clients (checklist adoption CHK002)
- [X] T071 [US1] Document Claude Desktop and MCP Inspector connection in `README.md`, plus how to refresh the tool list on clients that do not accept post-connection changes (spec §Edge Cases, SC-006)

**Checkpoint**: A working, installable, single-organization read server — the MVP

---

## Phase 4: User Story 2 — Ask anything the organization's permissions allow (Priority: P2)

**Goal**: Complete non-financial read coverage, so questions spanning several Jisr domains are
answerable in one session.

**Independent Test**: Exercise every non-financial documented read operation through its tool and
confirm via the coverage gate that none is unreachable and no undocumented operation is reachable.

### Tests for User Story 2

- [X] T072 [P] [US2] Test pagination to exhaustion in `tests/integration/pagination.test.ts`, asserting no unbounded response and no caller-constructed upstream address (quickstart V7)
- [X] T073 [P] [US2] Test page-size and bulk limits in `tests/integration/limits.test.ts` for `PAGE_SIZE_EXCEEDED` and `BULK_LIMIT_EXCEEDED`
- [X] T074 [P] [US2] Test Arabic name integrity in `tests/integration/bilingual.test.ts`, asserting `full_name_ar` survives intact and is usable in a follow-up lookup (quickstart V10)
- [X] T075 [P] [US2] Test the four non-success states are distinguishable in `tests/contract/result-states.test.ts` (spec FR-036)
- [X] T076 [P] [US2] Test ambiguous employee matching returns `AMBIGUOUS_EMPLOYEE_MATCH` in `tests/integration/employee-resolution.test.ts`

### Implementation for User Story 2

- [X] T077 [US2] Implement `jisr_attendance_logs_list` in `src/core/tools/attendance/logs-list.ts`, returning employee code and resolved identifier, refusing ambiguous time zones
- [X] T078 [US2] Implement the leave service and `jisr_employee_leave_summary_get` in `src/core/services/leave-service.ts` and `src/core/tools/leave/summary-get.ts`, enforcing the 100-code upstream limit
- [X] T079 [US2] Implement the accruals service and `jisr_accrual_transactions_list` in `src/core/services/accruals-service.ts` and `src/core/tools/accruals/transactions-list.ts`, documented fields only
- [X] T080 [P] [US2] Implement the lookups service in `src/core/services/lookups-service.ts`
- [X] T081 [P] [US2] Implement all six lookup tools in `src/core/tools/lookups/`, each returning `{ id, nameEn, nameAr }`
- [X] T082 [P] [US2] Implement `jisr_webhooks_list` in `src/core/tools/webhooks/webhooks-list.ts`, stripping stored authentication secrets (spec FR-025)
- [X] T083 [P] [US2] Implement `jisr_audit_events_list` in `src/core/tools/audit/audit-events-list.ts`, encoding the upstream `filter[...]` syntax internally
- [X] T084 [US2] Extend `jisr_data_catalog_get` to describe every domain now implemented

**Checkpoint**: All 14 non-financial read tools plus 3 discovery tools operational

---

## Phase 5: User Story 3 — Financial and sensitive data stays behind its own door (Priority: P3)

**Goal**: The finance surface exists, is reachable only by finance-authorized callers with the
surface explicitly enabled, and is undiscoverable to everyone else.

**Independent Test**: Run the full role-profile-by-tool matrix and confirm every cell resolves as
expected, with denied capabilities absent from the tool list rather than refused on call.

### Tests for User Story 3

- [X] T085 [US3] Implement the salary-leak test in `tests/field-policy/employee-list-financial-leak.test.ts`: finance-permissioned key, non-finance caller, finance surface disabled — assert zero salary fields reach the caller (quickstart V4, research R2)
- [X] T086 [P] [US3] Implement the role-profile-by-tool authorization matrix in `tests/authorization/role-matrix.test.ts` covering all seven canonical profiles against all 23 tools (spec SC-004)
- [X] T087 [P] [US3] Test that denied capabilities are absent from the tool list in `tests/authorization/tool-list-filtering.test.ts` (spec FR-018)
- [X] T088 [P] [US3] Test collection scoping in `tests/authorization/collection-scoping.test.ts`: a manager listing employees sees only direct reports, employee-self sees only itself, and no total or page count discloses records outside the reachable set (spec FR-018a)
- [X] T089 [P] [US3] Test enumeration resistance in `tests/security/enumeration.test.ts`, asserting refusals do not reveal whether a record exists
- [X] T090 [P] [US3] Test the financial-info field allowlist in `tests/field-policy/financial-info.test.ts`, asserting only approved schema fields are returned

### Implementation for User Story 3

- [X] T091 [US3] Implement the finance surface opt-in and optional separate finance credential in `src/config/environment.ts` and `src/config/feature-flags.ts` (spec FR-023a, FR-023b)
- [X] T092 [US3] Implement the finance service in `src/core/services/finance-service.ts` with stricter interfaces than the HR services
- [X] T093 [US3] Implement `jisr_employee_financial_info_get` in `src/core/tools/finance/financial-info-get.ts` with no caching, no body logging, and a strong audit event
- [X] T094 [P] [US3] Implement `jisr_employee_monthly_payables_list` in `src/core/tools/finance/monthly-payables-list.ts`
- [X] T095 [P] [US3] Implement `jisr_payroll_transactions_list` in `src/core/tools/finance/payroll-transactions-list.ts`, preserving transaction identifiers
- [X] T096 [P] [US3] Implement `jisr_gl_transaction_types_list` and `jisr_paygroups_list` in `src/core/tools/finance/`
- [X] T097 [P] [US3] Implement `jisr_accounting_journal_get` in `src/core/tools/accounting/journal-get.ts` with a validated journal identifier
- [X] T098 [US3] Document the finance opt-in and separate-credential posture in `README.md`

**Checkpoint**: All 23 tools implemented; finance provably separated

---

## Phase 6: User Story 4 — Prove what happened and notice when Jisr changes (Priority: P4)

**Goal**: Every call is auditable, and upstream schema change surfaces as drift rather than reaching
a caller.

**Independent Test**: Replay a session and confirm a complete audit trail with no sensitive payloads;
separately, inject an unknown upstream field and confirm it is withheld and recorded.

### Tests for User Story 4

- [X] T099 [P] [US4] Test audit completeness in `tests/integration/audit-trail.test.ts`, asserting one stderr record per call including refusals, and no sensitive payload (spec SC-011)
- [X] T100 [P] [US4] Test drift handling in `tests/integration/schema-drift.test.ts` with an injected unknown field, asserting it is withheld, recorded, and marks the result partial (quickstart V8)
- [X] T101 [P] [US4] Test that the four capability facts are independently observable in `tests/contract/capabilities.test.ts`

### Implementation for User Story 4

- [X] T102 [US4] Implement drift detection in `src/core/jisr/schemas/drift.ts`, recording the field path without capturing potentially sensitive values (spec FR-027)
- [X] T103 [US4] Wire drift into every mapper in `src/core/jisr/mappers/` so unknown fields set `isPartial` and add a warning
- [X] T104 [US4] Complete audit coverage across all 23 tool handlers in `src/core/tools/`, including authorization refusals

**Checkpoint**: Feature complete against the specification

---

## Phase 7: Polish, Release Engineering & Cross-Cutting Concerns

**Purpose**: The release gates that span stories, and the GitHub version-control and release pipeline

### Cross-cutting tests

- [X] T105 [P] Test degradation honesty in `tests/integration/degradation.test.ts` for upstream unreachable, 429, and mid-pagination token expiry (quickstart V12)
- [X] T106 [P] Test prompt-injection content in employee fields cannot alter behaviour in `tests/security/prompt-injection.test.ts`
- [X] T107 [P] Test annotation accuracy across all 23 tools in `tests/contract/annotations.test.ts` (spec FR-037)
- [X] T108 Implement the multi-domain session scenario in `tests/integration/multi-domain-session.test.ts`, answering questions across at least four Jisr domains in one session (spec SC-010)

### Protocol and client verification

- [X] T109 Implement Inspector-driven validation in `scripts/verify-mcp.ts` and run it against both adapters (spec Definition of Done)
- [ ] T110 Verify against all five named MCP clients and record results in `docs/client-compatibility.md` (spec SC-006)

### Documentation

- [X] T111 [P] Write `docs/authorization-matrix.md` from the role-profile matrix
- [X] T112 [P] Write `docs/endpoint-coverage.md` from the manifest
- [X] T113 [P] Complete `SECURITY.md` with a disclosure contact and response expectation (checklist compliance CHK012)

### GitHub version control and release pipeline

- [X] T114 Adopt semantic versioning and a conventional-commit convention, documented in `CONTRIBUTING.md`, with automated `CHANGELOG.md` generation (spec FR-044)
- [ ] T115 Configure default-branch protection on GitHub — no direct pushes, with build, lint, full test suite, coverage gate, and secret scan required to pass before merge — and record the applied settings in `docs/repository-settings.md` so they are reviewable (spec FR-044b)
- [X] T116 [P] Add `.github/CODEOWNERS`, issue templates, and a pull request template under `.github/`
- [X] T117 Implement the release workflow in `.github/workflows/release.yml`, triggered by a version tag on the default branch, building, testing, publishing to the registry with build provenance, and creating the GitHub Release with generated notes (spec FR-044a)
- [X] T118 Add the release notes template in `.github/release-template.md` recording, per release, the supported MCP protocol version(s) and the Jisr specification snapshot the build was verified against (spec FR-044)
- [X] T119 Add `scripts/verify-release.ts` asserting that the tag, `package.json` version, `CHANGELOG.md` entry, and documented protocol and snapshot versions agree before a release proceeds

### Release gates outside the codebase

- [X] T120 Resolve the license decision and add `LICENSE` in the repository root (spec Dependencies)
- [X] T121 Record the publisher of record and add an unofficial-project statement to `README.md` (checklist compliance CHK009, CHK010)
- [ ] T122 Commission the PDPL legal review and record its outcome in `docs/privacy.md` (spec Dependencies)
- [X] T123 Confirm all 20 items of the Definition of Done in `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` §27 (spec SC-012)

---

## Dependencies

### Phase order

```text
Phase 1 Setup → Phase 2 Foundational → Phase 3 US1 → Phase 4 US2 → Phase 5 US3 → Phase 6 US4 → Phase 7 Polish & Release
```

Phase 2 blocks everything.

### Story dependencies

| Story | Depends on | Why |
|---|---|---|
| US1 (P1) | Phase 2 | MVP; independently shippable |
| US2 (P2) | Phase 2 | Independent of US1, but US1 first delivers the adoption path |
| US3 (P3) | Phase 2, and T027–T028 in particular | Field policy must exist before the finance surface does |
| US4 (P4) | Phase 2; full value after US2 and US3 | Auditing an incomplete surface proves little |

**Note on ordering**: the field-policy engine (T027, T028) sits in Phase 2 rather than US3 even
though it protects financial data. The employee list leaks salary fields the moment it exists
(research R2), so the protection cannot wait for the finance story.

**Note on test placement**: T053 (tool-list cache) and T054 (adapter parity) sit in Phase 2 rather
than the final phase, because both exercise controls built in Phase 2. Testing them four phases
later would let divergence accumulate silently.

### Key task dependencies

- T013 blocks T014 and every tool task
- T019 blocks all upstream calls
- T027 blocks T028; T028 blocks T063 and T064
- T034 blocks T061
- T039 blocks T040, T043, T044
- T043 and T044 block T045, T053, T054, T109
- T114 blocks T117; T117 blocks T119

---

## Parallel Execution Examples

**Phase 1**: T003–T008 run together after T002.

**Phase 2 schemas and contract**: T015, T016, T020, T021, T023, T024, T025, T026 run together once
T013 lands. Observability T035–T038 runs alongside them. Foundational tests T046–T051, T053, T054
run together once their subjects exist.

**Phase 3**: discovery tools T059, T060, T061 run together; client documentation T068, T069, T070
runs in parallel with each other and with tool work.

**Phase 4**: T080–T083 run together; tests T072–T076 run together.

**Phase 5**: finance tools T094–T097 run together after T092. Tests T086–T090 run together, but
T085 is written first and must fail before T091.

**Phase 7**: T105–T107 and T111–T113 and T116 all run in parallel.

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (T001–T071)**. An installable, single-organization server with three
discovery tools and three core read tools, working from any of the five named clients, with field
policy, authorization, cursors, audit, both adapters, and their tests already in place. Publishable
and useful on its own.

### Incremental delivery

1. **MVP** — US1. Adopters can connect and ask about people and attendance.
2. **+ US2** — complete non-financial coverage. The product replaces manual Jisr lookups.
3. **+ US3** — the finance surface, provably separated. Payroll conversations become possible.
4. **+ US4** — audit and drift. The system stays trustworthy over time.
5. **+ Phase 7** — release engineering and the gates that are not code: license and legal review.

### Sequencing notes

T085 (the salary-leak test) is written before T091 and must fail first. It is the single test that
justifies the field-policy design, and writing it after the implementation would prove nothing.

T114–T119 should land before the first public tag, not after. A release pipeline retrofitted onto an
already-published package tends to inherit whatever was done by hand the first time.

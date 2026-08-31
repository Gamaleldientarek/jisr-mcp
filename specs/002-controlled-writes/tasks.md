---
description: "Task list for controlled writes -- Release 2"
---

# Tasks: Controlled Writes — Release 2

**Input**: Design documents from `/specs/002-controlled-writes/`
**Tests**: Included — required by SC-001..009 and Constitution Principle VII.
**Organization**: Shared write machinery is foundational; then one phase per user story.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Add the three write-domain flags (`JISR_WRITE_ATTENDANCE`, `JISR_WRITE_EMPLOYEES`, `JISR_WRITE_PAYROLL_DELETE`, all defaulting disabled) with actionable failures in `src/config/environment.ts` and `src/config/feature-flags.ts` (spec FR-001, FR-002)
- [X] T002 Define the write request/response schemas from the snapshot prose in `src/core/jisr/schemas/writes.ts`, accepting both string and integer `emp_code` (research W1)
- [X] T003 Add the eight write error codes from `data-model.md` §6 to `src/core/errors.ts`, using the names the baseline plan reserved
- [X] T004 [P] Bind the three write operations to their tools in `src/core/jisr/endpoint-manifest.ts` (journals and webhooks stay unbound) and extend `scripts/verify-endpoint-coverage.ts` to assert exactly these three writes are bound (spec FR-020)

## Phase 2: Foundational — shared write machinery

**⚠️ Blocks all user stories**

- [X] T005 Implement confirmation references in `src/core/writes/confirmation.ts`: HMAC per-process key, bound to organization+caller+operation+targetHash, 5-minute TTL, single-use (spec FR-004, FR-005)
- [X] T006 [P] Implement the duplicate guard in `src/core/writes/duplicate-guard.ts`: payload-hash window of 10 minutes per organization+operation → `DUPLICATE_WRITE_SUSPECTED` (spec FR-007)
- [X] T007 [P] Implement shared preview shapes in `src/core/writes/preview.ts`, field-policy filtered (spec FR-004)
- [X] T008 Change the registry's read-only guard into a manifest-driven annotation allowlist in `src/core/tools/registry.ts`: write/destructive registration allowed only when the manifest binds the tool as such (plan Complexity 1)
- [X] T009 Lift the client's write refusal for exactly the bound operations in `src/core/jisr/client.ts`, keeping the refusal for unbound ones
- [X] T010 Implement ambiguous-outcome handling in `src/core/writes/outcome.ts`: timeout/unparseable after submit → `WRITE_OUTCOME_UNKNOWN` naming the resolving read tool; no automatic retry anywhere (spec FR-009)
- [X] T011 Extend audit records with phase, referencePrefix, targetIds, reason, and the ambiguous outcome in `src/observability/audit.ts` (spec FR-010)
- [X] T012 [P] Test references in `tests/security/confirmation.test.ts`: forged, expired (+5m01s), consumed, cross-caller, cross-organization, cross-target — all refuse distinctly (SC-003, SC-005)
- [X] T013 [P] Test the registry allowlist in `tests/contract/write-annotations.test.ts`: an unmanifested write tool cannot register; prepare tools are read-only-annotated, commits write, deletion destructive (spec FR-011)
- [X] T014 [P] Test the duplicate guard and ambiguity handling in `tests/integration/write-guards.test.ts` (quickstart W3, W7)

## Phase 3: US1 — attendance punch creation (P1) 🎯 MVP

- [X] T015 [P] [US1] Test the full prepare/commit round trip against a stubbed upstream in `tests/integration/punch-create.test.ts`: no-reference, invented-reference, and valid-reference paths; the commit result MUST be asserted as the stubbed RE-READ state, deliberately different from the submitted payload (SC-004); an array of punches refuses at the schema — no batch (quickstart W2)
- [X] T016 [P] [US1] Test the backdating window in `tests/integration/punch-backdating.test.ts`: previous-month OK, older refuses `BACKDATING_WINDOW_EXCEEDED`, zone-less refuses `TIMEZONE_REQUIRED` (spec FR-013a)
- [X] T017 [US1] Implement the attendance write service in `src/core/services/attendance-write-service.ts`: validation, window check, reason, submit, re-read (spec FR-013)
- [X] T018 [US1] Implement `jisr_attendance_punch_create_prepare` and `_commit` in `src/core/tools/attendance/punch-create.ts` per `contracts/write-tool-contracts.md`
- [X] T019 [US1] Register the pair gated on `hr_operations` + `JISR_WRITE_ATTENDANCE` in `src/core/tools/index.ts` and `src/core/authorization/policies.ts` (spec FR-003)
- [X] T020 [P] [US1] Test dormancy AND the enabled-state matrix in `tests/authorization/write-dormancy.test.ts`: with flags at default, zero write tools listed for every profile (SC-002); with all flags enabled, every profile except `hr_operations` still finds punch and employee tools undiscoverable and uncallable (spec FR-003)

## Phase 4: US2 — employee creation (P2)

- [X] T021 [P] [US2] Test lookup resolution and name rules in `tests/integration/employee-create.test.ts`: unknown departmentId refuses at prepare; single-part name refuses; out-of-enum `gender`/`contractType` values refuse at prepare (spec FR-006, FR-014)
- [X] T022 [P] [US2] Test duplicate warning in `tests/integration/employee-duplicates.test.ts`: matching code or exact name → warning; commit without `acknowledgeDuplicates` refuses (spec FR-015)
- [X] T023 [US2] Implement the employee write service in `src/core/services/employees-write-service.ts`: live lookup resolution, enum exactness, duplicate pre-read, submit, mandatory re-read handling `id: null` (research W1)
- [X] T024 [US2] Implement `jisr_employee_create_prepare` and `_commit` in `src/core/tools/employees/employee-create.ts`
- [X] T025 [US2] Register the pair gated on `hr_operations` + `JISR_WRITE_EMPLOYEES` in `src/core/tools/index.ts`

## Phase 5: US3 — payroll deletion, dormant (P3)

- [X] T026 [P] [US3] Test target re-validation in `tests/integration/payroll-delete.test.ts`: target changed → `WRITE_TARGET_CHANGED`; vanished → `RECORD_NOT_FOUND`; reason required; any multi-target form refuses at the schema (spec FR-018) (quickstart W6)
- [X] T027 [P] [US3] Test four-gate dormancy in `tests/authorization/payroll-delete-gates.test.ts`: absent for all profiles at default; enabled requires finance profile + finance surface + key + flag together (SC-006)
- [X] T028 [US3] Implement the deletion service in `src/core/services/payroll-delete-service.ts`: prepare re-read, target hash, reason, single-target only (spec FR-016..019)
- [X] T029 [US3] Implement `jisr_payroll_transaction_delete_prepare` and `_commit` (destructive-annotated) in `src/core/tools/finance/payroll-delete.ts`

## Phase 6: Polish & release gates

- [X] T030 [P] Extend adapter parity to the six write tools in `tests/contract/adapter-parity.test.ts` — identical surface on both adapters; MRTR deliberately absent (feature 001 FR-002a, analysis I1)
- [X] T031 [P] Test write-audit completeness in `tests/integration/write-audit-trail.test.ts`: one record per prepare, commit, refusal, and ambiguous outcome in a replayed session; reasons present on deletions; zero sensitive payloads (SC-007, quickstart W8)
- [X] T032 Extend `scripts/e2e-protocol-test.py` with a write round trip over real stdio against a stubbed upstream
- [X] T033 [P] Extend `tests/security/prompt-injection.test.ts`: injected record content cannot compose a valid confirmation (SC-003)
- [X] T034 [P] Update README, `docs/tool-naming.md`, and regenerate the authorization matrix for the six write tools via `npm run docs:generate`
- [X] T035 Create `docs/write-contract-verification.md` with one empty evidence section per tool and the window procedure from research W6 (spec FR-012, SC-009)
- [ ] T036 **LIVE WINDOW (human present)**: widen the key, verify punch and employee creation per quickstart W9, record evidence including a timed end-to-end punch correction conversation (SC-008 target: under 3 minutes), narrow the key — no write tool enabled anywhere before its section is filled (SC-009)
- [ ] T037 Update `CHANGELOG.md`, tag v0.2.0 after T036 evidence lands, and record decisions in the baseline plan's Decision Log

## Dependencies

Phase 2 blocks 3–5; T005 blocks every commit tool; T008 blocks T018/T024/T029; US phases are
independent of each other after Phase 2; T036 gates enablement and v0.2.0, not merge.

# Feature Specification: Controlled Writes — Release 2

**Feature Branch**: `002-controlled-writes`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "a feature 002-controlled-writes"

Builds on feature `001-jisr-mcp-server` (released as v0.1.0): the complete read-only surface, its
authorization model, field policy, audit trail, and both protocol adapters. This feature adds the
ability to **change** Jisr — the 8 documented write operations recorded in the endpoint manifest as
`release: 2`, deliberately unbound until now.

Governed by the project constitution, whose Principle VI (Read-First Release Order) this feature now
satisfies the precondition of: Release 1 shipped first, and each write arrives individually, with its
own authorization review, confirmation flow, audit trail, and test coverage.

## Clarifications

### Session 2026-08-31

- Q: Which role profiles may perform this feature's writes (punch creation, employee creation)? → A: `hr_operations` only; every other profile remains read-only in this feature.
- Q: How far back may a punch be created? → A: Within the current or immediately previous calendar month; older dates are refused.
- Q: Confirmation reference validity window? → A: 5 minutes from issue.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct a missed attendance punch (Priority: P1)

An HR operations person learns that an employee forgot to clock in yesterday. Through their
assistant, they record the missing punch: they state the employee, the exact time with its time
zone, and why. The assistant shows them exactly what will be recorded, they confirm, and the punch
is created in Jisr. The conversation ends with confirmation of what Jisr now holds — re-read from
Jisr, not assumed from the request.

**Why this priority**: The most frequent, lowest-blast-radius write in HR operations — additive,
visible in the attendance record, and correctable through Jisr's own review flows. It exercises the
entire shared write machinery (preview, confirmation, audit, re-read) on the least dangerous
operation, which is the right place to prove that machinery.

**Independent Test**: Create a punch through the full confirm flow against a test window, then
verify through the Release 1 read tools that the punch exists in Jisr exactly as previewed.

**Acceptance Scenarios**:

1. **Given** an authorized HR caller with the write surface enabled, **When** they request a punch
   creation, **Then** they receive a preview stating employee, time, and effect, and nothing is
   written until they confirm.
2. **Given** a preview, **When** the caller confirms using the reference the server issued with it,
   **Then** the punch is created, an audit record is written, and the result reflects what Jisr
   returned — not what was submitted.
3. **Given** a punch time without an explicit time zone, **When** the request is made, **Then** it
   is refused before any preview, naming the problem.
3a. **Given** a punch dated before the previous calendar month, **When** prepare is attempted,
   **Then** it refuses at prepare, stating the permitted window.
4. **Given** a confirmation reference invented by the model rather than issued by the server,
   **When** commit is attempted, **Then** it is refused.
5. **Given** the same confirmed request submitted twice, **When** the duplicate arrives, **Then**
   the second is safely rejected or has no additional effect — never a silent double punch.

---

### User Story 2 - Onboard a new employee (Priority: P2)

An HR operations person hires someone. Through their assistant they provide the new employee's
details; every organizational reference — department, employment type, location — is resolved
against Jisr's real lookups before anything is submitted. They see the complete record as it will be
created, confirm, and receive the new employee's identifiers as Jisr assigned them.

**Why this priority**: The highest-value write, but heavier than P1: many fields, lookup
resolution, duplicate risk, and a person-record with PDPL weight. It should land on machinery P1 has
already proven.

**Independent Test**: Create a fictional employee through the full flow in a controlled window,
verify the created record through the read tools, and verify a duplicate attempt is caught.

**Acceptance Scenarios**:

1. **Given** employee details including names in both languages, **When** creation is prepared,
   **Then** every lookup reference is resolved to a real identifier and the preview shows the full
   record; unknown or stale lookup values refuse at prepare, not at Jisr.
2. **Given** a prepared creation, **When** it is confirmed within its validity window, **Then** the
   employee exists in Jisr and the response carries Jisr's own identifiers for follow-up reads.
3. **Given** a prepare whose validity has lapsed, **When** commit is attempted, **Then** it is
   refused and the caller is told to prepare again.
4. **Given** an attempted creation that appears to duplicate an existing employee, **When** it is
   prepared, **Then** the caller is warned with the apparent match before any confirmation is
   possible.

---

### User Story 3 - Remove an erroneous payroll transaction (Priority: P3)

A payroll specialist discovers a payroll transaction that must not stand — duplicated, or entered
against the wrong person. With the deletion capability explicitly enabled by the operator (it ships
off), they identify the exact transaction, see it in full at prepare — amount, type, employee,
effect — state a reason, and confirm with the server-issued reference. The deletion is audited with
the reason, and the result reflects Jisr's state after the fact.

**Why this priority**: The single most dangerous operation in the documented surface, included by
deliberate decision and shipped dormant. It is built and tested now so that when a real workflow
needs it, the path is proven — but it activates only by explicit operator opt-in on top of the
finance profile, the finance surface, and the payroll-write domain.

**Independent Test**: With the flag enabled in a controlled window, delete a test transaction
through the full two-step flow and verify via the read tools; with the flag at its default, verify
the tools are undiscoverable to every profile.

**Acceptance Scenarios**:

1. **Given** a default deployment, **When** any caller lists tools under any profile, **Then** no
   payroll-deletion tool exists to be found.
2. **Given** the flag enabled and a finance caller, **When** deletion is prepared, **Then** the
   preview shows the full transaction as Jisr currently holds it, and a reason is required before a
   reference is issued.
3. **Given** the transaction changes or disappears between prepare and commit, **When** commit is
   attempted, **Then** it refuses because the target no longer matches what was previewed.
4. **Given** a committed deletion, **When** the audit trail is read, **Then** it carries the actor,
   the target identifiers, the stated reason, and the outcome.
5. **Given** an attempt to delete a second transaction with the same reference, **When** commit is
   called, **Then** it refuses — references are single-use and target-bound.

---

### Edge Cases

- **Jisr accepts the write but the response cannot be parsed.** The result must say "the write may
  have succeeded — verify before retrying", never invite a blind retry of a possibly-completed
  mutation.
- **Jisr times out during commit.** Same as above: ambiguous outcomes are surfaced as ambiguous,
  with the read tools named as the way to resolve them.
- **The upstream contract differs from the documentation.** Feature 001 found the OpenAPI document
  wrong four times on reads. Every write contract must be verified against the live API in a
  controlled window before its tool is enabled; a documented-but-unverified write ships disabled.
- **Two people prepare against the same target.** A prepare is bound to caller, organization,
  operation, and target; a commit under a reference issued to someone else refuses.
- **The target changes between prepare and commit.** Where the upstream state can be re-read at
  commit, a material change invalidates the preparation.
- **The model asks to skip the preview.** There is no path that skips it. Preview-then-confirm is
  structural, not a politeness.
- **A deletion targets an already-deleted transaction.** Prepare re-reads the target; a missing
  target refuses at prepare with a distinct outcome, never a pretend success.
- **A write tool's Jisr permission is missing.** Same four-way capability report as reads: the tool
  is undiscoverable, and capabilities explain which gate failed and who can fix it.

## Requirements *(mandatory)*

### Shared write machinery

- **FR-001**: Writes MUST be absent by default. A deployment that has not explicitly enabled the
  write surface exposes no write tool, discloses no write capability, and contains no write path a
  caller can reach — exactly as Release 1 shipped.
- **FR-002**: The write surface MUST be enabled per write domain (attendance, employees, journals,
  webhooks), not as one switch, so an organization can allow punch corrections without allowing
  employee creation.
- **FR-003**: Every write MUST pass the same two independent gates as reads — caller profile and
  Jisr key permission — plus the domain's write-surface opt-in. No gate may be inferred from
  another. In this feature the only write-authorized profile is `hr_operations` for punch and
  employee creation, and `finance` for the dormant deletion path; every other profile — manager
  included — remains read-only, and write tools are undiscoverable to them.
- **FR-004**: Every consequential write MUST use two steps: a prepare that validates fully, shows
  the caller exactly what will change, and issues a short-lived server-bound confirmation
  reference; and a commit that accepts only that reference. A confirmation string composed by the
  model MUST never be accepted.
- **FR-005**: Confirmation references MUST be bound to organization, caller, operation, and target;
  MUST expire **5 minutes** after issue; and MUST be single-use. An expired reference refuses with a
  distinct outcome telling the caller to prepare again, which re-validates everything.
- **FR-006**: Input validation MUST be strict and complete at prepare: unknown fields rejected,
  lookup references resolved against live Jisr, time zones explicit, and domain rules (such as
  balanced journals) enforced before Jisr is contacted.
- **FR-007**: Every write MUST be idempotency-protected where the upstream contract permits, and
  where it does not, a duplicate commit MUST be detected and refused by the server itself.
- **FR-008**: After a successful write the server MUST re-read the affected state from Jisr where a
  read exists, and report what Jisr holds rather than what was submitted.
- **FR-009**: An ambiguous outcome — timeout or unparseable response after submission — MUST be
  reported as ambiguous, naming the read tool that resolves it, and MUST NOT be retried
  automatically.
- **FR-010**: Every prepare, commit, refusal, and ambiguous outcome MUST produce an audit record,
  carrying the decision, the target's identifiers, and counts — never full record contents.
  Financial writes carry the strong finance audit marking from Release 1.
- **FR-011**: Write tools MUST carry accurate annotations: non-destructive writes as writes,
  destructive operations as destructive, and webhook testing as an open-world network action.
- **FR-012**: Each write tool MUST be individually releasable and individually disableable, with
  its live-API contract verified in a controlled window before it is enabled anywhere — the
  documentation alone is established as insufficient evidence.

### Attendance punches

- **FR-013**: Punch creation MUST require employee identification, an explicit-zone timestamp, and
  a stated reason, recorded in the audit trail.
- **FR-013a**: A punch MUST be dated within the current or immediately previous calendar month,
  evaluated in the organization's time context at prepare. Older dates refuse at prepare with the
  window stated — closed pay periods are immutable through this tool, and corrections beyond the
  window belong in Jisr itself.

### Employee creation

- **FR-014**: Employee creation MUST resolve every organizational reference against live lookups at
  prepare and refuse unknown values there.
- **FR-015**: Employee creation MUST check for apparent duplicates at prepare and surface any match
  as a warning requiring explicit acknowledgment in the confirmation.

### Payroll transaction deletion

- **FR-016**: Payroll transaction deletion MUST ship disabled, behind its own explicit operator
  flag, in addition to the finance profile, the finance surface, and the payroll write domain. With
  the flag at its default, the deletion tools are undiscoverable to every profile.
- **FR-017**: Deletion MUST be destructive-classed and two-step: prepare re-reads the target from
  Jisr and previews it in full; a stated reason is required; commit re-validates that the target
  still matches the preview and refuses if it has changed or vanished.
- **FR-018**: Deletion MUST be single-target only — no batch deletion exists in any form.
- **FR-019**: The audit record for a deletion MUST carry the actor, target identifiers, stated
  reason, and outcome, under the strong finance audit marking.

### Scope

- **FR-020**: This feature delivers the shared write machinery plus two write domains — attendance
  punches and employee creation — and the dormant payroll-deletion capability. Accounting journal
  creation and webhook administration remain recorded in the endpoint manifest as known and
  unbound, deferred to a later feature on the machinery this one proves.
- **FR-021**: Payroll transaction deletion is included behind its disabled-by-default flag per
  FR-016 through FR-019, by explicit owner decision (2026-08-31), accepting the cost of building
  and maintaining the riskiest path ahead of demonstrated workflow need.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 writes reach Jisr without a prior preview and a server-issued confirmation, across
  the entire test suite and live verification.
- **SC-002**: 100% of write attempts in deployments without the relevant domain opt-in find no
  write tool to call — absence, not refusal, verified per domain.
- **SC-003**: 0 model-composed confirmation strings are accepted, demonstrated by adversarial
  tests.
- **SC-004**: 100% of committed writes are verified against Jisr's own state via re-read in the
  test window, and 0 report submitted values as outcomes.
- **SC-005**: Duplicate commits produce 0 duplicate effects across the suite.
- **SC-006**: With the deletion flag at its default, payroll-deletion tools are absent for 100% of
  profiles in 100% of listings; with it enabled, 0 deletions commit without a re-validated target,
  a stated reason, and a server-issued reference.
- **SC-007**: Every write, refusal, and ambiguous outcome appears in the audit trail — 0 gaps in a
  replayed session, with 0 sensitive payloads.
- **SC-008**: An HR operations user corrects a missed punch end-to-end in under 3 minutes of
  conversation, including the confirmation step.
- **SC-009**: Each write tool's live contract is verified and recorded before enablement — 0 tools
  enabled on documentation alone.

## Out of Scope (Deferred)

- **Accounting journal creation and webhook administration** — deferred to a later feature on the
  machinery this one proves. Their manifest entries remain recorded and unbound.
- **Batch or bulk writes of any kind** — one target per confirmation, in every domain.
- **The hosted multi-tenant deployment** — unchanged from feature 001.
- **Synchronized storage** — writes operate live, exactly as reads do.
- **Analytics and KPIs** — unchanged from feature 001.

## Assumptions

- **The shared machinery is one build, used four times.** Prepare/commit, confirmation references,
  idempotency, ambiguity handling, and write auditing are built once and reused per domain — not
  reimplemented per tool.
- **Confirmation happens in conversation.** The caller's client presents the preview and relays the
  confirmed reference. The protocol's multi-round-trip request mechanism (noted in feature 001
  research as the designed fit) is the expected vehicle; where a client cannot support it, the
  prepare/commit tool pair achieves the same flow in two calls.
- **The AZMX key currently excludes attendance and financial permissions.** Live verification of
  punch creation — and of payroll deletion, if ever activated — requires deliberately widening a
  key for a controlled test window, then narrowing it back. An operational step, not a spec change.
- **PDPL review gains urgency here.** Release 1 read personal data; this feature creates and alters
  employee records. The review commissioned for Release 1 must cover write processing before any
  production write use.
- **Jisr's documentation remains untrusted until probed.** Four documented-versus-live divergences
  in feature 001 make live contract verification a per-tool release gate, not a nicety.

## Dependencies

- Feature `001-jisr-mcp-server` at v0.1.0 — the authorization model, field policy, audit trail,
  capability reporting, and adapters this feature extends.
- A Jisr API key with write permissions for each domain under test, granted for controlled windows.
- Answers still outstanding from Jisr that writes make material: idempotency and duplicate-handling
  behaviour for employee creation and journal posting, and attendance-log creation time-zone
  semantics (recorded in the baseline plan's Open Questions).
- PDPL legal review covering write processing, before production use.

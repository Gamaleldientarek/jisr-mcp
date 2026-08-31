# Quickstart & Validation: Controlled Writes

**Feature**: `002-controlled-writes` | Extends feature 001's guide; reads unchanged.

## Enabling writes (each defaults to disabled)

```bash
JISR_WRITE_ATTENDANCE=enabled     # punch creation
JISR_WRITE_EMPLOYEES=enabled      # employee creation
# JISR_WRITE_PAYROLL_DELETE=enabled   # dormant destructive path -- leave off
```

The Jisr key must also hold the matching write permission; the four-way capability report shows
which gate is failing, per tool.

## Validation scenarios

**W1 — Dormancy (SC-002, SC-006)**: with no write flags set, `tools/list` under every profile
contains zero write tools; the payroll pair stays absent even with all other flags on.

**W2 — Prepare/confirm round trip (SC-001)**: punch create against a stubbed upstream: prepare
returns preview + reference; commit without the reference refuses `WRITE_CONFIRMATION_REQUIRED`;
with an invented reference refuses; with the server's reference succeeds and returns the re-read.

**W3 — Expiry and single-use (SC-003, SC-005)**: commit at +5m01s refuses
`WRITE_PREPARATION_EXPIRED`; a second commit on a consumed reference refuses; the duplicate guard
flags an identical re-prepare within 10 minutes.

**W4 — Backdating (FR-013a)**: a punch dated before the previous calendar month refuses at prepare
with `BACKDATING_WINDOW_EXCEEDED`.

**W5 — Employee validation (FR-014/015)**: unknown `departmentId` refuses at prepare; single-part
name refuses; a code matching an existing employee produces `duplicateWarning`, and commit without
`acknowledgeDuplicates` refuses.

**W6 — Target drift (US3)**: with the deletion flag on in tests, mutate the stubbed transaction
between prepare and commit → `WRITE_TARGET_CHANGED`.

**W7 — Ambiguity honesty (FR-009)**: stub a timeout after submission → `WRITE_OUTCOME_UNKNOWN`
naming the read tool to check; assert no automatic retry occurred.

**W8 — Audit completeness (SC-007)**: every prepare, commit, refusal and ambiguous outcome in a
replayed session has a record; deletion records carry the reason.

**W9 — LIVE WINDOW (SC-009, gates enablement; human present)**: per `research.md` W6 — widen the
key, verify punch + employee creation against real Jisr with test data, record results in
`docs/write-contract-verification.md`, narrow the key. Answers the four open contract questions
(`emp_code` type, punch `id`, zone handling, `id: null`). **No write tool is enabled anywhere
before its section of that document is filled in.**

## Release gate

W1–W8 green in CI; W9 recorded per enabled tool; adapter parity holding across the six new tools;
constitution Principle VII satisfied with evidence, not assertion.

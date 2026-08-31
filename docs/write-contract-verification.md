# Write contract verification

Feature 002 (spec FR-012, SC-009). **No write tool may be enabled in any environment before its
section below carries live verification evidence.** The write schemas are built from Jisr's
documented prose tables; four contract facts could not be verified without executing writes, and
writes are never executed against live Jisr during development. This document is where the live
window closes that gap.

## The live verification window (research W6)

Human-present, bounded, and reversible:

1. A Jisr administrator widens the API key for the domains under verification (attendance write;
   employee write) for a bounded window.
2. `JISR_WRITE_ATTENDANCE` / `JISR_WRITE_EMPLOYEES` are enabled **only in the verification
   session**, never in a shared configuration.
3. Punch creation is verified against a **test employee** and a time already inside the
   current/previous-month window.
4. Employee creation is verified with an **obviously fictional person**. Jisr documents no employee
   delete: the test record persists, and AZMX is flagged that it exists (data hygiene is theirs to
   apply).
5. Results — requests, responses, re-reads, and the answers to the open questions below — are
   recorded here.
6. The key is narrowed back and the flags disabled. Only then may an operator decide to enable a
   write domain for real use.

Payroll deletion is verified only if AZMX ever activates it, against a transaction created for the
purpose.

## Open contract questions the window must answer

| #   | Question                                                                                                            | Where it bites                                             |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Q1  | What does the `id` field on a punch submission mean upstream (idempotency handle? terminal record id?)              | `PunchSubmission.id` is sent as a fresh per-prepare handle |
| Q2  | Does `POST /attendance_logs` accept an alphanumeric `emp_code` (live tenant uses `AZMX117`; docs say Integer)?      | `emp_code` is sent as-is                                   |
| Q3  | Does the punch-create acknowledgment ever carry a body beyond `{ success, message, data: null }`?                   | `punchCreateResponseSchema` accepts null or a loose object |
| Q4  | Does the employee-create response really return `id: null` (docs example), making the re-read the only UUID source? | `commit` reports `idSource`                                |

## Evidence

### `jisr_attendance_punch_create_prepare` / `jisr_attendance_punch_create_commit`

> _No evidence yet. This pair MUST NOT be enabled anywhere._

- Window date/time (UTC+3):
- Key scope during window:
- Test employee (code only):
- Prepare request/preview:
- Commit result (re-read state):
- Q1 answer:
- Q2 answer:
- Q3 answer:
- Timed end-to-end punch correction conversation (SC-008 target: under 3 minutes):
- Key narrowed back at:

### `jisr_employee_create_prepare` / `jisr_employee_create_commit`

> _No evidence yet. This pair MUST NOT be enabled anywhere._

- Window date/time (UTC+3):
- Key scope during window:
- Fictional test person (code only):
- Prepare preview (lookups resolved, duplicate check):
- Commit result (`idSource`, re-read record):
- Q4 answer:
- AZMX flagged about the persisting test record (date, channel):
- Key narrowed back at:

### `jisr_payroll_transaction_delete_prepare` / `jisr_payroll_transaction_delete_commit`

> _No evidence yet. DORMANT — verified only if AZMX ever activates this path, against a
> transaction created for the purpose._

- Window date/time (UTC+3):
- Transaction created for the purpose (id):
- Prepare preview (full transaction):
- Commit result (absence confirmed by re-read):
- Key narrowed back at:

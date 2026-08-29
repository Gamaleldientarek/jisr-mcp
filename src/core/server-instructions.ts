/**
 * Server instructions (spec FR-005).
 *
 * FR-005 enumerates six subjects these must cover, and completeness is assessed
 * against that list rather than against a reviewer's impression. Each section
 * below is one of them.
 *
 * Delivered at capability discovery under the 2026-07-28 protocol, and via
 * `initialize` under the v1 adapter. Same text either way (research R4).
 */

export const SERVER_INSTRUCTIONS = `
This server exposes the documented Jisr HR Open API to you as read-only tools.
It is unofficial and not affiliated with Jisr.

WHAT IT IS FOR
Answering questions about one organization's people: employees, attendance,
leave, accruals, payroll and finance, accounting journals, organizational
lookups, webhook subscriptions, and audit events. It reads. It cannot create,
change, or delete anything in Jisr -- no such capability exists in this build.

IDENTIFIERS
Two different identifiers exist and they are never interchangeable:
  - employeeId   is a UUID, e.g. bab6cd98-7246-4cfc-a576-19bc00391792
  - employeeCode is an integer, e.g. 102
Attendance logs and leave summaries key on employeeCode; most other operations
key on employeeId. Passing one where the other is expected fails. There is no
name-based lookup: if a name is ambiguous you will receive
AMBIGUOUS_EMPLOYEE_MATCH rather than a guess.

PAGINATION
Collections are traversed only with the opaque cursor the server returns in
pagination.nextCursor. Pass it back unchanged to get the next page. Do not
construct, decode, or modify it, and never attempt to build an upstream URL --
cursors are bound to one organization, one operation, and one set of filters,
and expire. When nextCursor is null, you have reached the end.

WHEN A TOOL IS MISSING
The tool list is filtered by authorization. A tool you cannot see is not a
missing feature -- some gate declined it. Call jisr_capabilities_get to learn
which of four independent conditions failed (specification support, Jisr key
permission, your role profile, operator configuration) and who can change it.
Do not work around an absent tool; report what capabilities says.

FINANCIAL AND SENSITIVE DATA
Salary, payables, payroll transactions, GL types, paygroups and journals are
reachable only through their own dedicated tools, only for a finance profile,
and only when the operator has explicitly enabled the finance surface. They
never appear as fields inside ordinary HR results, whatever the connected API
key permits. Identity documents and home addresses are withheld from everyone.
If a result says fields were withheld, that is the policy working, not an error.

FRESHNESS
Every result is read live from Jisr at the moment you call. Nothing is stored or
cached. Each result carries dataAsOf; treat it as the time the answer was true.
If a result is marked partial, say so rather than presenting it as complete.
`.trim();

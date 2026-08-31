# Handoff — jisr-mcp

**As of 2026-08-31.** Feature 002 (controlled writes) is merged to `main`. Reads
are live against the AZMX tenant; the three writes are built, tested, and
**dormant** — nothing can write until the human-present verification window
produces evidence.

---

## What this is

An MCP server exposing the documented Jisr HR Open API to any MCP client.
**23 read tools** covering all 20 documented Jisr read operations plus three
discovery tools, and — since feature 002 — **six write tools** forming three
prepare/commit pairs, every one disabled by default. Runs against live Jisr —
no database, no queue, no workers.

Unofficial; not affiliated with Jisr.

Built spec-first with GitHub Spec Kit. Feature 001 (reads) lives in
[`specs/001-jisr-mcp-server/`](specs/001-jisr-mcp-server/), feature 002
(writes) in [`specs/002-controlled-writes/`](specs/002-controlled-writes/), and
the governing principles in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md). **Read
the constitution before changing anything** — three of its seven principles are
non-negotiable and the code is shaped by them.

## State

|                                   |                                                             |
| --------------------------------- | ----------------------------------------------------------- |
| Feature 001 (reads)               | Complete, released as v0.1.0, live                          |
| Feature 002 (writes)              | 35 of 37 tasks; merged via PR #3; T036 + T037 remain        |
| Tests                             | 406 passing, 42 files                                       |
| Typecheck / lint / format / build | green                                                       |
| Endpoint coverage gate            | green — 29 documented operations, 3 writes bound (pinned)   |
| Latest release                    | v0.1.0 — **v0.2.0 is gated on live-window evidence (T036)** |

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run verify:coverage
```

## Current state: reads LIVE, writes DORMANT

Connected to the AZMX tenant and registered in Claude Code at user scope as
`jisr` via `bin/jisr-mcp-local.sh`, which sources credentials from
`~/.claude/.secrets/jisr-mcp.env` so they never enter any client config.

- Live wire (read-only): `python3 scripts/e2e-protocol-test.py mcp-v2` — 12/12
  on both adapters. The live server lists **15 tools for hr_operations and zero
  write tools** — a disabled write domain is absent, not refused.
- Write round trip (stubbed upstream, no request leaves the process):
  `python3 scripts/e2e-protocol-test.py mcp-v2 --write-stub` — 11/11 on both
  adapters. The stub is injected as a replacement `fetch` via
  `NODE_OPTIONS --import scripts/e2e-write-stub.mjs`, so the approved-host
  validation on `JISR_BASE_URL` stays in force.

### The write contract (feature 002)

Every write is a pair. `*_prepare` validates and previews without touching Jisr
and returns a single-use HMAC confirmation reference (5-minute TTL, bound to
organization + caller + operation + target, payload stashed server-side so it
cannot vary after preview). `*_commit` takes only that reference and reports
the state **re-read from Jisr**, never an echo. Ambiguous outcomes surface as
`WRITE_OUTCOME_UNKNOWN` and are never auto-retried; identical payloads inside
10 minutes refuse until acknowledged.

| Pair                                | Flag                        | Profile                                                 |
| ----------------------------------- | --------------------------- | ------------------------------------------------------- |
| `jisr_attendance_punch_create_*`    | `JISR_WRITE_ATTENDANCE`     | `hr_operations`                                         |
| `jisr_employee_create_*`            | `JISR_WRITE_EMPLOYEES`      | `hr_operations`                                         |
| `jisr_payroll_transaction_delete_*` | `JISR_WRITE_PAYROLL_DELETE` | `finance` — destructive, also needs the finance surface |

**Employee UPDATE does not exist** — deliberately. Changing an existing
record's fields (title, salary, department) has no tool, no client path, no
code path. If wanted, it is a feature 003 through the full Spec Kit flow.

## Open, with owners

| #   | Item                                                                  | Owner                   | Blocks                     |
| --- | --------------------------------------------------------------------- | ----------------------- | -------------------------- |
| 1   | **T036 live verification window** (~30 min, procedure below)          | **Jimmy** + Jisr admin  | Enabling any write; v0.2.0 |
| 2   | T037 — CHANGELOG + tag v0.2.0                                         | after T036              | —                          |
| 3   | Claude Desktop / Cursor / Codex manual client verification (001 T110) | **Jimmy**               | Five-client checklist      |
| 4   | PDPL legal review — must now also cover write processing (001 T122)   | **Jimmy** to commission | Production use             |

**Still open with Jisr:** is there a permission-discovery endpoint? Without
one, capability reporting says `unknown` rather than inventing a fact.

### The live window (T036)

Full procedure and empty evidence sections:
[`docs/write-contract-verification.md`](docs/write-contract-verification.md).
In short: a Jisr admin widens the API key for a bounded window; punch creation
is verified against a test employee, employee creation with an obviously
fictional person; the four open contract questions in that document are
answered; evidence is recorded; the key is narrowed back. **No write flag may
be enabled in any environment before the pair's evidence section is filled**
(SC-009). Note: Jisr documents no employee delete — the fictional test record
persists and AZMX must be flagged.

## Things you would otherwise rediscover the hard way

**The employee list leaks salary, and the Jisr permission does not stop it.**
Jisr returns `basic_salary`, pay dates and an undocumented `bank` object inside
the _ordinary_ employee list even when the key lacks financial permission
(verified live 2026-08-30; the same key's attendance exclusion correctly 403s).
The mapper's allowlist is therefore the **only** thing keeping payroll and
banking details out of an ordinary listing.
`tests/field-policy/employee-list-financial-leak.test.ts` is the most important
test in the repo. Never relax it on the grounds that the key lacks the
permission.

**A server restart invalidates outstanding confirmation references — on
purpose.** The signing key and the stashed payloads are per-process. A
reference must not outlive its preview's truth; the remedy is always "prepare
again".

**`PunchSubmission.id` has an unverified upstream meaning** (possibly Jisr's
own idempotency handle). A fresh per-prepare handle is sent; question Q1 in the
verification document decides what it really is. Same for alphanumeric
`emp_code` (Q2) and the `id: null` employee-create response (Q4).

**The write response envelope carries `data: null` on success.** The write
schemas accept null or a loose object; a strict object schema here turns every
successful write into `WRITE_OUTCOME_UNKNOWN`.

**Webhook subscriptions carry third-party secrets.** `auth_data` and
`custom_header` commonly hold a bearer token for a _downstream_ system.
Classified `authentication_secret`, which no profile can ever receive.

**`businiess_trip_days` is spelled that way upstream.** Mapped verbatim and
deliberately.

**Audit events paginate with `total_count`**, where every other Jisr collection
uses `total_entries`.

**Jisr errors come back in Arabic** and Jisr validates the slug _before_ the
key. A "company name is incorrect" error means the slug, not the credential.

**`src/core/` must never import an MCP SDK.** Lint-enforced and separately
asserted in `tests/unit/core-boundary.test.ts`.

**Two protocol adapters, one core.** v2 (2026-07-28) is default; v1
(2025-11-25) exists until clients migrate. Parity now extends to the write
tools, with the registration plan's config shape pinned so no MRTR/elicitation
surface can appear on one adapter silently.

**Node development will not work inside Google Drive.** `npm install` fails
with `EPERM`. The canonical repo is `~/Projects/jisr-mcp`; the Drive copy is
stale and abandoned.

**`main` is PR-only.** The `protect-main` ruleset requires a PR with `verify`
and `secret-scan` green. Direct pushes are rejected, including for docs.

## Regenerate, don't hand-edit

```bash
npm run docs:generate     # docs/authorization-matrix.md, docs/endpoint-coverage.md
npm run snapshot:jisr     # check the live Jisr spec for divergence (writes nothing without --write)
npm run verify:coverage   # implemented surface vs approved snapshot
npm run verify:release    # tag, version, changelog, protocol and snapshot versions agree
```

## Where things are

|                             |                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Reads: spec, plan, tasks    | `specs/001-jisr-mcp-server/`                                                               |
| Writes: spec, plan, tasks   | `specs/002-controlled-writes/` (T036/T037 unchecked in `tasks.md`)                         |
| Write verification evidence | `docs/write-contract-verification.md` — empty until the live window                        |
| Governing principles        | `.specify/memory/constitution.md`                                                          |
| Original brief              | `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` (Decision Log at §30 records every material choice) |
| Who can call what           | `docs/authorization-matrix.md` (✏️ marks flag-gated write tools)                           |
| Client setup                | `README.md`                                                                                |

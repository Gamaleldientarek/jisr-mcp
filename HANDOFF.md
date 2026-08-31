# Handoff — jisr-mcp

**As of 2026-08-29.** Everything buildable is built. What remains needs a Jisr
credential or a decision.

---

## What this is

An MCP server exposing the documented Jisr HR Open API to any MCP client. **Read
only.** 23 tools covering all 20 documented Jisr read operations plus three
discovery tools. Runs against live Jisr — no database, no queue, no workers.

Unofficial; not affiliated with Jisr.

Built spec-first with GitHub Spec Kit. The specification, plan, task breakdown
and analysis live in [`specs/001-jisr-mcp-server/`](specs/001-jisr-mcp-server/),
and the governing principles in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md). **Read the
constitution before changing anything** — three of its seven principles are
non-negotiable and the code is shaped by them.

## State

|                                   |                                        |
| --------------------------------- | -------------------------------------- |
| Tasks                             | 118 of 123                             |
| Tests                             | 324 passing, 31 files                  |
| Typecheck / lint / format / build | green                                  |
| Endpoint coverage gate            | green — 29 of 29 documented operations |
| Commits                           | 25, all conventional                   |

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run verify:coverage
```

## Current state: LIVE and registered

Connected to the AZMX tenant (2026-08-31) and registered in Claude Code at user
scope as `jisr` via `bin/jisr-mcp-local.sh`, which sources credentials from
`~/.claude/.secrets/jisr-mcp.env` so they never enter any client config.

Both adapters pass the full end-to-end protocol test against live data:

    set -a; source ~/.claude/.secrets/jisr-mcp.env; set +a
    npm run build
    python3 scripts/e2e-protocol-test.py mcp-v1   # 12/12
    python3 scripts/e2e-protocol-test.py mcp-v2   # 12/12

Working live: employees, basic info, leave summary, all six lookups, the three
discovery tools, and the manager profile (verified: 5 of 100 records for a
manager with 4 reports). Attendance is deliberately excluded on the key (clean
403). Accruals needs a paygroup id, which is finance-gated.

Credentials template, outside the repo: `~/.claude/.secrets/jisr-mcp.env`

| Value             | Status                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `JISR_BASE_URL`   | ✅ `https://apis.jisr.net/api` — AZMX is AWS-hosted (`azmx.jisr.net`, not `.jisr.net.sa`) |
| `JISR_SLUG`       | ✅ `azmx`                                                                                 |
| `JISR_API_KEY`    | ❌ needs a Jisr admin                                                                     |
| `JISR_API_SECRET` | ❌ shown once, at key creation                                                            |

A Jisr admin creates it under **Settings → Webhook & API Keys → API Keys → Add
New API Key**, with **core HR read only** permissions.

```bash
set -a; source ~/.claude/.secrets/jisr-mcp.env; set +a
cd ~/Projects/jisr-mcp
npm run build && npm run verify:mcp
npx @modelcontextprotocol/inspector node dist/bin/jisr-mcp.js
```

That clears three Definition-of-Done items and the whole five-client checklist.

## Open, with owners

| #   | Item                                             | Owner                   | Blocks                                                                         |
| --- | ------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------ |
| 1   | Jisr API credentials                             | AZMX admin              | All live verification                                                          |
| 2   | Licence                                          | **Jimmy**               | Publication. `verify-release` refuses while `package.json` says `UNLICENSED`   |
| 3   | Publisher of record — personal, Zone 99, or AZMX | **Jimmy**               | `@OWNER` placeholders in CODEOWNERS, SECURITY.md, issue config                 |
| 4   | PDPL legal review                                | **Jimmy** to commission | Production use, regardless of path                                             |
| 5   | GitHub repo + branch protection                  | **Jimmy**               | Settings ready in [`docs/repository-settings.md`](docs/repository-settings.md) |

**Two questions for Jisr**, both with lead time:

1. **What is `line_manager.id`** — employee UUID, numeric id, or code? Jisr does
   not document it. Reachability compares both UUID and code and excludes
   anything matching neither. **The manager profile should not be trusted in
   production until this is answered.**
2. **Is there a permission-discovery endpoint?** Without one, capability
   reporting says `unknown` rather than inventing a fact.

## Things you would otherwise rediscover the hard way

**The employee list leaks salary, and the Jisr permission does not stop it.**
Jisr returns `basic_salary`, `first_salary_pay_date`, `last_salary_pay_date` and
an undocumented `bank` object inside the _ordinary_ employee list. Their
documentation says these are omitted when the key lacks financial permission.
**Verified live on 2026-08-30: they are not.** Excluding attendance on the same
key does correctly produce a 403, so exclusions work in general — the employee
list just does not honour the field-level rule.

The mapper's allowlist is therefore the **only** thing keeping payroll and
banking details out of an ordinary listing, not a second line of defence.
`tests/field-policy/employee-list-financial-leak.test.ts` is the most important
test in the repo; it was mutation-checked (bypassing the finance gate fails 12 of
18 assertions). Never relax it on the grounds that the key lacks the permission.

**Webhook subscriptions carry third-party secrets.** `auth_data` and
`custom_header` commonly hold a bearer token for a _downstream_ system. Classified
`authentication_secret`, which no profile can ever receive.

**`businiess_trip_days` is spelled that way upstream.** Mapped verbatim and
deliberately. A future Jisr fix should surface as a mapping failure, not a
silently missing value.

**Audit events paginate with `total_count`**, where every other Jisr collection
uses `total_entries`.

**Jisr errors come back in Arabic** and Jisr validates the slug _before_ the key.
A "company name is incorrect" error means the slug, not the credential. No
upstream body ever reaches a caller — verified against the live endpoint.

**`src/core/` must never import an MCP SDK.** Lint-enforced and separately
asserted in `tests/unit/core-boundary.test.ts`. That one rule delivers the
hosted-deployment seam, dual-SDK support, and the guarantee an adapter cannot
bypass authorization.

**Two protocol adapters, one core.** v2 (2026-07-28) is default; v1 (2025-11-25)
exists only until clients migrate, and its deletion trigger is written into
`src/adapters/mcp-v1/index.ts`.

**Node development will not work inside Google Drive.** `npm install` fails with
`EPERM` — Drive permits file creation but blocks deletion. The repo was moved out
for this reason; the Drive copy is stale and abandoned.

## Regenerate, don't hand-edit

```bash
npm run docs:generate     # docs/authorization-matrix.md, docs/endpoint-coverage.md
npm run snapshot:jisr     # check the live Jisr spec for divergence (writes nothing without --write)
npm run verify:coverage   # implemented surface vs approved snapshot
npm run verify:release    # tag, version, changelog, protocol and snapshot versions agree
```

## Where things are

|                               |                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Spec, plan, tasks, checklists | `specs/001-jisr-mcp-server/`                                                               |
| Governing principles          | `.specify/memory/constitution.md`                                                          |
| Original brief                | `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` (Decision Log at §30 records every material choice) |
| What still blocks release     | `docs/definition-of-done.md`                                                               |
| Who can call what             | `docs/authorization-matrix.md`                                                             |
| Client setup                  | `README.md`                                                                                |

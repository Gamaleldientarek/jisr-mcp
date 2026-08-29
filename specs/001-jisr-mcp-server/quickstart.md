# Quickstart & Validation Guide

**Feature**: `001-jisr-mcp-server` | **Date**: 2026-08-29

How to run the server and prove it works. Scenarios map to spec user stories and success criteria.
Implementation detail belongs in `tasks.md` — this is a run-and-verify guide.

---

## Prerequisites

- **Node.js ≥ 20** (required by `@modelcontextprotocol/core` 2.0.0).
- A **Jisr organization with Open API access** and an administrator who can issue credentials via
  *Settings → Webhook & API Keys → API Keys → Add New API Key*. The secret is shown **once**.
- One MCP client. Validation targets at least five (spec SC-006).
- No database, queue, or other service. Needing one is a bug (spec FR-045, SC-001).

### Credential posture — read before creating a key

Create **two** keys, not one:

| Key | Permissions | Used for |
|---|---|---|
| `JISR_API_KEY` | Core HR read only | Everyday operation |
| Finance key (optional) | Adds *Get Employee Financial Info* | Only when the finance surface is enabled |

This is not ceremony. The employee list returns `basic_salary`, `first_salary_pay_date`, and
`last_salary_pay_date` whenever the connected key holds finance permission (research R2). The server
strips them for non-finance callers, but a narrow key means those values never cross the network at
all. Defence in depth, not a substitute for the field policy.

---

## Run it

```bash
npx jisr-mcp            # stdio, no install, no build step
```

Configuration is environment-supplied:

```bash
JISR_BASE_URL=https://apis.jisr.net/api   # or https://api.jisr.net.sa/api/ for locally hosted
JISR_SLUG=your-organization-slug
JISR_API_KEY=...
JISR_API_SECRET=...
JISR_ROLE_PROFILE=hr_operations           # one of the seven profiles
JISR_FINANCE_SURFACE=disabled             # explicit opt-in; see below
```

Which base URL: if your Jisr web address ends in `.jisr.net.sa` you are locally hosted; otherwise
AWS. The value is validated against those two documented hosts and rejected otherwise.

### Enabling the finance surface

```bash
JISR_FINANCE_SURFACE=enabled
JISR_FINANCE_API_KEY=...        # recommended: the separate finance-scoped key
JISR_FINANCE_API_SECRET=...
```

Without this, the six financial tools do not appear — even if the key permits them (spec FR-023a).

---

## Validation scenarios

### V1 — Ten minutes, cold start (spec SC-001, User Story 1)
On a machine with no project knowledge, follow only the published README to a first successful
answer. **Pass**: under 10 minutes, no source reading, no service installed.

### V2 — Startup failures are actionable (User Story 1, scenario 3)
Start with each of: missing slug, wrong secret, unapproved base URL.
**Pass**: each names the specific setting and the fix. **Fail**: any stack trace, or any echo of a
credential value.

### V3 — Complete read coverage (spec SC-002, User Story 2)
```bash
npm run verify:coverage     # manifest vs. snapshot
npx @modelcontextprotocol/inspector
```
**Pass**: 20 read tools + 3 discovery tools listed; every snapshot read operation bound; no generic
request, arbitrary-path, or arbitrary-URL tool; all 8 write operations present in the manifest as
`release: 2` with no tool.

### V4 — The salary-leak case (spec SC-013, research R2) — **the most important test**
Configure a **finance-permissioned** key with a **non-finance** role profile and
`JISR_FINANCE_SURFACE=disabled`. Call `jisr_employees_list`.
**Pass**: zero occurrences of `basicSalary`, `firstSalaryPayDate`, `lastSalaryPayDate`; redaction
noted in `warnings[]`; no financial tool in `tools/list`.
**Fail**: any salary value reaching the caller. This is the failure the whole field policy exists
to prevent.

### V5 — Authorization matrix (spec SC-004, User Story 3)
Run every role profile against all 23 tools.
**Pass**: each cell matches expectation; denied capabilities are **absent from `tools/list`**, not
merely refused on call; refusals never reveal whether a record exists.

### V6 — No secrets anywhere (spec SC-003)
Run the full suite with debug logging on, then grep every output, log, trace, and artifact for the
key, secret, and access token.
**Pass**: zero occurrences. This is a build-failing assertion, not a review item.

### V7 — Pagination to exhaustion (spec SC-008)
Traverse a full employee collection.
**Pass**: no response exceeds the published page cap; the caller never constructs an upstream
address; `pageSize` above 100 yields `PAGE_SIZE_EXCEEDED`; a cursor replayed after expiry, tampered
with, or bound to another operation is refused with the right distinct code.

### V8 — Drift is caught, not passed through (spec SC-009)
Inject an unknown field into a fixture response.
**Pass**: field withheld, drift recorded, `isPartial` set when safe handling is not guaranteed.
**Fail**: the field reaching the caller.

### V9 — Tool-list caching cannot cross principals (research R5)
Two principals with different authorization, in sequence, exercising `tools/list` caching.
**Pass**: neither observes the other's tool list under any caching behaviour.

### V10 — Arabic renders and round-trips (User Story 2, scenario 4)
Retrieve employees whose names are recorded in Arabic.
**Pass**: `full_name_ar` returned intact alongside `full_name_en`, correct encoding, no
transliteration, usable in a follow-up lookup.

### V11 — Five clients, no special-casing (spec SC-006)
Connect from Claude Code, Claude Desktop, Cursor, a ChatGPT/Codex-family client, and MCP Inspector,
across both adapters.
**Pass**: identical tool surface and behaviour, zero client-specific code paths.

### V12 — Degradation is honest (edge cases)
Simulate Jisr unreachable, a 429, and token expiry mid-pagination.
**Pass**: distinct `JISR_TEMPORARILY_UNAVAILABLE` / `JISR_RATE_LIMITED` errors — never an empty
success; at most one re-authentication, with no refresh loop.

### V13 — One session, four domains (spec SC-010)
Answer questions spanning at least four Jisr domains in a single session.
**Pass**: four distinct domains answered, field policy holding across all of them, one access
token reused throughout, and every answer stating its freshness.

---

## Release gate

All thirteen scenarios pass, plus the Definition of Done in
`JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` §27 and the constitution's Principle VII: no completion claim
without passing tests, a green coverage gate, and Inspector validation on **both** adapters.

Two gates sit outside the codebase and cannot be closed by testing: **qualified PDPL legal review**,
and a **published license decision** before the repository goes public.

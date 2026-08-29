# Result Envelope, Cursors, and Error Model

**Feature**: `001-jisr-mcp-server` | Satisfies spec FR-030 – FR-036.

## Result envelope

Every read tool returns `structuredContent` in this shape, plus a short human-readable `content`
summary (spec FR-032).

```json
{
  "operation": "jisr_employees_list",
  "source": "live_jisr",
  "organizationId": "internal-org-id",
  "dataAsOf": "2026-08-29T12:00:00Z",
  "isStale": false,
  "isPartial": false,
  "records": [],
  "pagination": { "nextCursor": null, "pageSize": 50 },
  "warnings": []
}
```

- `source` has one possible value this release. It is present anyway so a later synchronized store is
  additive rather than breaking (spec FR-045), and so no caller can ever mistake stored data for live
  (spec FR-031).
- `isPartial` is set when drift, a bulk split, or a field-policy redaction means the answer is not the
  complete upstream picture.
- `warnings[]` carries non-fatal notes — a redacted field group, a split bulk request, detected drift.
- For financial tools, organization and principal metadata are omitted beyond what the caller needs.

### Four distinguishable non-success states (spec FR-036)

| State | Shape |
|---|---|
| Empty | `records: []`, `isPartial: false`, no error |
| Partial | `records: [...]`, `isPartial: true`, reason in `warnings` |
| Stale | `isStale: true` with `dataAsOf` in the past — unreachable this release, contract fixed now |
| Unavailable | Error result, never an empty success |

## Cursors

Opaque, integrity-protected, expiring. Binds and verifies on every use:

```text
organizationId | operationId | upstream page | hash(approved filters) | expiry
```

Rules: never contains a credential; never accepts a caller-supplied upstream address; a mismatch on
any bound element is refused. `page`/`rpp` are Jisr's own offset pagination (`rpp` max **100**) and
are never surfaced.

| Failure | Code |
|---|---|
| Malformed or tampered | `INVALID_CURSOR` |
| Past expiry | `CURSOR_EXPIRED` |
| Different organization | `ORGANIZATION_MISMATCH` |
| Different operation or filters | `INVALID_CURSOR` |

## Error model

```json
{
  "code": "JISR_CAPABILITY_NOT_ENABLED",
  "message": "The connected Jisr API key does not permit employee financial information.",
  "retryable": false,
  "suggestedAction": "Ask a Jisr administrator to review the API key permissions."
}
```

Never exposes upstream stack traces, response bodies, query text, tokens, or secrets (spec FR-035).

| Group | Codes |
|---|---|
| Connection | `JISR_CONNECTION_NOT_CONFIGURED`, `JISR_CONNECTION_DISABLED`, `JISR_AUTHENTICATION_FAILED` |
| Permission | `JISR_PERMISSION_DENIED`, `JISR_CAPABILITY_NOT_ENABLED`, `FINANCE_ACCESS_REQUIRED`, `RECORD_NOT_AUTHORIZED` |
| Upstream | `JISR_RATE_LIMITED`, `JISR_TEMPORARILY_UNAVAILABLE`, `JISR_RESPONSE_INVALID`, `JISR_SCHEMA_DRIFT_DETECTED` |
| Lookup | `EMPLOYEE_NOT_FOUND`, `RECORD_NOT_FOUND`, `ORGANIZATION_MISMATCH` |
| Input | `INVALID_FILTER`, `INVALID_DATE_RANGE`, `INVALID_CURSOR`, `CURSOR_EXPIRED`, `PAGE_SIZE_EXCEEDED`, `BULK_LIMIT_EXCEEDED`, `AMBIGUOUS_EMPLOYEE_MATCH`, `TIMEZONE_REQUIRED` |
| Surface | `TOOL_NOT_ENABLED` |

`WRITE_*`, `DESTRUCTIVE_*`, and `SYNC_*`/`DATA_*` codes from the baseline plan are deliberately not
defined: no write path and no store exists to raise them (spec FR-012, FR-045).

### Unavailability must be self-explaining (spec FR-016)

Every refusal names which of the four gates failed and who can change it:

| Reason | Code | Suggested action |
|---|---|---|
| Not configured | `JISR_CONNECTION_NOT_CONFIGURED` | Set the connection settings named in the README |
| Key lacks permission | `JISR_CAPABILITY_NOT_ENABLED` | Ask a Jisr administrator to review the key |
| Caller lacks authorization | `JISR_PERMISSION_DENIED` / `FINANCE_ACCESS_REQUIRED` | Request the role profile from the operator |
| Disabled by configuration | `TOOL_NOT_ENABLED` | Operator enables the surface — for finance, the explicit opt-in of FR-023a |

A refusal must never disclose whether the underlying record exists (spec User Story 3, scenario 4).

## Annotations

All 23 tools: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`,
`openWorldHint: false`.

Annotations are protocol **hints** and are not a security control (research R6). The real guarantee
is structural — this release contains no write code path to misannotate — and enforcement lives in
server-side authorization and field policy.

## Tool list caching (spec 2026-07-28)

`tools/list` responses carry `ttlMs` and `cacheScope`. Because the list is filtered per caller
(spec FR-018), `cacheScope` MUST be set so a list can never be served to a different principal, and
`ttlMs` is kept short. Release gate: two principals with different authorization must never observe
each other's tool list under any caching behaviour (research R5).

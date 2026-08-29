# Definition of Done assessment

Against `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` section 27, as of 2026-08-29.
Spec SC-012 requires all applicable items satisfied before the first public
release.

**Verdict: not ready to release.** 12 of 20 met, 4 partially, 2 not met,
2 not applicable to this release.

| #   | Item                                                             | Status | Evidence or gap                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Current Jisr specification snapshot reviewed                     | ✅     | Snapshot committed and parsed; 29 operations verified against the plan with zero divergence                                                                                                                                                                |
| 2   | Endpoint manifest includes all documented operations             | ✅     | 29 of 29; coverage gate fails the build on divergence                                                                                                                                                                                                      |
| 3   | Every documented GET operation has a Release 1 tool              | ✅     | 20 of 20 bound; asserted by the gate and `tests/contract/endpoint-coverage.test.ts`                                                                                                                                                                        |
| 4   | Dynamic tool exposure follows scopes and connection capabilities | ⚠️     | Role and configuration gates work and are tested. **The Jisr key capability probe is not implemented** — every domain reports `permittedByJisrKey: 'unknown'`. Deliberate: Jisr documents no permission-discovery endpoint, so probing would mean guessing |
| 5   | Standard Jisr authentication works for each approved host type   | ⚠️     | Implemented, host-validated, and unit-tested against fixtures. **Never run against a live Jisr organization**                                                                                                                                              |
| 6   | Credentials and tokens encrypted and never exposed               | ⚠️     | Never exposed: 316 tests including a repository-wide scan. **Not encrypted at rest** — they are environment variables, which is the normal posture for a self-hosted stdio server but is not encryption                                                    |
| 7   | Finance tools separated from ordinary HR tools                   | ✅     | Two independent conditions; `tests/field-policy/financial-info.test.ts`                                                                                                                                                                                    |
| 8   | All six role profiles tested                                     | ✅     | Seven profiles x 23 tools, both surface states, in `tests/authorization/role-matrix.test.ts`                                                                                                                                                               |
| 9   | Cross-tenant access tested and rejected                          | ⚠️     | Cursor organization binding is tested and rejects. **A true cross-tenant test needs two organizations**, which this single-organization release cannot construct                                                                                           |
| 10  | Opaque pagination cursors implemented                            | ✅     | HMAC-signed, bound, expiring; `tests/security/cursor.test.ts`                                                                                                                                                                                              |
| 11  | Source and normalized modes controlled                           | ➖     | Source mode is not implemented. Out of scope for this release; normalized is the only mode                                                                                                                                                                 |
| 12  | Unknown future fields not automatically exposed                  | ✅     | Allowlist mapping plus drift detection; `tests/integration/schema-drift.test.ts`                                                                                                                                                                           |
| 13  | MCP Streamable HTTP endpoint is authenticated                    | ❌     | **Not met.** Only stdio ships. The HTTP transport belongs to the deferred hosted deployment                                                                                                                                                                |
| 14  | Read/write/destructive annotations correct                       | ✅     | All 23 read-only; enforced at registration; `tests/contract/annotations.test.ts`                                                                                                                                                                           |
| 15  | Release 1 passes MCP Inspector validation                        | ❌     | **Not met.** `scripts/verify-mcp.ts` exists and runs, but requires a live Jisr connection this build has never had                                                                                                                                         |
| 16  | Release 2 actions have confirmation, audit, security controls    | ➖     | No Release 2 in this build. The write surface is absent, not disabled                                                                                                                                                                                      |
| 17  | Webhook SSRF and replay controls pass                            | ➖     | No webhook writes. The read-only listing strips stored authentication material                                                                                                                                                                             |
| 18  | Logs contain no secrets or full sensitive records                | ✅     | Fail-closed redaction; audit carries counts, never contents; `tests/security/redaction.test.ts`                                                                                                                                                            |
| 19  | Monitoring, alerts, backup, incident procedures active           | ➖     | Not applicable to a self-hosted stdio server with no storage. Metrics are exposed in-process; retention and forwarding of the audit stream are the operator's documented responsibility                                                                    |
| 20  | Privacy, retention, data-transfer requirements documented        | ⚠️     | Classification, exposure rules and the audit posture are documented. **PDPL legal review is outstanding**                                                                                                                                                  |

## What blocks the first release

Three of these need a live Jisr organization, and three need a decision.

**Needs a live connection:**

1. Item 5 — authentication against both host types
2. Item 15 — MCP Inspector validation, both adapters
3. `docs/client-compatibility.md` — the five-client checklist (spec SC-006)

**Needs a decision:**

4. License (T120) — the repository cannot be published without one, and
   `verify-release` refuses to publish while `package.json` says `UNLICENSED`
5. Publisher of record (T121) — personal, agency, or client
6. PDPL legal review (T122) — item 20, and a production gate regardless

**Worth resolving with Jisr:**

- Item 4 — whether any permission-discovery endpoint exists. Until then the
  capability report says `unknown` rather than inventing a fact
- The `line_manager.id` semantics, which gate the manager profile

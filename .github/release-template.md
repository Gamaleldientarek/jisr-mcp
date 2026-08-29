<!--
  Every release records these two facts (spec FR-044). An adopter needs to know
  which protocol their client must speak, and which Jisr specification the build
  was actually verified against. A server built against a stale snapshot may be
  wrong in ways nobody has looked for.
-->

## Compatibility

|                             |                                                                |
| --------------------------- | -------------------------------------------------------------- |
| MCP protocol                | 2026-07-28 (default), 2025-11-25 via `JISR_MCP_ADAPTER=mcp-v1` |
| Jisr specification snapshot | `2026-08-29`                                                   |
| Node.js                     | 20 or newer                                                    |

## Verified before release

- [ ] Full test suite
- [ ] Endpoint coverage gate
- [ ] MCP Inspector, both adapters
- [ ] Claude Code, Claude Desktop, Cursor, Codex

## Security-relevant changes

_None, or list them. Anything touching authorization, field policy, credential
handling, or the audit trail belongs here._

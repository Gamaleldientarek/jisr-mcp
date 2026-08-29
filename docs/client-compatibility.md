# Client compatibility

Spec SC-006: verified working against at least five independent MCP clients with
zero client-specific code paths.

**Status: partially verified.** Configuration formats and adapter construction
are verified. End-to-end connection with a live Jisr organization is not — it
requires credentials this build has never had.

## Verified

|                                            | Result | How                                                                                                                                                                   |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero client-specific code paths            | ✅     | One registration plan and one invocation path in `src/adapters/shared.ts`; each adapter only selects a transport. Asserted by `tests/contract/adapter-parity.test.ts` |
| Both adapters construct                    | ✅     | Real `McpServer` instances from both SDK lines, in the parity test                                                                                                    |
| Protocol 2026-07-28                        | ✅     | `@modelcontextprotocol/server` 2.0.0, the stable line                                                                                                                 |
| Protocol 2025-11-25                        | ✅     | `@modelcontextprotocol/sdk` 1.30.0, compatibility adapter                                                                                                             |
| Server starts and serves over stdio        | ✅     | `scripts/verify-mcp.ts`                                                                                                                                               |
| Nothing written to stdout before a request | ✅     | `scripts/verify-mcp.ts`                                                                                                                                               |

## Configuration formats

Verified against each vendor's own documentation, not from memory.

| Client         | Mechanism                               | Path                                           | Verified  |
| -------------- | --------------------------------------- | ---------------------------------------------- | --------- |
| Claude Code    | `claude mcp add`, project or user scope | `.mcp.json` / user config                      | ✅ format |
| Claude Desktop | JSON                                    | `claude_desktop_config.json`                   | ✅ format |
| Cursor         | JSON, supports `envFile` for stdio      | `.cursor/mcp.json` or `~/.cursor/mcp.json`     | ✅ format |
| Codex          | **TOML**, `[mcp_servers.name]`          | `~/.codex/config.toml` or `.codex/config.toml` | ✅ format |
| MCP Inspector  | CLI                                     | n/a                                            | ✅ format |

Codex is the one that differs materially: TOML rather than JSON, so a single
copy-pasteable block cannot serve all clients. The README carries a separate
block for each.

## Not yet verified

Each of these needs a live Jisr organization and a human at a client:

- [ ] Claude Code: connect, list tools, call one, confirm the surface matches the role profile
- [ ] Claude Desktop: same
- [ ] Cursor: same, including `envFile` credential loading
- [ ] Codex: same, via the TOML configuration
- [ ] MCP Inspector: full schema and annotation validation, **both adapters**
- [ ] Confirm the tool surface is identical across all five for the same role profile

Run `npm run verify:mcp` with a live connection first, then work through the
list. Until every box is ticked, SC-006 is not met and the release gate in
`quickstart.md` is not cleared.

# jisr-mcp

An MCP server that exposes the documented Jisr HR Open API read surface to any MCP client —
Claude Code, Claude Desktop, Cursor, Codex, and anything else that speaks the protocol.

> **Unofficial.** This project is not affiliated with, endorsed by, or supported by Jisr. It uses
> only Jisr's publicly documented Open API and never scrapes the web application or calls
> undocumented endpoints.

> **Status: in development.** Not yet published. See [`specs/001-jisr-mcp-server/`](specs/001-jisr-mcp-server/)
> for the specification, plan, and task breakdown driving this build.

## What it does

Release 1 is **read-only** and covers all 20 documented Jisr read operations — employees, attendance,
leave, accruals, payroll and finance, accounting journals, all six lookups, webhooks, and audit
events — plus three discovery tools, as 23 purpose-built tools. There is no generic HTTP tool and no
way to reach an operation outside the documented surface.

It runs against live Jisr data. No database, no queue, no background workers.

## Quick start

_Filled in at T066. See [`specs/001-jisr-mcp-server/quickstart.md`](specs/001-jisr-mcp-server/quickstart.md)
for the current configuration and validation guide._

## Client setup

_Per-client installation for Claude Code, Cursor, Codex, Claude Desktop and MCP Inspector is added at
T067–T070._

## Security

Financial and sensitive-identity tools are hidden unless the operator explicitly enables them, even
when the connected Jisr API key permits them. Credentials never appear in a tool result, log, trace,
or error. See [SECURITY.md](SECURITY.md).

## License

_Not yet chosen. The repository is not public until a license is in place (T118)._

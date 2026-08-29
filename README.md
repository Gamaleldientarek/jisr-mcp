# jisr-mcp

An MCP server that exposes the documented Jisr HR Open API to any MCP client —
Claude Code, Claude Desktop, Cursor, Codex, and anything else that speaks the protocol.

> **Unofficial.** Not affiliated with, endorsed by, or supported by Jisr. It uses only Jisr's
> publicly documented Open API, and never scrapes the web application or calls undocumented
> endpoints.

> **Status: in development.** Not yet published to npm. Picking this up? Start with
> [HANDOFF.md](HANDOFF.md) — current state, what is blocked, and what to do next. The
> specification, plan and task breakdown live in
> [`specs/001-jisr-mcp-server/`](specs/001-jisr-mcp-server/).

## What it does

Release 1 is **read-only** and covers all 20 documented Jisr read operations — employees,
attendance, leave, accruals, payroll and finance, accounting journals, all six lookups, webhooks and
audit events — plus three discovery tools, as 23 purpose-built tools.

There is no generic HTTP tool and no way to reach an operation outside the documented surface. It
runs against live Jisr data: **no database, no queue, no background workers.**

## Prerequisites

- **Node.js 20 or newer.**
- **A Jisr organization with Open API access**, and an administrator who can create API credentials
  under _Settings → Webhook & API Keys → API Keys → Add New API Key_.
- Nothing else. If you find yourself installing a database, that's a bug.

> **The secret is shown once.** If it isn't captured at creation, create a new key.

### Create two keys, not one

| Key                      | Permissions                        | Used for                               |
| ------------------------ | ---------------------------------- | -------------------------------------- |
| `JISR_API_KEY`           | **Core HR read only**              | Everyday operation                     |
| Finance key _(optional)_ | Adds _Get Employee Financial Info_ | Only if you enable the finance surface |

This is not ceremony. Jisr returns `basic_salary`, `first_salary_pay_date` and
`last_salary_pay_date` **inside the ordinary employee list** whenever the connected key holds
finance permission — governed by the key, not by who is asking. This server strips those fields for
non-finance callers, but a narrow key means they never cross the network at all.

## Configuration

```bash
JISR_BASE_URL=https://apis.jisr.net/api   # AWS-hosted
# JISR_BASE_URL=https://api.jisr.net.sa/api/   # locally hosted
JISR_SLUG=your-organization-slug
JISR_API_KEY=...
JISR_API_SECRET=...
JISR_ROLE_PROFILE=hr_operations
```

**Which base URL?** If your Jisr web address ends in `.jisr.net.sa` you are locally hosted;
otherwise AWS. Any other host is rejected at startup.

**Role profiles:** `employee_self`, `manager`, `hr_operations`, `finance`, `integration_admin`,
`auditor`, `platform_operator`. The profile decides which tools you see and which records they
return.

`employee_self` and `manager` are defined relative to a person, so they also need
`JISR_SUBJECT_EMPLOYEE_ID` set to that employee's Jisr UUID. The server refuses to start without
it rather than returning nothing and letting it look like the person manages nobody.

See [`docs/authorization-matrix.md`](docs/authorization-matrix.md) for exactly which tools each
profile gets, and which records.

### Enabling the finance surface

The six financial tools — employee financial information, monthly payables, payroll transactions,
GL transaction types, paygroups and accounting journals — require **two independent conditions**:

1. `JISR_ROLE_PROFILE=finance`, **and**
2. `JISR_FINANCE_SURFACE=enabled`

Either alone is insufficient, and that is deliberate. If key permission alone were enough, the
first operator to create one convenient broad key would expose payroll to every agent connected to
it. With the surface disabled the tools do not appear in the tool list at all — a non-finance
caller cannot discover that payroll tooling exists.

<details>
<summary><strong>Configuration</strong></summary>

```bash
JISR_FINANCE_SURFACE=enabled
JISR_FINANCE_API_KEY=...        # recommended: the separate finance-scoped key
JISR_FINANCE_API_SECRET=...
```

Without this, the six financial tools **do not appear** — even if your Jisr key permits them.
Key permission alone is deliberately not sufficient.
</details>

## Client setup

Configuration formats differ per client. Use the block for yours.

### Claude Code

```bash
# Project scope — shared with your team via .mcp.json
claude mcp add jisr --scope project \
  --env JISR_BASE_URL=https://apis.jisr.net/api \
  --env JISR_SLUG=your-organization-slug \
  --env JISR_API_KEY=... \
  --env JISR_API_SECRET=... \
  --env JISR_ROLE_PROFILE=hr_operations \
  -- npx -y jisr-mcp

# User scope — available in all your projects, config kept outside the repo
claude mcp add jisr --scope user --env ... -- npx -y jisr-mcp
```

Verify with `claude mcp list`.

> **Project scope writes credentials into `.mcp.json`, which is committed.** Prefer `--scope user`,
> or use project scope only with `${VAR}` references rather than literal secrets.

### Cursor

Project-scoped: `.cursor/mcp.json` · Global: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "jisr": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "jisr-mcp"],
      "envFile": ".env"
    }
  }
}
```

Cursor supports `envFile` for stdio servers, so credentials can stay in an untracked `.env` rather
than in the JSON. If you prefer inline, replace `envFile` with an `env` object.

### Codex

Codex uses **TOML, not JSON**. User scope: `~/.codex/config.toml` · Project scope:
`.codex/config.toml` (trusted projects only).

```toml
[mcp_servers.jisr]
command = "npx"
args = ["-y", "jisr-mcp"]

[mcp_servers.jisr.env]
JISR_BASE_URL = "https://apis.jisr.net/api"
JISR_SLUG = "your-organization-slug"
JISR_API_KEY = "..."
JISR_API_SECRET = "..."
JISR_ROLE_PROFILE = "hr_operations"
```

Or via the CLI: `codex mcp add jisr --env JISR_SLUG=... -- npx -y jisr-mcp`.
Verify with `codex mcp list`.

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "jisr": {
      "command": "npx",
      "args": ["-y", "jisr-mcp"],
      "env": {
        "JISR_BASE_URL": "https://apis.jisr.net/api",
        "JISR_SLUG": "your-organization-slug",
        "JISR_API_KEY": "...",
        "JISR_API_SECRET": "...",
        "JISR_ROLE_PROFILE": "hr_operations"
      }
    }
  }
}
```

Restart Claude Desktop afterwards.

### MCP Inspector

```bash
JISR_BASE_URL=... JISR_SLUG=... JISR_API_KEY=... JISR_API_SECRET=... \
JISR_ROLE_PROFILE=hr_operations \
npx @modelcontextprotocol/inspector npx -y jisr-mcp
```

### If your tool list looks wrong

The tool list is **filtered by your role profile and your key's permissions**, so it legitimately
differs between people. Some clients cache it and won't notice a configuration change — restart the
client to refresh.

A missing tool is not a missing feature. Ask `jisr_capabilities_get`: it reports four independent
facts per operation — specification support, Jisr key permission, your role, operator configuration
— and names who can change whichever one declined.

## Protocol versions

Ships two adapters over one core, so it works with clients on either protocol revision:

| Adapter  | Protocol   | Default                       |
| -------- | ---------- | ----------------------------- |
| `mcp-v2` | 2026-07-28 | ✅                            |
| `mcp-v1` | 2025-11-25 | set `JISR_MCP_ADAPTER=mcp-v1` |

Both present identical tools, inputs, outputs, error codes and annotations. The v1 adapter will be
removed once the clients above have migrated.

## Security

- Financial and sensitive-identity tools are **hidden unless the operator explicitly enables them**,
  even when the Jisr key permits them.
- Credentials never appear in a tool result, log, trace, or error.
- Collections are scoped to the records your role can reach, **before** pagination — and no count
  discloses what lies outside it.
- Audit records go to stderr as structured JSON. Nothing is written to disk.

See [SECURITY.md](SECURITY.md) and the governing principles in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Development

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run verify:coverage   # implemented surface vs the approved Jisr spec snapshot
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Not yet chosen. The repository is not public until a license is in place.

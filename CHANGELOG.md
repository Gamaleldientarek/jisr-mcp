# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each released version records the MCP protocol version(s) it supports and the Jisr specification
snapshot it was verified against (spec FR-044).

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-08-29

First implementation. **Not released** — see `docs/definition-of-done.md` for what
still blocks a public release.

**MCP protocol:** 2026-07-28 (default), 2025-11-25 (`JISR_MCP_ADAPTER=mcp-v1`)
**Jisr specification snapshot:** `2026-08-29`

### Added

- 23 read-only tools covering all 20 documented Jisr read operations, plus
  connection status, capability and data-catalog discovery.
- Two MCP protocol adapters over one SDK-free core, presenting an identical
  surface.
- Two independent authorization gates, seven role profiles, and reachable-set
  scoping applied before pagination.
- Allowlist field policy with six data classifications. Financial tools require
  both the finance profile and an explicit operator opt-in.
- Opaque, signed, expiring pagination cursors bound to organization, operation
  and filter set.
- Fail-closed log redaction and a stderr audit trail carrying record counts,
  never record contents.
- Schema drift detection: undeclared upstream fields are withheld and recorded.
- Endpoint coverage gate that fails the build when the implemented surface and
  the approved Jisr snapshot diverge.

### Security

- The employee list returns salary fields whenever the connected Jisr API key
  holds finance permission, regardless of who is asking. The mapper is an
  allowlist and strips them for non-finance callers.
- Webhook subscriptions carry stored authentication material for third-party
  systems. It is classified `authentication_secret`, which no profile can ever
  receive.

<!--
  Release entries are generated at T112. Every entry must carry:
    - MCP protocol version(s) supported
    - Jisr specification snapshot the build was verified against
-->

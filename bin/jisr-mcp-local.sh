#!/bin/bash
# Local launcher for jisr-mcp.
#
# Credentials are sourced from outside the repo and outside any MCP client
# configuration, so `claude mcp list`, committed configs, and process listings
# never carry them.
set -euo pipefail

SECRETS="$HOME/.claude/.secrets/jisr-mcp.env"
if [ ! -f "$SECRETS" ]; then
  echo "jisr-mcp: credentials file not found at $SECRETS" >&2
  exit 78
fi

set -a
# shellcheck disable=SC1090
source "$SECRETS"
set +a

exec node "$HOME/Projects/jisr-mcp/dist/bin/jisr-mcp.js"

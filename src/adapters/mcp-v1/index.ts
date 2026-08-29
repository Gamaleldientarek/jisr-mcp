/**
 * MCP adapter for protocol 2025-11-25 (@modelcontextprotocol/sdk 1.30.0).
 *
 * A compatibility adapter, kept only while part of the client ecosystem has not
 * migrated to 2026-07-28. The v1 line receives bug and security fixes for about
 * six months after v2's release (research R3).
 *
 * DELETION TRIGGER: remove this adapter once all five clients named in spec
 * SC-006 report 2026-07-28 support. Tracked as a release-note item so it does
 * not quietly become permanent.
 *
 * Behaviour here MUST be identical to the v2 adapter (spec FR-002a, SC-014).
 * Everything that could drift lives in ../shared.ts; this file is transport and
 * registration only.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SERVER_INSTRUCTIONS } from '../../core/server-instructions.js';
import { invokeTool, planRegistrations, type AdapterRuntime } from '../shared.js';

export const ADAPTER_ID = 'mcp-v1';
export const PROTOCOL_REVISION = '2025-11-25';

export function createServer(runtime: AdapterRuntime, version: string): McpServer {
  // Under 2025-11-25 the instructions travel in the initialize result rather
  // than through capability discovery. Same text, different delivery point
  // (research R4).
  const server = new McpServer(
    { name: 'jisr-mcp', version },
    { instructions: SERVER_INSTRUCTIONS },
  );

  for (const plan of planRegistrations(runtime)) {
    server.registerTool(
      plan.definition.name,
      {
        title: plan.config.title,
        description: plan.config.description,
        inputSchema: plan.config.inputSchema,
        annotations: plan.config.annotations,
        _meta: plan.config._meta,
      },
      async (args: unknown) => (await invokeTool(runtime, plan.definition.name, args)) as never,
    );
  }

  return server;
}

export async function serve(runtime: AdapterRuntime, version: string): Promise<void> {
  const server = createServer(runtime, version);
  await server.connect(new StdioServerTransport());
}

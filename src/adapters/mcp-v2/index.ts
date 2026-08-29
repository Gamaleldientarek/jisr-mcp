/**
 * MCP adapter for protocol 2026-07-28 (@modelcontextprotocol/server 2.0.0).
 *
 * The default adapter. Verified 2026-08-29: v2 is the stable release line,
 * released alongside the 2026-07-28 spec (research R3).
 *
 * The 2026-07-28 core is stateless -- no initialize handshake, no session id,
 * protocol version and client identity travelling in `_meta` per request. This
 * adapter therefore holds no per-connection state, which is also what makes the
 * deferred hosted deployment possible (research R4).
 */

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { SERVER_INSTRUCTIONS } from '../../core/server-instructions.js';
import {
  invokeTool,
  planRegistrations,
  toolListCacheHint,
  type AdapterRuntime,
} from '../shared.js';

export const ADAPTER_ID = 'mcp-v2';
export const PROTOCOL_REVISION = '2026-07-28';

export function createServer(runtime: AdapterRuntime, version: string): McpServer {
  const cache = toolListCacheHint(runtime);

  const server = new McpServer(
    { name: 'jisr-mcp', version },
    {
      instructions: SERVER_INSTRUCTIONS,
      // The tool list is filtered per caller, so it must never be cached at a
      // shared scope. 'private' is the SDK default; stated explicitly because
      // research R5 made it a release gate rather than an inherited default.
      cacheHints: {
        'tools/list': { ttlMs: cache.ttlMs, cacheScope: cache.cacheScope },
      },
    },
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

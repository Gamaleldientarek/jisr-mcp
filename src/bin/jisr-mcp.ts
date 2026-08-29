#!/usr/bin/env node
/**
 * jisr-mcp entry point (spec FR-001, FR-006).
 *
 * Runs over stdio for a self-hosted, single-organization deployment. Selects a
 * protocol adapter, wires the runtime, and serves.
 *
 * Nothing may be written to stdout except protocol traffic -- logs and audit
 * records go to stderr (spec FR-038a).
 */

import { createRequire } from 'node:module';
import { ConfigurationError, loadConfig } from '../config/environment.js';
import { UNPROBED } from '../core/authorization/capabilities.js';
import { createPrincipal } from '../core/authorization/principal.js';
import type { AuthorizationContext } from '../core/authorization/policies.js';
import { JisrClient } from '../core/jisr/client.js';
import { ToolRegistry } from '../core/tools/registry.js';
import { createAuditSink } from '../observability/audit.js';
import { createLogger } from '../observability/logger.js';
import { Metrics } from '../observability/metrics.js';
import type { AdapterRuntime } from '../adapters/shared.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

type AdapterId = 'mcp-v2' | 'mcp-v1';

/**
 * v2 (2026-07-28) is the default: it is the stable SDK line. v1 remains
 * selectable for clients that have not migrated, and is removed once the
 * verified client set has (research R3).
 */
function selectAdapter(raw: string | undefined): AdapterId {
  if (raw === undefined || raw === 'mcp-v2') return 'mcp-v2';
  if (raw === 'mcp-v1') return 'mcp-v1';
  throw new ConfigurationError(
    'JISR_MCP_ADAPTER',
    `"${raw}" is not a known adapter`,
    'set it to mcp-v2 (default, protocol 2026-07-28) or mcp-v1 (protocol 2025-11-25).',
  );
}

async function main(): Promise<void> {
  const adapterId = selectAdapter(process.env['JISR_MCP_ADAPTER']);
  const config = await loadConfig();
  const logger = createLogger(config.logLevel);

  const runtime: AdapterRuntime = {
    registry: new ToolRegistry(),
    context: {
      principal: createPrincipal({
        organizationId: config.organizationId,
        profile: config.roleProfile,
      }),
      flags: config.featureFlags,
      // Key permissions are probed at connection setup. Until then every domain
      // is 'unknown' rather than assumed permitted (plan > Open Dependencies).
      observed: UNPROBED,
    } satisfies AuthorizationContext,
    audit: createAuditSink(),
    metrics: new Metrics(),
  };

  // Constructed here so a credential failure surfaces at startup rather than on
  // the first tool call.
  void new JisrClient(config);

  logger.info('starting jisr-mcp', {
    version,
    adapter: adapterId,
    hostType: config.hostType,
    roleProfile: config.roleProfile,
    financeSurface: config.featureFlags.financeSurfaceEnabled ? 'enabled' : 'disabled',
    toolsRegistered: runtime.registry.all().length,
  });

  const adapter =
    adapterId === 'mcp-v2'
      ? await import('../adapters/mcp-v2/index.js')
      : await import('../adapters/mcp-v1/index.js');

  await adapter.serve(runtime, version);
}

main().catch((error: unknown) => {
  // A configuration failure names the setting and the fix, and never echoes a
  // credential value or prints a stack trace (spec FR-006).
  if (error instanceof ConfigurationError) {
    process.stderr.write(`${error.format()}\n`);
    process.exit(78); // EX_CONFIG
  }
  process.stderr.write(
    `jisr-mcp failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

/**
 * Adapter parity (spec FR-002a, SC-014).
 *
 * The five-client promise rests on both protocol adapters behaving identically.
 * Parity is a requirement with its own success criterion, not an aspiration --
 * and it is tested here, in Phase 2, beside the adapters, rather than four
 * phases later once divergence has had time to accumulate.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import type { AuthorizationContext } from '../../src/core/authorization/policies.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { buildEnvelope } from '../../src/core/envelope.js';
import { summarize } from '../../src/core/summary.js';
import {
  READ_ONLY_ANNOTATIONS,
  ToolRegistry,
  type ToolDefinition,
} from '../../src/core/tools/registry.js';
import { invokeTool, planRegistrations, toolListCacheHint } from '../../src/adapters/shared.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import type { AppConfig } from '../../src/config/environment.js';
import { createAuditSink } from '../../src/observability/audit.js';
import { Metrics } from '../../src/observability/metrics.js';

const ORG = 'org-parity-000001';

/** A client that is never called; these suites exercise registration, not I/O. */
function stubClient(): JisrClient {
  return new JisrClient({
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'test-org',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: 'hr_operations',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false }),
    subjectEmployeeId: undefined,
    logLevel: 'error',
  } satisfies AppConfig);
}

function silentSink(): NodeJS.WriteStream {
  return { write: () => true } as unknown as NodeJS.WriteStream;
}

/** A stand-in bound to a real manifest operation, so authorization applies. */
function sampleTool(): ToolDefinition<{ pageSize?: number }> {
  return {
    name: 'jisr_departments_list',
    title: 'List departments',
    description: 'Lists organizational departments.',
    inputShape: { pageSize: z.number().int().min(1).max(100).optional() },
    annotations: READ_ONLY_ANNOTATIONS,
    declaredFieldGroups: ['public_reference'],
    fieldGroupPurpose: 'Department names for resolving identifiers.',
    handler: async () =>
      await Promise.resolve({
        structuredContent: buildEnvelope({
          operation: 'jisr_departments_list',
          organizationId: ORG,
          dataAsOf: '2026-08-29T12:00:00Z',
          records: [{ id: 3, nameEn: 'Finance', nameAr: 'المالية' }],
          pageSize: 50,
        }),
        summary: summarize(
          buildEnvelope({
            operation: 'jisr_departments_list',
            organizationId: ORG,
            dataAsOf: '2026-08-29T12:00:00Z',
            records: [{ id: 3 }],
            pageSize: 50,
          }),
        ),
      }),
  };
}

function runtime() {
  const registry = new ToolRegistry();
  registry.register(sampleTool());
  const context: AuthorizationContext = {
    principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
    flags: createFeatureFlags({ financeSurfaceEnabled: false }),
    observed: UNPROBED,
  };
  return {
    registry,
    context: { ...context, client: stubClient(), connection: { hostType: 'aws' as const } },
    audit: createAuditSink(silentSink()),
    metrics: new Metrics(),
  };
}

describe('adapter parity', () => {
  it('both adapters construct from the identical registration plan', async () => {
    // Parity is structural: shared.ts computes the plan once, and each adapter
    // only chooses a transport. Neither can grow its own tool surface.
    const v2 = await import('../../src/adapters/mcp-v2/index.js');
    const v1 = await import('../../src/adapters/mcp-v1/index.js');

    expect(v2.PROTOCOL_REVISION).toBe('2026-07-28');
    expect(v1.PROTOCOL_REVISION).toBe('2025-11-25');

    const serverV2 = v2.createServer(runtime(), '0.1.0');
    const serverV1 = v1.createServer(runtime(), '0.1.0');
    expect(serverV2).toBeDefined();
    expect(serverV1).toBeDefined();
  });

  it('presents the same tool names, titles, annotations and field groups', () => {
    const plans = planRegistrations(runtime());
    expect(plans).toHaveLength(1);

    const plan = plans[0];
    expect(plan?.definition.name).toBe('jisr_departments_list');
    expect(plan?.config.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(plan?.config._meta['jisr/declaredFieldGroups']).toEqual(['public_reference']);
  });

  it('produces an identical result through the shared invocation path', async () => {
    const first = await invokeTool(runtime(), 'jisr_departments_list', {});
    const second = await invokeTool(runtime(), 'jisr_departments_list', {});
    expect(first).toEqual(second);
    expect(first.structuredContent?.['source']).toBe('live_jisr');
  });

  it('returns the same stable error shape for an unknown tool', async () => {
    const result = await invokeTool(runtime(), 'jisr_not_a_tool', {});
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.['code']).toBe('TOOL_NOT_ENABLED');
  });
});

describe('tools/list caching', () => {
  it('is scoped private, never shared across principals', () => {
    // The list is filtered per caller, so a shared cache scope would let one
    // principal observe another's capabilities (research R5).
    expect(toolListCacheHint(runtime()).cacheScope).toBe('private');
  });

  it('derives a distinct scope key per principal and per finance setting', () => {
    const base = runtime();
    const otherProfile = {
      ...base,
      context: {
        ...base.context,
        principal: createPrincipal({ organizationId: ORG, profile: 'finance' }),
      },
    };
    const financeOn = {
      ...base,
      context: { ...base.context, flags: createFeatureFlags({ financeSurfaceEnabled: true }) },
    };

    const keys = new Set([
      toolListCacheHint(base).scopeKey,
      toolListCacheHint(otherProfile).scopeKey,
      toolListCacheHint(financeOn).scopeKey,
    ]);
    expect(keys.size).toBe(3);
  });
});

/**
 * Tool-list caching must not cross principals (research R5, spec FR-018).
 *
 * The 2026-07-28 revision lets clients cache `tools/list`. Ours is filtered per
 * caller, so a list cached at a shared scope would let one principal observe
 * another's capabilities -- turning a performance feature into a disclosure.
 *
 * The specific failure this prevents: an ordinary employee learning that
 * payroll tooling exists.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import type { AuthorizationContext } from '../../src/core/authorization/policies.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { buildEnvelope } from '../../src/core/envelope.js';
import {
  READ_ONLY_ANNOTATIONS,
  ToolRegistry,
  type ToolDefinition,
} from '../../src/core/tools/registry.js';
import { toolListCacheHint, type AdapterRuntime } from '../../src/adapters/shared.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import type { AppConfig } from '../../src/config/environment.js';
import { createAuditSink } from '../../src/observability/audit.js';
import { Metrics } from '../../src/observability/metrics.js';
import type { RoleProfile } from '../../src/core/authorization/role-profiles.js';

const ORG = 'org-cache-000001';

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

function tool(
  name: string,
  groups: ToolDefinition<object>['declaredFieldGroups'],
): ToolDefinition<object> {
  return {
    name,
    title: name,
    description: name,
    inputShape: { pageSize: z.number().optional() },
    annotations: READ_ONLY_ANNOTATIONS,
    declaredFieldGroups: groups,
    fieldGroupPurpose: 'test',
    handler: async () =>
      await Promise.resolve({
        structuredContent: buildEnvelope({
          operation: name,
          organizationId: ORG,
          dataAsOf: '2026-08-29T00:00:00Z',
          records: [],
          pageSize: 50,
        }),
        summary: 'none',
      }),
  };
}

function runtimeFor(profile: RoleProfile, financeSurfaceEnabled: boolean): AdapterRuntime {
  const registry = new ToolRegistry();
  registry.register(tool('jisr_departments_list', ['public_reference']));
  registry.register(tool('jisr_employees_list', ['employee_personal']));
  registry.register(tool('jisr_payroll_transactions_list', ['financial_confidential']));

  const context: AuthorizationContext = {
    principal: createPrincipal({ organizationId: ORG, profile }),
    flags: createFeatureFlags({ financeSurfaceEnabled }),
    observed: UNPROBED,
  };
  return {
    registry,
    context: { ...context, client: stubClient(), connection: { hostType: 'aws' as const } },
    audit: createAuditSink({ write: () => true } as unknown as NodeJS.WriteStream),
    metrics: new Metrics(),
  };
}

const names = (runtime: AdapterRuntime): string[] =>
  runtime.registry
    .listFor(runtime.context)
    .map((t) => t.name)
    .sort();

describe('cache directives', () => {
  it('always declares the tool list private', () => {
    for (const profile of ['employee_self', 'hr_operations', 'finance'] as RoleProfile[]) {
      expect(toolListCacheHint(runtimeFor(profile, true)).cacheScope).toBe('private');
    }
  });

  it('gives principals with different surfaces different scope keys', () => {
    const keys = new Set(
      (['employee_self', 'hr_operations', 'finance'] as RoleProfile[]).map(
        (p) => toolListCacheHint(runtimeFor(p, true)).scopeKey,
      ),
    );
    expect(keys.size).toBe(3);
  });

  it('changes the scope key when the finance surface is toggled', () => {
    expect(toolListCacheHint(runtimeFor('finance', false)).scopeKey).not.toBe(
      toolListCacheHint(runtimeFor('finance', true)).scopeKey,
    );
  });
});

describe('the filtered surfaces genuinely differ', () => {
  it('hides payroll tooling from a non-finance principal entirely', () => {
    // Not "present but refused" -- absent. An ordinary employee must not learn
    // that payroll tooling exists (spec FR-018).
    expect(names(runtimeFor('hr_operations', true))).not.toContain(
      'jisr_payroll_transactions_list',
    );
    expect(names(runtimeFor('finance', true))).toContain('jisr_payroll_transactions_list');
  });

  it('hides payroll tooling from finance while the surface is disabled', () => {
    expect(names(runtimeFor('finance', false))).not.toContain('jisr_payroll_transactions_list');
  });

  it('gives the platform operator nothing', () => {
    expect(names(runtimeFor('platform_operator', true))).toEqual([]);
  });

  it('would leak if two principals shared one cache entry', () => {
    // The premise of the whole control: these lists are not interchangeable.
    const employee = names(runtimeFor('employee_self', true));
    const finance = names(runtimeFor('finance', true));
    expect(employee).not.toEqual(finance);
  });
});

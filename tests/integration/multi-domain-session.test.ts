/**
 * A session spanning several Jisr domains (spec SC-010).
 *
 * "An HR operations user answers questions spanning at least 4 distinct Jisr
 * domains within one uninterrupted assistant session, with 0 switches to the
 * Jisr web application."
 *
 * Scripted end to end through the real tool handlers and the real client, with
 * only the network replaced.
 */

import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import { registerReadTools } from '../../src/core/tools/index.js';
import { ToolRegistry, type ToolContext } from '../../src/core/tools/registry.js';
import {
  ATTENDANCE_SUMMARY,
  AUTH_SUCCESS,
  DEPARTMENTS,
  EMPLOYEES_WITH_FINANCE,
} from '../fixtures/jisr/index.js';

const ORG = 'org-session-0001';

const LEAVE = {
  success: true,
  data: {
    leaves_summary: [{ employee_code: 1001, leave_type: 'annual', year_end_balance: 12, used: 8 }],
    pagination: { current_page: 1, next_page: null, previous_page: null, total_pages: 1 },
  },
};

/** Routes by upstream path, so each tool gets a response for its own endpoint. */
function routedFetch(): typeof fetch {
  return ((input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = url.includes('/auth')
      ? AUTH_SUCCESS
      : url.includes('/employees')
        ? EMPLOYEES_WITH_FINANCE
        : url.includes('/attendance/summary')
          ? ATTENDANCE_SUMMARY
          : url.includes('/employee_leaves/summary')
            ? LEAVE
            : url.includes('/lookups/departments')
              ? DEPARTMENTS
              : url.includes('/lookups/locations')
                ? {
                    success: true,
                    data: {
                      locations: [{ id: 1, name_en: 'Riyadh HQ', name_ar: 'الرياض' }],
                      pagination: {
                        current_page: 1,
                        next_page: null,
                        previous_page: null,
                        total_pages: 1,
                      },
                    },
                  }
                : { success: true, data: {} };

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  }) as unknown as typeof fetch;
}

function session(): { registry: ToolRegistry; context: ToolContext } {
  const config: AppConfig = {
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'acme',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: 'hr_operations',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false }),
    logLevel: 'error',
  };

  const registry = new ToolRegistry();
  registerReadTools(registry);

  return {
    registry,
    context: {
      principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
      flags: config.featureFlags,
      observed: UNPROBED,
      client: new JisrClient(config, new TokenCache(), routedFetch()),
      connection: { hostType: 'aws' },
    },
  };
}

describe('one session, four domains', () => {
  it('answers across employees, attendance, leave and lookups without leaving', async () => {
    const { registry, context } = session();

    const employees = await registry
      .get('jisr_employees_list')
      ?.handler({ pageSize: 10 } as never, context);
    const attendance = await registry
      .get('jisr_attendance_summary_get')
      ?.handler({ from: '2026-08-01', to: '2026-08-31' } as never, context);
    const leave = await registry
      .get('jisr_employee_leave_summary_get')
      ?.handler({ employeeCodes: [1001] } as never, context);
    const departments = await registry.get('jisr_departments_list')?.handler({} as never, context);

    for (const result of [employees, attendance, leave, departments]) {
      expect(result).toBeDefined();
      expect(result?.summary.length).toBeGreaterThan(0);
    }

    const domains = new Set(
      [employees, attendance, leave, departments].map(
        (r) => (r?.structuredContent as { operation: string }).operation,
      ),
    );
    expect(domains.size).toBe(4);
  });

  it('holds the field policy across every domain in the session', async () => {
    // The upstream fixture carries salary, because the key permits it.
    const { registry, context } = session();

    const results = await Promise.all([
      registry.get('jisr_employees_list')?.handler({ pageSize: 10 } as never, context),
      registry
        .get('jisr_attendance_summary_get')
        ?.handler({ from: '2026-08-01', to: '2026-08-31' } as never, context),
      registry.get('jisr_departments_list')?.handler({} as never, context),
    ]);

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain('basicSalary');
    expect(serialized).not.toContain('10000');
    expect(serialized).not.toContain('passportNumber');
  });

  it('states freshness on every answer, so nothing reads as cached', async () => {
    const { registry, context } = session();
    const result = await registry.get('jisr_departments_list')?.handler({} as never, context);
    const envelope = result?.structuredContent as { source: string; dataAsOf: string };

    expect(envelope.source).toBe('live_jisr');
    expect(envelope.dataAsOf).toBeDefined();
    expect(result?.summary).toContain('Live from Jisr');
  });

  it('reuses one access token across the whole session', async () => {
    // Re-authenticating per call would be a rate-limit problem and a
    // credential-handling one.
    let authCalls = 0;
    const counting = ((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/auth')) authCalls += 1;
      return routedFetch()(input);
    }) as unknown as typeof fetch;

    const config: AppConfig = {
      organizationId: ORG,
      baseUrl: 'https://apis.jisr.net/api',
      hostType: 'aws',
      slug: 'acme',
      credentials: { apiKey: 'k', apiSecret: 's' },
      financeCredentials: undefined,
      roleProfile: 'hr_operations',
      featureFlags: createFeatureFlags({ financeSurfaceEnabled: false }),
      logLevel: 'error',
    };
    const registry = new ToolRegistry();
    registerReadTools(registry);
    const context: ToolContext = {
      principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
      flags: config.featureFlags,
      observed: UNPROBED,
      client: new JisrClient(config, new TokenCache(), counting),
      connection: { hostType: 'aws' },
    };

    await registry.get('jisr_departments_list')?.handler({} as never, context);
    await registry.get('jisr_locations_list')?.handler({} as never, context);
    await registry.get('jisr_employees_list')?.handler({} as never, context);

    expect(authCalls).toBe(1);
  });
});

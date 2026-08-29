/**
 * Enumeration resistance (spec User Story 3 scenario 4).
 *
 * "Repeated attempts across identifiers cannot be used to enumerate who
 * exists." A refusal that differs between "no such employee" and "not yours"
 * turns the tool into a directory.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { scopeToReachable } from '../../src/core/authorization/reachability.js';
import { JisrMcpError } from '../../src/core/errors.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import { getEmployeeBasicInfo } from '../../src/core/services/employees-service.js';
import type { ToolContext } from '../../src/core/tools/registry.js';
import type { AppConfig } from '../../src/config/environment.js';
import { AUTH_SUCCESS } from '../fixtures/jisr/index.js';

/** Runs a call expected to fail, and returns its error narrowed to JisrMcpError. */
async function refusalFrom(run: () => Promise<unknown>): Promise<JisrMcpError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof JisrMcpError) return error;
    throw error;
  }
  throw new Error('expected a refusal, but the call succeeded');
}

const ORG = 'org-enum-000001';
const SELF = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

function context(returnedEmployee: Record<string, unknown> | null): ToolContext {
  const config: AppConfig = {
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'acme',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: 'employee_self',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false }),
    logLevel: 'error',
  };

  let authed = false;
  const impl = (() => {
    if (!authed) {
      authed = true;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(AUTH_SUCCESS),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: { employee: returnedEmployee ?? { employee_id: null } },
        }),
    } as Response);
  }) as unknown as typeof fetch;

  return {
    principal: createPrincipal({
      organizationId: ORG,
      profile: 'employee_self',
      subjectEmployeeId: SELF,
    }),
    flags: config.featureFlags,
    observed: UNPROBED,
    client: new JisrClient(config, new TokenCache(), impl),
    connection: { hostType: 'aws' },
  };
}

describe('single-record reads', () => {
  it('returns the caller’s own record', async () => {
    const { envelope } = await getEmployeeBasicInfo(
      { employeeId: SELF },
      context({ employee_id: SELF, full_name_en: 'Self' }),
    );
    expect(envelope.records).toHaveLength(1);
  });

  it('refuses another employee that exists, without saying it exists', async () => {
    await expect(
      getEmployeeBasicInfo(
        { employeeId: OTHER },
        context({ employee_id: OTHER, full_name_en: 'Someone Else' }),
      ),
    ).rejects.toMatchObject({ code: 'RECORD_NOT_AUTHORIZED' });
  });

  it('gives the identical error for an employee that does not exist', async () => {
    // The two cases are indistinguishable to the caller. That is the point.
    const existing = await refusalFrom(async () =>
      getEmployeeBasicInfo({ employeeId: OTHER }, context({ employee_id: OTHER })),
    );
    const missing = await refusalFrom(async () =>
      getEmployeeBasicInfo({ employeeId: OTHER }, context(null)),
    );

    expect(existing.code).toBe(missing.code);
    expect(existing.message).toBe(missing.message);
  });

  it('leaks no field of the refused record in the error', async () => {
    const error = await refusalFrom(async () =>
      getEmployeeBasicInfo(
        { employeeId: OTHER },
        context({ employee_id: OTHER, full_name_en: 'Confidential Name', basic_salary: 99999 }),
      ),
    );

    const serialized = JSON.stringify(error.toPayload());
    expect(serialized).not.toContain('Confidential Name');
    expect(serialized).not.toContain('99999');
    expect(serialized).not.toContain(OTHER);
  });
});

describe('collection reads', () => {
  it('reveals only a count of what was withheld, never an identifier', () => {
    const rows = [
      { id: SELF, code: 1, managerId: null },
      { id: OTHER, code: 2, managerId: null },
      { id: 'third', code: 3, managerId: null },
    ];
    const result = scopeToReachable(
      rows,
      createPrincipal({ organizationId: ORG, profile: 'employee_self', subjectEmployeeId: SELF }),
      (row) => ({ employeeId: row.id, employeeCode: row.code, lineManagerId: row.managerId }),
    );

    expect(result.records).toHaveLength(1);
    const serialized = JSON.stringify(result.warnings);
    expect(serialized).not.toContain(OTHER);
    expect(serialized).not.toContain('third');
  });
});

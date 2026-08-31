/**
 * Employee creation: lookup resolution and name rules (T021, spec FR-006,
 * FR-014). Everything here refuses at PREPARE -- nothing reaches the write.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import { prepareEmployeeCreate } from '../../src/core/services/employees-write-service.js';
import { employeeCreatePrepareTool } from '../../src/core/tools/employees/employee-create.js';
import { inputSchemaOf, type ToolContext } from '../../src/core/tools/registry.js';
import { resetConsumedReferences } from '../../src/core/writes/confirmation.js';
import { resetDuplicateGuard } from '../../src/core/writes/duplicate-guard.js';
import { AUTH_SUCCESS, DEPARTMENTS, EMPLOYEES_WITH_FINANCE } from '../fixtures/jisr/index.js';
import { refusalFrom } from '../helpers.js';

const ORG = 'org-emp-create-1';

function context(): ToolContext {
  const fetchStub = ((input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = url.includes('/auth')
      ? AUTH_SUCCESS
      : url.includes('/lookups/departments')
        ? DEPARTMENTS
        : EMPLOYEES_WITH_FINANCE;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  }) as unknown as typeof fetch;
  const config: AppConfig = {
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'acme',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: 'hr_operations',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false, writeEmployees: true }),
    subjectEmployeeId: undefined,
    logLevel: 'error',
  };
  return {
    principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
    flags: config.featureFlags,
    observed: UNPROBED,
    client: new JisrClient(config, new TokenCache(), fetchStub),
    connection: { hostType: 'aws' },
  };
}

const VALID = {
  code: 9001,
  fullNameEn: 'New Person Example',
  fullNameAr: 'شخص جديد مثال',
};

beforeEach(() => {
  resetConsumedReferences();
  resetDuplicateGuard();
});

describe('lookup resolution at prepare', () => {
  it('resolves a real department id and names it in the preview', async () => {
    const prepared = await prepareEmployeeCreate({ ...VALID, departmentId: 1 }, context());
    const content = prepared.structuredContent as {
      preview: { resolvedLookups: Record<string, string> };
    };
    expect(content.preview.resolvedLookups['departments']).toBeTruthy();
  });

  it('refuses an unknown departmentId with RECORD_NOT_FOUND, writing nothing', async () => {
    const error = await refusalFrom(() =>
      prepareEmployeeCreate({ ...VALID, departmentId: 424242 }, context()),
    );
    expect(error.code).toBe('RECORD_NOT_FOUND');
    expect(error.message).toContain('424242');
  });
});

describe('the name and enum rules', () => {
  const schema = inputSchemaOf(employeeCreatePrepareTool);

  it('refuses a single-part English name at the schema', () => {
    expect(schema.safeParse({ ...VALID, fullNameEn: 'Cher' }).success).toBe(false);
  });

  it('refuses a single-part Arabic name at the schema', () => {
    expect(schema.safeParse({ ...VALID, fullNameAr: 'محمد' }).success).toBe(false);
  });

  it('refuses out-of-enum gender values exactly', () => {
    expect(schema.safeParse({ ...VALID, gender: 'male' }).success).toBe(false);
    expect(schema.safeParse({ ...VALID, gender: 'M' }).success).toBe(false);
    expect(schema.safeParse({ ...VALID, gender: 'Male' }).success).toBe(true);
  });

  it('refuses out-of-enum contractType values exactly', () => {
    expect(schema.safeParse({ ...VALID, contractType: 'fixed term' }).success).toBe(false);
    expect(schema.safeParse({ ...VALID, contractType: 'Permanent' }).success).toBe(false);
    expect(schema.safeParse({ ...VALID, contractType: 'Fixed term' }).success).toBe(true);
  });

  it('the service enforces the same rules for a direct caller', async () => {
    await expect(
      prepareEmployeeCreate({ ...VALID, fullNameEn: 'Cher' }, context()),
    ).rejects.toThrow(/first and a last name/);
  });
});

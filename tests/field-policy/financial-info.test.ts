/**
 * The financial tools are reachable only under both conditions (spec FR-023a).
 *
 * The finance profile AND the explicitly enabled surface. Either alone is
 * insufficient, and that is deliberate: a broad convenience Jisr key must not
 * be able to expose payroll on its own.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { allowedClassifications } from '../../src/core/authorization/field-policy.js';
import { authorizeTool } from '../../src/core/authorization/policies.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { ROLE_PROFILES, type RoleProfile } from '../../src/core/authorization/role-profiles.js';
import { isJisrMcpError } from '../../src/core/errors.js';
import { registerReadTools } from '../../src/core/tools/index.js';
import { ToolRegistry } from '../../src/core/tools/registry.js';

const ORG = 'org-fin-000001';

const FINANCIAL_TOOLS = [
  'jisr_employee_financial_info_get',
  'jisr_employee_monthly_payables_list',
  'jisr_payroll_transactions_list',
  'jisr_gl_transaction_types_list',
  'jisr_paygroups_list',
  'jisr_accounting_journal_get',
];

function ctx(profile: RoleProfile, financeSurfaceEnabled: boolean) {
  return {
    principal: createPrincipal({ organizationId: ORG, profile }),
    flags: createFeatureFlags({ financeSurfaceEnabled }),
    observed: UNPROBED,
  };
}

function allows(profile: RoleProfile, financeSurfaceEnabled: boolean, tool: string): boolean {
  try {
    authorizeTool(tool, ctx(profile, financeSurfaceEnabled));
    return true;
  } catch (error) {
    if (isJisrMcpError(error)) return false;
    throw error;
  }
}

describe('both conditions are required', () => {
  it.each(FINANCIAL_TOOLS)('%s: finance profile alone is not enough', (tool) => {
    expect(allows('finance', false, tool)).toBe(false);
  });

  it.each(FINANCIAL_TOOLS)('%s: an enabled surface alone is not enough', (tool) => {
    expect(allows('hr_operations', true, tool)).toBe(false);
  });

  it.each(FINANCIAL_TOOLS)('%s: both together allow it', (tool) => {
    expect(allows('finance', true, tool)).toBe(true);
  });

  it.each(ROLE_PROFILES.filter((p) => p !== 'finance'))(
    'no financial tool is reachable by %s under any surface setting',
    (profile) => {
      for (const tool of FINANCIAL_TOOLS) {
        expect(allows(profile, false, tool)).toBe(false);
        expect(allows(profile, true, tool)).toBe(false);
      }
    },
  );
});

describe('classification', () => {
  it('grants financial_confidential only to finance with the surface on', () => {
    for (const profile of ROLE_PROFILES) {
      for (const enabled of [false, true]) {
        const allowed = allowedClassifications(
          profile,
          createFeatureFlags({ financeSurfaceEnabled: enabled }),
        );
        const expected = profile === 'finance' && enabled;
        expect(allowed.has('financial_confidential')).toBe(expected);
      }
    }
  });

  it('never grants authentication_secret to anyone, in any configuration', () => {
    for (const profile of ROLE_PROFILES) {
      for (const enabled of [false, true]) {
        const allowed = allowedClassifications(
          profile,
          createFeatureFlags({ financeSurfaceEnabled: enabled }),
        );
        expect(allowed.has('authentication_secret')).toBe(false);
      }
    }
  });

  it('never grants employee_sensitive, pending a documented purpose and legal basis', () => {
    // Passport, document number, date of birth, home address. FR-024 requires a
    // documented product purpose and legal basis this release does not claim.
    for (const profile of ROLE_PROFILES) {
      const allowed = allowedClassifications(
        profile,
        createFeatureFlags({ financeSurfaceEnabled: true }),
      );
      expect(allowed.has('employee_sensitive')).toBe(false);
    }
  });
});

describe('declared field groups', () => {
  it('declares financial_confidential on every financial tool, and on no other', () => {
    const registry = new ToolRegistry();
    registerReadTools(registry);

    for (const tool of registry.all()) {
      const declaresFinancial = tool.declaredFieldGroups.includes('financial_confidential');
      expect(declaresFinancial).toBe(FINANCIAL_TOOLS.includes(tool.name));
    }
  });

  it('gives every tool a stated purpose for what it may return', () => {
    const registry = new ToolRegistry();
    registerReadTools(registry);
    for (const tool of registry.all()) {
      expect(tool.declaredFieldGroups.length).toBeGreaterThan(0);
      expect(tool.fieldGroupPurpose.length).toBeGreaterThan(20);
    }
  });
});

/**
 * Unavailability must explain itself (spec FR-016, SC-005).
 *
 * "In 100% of cases where a capability is unavailable, an agent can determine
 * the reason and the corrective action from the server's own response."
 *
 * Four distinct causes, each naming whoever can actually change it.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import {
  resolveCapability,
  resolveAllCapabilities,
  UNPROBED,
} from '../../src/core/authorization/capabilities.js';
import { authorizeTool } from '../../src/core/authorization/policies.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import type { RoleProfile } from '../../src/core/authorization/role-profiles.js';
import { findByTool } from '../../src/core/jisr/endpoint-manifest.js';
import { isJisrMcpError } from '../../src/core/errors.js';

const ORG = 'org-unavail-0001';

function ctx(profile: RoleProfile, financeSurfaceEnabled = false, deniedDomains: string[] = []) {
  return {
    principal: createPrincipal({ organizationId: ORG, profile }),
    flags: createFeatureFlags({ financeSurfaceEnabled }),
    observed:
      deniedDomains.length === 0
        ? UNPROBED
        : { probed: true, deniedDomains: new Set(deniedDomains) },
  };
}

describe('the four causes are distinguishable', () => {
  it('operator has not enabled the surface -> TOOL_NOT_ENABLED', () => {
    const entry = findByTool('jisr_payroll_transactions_list');
    const capability = resolveCapability(entry!, ctx('finance').principal, ctx('finance').flags);
    expect(capability?.unavailableReason).toBe('TOOL_NOT_ENABLED');
    expect(capability?.suggestedAction).toContain('operator');
  });

  it('caller lacks the role -> FINANCE_ACCESS_REQUIRED for a financial operation', () => {
    const entry = findByTool('jisr_payroll_transactions_list');
    const c = ctx('hr_operations', true);
    const capability = resolveCapability(entry!, c.principal, c.flags);
    expect(capability?.unavailableReason).toBe('FINANCE_ACCESS_REQUIRED');
    expect(capability?.suggestedAction).toContain('finance');
  });

  it('caller lacks the role -> JISR_PERMISSION_DENIED for a non-financial operation', () => {
    const entry = findByTool('jisr_webhooks_list');
    const c = ctx('employee_self');
    const capability = resolveCapability(entry!, c.principal, c.flags);
    expect(capability?.unavailableReason).toBe('JISR_PERMISSION_DENIED');
    expect(capability?.suggestedAction).toContain('integration_admin');
  });

  it('key lacks the permission -> JISR_CAPABILITY_NOT_ENABLED, naming the administrator', () => {
    const entry = findByTool('jisr_employees_list');
    const c = ctx('hr_operations', false, ['employees']);
    const capability = resolveCapability(entry!, c.principal, c.flags, c.observed);
    expect(capability?.unavailableReason).toBe('JISR_CAPABILITY_NOT_ENABLED');
    expect(capability?.suggestedAction).toContain('Jisr administrator');
  });
});

describe('every unavailable capability explains itself', () => {
  it.each([
    'employee_self',
    'manager',
    'hr_operations',
    'finance',
    'integration_admin',
    'auditor',
    'platform_operator',
  ] as RoleProfile[])(
    'gives %s a reason and an action for every unavailable operation',
    (profile) => {
      const c = ctx(profile, false, ['employees']);
      const capabilities = resolveAllCapabilities(c.principal, c.flags, c.observed);
      const unavailable = capabilities.filter((cap) => !cap.available);

      // SC-005 is 100%, so an empty set would pass vacuously.
      expect(capabilities.length).toBeGreaterThan(0);
      for (const cap of unavailable) {
        expect(cap.unavailableReason).not.toBeNull();
        expect(cap.suggestedAction).not.toBeNull();
        expect((cap.suggestedAction ?? '').length).toBeGreaterThan(10);
      }
    },
  );
});

describe('refusals disclose nothing', () => {
  it('does not reveal whether the underlying record exists', () => {
    try {
      authorizeTool('jisr_payroll_transactions_list', ctx('hr_operations', true));
      throw new Error('expected a refusal');
    } catch (error) {
      expect(isJisrMcpError(error)).toBe(true);
      if (isJisrMcpError(error)) {
        expect(error.message).toBe('This operation is not available to you.');
        expect(error.message).not.toContain('exists');
      }
    }
  });
});

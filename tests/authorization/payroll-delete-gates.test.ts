/**
 * Four-gate dormancy for the destructive path (T027, SC-006).
 *
 * The deletion pair is available ONLY when all four gates open together:
 * finance profile, finance surface, key permission, and the dedicated flag.
 * Any one missing keeps it undiscoverable -- absent, not refused.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import {
  isToolDiscoverable,
  type AuthorizationContext,
} from '../../src/core/authorization/policies.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { ROLE_PROFILES, type RoleProfile } from '../../src/core/authorization/role-profiles.js';

const ORG = 'org-gates-00001';
const PAIR = [
  'jisr_payroll_transaction_delete_prepare',
  'jisr_payroll_transaction_delete_commit',
] as const;

function contextFor(
  profile: RoleProfile,
  flags: Partial<Parameters<typeof createFeatureFlags>[0]>,
  keyDeniesFinance = false,
): AuthorizationContext {
  return {
    principal: createPrincipal({ organizationId: ORG, profile }),
    flags: createFeatureFlags({ financeSurfaceEnabled: false, ...flags }),
    observed: keyDeniesFinance ? { probed: true, deniedDomains: new Set(['finance']) } : UNPROBED,
  };
}

const ALL_GATES_OPEN = { financeSurfaceEnabled: true, writePayrollDelete: true };

describe('the four gates', () => {
  it('at defaults the pair is absent for every profile', () => {
    for (const profile of ROLE_PROFILES) {
      for (const tool of PAIR) {
        expect(isToolDiscoverable(tool, contextFor(profile, {}))).toBe(false);
      }
    }
  });

  it('opens only for finance when profile, surface, and flag align', () => {
    for (const profile of ROLE_PROFILES) {
      const expected = profile === 'finance';
      for (const tool of PAIR) {
        expect(isToolDiscoverable(tool, contextFor(profile, ALL_GATES_OPEN))).toBe(expected);
      }
    }
  });

  it('stays absent without the finance surface, even with the flag on', () => {
    const context = contextFor('finance', {
      financeSurfaceEnabled: false,
      writePayrollDelete: true,
    });
    for (const tool of PAIR) expect(isToolDiscoverable(tool, context)).toBe(false);
  });

  it('stays absent without the flag, even with the surface on', () => {
    const context = contextFor('finance', {
      financeSurfaceEnabled: true,
      writePayrollDelete: false,
    });
    for (const tool of PAIR) expect(isToolDiscoverable(tool, context)).toBe(false);
  });

  it('stays absent when the probed key denies the finance domain', () => {
    const context = contextFor('finance', ALL_GATES_OPEN, true);
    for (const tool of PAIR) expect(isToolDiscoverable(tool, context)).toBe(false);
  });
});

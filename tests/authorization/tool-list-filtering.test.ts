/**
 * Unauthorized capabilities must be UNDISCOVERABLE (spec FR-018).
 *
 * Not "listed but refused" -- absent. A normal employee must not learn that
 * payroll tooling exists. Knowing a capability exists is itself information:
 * it tells you what to ask for, who to ask, and what the organization holds.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { authorizeTool, isToolDiscoverable } from '../../src/core/authorization/policies.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { ROLE_PROFILES, type RoleProfile } from '../../src/core/authorization/role-profiles.js';
import { isJisrMcpError } from '../../src/core/errors.js';
import { registerReadTools } from '../../src/core/tools/index.js';
import { ToolRegistry } from '../../src/core/tools/registry.js';

const ORG = 'org-filter-000001';

function ctx(profile: RoleProfile, financeSurfaceEnabled = false) {
  return {
    principal: createPrincipal({ organizationId: ORG, profile }),
    flags: createFeatureFlags({ financeSurfaceEnabled }),
    observed: UNPROBED,
  };
}

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  registerReadTools(r);
  return r;
}

describe('the listed surface', () => {
  it('omits payroll entirely from a non-finance caller', () => {
    const names = registry()
      .listFor(ctx('hr_operations', true) as never)
      .map((t) => t.name);
    expect(names).not.toContain('jisr_payroll_transactions_list');
    expect(names).not.toContain('jisr_employee_financial_info_get');
  });

  it('omits organization enumeration from an employee-self caller', () => {
    const names = registry()
      .listFor(ctx('employee_self') as never)
      .map((t) => t.name);
    expect(names).not.toContain('jisr_employees_list');
  });

  it('contains no tool the caller could not actually call', () => {
    // Listing a tool that then refuses is its own kind of disclosure.
    for (const profile of ROLE_PROFILES) {
      const context = ctx(profile, true);
      for (const tool of registry().listFor(context)) {
        expect(() => authorizeTool(tool.name, context)).not.toThrow();
      }
    }
  });

  it('omits every tool the caller cannot call', () => {
    for (const profile of ROLE_PROFILES) {
      const context = ctx(profile, true);
      const listed = new Set(
        registry()
          .listFor(context as never)
          .map((t) => t.name),
      );
      for (const tool of registry().all()) {
        const callable = isToolDiscoverable(tool.name, context);
        expect(listed.has(tool.name)).toBe(callable);
      }
    }
  });
});

describe('calling a hidden tool directly', () => {
  it('refuses without confirming the capability is configured', () => {
    try {
      authorizeTool('jisr_payroll_transactions_list', ctx('employee_self', true));
      throw new Error('expected a refusal');
    } catch (error) {
      expect(isJisrMcpError(error)).toBe(true);
      if (isJisrMcpError(error)) {
        expect(error.message).toBe('This operation is not available to you.');
      }
    }
  });

  it('gives the same message whether the surface is off or the role is wrong', () => {
    // Differing messages would let a caller probe which condition failed, and
    // so learn whether the organization has payroll configured at all.
    const messages = new Set<string>();
    for (const context of [ctx('hr_operations', true), ctx('finance', false)]) {
      try {
        authorizeTool('jisr_payroll_transactions_list', context);
      } catch (error) {
        if (isJisrMcpError(error)) messages.add(error.message);
      }
    }
    expect(messages.size).toBe(1);
  });
});

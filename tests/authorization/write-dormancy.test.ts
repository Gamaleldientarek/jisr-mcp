/**
 * Dormancy and the enabled-state matrix (T020, SC-002, spec FR-003).
 *
 * With flags at default, ZERO write tools are listed for every profile -- the
 * write surface is absent, not merely refused. With every flag enabled, only
 * hr_operations can see or call the punch and employee pairs, and only
 * finance the deletion pair.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import {
  authorizeTool,
  isToolDiscoverable,
  type AuthorizationContext,
} from '../../src/core/authorization/policies.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { ROLE_PROFILES, type RoleProfile } from '../../src/core/authorization/role-profiles.js';
import { registerReadTools, registerWriteTools } from '../../src/core/tools/index.js';
import { ToolRegistry } from '../../src/core/tools/registry.js';

const ORG = 'org-dormant-001';

const WRITE_TOOLS = [
  'jisr_attendance_punch_create_prepare',
  'jisr_attendance_punch_create_commit',
  'jisr_employee_create_prepare',
  'jisr_employee_create_commit',
  'jisr_payroll_transaction_delete_prepare',
  'jisr_payroll_transaction_delete_commit',
] as const;

function contextFor(
  profile: RoleProfile,
  flags: Partial<Parameters<typeof createFeatureFlags>[0]> = {},
): AuthorizationContext {
  return {
    principal: createPrincipal({ organizationId: ORG, profile }),
    flags: createFeatureFlags({ financeSurfaceEnabled: false, ...flags }),
    observed: UNPROBED,
  };
}

const ALL_ON = {
  writeAttendance: true,
  writeEmployees: true,
  writePayrollDelete: true,
  financeSurfaceEnabled: true,
} as const;

function fullRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registerReadTools(registry);
  registerWriteTools(registry);
  return registry;
}

describe('dormancy: flags at default', () => {
  it('lists zero write tools for every profile (SC-002)', () => {
    const registry = fullRegistry();
    for (const profile of ROLE_PROFILES) {
      const context = contextFor(profile);
      const listed = registry
        .all()
        .map((t) => t.name)
        .filter((name) => isToolDiscoverable(name, context));
      expect(listed.filter((name) => (WRITE_TOOLS as readonly string[]).includes(name))).toEqual(
        [],
      );
    }
  });

  it('refuses every write tool as not enabled, for every profile', () => {
    for (const profile of ROLE_PROFILES) {
      const context = contextFor(profile);
      for (const tool of WRITE_TOOLS) {
        expect(() => authorizeTool(tool, context)).toThrow(/not available|not enabled|disabled/i);
      }
    }
  });
});

describe('the enabled-state matrix: all flags on', () => {
  it('keeps punch and employee tools undiscoverable and uncallable outside hr_operations', () => {
    const hrTools = WRITE_TOOLS.filter((t) => !t.startsWith('jisr_payroll'));
    for (const profile of ROLE_PROFILES.filter((p) => p !== 'hr_operations')) {
      const context = contextFor(profile, ALL_ON);
      for (const tool of hrTools) {
        expect(isToolDiscoverable(tool, context)).toBe(false);
        expect(() => authorizeTool(tool, context)).toThrow();
      }
    }
  });

  it('keeps the deletion pair undiscoverable and uncallable outside finance', () => {
    const deletionTools = WRITE_TOOLS.filter((t) => t.startsWith('jisr_payroll'));
    for (const profile of ROLE_PROFILES.filter((p) => p !== 'finance')) {
      const context = contextFor(profile, ALL_ON);
      for (const tool of deletionTools) {
        expect(isToolDiscoverable(tool, context)).toBe(false);
      }
    }
  });

  it('makes the punch pair discoverable for hr_operations, and only then', () => {
    const context = contextFor('hr_operations', ALL_ON);
    expect(isToolDiscoverable('jisr_attendance_punch_create_prepare', context)).toBe(true);
    expect(isToolDiscoverable('jisr_attendance_punch_create_commit', context)).toBe(true);
  });

  it('a single flag enables exactly its own domain', () => {
    const context = contextFor('hr_operations', { writeAttendance: true });
    expect(isToolDiscoverable('jisr_attendance_punch_create_prepare', context)).toBe(true);
    expect(isToolDiscoverable('jisr_employee_create_prepare', context)).toBe(false);
    expect(isToolDiscoverable('jisr_payroll_transaction_delete_prepare', context)).toBe(false);
  });
});

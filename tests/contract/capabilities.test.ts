/**
 * The four capability facts are INDEPENDENTLY observable (spec FR-014).
 *
 * Collapsing them into one boolean is the failure mode this prevents. "You
 * cannot do this" leaves an agent stuck; "the connected key does not permit it,
 * and a Jisr administrator can change that" is actionable.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { resolveAllCapabilities, UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { ROLE_PROFILES, type RoleProfile } from '../../src/core/authorization/role-profiles.js';

const ORG = 'org-caps-000001';

function resolve(
  profile: RoleProfile,
  financeSurfaceEnabled = false,
  deniedDomains: string[] = [],
) {
  return resolveAllCapabilities(
    createPrincipal({ organizationId: ORG, profile }),
    createFeatureFlags({ financeSurfaceEnabled }),
    deniedDomains.length === 0 ? UNPROBED : { probed: true, deniedDomains: new Set(deniedDomains) },
  );
}

describe('the four facts', () => {
  it('are reported separately for every operation', () => {
    for (const capability of resolve('hr_operations')) {
      expect(typeof capability.supportedBySpecification).toBe('boolean');
      expect(typeof capability.allowedByPrincipal).toBe('boolean');
      expect(typeof capability.enabledByConfiguration).toBe('boolean');
      expect(['boolean', 'string']).toContain(typeof capability.permittedByJisrKey);
    }
  });

  it('vary independently rather than moving together', () => {
    // A finance tool for an HR caller with the surface off: allowed=false AND
    // enabled=false, but they are distinct facts with distinct fixes.
    const payroll = resolve('hr_operations').find(
      (c) => c.tool === 'jisr_payroll_transactions_list',
    );
    expect(payroll?.allowedByPrincipal).toBe(false);
    expect(payroll?.enabledByConfiguration).toBe(false);
    expect(payroll?.supportedBySpecification).toBe(true);
  });

  it('separates "allowed by role" from "enabled by configuration"', () => {
    const financeSurfaceOff = resolve('finance', false).find(
      (c) => c.tool === 'jisr_paygroups_list',
    );
    expect(financeSurfaceOff?.allowedByPrincipal).toBe(true);
    expect(financeSurfaceOff?.enabledByConfiguration).toBe(false);

    const financeSurfaceOn = resolve('finance', true).find((c) => c.tool === 'jisr_paygroups_list');
    expect(financeSurfaceOn?.allowedByPrincipal).toBe(true);
    expect(financeSurfaceOn?.enabledByConfiguration).toBe(true);
    expect(financeSurfaceOn?.available).toBe(true);
  });

  it('reports an unprobed key permission as unknown, never as false', () => {
    for (const capability of resolve('hr_operations')) {
      expect(capability.permittedByJisrKey).toBe('unknown');
    }
  });

  it('reports a probed denial as false, distinct from unknown', () => {
    const employees = resolve('hr_operations', false, ['employees']).find(
      (c) => c.tool === 'jisr_employees_list',
    );
    expect(employees?.permittedByJisrKey).toBe(false);
    expect(employees?.unavailableReason).toBe('JISR_CAPABILITY_NOT_ENABLED');
  });
});

describe('coverage', () => {
  it('describes every bound tool for every profile', () => {
    for (const profile of ROLE_PROFILES) {
      const capabilities = resolve(profile);
      // 20 read operations plus the 3 feature 002 write commits.
      expect(capabilities).toHaveLength(23);
      expect(new Set(capabilities.map((c) => c.tool)).size).toBe(23);
    }
  });

  it('reports every write commit as configuration-disabled by default', () => {
    const writeTools = [
      'jisr_attendance_punch_create_commit',
      'jisr_employee_create_commit',
      'jisr_payroll_transaction_delete_commit',
    ];
    for (const profile of ROLE_PROFILES) {
      const capabilities = resolve(profile);
      for (const tool of writeTools) {
        const record = capabilities.find((c) => c.tool === tool);
        expect(record?.enabledByConfiguration).toBe(false);
        expect(record?.available).toBe(false);
        expect(record?.unavailableReason).toBe(
          tool === 'jisr_payroll_transaction_delete_commit'
            ? 'DESTRUCTIVE_ACTION_DISABLED'
            : 'WRITE_NOT_ENABLED',
        );
      }
    }
  });

  it('gives every unavailable capability a reason and an action', () => {
    for (const profile of ROLE_PROFILES) {
      for (const capability of resolve(profile)) {
        if (capability.available) continue;
        expect(capability.unavailableReason).not.toBeNull();
        expect(capability.suggestedAction).not.toBeNull();
      }
    }
  });

  it('marks available capabilities with no reason and no action', () => {
    for (const capability of resolve('hr_operations')) {
      if (!capability.available) continue;
      expect(capability.unavailableReason).toBeNull();
      expect(capability.suggestedAction).toBeNull();
    }
  });
});

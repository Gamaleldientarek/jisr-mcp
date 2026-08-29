/**
 * The role-profile-by-tool authorization matrix (spec SC-004).
 *
 * "Every cell of the matrix resolves to its expected allow or deny, with 0
 * cells where an unauthorized capability is discoverable."
 *
 * Seven profiles by twenty-three tools, in both finance-surface states. The
 * expectations are written out explicitly rather than derived from the same
 * code under test -- a matrix computed from the implementation would pass no
 * matter what the implementation did.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import type { AuthorizationContext } from '../../src/core/authorization/policies.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { ROLE_PROFILES, type RoleProfile } from '../../src/core/authorization/role-profiles.js';
import { registerReadTools } from '../../src/core/tools/index.js';
import { ToolRegistry } from '../../src/core/tools/registry.js';

const ORG = 'org-matrix-000001';

const DISCOVERY = ['jisr_connection_status_get', 'jisr_capabilities_get', 'jisr_data_catalog_get'];

const LOOKUPS = [
  'jisr_departments_list',
  'jisr_employment_types_list',
  'jisr_business_units_list',
  'jisr_locations_list',
  'jisr_nationalities_list',
  'jisr_outsourcing_companies_list',
];

const FINANCIAL = [
  'jisr_employee_financial_info_get',
  'jisr_employee_monthly_payables_list',
  'jisr_payroll_transactions_list',
  'jisr_gl_transaction_types_list',
  'jisr_paygroups_list',
  'jisr_accounting_journal_get',
];

/** Written by hand from the endpoint manifest, not computed from the code. */
const EXPECTED: Readonly<Record<RoleProfile, readonly string[]>> = {
  employee_self: [
    ...DISCOVERY,
    ...LOOKUPS,
    'jisr_employee_basic_info_get',
    'jisr_attendance_summary_get',
    'jisr_attendance_logs_list',
    'jisr_employee_leave_summary_get',
  ],
  manager: [
    ...DISCOVERY,
    ...LOOKUPS,
    'jisr_employees_list',
    'jisr_employee_basic_info_get',
    'jisr_attendance_summary_get',
    'jisr_attendance_logs_list',
    'jisr_employee_leave_summary_get',
  ],
  hr_operations: [
    ...DISCOVERY,
    ...LOOKUPS,
    'jisr_employees_list',
    'jisr_employee_basic_info_get',
    'jisr_attendance_summary_get',
    'jisr_attendance_logs_list',
    'jisr_employee_leave_summary_get',
    'jisr_accrual_transactions_list',
  ],
  finance: [...DISCOVERY, ...LOOKUPS],
  integration_admin: [...DISCOVERY, ...LOOKUPS, 'jisr_webhooks_list', 'jisr_audit_events_list'],
  auditor: [...DISCOVERY, ...LOOKUPS, 'jisr_audit_events_list'],
  platform_operator: [...DISCOVERY],
};

function surfaceFor(profile: RoleProfile, financeSurfaceEnabled: boolean): string[] {
  const registry = new ToolRegistry();
  registerReadTools(registry);
  const context: AuthorizationContext = {
    principal: createPrincipal({ organizationId: ORG, profile }),
    flags: createFeatureFlags({ financeSurfaceEnabled }),
    observed: UNPROBED,
  };
  return registry
    .listFor(context as never)
    .map((tool) => tool.name)
    .sort();
}

describe('with the finance surface disabled', () => {
  it.each(ROLE_PROFILES)('gives %s exactly its expected tools', (profile) => {
    expect(surfaceFor(profile, false)).toEqual([...EXPECTED[profile]].sort());
  });

  it.each(ROLE_PROFILES)('shows %s no financial tool at all', (profile) => {
    const surface = surfaceFor(profile, false);
    for (const tool of FINANCIAL) expect(surface).not.toContain(tool);
  });
});

describe('with the finance surface enabled', () => {
  it('adds all six financial tools for the finance profile, and only then', () => {
    const surface = surfaceFor('finance', true);
    for (const tool of FINANCIAL) expect(surface).toContain(tool);
    expect(surface).toEqual([...EXPECTED.finance, ...FINANCIAL].sort());
  });

  it.each(ROLE_PROFILES.filter((p) => p !== 'finance'))(
    'still shows %s no financial tool',
    (profile) => {
      const surface = surfaceFor(profile, true);
      for (const tool of FINANCIAL) expect(surface).not.toContain(tool);
    },
  );

  it('leaves every non-finance surface completely unchanged', () => {
    // Enabling the surface must not widen anyone else's access by a single tool.
    for (const profile of ROLE_PROFILES) {
      if (profile === 'finance') continue;
      expect(surfaceFor(profile, true)).toEqual(surfaceFor(profile, false));
    }
  });
});

describe('matrix completeness', () => {
  it('covers all 23 tools across the seven profiles', () => {
    const registry = new ToolRegistry();
    registerReadTools(registry);
    expect(registry.all()).toHaveLength(23);

    const reachable = new Set(ROLE_PROFILES.flatMap((p) => surfaceFor(p, true)));
    // Every tool must be reachable by someone; an unreachable tool is dead code.
    expect(reachable.size).toBe(23);
  });

  it('gives the platform operator no organization data whatsoever', () => {
    expect(surfaceFor('platform_operator', true)).toEqual([...DISCOVERY].sort());
  });
});

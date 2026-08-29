/**
 * Collection scoping (spec FR-018a, FR-019a).
 *
 * Authorization says whether a caller may run `jisr_employees_list`. This says
 * which employees come back. Without it, a manager authorized for the tool
 * receives the entire organization -- the hole the second analysis pass found.
 *
 * Every case here fails CLOSED: where the data needed to decide is missing, the
 * record is excluded.
 */

import { describe, expect, it } from 'vitest';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import {
  scopeToReachable,
  type RecordIdentity,
} from '../../src/core/authorization/reachability.js';
import { ROLE_PROFILES, type RoleProfile } from '../../src/core/authorization/role-profiles.js';

const ORG = 'org-abcdef123456';
const MANAGER = 'uuid-manager-7';

interface Row {
  readonly id: string;
  readonly code: number;
  readonly managerId: string | null;
}

const ROWS: Row[] = [
  { id: MANAGER, code: 7, managerId: 'uuid-director-1' }, // the manager themselves
  { id: 'uuid-report-a', code: 101, managerId: MANAGER }, // direct report
  { id: 'uuid-report-b', code: 102, managerId: MANAGER }, // direct report
  { id: 'uuid-indirect', code: 103, managerId: 'uuid-report-a' }, // reports to a report
  { id: 'uuid-stranger', code: 104, managerId: 'uuid-other-9' }, // unrelated
  { id: 'uuid-orphan', code: 105, managerId: null }, // no manager recorded
];

const identify = (row: Row): RecordIdentity => ({
  employeeId: row.id,
  employeeCode: row.code,
  lineManagerId: row.managerId,
});

function scope(profile: RoleProfile, subjectEmployeeId?: string) {
  const principal = createPrincipal(
    subjectEmployeeId === undefined
      ? { organizationId: ORG, profile }
      : { organizationId: ORG, profile, subjectEmployeeId },
  );
  return scopeToReachable(ROWS, principal, identify);
}

describe('manager profile', () => {
  it('returns the manager plus direct reports only', () => {
    const ids = scope('manager', MANAGER).records.map((r) => r.id);
    expect(ids).toEqual([MANAGER, 'uuid-report-a', 'uuid-report-b']);
  });

  it('excludes indirect reports -- no reporting tree is derived', () => {
    // Jisr exposes a single-level line_manager. A wider tree would have to be
    // derived and then trusted for an authorization decision (spec FR-019a).
    expect(scope('manager', MANAGER).records.map((r) => r.id)).not.toContain('uuid-indirect');
  });

  it('excludes unrelated employees and those with no manager recorded', () => {
    const ids = scope('manager', MANAGER).records.map((r) => r.id);
    expect(ids).not.toContain('uuid-stranger');
    expect(ids).not.toContain('uuid-orphan');
  });

  it('returns nothing when the caller has no subject identity', () => {
    // Fails closed. An authorization decision on absent data is never "allow".
    expect(scope('manager').records).toHaveLength(0);
  });
});

describe('employee_self profile', () => {
  it('returns only the caller', () => {
    expect(scope('employee_self', MANAGER).records.map((r) => r.id)).toEqual([MANAGER]);
  });

  it('returns nothing without a subject identity', () => {
    expect(scope('employee_self').records).toHaveLength(0);
  });

  it('does not return direct reports', () => {
    expect(scope('employee_self', MANAGER).records.map((r) => r.id)).not.toContain('uuid-report-a');
  });
});

describe('organization-wide profiles', () => {
  it.each(['hr_operations', 'finance', 'auditor', 'integration_admin'] as RoleProfile[])(
    '%s sees the whole collection',
    (profile) => {
      expect(scope(profile).records).toHaveLength(ROWS.length);
    },
  );
});

describe('platform_operator', () => {
  it('receives no organization records at all', () => {
    // Infrastructure access confers no data access (spec FR-021).
    expect(scope('platform_operator').records).toHaveLength(0);
  });
});

describe('disclosure through counts', () => {
  it('reports only how many were withheld, never which', () => {
    const result = scope('manager', MANAGER);
    expect(result.removed).toBe(3);
    const serialized = JSON.stringify(result.warnings);
    for (const leaked of ['uuid-stranger', 'uuid-indirect', 'uuid-orphan', '104', '105']) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it('every profile either sees a record or has it removed -- none are silently dropped', () => {
    for (const profile of ROLE_PROFILES) {
      const result = scope(profile, MANAGER);
      expect(result.records.length + result.removed).toBe(ROWS.length);
    }
  });
});

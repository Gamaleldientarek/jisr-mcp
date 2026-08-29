/**
 * The salary-leak test (quickstart V4, research R2, spec SC-013).
 *
 * The single most important test in this project.
 *
 * Jisr returns `basic_salary`, `first_salary_pay_date` and
 * `last_salary_pay_date` inside the ORDINARY employee list whenever the
 * connected API key holds "Get Employee Financial Info". Upstream visibility is
 * governed by the KEY, not by the CALLER.
 *
 * So the scenario below is not exotic -- it is what happens the first time an
 * operator creates one convenient key with broad permissions. If this test ever
 * fails, salary data is reaching people who are not authorized to see it.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { allowedClassifications } from '../../src/core/authorization/field-policy.js';
import type { RoleProfile } from '../../src/core/authorization/role-profiles.js';
import { mapEmployees } from '../../src/core/jisr/mappers/employees.js';
import type { UpstreamEmployee } from '../../src/core/jisr/schemas/employees.js';

/** What a finance-permissioned key actually returns from GET /employees. */
const UPSTREAM: UpstreamEmployee[] = [
  {
    employee_id: 'bab6cd98-7246-4cfc-a576-19bc00391792',
    code: 102,
    full_name_en: 'Sara Al-Otaibi',
    full_name_ar: 'سارة العتيبي',
    email: 'sara@example.test',
    status: 'active',
    is_active: true,
    department: { id: 3, name_en: 'Finance', name_ar: 'المالية' },
    line_manager: { id: 7, name: 'Omar Al-Harbi' },

    // employee_sensitive
    passport_number: 'A1234567',
    document_number: 'D998877',
    date_of_birth: '1990-04-02',
    address: { home_city: 'Riyadh' },

    // financial_confidential -- present because the KEY permits it
    basic_salary: 24000,
    first_salary_pay_date: '2021-03-01',
    last_salary_pay_date: null,
  },
];

const SALARY_KEYS = ['basicSalary', 'firstSalaryPayDate', 'lastSalaryPayDate'] as const;
const SENSITIVE_KEYS = ['passportNumber', 'documentNumber', 'dateOfBirth', 'address'] as const;

const financeOff = createFeatureFlags({ financeSurfaceEnabled: false });
const financeOn = createFeatureFlags({ financeSurfaceEnabled: true });

function keysFor(profile: RoleProfile, flags = financeOff): string[] {
  const result = mapEmployees(UPSTREAM, allowedClassifications(profile, flags));
  return Object.keys(result.records[0] ?? {});
}

describe('employee list: financial field leak', () => {
  const nonFinance: RoleProfile[] = [
    'employee_self',
    'manager',
    'hr_operations',
    'integration_admin',
    'auditor',
  ];

  it.each(nonFinance)('withholds salary from %s when the key permits it', (profile) => {
    const keys = keysFor(profile);
    for (const key of SALARY_KEYS) expect(keys).not.toContain(key);
  });

  it.each(nonFinance)('withholds salary from %s even with the finance surface on', (profile) => {
    // Enabling the surface must not widen anyone else's access. Two independent
    // conditions, not one (spec FR-023a).
    const keys = keysFor(profile, financeOn);
    for (const key of SALARY_KEYS) expect(keys).not.toContain(key);
  });

  it('withholds salary from the finance profile while the surface is disabled', () => {
    const keys = keysFor('finance', financeOff);
    for (const key of SALARY_KEYS) expect(keys).not.toContain(key);
  });

  it('returns salary only to the finance profile with the surface enabled', () => {
    const keys = keysFor('finance', financeOn);
    for (const key of SALARY_KEYS) expect(keys).toContain(key);
  });

  it('gives the platform operator no employee data at all', () => {
    expect(keysFor('platform_operator', financeOn)).toHaveLength(0);
  });

  it('reports the redaction rather than silently dropping fields', () => {
    const result = mapEmployees(UPSTREAM, allowedClassifications('hr_operations', financeOff));
    expect(result.isPartial).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('FIELDS_REDACTED');
  });

  it('never emits a salary value anywhere in the serialized result', () => {
    // Key-name assertions miss a value that arrives under an unexpected key.
    const result = mapEmployees(UPSTREAM, allowedClassifications('hr_operations', financeOff));
    expect(JSON.stringify(result.records)).not.toContain('24000');
    expect(JSON.stringify(result.records)).not.toContain('2021-03-01');
  });
});

describe('employee list: sensitive identity fields', () => {
  it('withholds passport, document number, date of birth and address by default', () => {
    for (const profile of ['hr_operations', 'manager', 'finance'] as RoleProfile[]) {
      const keys = keysFor(profile, financeOn);
      for (const key of SENSITIVE_KEYS) expect(keys).not.toContain(key);
    }
  });
});

describe('employee list: everyday fields still work', () => {
  it('returns both language forms of the name intact', () => {
    const result = mapEmployees(UPSTREAM, allowedClassifications('hr_operations', financeOff));
    expect(result.records[0]?.fullNameEn).toBe('Sara Al-Otaibi');
    // Arabic is returned as recorded, never transliterated (spec User Story 2).
    expect(result.records[0]?.fullNameAr).toBe('سارة العتيبي');
  });

  it('withholds unknown upstream fields and reports them as drift', () => {
    const withDrift = [
      { ...UPSTREAM[0], some_new_field: 'unexpected' },
    ] as unknown as UpstreamEmployee[];
    const result = mapEmployees(withDrift, allowedClassifications('hr_operations', financeOff));
    expect(JSON.stringify(result.records)).not.toContain('unexpected');
    expect(result.warnings.map((w) => w.code)).toContain('SCHEMA_DRIFT');
  });
});

/**
 * Arabic integrity (spec User Story 2 scenario 4, quickstart V10).
 *
 * This server targets Saudi organizations. Arabic names are not an edge case,
 * they are half the data -- and a name that arrives mangled or transliterated
 * is unusable for the follow-up lookup it exists to enable.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { allowedClassifications } from '../../src/core/authorization/field-policy.js';
import { mapEmployees } from '../../src/core/jisr/mappers/employees.js';
import type { UpstreamEmployee } from '../../src/core/jisr/schemas/employees.js';

const ARABIC_NAMES = ['سارة العتيبي', 'محمد عبد الله', 'فاطمة الزهراني', 'عبدالرحمن بن سعيد'];

const allowed = allowedClassifications(
  'hr_operations',
  createFeatureFlags({ financeSurfaceEnabled: false }),
);

describe('employee names', () => {
  it.each(ARABIC_NAMES)('returns %s byte-identical', (name) => {
    const upstream = [
      { employee_id: 'x', full_name_en: 'Latin Name', full_name_ar: name },
    ] as unknown as UpstreamEmployee[];

    const result = mapEmployees(upstream, allowed);
    expect(result.records[0]?.fullNameAr).toBe(name);
  });

  it('returns both language forms, never one in place of the other', () => {
    const upstream = [
      { employee_id: 'x', full_name_en: 'Sara Al-Otaibi', full_name_ar: ARABIC_NAMES[0] },
    ] as unknown as UpstreamEmployee[];

    const record = mapEmployees(upstream, allowed).records[0];
    expect(record?.fullNameEn).toBe('Sara Al-Otaibi');
    expect(record?.fullNameAr).toBe(ARABIC_NAMES[0]);
  });

  it('survives JSON serialization, which is how it reaches the client', () => {
    const upstream = [
      { employee_id: 'x', full_name_ar: ARABIC_NAMES[0] },
    ] as unknown as UpstreamEmployee[];

    const round = JSON.parse(JSON.stringify(mapEmployees(upstream, allowed).records)) as {
      fullNameAr: string;
    }[];
    expect(round[0]?.fullNameAr).toBe(ARABIC_NAMES[0]);
  });

  it('preserves a name that mixes Arabic and Latin characters', () => {
    const mixed = 'سارة (Sara) العتيبي';
    const upstream = [{ employee_id: 'x', full_name_ar: mixed }] as unknown as UpstreamEmployee[];
    expect(mapEmployees(upstream, allowed).records[0]?.fullNameAr).toBe(mixed);
  });
});

describe('localised reference fields', () => {
  it('returns both name forms on nested references', () => {
    const upstream = [
      {
        employee_id: 'x',
        department: { id: 3, name_en: 'Finance', name_ar: 'المالية' },
      },
    ] as unknown as UpstreamEmployee[];

    const record = mapEmployees(upstream, allowed).records[0];
    expect(record?.department?.nameEn).toBe('Finance');
    expect(record?.department?.nameAr).toBe('المالية');
  });
});

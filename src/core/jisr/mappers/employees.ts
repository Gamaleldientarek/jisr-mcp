/**
 * Upstream employee record -> normalized output (spec FR-026, research R2).
 *
 * An ALLOWLIST, never a passthrough. Jisr returns `basic_salary`,
 * `first_salary_pay_date` and `last_salary_pay_date` inside the ordinary
 * employee list whenever the connected API key holds "Get Employee Financial
 * Info" -- documented upstream behaviour, governed by the KEY, not the CALLER.
 *
 * A single broadly-permissioned key -- exactly what a convenience-minded
 * self-hoster creates -- would otherwise put salary in front of every caller.
 * This mapper is the reason that cannot happen.
 */

import {
  applyFieldPolicy,
  EMPLOYEE_FIELD_CLASSIFICATIONS,
  type Classification,
} from '../../authorization/field-policy.js';
import { WARNING_CODES, type Warning } from '../../envelope.js';
import { SNAPSHOT_VERSION } from '../endpoint-manifest.js';
import { driftWarning, recordDrift } from '../schemas/drift.js';
import type { UpstreamEmployee } from '../schemas/employees.js';

export interface LocalisedRef {
  readonly id: number | string | null;
  readonly nameEn: string | null;
  readonly nameAr: string | null;
}

export interface NormalizedEmployee {
  readonly employeeId: string | null;
  readonly employeeCode: number | string | null;
  /** Both language forms. Arabic is never transliterated (spec User Story 2). */
  readonly fullNameEn: string | null;
  readonly fullNameAr: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly status?: string | null;
  readonly isActive?: boolean | null;
  readonly joiningDate?: string | null;
  readonly jobTitle?: LocalisedRef | null;
  readonly department?: LocalisedRef | null;
  readonly businessUnit?: LocalisedRef | null;
  readonly employmentType?: LocalisedRef | null;
  readonly location?: LocalisedRef | null;
  readonly nationality?: LocalisedRef | null;
  readonly lineManager?: { id: number | string | null; name: string | null } | null;
  /** Present only for a finance caller with the finance surface enabled. */
  readonly basicSalary?: number | string | null;
  readonly firstSalaryPayDate?: string | null;
  readonly lastSalaryPayDate?: string | null;
}

function localised(value: unknown): LocalisedRef | null {
  if (typeof value !== 'object' || value === null) return null;
  const ref = value as Record<string, unknown>;
  return {
    id: (ref['id'] as number | string | null | undefined) ?? null,
    nameEn: (ref['name_en'] as string | null | undefined) ?? null,
    nameAr: (ref['name_ar'] as string | null | undefined) ?? null,
  };
}

/** Upstream field -> normalized key. Only listed fields can ever be emitted. */
const FIELD_MAP: Readonly<Record<string, keyof NormalizedEmployee>> = {
  // Live Jisr sends `id`; the documentation says `employee_id`. Both map to the
  // same normalized field, so a caller sees one stable identifier either way.
  id: 'employeeId',
  employee_id: 'employeeId',
  code: 'employeeCode',
  full_name_en: 'fullNameEn',
  full_name_ar: 'fullNameAr',
  email: 'email',
  telephone: 'telephone',
  status: 'status',
  is_active: 'isActive',
  joining_date: 'joiningDate',
  job_title: 'jobTitle',
  department: 'department',
  business_unit: 'businessUnit',
  employment_type: 'employmentType',
  location: 'location',
  nationality: 'nationality',
  line_manager: 'lineManager',
  basic_salary: 'basicSalary',
  first_salary_pay_date: 'firstSalaryPayDate',
  last_salary_pay_date: 'lastSalaryPayDate',
};

const REF_FIELDS = new Set([
  'job_title',
  'department',
  'business_unit',
  'employment_type',
  'location',
  'nationality',
]);

export interface MapResult {
  readonly records: readonly NormalizedEmployee[];
  readonly warnings: readonly Warning[];
  readonly isPartial: boolean;
}

export function mapEmployees(
  upstream: readonly UpstreamEmployee[],
  allowed: ReadonlySet<Classification>,
): MapResult {
  const redactedOverall = new Set<Classification>();
  const driftOverall = new Set<string>();

  const records = upstream.map((raw) => {
    const policy = applyFieldPolicy(raw, EMPLOYEE_FIELD_CLASSIFICATIONS, allowed);
    for (const c of policy.redacted) redactedOverall.add(c);
    for (const f of policy.unclassified) driftOverall.add(f);

    const out: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(policy.record)) {
      const key = FIELD_MAP[field];
      // Classified but unmapped: withheld. The registry and the map must agree,
      // and where they do not, the narrower one wins.
      if (key === undefined) continue;

      if (REF_FIELDS.has(field)) {
        out[key] = localised(value);
      } else if (field === 'line_manager') {
        const manager = value as Record<string, unknown> | null;
        out[key] =
          manager === null || manager === undefined
            ? null
            : {
                id: (manager['id'] as number | string | null | undefined) ?? null,
                name: (manager['name'] as string | null | undefined) ?? null,
              };
      } else {
        out[key] = value;
      }
    }
    return out as unknown as NormalizedEmployee;
  });

  const warnings: Warning[] = [];
  if (redactedOverall.size > 0) {
    warnings.push({
      code: WARNING_CODES.FIELDS_REDACTED,
      message: `Withheld field groups your authorization does not cover: ${[...redactedOverall].sort().join(', ')}.`,
    });
  }
  if (driftOverall.size > 0) {
    // Paths are recorded for operators; the caller is told only the count. The
    // value of an unknown field is the part that might be sensitive, and even a
    // field NAME can disclose what Jisr now holds (spec FR-027).
    recordDrift('listEmployees', [...driftOverall], SNAPSHOT_VERSION);
    warnings.push(driftWarning(driftOverall.size));
  }

  return { records, warnings, isPartial: warnings.length > 0 };
}

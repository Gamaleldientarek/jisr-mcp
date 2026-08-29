/**
 * Data classification and field policy (spec FR-024, FR-026, FR-027, FR-028).
 *
 * Constitution Principle III: every field carries a classification assigned
 * before it can be returned or logged. A field absent from the registry is not
 * "probably fine" -- it is unclassified, and unclassified means withheld.
 *
 * This is an allowlist. That distinction is load-bearing: Jisr returns salary
 * fields inside the ORDINARY employee list whenever the connected key holds
 * finance permission (research R2). A passthrough mapper with a denylist would
 * leak them to every caller the first time an operator created a broad key.
 */

import type { FeatureFlags } from '../../config/feature-flags.js';
import type { RoleProfile } from './role-profiles.js';

export type Classification =
  | 'public_reference'
  | 'internal_operational'
  | 'employee_personal'
  | 'employee_sensitive'
  | 'financial_confidential'
  | 'authentication_secret';

/**
 * Employee field classifications (data-model §3).
 * Every field the employee schema declares appears here. The registry and the
 * schema are kept in step by a test, not by discipline.
 */
export const EMPLOYEE_FIELD_CLASSIFICATIONS: Readonly<Record<string, Classification>> = {
  employee_id: 'internal_operational',
  code: 'internal_operational',
  status: 'internal_operational',
  is_active: 'internal_operational',
  is_invited: 'internal_operational',
  joining_date: 'internal_operational',
  created_at: 'internal_operational',
  updated_at: 'internal_operational',
  last_active_time: 'internal_operational',
  working_experience_period: 'internal_operational',
  job_title: 'internal_operational',
  department: 'internal_operational',
  business_unit: 'internal_operational',
  employment_type: 'internal_operational',
  location: 'internal_operational',
  line_manager: 'internal_operational',

  full_name_en: 'employee_personal',
  full_name_ar: 'employee_personal',
  email: 'employee_personal',
  telephone: 'employee_personal',
  avatar: 'employee_personal',
  nationality: 'employee_personal',

  gender: 'employee_sensitive',
  marital_status: 'employee_sensitive',
  date_of_birth: 'employee_sensitive',
  passport_number: 'employee_sensitive',
  document_number: 'employee_sensitive',
  address: 'employee_sensitive',

  basic_salary: 'financial_confidential',
  first_salary_pay_date: 'financial_confidential',
  last_salary_pay_date: 'financial_confidential',
};

/** Webhook subscription fields that hold authentication material (schemas/webhooks.ts). */
export const WEBHOOK_FIELD_CLASSIFICATIONS: Readonly<Record<string, Classification>> = {
  id: 'internal_operational',
  name: 'internal_operational',
  description: 'internal_operational',
  endpoint: 'internal_operational',
  http_method: 'internal_operational',
  request_format: 'internal_operational',
  status: 'internal_operational',
  actions: 'internal_operational',
  organization: 'internal_operational',
  agreegator: 'internal_operational',
  created_at: 'internal_operational',
  updated_at: 'internal_operational',

  auth_data: 'authentication_secret',
  auth_type: 'authentication_secret',
  auth_position: 'authentication_secret',
  custom_header: 'authentication_secret',
};

/**
 * What a caller may receive.
 *
 * `authentication_secret` appears in no branch. It is never returned, in any
 * mode, to any profile (spec FR-025) -- so it is simply absent from the
 * calculation rather than conditionally excluded.
 *
 * `employee_sensitive` is likewise absent: identity documents and home
 * addresses require a documented product purpose and legal basis that this
 * release does not claim (spec FR-024). Withheld from everyone for now.
 */
export function allowedClassifications(
  profile: RoleProfile,
  flags: FeatureFlags,
): ReadonlySet<Classification> {
  if (profile === 'platform_operator') {
    // Infrastructure access confers no organization data access (spec FR-021).
    return new Set();
  }

  const allowed = new Set<Classification>(['public_reference', 'internal_operational']);

  if (profile !== 'integration_admin') {
    allowed.add('employee_personal');
  }

  // Two independent conditions, deliberately not collapsed: holding the finance
  // profile is not sufficient, and enabling the surface is not sufficient
  // (spec FR-023a).
  if (profile === 'finance' && flags.financeSurfaceEnabled) {
    allowed.add('financial_confidential');
  }

  return allowed;
}

export interface PolicyResult<T> {
  readonly record: T;
  /** Classifications actually withheld from this record. */
  readonly redacted: ReadonlySet<Classification>;
  /** Field names present upstream but absent from the registry -- drift. */
  readonly unclassified: readonly string[];
}

/**
 * Applies the registry to one upstream record.
 *
 * A field is emitted only if it is classified AND its classification is
 * allowed. Anything else is dropped -- unknown fields included, which is spec
 * FR-027 falling out of the same mechanism rather than needing its own.
 */
export function applyFieldPolicy(
  record: Readonly<Record<string, unknown>>,
  registry: Readonly<Record<string, Classification>>,
  allowed: ReadonlySet<Classification>,
): PolicyResult<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const redacted = new Set<Classification>();
  const unclassified: string[] = [];

  for (const [field, value] of Object.entries(record)) {
    const classification = registry[field];

    if (classification === undefined) {
      unclassified.push(field);
      continue;
    }
    if (!allowed.has(classification)) {
      // Only report a redaction when a value was actually present. A null field
      // the caller could not have seen anyway is not a redaction.
      if (value !== undefined && value !== null) redacted.add(classification);
      continue;
    }
    out[field] = value;
  }

  return { record: out, redacted, unclassified };
}

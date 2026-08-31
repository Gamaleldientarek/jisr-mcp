/**
 * Write request/response schemas (feature 002), from the snapshot's prose
 * tables -- the reliable half of Jisr's documentation (research W1).
 *
 * Responses are loose for the same reason every read schema is: an undeclared
 * field must be SEEN to be recorded as drift.
 */

import { z } from 'zod';
import { employeeSchema } from './employees.js';

/**
 * One punch, as POST /attendance_logs expects inside `data: []`.
 * `emp_code` is documented as Integer; the live tenant uses "AZMX117". Both are
 * accepted and sent as-is -- the live window decides what Jisr truly takes.
 */
export interface PunchSubmission {
  readonly terminal_sn: string;
  readonly punch_time: string;
  /** Meaning unverified -- possibly Jisr's own idempotency handle (research W1). */
  readonly id: number;
  readonly emp_code: string | number;
}

export const punchCreateResponseSchema = z.looseObject({
  // Documented success shape: { success: true, message: null, data: null }
  noop: z.never().optional(),
});

export const employeeCreateResponseSchema = z.looseObject({
  /**
   * The documented example returns the created employee with `id: null` --
   * the post-write re-read may be the only source of the UUID (research W1).
   */
  employee: employeeSchema.optional(),
});

/** Body fields for POST /employees, exactly the documented set. */
export interface EmployeeSubmission {
  readonly code: string | number;
  readonly full_name_en: string;
  readonly full_name_ar: string;
  readonly department_id?: string | number;
  readonly employment_type_id?: string | number;
  readonly location_id?: string | number;
  readonly nationality_id?: string | number;
  readonly joining_date?: string;
  readonly email?: string;
  readonly gender?: 'Male' | 'Female';
  readonly marital_status?: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  readonly document_number?: string;
  readonly contract_type?: 'Fixed term' | 'Indefinite';
  readonly contract_period?: '1 year' | '2 years' | 'Custom';
  readonly end_date?: string;
}

export const payrollDeleteResponseSchema = z.looseObject({
  noop: z.never().optional(),
});

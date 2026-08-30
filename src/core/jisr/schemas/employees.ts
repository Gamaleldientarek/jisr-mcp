/**
 * Employee schemas (data-model §3), from snapshot 2026-08-29.
 *
 * The three salary fields are declared because Jisr RETURNS them in the
 * ordinary employee list whenever the connected key holds "Get Employee
 * Financial Info" -- documented upstream behaviour, not drift (research R2).
 *
 * Declaring them here is how they get validated and then deliberately dropped
 * by the mapper. A schema that omitted them would classify them as drift and
 * mark every response partial for finance-permissioned keys.
 */

import { z } from 'zod';
import { collection, localisedRefSchema, namedRefSchema, paginationSchema } from './common.js';

/**
 * The home address block.
 *
 * Deliberately untyped beyond "an object": live data mixes types field by field
 * (building_number arrives as a number for some employees and a string for
 * others, verified 2026-08-31). The block is EMPLOYEE_SENSITIVE and withheld
 * from every caller, so strict typing here buys nothing and a single oddly
 * typed field would fail the whole page.
 */
export const employeeAddressSchema = z.record(z.string(), z.unknown());

/**
 * Deliberately LOOSE.
 *
 * A strict z.object() silently strips unknown keys, which would defeat drift
 * detection entirely: an undeclared field would vanish at the schema boundary
 * and never reach the mapper that records it. Verified against live Jisr, which
 * returns `bank` -- banking details -- that this schema does not declare.
 *
 * Safety still comes from the mapper's allowlist, not from Zod. Loose parsing
 * only ensures the unknown field is SEEN so it can be recorded (spec FR-027).
 */
export const employeeSchema = z.looseObject({
  // Identity.
  // Live Jisr returns the UUID as `id`, not `employee_id` -- verified against
  // the AZMX tenant on 2026-08-30. Both are accepted: the documented name and
  // the one actually returned.
  id: z.string().nullable().optional(),
  employee_id: z.string().nullable().optional(),
  code: z.union([z.number(), z.string()]).nullable().optional(),

  // Both language forms are returned. Arabic is authoritative for Arabic output
  // and is never transliterated (spec User Story 2).
  full_name_en: z.string().nullable().optional(),
  full_name_ar: z.string().nullable().optional(),

  email: z.string().nullable().optional(),
  telephone: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),

  // Operational
  status: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  is_invited: z.boolean().nullable().optional(),
  joining_date: z.string().nullable().optional(),
  terminate_date: z.string().nullable().optional(),
  delete_date: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  last_active_time: z.string().nullable().optional(),
  working_experience_period: z.union([z.string(), z.number()]).nullable().optional(),

  job_title: localisedRefSchema.nullable().optional(),
  department: localisedRefSchema.nullable().optional(),
  business_unit: localisedRefSchema.nullable().optional(),
  employment_type: localisedRefSchema.nullable().optional(),
  location: localisedRefSchema.nullable().optional(),
  nationality: localisedRefSchema.nullable().optional(),
  line_manager: namedRefSchema.nullable().optional(),

  // Employee-sensitive: withheld by default (data-model §3)
  gender: z.string().nullable().optional(),
  marital_status: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  passport_number: z.string().nullable().optional(),
  document_number: z.string().nullable().optional(),
  address: employeeAddressSchema.nullable().optional(),

  // Financial-confidential, conditional upstream (research R2).
  // `bank` is undocumented but returned live: banking details, treated as
  // financial-confidential and never mapped outward.
  bank: z.unknown().optional(),
  basic_salary: z.union([z.number(), z.string()]).nullable().optional(),
  first_salary_pay_date: z.string().nullable().optional(),
  last_salary_pay_date: z.string().nullable().optional(),
});

export type UpstreamEmployee = z.infer<typeof employeeSchema>;

export const employeesListSchema = collection('employees', employeeSchema);
export const employeeBasicInfoSchema = z.object({
  employee: employeeSchema,
  pagination: paginationSchema.optional(),
});

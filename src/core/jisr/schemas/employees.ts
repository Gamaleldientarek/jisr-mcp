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

export const employeeAddressSchema = z.object({
  address_en: z.string().nullable().optional(),
  address_ar: z.string().nullable().optional(),
  building_number: z.string().nullable().optional(),
  street_name: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  home_city: z.string().nullable().optional(),
  home_postal_code: z.string().nullable().optional(),
  home_country: z.string().nullable().optional(),
  home_po_box: z.string().nullable().optional(),
  saudi_city: z.string().nullable().optional(),
  saudi_postal_code: z.string().nullable().optional(),
  saudi_country: z.string().nullable().optional(),
});

export const employeeSchema = z.object({
  // Identity
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

  // Financial-confidential, conditional upstream (research R2)
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

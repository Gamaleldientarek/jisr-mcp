/**
 * Accrual transactions, from snapshot 2026-08-29.
 *
 * The documented schema is incomplete (plan > Open Dependencies). Only fields
 * the snapshot declares are modelled; anything else is drift and is withheld
 * rather than exposed (spec FR-027).
 */
import { z } from 'zod';
import { namedRefSchema, paginationSchema } from './common.js';

const amount = z.union([z.number(), z.string()]).nullable().optional();

export const accrualEmployeeSchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  code: z.union([z.number(), z.string()]).nullable().optional(),
  full_name_en: z.string().nullable().optional(),
  full_name_ar: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  status: z.string().nullable().optional(),
  payment_type: z.string().nullable().optional(),
  business_unit: namedRefSchema.nullable().optional(),
  grade: namedRefSchema.nullable().optional(),
  country: namedRefSchema.nullable().optional(),
  gosi_info: z
    .object({ gosi_number: z.union([z.number(), z.string()]).nullable().optional() })
    .nullable()
    .optional(),
  accrual: z
    .object({
      amount,
      downgrade_amount: amount,
      vacation_days: amount,
      has_vacation_days: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const accrualTransactionsSchema = z.object({
  pay_period: z.string().nullable().optional(),
  employees: z.array(accrualEmployeeSchema),
  pagination: paginationSchema.optional(),
});

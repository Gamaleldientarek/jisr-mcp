/**
 * Finance schemas, from snapshot 2026-08-29.
 * Every shape here is FINANCIAL_CONFIDENTIAL (data-model §5).
 */
import { z } from 'zod';
import { collection, namedRefSchema, paginationSchema } from './common.js';

const money = z.union([z.number(), z.string()]).nullable().optional();

export const monthlyPayableSchema = z.object({
  employee_id: z.union([z.number(), z.string()]).nullable().optional(),
  pay_period_start: z.string().nullable().optional(),
  pay_period_end: z.string().nullable().optional(),
  net_salary: money,
  earnings_total: money,
  additions_total: money,
  deductions_total: money,
  earnings: z.unknown().optional(),
  additions: z.unknown().optional(),
  deductions: z.unknown().optional(),
  manual_remarks: z.string().nullable().optional(),
});

export const monthlyPayablesSchema = z.union([
  z.array(monthlyPayableSchema),
  z.object({ employees: z.array(monthlyPayableSchema), pagination: paginationSchema.optional() }),
]);

export const payrollTransactionSchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  paid_at: z.string().nullable().optional(),
  transaction_type: namedRefSchema.nullable().optional(),
  category: z.string().nullable().optional(),
  amount: money,
  is_retro: z.boolean().nullable().optional(),
  include_in_payrun: z.boolean().nullable().optional(),
  effective_date: z.string().nullable().optional(),
  pay_type: z.string().nullable().optional(),
  source_type: z.string().nullable().optional(),
});

export const payrollEmployeeSchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  code: z.union([z.number(), z.string()]).nullable().optional(),
  full_name_en: z.string().nullable().optional(),
  full_name_ar: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  payment_type: z.string().nullable().optional(),
  business_unit: namedRefSchema.nullable().optional(),
  grade: namedRefSchema.nullable().optional(),
  country: namedRefSchema.nullable().optional(),
  transactions: z.array(payrollTransactionSchema).optional(),
});

export const payrollTransactionsSchema = z.object({
  status: z.string().nullable().optional(),
  pay_period: z.string().nullable().optional(),
  employee_count: z.number().nullable().optional(),
  employees: z.array(payrollEmployeeSchema),
  pagination: paginationSchema.optional(),
});

export const glTransactionTypeSchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  gl_transaction_category: z.string().nullable().optional(),
  gl_transaction_name: z.string().nullable().optional(),
  gl_transaction_name_ar: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

export const glTransactionTypesSchema = collection('gl_transaction_types', glTransactionTypeSchema);

export const paygroupSchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  name: z.string().nullable().optional(),
});

export const paygroupsSchema = collection('paygroups', paygroupSchema);

/**
 * Accounting journal (GET /accounting/journals/{id}).
 *
 * The snapshot declares this response only as `type: object`, but documents a
 * complete EXAMPLE. The shape below is taken from that example -- documentation,
 * not inference. Anything outside it is drift and is withheld.
 *
 * Note `journal_lines[].employee_name` and `employee_id`: employee personal data
 * inside a financial document, classified accordingly.
 */
export const journalLineSchema = z.object({
  account_id: z.string().nullable().optional(),
  account_name: z.string().nullable().optional(),
  transaction_name: z.string().nullable().optional(),
  cost_center_items: z.array(z.unknown()).optional(),
  employee_name: z.string().nullable().optional(),
  employee_id: z.union([z.string(), z.number()]).nullable().optional(),
  credit_amount: money,
  debit_amount: money,
  narrative: z.string().nullable().optional(),
});

export const journalSchema = z.object({
  id: z.string().nullable().optional(),
  journal_type: z.string().nullable().optional(),
  pay_period_start: z.string().nullable().optional(),
  pay_period_end: z.string().nullable().optional(),
  subsidiary: z.string().nullable().optional(),
  total_credit: money,
  total_debit: money,
  journal_lines: z.array(journalLineSchema).optional(),
  pagination: paginationSchema.optional(),
});

export const accountingJournalSchema = z.object({
  journal_export_request: z.object({
    id: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    query_params: z.unknown().optional(),
    journal_preparation_errors: z.unknown().nullable().optional(),
    journals: z.array(journalSchema).optional(),
  }),
});

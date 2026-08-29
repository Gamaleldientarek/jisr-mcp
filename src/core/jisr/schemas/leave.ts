/** Annual leave summary, from snapshot 2026-08-29. */
import { z } from 'zod';
import { collection } from './common.js';

const balance = z.union([z.number(), z.string()]).nullable().optional();

export const leaveSummarySchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  employee_code: z.union([z.number(), z.string()]).nullable().optional(),
  leave_type: z.string().nullable().optional(),
  leave_days: balance,
  previous_year_balance: balance,
  opening_balance: balance,
  manual_balance_adjustment: balance,
  used: balance,
  year_end_balance: balance,
  pending: balance,
  total_reserved_balances: balance,
  unpaid_leave_deduction: balance,
});

export const leaveSummaryListSchema = collection('leaves_summary', leaveSummarySchema);

/** Jisr accepts at most 100 employee codes per call (research R7). */
export const LEAVE_SUMMARY_MAX_CODES = 100;

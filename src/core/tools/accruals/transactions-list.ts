/** jisr_accrual_transactions_list (spec FR-007, FR-027). */
import { z } from 'zod';
import { listAccrualTransactions } from '../../services/accruals-service.js';
import { summarize } from '../../summary.js';
import { DEFAULT_PAGE_SIZE, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const accrualTransactionsTool: ToolDefinition<{
  accrualType: 'vacations' | 'end_of_service' | 'tickets_provision';
  paygroupId: string;
  payPeriod: string;
  pageSize?: number;
  cursor?: string;
}> = {
  name: 'jisr_accrual_transactions_list',
  title: 'List accrual transactions',
  description:
    'Lists accrual transactions per employee for one paygroup and pay period, including accrued amount, downgrade amount and vacation days. Requires a paygroup identifier, which comes from jisr_paygroups_list - a finance tool. Without the finance surface enabled, obtain the paygroup identifier separately.',
  inputShape: {
    // All three required by Jisr, though its specification marks them optional.
    accrualType: z
      .enum(['vacations', 'end_of_service', 'tickets_provision'])
      .describe('Required. The accrual type to retrieve.'),
    paygroupId: z
      .string()
      .describe('Required. A paygroup identifier, as returned by jisr_paygroups_list.'),
    payPeriod: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Required. First day of a confirmed month, e.g. 2026-08-01.'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(UPSTREAM_MAX_PAGE_SIZE)
      .optional()
      .describe(`Defaults to ${DEFAULT_PAGE_SIZE}.`),
    cursor: z.string().optional(),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational', 'employee_personal'],
  fieldGroupPurpose:
    'Accrual amounts with the employee name and code they belong to, so figures can be attributed.',
  handler: async (input, context) => {
    const { envelope } = await listAccrualTransactions(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

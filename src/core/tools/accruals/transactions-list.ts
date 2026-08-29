/** jisr_accrual_transactions_list (spec FR-007, FR-027). */
import { z } from 'zod';
import { listAccrualTransactions } from '../../services/accruals-service.js';
import { summarize } from '../../summary.js';
import { DEFAULT_PAGE_SIZE, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const accrualTransactionsTool: ToolDefinition<{
  accrualType?: string;
  payPeriod?: string;
  pageSize?: number;
  cursor?: string;
}> = {
  name: 'jisr_accrual_transactions_list',
  title: 'List accrual transactions',
  description:
    'Lists accrual transactions per employee for a pay period, including accrued amount, downgrade amount and vacation days. Only fields Jisr documents are returned.',
  inputShape: {
    accrualType: z.string().optional(),
    payPeriod: z.string().optional().describe('For example: 2026-08'),
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

/** jisr_employee_leave_summary_get (spec FR-034). */
import { z } from 'zod';
import { getLeaveSummary } from '../../services/leave-service.js';
import { summarize } from '../../summary.js';
import { LEAVE_SUMMARY_MAX_CODES } from '../../jisr/schemas/leave.js';
import { MAX_RECORDS_PER_INVOCATION, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const leaveSummaryTool: ToolDefinition<{
  employeeCodes: number[];
  leaveType: string;
  pageSize?: number;
}> = {
  name: 'jisr_employee_leave_summary_get',
  title: 'Get annual leave summary',
  description: `Retrieves leave balances for the given employees: opening balance, used, pending, reserved, year-end balance and unpaid deduction. Takes employee CODES (integers), not UUIDs. Jisr accepts at most ${LEAVE_SUMMARY_MAX_CODES} codes per upstream call; larger requests are split automatically up to ${MAX_RECORDS_PER_INVOCATION}.`,
  inputShape: {
    employeeCodes: z
      .array(z.number().int())
      .min(1)
      .max(MAX_RECORDS_PER_INVOCATION)
      .describe('Employee codes (integers), as returned by jisr_employees_list.'),
    // Required by Jisr even though its specification marks it optional.
    leaveType: z.string().describe('Required by Jisr. For example: annual'),
    pageSize: z.number().int().min(1).max(UPSTREAM_MAX_PAGE_SIZE).optional(),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational'],
  fieldGroupPurpose: 'Leave balances keyed by employee code. No personal or financial fields.',
  handler: async (input, context) => {
    const { envelope } = await getLeaveSummary(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

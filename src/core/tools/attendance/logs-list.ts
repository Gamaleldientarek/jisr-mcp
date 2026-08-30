/** jisr_attendance_logs_list (spec FR-007). */
import { z } from 'zod';
import { listAttendanceLogs } from '../../services/attendance-service.js';
import { summarize } from '../../summary.js';
import { DEFAULT_PAGE_SIZE, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const attendanceLogsTool: ToolDefinition<{
  status: 'success' | 'failed';
  from: string;
  to: string;
  pageSize?: number;
  cursor?: string;
}> = {
  name: 'jisr_attendance_logs_list',
  title: 'List attendance punches',
  description:
    'Lists individual attendance punches (clock-ins and clock-outs) in a time range, successful or failed. Timestamps must carry an explicit time zone.',
  inputShape: {
    // Required by Jisr even though its specification marks it optional.
    status: z
      .enum(['success', 'failed'])
      .describe('Required by Jisr. Whether to return successful or failed punches.'),
    from: z.string().describe('ISO-8601 start, with a zone: 2026-08-29T00:00:00Z'),
    to: z.string().describe('ISO-8601 end, with a zone: 2026-08-29T23:59:59Z'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(UPSTREAM_MAX_PAGE_SIZE)
      .optional()
      .describe(`Records per page, 1-${UPSTREAM_MAX_PAGE_SIZE}. Defaults to ${DEFAULT_PAGE_SIZE}.`),
    cursor: z.string().optional(),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational'],
  fieldGroupPurpose: 'Punch times and the employee code they belong to. No personal fields.',
  handler: async (input, context) => {
    const { envelope } = await listAttendanceLogs(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

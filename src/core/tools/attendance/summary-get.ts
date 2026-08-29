/**
 * jisr_attendance_summary_get (spec FR-007).
 *
 * Attendance totals over a date range. Durations are returned exactly as Jisr
 * reports them -- normalizing to minutes here would discard the source form,
 * and the two are not interchangeable when reconciling against Jisr's own UI.
 */

import { z } from 'zod';
import { getAttendanceSummary } from '../../services/attendance-service.js';
import { summarize } from '../../summary.js';
import { DEFAULT_PAGE_SIZE, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

export interface AttendanceSummaryArgs {
  employeeId?: string;
  status?: 'active' | 'inactive';
  from: string;
  to: string;
  pageSize?: number;
  cursor?: string;
}

export const attendanceSummaryTool: ToolDefinition<AttendanceSummaryArgs> = {
  name: 'jisr_attendance_summary_get',
  title: 'Get attendance summary',
  description:
    'Retrieves attendance totals for a date range: working hours, late arrivals and excuses, early departures, overtime, absence, leave days, off days and business trip days. Scoped to employees you are authorized to see.',
  inputShape: {
    employeeId: z.string().uuid().optional().describe('Limit to one employee, by UUID.'),
    status: z.enum(['active', 'inactive']).optional(),
    from: isoDate.describe('Start of the range, inclusive.'),
    to: isoDate.describe('End of the range, inclusive.'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(UPSTREAM_MAX_PAGE_SIZE)
      .optional()
      .describe(`Records per page, 1-${UPSTREAM_MAX_PAGE_SIZE}. Defaults to ${DEFAULT_PAGE_SIZE}.`),
    cursor: z.string().optional().describe('Pass pagination.nextCursor back unchanged.'),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational'],
  fieldGroupPurpose:
    'Attendance totals and the employee code they belong to. No personal or financial fields.',
  handler: async (input, context) => {
    const { envelope } = await getAttendanceSummary(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

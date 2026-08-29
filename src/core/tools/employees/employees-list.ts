/**
 * jisr_employees_list (spec FR-007, FR-018a, FR-026, research R2).
 *
 * The tool an adopter reaches for first, and the one the salary-leak defence
 * exists for: Jisr returns basic_salary here whenever the connected KEY holds
 * finance permission, regardless of who is asking.
 */

import { z } from 'zod';
import { listEmployees } from '../../services/employees-service.js';
import { summarize } from '../../summary.js';
import { DEFAULT_PAGE_SIZE, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .optional();

export interface EmployeesListArgs {
  status?: 'active' | 'inactive';
  createdFrom?: string;
  joiningFrom?: string;
  joiningTo?: string;
  terminationFrom?: string;
  terminationTo?: string;
  pageSize?: number;
  cursor?: string;
}

export const employeesListTool: ToolDefinition<EmployeesListArgs> = {
  name: 'jisr_employees_list',
  title: 'List employees',
  description:
    'Lists employees in the organization, scoped to those you are authorized to see. Returns names in both English and Arabic, department, job title, employment type, location and status. Salary and identity-document fields are not returned by this tool.',
  inputShape: {
    status: z.enum(['active', 'inactive']).optional(),
    createdFrom: isoDate.describe('Employees created on or after this date.'),
    joiningFrom: isoDate,
    joiningTo: isoDate,
    terminationFrom: isoDate,
    terminationTo: isoDate,
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(UPSTREAM_MAX_PAGE_SIZE)
      .optional()
      .describe(`Records per page, 1-${UPSTREAM_MAX_PAGE_SIZE}. Defaults to ${DEFAULT_PAGE_SIZE}.`),
    cursor: z
      .string()
      .optional()
      .describe('Pass pagination.nextCursor from a previous call, unchanged.'),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational', 'employee_personal'],
  fieldGroupPurpose:
    'Identifying and organizational information needed to find and refer to people. Financial and identity-document fields are excluded by policy, not by omission.',
  handler: async (input, context) => {
    const { envelope } = await listEmployees(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

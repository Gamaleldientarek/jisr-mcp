/**
 * jisr_employee_basic_info_get (spec FR-007).
 *
 * One employee by stable UUID. There is no name-based lookup: an ambiguous name
 * would have to be resolved by guessing, and a guess in an authorization-scoped
 * read is the wrong kind of helpful.
 */

import { z } from 'zod';
import { getEmployeeBasicInfo } from '../../services/employees-service.js';
import { summarize } from '../../summary.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const employeeBasicInfoTool: ToolDefinition<{ employeeId: string }> = {
  name: 'jisr_employee_basic_info_get',
  title: 'Get employee basic information',
  description:
    'Retrieves one employee by their Jisr employee UUID. Returns names in both English and Arabic, contact details, department, job title and status. Salary and identity-document fields are not returned by this tool.',
  inputShape: {
    employeeId: z
      .string()
      .uuid('employeeId must be a UUID. The integer employee code is a different identifier.')
      .describe('The employee UUID, as returned by jisr_employees_list.'),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational', 'employee_personal'],
  fieldGroupPurpose:
    'Identifying and organizational information for one person. Financial and identity-document fields are excluded by policy.',
  handler: async (input, context) => {
    const { envelope } = await getEmployeeBasicInfo(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

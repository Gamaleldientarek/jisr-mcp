/**
 * jisr_employee_create_prepare / _commit (feature 002, US2).
 *
 * The inputShape is the service's own validation schema, so the boundary and
 * the service enforce identical rules -- enum exactness included.
 */

import { z } from 'zod';
import {
  commitEmployeeCreate,
  employeeCreateInputShape,
  prepareEmployeeCreate,
  type EmployeeCreateInput,
} from '../../services/employees-write-service.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const employeeCreatePrepareTool: ToolDefinition<EmployeeCreateInput> = {
  name: 'jisr_employee_create_prepare',
  title: 'Prepare an employee record',
  description:
    'Validates and PREVIEWS a new employee record without writing anything: every lookup id is resolved live, names must have at least two parts, and an existing employee with the same code or exact name raises a duplicate warning. Returns a confirmation reference valid for 5 minutes.',
  inputShape: employeeCreateInputShape,
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational', 'employee_personal'],
  fieldGroupPurpose:
    'The preview echoes the fields the caller supplied and the lookup names they resolve to, so a human can confirm before anything is written.',
  handler: (input, context) => prepareEmployeeCreate(input, context),
};

export const employeeCreateCommitTool: ToolDefinition<{
  confirmationReference: string;
  acknowledgeDuplicates?: boolean;
}> = {
  name: 'jisr_employee_create_commit',
  title: 'Commit a prepared employee record',
  description:
    'Creates the employee previewed by jisr_employee_create_prepare. Takes only the confirmation reference; if the preview carried a duplicate warning, acknowledgeDuplicates: true is also required. Returns the record re-read from Jisr -- including the UUID when the create response itself carries none.',
  inputShape: {
    confirmationReference: z
      .string()
      .describe('The reference returned by the prepare tool. Single-use, 5-minute validity.'),
    acknowledgeDuplicates: z
      .boolean()
      .optional()
      .describe(
        'Required as true when the preview warned that an employee with the same code or name exists.',
      ),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  declaredFieldGroups: ['internal_operational', 'employee_personal'],
  fieldGroupPurpose:
    'The re-read record: UUID, code, names, status, joining date. Nothing beyond what confirms the creation.',
  handler: (input, context) => commitEmployeeCreate(input, context),
};

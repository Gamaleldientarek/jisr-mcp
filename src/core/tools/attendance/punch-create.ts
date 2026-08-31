/**
 * jisr_attendance_punch_create_prepare / _commit (feature 002, US1).
 *
 * The pair IS the consent flow: prepare reads, validates, and reserves;
 * commit takes only the reference (and, when repeating deliberately, the
 * duplicate acknowledgment) and submits the exact stashed payload.
 */

import { z } from 'zod';
import { commitPunchCreate, preparePunchCreate } from '../../services/attendance-write-service.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const punchCreatePrepareTool: ToolDefinition<{
  employeeCode: string | number;
  punchTime: string;
  terminalSerial?: string;
  reason: string;
}> = {
  name: 'jisr_attendance_punch_create_prepare',
  title: 'Prepare an attendance punch',
  description:
    'Validates and PREVIEWS a single attendance punch without writing anything. Returns a confirmation reference valid for 5 minutes; nothing reaches Jisr until the matching commit tool is called with it. No batch form exists.',
  inputShape: {
    employeeCode: z
      .union([z.string(), z.number()])
      .describe('The employee code the punch belongs to, e.g. AZMX117.'),
    punchTime: z
      .string()
      .describe('ISO-8601 with an explicit zone: 2026-08-29T09:00:00+03:00. Zone-less refuses.'),
    terminalSerial: z.string().optional().describe('Terminal serial. Defaults to "mcp".'),
    reason: z
      .string()
      .trim()
      .min(1)
      .describe('Why this punch is being recorded. Written to the audit trail.'),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational', 'employee_personal'],
  fieldGroupPurpose:
    'The preview names the employee (code and name) so a human can confirm the right person. No other personal fields.',
  handler: (input, context) => preparePunchCreate(input, context),
};

export const punchCreateCommitTool: ToolDefinition<{
  confirmationReference: string;
  acknowledgeDuplicate?: boolean;
}> = {
  name: 'jisr_attendance_punch_create_commit',
  title: 'Commit a prepared attendance punch',
  description:
    'Writes the punch previewed by jisr_attendance_punch_create_prepare. Takes only the confirmation reference; the payload is exactly the previewed one. Refuses expired, reused, or mismatched references. Returns the state re-read from Jisr after the write.',
  inputShape: {
    confirmationReference: z
      .string()
      .describe('The reference returned by the prepare tool. Single-use, 5-minute validity.'),
    acknowledgeDuplicate: z
      .boolean()
      .optional()
      .describe(
        'Set true ONLY when deliberately repeating an identical punch that was refused as a suspected duplicate.',
      ),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  declaredFieldGroups: ['internal_operational'],
  fieldGroupPurpose: 'The re-read punch record: time, code, terminal. No personal fields.',
  handler: (input, context) => commitPunchCreate(input, context),
};

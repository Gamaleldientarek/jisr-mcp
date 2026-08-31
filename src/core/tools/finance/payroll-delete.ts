/**
 * jisr_payroll_transaction_delete_prepare / _commit (feature 002, US3).
 *
 * DORMANT. Ships disabled; four gates stand between this pair and a deletion:
 * finance profile, finance surface, key permission, JISR_WRITE_PAYROLL_DELETE.
 * The commit is the only destructive-annotated tool in the server.
 */

import { z } from 'zod';
import {
  commitPayrollDelete,
  preparePayrollDelete,
} from '../../services/payroll-delete-service.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const payrollDeletePrepareTool: ToolDefinition<{
  transactionId: string | number;
  reason: string;
  payPeriod?: string;
}> = {
  name: 'jisr_payroll_transaction_delete_prepare',
  title: 'Prepare a payroll transaction deletion',
  description:
    'Re-reads ONE payroll transaction and previews it in full before deletion. Nothing is deleted by this tool. Returns a confirmation reference valid for 5 minutes; the deletion is irreversible once committed. No batch form exists.',
  inputShape: {
    transactionId: z
      .union([z.string(), z.number()])
      .describe('The single transaction to delete, from jisr_payroll_transactions_list.'),
    reason: z
      .string()
      .trim()
      .min(1)
      .describe('Why this transaction is being deleted. Written to the audit trail.'),
    payPeriod: z
      .string()
      .optional()
      .describe('Optional pay period (YYYY-MM) to scope the re-read scan.'),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational', 'financial_confidential'],
  fieldGroupPurpose:
    'The preview shows the full transaction (amount included) so a human confirms exactly what dies.',
  handler: (input, context) => preparePayrollDelete(input, context),
};

export const payrollDeleteCommitTool: ToolDefinition<{
  confirmationReference: string;
}> = {
  name: 'jisr_payroll_transaction_delete_commit',
  title: 'Commit a prepared payroll transaction deletion',
  description:
    'IRREVERSIBLY deletes the payroll transaction previewed by jisr_payroll_transaction_delete_prepare. Re-validates the target first: refuses if it changed (WRITE_TARGET_CHANGED) or vanished (RECORD_NOT_FOUND). Success is confirmed by the target being absent on re-read.',
  inputShape: {
    confirmationReference: z
      .string()
      .describe('The reference returned by the prepare tool. Single-use, 5-minute validity.'),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  declaredFieldGroups: ['internal_operational', 'financial_confidential'],
  fieldGroupPurpose: 'The deletion confirmation and re-read absence check. No record data returns.',
  handler: (input, context) => commitPayrollDelete(input, context),
};

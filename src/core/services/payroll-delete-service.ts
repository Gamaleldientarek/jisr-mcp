/**
 * Payroll transaction deletion service (feature 002, US3, spec FR-016..019).
 *
 * DORMANT by default behind four gates: finance profile, finance surface, key
 * permission, and JISR_WRITE_PAYROLL_DELETE. The destructive path re-reads its
 * target TWICE -- at prepare to preview exactly what dies, and at commit to
 * refuse if it moved or vanished in between. Jisr documents no GET-by-id, so
 * both re-reads scan the transactions list (plan, research W5).
 */

import { authorizeTool } from '../authorization/policies.js';
import { buildEnvelope } from '../envelope.js';
import { JisrMcpError } from '../errors.js';
import { toUpstreamParams } from '../jisr/pagination.js';
import { payrollTransactionsSchema } from '../jisr/schemas/finance.js';
import { payrollDeleteResponseSchema } from '../jisr/schemas/writes.js';
import type { ToolContext, ToolResult } from '../tools/registry.js';
import { consumeReference, hashTarget, issueReference } from '../writes/confirmation.js';
import { assertNotDuplicate } from '../writes/duplicate-guard.js';
import { submitGuarded } from '../writes/outcome.js';
import { previewSummary } from '../writes/preview.js';

const OPERATION = 'deletePayrollTransaction';
const RE_READ_TOOL = 'jisr_payroll_transactions_list';
const SCAN_MAX_PAGES = 5;
const FINANCE_REQUEST = { useFinanceCredentials: true } as const;

export interface PayrollDeletePrepareInput {
  readonly transactionId: string | number;
  readonly reason: string;
  /** Optional scan hint; Jisr may require a pay period on the list. */
  readonly payPeriod?: string;
}

export interface PayrollDeleteCommitInput {
  readonly confirmationReference: string;
}

interface FoundTransaction {
  readonly transaction: Record<string, unknown>;
  readonly employeeCode: string | number | null;
  readonly employeeName: string | null;
}

async function findTransaction(
  transactionId: string | number,
  payPeriod: string | undefined,
  context: ToolContext,
): Promise<FoundTransaction | null> {
  const wanted = String(transactionId);
  for (let page = 1; page <= SCAN_MAX_PAGES; page += 1) {
    const response = await context.client.request(payrollTransactionsSchema, {
      operationId: 'listPayrollTransactions',
      ...FINANCE_REQUEST,
      query: {
        ...toUpstreamParams(page, 100),
        ...(payPeriod === undefined ? {} : { pay_period: payPeriod }),
      },
    });
    for (const employee of response.data.employees) {
      for (const transaction of employee.transactions ?? []) {
        if (String(transaction.id ?? '') === wanted) {
          return {
            transaction,
            employeeCode: employee.code ?? null,
            employeeName: employee.full_name_en ?? employee.full_name_ar ?? null,
          };
        }
      }
    }
    if (response.data.employees.length < 100) break;
  }
  return null;
}

export async function preparePayrollDelete(
  input: PayrollDeletePrepareInput,
  context: ToolContext,
): Promise<ToolResult> {
  authorizeTool('jisr_payroll_transaction_delete_prepare', context);

  if (input.reason.trim() === '') {
    throw new JisrMcpError(
      'REASON_REQUIRED',
      'Deleting a payroll transaction requires a non-empty reason.',
      'The reason is recorded in the audit trail beside the deletion.',
    );
  }

  const found = await findTransaction(input.transactionId, input.payPeriod, context);
  if (found === null) {
    throw new JisrMcpError(
      'RECORD_NOT_FOUND',
      `No payroll transaction has the id ${String(input.transactionId)}.`,
      `Check the id with ${RE_READ_TOOL}. Nothing was deleted.`,
    );
  }

  const targetHash = hashTarget(found.transaction);
  const { reference, expiresAt } = issueReference(
    {
      organizationId: context.principal.organizationId,
      principalRef: context.principal.reference,
      operationId: OPERATION,
      targetHash,
    },
    {
      transactionId: input.transactionId,
      targetHash,
      reason: input.reason,
      ...(input.payPeriod === undefined ? {} : { payPeriod: input.payPeriod }),
    },
  );

  const warnings = [
    'This deletion is IRREVERSIBLE. Jisr documents no way to restore a deleted payroll transaction.',
  ];
  const amount = found.transaction['amount'];
  const amountLabel =
    typeof amount === 'number' || typeof amount === 'string' ? String(amount) : 'amount unknown';
  const action = `DELETE payroll transaction ${String(input.transactionId)} (${amountLabel} for employee ${String(found.employeeCode ?? 'unknown')})`;
  return {
    structuredContent: {
      preview: {
        action,
        transaction: found.transaction,
        employeeCode: found.employeeCode,
        employeeName: found.employeeName,
        reason: input.reason,
        warnings,
      },
      confirmationReference: reference,
      expiresAt,
    },
    summary: previewSummary(action, expiresAt, warnings),
    writeAudit: {
      phase: 'prepare',
      referencePrefix: reference.slice(0, 8),
      targetIds: [String(input.transactionId)],
      reason: input.reason,
    },
  };
}

interface StashedDeletion {
  readonly transactionId: string | number;
  readonly targetHash: string;
  readonly reason: string;
  readonly payPeriod?: string;
}

export async function commitPayrollDelete(
  input: PayrollDeleteCommitInput,
  context: ToolContext,
): Promise<ToolResult> {
  authorizeTool('jisr_payroll_transaction_delete_commit', context);

  const stashed = consumeReference(input.confirmationReference, {
    organizationId: context.principal.organizationId,
    principalRef: context.principal.reference,
    operationId: OPERATION,
    targetHash: referenceTargetHash(input.confirmationReference),
  }) as StashedDeletion | undefined;
  if (stashed === undefined) {
    throw new JisrMcpError(
      'WRITE_PREPARATION_EXPIRED',
      'The prepared deletion for this reference is no longer held.',
      'The server restarted or the preparation expired. Prepare again.',
    );
  }

  // Re-validate the target NOW, not five minutes ago (spec FR-018).
  const current = await findTransaction(stashed.transactionId, stashed.payPeriod, context);
  if (current === null) {
    throw new JisrMcpError(
      'RECORD_NOT_FOUND',
      `Payroll transaction ${String(stashed.transactionId)} no longer exists.`,
      'It was deleted or moved by someone else. Nothing was deleted by this call.',
    );
  }
  if (hashTarget(current.transaction) !== stashed.targetHash) {
    throw new JisrMcpError(
      'WRITE_TARGET_CHANGED',
      `Payroll transaction ${String(stashed.transactionId)} changed after it was previewed.`,
      'Prepare again and review the fresh preview before deleting. Nothing was deleted.',
    );
  }

  assertNotDuplicate(
    context.principal.organizationId,
    OPERATION,
    { transactionId: stashed.transactionId, targetHash: stashed.targetHash },
    {},
  );

  await submitGuarded(
    () =>
      context.client.request(payrollDeleteResponseSchema, {
        operationId: OPERATION,
        ...FINANCE_REQUEST,
        pathParams: { id: String(stashed.transactionId) },
      }),
    RE_READ_TOOL,
  );

  // Deletion success is the target's ABSENCE on re-read.
  const after = await findTransaction(stashed.transactionId, stashed.payPeriod, context);
  const confirmedGone = after === null;

  return {
    structuredContent: {
      ...buildEnvelope({
        operation: 'jisr_payroll_transaction_delete_commit',
        organizationId: context.principal.organizationId,
        dataAsOf: new Date().toISOString(),
        records: [],
        pageSize: 1,
        nextCursor: null,
        warnings: confirmedGone
          ? []
          : [
              {
                code: 'PARTIAL_RESULT',
                message:
                  'The deletion was accepted but the transaction is still visible on re-read.',
              },
            ],
        isPartial: !confirmedGone,
      }),
      deletion: {
        transactionId: stashed.transactionId,
        confirmedGone,
      },
    },
    summary: confirmedGone
      ? `Payroll transaction ${String(stashed.transactionId)} is deleted; the re-read confirms it is gone.`
      : `The deletion was accepted, but transaction ${String(stashed.transactionId)} is still visible. Verify with ${RE_READ_TOOL} -- do NOT delete again without a fresh prepare.`,
    writeAudit: {
      phase: 'commit',
      referencePrefix: input.confirmationReference.slice(0, 8),
      targetIds: [String(stashed.transactionId)],
      reason: stashed.reason,
    },
  };
}

function referenceTargetHash(reference: string): string {
  const body = reference.slice(0, reference.lastIndexOf('.'));
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      targetHash?: string;
    };
    return parsed.targetHash ?? '';
  } catch {
    return '';
  }
}

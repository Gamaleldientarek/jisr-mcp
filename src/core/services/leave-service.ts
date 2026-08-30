/**
 * Leave summary service (spec FR-034, research R7).
 *
 * Jisr accepts at most 100 employee codes per call. Above that the server
 * splits within its own per-invocation ceiling, or refuses with a named limit.
 * It never silently truncates -- a leave report missing people nobody was told
 * about is worse than an error.
 */

import { authorizeTool } from '../authorization/policies.js';
import { scopeToReachable, type RecordIdentity } from '../authorization/reachability.js';
import { buildEnvelope, WARNING_CODES, type ResultEnvelope, type Warning } from '../envelope.js';
import { JisrMcpError } from '../errors.js';
import { MAX_RECORDS_PER_INVOCATION, validatePageSize } from '../jisr/pagination.js';
import { LEAVE_SUMMARY_MAX_CODES, leaveSummaryListSchema } from '../jisr/schemas/leave.js';
import type { ToolContext } from '../tools/registry.js';

const OPERATION = 'getLeaveSummary';

export interface LeaveSummaryInput {
  readonly employeeCodes: readonly number[];
  /**
   * REQUIRED by Jisr, despite the specification marking it optional.
   * Verified live: omitting it returns 400 "Parameter leave_type is required".
   */
  readonly leaveType: string;
  readonly pageSize?: number;
}

export interface NormalizedLeaveSummary {
  readonly employeeCode: string | number | null;
  readonly leaveType: string | null;
  readonly leaveDays: string | number | null;
  readonly previousYearBalance: string | number | null;
  readonly openingBalance: string | number | null;
  readonly manualBalanceAdjustment: string | number | null;
  readonly used: string | number | null;
  readonly yearEndBalance: string | number | null;
  readonly pending: string | number | null;
  readonly totalReservedBalances: string | number | null;
  readonly unpaidLeaveDeduction: string | number | null;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function getLeaveSummary(
  input: LeaveSummaryInput,
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedLeaveSummary> }> {
  authorizeTool('jisr_employee_leave_summary_get', context);

  if (input.employeeCodes.length === 0) {
    throw new JisrMcpError('INVALID_FILTER', 'Provide at least one employee code.');
  }
  if (input.employeeCodes.length > MAX_RECORDS_PER_INVOCATION) {
    throw new JisrMcpError(
      'BULK_LIMIT_EXCEEDED',
      `${input.employeeCodes.length} employee codes exceeds the per-invocation limit of ${MAX_RECORDS_PER_INVOCATION}.`,
      'Split the request into smaller batches.',
    );
  }

  const pageSize = validatePageSize(input.pageSize);
  const batches = chunk(input.employeeCodes, LEAVE_SUMMARY_MAX_CODES);
  const rows: NormalizedLeaveSummary[] = [];
  let dataAsOf = new Date().toISOString();

  for (const batch of batches) {
    const response = await context.client.request(leaveSummaryListSchema, {
      operationId: OPERATION,
      query: {
        employee_codes: batch,
        leave_type: input.leaveType,
        rpp: pageSize,
      },
    });
    dataAsOf = response.receivedAt;

    const identify = (row: {
      employee_code?: string | number | null | undefined;
    }): RecordIdentity => ({
      employeeId: null,
      employeeCode: row.employee_code ?? null,
      lineManagerId: null,
    });
    const scoped = scopeToReachable(response.data.leaves_summary, context.principal, identify);

    for (const row of scoped.records) {
      rows.push({
        employeeCode: row.employee_code ?? null,
        leaveType: row.leave_type ?? null,
        leaveDays: row.leave_days ?? null,
        previousYearBalance: row.previous_year_balance ?? null,
        openingBalance: row.opening_balance ?? null,
        manualBalanceAdjustment: row.manual_balance_adjustment ?? null,
        used: row.used ?? null,
        yearEndBalance: row.year_end_balance ?? null,
        pending: row.pending ?? null,
        totalReservedBalances: row.total_reserved_balances ?? null,
        unpaidLeaveDeduction: row.unpaid_leave_deduction ?? null,
      });
    }
  }

  const warnings: Warning[] = [];
  if (batches.length > 1) {
    // Say so. A caller must never be left thinking one upstream call was made.
    warnings.push({
      code: WARNING_CODES.BULK_REQUEST_SPLIT,
      message: `The request was split into ${batches.length} upstream calls; Jisr accepts at most ${LEAVE_SUMMARY_MAX_CODES} employee codes per call.`,
    });
  }
  if (rows.length < input.employeeCodes.length) {
    warnings.push({
      code: WARNING_CODES.SCOPE_NARROWED,
      message: `${input.employeeCodes.length - rows.length} requested employee(s) were outside your reachable set or had no leave record.`,
    });
  }

  return {
    envelope: buildEnvelope({
      operation: 'jisr_employee_leave_summary_get',
      organizationId: context.principal.organizationId,
      dataAsOf,
      records: rows,
      pageSize,
      warnings,
      isPartial: warnings.length > 0,
    }),
  };
}

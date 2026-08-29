/**
 * Accrual transactions service (spec FR-027).
 *
 * The upstream schema is incompletely documented (plan > Open Dependencies).
 * Only documented fields are mapped; anything else is drift and is withheld
 * rather than guessed at.
 */

import { authorizeTool } from '../authorization/policies.js';
import { scopeToReachable, type RecordIdentity } from '../authorization/reachability.js';
import { buildEnvelope, type ResultEnvelope } from '../envelope.js';
import { decodeCursor, encodeCursor, hashFilters } from '../cursor.js';
import { nextPageFrom, toUpstreamParams, validatePageSize } from '../jisr/pagination.js';
import { accrualTransactionsSchema } from '../jisr/schemas/accruals.js';
import type { ToolContext } from '../tools/registry.js';

const OPERATION = 'listAccrualTransactions';

export interface AccrualsInput {
  readonly accrualType?: string;
  readonly payPeriod?: string;
  readonly pageSize?: number;
  readonly cursor?: string;
}

export interface NormalizedAccrual {
  readonly employeeCode: string | number | null;
  readonly fullNameEn: string | null;
  readonly fullNameAr: string | null;
  readonly status: string | null;
  readonly payPeriod: string | null;
  readonly amount: string | number | null;
  readonly downgradeAmount: string | number | null;
  readonly vacationDays: string | number | null;
}

export async function listAccrualTransactions(
  input: AccrualsInput,
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedAccrual> }> {
  authorizeTool('jisr_accrual_transactions_list', context);

  const pageSize = validatePageSize(input.pageSize);
  const filters = { accrualType: input.accrualType, payPeriod: input.payPeriod, pageSize };
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: OPERATION,
    filtersHash: hashFilters(filters),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(accrualTransactionsSchema, {
    operationId: OPERATION,
    query: {
      ...toUpstreamParams(page, pageSize),
      accrual_type: input.accrualType,
      pay_period: input.payPeriod,
    },
  });

  const identify = (row: { code?: string | number | null | undefined }): RecordIdentity => ({
    employeeId: null,
    employeeCode: row.code ?? null,
    lineManagerId: null,
  });
  const scoped = scopeToReachable(response.data.employees, context.principal, identify);
  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_accrual_transactions_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: scoped.records.map((row) => ({
        employeeCode: row.code ?? null,
        fullNameEn: row.full_name_en ?? null,
        fullNameAr: row.full_name_ar ?? null,
        status: row.status ?? null,
        payPeriod: response.data.pay_period ?? null,
        amount: row.accrual?.amount ?? null,
        downgradeAmount: row.accrual?.downgrade_amount ?? null,
        vacationDays: row.accrual?.vacation_days ?? null,
      })),
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
      warnings: scoped.warnings,
      isPartial: scoped.warnings.length > 0,
    }),
  };
}

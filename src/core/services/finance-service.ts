/**
 * Finance service (spec FR-023a, FR-026, data-model §5).
 *
 * Every operation here returns FINANCIAL_CONFIDENTIAL data, so the interface is
 * deliberately stricter than the HR services:
 *
 *   - the finance credential is used where one is configured, so a narrow HR key
 *     never sees payroll;
 *   - nothing is cached;
 *   - authorization runs before any upstream call, and requires BOTH the finance
 *     profile and the explicitly enabled surface;
 *   - errors carry no upstream body, which for payroll could echo amounts.
 */

import { authorizeTool } from '../authorization/policies.js';
import { buildEnvelope, type ResultEnvelope } from '../envelope.js';
import { decodeCursor, encodeCursor, hashFilters } from '../cursor.js';
import { nextPageFrom, toUpstreamParams, validatePageSize } from '../jisr/pagination.js';
import {
  accountingJournalSchema,
  glTransactionTypesSchema,
  monthlyPayablesSchema,
  paygroupsSchema,
  payrollTransactionsSchema,
} from '../jisr/schemas/finance.js';
import type { ToolContext } from '../tools/registry.js';

/** Finance calls always prefer the finance credential where one is configured. */
const FINANCE_REQUEST = { useFinanceCredentials: true } as const;

export async function listMonthlyPayables(
  input: { payPeriod?: string; paygroupId?: number; pageSize?: number; cursor?: string },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<unknown> }> {
  authorizeTool('jisr_employee_monthly_payables_list', context);

  const pageSize = validatePageSize(input.pageSize);
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: 'listMonthlyPayables',
    filtersHash: hashFilters({ ...input, pageSize }),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(monthlyPayablesSchema, {
    operationId: 'listMonthlyPayables',
    ...FINANCE_REQUEST,
    query: {
      ...toUpstreamParams(page, pageSize),
      pay_period: input.payPeriod,
      paygroup_id: input.paygroupId,
    },
  });

  const records = Array.isArray(response.data) ? response.data : response.data.employees;
  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_employee_monthly_payables_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records,
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
    }),
  };
}

export async function listPayrollTransactions(
  input: {
    payPeriod?: string;
    transactionTypeIds?: readonly number[];
    pageSize?: number;
    cursor?: string;
  },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<unknown> }> {
  authorizeTool('jisr_payroll_transactions_list', context);

  const pageSize = validatePageSize(input.pageSize);
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: 'listPayrollTransactions',
    filtersHash: hashFilters({
      payPeriod: input.payPeriod,
      types: input.transactionTypeIds?.join(','),
      pageSize,
    }),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(payrollTransactionsSchema, {
    operationId: 'listPayrollTransactions',
    ...FINANCE_REQUEST,
    query: {
      ...toUpstreamParams(page, pageSize),
      pay_period: input.payPeriod,
      ...(input.transactionTypeIds === undefined
        ? {}
        : { transaction_type_ids: [...input.transactionTypeIds] }),
    },
  });

  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_payroll_transactions_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      // Transaction identifiers are preserved: they are what an authorized
      // follow-up retrieval needs.
      records: response.data.employees,
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
    }),
  };
}

export async function listGlTransactionTypes(
  input: { pageSize?: number; cursor?: string },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<unknown> }> {
  authorizeTool('jisr_gl_transaction_types_list', context);

  const pageSize = validatePageSize(input.pageSize);
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: 'listGlTransactionTypes',
    filtersHash: hashFilters({ pageSize }),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(glTransactionTypesSchema, {
    operationId: 'listGlTransactionTypes',
    ...FINANCE_REQUEST,
    query: toUpstreamParams(page, pageSize),
  });
  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_gl_transaction_types_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: response.data.gl_transaction_types.map((type) => ({
        id: type.id ?? null,
        category: type.gl_transaction_category ?? null,
        nameEn: type.gl_transaction_name ?? null,
        nameAr: type.gl_transaction_name_ar ?? null,
        status: type.status ?? null,
      })),
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
    }),
  };
}

export async function listPaygroups(
  input: { pageSize?: number; cursor?: string },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<unknown> }> {
  authorizeTool('jisr_paygroups_list', context);

  const pageSize = validatePageSize(input.pageSize);
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: 'listPaygroups',
    filtersHash: hashFilters({ pageSize }),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(paygroupsSchema, {
    operationId: 'listPaygroups',
    ...FINANCE_REQUEST,
    query: toUpstreamParams(page, pageSize),
  });
  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_paygroups_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: response.data.paygroups.map((group) => ({
        id: group.id ?? null,
        name: group.name ?? null,
      })),
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
    }),
  };
}

export async function getAccountingJournal(
  input: { journalId: string },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<unknown> }> {
  authorizeTool('jisr_accounting_journal_get', context);

  const response = await context.client.request(accountingJournalSchema, {
    operationId: 'getAccountingJournal',
    ...FINANCE_REQUEST,
    pathParams: { id: input.journalId },
  });

  const request = response.data.journal_export_request;

  return {
    envelope: buildEnvelope({
      operation: 'jisr_accounting_journal_get',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: (request.journals ?? []).map((journal) => ({
        id: journal.id ?? null,
        journalType: journal.journal_type ?? null,
        payPeriodStart: journal.pay_period_start ?? null,
        payPeriodEnd: journal.pay_period_end ?? null,
        subsidiary: journal.subsidiary ?? null,
        totalCredit: journal.total_credit ?? null,
        totalDebit: journal.total_debit ?? null,
        lines: (journal.journal_lines ?? []).map((line) => ({
          accountId: line.account_id ?? null,
          accountName: line.account_name ?? null,
          transactionName: line.transaction_name ?? null,
          employeeName: line.employee_name ?? null,
          employeeId: line.employee_id ?? null,
          creditAmount: line.credit_amount ?? null,
          debitAmount: line.debit_amount ?? null,
          narrative: line.narrative ?? null,
        })),
      })),
      pageSize: 1,
    }),
  };
}

export async function getEmployeeFinancialInfo(
  input: { employeeId: string },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<unknown> }> {
  authorizeTool('jisr_employee_financial_info_get', context);

  // No caching, and the request body is never logged (spec tool contract).
  const response = await context.client.request(monthlyPayablesSchema, {
    operationId: 'getEmployeeFinancialInfo',
    ...FINANCE_REQUEST,
    query: { id: input.employeeId },
  });

  const records = Array.isArray(response.data) ? response.data : response.data.employees;

  return {
    envelope: buildEnvelope({
      operation: 'jisr_employee_financial_info_get',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records,
      pageSize: 1,
    }),
  };
}

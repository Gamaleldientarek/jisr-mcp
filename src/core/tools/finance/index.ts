/**
 * The six financial tools (spec FR-023a, FR-026).
 *
 * All require the `finance` profile AND the explicitly enabled finance surface.
 * Both conditions, independently -- key permission alone is deliberately not
 * sufficient, so a broad convenience key cannot expose payroll by default.
 */

import { z } from 'zod';
import {
  getAccountingJournal,
  getEmployeeFinancialInfo,
  listGlTransactionTypes,
  listMonthlyPayables,
  listPaygroups,
  listPayrollTransactions,
} from '../../services/finance-service.js';
import { summarize } from '../../summary.js';
import { DEFAULT_PAGE_SIZE, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

const page = {
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(UPSTREAM_MAX_PAGE_SIZE)
    .optional()
    .describe(`Records per page, 1-${UPSTREAM_MAX_PAGE_SIZE}. Defaults to ${DEFAULT_PAGE_SIZE}.`),
  cursor: z.string().optional().describe('Pass pagination.nextCursor back unchanged.'),
};

const FINANCIAL_PURPOSE =
  'Financial amounts, which is the stated purpose of this tool. Reachable only by the finance profile with the finance surface explicitly enabled.';

export const employeeFinancialInfoTool: ToolDefinition<{ employeeId: string }> = {
  name: 'jisr_employee_financial_info_get',
  title: 'Get employee financial information',
  description:
    'Retrieves one employee’s financial information. High sensitivity: requires the finance role and the explicitly enabled finance surface. Every call is audited.',
  inputShape: { employeeId: z.string().uuid().describe('The employee UUID.') },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['financial_confidential'],
  fieldGroupPurpose: FINANCIAL_PURPOSE,
  handler: async (input, context) => {
    const { envelope } = await getEmployeeFinancialInfo(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

export const monthlyPayablesTool: ToolDefinition<{
  payPeriod?: string;
  paygroupId?: number;
  pageSize?: number;
  cursor?: string;
}> = {
  name: 'jisr_employee_monthly_payables_list',
  title: 'List monthly payables',
  description:
    'Lists employee monthly payables: net salary, earnings, additions and deductions totals with their breakdowns.',
  inputShape: {
    payPeriod: z.string().optional().describe('For example: 2026-08'),
    paygroupId: z.number().int().optional(),
    ...page,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['financial_confidential'],
  fieldGroupPurpose: FINANCIAL_PURPOSE,
  handler: async (input, context) => {
    const { envelope } = await listMonthlyPayables(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

export const payrollTransactionsTool: ToolDefinition<{
  payPeriod?: string;
  transactionTypeIds?: number[];
  pageSize?: number;
  cursor?: string;
}> = {
  name: 'jisr_payroll_transactions_list',
  title: 'List payroll transactions',
  description:
    'Lists payroll transactions per employee for a pay period, with type, category, amount, effective date and whether each is retroactive or included in the pay run. Transaction identifiers are preserved.',
  inputShape: {
    payPeriod: z.string().optional().describe('For example: 2026-08'),
    transactionTypeIds: z.array(z.number().int()).optional(),
    ...page,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['financial_confidential'],
  fieldGroupPurpose: FINANCIAL_PURPOSE,
  handler: async (input, context) => {
    const { envelope } = await listPayrollTransactions(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

export const glTransactionTypesTool: ToolDefinition<{ pageSize?: number; cursor?: string }> = {
  name: 'jisr_gl_transaction_types_list',
  title: 'List GL transaction types',
  description:
    'Lists the organization’s general-ledger transaction types with category, English and Arabic names, and status.',
  inputShape: page,
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['financial_confidential'],
  fieldGroupPurpose: FINANCIAL_PURPOSE,
  handler: async (input, context) => {
    const { envelope } = await listGlTransactionTypes(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

export const paygroupsTool: ToolDefinition<{ pageSize?: number; cursor?: string }> = {
  name: 'jisr_paygroups_list',
  title: 'List paygroups',
  description: 'Lists the organization’s paygroups with their identifiers and names.',
  inputShape: page,
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['financial_confidential'],
  fieldGroupPurpose: FINANCIAL_PURPOSE,
  handler: async (input, context) => {
    const { envelope } = await listPaygroups(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

export const accountingJournalTool: ToolDefinition<{ journalId: string }> = {
  name: 'jisr_accounting_journal_get',
  title: 'Get accounting journal',
  description:
    'Retrieves one accounting journal export by identifier, including its journals and journal lines with account, transaction name, debit and credit amounts.',
  inputShape: {
    journalId: z
      .string()
      .uuid('journalId must be the journal export UUID.')
      .describe('The journal export request UUID.'),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  // Journal lines carry employee_name and employee_id alongside amounts:
  // personal data inside a financial document, declared as both.
  declaredFieldGroups: ['financial_confidential', 'employee_personal'],
  fieldGroupPurpose:
    'Journal lines attribute amounts to named employees, so the personal fields are inherent to the document rather than incidental.',
  handler: async (input, context) => {
    const { envelope } = await getAccountingJournal(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

export function financeTools(): readonly ToolDefinition<never>[] {
  return [
    employeeFinancialInfoTool,
    monthlyPayablesTool,
    payrollTransactionsTool,
    glTransactionTypesTool,
    paygroupsTool,
    accountingJournalTool,
  ];
}

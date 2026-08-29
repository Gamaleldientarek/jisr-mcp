/**
 * The endpoint manifest: every operation the approved Jisr specification
 * snapshot declares, and the tool bound to it.
 *
 * This is the mechanism behind Constitution Principle I. No code path may reach
 * a Jisr operation absent from this table, and `scripts/verify-endpoint-coverage.ts`
 * fails the build when the table and the snapshot diverge (spec FR-008, FR-010).
 *
 * Verified against `jisr-openapi-snapshot-2026-08-29.yaml` on 2026-08-29:
 * 29 operations, matching the baseline plan with no divergence (research R1).
 */

import type { RoleProfile } from '../authorization/role-profiles.js';

export const SNAPSHOT_VERSION = '2026-08-29';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type Sensitivity =
  | 'public_reference'
  | 'internal_operational'
  | 'employee_personal'
  | 'employee_sensitive'
  | 'financial_confidential';

export interface ManifestEntry {
  readonly domain: string;
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly readOrWrite: 'read' | 'write';
  readonly sensitivity: Sensitivity;
  /**
   * Jisr does not document which API-key permission governs which endpoint
   * (plan > Open Dependencies). Recorded as null rather than guessed; the
   * connection probe reports what was observed, never what was inferred.
   */
  readonly requiredJisrPermission: string | null;
  readonly requiredProfiles: readonly RoleProfile[];
  /** null for release 2: known, deliberately unbound (spec FR-012). */
  readonly implementedTool: string | null;
  readonly release: 1 | 2;
}

const ALL: RoleProfile[] = [
  'employee_self',
  'manager',
  'hr_operations',
  'finance',
  'integration_admin',
  'auditor',
];

export const ENDPOINT_MANIFEST: readonly ManifestEntry[] = [
  // --- Authentication: never a tool. Exposing it would put credentials in a
  // tool contract. Handled by src/core/jisr/authentication.ts.
  {
    domain: 'authentication',
    operationId: 'authenticate',
    method: 'POST',
    path: '/openapi/v1/auth',
    readOrWrite: 'write',
    sensitivity: 'internal_operational',
    requiredJisrPermission: null,
    requiredProfiles: [],
    implementedTool: null,
    release: 1,
  },

  // --- Release 1 reads (20) ---
  {
    domain: 'employees',
    operationId: 'listEmployees',
    method: 'GET',
    path: '/openapi/v1/employees',
    readOrWrite: 'read',
    sensitivity: 'employee_personal',
    requiredJisrPermission: null,
    requiredProfiles: ['hr_operations', 'manager'],
    implementedTool: 'jisr_employees_list',
    release: 1,
  },
  {
    domain: 'employees',
    operationId: 'getEmployeeBasicInfo',
    method: 'GET',
    path: '/openapi/v1/employees/basic_info',
    readOrWrite: 'read',
    sensitivity: 'employee_personal',
    requiredJisrPermission: null,
    requiredProfiles: ['hr_operations', 'manager', 'employee_self'],
    implementedTool: 'jisr_employee_basic_info_get',
    release: 1,
  },
  {
    domain: 'employees',
    operationId: 'getEmployeeFinancialInfo',
    method: 'GET',
    path: '/openapi/v1/employees/financial_info',
    readOrWrite: 'read',
    sensitivity: 'financial_confidential',
    requiredJisrPermission: 'Get Employee Financial Info',
    requiredProfiles: ['finance'],
    implementedTool: 'jisr_employee_financial_info_get',
    release: 1,
  },
  {
    domain: 'attendance',
    operationId: 'getAttendanceSummary',
    method: 'GET',
    path: '/openapi/v1/attendance/summary',
    readOrWrite: 'read',
    sensitivity: 'internal_operational',
    requiredJisrPermission: null,
    requiredProfiles: ['hr_operations', 'manager', 'employee_self'],
    implementedTool: 'jisr_attendance_summary_get',
    release: 1,
  },
  {
    domain: 'attendance_logs',
    operationId: 'listAttendanceLogs',
    method: 'GET',
    path: '/openapi/v1/attendance_logs',
    readOrWrite: 'read',
    sensitivity: 'internal_operational',
    requiredJisrPermission: null,
    requiredProfiles: ['hr_operations', 'manager', 'employee_self'],
    implementedTool: 'jisr_attendance_logs_list',
    release: 1,
  },
  {
    domain: 'employee_leave',
    operationId: 'getLeaveSummary',
    method: 'GET',
    path: '/openapi/v1/employee_leaves/summary',
    readOrWrite: 'read',
    sensitivity: 'internal_operational',
    requiredJisrPermission: null,
    requiredProfiles: ['hr_operations', 'manager', 'employee_self'],
    implementedTool: 'jisr_employee_leave_summary_get',
    release: 1,
  },
  {
    domain: 'accruals',
    operationId: 'listAccrualTransactions',
    method: 'GET',
    path: '/openapi/v1/accrual_transactions',
    readOrWrite: 'read',
    sensitivity: 'internal_operational',
    requiredJisrPermission: null,
    requiredProfiles: ['hr_operations'],
    implementedTool: 'jisr_accrual_transactions_list',
    release: 1,
  },
  {
    domain: 'finance',
    operationId: 'listMonthlyPayables',
    method: 'GET',
    path: '/openapi/v1/employee_monthly_payables',
    readOrWrite: 'read',
    sensitivity: 'financial_confidential',
    requiredJisrPermission: null,
    requiredProfiles: ['finance'],
    implementedTool: 'jisr_employee_monthly_payables_list',
    release: 1,
  },
  {
    domain: 'finance',
    operationId: 'listPayrollTransactions',
    method: 'GET',
    path: '/openapi/v1/payroll_transactions',
    readOrWrite: 'read',
    sensitivity: 'financial_confidential',
    requiredJisrPermission: null,
    requiredProfiles: ['finance'],
    implementedTool: 'jisr_payroll_transactions_list',
    release: 1,
  },
  {
    domain: 'finance',
    operationId: 'listGlTransactionTypes',
    method: 'GET',
    path: '/openapi/v1/gl_transaction_types',
    readOrWrite: 'read',
    sensitivity: 'financial_confidential',
    requiredJisrPermission: null,
    requiredProfiles: ['finance'],
    implementedTool: 'jisr_gl_transaction_types_list',
    release: 1,
  },
  {
    domain: 'finance',
    operationId: 'listPaygroups',
    method: 'GET',
    path: '/openapi/v1/paygroups',
    readOrWrite: 'read',
    sensitivity: 'financial_confidential',
    requiredJisrPermission: null,
    requiredProfiles: ['finance'],
    implementedTool: 'jisr_paygroups_list',
    release: 1,
  },
  {
    domain: 'accounting',
    operationId: 'getAccountingJournal',
    method: 'GET',
    path: '/openapi/v1/accounting/journals/{id}',
    readOrWrite: 'read',
    sensitivity: 'financial_confidential',
    requiredJisrPermission: null,
    requiredProfiles: ['finance'],
    implementedTool: 'jisr_accounting_journal_get',
    release: 1,
  },
  {
    domain: 'audit',
    operationId: 'listAuditEvents',
    method: 'GET',
    path: '/openapi/v1/audit_events',
    readOrWrite: 'read',
    sensitivity: 'internal_operational',
    requiredJisrPermission: null,
    requiredProfiles: ['auditor', 'integration_admin'],
    implementedTool: 'jisr_audit_events_list',
    release: 1,
  },
  {
    domain: 'webhooks',
    operationId: 'listWebhooks',
    method: 'GET',
    path: '/openapi/v1/webhooks',
    readOrWrite: 'read',
    sensitivity: 'internal_operational',
    requiredJisrPermission: null,
    requiredProfiles: ['integration_admin'],
    implementedTool: 'jisr_webhooks_list',
    release: 1,
  },
  ...(
    [
      ['departments', 'jisr_departments_list'],
      ['employment_types', 'jisr_employment_types_list'],
      ['business_units', 'jisr_business_units_list'],
      ['locations', 'jisr_locations_list'],
      ['nationalities', 'jisr_nationalities_list'],
      ['outsourcing_companies', 'jisr_outsourcing_companies_list'],
    ] as const
  ).map<ManifestEntry>(([name, tool]) => ({
    domain: 'lookups',
    operationId: `list${name.replace(/(^|_)(\w)/g, (_m, _p, c: string) => c.toUpperCase())}`,
    method: 'GET',
    path: `/openapi/v1/lookups/${name}`,
    readOrWrite: 'read',
    sensitivity: 'public_reference',
    requiredJisrPermission: null,
    requiredProfiles: ALL,
    implementedTool: tool,
    release: 1,
  })),

  // --- Release 2: known, deliberately unbound. Present so the coverage gate
  // can assert they are unimplemented rather than missed (spec FR-012).
  ...(
    [
      ['employees', 'createEmployee', 'POST', '/openapi/v1/employees'],
      ['attendance_logs', 'createAttendanceLogs', 'POST', '/openapi/v1/attendance_logs'],
      ['accounting', 'createAccountingJournals', 'POST', '/openapi/v1/accounting/journals'],
      ['webhooks', 'createWebhook', 'POST', '/openapi/v1/webhooks'],
      ['webhooks', 'updateWebhook', 'PUT', '/openapi/v1/webhooks/{id}'],
      ['webhooks', 'deleteWebhook', 'DELETE', '/openapi/v1/webhooks/{id}'],
      ['webhooks', 'testWebhook', 'POST', '/openapi/v1/webhooks/{id}/test'],
      ['finance', 'deletePayrollTransaction', 'DELETE', '/openapi/v1/payroll_transactions/{id}'],
    ] as const
  ).map<ManifestEntry>(([domain, operationId, method, path]) => ({
    domain,
    operationId,
    method: method,
    path,
    readOrWrite: 'write',
    sensitivity: 'internal_operational',
    requiredJisrPermission: null,
    requiredProfiles: [],
    implementedTool: null,
    release: 2,
  })),
];

/** `METHOD /path` for every operation, the form the coverage gate compares. */
export function manifestOperationKeys(): readonly string[] {
  return ENDPOINT_MANIFEST.map((entry) => `${entry.method} ${entry.path}`).sort();
}

export function release1ReadEntries(): readonly ManifestEntry[] {
  return ENDPOINT_MANIFEST.filter((e) => e.release === 1 && e.readOrWrite === 'read');
}

export function findByTool(tool: string): ManifestEntry | undefined {
  return ENDPOINT_MANIFEST.find((entry) => entry.implementedTool === tool);
}

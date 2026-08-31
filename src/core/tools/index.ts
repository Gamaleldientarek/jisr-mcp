/**
 * Tool registration.
 *
 * One place that knows the whole surface, so the coverage gate, the data
 * catalog, and both adapters all see the same set.
 */

import { accrualTransactionsTool } from './accruals/transactions-list.js';
import { attendanceLogsTool } from './attendance/logs-list.js';
import { punchCreateCommitTool, punchCreatePrepareTool } from './attendance/punch-create.js';
import { attendanceSummaryTool } from './attendance/summary-get.js';
import { auditEventsTool } from './audit/audit-events-list.js';
import { capabilitiesTool } from './discovery/capabilities.js';
import { connectionStatusTool } from './discovery/connection-status.js';
import { createDataCatalogTool } from './discovery/data-catalog.js';
import { employeeBasicInfoTool } from './employees/basic-info-get.js';
import {
  employeeCreateCommitTool,
  employeeCreatePrepareTool,
} from './employees/employee-create.js';
import { employeesListTool } from './employees/employees-list.js';
import { financeTools } from './finance/index.js';
import { payrollDeleteCommitTool, payrollDeletePrepareTool } from './finance/payroll-delete.js';
import { leaveSummaryTool } from './leave/summary-get.js';
import { lookupTools } from './lookups/index.js';
import type { ToolRegistry } from './registry.js';
import { webhooksListTool } from './webhooks/webhooks-list.js';

export function registerReadTools(registry: ToolRegistry): void {
  registry.register(connectionStatusTool);
  registry.register(capabilitiesTool);

  registry.register(employeesListTool);
  registry.register(employeeBasicInfoTool);

  registry.register(attendanceSummaryTool);
  registry.register(attendanceLogsTool);
  registry.register(leaveSummaryTool);
  registry.register(accrualTransactionsTool);

  for (const tool of lookupTools()) registry.register(tool);

  for (const tool of financeTools()) registry.register(tool);

  registry.register(webhooksListTool);
  registry.register(auditEventsTool);

  // Registered last: the catalog describes the registry it is given.
  registry.register(createDataCatalogTool(registry));
}

/**
 * Write tool pairs (feature 002). Registered unconditionally; discoverability
 * and callability are gated per caller by the authorization write gates, so a
 * disabled domain flag removes both halves from tools/list for every profile
 * (contracts > Undiscoverability).
 */
export function registerWriteTools(registry: ToolRegistry): void {
  registry.register(punchCreatePrepareTool);
  registry.register(punchCreateCommitTool);
  registry.register(employeeCreatePrepareTool);
  registry.register(employeeCreateCommitTool);
  registry.register(payrollDeletePrepareTool);
  registry.register(payrollDeleteCommitTool);
}

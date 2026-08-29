/**
 * Tool registration.
 *
 * One place that knows the whole surface, so the coverage gate, the data
 * catalog, and the adapters all see the same set.
 */

import { attendanceSummaryTool } from './attendance/summary-get.js';
import { capabilitiesTool } from './discovery/capabilities.js';
import { connectionStatusTool } from './discovery/connection-status.js';
import { createDataCatalogTool } from './discovery/data-catalog.js';
import { employeeBasicInfoTool } from './employees/basic-info-get.js';
import { employeesListTool } from './employees/employees-list.js';
import type { ToolRegistry } from './registry.js';

export function registerReadTools(registry: ToolRegistry): void {
  registry.register(connectionStatusTool);
  registry.register(capabilitiesTool);

  registry.register(employeesListTool);
  registry.register(employeeBasicInfoTool);
  registry.register(attendanceSummaryTool);

  // The catalog describes the registry, so it is registered last and given a
  // reference to it.
  registry.register(createDataCatalogTool(registry));
}

/**
 * Employees service (spec FR-018a, FR-022, FR-026).
 *
 * The order of operations here is the security design, and it is deliberate:
 *
 *   1. authorize the tool          -- may this caller run it at all
 *   2. validate and bind the cursor -- is this continuation ours
 *   3. fetch from Jisr
 *   4. scope to the reachable set   -- WHICH records may this caller see
 *   5. apply field policy           -- WHICH FIELDS of those records
 *   6. build the envelope
 *
 * Scoping precedes mapping so a record outside the reachable set is discarded
 * before any of its fields are considered, and pagination reports nothing about
 * what was discarded.
 */

import { allowedClassifications } from '../authorization/field-policy.js';
import { authorizeTool } from '../authorization/policies.js';
import { scopeToReachable, type RecordIdentity } from '../authorization/reachability.js';
import { buildEnvelope, type ResultEnvelope, type Warning } from '../envelope.js';
import { decodeCursor, encodeCursor, hashFilters } from '../cursor.js';
import { JisrMcpError } from '../errors.js';
import { mapEmployees, type NormalizedEmployee } from '../jisr/mappers/employees.js';
import { nextPageFrom, toUpstreamParams, validatePageSize } from '../jisr/pagination.js';
import { employeeBasicInfoSchema, employeesListSchema } from '../jisr/schemas/employees.js';
import type { UpstreamEmployee } from '../jisr/schemas/employees.js';
import type { ToolContext } from '../tools/registry.js';

const OPERATION_LIST = 'listEmployees';
const OPERATION_BASIC = 'getEmployeeBasicInfo';

export interface EmployeesListInput {
  readonly status?: 'active' | 'inactive';
  readonly createdFrom?: string;
  readonly joiningFrom?: string;
  readonly joiningTo?: string;
  readonly terminationFrom?: string;
  readonly terminationTo?: string;
  readonly pageSize?: number;
  readonly cursor?: string;
}

/** How a record identifies itself for reachability (spec FR-018a). */
function identify(record: UpstreamEmployee): RecordIdentity {
  return {
    employeeId: record.employee_id ?? null,
    employeeCode: record.code ?? null,
    lineManagerId: record.line_manager?.id ?? null,
  };
}

function assertDateOrder(from: string | undefined, to: string | undefined, label: string): void {
  if (from !== undefined && to !== undefined && from > to) {
    throw new JisrMcpError(
      'INVALID_DATE_RANGE',
      `${label}: the start date is after the end date.`,
      'Swap the two values.',
    );
  }
}

export async function listEmployees(
  input: EmployeesListInput,
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedEmployee> }> {
  authorizeTool('jisr_employees_list', context);

  assertDateOrder(input.joiningFrom, input.joiningTo, 'joining date range');
  assertDateOrder(input.terminationFrom, input.terminationTo, 'termination date range');

  const pageSize = validatePageSize(input.pageSize);
  const filters = {
    status: input.status,
    date: input.createdFrom,
    joiningFrom: input.joiningFrom,
    joiningTo: input.joiningTo,
    terminationFrom: input.terminationFrom,
    terminationTo: input.terminationTo,
    pageSize,
  };
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: OPERATION_LIST,
    filtersHash: hashFilters(filters),
  };

  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(employeesListSchema, {
    operationId: OPERATION_LIST,
    query: {
      ...toUpstreamParams(page, pageSize),
      status: input.status,
      date: input.createdFrom,
      // Bracket syntax is the encoder's job; no caller ever builds it.
      joining_date: { from: input.joiningFrom, to: input.joiningTo },
      terminate_date: { from: input.terminationFrom, to: input.terminationTo },
    },
  });

  const scoped = scopeToReachable(response.data.employees, context.principal, identify);
  const mapped = mapEmployees(
    scoped.records,
    allowedClassifications(context.principal.profile, context.flags),
  );

  const nextPage = nextPageFrom(response.pagination);
  const warnings: Warning[] = [...scoped.warnings, ...mapped.warnings];

  return {
    envelope: buildEnvelope({
      operation: 'jisr_employees_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: mapped.records,
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
      warnings,
      isPartial: warnings.length > 0,
    }),
  };
}

export async function getEmployeeBasicInfo(
  input: { employeeId: string },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedEmployee> }> {
  authorizeTool('jisr_employee_basic_info_get', context);

  const response = await context.client.request(employeeBasicInfoSchema, {
    operationId: OPERATION_BASIC,
    query: { id: input.employeeId },
  });

  // A single record is scoped exactly like a collection: an unreachable record
  // is not "one result the caller may not see", it is no result.
  const scoped = scopeToReachable([response.data.employee], context.principal, identify);
  if (scoped.records.length === 0) {
    // Deliberately does not distinguish "no such employee" from "not yours" --
    // that difference is itself disclosure (spec User Story 3, scenario 4).
    throw new JisrMcpError(
      'RECORD_NOT_AUTHORIZED',
      'No employee matching that identifier is available to you.',
    );
  }

  const mapped = mapEmployees(
    scoped.records,
    allowedClassifications(context.principal.profile, context.flags),
  );

  return {
    envelope: buildEnvelope({
      operation: 'jisr_employee_basic_info_get',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: mapped.records,
      pageSize: 1,
      warnings: mapped.warnings,
      isPartial: mapped.isPartial,
    }),
  };
}

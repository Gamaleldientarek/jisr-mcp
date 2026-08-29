/**
 * Attendance service (spec FR-018a, FR-022).
 *
 * Same ordered pipeline as employees: authorize, bind cursor, fetch, scope,
 * map, envelope.
 *
 * Attendance rows key on employee CODE rather than the UUID, so reachability
 * matches on the code. The two identifiers are never interchanged.
 */

import { authorizeTool } from '../authorization/policies.js';
import { scopeToReachable, type RecordIdentity } from '../authorization/reachability.js';
import { buildEnvelope, type ResultEnvelope } from '../envelope.js';
import { decodeCursor, encodeCursor, hashFilters } from '../cursor.js';
import { JisrMcpError } from '../errors.js';
import { nextPageFrom, toUpstreamParams, validatePageSize } from '../jisr/pagination.js';
import {
  attendanceLogsListSchema,
  attendanceSummaryListSchema,
} from '../jisr/schemas/attendance.js';
import type { ToolContext } from '../tools/registry.js';

const OPERATION = 'getAttendanceSummary';

export interface AttendanceSummaryInput {
  readonly employeeId?: string;
  readonly status?: 'active' | 'inactive';
  readonly from: string;
  readonly to: string;
  readonly pageSize?: number;
  readonly cursor?: string;
}

export interface NormalizedAttendanceSummary {
  readonly employeeCode: string | number | null;
  readonly name: string | null;
  readonly totalWorkingHours: string | number | null;
  readonly totalWorkingHoursInsideShifts: string | number | null;
  readonly lateArrival: string | number | null;
  readonly excusedLateArrival: string | number | null;
  readonly earlyDeparture: string | number | null;
  readonly excusedEarlyDeparture: string | number | null;
  readonly extraWorkingTime: string | number | null;
  readonly approvedOvertime: string | number | null;
  readonly absenceDays: string | number | null;
  readonly noRecordDays: string | number | null;
  readonly leaveDays: string | number | null;
  readonly offDays: string | number | null;
  readonly fullDayExcuses: string | number | null;
  readonly lateArrivalDays: string | number | null;
  readonly earlyDepartureDays: string | number | null;
  /** From the upstream `businiess_trip_days` (data-model §4). */
  readonly businessTripDays: string | number | null;
}

export async function getAttendanceSummary(
  input: AttendanceSummaryInput,
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedAttendanceSummary> }> {
  authorizeTool('jisr_attendance_summary_get', context);

  if (input.from > input.to) {
    throw new JisrMcpError(
      'INVALID_DATE_RANGE',
      'The start date is after the end date.',
      'Swap the two values.',
    );
  }

  const pageSize = validatePageSize(input.pageSize);
  const filters = {
    employeeId: input.employeeId,
    status: input.status,
    from: input.from,
    to: input.to,
    pageSize,
  };
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: OPERATION,
    filtersHash: hashFilters(filters),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(attendanceSummaryListSchema, {
    operationId: OPERATION,
    query: {
      ...toUpstreamParams(page, pageSize),
      employee_id: input.employeeId,
      status: input.status,
      from: input.from,
      to: input.to,
    },
  });

  // Attendance rows carry no line-manager reference, so a manager's reachable
  // set here can only be resolved by code. A row that cannot be matched is
  // excluded -- fail closed (spec FR-018a).
  const identify = (row: { code?: string | number | null | undefined }): RecordIdentity => ({
    employeeId: null,
    employeeCode: row.code ?? null,
    lineManagerId: null,
  });

  const scoped = scopeToReachable(response.data.records, context.principal, identify);
  const nextPage = nextPageFrom(response.pagination);

  const records: NormalizedAttendanceSummary[] = scoped.records.map((row) => ({
    employeeCode: row.code ?? null,
    name: row.name ?? null,
    totalWorkingHours: row.total_working_hours ?? null,
    totalWorkingHoursInsideShifts: row.total_working_hours_inside_the_shifts ?? null,
    lateArrival: row.late_arrival ?? null,
    excusedLateArrival: row.excuse_late_arrival ?? null,
    earlyDeparture: row.early_departure ?? null,
    excusedEarlyDeparture: row.excuse_early_departure ?? null,
    extraWorkingTime: row.extra_working_time ?? null,
    approvedOvertime: row.approved_overtime ?? null,
    absenceDays: row.absence ?? null,
    noRecordDays: row.no_records ?? null,
    leaveDays: row.leave_days ?? null,
    offDays: row.off_days ?? null,
    fullDayExcuses: row.full_day_excuses ?? null,
    lateArrivalDays: row.late_arrival_days ?? null,
    earlyDepartureDays: row.early_departure_days ?? null,
    // Mapped explicitly from Jisr's misspelling, so a future upstream fix
    // surfaces as a mapping failure rather than a silently missing value.
    businessTripDays: row.businiess_trip_days ?? null,
  }));

  return {
    envelope: buildEnvelope({
      operation: 'jisr_attendance_summary_get',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records,
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
      warnings: scoped.warnings,
      isPartial: scoped.warnings.length > 0,
    }),
  };
}

// ---------------------------------------------------------------------------

const LOGS_OPERATION = 'listAttendanceLogs';

export interface AttendanceLogsInput {
  readonly status?: 'success' | 'failed';
  readonly from: string;
  readonly to: string;
  readonly pageSize?: number;
  readonly cursor?: string;
}

export interface NormalizedAttendancePunch {
  readonly id: string | number | null;
  readonly punchTime: string | null;
  readonly employeeCode: string | number | null;
  readonly terminalSerial: string | null;
  readonly clockingId: string | number | null;
}

/**
 * A timestamp must carry an unambiguous zone.
 *
 * Attendance is legally and financially consequential -- late arrival, overtime,
 * absence. Guessing a zone would silently shift punches across day boundaries,
 * so an ambiguous value is refused rather than assumed (spec Edge Cases).
 */
function assertZoned(value: string, field: string): void {
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  if (!zoned) {
    throw new JisrMcpError(
      'TIMEZONE_REQUIRED',
      `${field} has no time zone.`,
      'Use an ISO-8601 timestamp ending in Z or an explicit offset, for example 2026-08-29T00:00:00+03:00.',
    );
  }
}

export async function listAttendanceLogs(
  input: AttendanceLogsInput,
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedAttendancePunch> }> {
  authorizeTool('jisr_attendance_logs_list', context);

  assertZoned(input.from, 'from');
  assertZoned(input.to, 'to');
  if (input.from > input.to) {
    throw new JisrMcpError('INVALID_DATE_RANGE', 'The start time is after the end time.');
  }

  const pageSize = validatePageSize(input.pageSize);
  const filters = { status: input.status, from: input.from, to: input.to, pageSize };
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: LOGS_OPERATION,
    filtersHash: hashFilters(filters),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(attendanceLogsListSchema, {
    operationId: LOGS_OPERATION,
    query: {
      ...toUpstreamParams(page, pageSize),
      status: input.status,
      from: input.from,
      to: input.to,
    },
  });

  // Punches key on employee code; there is no line-manager reference here, so a
  // manager's set resolves by code alone and an unmatched row is excluded.
  const identify = (row: {
    employee_code?: string | number | null | undefined;
  }): RecordIdentity => ({
    employeeId: null,
    employeeCode: row.employee_code ?? null,
    lineManagerId: null,
  });
  const scoped = scopeToReachable(response.data.punches, context.principal, identify);
  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_attendance_logs_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: scoped.records.map((row) => ({
        id: row.id ?? null,
        punchTime: row.punch_time ?? null,
        employeeCode: row.employee_code ?? null,
        terminalSerial: row.terminal_sn ?? null,
        clockingId: row.clocking_id ?? null,
      })),
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
      warnings: scoped.warnings,
      isPartial: scoped.warnings.length > 0,
    }),
  };
}

/**
 * Attendance schemas (data-model §4), from snapshot 2026-08-29.
 */

import { z } from 'zod';
import { collection } from './common.js';

const duration = z.union([z.string(), z.number()]).nullable().optional();
const count = z.union([z.number(), z.string()]).nullable().optional();

export const attendanceSummarySchema = z.object({
  code: z.union([z.number(), z.string()]).nullable().optional(),
  name: z.string().nullable().optional(),

  total_working_hours: duration,
  total_working_hours_inside_the_shifts: duration,
  late_arrival: duration,
  excuse_late_arrival: duration,
  early_departure: duration,
  excuse_early_departure: duration,
  extra_working_time: duration,
  approved_overtime: duration,

  absence: count,
  no_records: count,
  leave_days: count,
  off_days: count,
  full_day_excuses: count,
  late_arrival_days: count,
  early_departure_days: count,

  /**
   * Spelled exactly this way upstream. Consumed verbatim and exposed as
   * `businessTripDays`. Never "corrected" in a request -- and mapped
   * explicitly so a future Jisr fix surfaces as a mapping failure rather than
   * a silently missing value (data-model §4).
   */
  businiess_trip_days: count,
});

export const attendanceSummaryListSchema = collection('records', attendanceSummarySchema);

export const attendancePunchSchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  punch_time: z.string().nullable().optional(),
  employee_code: z.union([z.number(), z.string()]).nullable().optional(),
  terminal_sn: z.string().nullable().optional(),
  clocking_id: z.union([z.number(), z.string()]).nullable().optional(),
});

export const attendanceLogsListSchema = collection('punches', attendancePunchSchema);

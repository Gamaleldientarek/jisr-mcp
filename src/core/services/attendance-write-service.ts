/**
 * Attendance write service (feature 002, spec FR-013, FR-013a).
 *
 * Prepare validates everything a human needs to see BEFORE anything is
 * written: the zone, the backdating window, the employee's existence, the
 * reason. Commit consumes the reference and submits exactly the stashed
 * payload, then reports the RE-READ state -- what Jisr now holds, never an
 * echo of what was sent (SC-004).
 */

import { authorizeTool } from '../authorization/policies.js';
import { scopeToReachable, type RecordIdentity } from '../authorization/reachability.js';
import { buildEnvelope, type ResultEnvelope } from '../envelope.js';
import { JisrMcpError } from '../errors.js';
import { toUpstreamParams } from '../jisr/pagination.js';
import { attendanceLogsListSchema } from '../jisr/schemas/attendance.js';
import { employeesListSchema } from '../jisr/schemas/employees.js';
import { punchCreateResponseSchema, type PunchSubmission } from '../jisr/schemas/writes.js';
import type { ToolContext, ToolResult } from '../tools/registry.js';
import { consumeReference, hashTarget, issueReference } from '../writes/confirmation.js';
import { assertNotDuplicate } from '../writes/duplicate-guard.js';
import { submitGuarded } from '../writes/outcome.js';
import { previewSummary } from '../writes/preview.js';

const OPERATION = 'createAttendanceLogs';
const RE_READ_TOOL = 'jisr_attendance_logs_list';

/** How many 100-row pages the existence scan will read before giving up. */
const EXISTENCE_SCAN_MAX_PAGES = 5;

export interface PunchPrepareInput {
  readonly employeeCode: string | number;
  readonly punchTime: string;
  readonly terminalSerial?: string;
  readonly reason: string;
}

export interface PunchCommitInput {
  readonly confirmationReference: string;
  readonly acknowledgeDuplicate?: boolean;
}

function assertZoned(value: string): void {
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    throw new JisrMcpError(
      'TIMEZONE_REQUIRED',
      'punchTime has no time zone.',
      'A punch without a zone could land on the wrong side of a day boundary. Use ISO-8601 ending in Z or an explicit offset, for example 2026-08-29T09:00:00+03:00.',
    );
  }
}

/**
 * The punch's stated local month must be the current or previous calendar
 * month (clarification 2026-08-31). The stated date is what the human wrote
 * and what payroll will see, so the window applies to it as written.
 */
function assertWithinBackdatingWindow(punchTime: string): void {
  const statedMonth = punchTime.slice(0, 7);
  const now = new Date();
  const current = now.toISOString().slice(0, 7);
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
  if (statedMonth !== current && statedMonth !== previous) {
    throw new JisrMcpError(
      'BACKDATING_WINDOW_EXCEEDED',
      `A punch dated ${statedMonth} is outside the permitted window (${previous} and ${current}).`,
      'Punches may be recorded for the current and previous calendar month only. Older corrections belong in Jisr itself, where payroll recalculation is visible.',
    );
  }
}

interface FoundEmployee {
  readonly code: string | number;
  readonly nameEn: string | null;
  readonly nameAr: string | null;
}

/**
 * Existence and reachability by employee code, via the same list endpoint the
 * read tools use. Jisr documents no code filter, so this is a bounded scan --
 * a limitation, recorded as such (research W5).
 */
async function findEmployeeByCode(
  code: string | number,
  context: ToolContext,
): Promise<FoundEmployee> {
  const wanted = String(code);
  for (let page = 1; page <= EXISTENCE_SCAN_MAX_PAGES; page += 1) {
    const response = await context.client.request(employeesListSchema, {
      operationId: 'listEmployees',
      query: toUpstreamParams(page, 100),
    });
    const identify = (row: { code?: string | number | null | undefined }): RecordIdentity => ({
      employeeId: null,
      employeeCode: row.code ?? null,
      lineManagerId: null,
    });
    const scoped = scopeToReachable(response.data.employees, context.principal, identify);
    const match = scoped.records.find((row) => String(row.code ?? '') === wanted);
    if (match !== undefined) {
      return {
        code: match.code ?? code,
        nameEn: match.full_name_en ?? null,
        nameAr: match.full_name_ar ?? null,
      };
    }
    if (response.data.employees.length < 100) break;
  }
  throw new JisrMcpError(
    'RECORD_NOT_FOUND',
    `No reachable employee has the code ${wanted}.`,
    'Check the code with jisr_employees_list. The punch was NOT recorded.',
  );
}

export async function preparePunchCreate(
  input: PunchPrepareInput,
  context: ToolContext,
): Promise<ToolResult> {
  authorizeTool('jisr_attendance_punch_create_prepare', context);

  if (input.reason.trim() === '') {
    throw new JisrMcpError(
      'REASON_REQUIRED',
      'A punch requires a non-empty reason.',
      'The reason is recorded in the audit trail beside the write.',
    );
  }
  assertZoned(input.punchTime);
  assertWithinBackdatingWindow(input.punchTime);

  const employee = await findEmployeeByCode(input.employeeCode, context);

  const submission: PunchSubmission = {
    terminal_sn: input.terminalSerial ?? 'mcp',
    punch_time: input.punchTime,
    // Documented as required; its upstream meaning is unverified (research
    // W1), so a fresh per-prepare handle is sent and the live window decides.
    id: Math.floor(Date.now() / 1000),
    emp_code: employee.code,
  };

  const { reference, expiresAt } = issueReference(
    {
      organizationId: context.principal.organizationId,
      principalRef: context.principal.reference,
      operationId: OPERATION,
      targetHash: hashTarget(submission),
    },
    { submission, reason: input.reason },
  );

  const warnings: string[] = [];
  if (input.terminalSerial === undefined) {
    warnings.push('No terminal serial was given; the punch will carry the marker "mcp".');
  }

  const action = `Record a punch for employee ${String(employee.code)} (${employee.nameEn ?? employee.nameAr ?? 'name unavailable'}) at ${input.punchTime}`;
  return {
    structuredContent: {
      preview: {
        action,
        employeeCode: employee.code,
        employeeName: employee.nameEn ?? employee.nameAr,
        punchTime: input.punchTime,
        terminalSerial: submission.terminal_sn,
        reason: input.reason,
        warnings,
      },
      confirmationReference: reference,
      expiresAt,
    },
    summary: previewSummary(action, expiresAt, warnings),
    writeAudit: {
      phase: 'prepare',
      referencePrefix: reference.slice(0, 8),
      targetIds: [String(employee.code)],
      reason: input.reason,
    },
  };
}

interface StashedPunch {
  readonly submission: PunchSubmission;
  readonly reason: string;
}

export async function commitPunchCreate(
  input: PunchCommitInput,
  context: ToolContext,
): Promise<ToolResult> {
  authorizeTool('jisr_attendance_punch_create_commit', context);

  // Signature-first: a forged or expired reference refuses before anything
  // else is read, and a valid one is consumed exactly once.
  const stashed = consumeReference(input.confirmationReference, {
    organizationId: context.principal.organizationId,
    principalRef: context.principal.reference,
    operationId: OPERATION,
    // The payload travels inside the reference's stash; its hash is inside the
    // signed body. Recompute from the stash only after the signature held.
    targetHash: referenceTargetHash(input.confirmationReference),
  }) as StashedPunch | undefined;
  if (stashed === undefined) {
    throw new JisrMcpError(
      'WRITE_PREPARATION_EXPIRED',
      'The prepared payload for this reference is no longer held.',
      'The server restarted or the preparation expired. Prepare again.',
    );
  }

  assertNotDuplicate(context.principal.organizationId, OPERATION, stashed.submission, {
    acknowledged: input.acknowledgeDuplicate === true,
  });

  await submitGuarded(
    () =>
      context.client.request(punchCreateResponseSchema, {
        operationId: OPERATION,
        body: { data: [stashed.submission] },
      }),
    RE_READ_TOOL,
  );

  // Report what Jisr now holds, never an echo of the submission (SC-004).
  const reRead = await reReadPunch(stashed.submission, context);

  return {
    structuredContent: reRead.envelope,
    summary:
      reRead.envelope.records.length > 0
        ? `The punch is recorded. Jisr now holds ${reRead.envelope.records.length} punch(es) matching employee ${String(stashed.submission.emp_code)} at ${stashed.submission.punch_time}.`
        : `The write was accepted, but the re-read did not find the punch yet. Verify with ${RE_READ_TOOL} before assuming failure -- do not resubmit blindly.`,
    writeAudit: {
      phase: 'commit',
      referencePrefix: input.confirmationReference.slice(0, 8),
      targetIds: [String(stashed.submission.emp_code)],
      reason: stashed.reason,
    },
  };
}

/** Extracts the signed targetHash from the reference body (post-verification). */
function referenceTargetHash(reference: string): string {
  const body = reference.slice(0, reference.lastIndexOf('.'));
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      targetHash?: string;
    };
    return parsed.targetHash ?? '';
  } catch {
    return '';
  }
}

interface ReReadPunchRecord {
  readonly id: string | number | null;
  readonly punchTime: string | null;
  readonly employeeCode: string | number | null;
  readonly terminalSerial: string | null;
  readonly clockingId: string | number | null;
}

async function reReadPunch(
  submission: PunchSubmission,
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<ReReadPunchRecord> }> {
  const instant = new Date(submission.punch_time);
  const from = new Date(instant.getTime() - 60_000).toISOString();
  const to = new Date(instant.getTime() + 60_000).toISOString();

  const response = await context.client.request(attendanceLogsListSchema, {
    operationId: 'listAttendanceLogs',
    query: { ...toUpstreamParams(1, 100), status: 'success', from, to },
  });

  const wanted = String(submission.emp_code);
  const matches = response.data.punches.filter((row) => String(row.employee_code ?? '') === wanted);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_attendance_punch_create_commit',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: matches.map((row) => ({
        id: row.id ?? null,
        punchTime: row.punch_time ?? null,
        employeeCode: row.employee_code ?? null,
        terminalSerial: row.terminal_sn ?? null,
        clockingId: row.clocking_id ?? null,
      })),
      pageSize: 100,
      nextCursor: null,
      warnings:
        matches.length === 0
          ? [
              {
                code: 'PARTIAL_RESULT',
                message:
                  'The write was accepted but the punch is not yet visible in the re-read window.',
              },
            ]
          : [],
      isPartial: matches.length === 0,
    }),
  };
}

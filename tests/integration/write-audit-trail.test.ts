/**
 * Write-audit completeness (T031, SC-007, quickstart W8).
 *
 * A replayed session covering prepare, commit, refusal, and an ambiguous
 * outcome leaves exactly one audit record per call -- with phases, reference
 * prefixes (never the full reference), reasons on deletions, and zero
 * sensitive payloads in the serialized lines.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import { registerReadTools, registerWriteTools } from '../../src/core/tools/index.js';
import { ToolRegistry } from '../../src/core/tools/registry.js';
import type { RoleProfile } from '../../src/core/authorization/role-profiles.js';
import { invokeTool, type AdapterRuntime } from '../../src/adapters/shared.js';
import { createAuditSink } from '../../src/observability/audit.js';
import { Metrics } from '../../src/observability/metrics.js';
import { resetConsumedReferences } from '../../src/core/writes/confirmation.js';
import { resetDuplicateGuard } from '../../src/core/writes/duplicate-guard.js';
import { AUTH_SUCCESS, EMPLOYEES_WITH_FINANCE } from '../fixtures/jisr/index.js';

const ORG = 'org-audit-write-1';

interface CapturedLine {
  tool?: string;
  outcome?: string;
  phase?: string;
  referencePrefix?: string;
  reason?: string;
  errorCode?: string | null;
}

function captureSink(): { sink: ReturnType<typeof createAuditSink>; lines: string[] } {
  const lines: string[] = [];
  const stream = {
    write: (chunk: string) => {
      lines.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { sink: createAuditSink(stream), lines };
}

/** POST behavior is switchable so one harness covers success and ambiguity. */
function makeRuntime(
  profile: RoleProfile,
  behavior: { postStatus: number },
  world: { transactions: object[] },
): { runtime: AdapterRuntime; lines: string[] } {
  const fetchStub = ((input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (method === 'POST' && url.includes('/attendance_logs')) {
      return Promise.resolve({
        ok: behavior.postStatus < 400,
        status: behavior.postStatus,
        json: () =>
          Promise.resolve(
            behavior.postStatus < 400
              ? { success: true, message: null, data: null }
              : { success: false },
          ),
      } as Response);
    }
    if (method === 'DELETE') {
      world.transactions = [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, message: null, data: null }),
      } as Response);
    }
    const body = url.includes('/auth')
      ? AUTH_SUCCESS
      : url.includes('/payroll_transactions')
        ? {
            success: true,
            data: {
              employees: [
                {
                  id: 1,
                  code: 1001,
                  full_name_en: 'Fictional Employee One',
                  transactions: world.transactions,
                },
              ],
              pagination: { current_page: 1, next_page: null, previous_page: null, total_pages: 1 },
            },
          }
        : url.includes('/attendance_logs')
          ? {
              success: true,
              data: {
                punches: [],
                pagination: {
                  current_page: 1,
                  next_page: null,
                  previous_page: null,
                  total_pages: 1,
                },
              },
            }
          : EMPLOYEES_WITH_FINANCE;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  }) as unknown as typeof fetch;

  const config: AppConfig = {
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'acme',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: profile,
    featureFlags: createFeatureFlags({
      financeSurfaceEnabled: true,
      writeAttendance: true,
      writeEmployees: true,
      writePayrollDelete: true,
    }),
    subjectEmployeeId: undefined,
    logLevel: 'error',
  };

  const registry = new ToolRegistry();
  registerReadTools(registry);
  registerWriteTools(registry);
  const { sink, lines } = captureSink();

  return {
    lines,
    runtime: {
      registry,
      context: {
        principal: createPrincipal({ organizationId: ORG, profile }),
        flags: config.featureFlags,
        observed: UNPROBED,
        client: new JisrClient(config, new TokenCache(), fetchStub),
        connection: { hostType: 'aws' },
      },
      audit: sink,
      metrics: new Metrics(),
    },
  };
}

function parsed(lines: string[]): CapturedLine[] {
  return lines.map((line) => JSON.parse(line) as CapturedLine);
}

beforeEach(() => {
  resetConsumedReferences();
  resetDuplicateGuard();
});

describe('a replayed write session', () => {
  it('leaves one complete record per prepare, commit, refusal, and ambiguity', async () => {
    const behavior = { postStatus: 200 };
    const { runtime, lines } = makeRuntime('hr_operations', behavior, { transactions: [] });
    const now = new Date().toISOString();

    // 1. prepare -- allowed, phase prepare
    const prepareResult = await invokeTool(runtime, 'jisr_attendance_punch_create_prepare', {
      employeeCode: 1001,
      punchTime: now,
      reason: 'Forgot to clock in',
    });
    const reference = (prepareResult.structuredContent as { confirmationReference: string })
      .confirmationReference;

    // 2. commit -- allowed, phase commit
    await invokeTool(runtime, 'jisr_attendance_punch_create_commit', {
      confirmationReference: reference,
    });

    // 3. refusal -- a forged reference
    await invokeTool(runtime, 'jisr_attendance_punch_create_commit', {
      confirmationReference: 'not-a-reference',
    });

    // 4. ambiguity -- a fresh prepare, then the upstream 503s on submit
    const second = await invokeTool(runtime, 'jisr_attendance_punch_create_prepare', {
      employeeCode: 1001,
      punchTime: new Date(Date.now() + 3_600_000).toISOString(),
      reason: 'Second correction',
    });
    behavior.postStatus = 503;
    await invokeTool(runtime, 'jisr_attendance_punch_create_commit', {
      confirmationReference: (second.structuredContent as { confirmationReference: string })
        .confirmationReference,
    });

    const records = parsed(lines);
    expect(records).toHaveLength(5);

    expect(records[0]).toMatchObject({
      tool: 'jisr_attendance_punch_create_prepare',
      outcome: 'allowed',
      phase: 'prepare',
      reason: 'Forgot to clock in',
    });
    expect(records[1]).toMatchObject({
      tool: 'jisr_attendance_punch_create_commit',
      outcome: 'allowed',
      phase: 'commit',
    });
    expect(records[2]).toMatchObject({
      outcome: 'refused',
      errorCode: 'WRITE_CONFIRMATION_REQUIRED',
    });
    expect(records[4]).toMatchObject({
      outcome: 'refused',
      errorCode: 'WRITE_OUTCOME_UNKNOWN',
    });

    // The full reference never enters the trail -- only its 8-char prefix.
    expect(records[0]?.referencePrefix).toHaveLength(8);
    for (const line of lines) {
      expect(line).not.toContain(reference);
    }
  });

  it('records the reason on both halves of a deletion', async () => {
    const world = {
      transactions: [{ id: 501, amount: 750, category: 'allowance' }] as object[],
    };
    const { runtime, lines } = makeRuntime('finance', { postStatus: 200 }, world);

    const prepared = await invokeTool(runtime, 'jisr_payroll_transaction_delete_prepare', {
      transactionId: 501,
      reason: 'Entered twice by mistake',
    });
    await invokeTool(runtime, 'jisr_payroll_transaction_delete_commit', {
      confirmationReference: (prepared.structuredContent as { confirmationReference: string })
        .confirmationReference,
    });

    const records = parsed(lines);
    expect(records).toHaveLength(2);
    expect(records[0]?.reason).toBe('Entered twice by mistake');
    expect(records[1]?.reason).toBe('Entered twice by mistake');

    // Zero sensitive payloads: the amount never enters the audit trail.
    for (const line of lines) {
      expect(line).not.toContain('750');
      expect(line).not.toContain('basic_salary');
    }
  });
});

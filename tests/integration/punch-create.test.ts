/**
 * Punch prepare/commit round trip (T015, SC-004, quickstart W2).
 *
 * The commit result is asserted as the stubbed RE-READ state, deliberately
 * different from the submitted payload: proof the tool reports what Jisr
 * holds, not an echo of what it sent.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import {
  commitPunchCreate,
  preparePunchCreate,
} from '../../src/core/services/attendance-write-service.js';
import { punchCreatePrepareTool } from '../../src/core/tools/attendance/punch-create.js';
import { inputSchemaOf, type ToolContext } from '../../src/core/tools/registry.js';
import { resetConsumedReferences } from '../../src/core/writes/confirmation.js';
import { resetDuplicateGuard } from '../../src/core/writes/duplicate-guard.js';
import { AUTH_SUCCESS, EMPLOYEES_WITH_FINANCE } from '../fixtures/jisr/index.js';
import { refusalFrom } from '../helpers.js';

const ORG = 'org-punch-00001';

/** What the server holds after the write -- NOT what was submitted. */
const RE_READ_PUNCH = {
  id: 987654,
  punch_time: '2026-08-31 09:00:03',
  employee_code: 1001,
  terminal_sn: 'SRV-NORMALIZED',
  clocking_id: 555,
};

function harness(): { context: ToolContext; calls: { method: string; url: string }[] } {
  const calls: { method: string; url: string }[] = [];
  const fetchStub = ((input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    const body = url.includes('/auth')
      ? AUTH_SUCCESS
      : url.includes('/attendance_logs') && method === 'POST'
        ? { success: true, message: null, data: null }
        : url.includes('/attendance_logs')
          ? {
              success: true,
              data: {
                punches: [RE_READ_PUNCH],
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
    roleProfile: 'hr_operations',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false, writeAttendance: true }),
    subjectEmployeeId: undefined,
    logLevel: 'error',
  };

  return {
    calls,
    context: {
      principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
      flags: config.featureFlags,
      observed: UNPROBED,
      client: new JisrClient(config, new TokenCache(), fetchStub),
      connection: { hostType: 'aws' },
    },
  };
}

function nowZoned(): string {
  return new Date().toISOString();
}

beforeEach(() => {
  resetConsumedReferences();
  resetDuplicateGuard();
});

describe('the prepare/commit round trip', () => {
  it('previews without writing, then commits and reports the re-read state', async () => {
    const { context, calls } = harness();

    const prepared = await preparePunchCreate(
      { employeeCode: 1001, punchTime: nowZoned(), reason: 'Forgot to clock in' },
      context,
    );
    const content = prepared.structuredContent as {
      preview: { employeeName: string | null };
      confirmationReference: string;
    };
    expect(content.preview.employeeName).toBe('Fictional Employee One');
    expect(prepared.summary).toContain('PREVIEW ONLY');
    // Prepare reached auth + employees only -- never a POST.
    expect(calls.filter((c) => c.method === 'POST' && c.url.includes('/attendance_logs'))).toEqual(
      [],
    );

    const committed = await commitPunchCreate(
      { confirmationReference: content.confirmationReference },
      context,
    );
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/attendance_logs'))).toBe(true);

    // SC-004: the result is the re-read state, not the submission echo.
    const envelope = committed.structuredContent as { records: readonly unknown[] };
    expect(envelope.records).toEqual([
      {
        id: 987654,
        punchTime: '2026-08-31 09:00:03',
        employeeCode: 1001,
        terminalSerial: 'SRV-NORMALIZED',
        clockingId: 555,
      },
    ]);
    expect(committed.writeAudit?.phase).toBe('commit');
  });

  it('refuses a commit with no real reference', async () => {
    const { context } = harness();
    const error = await refusalFrom(() =>
      commitPunchCreate({ confirmationReference: '' }, context),
    );
    expect(error.code).toBe('WRITE_CONFIRMATION_REQUIRED');
  });

  it('refuses an invented reference before reading any claim inside it', async () => {
    const { context, calls } = harness();
    const invented = `${Buffer.from(
      JSON.stringify({ organizationId: ORG, expiresAt: Date.now() + 60_000 }),
    ).toString('base64url')}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const error = await refusalFrom(() =>
      commitPunchCreate({ confirmationReference: invented }, context),
    );
    expect(error.code).toBe('WRITE_CONFIRMATION_REQUIRED');
    expect(calls.filter((c) => c.method === 'POST' && c.url.includes('/attendance_logs'))).toEqual(
      [],
    );
  });

  it('a reference cannot be committed twice', async () => {
    const { context } = harness();
    const prepared = await preparePunchCreate(
      { employeeCode: 1001, punchTime: nowZoned(), reason: 'One punch' },
      context,
    );
    const { confirmationReference } = prepared.structuredContent as {
      confirmationReference: string;
    };
    await commitPunchCreate({ confirmationReference }, context);
    const error = await refusalFrom(() => commitPunchCreate({ confirmationReference }, context));
    expect(error.code).toBe('WRITE_CONFIRMATION_REQUIRED');
    expect(error.message).toContain('already been used');
  });

  it('refuses an unknown employee code without preparing anything', async () => {
    const { context } = harness();
    const error = await refusalFrom(() =>
      preparePunchCreate({ employeeCode: 424242, punchTime: nowZoned(), reason: 'x' }, context),
    );
    expect(error.code).toBe('RECORD_NOT_FOUND');
  });

  it('refuses an array of punches at the schema -- no batch form', () => {
    const schema = inputSchemaOf(punchCreatePrepareTool);
    expect(
      schema.safeParse([{ employeeCode: 1001, punchTime: nowZoned(), reason: 'x' }]).success,
    ).toBe(false);
    expect(
      schema.safeParse({ employeeCode: 1001, punchTime: [nowZoned(), nowZoned()], reason: 'x' })
        .success,
    ).toBe(false);
    // And no input field of the pair is array-typed.
    for (const field of Object.values(punchCreatePrepareTool.inputShape)) {
      expect(field instanceof z.ZodArray).toBe(false);
    }
  });

  it('refuses an empty reason', async () => {
    const { context } = harness();
    const error = await refusalFrom(() =>
      preparePunchCreate({ employeeCode: 1001, punchTime: nowZoned(), reason: '   ' }, context),
    );
    expect(error.code).toBe('REASON_REQUIRED');
  });
});

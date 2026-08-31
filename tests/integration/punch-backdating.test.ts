/**
 * The backdating window (T016, spec FR-013a, clarification 2026-08-31).
 *
 * Current and previous calendar month only. The stated local date is what a
 * human wrote and what payroll sees, so the window applies to it as written;
 * a zone-less time refuses outright rather than being guessed at.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preparePunchCreate } from '../../src/core/services/attendance-write-service.js';
import { resetConsumedReferences } from '../../src/core/writes/confirmation.js';
import { resetDuplicateGuard } from '../../src/core/writes/duplicate-guard.js';
import { refusalFrom } from '../helpers.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import type { AppConfig } from '../../src/config/environment.js';
import type { ToolContext } from '../../src/core/tools/registry.js';
import { AUTH_SUCCESS, EMPLOYEES_WITH_FINANCE } from '../fixtures/jisr/index.js';

const ORG = 'org-window-0001';

function context(): ToolContext {
  const fetchStub = ((input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = url.includes('/auth') ? AUTH_SUCCESS : EMPLOYEES_WITH_FINANCE;
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
    principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
    flags: config.featureFlags,
    observed: UNPROBED,
    client: new JisrClient(config, new TokenCache(), fetchStub),
    connection: { hostType: 'aws' },
  };
}

beforeEach(() => {
  resetConsumedReferences();
  resetDuplicateGuard();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('the backdating window', () => {
  it('accepts a punch in the previous calendar month', async () => {
    const prepared = await preparePunchCreate(
      { employeeCode: 1001, punchTime: '2026-07-31T23:30:00+03:00', reason: 'Late correction' },
      context(),
    );
    const content = prepared.structuredContent as { confirmationReference: string };
    expect(content.confirmationReference).toContain('.');
  });

  it('accepts a punch in the current month', async () => {
    const prepared = await preparePunchCreate(
      { employeeCode: 1001, punchTime: '2026-08-15T09:00:00+03:00', reason: 'Missed clock-in' },
      context(),
    );
    expect((prepared.structuredContent as { expiresAt: string }).expiresAt).toBeTruthy();
  });

  it('refuses anything older with BACKDATING_WINDOW_EXCEEDED', async () => {
    const error = await refusalFrom(() =>
      preparePunchCreate(
        { employeeCode: 1001, punchTime: '2026-06-30T09:00:00+03:00', reason: 'Too old' },
        context(),
      ),
    );
    expect(error.code).toBe('BACKDATING_WINDOW_EXCEEDED');
    expect(error.message).toContain('2026-06');
  });

  it('refuses a zone-less punch time with TIMEZONE_REQUIRED', async () => {
    const error = await refusalFrom(() =>
      preparePunchCreate(
        { employeeCode: 1001, punchTime: '2026-08-15T09:00:00', reason: 'No zone' },
        context(),
      ),
    );
    expect(error.code).toBe('TIMEZONE_REQUIRED');
  });
});

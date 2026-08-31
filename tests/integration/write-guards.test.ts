/**
 * Duplicate guard and ambiguous-outcome handling (T014, quickstart W3, W7).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertNotDuplicate,
  DUPLICATE_WINDOW_MS,
  resetDuplicateGuard,
} from '../../src/core/writes/duplicate-guard.js';
import { submitGuarded } from '../../src/core/writes/outcome.js';
import { JisrMcpError } from '../../src/core/errors.js';
import { refusalFrom } from '../helpers.js';

const ORG = 'org-test-1';
const PAYLOAD = { id: 7, punch_time: '2026-08-30 09:00:00', terminal_sn: 'T-1' };

beforeEach(() => resetDuplicateGuard());
afterEach(() => vi.useRealTimers());

describe('the duplicate guard', () => {
  it('lets a first write through and records it', () => {
    expect(() => assertNotDuplicate(ORG, 'createAttendanceLogs', PAYLOAD)).not.toThrow();
  });

  it('refuses an identical payload inside the 10-minute window', async () => {
    assertNotDuplicate(ORG, 'createAttendanceLogs', PAYLOAD);
    const error = await refusalFrom(() => assertNotDuplicate(ORG, 'createAttendanceLogs', PAYLOAD));
    expect(error.code).toBe('DUPLICATE_WRITE_SUSPECTED');
  });

  it('lets an acknowledged intentional repeat through', () => {
    assertNotDuplicate(ORG, 'createAttendanceLogs', PAYLOAD);
    expect(() =>
      assertNotDuplicate(ORG, 'createAttendanceLogs', PAYLOAD, { acknowledged: true }),
    ).not.toThrow();
  });

  it('does not confuse different payloads, operations, or organizations', () => {
    assertNotDuplicate(ORG, 'createAttendanceLogs', PAYLOAD);
    expect(() =>
      assertNotDuplicate(ORG, 'createAttendanceLogs', { ...PAYLOAD, id: 8 }),
    ).not.toThrow();
    expect(() => assertNotDuplicate(ORG, 'createEmployee', PAYLOAD)).not.toThrow();
    expect(() => assertNotDuplicate('org-test-2', 'createAttendanceLogs', PAYLOAD)).not.toThrow();
  });

  it('forgets a payload after the window passes', () => {
    vi.useFakeTimers();
    assertNotDuplicate(ORG, 'createAttendanceLogs', PAYLOAD);
    vi.advanceTimersByTime(DUPLICATE_WINDOW_MS + 1_000);
    expect(() => assertNotDuplicate(ORG, 'createAttendanceLogs', PAYLOAD)).not.toThrow();
  });
});

describe('ambiguous-outcome handling', () => {
  it('passes a success through untouched', async () => {
    await expect(
      submitGuarded(() => Promise.resolve('ok'), 'jisr_audit_events_list'),
    ).resolves.toBe('ok');
  });

  it('maps a post-submit timeout to WRITE_OUTCOME_UNKNOWN naming the read tool', async () => {
    const error = await refusalFrom(() =>
      submitGuarded(
        () => Promise.reject(new JisrMcpError('JISR_TEMPORARILY_UNAVAILABLE', 'timeout')),
        'jisr_audit_events_list',
      ),
    );
    expect(error.code).toBe('WRITE_OUTCOME_UNKNOWN');
    expect(error.suggestedAction).toContain('jisr_audit_events_list');
    expect(error.suggestedAction).toContain('Do NOT retry');
  });

  it('maps an unparseable post-submit response to WRITE_OUTCOME_UNKNOWN', async () => {
    const error = await refusalFrom(() =>
      submitGuarded(
        () => Promise.reject(new JisrMcpError('JISR_RESPONSE_INVALID', 'bad body')),
        'jisr_employees_list',
      ),
    );
    expect(error.code).toBe('WRITE_OUTCOME_UNKNOWN');
  });

  it('passes an unambiguous refusal (e.g. permission denied) through unchanged', async () => {
    const error = await refusalFrom(() =>
      submitGuarded(
        () => Promise.reject(new JisrMcpError('JISR_PERMISSION_DENIED', 'no')),
        'jisr_employees_list',
      ),
    );
    expect(error.code).toBe('JISR_PERMISSION_DENIED');
  });
});

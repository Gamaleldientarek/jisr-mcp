/**
 * Confirmation reference security (T012, SC-003, SC-005).
 *
 * Every way a reference can be wrong refuses DISTINCTLY: a forged string, an
 * expired one, a consumed one, and one presented by the wrong caller, wrong
 * organization, or against a changed target. Distinct codes matter -- the
 * caller's remedy differs for each.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIRMATION_TTL_MS,
  consumeReference,
  hashTarget,
  issueReference,
  resetConsumedReferences,
  type ConfirmationBinding,
} from '../../src/core/writes/confirmation.js';
import { refusalFrom } from '../helpers.js';

const BINDING: ConfirmationBinding = {
  organizationId: 'org-test-1',
  principalRef: 'principal-a',
  operationId: 'createAttendanceLogs',
  targetHash: hashTarget({ id: 1, punch_time: '2026-08-30 09:00:00' }),
};

beforeEach(() => resetConsumedReferences());
afterEach(() => vi.useRealTimers());

describe('confirmation references', () => {
  it('a freshly issued reference is accepted once', () => {
    const { reference, expiresAt } = issueReference(BINDING);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(() => consumeReference(reference, BINDING)).not.toThrow();
  });

  it('a consumed reference refuses on second use (single-use)', async () => {
    const { reference } = issueReference(BINDING);
    consumeReference(reference, BINDING);
    const error = await refusalFrom(() => consumeReference(reference, BINDING));
    expect(error.code).toBe('WRITE_CONFIRMATION_REQUIRED');
    expect(error.message).toContain('already been used');
  });

  it('a forged reference refuses before its claims are read', async () => {
    const forged = Buffer.from(
      JSON.stringify({ ...BINDING, expiresAt: Date.now() + 999999 }),
    ).toString('base64url');
    const error = await refusalFrom(() =>
      consumeReference(`${forged}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, BINDING),
    );
    expect(error.code).toBe('WRITE_CONFIRMATION_REQUIRED');
    expect(error.message).toContain('integrity');
  });

  it('a plainly malformed string refuses', async () => {
    const error = await refusalFrom(() => consumeReference('not-a-reference', BINDING));
    expect(error.code).toBe('WRITE_CONFIRMATION_REQUIRED');
  });

  it('an expired reference refuses with WRITE_PREPARATION_EXPIRED at TTL+1s', async () => {
    vi.useFakeTimers();
    const { reference } = issueReference(BINDING);
    vi.advanceTimersByTime(CONFIRMATION_TTL_MS + 1_000);
    const error = await refusalFrom(() => consumeReference(reference, BINDING));
    expect(error.code).toBe('WRITE_PREPARATION_EXPIRED');
  });

  it('a reference presented by a different caller refuses', async () => {
    const { reference } = issueReference(BINDING);
    const error = await refusalFrom(() =>
      consumeReference(reference, { ...BINDING, principalRef: 'principal-b' }),
    );
    expect(error.code).toBe('WRITE_CONFIRMATION_REQUIRED');
    expect(error.message).toContain('different caller');
  });

  it('a reference presented for a different operation refuses', async () => {
    const { reference } = issueReference(BINDING);
    const error = await refusalFrom(() =>
      consumeReference(reference, { ...BINDING, operationId: 'createEmployee' }),
    );
    expect(error.code).toBe('WRITE_CONFIRMATION_REQUIRED');
  });

  it('a cross-organization reference refuses with ORGANIZATION_MISMATCH', async () => {
    const { reference } = issueReference(BINDING);
    const error = await refusalFrom(() =>
      consumeReference(reference, { ...BINDING, organizationId: 'org-test-2' }),
    );
    expect(error.code).toBe('ORGANIZATION_MISMATCH');
  });

  it('a changed target refuses with WRITE_TARGET_CHANGED', async () => {
    const { reference } = issueReference(BINDING);
    const error = await refusalFrom(() =>
      consumeReference(reference, {
        ...BINDING,
        targetHash: hashTarget({ id: 1, punch_time: '2026-08-30 09:00:01' }),
      }),
    );
    expect(error.code).toBe('WRITE_TARGET_CHANGED');
  });

  it('hashTarget is stable across key ordering', () => {
    expect(hashTarget({ a: 1, b: 2 })).toBe(hashTarget({ b: 2, a: 1 }));
  });
});

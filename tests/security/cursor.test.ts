/**
 * Cursor integrity (spec FR-033, quickstart V7).
 *
 * A cursor is opaque, signed, expiring, and bound to organization + operation +
 * filter set. Verification is signature-first, so a forged cursor is rejected
 * before any of its claims are read.
 */

import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, hashFilters } from '../../src/core/cursor.js';

const BINDING = {
  organizationId: 'org-aaaaaaaa0001',
  operationId: 'listEmployees',
  filtersHash: hashFilters({ status: 'active' }),
};

describe('round trip', () => {
  it('recovers the page number it was issued for', () => {
    expect(decodeCursor(encodeCursor(BINDING, 4), BINDING)).toBe(4);
  });

  it('discloses nothing readable about its contents', () => {
    const cursor = encodeCursor(BINDING, 4);
    expect(cursor).not.toContain('listEmployees');
    expect(cursor).not.toContain(BINDING.organizationId);
  });
});

describe('rejection', () => {
  it('refuses a tampered payload', () => {
    const cursor = encodeCursor(BINDING, 4);
    const [body, signature] = cursor.split('.');
    const forged = `${Buffer.from(
      JSON.stringify({
        o: BINDING.organizationId,
        p: BINDING.operationId,
        n: 999,
        f: BINDING.filtersHash,
        e: Date.now() + 60000,
      }),
    ).toString('base64url')}.${signature ?? ''}`;
    expect(body).toBeDefined();
    expect(() => decodeCursor(forged, BINDING)).toThrow(/integrity check/);
  });

  it('refuses a malformed cursor', () => {
    expect(() => decodeCursor('not-a-cursor', BINDING)).toThrow(/malformed/);
  });

  it('refuses an expired cursor', () => {
    const expired = encodeCursor(BINDING, 1, -1);
    expect(() => decodeCursor(expired, BINDING)).toThrow(/expired/);
  });

  it('refuses a cursor from another organization', () => {
    const other = encodeCursor({ ...BINDING, organizationId: 'org-bbbbbbbb0002' }, 2);
    expect(() => decodeCursor(other, { ...BINDING })).toThrow(
      /does not belong to this organization/,
    );
  });

  it('refuses a cursor issued for a different operation', () => {
    const other = encodeCursor({ ...BINDING, operationId: 'listPaygroups' }, 2);
    expect(() => decodeCursor(other, BINDING)).toThrow(/different request/);
  });

  it('refuses a cursor issued for a different filter set', () => {
    // Changing filters mid-traversal would silently mix two result sets.
    const other = encodeCursor({ ...BINDING, filtersHash: hashFilters({ status: 'inactive' }) }, 2);
    expect(() => decodeCursor(other, BINDING)).toThrow(/different request/);
  });
});

describe('filter hashing', () => {
  it('is order-independent', () => {
    expect(hashFilters({ a: 1, b: 2 })).toBe(hashFilters({ b: 2, a: 1 }));
  });

  it('ignores undefined values so an omitted filter matches an absent one', () => {
    expect(hashFilters({ a: 1, b: undefined })).toBe(hashFilters({ a: 1 }));
  });

  it('distinguishes different values', () => {
    expect(hashFilters({ status: 'active' })).not.toBe(hashFilters({ status: 'inactive' }));
  });
});

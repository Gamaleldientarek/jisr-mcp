/**
 * Opaque pagination cursors (spec FR-033).
 *
 * A cursor is integrity-protected and binds four things: the organization, the
 * operation, the upstream page, and a hash of the approved filter set. A
 * mismatch on any of them is refused. It never contains a credential, and a
 * caller-supplied upstream address is never accepted anywhere.
 *
 * The signing key is generated per process. Cursors expire in minutes, so
 * surviving a restart has no value -- and a key that is never persisted is a
 * key that cannot leak from disk.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { JisrMcpError } from './errors.js';

const SIGNING_KEY = randomBytes(32);
const DEFAULT_TTL_MS = 10 * 60 * 1000;

interface CursorPayload {
  readonly o: string; // organizationId
  readonly p: string; // operationId
  readonly n: number; // upstream page number
  readonly f: string; // filter-set hash
  readonly e: number; // expiry, epoch ms
}

export interface CursorBinding {
  readonly organizationId: string;
  readonly operationId: string;
  readonly filtersHash: string;
}

function sign(body: string): string {
  return createHmac('sha256', SIGNING_KEY).update(body).digest('base64url');
}

/** Stable hash of the approved filter set, so filters cannot change mid-traversal. */
export function hashFilters(filters: Readonly<Record<string, unknown>>): string {
  const canonical = JSON.stringify(
    Object.keys(filters)
      .filter((key) => filters[key] !== undefined)
      .sort()
      .map((key) => [key, filters[key]]),
  );
  return createHmac('sha256', SIGNING_KEY).update(canonical).digest('base64url').slice(0, 22);
}

export function encodeCursor(
  binding: CursorBinding,
  page: number,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const payload: CursorPayload = {
    o: binding.organizationId,
    p: binding.operationId,
    n: page,
    f: binding.filtersHash,
    e: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * Verifies and unpacks a cursor.
 *
 * Order matters: signature first, so a forged cursor is rejected before any of
 * its claims are read. Then expiry, then binding.
 */
export function decodeCursor(cursor: string, expected: CursorBinding): number {
  const separator = cursor.lastIndexOf('.');
  if (separator <= 0) {
    throw new JisrMcpError('INVALID_CURSOR', 'The pagination cursor is malformed.');
  }

  const body = cursor.slice(0, separator);
  const signature = cursor.slice(separator + 1);
  const expectedSignature = sign(body);

  const provided = Buffer.from(signature, 'base64url');
  const computed = Buffer.from(expectedSignature, 'base64url');
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
    throw new JisrMcpError(
      'INVALID_CURSOR',
      'The pagination cursor failed its integrity check.',
      'Start the collection again without a cursor.',
    );
  }

  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CursorPayload;
  } catch {
    throw new JisrMcpError('INVALID_CURSOR', 'The pagination cursor is malformed.');
  }

  if (Date.now() > payload.e) {
    throw new JisrMcpError(
      'CURSOR_EXPIRED',
      'The pagination cursor has expired.',
      'Start the collection again without a cursor.',
    );
  }

  // A cursor from another organization is a tenancy failure, reported as such.
  if (payload.o !== expected.organizationId) {
    throw new JisrMcpError(
      'ORGANIZATION_MISMATCH',
      'That pagination cursor does not belong to this organization.',
    );
  }

  if (payload.p !== expected.operationId || payload.f !== expected.filtersHash) {
    throw new JisrMcpError(
      'INVALID_CURSOR',
      'That pagination cursor belongs to a different request.',
      'Cursors are bound to one operation and one set of filters. Start again without a cursor.',
    );
  }

  return payload.n;
}

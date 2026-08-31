/**
 * Duplicate-write guard (spec FR-007, research W4).
 *
 * Upstream idempotency is undocumented, so the server carries its own second
 * layer: an identical payload committed again within the window is refused
 * with DUPLICATE_WRITE_SUSPECTED until a fresh prepare acknowledges it.
 * (The first layer is single-use references; this catches re-prepared
 * identical writes.)
 */

import { createHash } from 'node:crypto';
import { JisrMcpError } from '../errors.js';

export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const seen = new Map<string, number>();

function keyFor(organizationId: string, operationId: string, payload: unknown): string {
  const body = JSON.stringify(payload);
  return createHash('sha256').update(`${organizationId}|${operationId}|${body}`).digest('hex');
}

export function assertNotDuplicate(
  organizationId: string,
  operationId: string,
  payload: unknown,
  options?: { acknowledged?: boolean },
): void {
  const key = keyFor(organizationId, operationId, payload);
  const firstSeen = seen.get(key);
  const now = Date.now();

  // Expire old entries opportunistically.
  for (const [k, ts] of seen) if (now - ts > DUPLICATE_WINDOW_MS) seen.delete(k);

  if (
    firstSeen !== undefined &&
    now - firstSeen <= DUPLICATE_WINDOW_MS &&
    options?.acknowledged !== true
  ) {
    throw new JisrMcpError(
      'DUPLICATE_WRITE_SUSPECTED',
      'An identical write was committed in the last 10 minutes.',
      'If this repeat is intentional, prepare again and confirm the duplicate acknowledgment.',
    );
  }
  seen.set(key, now);
}

/** Test hook. */
export function resetDuplicateGuard(): void {
  seen.clear();
}

/**
 * Correlation identifiers (spec FR-039).
 *
 * One identifier links a caller's request through the authorization decision,
 * the upstream call, and the audit record -- so an investigation can follow a
 * single request end to end without joining on timestamps.
 */

import { randomUUID } from 'node:crypto';

export interface Correlation {
  readonly correlationId: string;
  readonly startedAt: number;
}

export function beginCorrelation(): Correlation {
  return { correlationId: randomUUID(), startedAt: Date.now() };
}

export function elapsedMs(correlation: Correlation): number {
  return Date.now() - correlation.startedAt;
}

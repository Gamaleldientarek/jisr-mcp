/**
 * The human-readable summary accompanying every structured result
 * (spec FR-032).
 *
 * MCP results carry two things: machine-reusable structured content, and a
 * short line a person can read. This produces the second.
 *
 * It states counts and caveats, never record contents -- a summary that quoted
 * an employee name would put personal data into a surface the field policy does
 * not govern.
 */

import type { ResultEnvelope } from './envelope.js';

export function summarize<T>(envelope: ResultEnvelope<T>): string {
  const count = envelope.records.length;
  const parts: string[] = [];

  parts.push(
    count === 0 ? 'No matching records.' : `${count} record${count === 1 ? '' : 's'} returned.`,
  );

  if (envelope.pagination.nextCursor !== null) {
    parts.push('More are available; continue with the returned cursor.');
  }

  if (envelope.isPartial) {
    parts.push('This result is partial.');
  }

  for (const warning of envelope.warnings) {
    parts.push(warning.message);
  }

  // Freshness on every result, so no caller has to assume it (spec FR-031).
  parts.push(`Live from Jisr at ${envelope.dataAsOf}.`);

  return parts.join(' ');
}

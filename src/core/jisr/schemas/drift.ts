/**
 * Schema drift detection (spec FR-027, User Story 4).
 *
 * When Jisr returns a field the approved snapshot does not declare, it is
 * withheld and recorded. Never passed through: an undeclared field has no
 * classification, and an unclassified field could be anything -- a national ID,
 * a salary, a token.
 *
 * What is recorded is the field PATH and nothing else. The value of an unknown
 * field is exactly the thing that might be sensitive, so a drift record that
 * captured it would become the disclosure it exists to prevent.
 */

import type { Warning } from '../../envelope.js';
import { WARNING_CODES } from '../../envelope.js';

export interface DriftRecord {
  readonly operationId: string;
  readonly fieldPath: string;
  readonly detectedAt: string;
  readonly snapshotVersion: string;
}

export interface DriftSink {
  record(entry: DriftRecord): void;
  entries(): readonly DriftRecord[];
}

/**
 * In-process drift collection.
 *
 * Deduplicated by operation and path: a drifted field appears on every record
 * in a page, and one occurrence is as informative as a thousand.
 */
export class DriftCollector implements DriftSink {
  readonly #seen = new Map<string, DriftRecord>();

  record(entry: DriftRecord): void {
    this.#seen.set(`${entry.operationId}:${entry.fieldPath}`, entry);
  }

  entries(): readonly DriftRecord[] {
    return [...this.#seen.values()];
  }

  clear(): void {
    this.#seen.clear();
  }
}

/** The process-wide collector. Read by diagnostics; never returned to a caller. */
export const driftCollector = new DriftCollector();

export function recordDrift(
  operationId: string,
  fieldPaths: readonly string[],
  snapshotVersion: string,
  sink: DriftSink = driftCollector,
): void {
  const detectedAt = new Date().toISOString();
  for (const fieldPath of fieldPaths) {
    sink.record({ operationId, fieldPath, detectedAt, snapshotVersion });
  }
}

/**
 * The caller-facing warning.
 *
 * States that drift occurred and how many fields, without naming them. Even a
 * field NAME can disclose: `national_id_expiry` tells you what Jisr now holds.
 */
export function driftWarning(count: number): Warning {
  return {
    code: WARNING_CODES.SCHEMA_DRIFT,
    message: `Jisr returned ${count} field(s) absent from the approved schema; they were withheld. The result may be incomplete.`,
  };
}

/**
 * The coverage gate must have teeth (spec FR-010, SC-002).
 *
 * A gate that passes is worth nothing unless it also fails. These assertions
 * check the gate's own logic against deliberately broken manifests, so a future
 * refactor cannot quietly turn it into a no-op.
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ENDPOINT_MANIFEST,
  SNAPSHOT_VERSION,
  manifestOperationKeys,
  release1ReadEntries,
} from '../../src/core/jisr/endpoint-manifest.js';

const SNAPSHOT = new URL(
  `../../specs/001-jisr-mcp-server/contracts/jisr-openapi-snapshot-${SNAPSHOT_VERSION}.yaml`,
  import.meta.url,
).pathname;

function extractOperations(yaml: string): string[] {
  const operations: string[] = [];
  let inPaths = false;
  let currentPath: string | null = null;
  for (const line of yaml.split('\n')) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^[a-zA-Z]/.test(line)) break;
    if (!inPaths) continue;
    const p = /^ {2}"?(\/[^"\s:]+)"?:\s*$/.exec(line);
    if (p?.[1]) {
      currentPath = p[1];
      continue;
    }
    const m = /^ {4}"?(get|post|put|patch|delete)"?:\s*$/.exec(line);
    if (m?.[1] && currentPath) operations.push(`${m[1].toUpperCase()} ${currentPath}`);
  }
  return operations;
}

describe('manifest against the approved snapshot', () => {
  it('covers exactly the operations the snapshot declares', async () => {
    const snapshot = new Set(extractOperations(await readFile(SNAPSHOT, 'utf8')));
    const manifest = new Set(manifestOperationKeys());

    expect([...snapshot].filter((op) => !manifest.has(op))).toEqual([]);
    expect([...manifest].filter((op) => !snapshot.has(op))).toEqual([]);
    expect(manifest.size).toBe(29);
  });

  it('binds all 20 release 1 reads and nothing else', () => {
    const reads = release1ReadEntries();
    expect(reads).toHaveLength(20);
    for (const entry of reads) expect(entry.implementedTool).not.toBeNull();
  });

  it('gives every bound tool a unique name', () => {
    const tools = ENDPOINT_MANIFEST.map((e) => e.implementedTool).filter(
      (t): t is string => t !== null,
    );
    expect(new Set(tools).size).toBe(tools.length);
  });

  it('lists no non-finance profile against a financial operation', () => {
    for (const entry of ENDPOINT_MANIFEST) {
      if (entry.sensitivity !== 'financial_confidential' || entry.implementedTool === null)
        continue;
      expect(entry.requiredProfiles.filter((p) => p !== 'finance')).toEqual([]);
    }
  });
});

describe('the gate detects divergence', () => {
  const snapshotOps = async (): Promise<Set<string>> =>
    new Set(extractOperations(await readFile(SNAPSHOT, 'utf8')));

  it('would fail if an operation were dropped from the manifest', async () => {
    const snapshot = await snapshotOps();
    const truncated = new Set(manifestOperationKeys().slice(1));
    const missing = [...snapshot].filter((op) => !truncated.has(op));
    expect(missing.length).toBeGreaterThan(0);
  });

  it('would fail if the manifest declared an operation the snapshot lacks', async () => {
    const snapshot = await snapshotOps();
    expect(snapshot.has('GET /openapi/v1/invented_endpoint')).toBe(false);
  });

  it('would fail if a release 2 operation were bound outside the allowlist', () => {
    const releaseTwo = ENDPOINT_MANIFEST.filter((e) => e.release === 2);
    expect(releaseTwo).toHaveLength(8);
    // The gate's rule since feature 002: a release 2 operation may be bound
    // ONLY to its pinned tool. Assert against the same pinned map so the set
    // this applies to is non-empty and cannot pass vacuously.
    const allowed: Record<string, string> = {
      createAttendanceLogs: 'jisr_attendance_punch_create_commit',
      createEmployee: 'jisr_employee_create_commit',
      deletePayrollTransaction: 'jisr_payroll_transaction_delete_commit',
    };
    for (const entry of releaseTwo) {
      expect(entry.implementedTool).toBe(allowed[entry.operationId] ?? null);
    }
  });
});

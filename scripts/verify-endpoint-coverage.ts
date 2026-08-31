/**
 * The endpoint coverage gate (spec FR-010, SC-002).
 *
 * Fails the build when the implemented surface and the approved Jisr
 * specification snapshot diverge. This is the automated half of Constitution
 * Principle I: it is what stops a tool reaching an operation nobody approved,
 * and what stops an operation quietly losing its tool.
 *
 * Compares the on-disk snapshot against the manifest. Divergence from the LIVE
 * specification is a separate, deliberate step -- `npm run snapshot:jisr`.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ENDPOINT_MANIFEST,
  SNAPSHOT_VERSION,
  manifestOperationKeys,
} from '../src/core/jisr/endpoint-manifest.js';

const SNAPSHOT_PATH = resolve(
  process.cwd(),
  `specs/001-jisr-mcp-server/contracts/jisr-openapi-snapshot-${SNAPSHOT_VERSION}.yaml`,
);

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

    const pathMatch = /^ {2}"?(\/[^"\s:]+)"?:\s*$/.exec(line);
    if (pathMatch?.[1]) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = /^ {4}"?(get|post|put|patch|delete)"?:\s*$/.exec(line);
    if (methodMatch?.[1] && currentPath) {
      operations.push(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }
  return operations;
}

const failures: string[] = [];
function require_(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

async function main(): Promise<void> {
  const snapshot = await readFile(SNAPSHOT_PATH, 'utf8');
  const snapshotOps = extractOperations(snapshot);
  const snapshotSet = new Set(snapshotOps);
  const manifestKeys = manifestOperationKeys();
  const manifestSet = new Set(manifestKeys);

  // 1. Every snapshot operation appears exactly once.
  for (const op of snapshotSet) {
    const count = manifestKeys.filter((k) => k === op).length;
    require_(count === 1, `snapshot operation "${op}" appears ${count} times in the manifest`);
  }

  // 5. Method and path match: nothing in the manifest is absent upstream.
  for (const key of manifestSet) {
    require_(snapshotSet.has(key), `manifest declares "${key}", absent from the snapshot`);
  }

  require_(
    snapshotSet.size === manifestSet.size,
    `snapshot has ${snapshotSet.size} operations, manifest has ${manifestSet.size}`,
  );

  for (const entry of ENDPOINT_MANIFEST) {
    const label = `${entry.method} ${entry.path}`;

    // 2. Every release 1 read has a bound tool.
    if (entry.release === 1 && entry.readOrWrite === 'read') {
      require_(
        entry.implementedTool !== null,
        `release 1 read "${label}" has no bound tool -- every documented read must be reachable`,
      );
    }

    // 3. Feature 002 binds exactly three write operations to commit tools;
    // every other release 2 operation stays absent, not disabled.
    if (entry.release === 2) {
      const allowedWriteTools: Record<string, string> = {
        'POST /openapi/v1/attendance_logs': 'jisr_attendance_punch_create_commit',
        'POST /openapi/v1/employees': 'jisr_employee_create_commit',
        'DELETE /openapi/v1/payroll_transactions/{id}': 'jisr_payroll_transaction_delete_commit',
      };
      const expected = allowedWriteTools[label] ?? null;
      require_(
        entry.implementedTool === expected,
        `release 2 operation "${label}" is bound to "${entry.implementedTool}", expected ${expected === null ? 'no tool' : `"${expected}"`}`,
      );
    }

    // Financial operations may never be reachable by a non-finance profile.
    if (entry.sensitivity === 'financial_confidential' && entry.implementedTool !== null) {
      const nonFinance = entry.requiredProfiles.filter((p) => p !== 'finance');
      require_(
        nonFinance.length === 0,
        `financial operation "${label}" lists non-finance profiles: ${nonFinance.join(', ')}`,
      );
    }
  }

  // 4. No bound tool name is duplicated.
  const tools = ENDPOINT_MANIFEST.map((e) => e.implementedTool).filter(
    (t): t is string => t !== null,
  );
  for (const tool of new Set(tools)) {
    const count = tools.filter((t) => t === tool).length;
    require_(count === 1, `tool "${tool}" is bound to ${count} operations`);
  }

  const reads = ENDPOINT_MANIFEST.filter((e) => e.release === 1 && e.readOrWrite === 'read').length;

  if (failures.length > 0) {
    console.error(`Endpoint coverage gate FAILED (${failures.length} problems):\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      `\nThe implemented surface and the approved snapshot (${SNAPSHOT_VERSION}) disagree.`,
    );
    console.error(
      'Review the divergence. Never resolve it by guessing (Constitution Principle I).',
    );
    process.exit(1);
  }

  console.log(`Endpoint coverage gate PASSED against snapshot ${SNAPSHOT_VERSION}.`);
  console.log(`  ${snapshotSet.size} documented operations, all present exactly once`);
  console.log(`  ${reads} release 1 reads, all bound to a tool`);
  const boundWrites = ENDPOINT_MANIFEST.filter(
    (e) => e.release === 2 && e.implementedTool !== null,
  ).length;
  console.log(
    `  ${ENDPOINT_MANIFEST.filter((e) => e.release === 2).length} release 2 operations, ${boundWrites} bound (feature 002), rest deliberately absent`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

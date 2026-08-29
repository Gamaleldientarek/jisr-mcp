/**
 * Refresh the approved Jisr OpenAPI specification snapshot.
 *
 * Constitution Principle I forbids implementing against a remembered or assumed
 * contract. This script is how the snapshot that the endpoint manifest and the
 * coverage gate are built from gets refreshed -- deliberately, and with the
 * divergence reported rather than silently absorbed.
 *
 * Usage:
 *   npm run snapshot:jisr           # report divergence, write nothing
 *   npm run snapshot:jisr -- --write  # update the snapshot on disk
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * The documentation portal at openapi.jisr.net is a Swagger UI shell; it loads
 * its document from /v1/api_documentation, which points here. Publicly
 * retrievable without credentials, so this can run in CI.
 */
const SPEC_URL = 'https://openapi.jisr.net/v1/jisr_be/public/openapis.yaml';

const SNAPSHOT_PATH = resolve(
  process.cwd(),
  'specs/001-jisr-mcp-server/contracts/jisr-openapi-snapshot-2026-08-29.yaml',
);

/** Path plus method for every operation the document declares. */
function extractOperations(yaml: string): string[] {
  const lines = yaml.split('\n');
  const operations: string[] = [];
  let inPaths = false;
  let currentPath: string | null = null;

  for (const line of lines) {
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

  return operations.sort();
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');

  const response = await fetch(SPEC_URL);
  if (!response.ok) {
    throw new Error(`Could not fetch the Jisr specification: HTTP ${response.status}`);
  }
  const live = await response.text();
  const current = await readFile(SNAPSHOT_PATH, 'utf8');

  if (digest(live) === digest(current)) {
    console.log('Snapshot is current. No divergence.');
    return;
  }

  const liveOps = new Set(extractOperations(live));
  const snapshotOps = new Set(extractOperations(current));
  const added = [...liveOps].filter((op) => !snapshotOps.has(op));
  const removed = [...snapshotOps].filter((op) => !liveOps.has(op));

  console.log('The live specification differs from the approved snapshot.\n');
  console.log(`  operations live:     ${liveOps.size}`);
  console.log(`  operations snapshot: ${snapshotOps.size}`);
  if (added.length) console.log(`\n  ADDED upstream:\n${added.map((o) => `    + ${o}`).join('\n')}`);
  if (removed.length)
    console.log(`\n  REMOVED upstream:\n${removed.map((o) => `    - ${o}`).join('\n')}`);
  if (!added.length && !removed.length) {
    console.log('\n  No operations added or removed; schemas or descriptions changed.');
  }

  if (!write) {
    console.log('\nNothing written. Review the divergence, then re-run with --write.');
    process.exitCode = 1;
    return;
  }

  await writeFile(SNAPSHOT_PATH, live, 'utf8');
  console.log('\nSnapshot updated. The endpoint manifest and its tests must be reviewed to match.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

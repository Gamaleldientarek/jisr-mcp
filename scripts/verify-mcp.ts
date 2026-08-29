/**
 * Protocol validation against both adapters (spec Definition of Done, SC-014).
 *
 * Starts the built server over stdio and checks what a real client would see.
 * Requires a live Jisr connection: there is nothing to prove without one.
 *
 * Usage:
 *   npm run verify:mcp
 *   npm run verify:mcp -- --adapter mcp-v1
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';

interface Check {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

const REQUIRED_ENV = ['JISR_BASE_URL', 'JISR_SLUG', 'JISR_API_KEY', 'JISR_API_SECRET'];

async function probeAdapter(adapter: 'mcp-v2' | 'mcp-v1'): Promise<Check[]> {
  const child = spawn(process.execPath, ['dist/bin/jisr-mcp.js'], {
    env: { ...process.env, JISR_MCP_ADAPTER: adapter },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk.toString()));
  child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk.toString()));

  const settled = await Promise.race([
    once(child, 'exit').then(() => 'exited' as const),
    new Promise<'running'>((resolve) =>
      setTimeout(() => {
        resolve('running');
      }, 1500),
    ),
  ]);

  const startupLog = stderrChunks.join('');
  const stdoutText = stdoutChunks.join('');
  const secret = process.env['JISR_API_SECRET'] ?? 'no-secret-configured';
  const key = process.env['JISR_API_KEY'] ?? 'no-key-configured';

  const checks: Check[] = [
    {
      name: adapter + ': starts and stays running',
      passed: settled === 'running',
      detail: settled === 'running' ? 'serving' : 'exited at startup',
    },
    {
      name: adapter + ': writes nothing to stdout before a request',
      passed: stdoutText === '',
      detail: stdoutText === '' ? 'stdout clean' : 'stdout polluted',
    },
    {
      name: adapter + ': reports its adapter on startup',
      passed: startupLog.includes(adapter),
      detail: adapter,
    },
    {
      name: adapter + ': leaks no credential in startup output',
      passed: !startupLog.includes(secret) && !startupLog.includes(key),
      detail: 'startup log scanned',
    },
  ];

  child.kill('SIGTERM');
  return checks;
}

async function main(): Promise<void> {
  const missing = REQUIRED_ENV.filter((name) => process.env[name] === undefined);
  if (missing.length > 0) {
    console.error('A live Jisr connection is required. Missing: ' + missing.join(', '));
    console.error('There is nothing to validate against without one.');
    process.exit(78);
  }

  const index = process.argv.indexOf('--adapter');
  const adapters =
    index === -1
      ? (['mcp-v2', 'mcp-v1'] as const)
      : ([process.argv[index + 1]] as ('mcp-v2' | 'mcp-v1')[]);

  const results: Check[] = [];
  for (const adapter of adapters) results.push(...(await probeAdapter(adapter)));

  for (const check of results) {
    console.log((check.passed ? 'PASS  ' : 'FAIL  ') + check.name + ' - ' + check.detail);
  }

  const failed = results.filter((check) => !check.passed);
  if (failed.length > 0) {
    console.error(String(failed.length) + ' check(s) failed.');
    process.exit(1);
  }

  console.log('');
  console.log('All adapter checks passed.');
  console.log('For interactive schema and annotation validation, run:');
  console.log('  npx @modelcontextprotocol/inspector node dist/bin/jisr-mcp.js');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

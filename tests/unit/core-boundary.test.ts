/**
 * The core boundary (plan > Structure Decision, spec FR-002, research R3).
 *
 * Nothing under src/core may import an MCP SDK. That single rule delivers three
 * things at once: the deployment boundary that makes the hosted mode additive,
 * the ability to serve two SDK lines from one codebase, and the guarantee that
 * an adapter cannot bypass authorization or field policy.
 *
 * ESLint enforces it while editing. This enforces it in CI, where a disabled
 * rule or an ignore comment would otherwise pass unnoticed.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = new URL('../../src/core/', import.meta.url).pathname;
const SRC = new URL('../../src/', import.meta.url).pathname;

async function typescriptFilesUnder(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await typescriptFilesUnder(full)));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

describe('src/core must not depend on an MCP SDK', () => {
  it('has no @modelcontextprotocol import anywhere beneath it', async () => {
    const offenders: string[] = [];

    for (const file of await typescriptFilesUnder(CORE)) {
      const source = await readFile(file, 'utf8');
      // Matches import, export-from, and dynamic import alike.
      if (/['"]@modelcontextprotocol\//.test(source)) {
        offenders.push(relative(SRC, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('carries no eslint-disable for the rule that guards it', async () => {
    // A boundary anyone can switch off with a comment is not a boundary.
    const offenders: string[] = [];
    for (const file of await typescriptFilesUnder(CORE)) {
      const source = await readFile(file, 'utf8');
      if (/eslint-disable.*no-restricted-imports/.test(source)) {
        offenders.push(relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('confirms the adapters do depend on an SDK, so the test is meaningful', async () => {
    // If nothing imported an SDK the first assertion would pass vacuously.
    const adapterSources = await Promise.all(
      (await typescriptFilesUnder(join(SRC, 'adapters'))).map(
        async (file) => await readFile(file, 'utf8'),
      ),
    );
    expect(adapterSources.some((s) => s.includes('@modelcontextprotocol/'))).toBe(true);
  });
});

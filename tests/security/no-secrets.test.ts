/**
 * No credential may exist anywhere in this repository (spec FR-042, SC-003).
 *
 * SC-003 is absolute: credential values appear ZERO times in any result, log,
 * error, or stored artifact. CI runs a history-wide secret scan; this covers
 * the working tree, and adds a rule that scanner does not enforce -- a
 * credential-SHAPED literal must carry an explicit test marker.
 *
 * That marker rule is the useful part. "It's only a fixture" is precisely how
 * real credentials get committed, so a fixture token must announce itself.
 *
 * SECRET-SCAN-EXEMPT: this file contains a planted credential shape used to
 * prove the scan patterns still match. See EXPECTED_EXEMPT_FILES.
 */

import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url).pathname;

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.specify',
  '.claude',
]);

/** The snapshot is Jisr's own document; its illustrative values are not ours. */
const SKIP_FILES = new Set(['jisr-openapi-snapshot-2026-08-29.yaml', 'package-lock.json']);

const SCANNED_EXTENSIONS = new Set(['.ts', '.js', '.json', '.md', '.yml', '.yaml', '.example', '']);

/** A literal matching these must also carry a marker from ALLOWED_MARKERS. */
const CREDENTIAL_SHAPES: readonly { name: string; pattern: RegExp }[] = [
  { name: 'bearer token', pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}/g },
  { name: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { name: 'openai-style key', pattern: /\bsk-[A-Za-z0-9_-]{12,}/g },
  { name: 'aws access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

/**
 * A file may declare an exemption when it must contain credential-SHAPED values
 * in order to test credential handling -- a redaction test needs a realistic
 * JWT, and a base64 JWT cannot carry a readable marker inside it.
 *
 * Exemptions are deliberately awkward: they must be declared in the file, and
 * the test below asserts the exempt set stays small and expected. A silent
 * allowance would defeat the whole check.
 */
const EXEMPTION_MARKER = 'SECRET-SCAN-EXEMPT:';

const EXPECTED_EXEMPT_FILES = [
  'tests/security/no-secrets.test.ts',
  'tests/security/redaction.test.ts',
];

const ALLOWED_MARKERS = [
  'invented',
  'example',
  'test',
  'fictional',
  'replace-me',
  'not-a-real',
  'placeholder',
  'redacted',
  'DO-NOT-DISCLOSE',
];

async function filesUnder(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
    }
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await filesUnder(full)));
    } else if (!SKIP_FILES.has(entry.name) && SCANNED_EXTENSIONS.has(extname(entry.name))) {
      found.push(full);
    }
  }
  return found;
}

describe('repository secret scan', () => {
  it('contains no unmarked credential-shaped literal', async () => {
    const offenders: string[] = [];

    for (const file of await filesUnder(ROOT)) {
      const source = await readFile(file, 'utf8');
      if (source.includes(EXEMPTION_MARKER)) continue;
      for (const { name, pattern } of CREDENTIAL_SHAPES) {
        for (const match of source.match(pattern) ?? []) {
          const marked = ALLOWED_MARKERS.some((marker) =>
            match.toLowerCase().includes(marker.toLowerCase()),
          );
          if (!marked) offenders.push(`${relative(ROOT, file)}: ${name} -> ${match.slice(0, 24)}…`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has an .env.example holding no real value', async () => {
    const source = await readFile(join(ROOT, '.env.example'), 'utf8');
    const assignments = source
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => line.split('=')[1] ?? '');

    for (const value of assignments) {
      if (value === '') continue;
      const safe =
        ALLOWED_MARKERS.some((m) => value.toLowerCase().includes(m.toLowerCase())) ||
        /^(https:\/\/|your-|enabled|disabled|info|hr_operations)/.test(value);
      expect(safe, `.env.example contains a suspicious value: ${value}`).toBe(true);
    }
  });

  it('exempts only the files that must contain credential shapes to test them', async () => {
    const exempt: string[] = [];
    for (const file of await filesUnder(ROOT)) {
      const source = await readFile(file, 'utf8');
      if (source.includes(EXEMPTION_MARKER)) exempt.push(relative(ROOT, file));
    }
    // If this list grows, someone has exempted a file rather than fixing it.
    expect(exempt.sort()).toEqual(EXPECTED_EXEMPT_FILES);
  });

  it('scans a meaningful number of files, so it cannot pass vacuously', async () => {
    expect((await filesUnder(ROOT)).length).toBeGreaterThan(25);
  });

  it('detects a planted credential, proving the scan works', () => {
    // Guards against a future refactor turning the patterns into no-ops.
    const planted = 'Authorization: Bearer AbCdEf0123456789XyZ';
    const caught = CREDENTIAL_SHAPES.some(({ pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(planted);
    });
    expect(caught).toBe(true);
  });
});

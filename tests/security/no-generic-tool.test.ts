/**
 * No generic request surface (spec FR-008).
 *
 * "MUST NOT expose a generic request tool, an arbitrary-path tool, an
 * arbitrary-URL tool, or any other means for a caller to reach an operation not
 * named in the endpoint manifest."
 *
 * The coverage gate proves every tool maps to a manifest entry. That is the
 * converse, not the same claim: it would still pass if a tool accepted a
 * caller-supplied path. This asserts the prohibition itself.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINT_MANIFEST } from '../../src/core/jisr/endpoint-manifest.js';

const CORE = new URL('../../src/core/', import.meta.url).pathname;

describe('endpoint manifest', () => {
  it('binds no tool to a write operation', async () => {
    await Promise.resolve();
    const boundWrites = ENDPOINT_MANIFEST.filter(
      (entry) => entry.readOrWrite === 'write' && entry.implementedTool !== null,
    );
    expect(boundWrites).toEqual([]);
  });

  it('records the eight release 2 operations as known and unbound', async () => {
    await Promise.resolve();
    const releaseTwo = ENDPOINT_MANIFEST.filter((entry) => entry.release === 2);
    expect(releaseTwo).toHaveLength(8);
    for (const entry of releaseTwo) expect(entry.implementedTool).toBeNull();
  });

  it('contains no path that is not a documented Jisr openapi path', async () => {
    await Promise.resolve();
    for (const entry of ENDPOINT_MANIFEST) {
      expect(entry.path.startsWith('/openapi/v1/')).toBe(true);
    }
  });
});

describe('the client exposes no arbitrary-request escape hatch', () => {
  it('accepts no caller-supplied url, path, or http method in its public options', async () => {
    const source = await readFile(join(CORE, 'jisr/client.ts'), 'utf8');

    // The contract is RequestOptions. A `url`, `path`, or `method` field there
    // would be the escape hatch FR-008 forbids -- so assert on the interface
    // itself rather than on incidental internal calls.
    const options = /export interface RequestOptions \{([\s\S]*?)\n\}/.exec(source)?.[1];
    expect(options).toBeDefined();
    expect(options).not.toMatch(/^\s*readonly (url|path|method|endpoint)\??:/m);
    expect(options).toContain('operationId');

    expect(source).toContain('No manifest entry for operationId');
  });

  it('rejects a write operationId at the client boundary', async () => {
    const source = await readFile(join(CORE, 'jisr/client.ts'), 'utf8');
    // Structural, not conventional: even if a write entry were bound in the
    // manifest, the client refuses it (spec FR-012).
    expect(source).toContain('is a write operation');
  });

  it('builds every request path from the manifest entry, not from caller input', async () => {
    const source = await readFile(join(CORE, 'jisr/client.ts'), 'utf8');

    // The only path the client may start from is the manifest entry's own.
    expect(source).toContain('let path = entry.path;');

    // And it must contain no hardcoded upstream path of its own -- every route
    // comes from the manifest, which the coverage gate ties to the snapshot.
    expect(source).not.toMatch(/['`"]\/openapi\/v1\//);
  });

  it('substitutes path parameters by encoded name only, and refuses an unfilled path', async () => {
    const source = await readFile(join(CORE, 'jisr/client.ts'), 'utf8');
    expect(source).toContain('encodeURIComponent(value)');
    // A path still holding a placeholder must fail rather than be requested.
    expect(source).toContain("path.includes('{')");
  });
});

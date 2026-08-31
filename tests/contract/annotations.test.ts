/**
 * Annotation accuracy across all 23 tools (spec FR-037).
 *
 * Annotations are protocol HINTS -- the SDK's own type says clients must never
 * make tool-use decisions on annotations from an untrusted server (research
 * R6). Ours must still be honest, because clients and users rely on them for
 * consent.
 *
 * This release's strongest guarantee is structural rather than declarative:
 * there is no write code path to misannotate.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINT_MANIFEST } from '../../src/core/jisr/endpoint-manifest.js';
import { registerReadTools } from '../../src/core/tools/index.js';
import { ToolRegistry } from '../../src/core/tools/registry.js';

const CORE = new URL('../../src/core/', import.meta.url).pathname;

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  registerReadTools(r);
  return r;
}

async function typescriptFilesUnder(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await typescriptFilesUnder(full)));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

describe('every tool', () => {
  it('declares itself read-only and non-destructive', () => {
    const tools = registry().all();
    expect(tools).toHaveLength(23);

    for (const tool of tools) {
      expect(tool.annotations.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations.destructiveHint, tool.name).toBe(false);
      expect(tool.annotations.idempotentHint, tool.name).toBe(true);
      // A closed world: every operation is a documented Jisr endpoint, not an
      // open-ended external call.
      expect(tool.annotations.openWorldHint, tool.name).toBe(false);
    }
  });

  it('has a title and a description a person can act on', () => {
    for (const tool of registry().all()) {
      expect(tool.title.length, tool.name).toBeGreaterThan(3);
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
    }
  });

  it('is bound to a manifest read operation, or is a discovery tool', () => {
    const discovery = new Set([
      'jisr_connection_status_get',
      'jisr_capabilities_get',
      'jisr_data_catalog_get',
    ]);
    const bound = new Set(
      ENDPOINT_MANIFEST.filter((e) => e.implementedTool !== null).map((e) => e.implementedTool),
    );

    for (const tool of registry().all()) {
      expect(bound.has(tool.name) || discovery.has(tool.name), tool.name).toBe(true);
    }
  });
});

describe('the read-only claim is structural', () => {
  it('is enforced at registration, so a write tool cannot be added', () => {
    const r = new ToolRegistry();
    expect(() =>
      r.register({
        name: 'jisr_something_delete',
        title: 'x',
        description: 'x',
        inputShape: {},
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
        declaredFieldGroups: ['internal_operational'],
        fieldGroupPurpose: 'x',
        handler: async () => await Promise.resolve({ structuredContent: {}, summary: '' }),
      }),
    ).toThrow(/not read-only/);
  });

  it('has no write verb in any service or tool', async () => {
    // The client issues only the method its manifest entry declares, and every
    // BOUND entry is a GET. Two files legitimately name a write verb and are
    // excluded deliberately rather than by a loose pattern:
    //   - authentication.ts: POST /openapi/v1/auth, which is not a tool
    //   - endpoint-manifest.ts: declares the 8 release-2 operations so the
    //     coverage gate can assert they are known and UNBOUND
    const allowed = ['jisr/authentication.ts', 'jisr/endpoint-manifest.ts'];
    const offenders: string[] = [];

    for (const file of await typescriptFilesUnder(CORE)) {
      if (allowed.some((suffix) => file.endsWith(suffix))) continue;
      const source = await readFile(file, 'utf8');
      if (/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('confirms the two excluded files are the only ones naming a write verb', async () => {
    // Guards the exclusion above: if a third file starts naming a write verb,
    // this fails rather than the exclusion quietly covering it.
    const naming: string[] = [];
    for (const file of await typescriptFilesUnder(CORE)) {
      const source = await readFile(file, 'utf8');
      if (/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/.test(source)) {
        naming.push(file.slice(file.indexOf('/core/') + 6));
      }
    }
    expect(naming.sort()).toEqual(['jisr/authentication.ts', 'jisr/endpoint-manifest.ts']);
  });

  it('binds exactly the feature 002 writes in the manifest, nothing more', () => {
    const bound = ENDPOINT_MANIFEST.filter(
      (e) => e.readOrWrite === 'write' && e.implementedTool !== null,
    );
    expect(Object.fromEntries(bound.map((e) => [e.operationId, e.implementedTool]))).toEqual({
      createAttendanceLogs: 'jisr_attendance_punch_create_commit',
      createEmployee: 'jisr_employee_create_commit',
      deletePayrollTransaction: 'jisr_payroll_transaction_delete_commit',
    });
  });
});

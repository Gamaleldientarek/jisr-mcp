/**
 * Pagination to exhaustion (spec FR-033, FR-034, SC-008, quickstart V7).
 *
 * "A complete authorized employee collection can be traversed to its end
 * without any single response exceeding the published per-call limit, and 0
 * traversals require the caller to construct an upstream address."
 */

import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import { listEmployees } from '../../src/core/services/employees-service.js';
import type { ToolContext } from '../../src/core/tools/registry.js';
import { AUTH_SUCCESS } from '../fixtures/jisr/index.js';

const ORG = 'org-pagination-01';
const TOTAL_PAGES = 3;

/** Three pages of one employee each, then no next page. */
function pagedFetch(): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  let authed = false;

  const impl = ((input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    urls.push(url);

    if (!authed) {
      authed = true;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(AUTH_SUCCESS),
      } as Response);
    }

    const page = Number(new URL(url).searchParams.get('page') ?? '1');
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            employees: [
              {
                employee_id: `00000000-0000-4000-8000-00000000000${page}`,
                code: 1000 + page,
                full_name_en: `Fictional Employee ${page}`,
              },
            ],
            pagination: {
              current_page: page,
              next_page: page < TOTAL_PAGES ? page + 1 : null,
              previous_page: page > 1 ? page - 1 : null,
              total_pages: TOTAL_PAGES,
              per_page: 1,
              total_entries: TOTAL_PAGES,
            },
          },
        }),
    } as Response);
  }) as unknown as typeof fetch;

  return { fetch: impl, urls };
}

function context(fetchImpl: typeof fetch): ToolContext {
  const config: AppConfig = {
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'acme',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: 'hr_operations',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false }),
    subjectEmployeeId: undefined,
    logLevel: 'error',
  };
  return {
    principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
    flags: config.featureFlags,
    observed: UNPROBED,
    client: new JisrClient(config, new TokenCache(), fetchImpl),
    connection: { hostType: 'aws' },
  };
}

describe('traversal', () => {
  it('reaches the end using only server-issued cursors', async () => {
    const { fetch, urls } = pagedFetch();
    const ctx = context(fetch);

    const seen: string[] = [];
    let cursor: string | undefined;
    let iterations = 0;

    do {
      const { envelope } = await listEmployees(
        cursor === undefined ? { pageSize: 1 } : { pageSize: 1, cursor },
        ctx,
      );
      for (const record of envelope.records) seen.push(String(record.employeeCode));
      cursor = envelope.pagination.nextCursor ?? undefined;
      iterations += 1;
      expect(iterations).toBeLessThan(10); // guards against a non-terminating loop
    } while (cursor !== undefined);

    expect(seen).toEqual(['1001', '1002', '1003']);
    expect(iterations).toBe(TOTAL_PAGES);

    // Every upstream URL was built by the server from the manifest path.
    for (const url of urls.slice(1)) {
      expect(url).toContain('/openapi/v1/employees');
    }
  });

  it('never exposes total_entries, which would disclose the unfiltered size', async () => {
    const { fetch } = pagedFetch();
    const { envelope } = await listEmployees({ pageSize: 1 }, context(fetch));
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('total_entries');
    expect(serialized).not.toContain('totalEntries');
  });

  it('returns a null cursor at the end rather than looping', async () => {
    const { fetch } = pagedFetch();
    const ctx = context(fetch);
    let cursor: string | undefined;
    for (let i = 0; i < TOTAL_PAGES; i += 1) {
      const { envelope } = await listEmployees(
        cursor === undefined ? { pageSize: 1 } : { pageSize: 1, cursor },
        ctx,
      );
      cursor = envelope.pagination.nextCursor ?? undefined;
    }
    expect(cursor).toBeUndefined();
  });

  it('refuses a cursor from a different filter set mid-traversal', async () => {
    const { fetch } = pagedFetch();
    const ctx = context(fetch);
    const first = await listEmployees({ pageSize: 1 }, ctx);
    const cursor = first.envelope.pagination.nextCursor;
    expect(cursor).not.toBeNull();

    // Same cursor, different filters: the continuation is no longer ours.
    await expect(
      listEmployees({ pageSize: 1, status: 'inactive', cursor: cursor as string }, ctx),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
  });
});

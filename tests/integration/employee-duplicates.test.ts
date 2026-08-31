/**
 * Duplicate pre-read and acknowledgment (T022, spec FR-015).
 *
 * A matching code or exact name is a WARNING at prepare and a refusal at
 * commit until acknowledged -- a second identical person is sometimes real,
 * but never silent.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import {
  commitEmployeeCreate,
  prepareEmployeeCreate,
} from '../../src/core/services/employees-write-service.js';
import type { ToolContext } from '../../src/core/tools/registry.js';
import { resetConsumedReferences } from '../../src/core/writes/confirmation.js';
import { resetDuplicateGuard } from '../../src/core/writes/duplicate-guard.js';
import { AUTH_SUCCESS, EMPLOYEES_WITH_FINANCE } from '../fixtures/jisr/index.js';
import { refusalFrom } from '../helpers.js';

const ORG = 'org-emp-dup-001';

function harness(): { context: ToolContext; posts: string[] } {
  const posts: string[] = [];
  const fetchStub = ((input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (method === 'POST' && url.includes('/employees')) {
      posts.push(typeof init?.body === 'string' ? init.body : '');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            message: null,
            // The documented create response may carry id: null (research W1).
            data: { employee: { id: null, code: 1001 } },
          }),
      } as Response);
    }
    const body = url.includes('/auth') ? AUTH_SUCCESS : EMPLOYEES_WITH_FINANCE;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  }) as unknown as typeof fetch;

  const config: AppConfig = {
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'acme',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: 'hr_operations',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false, writeEmployees: true }),
    subjectEmployeeId: undefined,
    logLevel: 'error',
  };
  return {
    posts,
    context: {
      principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
      flags: config.featureFlags,
      observed: UNPROBED,
      client: new JisrClient(config, new TokenCache(), fetchStub),
      connection: { hostType: 'aws' },
    },
  };
}

/** The fixture holds code 1001, "Fictional Employee One". */
const DUPLICATE_CODE = { code: 1001, fullNameEn: 'Someone Else', fullNameAr: 'شخص آخر' };
const DUPLICATE_NAME = {
  code: 9002,
  fullNameEn: 'Fictional Employee One',
  fullNameAr: 'اسم مختلف تماما',
};
const CLEAN = { code: 9003, fullNameEn: 'Fresh New Person', fullNameAr: 'شخص جديد تماما' };

beforeEach(() => {
  resetConsumedReferences();
  resetDuplicateGuard();
});

describe('the duplicate pre-read', () => {
  it('warns on a matching code', async () => {
    const { context } = harness();
    const prepared = await prepareEmployeeCreate(DUPLICATE_CODE, context);
    const content = prepared.structuredContent as {
      preview: { duplicateWarning: boolean; warnings: string[] };
    };
    expect(content.preview.duplicateWarning).toBe(true);
    expect(content.preview.warnings.join(' ')).toContain('1001');
  });

  it('warns on an exact name match', async () => {
    const { context } = harness();
    const prepared = await prepareEmployeeCreate(DUPLICATE_NAME, context);
    const content = prepared.structuredContent as { preview: { duplicateWarning: boolean } };
    expect(content.preview.duplicateWarning).toBe(true);
  });

  it('raises no warning for a clean record', async () => {
    const { context } = harness();
    const prepared = await prepareEmployeeCreate(CLEAN, context);
    const content = prepared.structuredContent as { preview: { duplicateWarning: boolean } };
    expect(content.preview.duplicateWarning).toBe(false);
  });
});

describe('commit under a duplicate warning', () => {
  it('refuses without acknowledgeDuplicates and writes nothing', async () => {
    const { context, posts } = harness();
    const prepared = await prepareEmployeeCreate(DUPLICATE_CODE, context);
    const { confirmationReference } = prepared.structuredContent as {
      confirmationReference: string;
    };
    const error = await refusalFrom(() => commitEmployeeCreate({ confirmationReference }, context));
    expect(error.code).toBe('DUPLICATE_WRITE_SUSPECTED');
    expect(posts).toEqual([]);
  });

  it('proceeds with acknowledgeDuplicates: true, and the re-read supplies the UUID the create response lacked', async () => {
    const { context, posts } = harness();
    const prepared = await prepareEmployeeCreate(DUPLICATE_CODE, context);
    const { confirmationReference } = prepared.structuredContent as {
      confirmationReference: string;
    };
    const committed = await commitEmployeeCreate(
      { confirmationReference, acknowledgeDuplicates: true },
      context,
    );
    expect(posts).toHaveLength(1);
    const content = committed.structuredContent as {
      created: { idFromCreateResponse: null; idFromReRead: string | null; idSource: string };
    };
    expect(content.created.idFromCreateResponse).toBeNull();
    // The fixture list carries the UUID under employee_id; the re-read found it.
    expect(content.created.idFromReRead).toBe('00000000-0000-4000-8000-000000000001');
    expect(content.created.idSource).toBe('re_read');
  });

  it('a clean record commits without any acknowledgment', async () => {
    const { context, posts } = harness();
    const prepared = await prepareEmployeeCreate(CLEAN, context);
    const { confirmationReference } = prepared.structuredContent as {
      confirmationReference: string;
    };
    const committed = await commitEmployeeCreate({ confirmationReference }, context);
    expect(posts).toHaveLength(1);
    expect(committed.writeAudit?.phase).toBe('commit');
  });
});

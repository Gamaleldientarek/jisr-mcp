/**
 * Degradation must be honest (spec FR-036, quickstart V12).
 *
 * The failure this prevents: a caller reading "no employees found" when the
 * truth was "Jisr is down". An empty success and an outage must never look
 * alike.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import { AUTH_SUCCESS, stubFetch } from '../fixtures/jisr/index.js';
import { refusalFrom } from '../helpers.js';

const schema = z.object({ departments: z.array(z.object({ id: z.number() })) });

function config(): AppConfig {
  return {
    organizationId: 'org-degrade-0001',
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'acme',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: 'hr_operations',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false }),
    logLevel: 'error',
  };
}

function client(responses: { status?: number; body?: unknown }[]): JisrClient {
  return new JisrClient(config(), new TokenCache(), stubFetch(responses).fetch);
}

describe('upstream unavailable', () => {
  it('reports a distinct retryable error, not an empty result', async () => {
    const error = await refusalFrom(async () =>
      client([{ body: AUTH_SUCCESS }, { status: 503 }]).request(schema, {
        operationId: 'listDepartments',
      }),
    );

    expect(error.code).toBe('JISR_TEMPORARILY_UNAVAILABLE');
    expect(error.retryable).toBe(true);
  });

  it('reports a network failure as unavailable rather than as invalid data', async () => {
    let authed = false;
    const impl = (() => {
      if (!authed) {
        authed = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(AUTH_SUCCESS),
        } as Response);
      }
      return Promise.reject(new Error('ECONNREFUSED'));
    }) as unknown as typeof fetch;

    const error = await refusalFrom(async () =>
      new JisrClient(config(), new TokenCache(), impl).request(schema, {
        operationId: 'listDepartments',
      }),
    );

    expect(error.code).toBe('JISR_TEMPORARILY_UNAVAILABLE');
    expect(error.retryable).toBe(true);
  });
});

describe('rate limiting', () => {
  it('is its own error, distinct from an outage', async () => {
    const error = await refusalFrom(async () =>
      client([{ body: AUTH_SUCCESS }, { status: 429 }]).request(schema, {
        operationId: 'listDepartments',
      }),
    );

    expect(error.code).toBe('JISR_RATE_LIMITED');
    // Jisr does not document its limits, so the advice says so rather than
    // inventing a retry-after.
    expect(error.suggestedAction).toContain('does not document');
  });
});

describe('invalid upstream data', () => {
  it('is reported as invalid, never as empty', async () => {
    const error = await refusalFrom(async () =>
      client([
        { body: AUTH_SUCCESS },
        { body: { success: true, data: { unexpected: 'shape' } } },
      ]).request(schema, { operationId: 'listDepartments' }),
    );

    expect(error.code).toBe('JISR_RESPONSE_INVALID');
    expect(error.retryable).toBe(false);
    expect(error.suggestedAction).toContain('snapshot:jisr');
  });

  it('leaks no upstream body in the error', async () => {
    const error = await refusalFrom(async () =>
      client([
        { body: AUTH_SUCCESS },
        { body: { success: true, data: { secret_field: 'CONFIDENTIAL-UPSTREAM-VALUE' } } },
      ]).request(schema, { operationId: 'listDepartments' }),
    );

    expect(JSON.stringify(error.toPayload())).not.toContain('CONFIDENTIAL-UPSTREAM-VALUE');
    expect(error.message).not.toContain('CONFIDENTIAL-UPSTREAM-VALUE');
  });
});

describe('an empty collection', () => {
  it('is a success, clearly distinct from every failure above', async () => {
    const response = await client([
      { body: AUTH_SUCCESS },
      { body: { success: true, data: { departments: [] } } },
    ]).request(schema, { operationId: 'listDepartments' });

    expect(response.data.departments).toEqual([]);
    expect(response.receivedAt).toBeDefined();
  });
});

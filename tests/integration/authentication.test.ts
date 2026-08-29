/**
 * Jisr authentication behaviour (spec FR-025, quickstart V2, research R7).
 *
 * Token lifetime is not documented, so re-authentication is driven by rejection
 * and never by a timer. The critical property: EXACTLY one retry. A refresh
 * loop against an HR system is indistinguishable from an attack.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import {
  authenticate,
  credentialFingerprint,
  getToken,
  TokenCache,
} from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import { AUTH_SUCCESS, DEPARTMENTS, stubFetch } from '../fixtures/jisr/index.js';

const CONTEXT = {
  baseUrl: 'https://apis.jisr.net/api',
  slug: 'test-org',
  organizationId: 'org-test-00000001',
};

const CREDENTIALS = { apiKey: 'test-key', apiSecret: 'test-secret' };

function config(): AppConfig {
  return {
    organizationId: CONTEXT.organizationId,
    baseUrl: CONTEXT.baseUrl,
    hostType: 'aws',
    slug: CONTEXT.slug,
    credentials: CREDENTIALS,
    financeCredentials: undefined,
    roleProfile: 'hr_operations',
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: false }),
    subjectEmployeeId: undefined,
    logLevel: 'error',
  };
}

const departmentsSchema = z.object({ departments: z.array(z.object({ id: z.number() })) });

describe('authenticate', () => {
  it('sends the documented headers and extracts the token', async () => {
    const { fetch, calls } = stubFetch([{ body: AUTH_SUCCESS }]);
    const cache = new TokenCache();
    const token = await authenticate(CONTEXT, CREDENTIALS, cache, fetch);

    expect(token).toBe(AUTH_SUCCESS.data);
    expect(calls[0]?.url).toContain('/openapi/v1/auth');
    expect(calls[0]?.headers['api-version']).toBe('1');
    expect(calls[0]?.headers['source']).toBe('open_api');
    expect(calls[0]?.headers['slug']).toBe('test-org');
  });

  it.each([
    ['invalid slug', 401],
    ['invalid key', 401],
    ['invalid secret', 403],
  ])(
    'reports %s as an authentication failure without echoing credentials',
    async (_label, status) => {
      const { fetch } = stubFetch([{ status, body: { success: false } }]);
      const cache = new TokenCache();

      await expect(authenticate(CONTEXT, CREDENTIALS, cache, fetch)).rejects.toMatchObject({
        code: 'JISR_AUTHENTICATION_FAILED',
      });

      const status_ = cache.status();
      expect(status_.lastAuthenticationError).toBe('JISR_AUTHENTICATION_FAILED');
      // The recorded failure is a CODE, never an upstream body that might echo
      // the submitted key.
      expect(JSON.stringify(status_)).not.toContain('test-secret');
    },
  );

  it('rejects a response that does not match the documented shape', async () => {
    const { fetch } = stubFetch([{ body: { success: true, data: { unexpected: true } } }]);
    await expect(authenticate(CONTEXT, CREDENTIALS, new TokenCache(), fetch)).rejects.toMatchObject(
      { code: 'JISR_RESPONSE_INVALID' },
    );
  });
});

describe('token cache', () => {
  it('reuses a cached token rather than re-authenticating', async () => {
    const { fetch, calls } = stubFetch([{ body: AUTH_SUCCESS }]);
    const cache = new TokenCache();

    await getToken(CONTEXT, CREDENTIALS, cache, fetch);
    await getToken(CONTEXT, CREDENTIALS, cache, fetch);

    expect(calls).toHaveLength(1);
  });

  it('keys on credential identity, so a different key gets its own token', async () => {
    const other = { apiKey: 'different-key', apiSecret: 'x' };
    expect(credentialFingerprint(CREDENTIALS)).not.toBe(credentialFingerprint(other));

    const { fetch, calls } = stubFetch([{ body: AUTH_SUCCESS }]);
    const cache = new TokenCache();
    await getToken(CONTEXT, CREDENTIALS, cache, fetch);
    await getToken(CONTEXT, other, cache, fetch);
    expect(calls).toHaveLength(2);
  });

  it('never exposes the api key in the cache fingerprint', () => {
    expect(credentialFingerprint(CREDENTIALS)).not.toContain('test-key');
  });
});

describe('client re-authentication', () => {
  it('retries exactly once on a rejected token, then succeeds', async () => {
    const { fetch, calls } = stubFetch([
      { body: AUTH_SUCCESS }, // initial auth
      { status: 401 }, // request rejected
      { body: AUTH_SUCCESS }, // re-auth
      { body: DEPARTMENTS }, // retry succeeds
    ]);

    const client = new JisrClient(config(), new TokenCache(), fetch);
    const result = await client.request(departmentsSchema, { operationId: 'listDepartments' });

    expect(result.data.departments).toHaveLength(2);
    expect(calls).toHaveLength(4);
  });

  it('stops when re-authentication itself is rejected', async () => {
    // Every response after the first is a 401, so the re-auth is rejected too.
    // Without a hard limit this recurses forever.
    const { fetch, calls } = stubFetch([{ body: AUTH_SUCCESS }, { status: 401 }]);
    const client = new JisrClient(config(), new TokenCache(), fetch);

    await expect(
      client.request(departmentsSchema, { operationId: 'listDepartments' }),
    ).rejects.toMatchObject({ code: 'JISR_AUTHENTICATION_FAILED' });

    // auth, request, re-auth -- and then it stops.
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it('stops when the retry succeeds at authenticating but is still refused', async () => {
    const { fetch, calls } = stubFetch([
      { body: AUTH_SUCCESS }, // initial auth
      { status: 401 }, // request rejected
      { body: AUTH_SUCCESS }, // re-auth succeeds
      { status: 403 }, // retry still refused -- the key lacks the permission
    ]);
    const client = new JisrClient(config(), new TokenCache(), fetch);

    await expect(
      client.request(departmentsSchema, { operationId: 'listDepartments' }),
    ).rejects.toMatchObject({ code: 'JISR_PERMISSION_DENIED' });

    // Exactly one retry. No second re-authentication attempt.
    expect(calls).toHaveLength(4);
  });
});

describe('client operation binding', () => {
  it('refuses an operationId absent from the manifest', async () => {
    const { fetch } = stubFetch([{ body: AUTH_SUCCESS }]);
    const client = new JisrClient(config(), new TokenCache(), fetch);
    await expect(
      client.request(departmentsSchema, { operationId: 'notARealOperation' }),
    ).rejects.toThrow(/No manifest entry/);
  });

  it('refuses a write operationId even though the manifest declares it', async () => {
    const { fetch } = stubFetch([{ body: AUTH_SUCCESS }]);
    const client = new JisrClient(config(), new TokenCache(), fetch);
    await expect(
      client.request(departmentsSchema, { operationId: 'createEmployee' }),
    ).rejects.toThrow(/is a write operation/);
  });

  it('maps a 429 to a distinct retryable error rather than an empty result', async () => {
    const { fetch } = stubFetch([{ body: AUTH_SUCCESS }, { status: 429 }]);
    const client = new JisrClient(config(), new TokenCache(), fetch);
    await expect(
      client.request(departmentsSchema, { operationId: 'listDepartments' }),
    ).rejects.toMatchObject({ code: 'JISR_RATE_LIMITED', retryable: true });
  });

  it('maps a 5xx to temporarily-unavailable, never to success', async () => {
    const { fetch } = stubFetch([{ body: AUTH_SUCCESS }, { status: 503 }]);
    const client = new JisrClient(config(), new TokenCache(), fetch);
    await expect(
      client.request(departmentsSchema, { operationId: 'listDepartments' }),
    ).rejects.toMatchObject({ code: 'JISR_TEMPORARILY_UNAVAILABLE', retryable: true });
  });
});

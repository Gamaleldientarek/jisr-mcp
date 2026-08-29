/**
 * Jisr authentication and token caching (spec FR-025, research R4, R7).
 *
 * Documented contract:
 *   POST /openapi/v1/auth
 *   headers: slug, api-key, secret, api-version: 1, source: open_api
 *            (+ username when source is external_aggregator)
 *   success: the access token arrives in `data`
 *   subsequent calls: Slug, Access-Token, api-version
 *
 * Token lifetime is NOT documented. Re-authentication is therefore driven by
 * rejection, never by a timer, and never more than once per call -- a refresh
 * loop against an HR system would be indistinguishable from an attack.
 *
 * The cache keys on organization and credential identity, never on a
 * connection: the 2026-07-28 protocol is stateless, so any request may land on
 * any instance (research R4).
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { JisrCredentials } from '../../config/environment.js';
import { authenticationFailed } from './errors.js';

const authResponseSchema = z.object({
  success: z.boolean().optional(),
  message: z.string().nullable().optional(),
  data: z.union([
    z.string().min(1),
    z.object({ access_token: z.string().min(1) }),
    z.object({ token: z.string().min(1) }),
  ]),
});

/** Identifies a credential without retaining or exposing it. */
export function credentialFingerprint(credentials: JisrCredentials): string {
  return createHash('sha256').update(credentials.apiKey).digest('hex').slice(0, 16);
}

function extractToken(data: z.infer<typeof authResponseSchema>['data']): string {
  if (typeof data === 'string') return data;
  if ('access_token' in data) return data.access_token;
  return data.token;
}

export interface AuthenticationContext {
  readonly baseUrl: string;
  readonly slug: string;
  readonly organizationId: string;
  readonly source?: 'open_api' | 'external_aggregator';
  readonly aggregatorUsername?: string;
}

export interface AuthenticationStatus {
  readonly lastSuccessfulAuthentication: string | null;
  readonly lastAuthenticationError: string | null;
}

export class TokenCache {
  readonly #tokens = new Map<string, string>();
  #lastSuccess: string | null = null;
  #lastError: string | null = null;

  #key(organizationId: string, credentials: JisrCredentials): string {
    return `${organizationId}:${credentialFingerprint(credentials)}`;
  }

  get(organizationId: string, credentials: JisrCredentials): string | undefined {
    return this.#tokens.get(this.#key(organizationId, credentials));
  }

  set(organizationId: string, credentials: JisrCredentials, token: string): void {
    this.#tokens.set(this.#key(organizationId, credentials), token);
    this.#lastSuccess = new Date().toISOString();
    this.#lastError = null;
  }

  invalidate(organizationId: string, credentials: JisrCredentials): void {
    this.#tokens.delete(this.#key(organizationId, credentials));
  }

  recordFailure(code: string): void {
    // The code only. An upstream auth failure body may echo submitted values.
    this.#lastError = code;
  }

  status(): AuthenticationStatus {
    return {
      lastSuccessfulAuthentication: this.#lastSuccess,
      lastAuthenticationError: this.#lastError,
    };
  }
}

export async function authenticate(
  context: AuthenticationContext,
  credentials: JisrCredentials,
  cache: TokenCache,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = new URL('openapi/v1/auth', ensureTrailingSlash(context.baseUrl));

  const headers: Record<string, string> = {
    slug: context.slug,
    'api-key': credentials.apiKey,
    secret: credentials.apiSecret,
    'api-version': '1',
    source: context.source ?? 'open_api',
  };
  if (context.source === 'external_aggregator' && context.aggregatorUsername !== undefined) {
    headers['username'] = context.aggregatorUsername;
  }

  const response = await fetchImpl(url.toString(), { method: 'POST', headers });

  if (!response.ok) {
    cache.recordFailure('JISR_AUTHENTICATION_FAILED');
    throw authenticationFailed('credentials');
  }

  const parsed = authResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    cache.recordFailure('JISR_RESPONSE_INVALID');
    throw authenticationFailed('shape');
  }

  const token = extractToken(parsed.data.data);
  cache.set(context.organizationId, credentials, token);
  return token;
}

export async function getToken(
  context: AuthenticationContext,
  credentials: JisrCredentials,
  cache: TokenCache,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cached = cache.get(context.organizationId, credentials);
  if (cached !== undefined) return cached;
  return authenticate(context, credentials, cache, fetchImpl);
}

export function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

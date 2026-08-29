/**
 * The typed Jisr client (spec FR-008, FR-018 boundary, research R7).
 *
 * Every upstream call goes through here, and every call must name a manifest
 * `operationId`. There is no method that takes an arbitrary path, URL, or HTTP
 * verb -- that absence is what makes spec FR-008 structural rather than a rule
 * somebody has to remember.
 */

import { z } from 'zod';
import type { AppConfig, JisrCredentials } from '../../config/environment.js';
import { JisrMcpError } from '../errors.js';
import {
  authenticate,
  ensureTrailingSlash,
  getToken,
  TokenCache,
  type AuthenticationContext,
  type AuthenticationStatus,
} from './authentication.js';
import { ENDPOINT_MANIFEST, type ManifestEntry } from './endpoint-manifest.js';
import { mapUpstreamStatus } from './errors.js';
import { encodeQuery, type QueryInput } from './query-encoding.js';
import type { UpstreamPagination } from './pagination.js';

/** The envelope every Jisr response shares (data-model §2). */
const envelopeSchema = z.object({
  success: z.boolean().optional(),
  message: z.string().nullable().optional(),
  data: z.unknown().optional(),
  error: z.unknown().optional(),
  status_code: z.number().optional(),
});

export interface JisrResponse<T> {
  readonly data: T;
  readonly pagination: UpstreamPagination | undefined;
  /** When the response was received. Feeds the envelope's dataAsOf. */
  readonly receivedAt: string;
}

export interface RequestOptions {
  /** Must exist in the endpoint manifest. */
  readonly operationId: string;
  readonly query?: QueryInput;
  /** Values substituted into a `{param}` path segment. */
  readonly pathParams?: Readonly<Record<string, string>>;
  /** Use the separate finance credential where one is configured. */
  readonly useFinanceCredentials?: boolean;
  readonly signal?: AbortSignal;
}

const REQUEST_TIMEOUT_MS = 30_000;

const paginationSchema = z.object({
  current_page: z.number(),
  next_page: z.number().nullable(),
  previous_page: z.number().nullable(),
  total_pages: z.number(),
  per_page: z.number(),
  total_entries: z.number(),
});

export class JisrClient {
  readonly #config: AppConfig;
  readonly #cache: TokenCache;
  readonly #fetch: typeof fetch;

  constructor(
    config: AppConfig,
    cache: TokenCache = new TokenCache(),
    fetchImpl: typeof fetch = fetch,
  ) {
    this.#config = config;
    this.#cache = cache;
    this.#fetch = fetchImpl;
  }

  authenticationStatus(): AuthenticationStatus {
    return this.#cache.status();
  }

  #authContext(): AuthenticationContext {
    return {
      baseUrl: this.#config.baseUrl,
      slug: this.#config.slug,
      organizationId: this.#config.organizationId,
    };
  }

  #credentialsFor(useFinance: boolean | undefined): JisrCredentials {
    return useFinance === true && this.#config.financeCredentials !== undefined
      ? this.#config.financeCredentials
      : this.#config.credentials;
  }

  /**
   * Resolves an operationId to its manifest entry.
   *
   * An unknown id is a programming error, not a caller error: tool definitions
   * are ours. It is raised loudly rather than falling through to a request.
   */
  #entryFor(operationId: string): ManifestEntry {
    const entry = ENDPOINT_MANIFEST.find((candidate) => candidate.operationId === operationId);
    if (entry === undefined) {
      throw new Error(
        `No manifest entry for operationId "${operationId}". Every upstream call must be declared in the endpoint manifest (Constitution Principle I).`,
      );
    }
    if (entry.readOrWrite === 'write') {
      throw new Error(
        `operationId "${operationId}" is a write operation. This release exposes no write surface (spec FR-012).`,
      );
    }
    return entry;
  }

  #buildUrl(entry: ManifestEntry, options: RequestOptions): string {
    let path = entry.path;
    for (const [name, value] of Object.entries(options.pathParams ?? {})) {
      path = path.replace(`{${name}}`, encodeURIComponent(value));
    }
    if (path.includes('{')) {
      throw new JisrMcpError('INVALID_FILTER', `Missing path parameter for ${entry.operationId}.`);
    }

    const url = new URL(path.replace(/^\//, ''), ensureTrailingSlash(this.#config.baseUrl));
    const query = options.query === undefined ? '' : encodeQuery(options.query);
    return query === '' ? url.toString() : `${url.toString()}?${query}`;
  }

  async request<T>(schema: z.ZodType<T>, options: RequestOptions): Promise<JisrResponse<T>> {
    const entry = this.#entryFor(options.operationId);
    const credentials = this.#credentialsFor(options.useFinanceCredentials);
    const url = this.#buildUrl(entry, options);

    const send = async (token: string): Promise<Response> => {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      return this.#fetch(url, {
        method: entry.method,
        headers: {
          Slug: this.#config.slug,
          'Access-Token': token,
          'api-version': '1',
          Accept: 'application/json',
        },
        signal: options.signal ?? timeout,
      });
    };

    let token = await getToken(this.#authContext(), credentials, this.#cache, this.#fetch);
    let response: Response;

    try {
      response = await send(token);
    } catch (cause) {
      throw new JisrMcpError(
        'JISR_TEMPORARILY_UNAVAILABLE',
        cause instanceof Error && cause.name === 'TimeoutError'
          ? 'The request to Jisr timed out.'
          : 'Could not reach Jisr.',
        'Check connectivity and Jisr service status, then retry.',
      );
    }

    // Exactly one re-authentication, and only for a rejected token. Any further
    // rejection is reported rather than retried (research R7).
    if (response.status === 401) {
      this.#cache.invalidate(this.#config.organizationId, credentials);
      token = await authenticate(this.#authContext(), credentials, this.#cache, this.#fetch);
      response = await send(token);
    }

    if (!response.ok) {
      throw mapUpstreamStatus({ status: response.status });
    }

    const receivedAt = new Date().toISOString();
    const envelope = envelopeSchema.safeParse(await response.json());
    if (!envelope.success) {
      throw new JisrMcpError(
        'JISR_RESPONSE_INVALID',
        'The Jisr response did not match the documented envelope.',
        'Run `npm run snapshot:jisr` to check whether the upstream contract has changed.',
      );
    }

    const payload = schema.safeParse(envelope.data.data);
    if (!payload.success) {
      throw new JisrMcpError(
        'JISR_RESPONSE_INVALID',
        `The Jisr payload for ${entry.operationId} did not match the approved schema.`,
        'Run `npm run snapshot:jisr` to check whether the upstream contract has changed.',
      );
    }

    const rawPagination =
      typeof envelope.data.data === 'object' && envelope.data.data !== null
        ? (envelope.data.data as Record<string, unknown>)['pagination']
        : undefined;
    const pagination = paginationSchema.safeParse(rawPagination);

    return {
      data: payload.data,
      pagination: pagination.success ? pagination.data : undefined,
      receivedAt,
    };
  }
}

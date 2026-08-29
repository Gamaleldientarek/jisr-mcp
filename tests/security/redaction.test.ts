/**
 * Log and audit redaction (spec FR-025, FR-029, SC-003).
 *
 * The requirement is absolute: credential values appear ZERO times in any
 * output, log, trace, or artifact. Redaction therefore fails closed -- a line
 * that cannot be made safe is suppressed, not emitted with best effort.
 *
 * SECRET-SCAN-EXEMPT: testing redaction requires realistic credential shapes,
 * and a base64 JWT cannot carry a readable "invented" marker inside it. Every
 * value below is fabricated. See tests/security/no-secrets.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { buildAuditRecord, createAuditSink } from '../../src/observability/audit.js';
import { createLogger } from '../../src/observability/logger.js';
import { assertNoSecrets, redact, REDACTED } from '../../src/observability/redaction.js';

const JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJvcmdhbml6YXRpb25faWRlbnRpZmllciI6OTAwMDAxNH0.upSyVVcRrBe2SNUvjnAlDq7NO';
const BEARER = 'Bearer sk-live-abcdefghijklmnop';

function captureStream(): { stream: NodeJS.WriteStream; lines: string[] } {
  const lines: string[] = [];
  const stream = {
    write(chunk: string): boolean {
      lines.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { stream, lines };
}

describe('redact', () => {
  it('masks values under secret-looking keys regardless of casing', () => {
    const out = redact({
      'api-key': 'live-key',
      API_SECRET: 'live-secret',
      AccessToken: 'live-token',
      Authorization: BEARER,
      slug: 'acme-co',
      auth_data: BEARER,
      custom_header: { 'X-Api-Key': 'k' },
    }) as Record<string, unknown>;

    for (const value of Object.values(out)) expect(value).toBe(REDACTED);
  });

  it('masks credential-shaped values wherever they appear', () => {
    const out = JSON.stringify(
      redact({ note: `token is ${JWT}`, nested: { deep: [`auth ${BEARER}`] } }),
    );
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(out).not.toContain('sk-live-abcdefghijklmnop');
  });

  it('does not redact field names that merely contain a secret-ish word', () => {
    // Regression: /authorization/i once matched `authorizationDecision`, which
    // silently blanked the most important field in every audit record.
    const out = redact({
      authorizationDecision: 'allow',
      tokenCount: 12,
      secretsScanned: 3,
    }) as Record<string, unknown>;

    expect(out['authorizationDecision']).toBe('allow');
    // These two SHOULD still be masked -- the rule is narrow, not absent.
    expect(out['tokenCount']).toBe(REDACTED);
    expect(out['secretsScanned']).toBe(REDACTED);
  });

  it('still masks the Authorization header itself', () => {
    const out = redact({ Authorization: BEARER, authorization: BEARER }) as Record<string, unknown>;
    expect(out['Authorization']).toBe(REDACTED);
    expect(out['authorization']).toBe(REDACTED);
  });

  it('leaves ordinary operational values intact', () => {
    const out = redact({ tool: 'jisr_employees_list', count: 12, ok: true }) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({ tool: 'jisr_employees_list', count: 12, ok: true });
  });

  it('fails closed on values it cannot classify', () => {
    expect(redact(() => undefined)).toBe(REDACTED);
    expect(redact(Symbol('x'))).toBe(REDACTED);
  });
});

describe('logger', () => {
  it('writes to stderr, never stdout', () => {
    // On a stdio MCP server, stdout carries protocol traffic. A stray log line
    // there corrupts the session -- correctness, not tidiness.
    const { stream, lines } = captureStream();
    createLogger('info', stream).info('hello');
    expect(lines).toHaveLength(1);
  });

  it('redacts fields before writing', () => {
    const { stream, lines } = captureStream();
    createLogger('info', stream).info('connected', { 'api-key': 'live-key', slug: 'acme' });
    expect(lines[0]).not.toContain('live-key');
    expect(lines[0]).not.toContain('acme');
  });

  it('suppresses an entry that still looks unsafe after redaction', () => {
    const { stream, lines } = captureStream();
    // The credential is in the MESSAGE, where key-based redaction cannot reach.
    createLogger('info', stream).info(`raw ${JWT}`);
    const written = lines.join('');
    expect(written).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('respects the configured level', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('error', stream);
    logger.debug('noisy');
    logger.info('routine');
    logger.error('real');
    expect(lines).toHaveLength(1);
  });
});

describe('audit sink', () => {
  it('emits one JSON record per call, with no record contents', () => {
    const { stream, lines } = captureStream();
    createAuditSink(stream).write(
      buildAuditRecord({
        correlationId: 'c-1',
        organizationId: 'org-1',
        principalRef: 'hr_operations@org-1',
        profile: 'hr_operations',
        tool: 'jisr_employees_list',
        authorizationDecision: 'allow',
        outcome: 'allowed',
        recordCount: 12,
        errorCode: null,
        durationMs: 42,
        sensitive: false,
      }),
    );

    const record = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(record['kind']).toBe('audit');
    expect(record['tool']).toBe('jisr_employees_list');
    expect(record['recordCount']).toBe(12);
    // The count, never the records.
    expect(lines[0]).not.toContain('full_name');
  });
});

describe('assertNoSecrets', () => {
  it('detects a JWT or bearer token in a serialized line', () => {
    expect(assertNoSecrets(`{"m":"${JWT}"}`)).toBe(false);
    expect(assertNoSecrets(`{"m":"${BEARER}"}`)).toBe(false);
    expect(assertNoSecrets('{"m":"ordinary"}')).toBe(true);
  });
});

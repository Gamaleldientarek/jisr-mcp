/**
 * Log redaction (spec FR-025, FR-029).
 *
 * FAILS CLOSED. Where a value cannot be classified with certainty, the entry is
 * suppressed rather than emitted. A log line is not worth the risk of printing
 * a token, and an operator noticing a missing line is a far better outcome than
 * an operator not noticing a leaked one.
 */

/** Keys whose values must never appear in a log line, in any casing. */
const SECRET_KEY_PATTERNS = [
  /api[-_]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /authorization/i,
  /auth[-_]?data/i,
  /custom[-_]?header/i,
  /^slug$/i,
  /credential/i,
];

/** Value shapes that look like credentials wherever they appear. */
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+\S+/i,
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, // JWT
];

export const REDACTED = '[redacted]';
const MAX_DEPTH = 6;

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function redactString(value: string): string {
  let out = value;
  for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

/**
 * Returns a safe copy, or `undefined` when the value cannot be made safe --
 * the caller must then drop the entry entirely.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? REDACTED : redact(item, depth + 1);
    }
    return out;
  }

  // Functions, symbols, bigints: unclassifiable. Fail closed.
  return REDACTED;
}

/** Belt and braces over the fully serialized line. */
export function assertNoSecrets(serialized: string): boolean {
  return !SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(serialized));
}

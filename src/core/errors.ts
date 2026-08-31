/**
 * The stable error model (spec FR-035).
 *
 * Codes are part of the public contract: adopters and agents branch on them, so
 * they are added but never renamed or repurposed. Messages never carry an
 * upstream body, query text, token, or secret.
 *
 * `WRITE_*`, `DESTRUCTIVE_*` and `SYNC_*`/`DATA_*` codes from the baseline plan
 * are deliberately absent: this release has no write path and no store to raise
 * them (spec FR-012, FR-045).
 */

export const ERROR_CODES = [
  // Connection
  'JISR_CONNECTION_NOT_CONFIGURED',
  'JISR_CONNECTION_DISABLED',
  'JISR_AUTHENTICATION_FAILED',

  // Permission
  'JISR_PERMISSION_DENIED',
  'JISR_CAPABILITY_NOT_ENABLED',
  'FINANCE_ACCESS_REQUIRED',
  'RECORD_NOT_AUTHORIZED',

  // Upstream
  'JISR_RATE_LIMITED',
  'JISR_TEMPORARILY_UNAVAILABLE',
  'JISR_RESPONSE_INVALID',
  'JISR_SCHEMA_DRIFT_DETECTED',

  // Lookup
  'EMPLOYEE_NOT_FOUND',
  'RECORD_NOT_FOUND',
  'ORGANIZATION_MISMATCH',

  // Input
  'INVALID_FILTER',
  'INVALID_DATE_RANGE',
  'INVALID_CURSOR',
  'CURSOR_EXPIRED',
  'PAGE_SIZE_EXCEEDED',
  'BULK_LIMIT_EXCEEDED',
  'AMBIGUOUS_EMPLOYEE_MATCH',
  'TIMEZONE_REQUIRED',

  // Surface
  'TOOL_NOT_ENABLED',

  // Writes (names reserved by the baseline plan §19)
  'WRITE_NOT_ENABLED',
  'WRITE_CONFIRMATION_REQUIRED',
  'WRITE_PREPARATION_EXPIRED',
  'WRITE_TARGET_CHANGED',
  'DUPLICATE_WRITE_SUSPECTED',
  'WRITE_OUTCOME_UNKNOWN',
  'DESTRUCTIVE_ACTION_DISABLED',
  'BACKDATING_WINDOW_EXCEEDED',
  // A write without a stated reason is refused; the reason is part of the
  // audit contract, not decoration (feature 002 spec FR-013).
  'REASON_REQUIRED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorPayload {
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly suggestedAction?: string;
}

/** Codes a caller may usefully retry. Everything else is a definite answer. */
// WRITE_OUTCOME_UNKNOWN is deliberately NOT retryable: the write may have
// landed, and a retry is a possible double-write. Verify via reads first.
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'JISR_RATE_LIMITED',
  'JISR_TEMPORARILY_UNAVAILABLE',
]);

export class JisrMcpError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly suggestedAction: string | undefined;

  constructor(code: ErrorCode, message: string, suggestedAction?: string) {
    super(message);
    this.name = 'JisrMcpError';
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.suggestedAction = suggestedAction;
  }

  toPayload(): ErrorPayload {
    return this.suggestedAction === undefined
      ? { code: this.code, message: this.message, retryable: this.retryable }
      : {
          code: this.code,
          message: this.message,
          retryable: this.retryable,
          suggestedAction: this.suggestedAction,
        };
  }
}

export function isJisrMcpError(value: unknown): value is JisrMcpError {
  return value instanceof JisrMcpError;
}

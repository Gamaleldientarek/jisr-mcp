/**
 * Upstream failure -> stable error code (spec FR-035).
 *
 * Nothing from the upstream response body crosses this boundary. Jisr error
 * messages may contain record data, and a caller must never receive an upstream
 * body, stack trace, or query text.
 */

import { JisrMcpError } from '../errors.js';

export interface UpstreamFailure {
  readonly status: number;
  /** Whether authentication was already retried once for this call. */
  readonly alreadyRetried?: boolean;
}

export function mapUpstreamStatus(failure: UpstreamFailure): JisrMcpError {
  const { status } = failure;

  if (status === 401 || status === 403) {
    // 401/403 is ambiguous upstream: it may be a rejected token or a key
    // lacking the permission. The caller is told what to check without being
    // told which -- distinguishing them would leak the key's permission set.
    return new JisrMcpError(
      'JISR_PERMISSION_DENIED',
      'Jisr rejected the request as unauthorized.',
      'Ask a Jisr administrator to confirm the API key is active and permits this operation.',
    );
  }

  if (status === 404) {
    return new JisrMcpError('RECORD_NOT_FOUND', 'Jisr has no record matching that request.');
  }

  if (status === 422 || status === 400) {
    return new JisrMcpError(
      'INVALID_FILTER',
      'Jisr rejected the request parameters.',
      'Check the filter values against the documented ranges for this operation.',
    );
  }

  if (status === 429) {
    return new JisrMcpError(
      'JISR_RATE_LIMITED',
      'Jisr is rate limiting this organization.',
      'Wait before retrying. Jisr does not document its rate limits, so back off conservatively.',
    );
  }

  if (status >= 500) {
    return new JisrMcpError(
      'JISR_TEMPORARILY_UNAVAILABLE',
      'Jisr returned a server error.',
      'Retry shortly. If it persists, check Jisr service status.',
    );
  }

  return new JisrMcpError('JISR_RESPONSE_INVALID', `Jisr returned an unexpected status ${status}.`);
}

export function authenticationFailed(reason: 'credentials' | 'shape'): JisrMcpError {
  return reason === 'credentials'
    ? new JisrMcpError(
        'JISR_AUTHENTICATION_FAILED',
        'Jisr rejected the configured credentials.',
        'Verify JISR_SLUG, JISR_API_KEY and JISR_API_SECRET. The secret is shown only once when the key is created.',
      )
    : new JisrMcpError(
        'JISR_RESPONSE_INVALID',
        'The Jisr authentication response did not match the documented shape.',
        'The upstream contract may have changed. Run `npm run snapshot:jisr` to check for divergence.',
      );
}

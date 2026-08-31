/**
 * Ambiguous write outcomes (spec FR-009).
 *
 * A timeout or unparseable response AFTER submission means the write may have
 * landed. That is reported as exactly that -- never retried automatically,
 * because with undocumented upstream idempotency a retry is a possible double
 * write. The error names the read tool that resolves the question.
 */

import { isJisrMcpError, JisrMcpError } from '../errors.js';

const AMBIGUOUS_UPSTREAM_CODES = new Set(['JISR_TEMPORARILY_UNAVAILABLE', 'JISR_RESPONSE_INVALID']);

export async function submitGuarded<T>(
  submit: () => Promise<T>,
  resolvingReadTool: string,
): Promise<T> {
  try {
    return await submit();
  } catch (error) {
    if (isJisrMcpError(error) && AMBIGUOUS_UPSTREAM_CODES.has(error.code)) {
      // The request may or may not have reached Jisr. Ambiguity is the truth.
      throw new JisrMcpError(
        'WRITE_OUTCOME_UNKNOWN',
        'The write was submitted but its outcome could not be confirmed.',
        `Do NOT retry blindly -- the write may have succeeded. Verify with ${resolvingReadTool} first, then prepare again only if it is absent.`,
      );
    }
    throw error;
  }
}

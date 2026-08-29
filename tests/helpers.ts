/**
 * Shared test helpers.
 */

import { JisrMcpError } from '../src/core/errors.js';

/**
 * Runs a call expected to fail and returns its error, narrowed.
 *
 * Using `.catch(e => e as JisrMcpError)` produces a union with the success
 * type, which typechecks as passing while asserting nothing. This throws if the
 * call unexpectedly succeeds, so a test that stops exercising its failure path
 * fails loudly instead of silently.
 */
export async function refusalFrom(run: () => Promise<unknown>): Promise<JisrMcpError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof JisrMcpError) return error;
    throw error;
  }
  throw new Error('expected a refusal, but the call succeeded');
}

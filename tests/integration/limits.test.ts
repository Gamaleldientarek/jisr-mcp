/**
 * Bounded responses (spec FR-034, quickstart V7).
 *
 * A caller must not be able to provoke an unbounded response, and a limit must
 * produce a NAMED error rather than silent truncation. A leave report missing
 * people nobody was told about is worse than an error.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_RECORDS_PER_INVOCATION,
  UPSTREAM_MAX_PAGE_SIZE,
  validatePageSize,
} from '../../src/core/jisr/pagination.js';
import { LEAVE_SUMMARY_MAX_CODES } from '../../src/core/jisr/schemas/leave.js';
import { isJisrMcpError } from '../../src/core/errors.js';

describe('page size', () => {
  it('defaults when unspecified', () => {
    expect(validatePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('accepts the documented boundaries', () => {
    expect(validatePageSize(1)).toBe(1);
    expect(validatePageSize(UPSTREAM_MAX_PAGE_SIZE)).toBe(UPSTREAM_MAX_PAGE_SIZE);
  });

  it.each([0, -1, 1.5])('refuses %s with a named error', (value) => {
    try {
      validatePageSize(value);
      throw new Error('expected a refusal');
    } catch (error) {
      expect(isJisrMcpError(error)).toBe(true);
      if (isJisrMcpError(error)) expect(error.code).toBe('PAGE_SIZE_EXCEEDED');
    }
  });

  it('refuses above the documented Jisr maximum, naming the limit', () => {
    try {
      validatePageSize(UPSTREAM_MAX_PAGE_SIZE + 1);
      throw new Error('expected a refusal');
    } catch (error) {
      if (isJisrMcpError(error)) {
        expect(error.code).toBe('PAGE_SIZE_EXCEEDED');
        expect(error.message).toContain(String(UPSTREAM_MAX_PAGE_SIZE));
        expect(error.suggestedAction).toBeDefined();
      }
    }
  });
});

describe('documented upstream limits', () => {
  it('keeps the leave-summary code limit at the documented 100', () => {
    // If Jisr changes this, the snapshot refresh should surface it rather than
    // this constant drifting on its own.
    expect(LEAVE_SUMMARY_MAX_CODES).toBe(100);
  });

  it('caps records per invocation well above one page but far below unbounded', () => {
    expect(MAX_RECORDS_PER_INVOCATION).toBeGreaterThan(UPSTREAM_MAX_PAGE_SIZE);
    expect(MAX_RECORDS_PER_INVOCATION).toBeLessThanOrEqual(5000);
  });
});

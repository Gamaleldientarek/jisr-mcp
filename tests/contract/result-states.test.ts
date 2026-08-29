/**
 * The four non-success states must be distinguishable (spec FR-036).
 *
 * empty / partial / stale / unavailable. The failure this prevents: a caller
 * reading "no data" when the truth was "Jisr is down" or "you were not allowed
 * to see it".
 */

import { describe, expect, it } from 'vitest';
import { buildEnvelope, WARNING_CODES } from '../../src/core/envelope.js';
import { JisrMcpError } from '../../src/core/errors.js';
import { summarize } from '../../src/core/summary.js';

const BASE = {
  operation: 'jisr_employees_list',
  organizationId: 'org-states-0001',
  dataAsOf: '2026-08-29T12:00:00Z',
  pageSize: 50,
};

describe('empty', () => {
  it('is a success with no records and no warnings', () => {
    const envelope = buildEnvelope({ ...BASE, records: [] });
    expect(envelope.records).toHaveLength(0);
    expect(envelope.isPartial).toBe(false);
    expect(envelope.isStale).toBe(false);
    expect(envelope.warnings).toHaveLength(0);
    expect(summarize(envelope)).toContain('No matching records');
  });
});

describe('partial', () => {
  it('carries records, is flagged, and says why', () => {
    const envelope = buildEnvelope({
      ...BASE,
      records: [{ employeeId: '1' }],
      warnings: [{ code: WARNING_CODES.FIELDS_REDACTED, message: 'Some fields were withheld.' }],
    });
    expect(envelope.isPartial).toBe(true);
    expect(envelope.records).toHaveLength(1);
    expect(summarize(envelope)).toContain('partial');
    expect(summarize(envelope)).toContain('withheld');
  });

  it('is distinguishable from empty even when both return no records', () => {
    const empty = buildEnvelope({ ...BASE, records: [] });
    const allWithheld = buildEnvelope({
      ...BASE,
      records: [],
      warnings: [{ code: WARNING_CODES.SCOPE_NARROWED, message: '3 record(s) were withheld.' }],
    });
    expect(empty.isPartial).toBe(false);
    expect(allWithheld.isPartial).toBe(true);
  });
});

describe('stale', () => {
  it('is always false in a live-only release, and stated rather than omitted', () => {
    // Present from day one so a later synchronized store is additive, and so no
    // caller can mistake stored data for live (spec FR-031, FR-045).
    const envelope = buildEnvelope({ ...BASE, records: [] });
    expect(envelope).toHaveProperty('isStale');
    expect(envelope.isStale).toBe(false);
    expect(envelope.source).toBe('live_jisr');
  });
});

describe('unavailable', () => {
  it('is an error, never an empty success', () => {
    const error = new JisrMcpError(
      'JISR_TEMPORARILY_UNAVAILABLE',
      'Jisr returned a server error.',
      'Retry shortly.',
    );
    const payload = error.toPayload();
    expect(payload.retryable).toBe(true);
    expect(payload.suggestedAction).toBeDefined();
  });

  it('marks only upstream availability failures as retryable', () => {
    expect(new JisrMcpError('JISR_RATE_LIMITED', 'x').retryable).toBe(true);
    expect(new JisrMcpError('JISR_TEMPORARILY_UNAVAILABLE', 'x').retryable).toBe(true);
    // A permission failure will not resolve itself by retrying.
    expect(new JisrMcpError('JISR_PERMISSION_DENIED', 'x').retryable).toBe(false);
    expect(new JisrMcpError('RECORD_NOT_FOUND', 'x').retryable).toBe(false);
  });
});

describe('every result states its freshness', () => {
  it('includes source and dataAsOf, and says so in the summary', () => {
    const envelope = buildEnvelope({ ...BASE, records: [{ id: 1 }] });
    expect(envelope.source).toBe('live_jisr');
    expect(envelope.dataAsOf).toBe(BASE.dataAsOf);
    expect(summarize(envelope)).toContain('Live from Jisr');
  });
});

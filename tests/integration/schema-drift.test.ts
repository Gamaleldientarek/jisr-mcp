/**
 * Schema drift (spec FR-027, SC-009, quickstart V8).
 *
 * "100% of injected unknown upstream fields are detected and withheld rather
 * than passed through."
 *
 * An undeclared field has no classification, and an unclassified field could be
 * anything -- a national ID, a salary, a token. So the safe default is to drop
 * it and say the result is incomplete.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { allowedClassifications } from '../../src/core/authorization/field-policy.js';
import { mapEmployees } from '../../src/core/jisr/mappers/employees.js';
import { mapWebhooks } from '../../src/core/jisr/mappers/webhooks.js';
import { DriftCollector, driftCollector, driftWarning } from '../../src/core/jisr/schemas/drift.js';
import type { UpstreamEmployee } from '../../src/core/jisr/schemas/employees.js';

const allowed = allowedClassifications(
  'hr_operations',
  createFeatureFlags({ financeSurfaceEnabled: false }),
);

beforeEach(() => {
  driftCollector.clear();
});

describe('unknown employee fields', () => {
  it.each([
    ['national_id_expiry', '2030-01-01'],
    ['bank_iban', 'SA0000000000000000000000'],
    ['emergency_contact_phone', '+966500000000'],
    ['new_salary_component', 12345],
  ])('withholds %s and never emits its value', (field, value) => {
    const upstream = [
      { employee_id: 'x', full_name_en: 'Fictional', [field]: value },
    ] as unknown as UpstreamEmployee[];

    const result = mapEmployees(upstream, allowed);
    const serialized = JSON.stringify(result.records);

    expect(serialized).not.toContain(field);
    expect(serialized).not.toContain(String(value));
  });

  it('marks the result partial and warns', () => {
    const upstream = [
      { employee_id: 'x', unexpected_field: 'value' },
    ] as unknown as UpstreamEmployee[];

    const result = mapEmployees(upstream, allowed);
    expect(result.isPartial).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('SCHEMA_DRIFT');
  });

  it('tells the caller a count, never the field names', () => {
    // Even a field NAME discloses: national_id_expiry tells you what Jisr holds.
    const upstream = [
      { employee_id: 'x', national_id_expiry: '2030-01-01', bank_iban: 'SA00' },
    ] as unknown as UpstreamEmployee[];

    const warning = mapEmployees(upstream, allowed).warnings.find((w) => w.code === 'SCHEMA_DRIFT');
    expect(warning?.message).toContain('2');
    expect(warning?.message).not.toContain('national_id_expiry');
    expect(warning?.message).not.toContain('bank_iban');
  });

  it('records the field path for operators, without the value', () => {
    const upstream = [
      { employee_id: 'x', national_id_expiry: '2030-01-01' },
    ] as unknown as UpstreamEmployee[];

    mapEmployees(upstream, allowed);
    const entries = driftCollector.entries();
    expect(entries.map((e) => e.fieldPath)).toContain('national_id_expiry');
    expect(JSON.stringify(entries)).not.toContain('2030-01-01');
  });

  it('deduplicates a field that drifts on every record in a page', () => {
    const upstream = Array.from({ length: 50 }, (_, i) => ({
      employee_id: `id-${i}`,
      unexpected_field: `value-${i}`,
    })) as unknown as UpstreamEmployee[];

    mapEmployees(upstream, allowed);
    expect(driftCollector.entries()).toHaveLength(1);
  });
});

describe('unknown webhook fields', () => {
  it('withholds them and records the drift', () => {
    const upstream = [{ id: 1, name: 'hook', new_auth_mechanism: 'secret-value-here' }] as never;

    const result = mapWebhooks(upstream, allowed);
    expect(JSON.stringify(result.records)).not.toContain('secret-value-here');
    expect(result.isPartial).toBe(true);
    expect(driftCollector.entries().map((e) => e.fieldPath)).toContain('new_auth_mechanism');
  });
});

describe('no drift', () => {
  it('leaves a fully-known record complete and unwarned', () => {
    const upstream = [
      { employee_id: 'x', code: 1, full_name_en: 'Fictional', status: 'active' },
    ] as unknown as UpstreamEmployee[];

    const result = mapEmployees(upstream, allowed);
    expect(result.warnings.filter((w) => w.code === 'SCHEMA_DRIFT')).toHaveLength(0);
    expect(driftCollector.entries()).toHaveLength(0);
  });
});

describe('the drift collector', () => {
  it('keys on operation and path, so the same field in two domains is distinct', () => {
    const collector = new DriftCollector();
    const at = new Date().toISOString();
    collector.record({ operationId: 'a', fieldPath: 'f', detectedAt: at, snapshotVersion: 'v' });
    collector.record({ operationId: 'b', fieldPath: 'f', detectedAt: at, snapshotVersion: 'v' });
    expect(collector.entries()).toHaveLength(2);
  });

  it('produces a warning naming a count and nothing else', () => {
    expect(driftWarning(3).message).toContain('3');
    expect(driftWarning(3).code).toBe('SCHEMA_DRIFT');
  });
});

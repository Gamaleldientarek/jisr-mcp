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
import { employeeSchema } from '../../src/core/jisr/schemas/employees.js';
import { webhookSubscriptionSchema } from '../../src/core/jisr/schemas/webhooks.js';
import type { UpstreamEmployee } from '../../src/core/jisr/schemas/employees.js';

const allowed = allowedClassifications(
  'hr_operations',
  createFeatureFlags({ financeSurfaceEnabled: false }),
);

beforeEach(() => {
  driftCollector.clear();
});

describe('the schema must let unknown fields through to be seen', () => {
  // REGRESSION, found against live Jisr on 2026-08-30.
  //
  // A strict z.object() silently strips unknown keys at the schema boundary, so
  // they never reach the mapper that records them. Drift detection looked like
  // it worked -- its unit tests called the mapper directly -- while the real
  // wire path detected nothing. Live Jisr returns a `bank` field this schema did
  // not declare, and nothing recorded it.
  //
  // Safety never depended on the stripping: the mapper's allowlist is what keeps
  // fields out. Loose parsing only ensures an unknown field is SEEN.
  it('preserves an undeclared employee field through parsing', () => {
    const parsed = employeeSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      national_id_expiry: '2030-01-01',
    }) as Record<string, unknown>;
    expect('national_id_expiry' in parsed).toBe(true);
  });

  it('preserves an undeclared webhook field through parsing', () => {
    const parsed = webhookSubscriptionSchema.parse({
      id: 1,
      new_auth_mechanism: 'x',
    }) as Record<string, unknown>;
    expect('new_auth_mechanism' in parsed).toBe(true);
  });

  it('detects drift through the full wire-to-caller path', () => {
    const parsed = employeeSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      undeclared_upstream_field: 'sensitive-value',
    });
    const result = mapEmployees([parsed], allowed);

    expect(JSON.stringify(result.records)).not.toContain('sensitive-value');
    expect(result.warnings.map((w) => w.code)).toContain('SCHEMA_DRIFT');
    expect(driftCollector.entries().map((e) => e.fieldPath)).toContain('undeclared_upstream_field');
  });
});

describe('the two line_manager dialects', () => {
  // Verified live 2026-08-31 by fetching the SAME employee through both
  // endpoints: basic_info returns { id, name }, the list returns
  // { guid, full_name }. Same UUID, two dialects. Reading only `id` made the
  // list's manager reference invisible, which silently emptied every manager's
  // reachable set.
  it('normalizes the basic_info dialect { id, name }', () => {
    const parsed = employeeSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      line_manager: { id: 'b2199670-0000-4000-8000-000000000009', name: 'A Manager' },
    });
    const record = mapEmployees([parsed], allowed).records[0];
    expect(record?.lineManager?.id).toBe('b2199670-0000-4000-8000-000000000009');
    expect(record?.lineManager?.name).toBe('A Manager');
  });

  it('normalizes the list dialect { guid, full_name }', () => {
    const parsed = employeeSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      line_manager: { guid: 'b2199670-0000-4000-8000-000000000009', full_name: 'A Manager' },
    });
    const record = mapEmployees([parsed], allowed).records[0];
    expect(record?.lineManager?.id).toBe('b2199670-0000-4000-8000-000000000009');
    expect(record?.lineManager?.name).toBe('A Manager');
  });
});

describe('the employee identifier', () => {
  // Live Jisr returns the UUID as `id`. The documentation calls it
  // `employee_id`. Mapping only the documented name left employeeId null on
  // every record, which broke reachability matching by UUID.
  it('is populated from the `id` field Jisr actually sends', () => {
    const parsed = employeeSchema.parse({ id: '00000000-0000-4000-8000-000000000001' });
    expect(mapEmployees([parsed], allowed).records[0]?.employeeId).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('is also populated from the documented `employee_id` field', () => {
    const parsed = employeeSchema.parse({
      employee_id: '00000000-0000-4000-8000-000000000002',
    });
    expect(mapEmployees([parsed], allowed).records[0]?.employeeId).toBe(
      '00000000-0000-4000-8000-000000000002',
    );
  });
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

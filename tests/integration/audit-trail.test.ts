/**
 * Audit completeness (spec FR-038, FR-038a, SC-011).
 *
 * "Every tool call in a replayed session has a corresponding audit record, with
 * 0 records containing sensitive payloads."
 *
 * Records carry the decision and a COUNT, never contents. An audit trail that
 * quoted the salary it was auditing would be its own disclosure.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { buildEnvelope } from '../../src/core/envelope.js';
import { JisrMcpError } from '../../src/core/errors.js';
import {
  READ_ONLY_ANNOTATIONS,
  ToolRegistry,
  type ToolDefinition,
} from '../../src/core/tools/registry.js';
import { invokeTool, type AdapterRuntime } from '../../src/adapters/shared.js';
import { createAuditSink } from '../../src/observability/audit.js';
import { Metrics } from '../../src/observability/metrics.js';

const ORG = 'org-audit-000001';
const SECRET_NAME = 'Confidential Employee Name';
const SECRET_SALARY = 987654;

function capture(): { stream: NodeJS.WriteStream; lines: string[] } {
  const lines: string[] = [];
  return {
    stream: {
      write(chunk: string) {
        lines.push(chunk);
        return true;
      },
    } as unknown as NodeJS.WriteStream,
    lines,
  };
}

function tool(
  name: string,
  behaviour: 'ok' | 'refuse' | 'throw',
  groups: ToolDefinition<object>['declaredFieldGroups'] = ['internal_operational'],
): ToolDefinition<object> {
  return {
    name,
    title: name,
    description: name,
    inputShape: { q: z.string().optional() },
    annotations: READ_ONLY_ANNOTATIONS,
    declaredFieldGroups: groups,
    fieldGroupPurpose: 'test fixture for audit coverage',
    handler: async () => {
      if (behaviour === 'refuse') {
        throw new JisrMcpError('JISR_PERMISSION_DENIED', 'This operation is not available to you.');
      }
      if (behaviour === 'throw') {
        // An unexpected internal failure whose message carries record data.
        throw new Error(`internal failure for ${SECRET_NAME} earning ${SECRET_SALARY}`);
      }
      return await Promise.resolve({
        structuredContent: buildEnvelope({
          operation: name,
          organizationId: ORG,
          dataAsOf: '2026-08-29T12:00:00Z',
          records: [{ fullNameEn: SECRET_NAME, basicSalary: SECRET_SALARY }],
          pageSize: 50,
        }),
        summary: 'one record',
      });
    },
  };
}

function runtime(definitions: ToolDefinition<object>[]): {
  runtime: AdapterRuntime;
  lines: string[];
} {
  const registry = new ToolRegistry();
  for (const definition of definitions) registry.register(definition);
  const { stream, lines } = capture();

  return {
    runtime: {
      registry,
      context: {
        principal: createPrincipal({ organizationId: ORG, profile: 'hr_operations' }),
        flags: createFeatureFlags({ financeSurfaceEnabled: false }),
        observed: UNPROBED,
        client: {} as never,
        connection: { hostType: 'aws' },
      },
      audit: createAuditSink(stream),
      metrics: new Metrics(),
    },
    lines,
  };
}

function records(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('one record per call', () => {
  it('writes an audit record for a successful call', async () => {
    const { runtime: rt, lines } = runtime([tool('jisr_departments_list', 'ok')]);
    await invokeTool(rt, 'jisr_departments_list', {});

    const [record] = records(lines);
    expect(record?.['kind']).toBe('audit');
    expect(record?.['tool']).toBe('jisr_departments_list');
    expect(record?.['authorizationDecision']).toBe('allow');
    expect(record?.['outcome']).toBe('allowed');
    expect(record?.['recordCount']).toBe(1);
  });

  it('writes one for a refusal, marked deny', async () => {
    const { runtime: rt, lines } = runtime([tool('jisr_departments_list', 'refuse')]);
    await invokeTool(rt, 'jisr_departments_list', {});

    const [record] = records(lines);
    expect(record?.['authorizationDecision']).toBe('deny');
    expect(record?.['outcome']).toBe('refused');
    expect(record?.['errorCode']).toBe('JISR_PERMISSION_DENIED');
  });

  it('writes one for an unexpected failure, marked failed', async () => {
    const { runtime: rt, lines } = runtime([tool('jisr_departments_list', 'throw')]);
    await invokeTool(rt, 'jisr_departments_list', {});

    const [record] = records(lines);
    expect(record?.['outcome']).toBe('failed');
  });

  it('writes exactly one record per call across a replayed session', async () => {
    const { runtime: rt, lines } = runtime([
      tool('jisr_departments_list', 'ok'),
      tool('jisr_paygroups_list', 'refuse'),
      tool('jisr_locations_list', 'ok'),
    ]);

    await invokeTool(rt, 'jisr_departments_list', {});
    await invokeTool(rt, 'jisr_paygroups_list', {});
    await invokeTool(rt, 'jisr_locations_list', {});
    await invokeTool(rt, 'jisr_not_registered', {});

    // Three registered calls audited. The unregistered one never reached a
    // handler, so there is nothing to audit -- and it must not fabricate one.
    expect(lines).toHaveLength(3);
  });
});

describe('no sensitive payload', () => {
  it('never writes record contents, only a count', async () => {
    const { runtime: rt, lines } = runtime([tool('jisr_departments_list', 'ok')]);
    await invokeTool(rt, 'jisr_departments_list', {});

    expect(lines[0]).not.toContain(SECRET_NAME);
    expect(lines[0]).not.toContain(String(SECRET_SALARY));
    expect(records(lines)[0]?.['recordCount']).toBe(1);
  });

  it('never leaks an internal error message that carries record data', async () => {
    const { runtime: rt, lines } = runtime([tool('jisr_departments_list', 'throw')]);
    const result = await invokeTool(rt, 'jisr_departments_list', {});

    expect(lines[0]).not.toContain(SECRET_NAME);
    expect(JSON.stringify(result)).not.toContain(SECRET_NAME);
    expect(JSON.stringify(result)).not.toContain(String(SECRET_SALARY));
  });

  it('flags a financial call as sensitive so it can be reviewed separately', async () => {
    const { runtime: rt, lines } = runtime([
      tool('jisr_paygroups_list', 'ok', ['financial_confidential']),
    ]);
    await invokeTool(rt, 'jisr_paygroups_list', {});
    expect(records(lines)[0]?.['sensitive']).toBe(true);
  });
});

describe('correlation', () => {
  it('gives every call a distinct correlation id and a duration', async () => {
    const { runtime: rt, lines } = runtime([tool('jisr_departments_list', 'ok')]);
    await invokeTool(rt, 'jisr_departments_list', {});
    await invokeTool(rt, 'jisr_departments_list', {});

    const ids = records(lines).map((r) => r['correlationId']);
    expect(new Set(ids).size).toBe(2);
    for (const record of records(lines)) {
      expect(typeof record['durationMs']).toBe('number');
    }
  });
});

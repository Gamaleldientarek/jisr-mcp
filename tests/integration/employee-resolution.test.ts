/**
 * Employee identifiers (spec FR-009 conventions, tool contracts).
 *
 * Two identifiers exist and are never interchangeable: `employeeId` is a UUID,
 * `employeeCode` is an integer. There is deliberately NO name-based lookup --
 * resolving an ambiguous name means guessing, and a guess inside an
 * authorization-scoped read is the wrong kind of helpful.
 *
 * So the ambiguity this suite guards against is prevented structurally rather
 * than handled at runtime.
 */

import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/core/errors.js';
import { registerReadTools } from '../../src/core/tools/index.js';
import { ToolRegistry } from '../../src/core/tools/registry.js';

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  registerReadTools(r);
  return r;
}

describe('no tool accepts a name', () => {
  it('exposes no name, fullName or search input anywhere', () => {
    const offenders: string[] = [];
    for (const tool of registry().all()) {
      for (const field of Object.keys(tool.inputShape)) {
        if (/name|search|query/i.test(field)) offenders.push(`${tool.name}.${field}`);
      }
    }
    // moduleName and eventName on audit events are Jisr's own filter vocabulary,
    // not employee names -- assert precisely rather than broadly.
    expect(offenders.filter((f) => !f.startsWith('jisr_audit_events_list.'))).toEqual([]);
  });

  it('takes a UUID for employeeId, so a code cannot be passed by mistake', () => {
    const tool = registry().get('jisr_employee_basic_info_get');
    const schema = tool?.inputShape['employeeId'];
    expect(schema?.safeParse('1001').success).toBe(false);
    expect(schema?.safeParse('bab6cd98-7246-4cfc-a576-19bc00391792').success).toBe(true);
  });

  it('takes employee codes for the leave summary in either real-world shape', () => {
    // Jisr's docs say integers; the live AZMX tenant uses "EMP0117". Both work.
    const tool = registry().get('jisr_employee_leave_summary_get');
    const schema = tool?.inputShape['employeeCodes'];
    expect(schema?.safeParse([1001, 1002]).success).toBe(true);
    expect(schema?.safeParse(['EMP0117']).success).toBe(true);
    expect(schema?.safeParse([]).success).toBe(false);
  });
});

describe('the ambiguity contract still exists', () => {
  it('reserves AMBIGUOUS_EMPLOYEE_MATCH for when name resolution is introduced', () => {
    // The code is part of the published error set. Keeping it defined means a
    // future name-resolution flow cannot invent a different shape for the same
    // condition.
    expect(ERROR_CODES).toContain('AMBIGUOUS_EMPLOYEE_MATCH');
  });
});

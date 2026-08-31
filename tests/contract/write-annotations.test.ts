/**
 * Registry write allowlist (T013, spec FR-011, plan Complexity 1).
 *
 * The Release 1 structural guarantee survives feature 002 in weakened-but-
 * pinned form: a non-read-only tool registers ONLY when the endpoint manifest
 * binds it as a write, and its destructive annotation must match the
 * operation. An unmanifested write tool cannot exist.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  READ_ONLY_ANNOTATIONS,
  ToolRegistry,
  type ToolAnnotations,
  type ToolDefinition,
} from '../../src/core/tools/registry.js';

function definition(name: string, annotations: ToolAnnotations): ToolDefinition<never> {
  return {
    name,
    title: 'Test tool',
    description: 'Test-only definition.',
    inputShape: { anything: z.string() },
    annotations,
    declaredFieldGroups: ['internal_operational'],
    fieldGroupPurpose: 'test',
    handler: () => Promise.reject(new Error('never called')),
  };
}

const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

describe('the registry write allowlist', () => {
  it('refuses an unmanifested write tool', () => {
    const registry = new ToolRegistry();
    expect(() => registry.register(definition('jisr_anything_delete_commit', WRITE))).toThrow(
      /not a manifest-bound write/,
    );
  });

  it('accepts the manifest-bound commit tools with matching annotations', () => {
    const registry = new ToolRegistry();
    registry.register(definition('jisr_attendance_punch_create_commit', WRITE));
    registry.register(definition('jisr_employee_create_commit', WRITE));
    registry.register(
      definition('jisr_payroll_transaction_delete_commit', { ...WRITE, destructiveHint: true }),
    );
    expect(registry.all()).toHaveLength(3);
  });

  it('refuses a destructive annotation on a non-destructive operation', () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register(
        definition('jisr_attendance_punch_create_commit', { ...WRITE, destructiveHint: true }),
      ),
    ).toThrow(/destructive annotation/);
  });

  it('refuses a non-destructive annotation on the payroll deletion', () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register(definition('jisr_payroll_transaction_delete_commit', WRITE)),
    ).toThrow(/destructive annotation/);
  });

  it('still accepts read-only tools without consulting the manifest', () => {
    const registry = new ToolRegistry();
    registry.register(definition('jisr_test_read_tool', READ_ONLY_ANNOTATIONS));
    expect(registry.get('jisr_test_read_tool')).toBeDefined();
  });
});

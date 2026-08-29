/**
 * Discovery tools (spec FR-013, FR-014, FR-015, FR-016).
 *
 * These are how an agent finds out what it can do and why anything it cannot do
 * is unavailable -- the difference between a useful refusal and a dead end.
 */

import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import type { RoleProfile } from '../../src/core/authorization/role-profiles.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { registerReadTools } from '../../src/core/tools/index.js';
import { ToolRegistry, type ToolContext } from '../../src/core/tools/registry.js';
import { stubFetch } from '../fixtures/jisr/index.js';

const ORG = 'org-discovery-0001';
const SLUG = 'acme-secret-slug';

function context(profile: RoleProfile, financeSurfaceEnabled = false): ToolContext {
  const config: AppConfig = {
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: SLUG,
    credentials: { apiKey: 'test-key-value', apiSecret: 'test-secret-value' },
    financeCredentials: undefined,
    roleProfile: profile,
    featureFlags: createFeatureFlags({ financeSurfaceEnabled }),
    logLevel: 'error',
  };
  return {
    principal: createPrincipal({ organizationId: ORG, profile }),
    flags: config.featureFlags,
    observed: UNPROBED,
    client: new JisrClient(config, new TokenCache(), stubFetch([{ body: {} }]).fetch),
    connection: { hostType: 'aws' },
  };
}

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  registerReadTools(r);
  return r;
}

describe('jisr_connection_status_get', () => {
  it('reports health without any credential or organization identifier', async () => {
    const tool = registry().get('jisr_connection_status_get');
    const result = await tool?.handler({} as never, context('hr_operations'));
    const serialized = JSON.stringify(result?.structuredContent);

    // Spec FR-013: no slug, no key identifier, no token.
    expect(serialized).not.toContain(SLUG);
    expect(serialized).not.toContain('test-key-value');
    expect(serialized).not.toContain('test-secret-value');
    expect(serialized).not.toContain('apis.jisr.net');

    expect(result?.structuredContent).toMatchObject({
      organizationId: ORG,
      jisrHostType: 'aws',
      status: 'connected',
    });
  });
});

describe('jisr_capabilities_get', () => {
  it('reports four independent facts per operation', async () => {
    const tool = registry().get('jisr_capabilities_get');
    const result = await tool?.handler({} as never, context('hr_operations'));
    const body = result?.structuredContent as { capabilities: Record<string, unknown>[] };

    expect(body.capabilities.length).toBeGreaterThan(0);
    for (const capability of body.capabilities) {
      expect(capability).toHaveProperty('supportedBySpecification');
      expect(capability).toHaveProperty('permittedByJisrKey');
      expect(capability).toHaveProperty('allowedByPrincipal');
      expect(capability).toHaveProperty('enabledByConfiguration');
    }
  });

  it('reports an unprobed key permission as unknown, never as false', async () => {
    // Claiming a key lacks a permission we never tested would be inventing a
    // fact (plan > Open Dependencies).
    const tool = registry().get('jisr_capabilities_get');
    const result = await tool?.handler({} as never, context('hr_operations'));
    const body = result?.structuredContent as { capabilities: { permittedByJisrKey: unknown }[] };
    expect(body.capabilities.every((c) => c.permittedByJisrKey === 'unknown')).toBe(true);
  });

  it('returns no record data of any kind', async () => {
    const tool = registry().get('jisr_capabilities_get');
    const result = await tool?.handler({} as never, context('hr_operations'));
    const serialized = JSON.stringify(result?.structuredContent);
    expect(serialized).not.toContain('full_name');
    expect(serialized).not.toContain('records');
  });
});

describe('jisr_data_catalog_get', () => {
  it('publishes each tool declared field groups and their purpose', async () => {
    const tool = registry().get('jisr_data_catalog_get');
    const result = await tool?.handler({} as never, context('hr_operations'));
    const body = result?.structuredContent as {
      tools: { tool: string; declaredFieldGroups: string[]; fieldGroupPurpose: string }[];
    };

    expect(body.tools.length).toBeGreaterThan(0);
    for (const entry of body.tools) {
      expect(Array.isArray(entry.declaredFieldGroups)).toBe(true);
      expect(entry.fieldGroupPurpose.length).toBeGreaterThan(0);
    }
  });

  it('describes freshness as live, never cached', async () => {
    const tool = registry().get('jisr_data_catalog_get');
    const result = await tool?.handler({} as never, context('hr_operations'));
    expect((result?.structuredContent as { freshness: { source: string } }).freshness.source).toBe(
      'live_jisr',
    );
  });

  it('describes only tools the caller can actually use', async () => {
    const tool = registry().get('jisr_data_catalog_get');
    const result = await tool?.handler({} as never, context('employee_self'));
    const body = result?.structuredContent as { tools: { tool: string }[] };
    // employee_self has no organization enumeration (constitution §9.1).
    expect(body.tools.map((t) => t.tool)).not.toContain('jisr_employees_list');
  });
});

describe('the discovery surface itself', () => {
  it.each([
    'employee_self',
    'manager',
    'hr_operations',
    'finance',
    'auditor',
    'integration_admin',
    'platform_operator',
  ] as RoleProfile[])(
    'is available to %s, so no caller is left without a way to ask why',
    (profile) => {
      const names = registry()
        .listFor(context(profile))
        .map((t) => t.name);
      expect(names).toContain('jisr_connection_status_get');
      expect(names).toContain('jisr_capabilities_get');
      expect(names).toContain('jisr_data_catalog_get');
    },
  );

  it('gives the platform operator discovery only, and no organization data', () => {
    const names = registry()
      .listFor(context('platform_operator'))
      .map((t) => t.name);
    expect(names).not.toContain('jisr_employees_list');
    expect(names).not.toContain('jisr_attendance_summary_get');
  });
});

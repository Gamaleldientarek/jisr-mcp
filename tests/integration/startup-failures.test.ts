/**
 * Startup failures must be actionable (spec FR-006, quickstart V2).
 *
 * The first thing a new adopter sees when something is wrong. It must name the
 * setting and the fix -- and must never print a stack trace or echo a
 * credential, because the value is often exactly what they got wrong.
 */

import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from '../../src/config/environment.js';

const VALID = {
  JISR_BASE_URL: 'https://apis.jisr.net/api',
  JISR_SLUG: 'acme',
  JISR_API_KEY: 'a-key-value',
  JISR_API_SECRET: 'a-secret-value',
  JISR_ROLE_PROFILE: 'hr_operations',
};

async function failureFor(env: Record<string, string | undefined>): Promise<ConfigurationError> {
  try {
    await loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error('expected a configuration failure');
}

describe('missing or invalid settings', () => {
  it.each([
    ['JISR_BASE_URL', { ...VALID, JISR_BASE_URL: undefined }],
    ['JISR_SLUG', { ...VALID, JISR_SLUG: undefined }],
    ['JISR_API_KEY', { ...VALID, JISR_API_KEY: undefined }],
    ['JISR_API_SECRET', { ...VALID, JISR_API_SECRET: undefined }],
  ])('names %s and gives a fix', async (setting, env) => {
    const error = await failureFor(env);
    expect(error.setting).toBe(setting);
    expect(error.format()).toContain(setting);
    expect(error.action.length).toBeGreaterThan(10);
  });

  it('rejects a base URL that is not an approved Jisr host', async () => {
    const error = await failureFor({ ...VALID, JISR_BASE_URL: 'https://evil.example.test/api' });
    expect(error.setting).toBe('JISR_BASE_URL');
    expect(error.format()).toContain('not an approved Jisr host');
    // The fix tells them how to work out which host they are on.
    expect(error.action).toContain('.jisr.net.sa');
  });

  it('rejects a non-https base URL', async () => {
    const error = await failureFor({ ...VALID, JISR_BASE_URL: 'http://apis.jisr.net/api' });
    expect(error.format()).toContain('https');
  });

  it('rejects an unknown role profile and lists the valid ones', async () => {
    const error = await failureFor({ ...VALID, JISR_ROLE_PROFILE: 'admin' });
    expect(error.setting).toBe('JISR_ROLE_PROFILE');
    expect(error.action).toContain('hr_operations');
  });
});

describe('failure messages disclose nothing', () => {
  it('never echoes a credential value', async () => {
    const secret = 'super-secret-value-that-must-not-appear';
    const error = await failureFor({ ...VALID, JISR_API_SECRET: secret, JISR_SLUG: undefined });
    expect(error.format()).not.toContain(secret);
  });

  it('never includes a stack trace', async () => {
    const error = await failureFor({ ...VALID, JISR_SLUG: undefined });
    expect(error.format()).not.toContain('at ');
    expect(error.format().split('\n')).toHaveLength(3);
  });
});

describe('finance surface configuration', () => {
  it('refuses a finance credential while the surface is disabled', async () => {
    const error = await failureFor({
      ...VALID,
      JISR_FINANCE_SURFACE: 'disabled',
      JISR_FINANCE_API_KEY: 'k',
      JISR_FINANCE_API_SECRET: 's',
    });
    expect(error.setting).toBe('JISR_FINANCE_SURFACE');
  });

  it('refuses half a finance credential', async () => {
    const error = await failureFor({
      ...VALID,
      JISR_FINANCE_SURFACE: 'enabled',
      JISR_FINANCE_API_KEY: 'k',
    });
    expect(error.format()).toContain('only one half');
  });
});

describe('caller identity for person-scoped profiles', () => {
  // Regression: before FR-019b, configuring JISR_ROLE_PROFILE=manager started
  // cleanly and then returned nothing, forever. An empty result is
  // indistinguishable from "this person manages nobody", so the
  // misconfiguration hid behind plausible output.
  it.each(['employee_self', 'manager'])(
    'refuses to start as %s without a subject employee id',
    async (profile) => {
      const error = await failureFor({ ...VALID, JISR_ROLE_PROFILE: profile });
      expect(error.setting).toBe('JISR_SUBJECT_EMPLOYEE_ID');
      expect(error.format()).toContain(profile);
      expect(error.action).toContain('UUID');
    },
  );

  it.each(['employee_self', 'manager'])('starts as %s when given one', async (profile) => {
    const config = await loadConfig({
      ...VALID,
      JISR_ROLE_PROFILE: profile,
      JISR_SUBJECT_EMPLOYEE_ID: '00000000-0000-4000-8000-000000000001',
    });
    expect(config.subjectEmployeeId).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('rejects a non-UUID subject identity', async () => {
    const error = await failureFor({
      ...VALID,
      JISR_ROLE_PROFILE: 'manager',
      JISR_SUBJECT_EMPLOYEE_ID: '1001',
    });
    expect(error.setting).toBe('JISR_SUBJECT_EMPLOYEE_ID');
  });

  it.each(['hr_operations', 'finance', 'auditor'])(
    'refuses a subject identity for %s, which is not person-scoped',
    async (profile) => {
      // Silently ignoring it would let an operator believe they had narrowed
      // access when they had not.
      const error = await failureFor({
        ...VALID,
        JISR_ROLE_PROFILE: profile,
        JISR_SUBJECT_EMPLOYEE_ID: '00000000-0000-4000-8000-000000000001',
      });
      expect(error.setting).toBe('JISR_SUBJECT_EMPLOYEE_ID');
      expect(error.format()).toContain('not scoped to one person');
    },
  );
});

describe('a valid configuration', () => {
  it('loads, and derives an organization id that does not disclose the slug', async () => {
    const config = await loadConfig(VALID);
    expect(config.hostType).toBe('aws');
    expect(config.organizationId).not.toContain('acme');
    expect(config.featureFlags.financeSurfaceEnabled).toBe(false);
  });

  it('detects a locally hosted organization from its host', async () => {
    const config = await loadConfig({
      ...VALID,
      JISR_BASE_URL: 'https://api.jisr.net.sa/api/',
    });
    expect(config.hostType).toBe('local');
  });

  it('derives the same organization id for the same connection every time', async () => {
    const a = await loadConfig(VALID);
    const b = await loadConfig(VALID);
    expect(a.organizationId).toBe(b.organizationId);
  });
});

/**
 * Webhook subscriptions must never disclose stored authentication material
 * (spec FR-025, tool contract for jisr_webhooks_list).
 *
 * The upstream record carries `auth_data`, `auth_type`, `auth_position` and
 * `custom_header`. The last of those commonly holds a bearer token or API key
 * belonging to a THIRD-PARTY system the organization integrates with -- so a
 * leak here compromises more than Jisr.
 */

import { describe, expect, it } from 'vitest';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { allowedClassifications } from '../../src/core/authorization/field-policy.js';
import { ROLE_PROFILES } from '../../src/core/authorization/role-profiles.js';
import { mapWebhooks } from '../../src/core/jisr/mappers/webhooks.js';
import { WEBHOOK_SECRET_FIELDS } from '../../src/core/jisr/schemas/webhooks.js';

const SECRET_TOKEN = 'Bearer sk-live-DO-NOT-DISCLOSE';
const SECRET_HEADER_VALUE = 'X-SECRET-API-KEY-VALUE';

const UPSTREAM = [
  {
    id: 1,
    name: 'HRIS sync',
    description: 'Pushes employee changes downstream',
    endpoint: 'https://downstream.example.test/hook',
    http_method: 'POST',
    request_format: 'json',
    status: 'active',
    actions: [{ id: 9, name_en: 'employee.created', name_ar: 'إنشاء موظف', status: 'active' }],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',

    auth_data: SECRET_TOKEN,
    auth_type: 'Bearer',
    auth_position: 'header',
    custom_header: { 'X-Api-Key': SECRET_HEADER_VALUE },
  },
];

const flags = createFeatureFlags({ financeSurfaceEnabled: true });

describe('webhook subscriptions', () => {
  it.each(ROLE_PROFILES)('discloses no authentication material to %s', (profile) => {
    const result = mapWebhooks(UPSTREAM, allowedClassifications(profile, flags));
    const serialized = JSON.stringify(result.records);

    expect(serialized).not.toContain(SECRET_TOKEN);
    expect(serialized).not.toContain(SECRET_HEADER_VALUE);
    expect(serialized).not.toContain('sk-live');

    for (const field of WEBHOOK_SECRET_FIELDS) {
      expect(serialized).not.toContain(field);
    }
  });

  it('still returns the metadata an integration administrator needs', () => {
    const result = mapWebhooks(UPSTREAM, allowedClassifications('integration_admin', flags));
    const record = result.records[0];
    expect(record?.name).toBe('HRIS sync');
    expect(record?.endpoint).toBe('https://downstream.example.test/hook');
    expect(record?.status).toBe('active');
    expect(record?.actions[0]?.nameEn).toBe('employee.created');
  });

  it('classifies every secret field so none can be added back by omission', () => {
    // If a future schema change adds a secret field without classifying it, the
    // field policy treats it as unclassified and withholds it anyway. This
    // asserts the named list stays complete.
    expect(WEBHOOK_SECRET_FIELDS.length).toBeGreaterThanOrEqual(4);
  });
});

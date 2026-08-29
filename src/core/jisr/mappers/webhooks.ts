/**
 * Upstream webhook subscription -> normalized output (spec FR-025).
 *
 * The upstream record carries live authentication material: `auth_data`,
 * `auth_type`, `auth_position`, and `custom_header` -- the last of which
 * commonly holds a bearer token. None may reach a caller in any mode.
 *
 * They are classified `authentication_secret`, which appears in no allowed set
 * for any profile, so the field policy drops them before this mapper sees them.
 * The explicit map below is the second line of the same defence.
 */

import {
  applyFieldPolicy,
  WEBHOOK_FIELD_CLASSIFICATIONS,
  type Classification,
} from '../../authorization/field-policy.js';
import { WARNING_CODES, type Warning } from '../../envelope.js';
import type { z } from 'zod';
import type { webhookSubscriptionSchema } from '../schemas/webhooks.js';

type UpstreamWebhook = z.infer<typeof webhookSubscriptionSchema>;

export interface NormalizedWebhook {
  readonly id: number | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly endpoint: string | null;
  readonly httpMethod: string | null;
  readonly requestFormat: string | null;
  readonly status: string | null;
  readonly actions: readonly { id: number | null; nameEn: string | null; status: string | null }[];
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

const FIELD_MAP: Readonly<Record<string, keyof NormalizedWebhook>> = {
  id: 'id',
  name: 'name',
  description: 'description',
  endpoint: 'endpoint',
  http_method: 'httpMethod',
  request_format: 'requestFormat',
  status: 'status',
  actions: 'actions',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

export function mapWebhooks(
  upstream: readonly UpstreamWebhook[],
  allowed: ReadonlySet<Classification>,
): { records: readonly NormalizedWebhook[]; warnings: readonly Warning[]; isPartial: boolean } {
  const drift = new Set<string>();

  const records = upstream.map((raw) => {
    const policy = applyFieldPolicy(raw, WEBHOOK_FIELD_CLASSIFICATIONS, allowed);
    for (const f of policy.unclassified) drift.add(f);

    const out: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(policy.record)) {
      const key = FIELD_MAP[field];
      if (key === undefined) continue;
      out[key] =
        field === 'actions' && Array.isArray(value)
          ? value.map((action: Record<string, unknown>) => ({
              id: action['id'] ?? null,
              nameEn: action['name_en'] ?? null,
              status: action['status'] ?? null,
            }))
          : value;
    }
    if (out['actions'] === undefined) out['actions'] = [];
    return out as unknown as NormalizedWebhook;
  });

  const warnings: Warning[] = drift.size
    ? [
        {
          code: WARNING_CODES.SCHEMA_DRIFT,
          message: `Jisr returned ${drift.size} webhook field(s) absent from the approved schema; they were withheld.`,
        },
      ]
    : [];

  return { records, warnings, isPartial: warnings.length > 0 };
}

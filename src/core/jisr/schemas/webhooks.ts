/**
 * Webhook subscription schemas, from snapshot 2026-08-29.
 *
 * SECURITY: the upstream subscription carries stored webhook authentication
 * material -- `auth_data`, `auth_type`, `auth_position`, and `custom_header`,
 * which commonly holds a bearer token or API key.
 *
 * They are declared here so they validate rather than register as drift, and
 * are named in SECRET_FIELDS so the mapper can strip them. None of them may
 * ever reach a caller (spec FR-025, tool contract for jisr_webhooks_list).
 */

import { z } from 'zod';
import { collection } from './common.js';

export const webhookActionSchema = z.object({
  id: z.number().nullable().optional(),
  name_en: z.string().nullable().optional(),
  name_ar: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

/** Loose for the same reason as the employee schema: drift must be seen to be recorded. */
export const webhookSubscriptionSchema = z.looseObject({
  id: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  endpoint: z.string().nullable().optional(),
  http_method: z.string().nullable().optional(),
  request_format: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  actions: z.array(webhookActionSchema).optional(),
  agreegator: z.unknown().optional(),
  organization: z
    .object({
      id: z.number().nullable().optional(),
      identifier: z.number().nullable().optional(),
      name: z.string().nullable().optional(),
      name_i18n: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),

  // --- AUTHENTICATION_SECRET: validated, never mapped outward ---
  auth_data: z.unknown().optional(),
  auth_type: z.string().nullable().optional(),
  auth_position: z.string().nullable().optional(),
  custom_header: z.unknown().optional(),
});

/**
 * Fields the webhook mapper must drop. Referenced by the mapper and asserted by
 * `tests/field-policy/` so the list cannot silently shrink.
 */
export const WEBHOOK_SECRET_FIELDS = [
  'auth_data',
  'auth_type',
  'auth_position',
  'custom_header',
] as const;

export const webhooksListSchema = collection('subscriptions', webhookSubscriptionSchema);

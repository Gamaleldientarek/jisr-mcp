/**
 * Audit event schemas, from snapshot 2026-08-29.
 *
 * The upstream event shape is thinly documented -- `id`, `actor`, `created_at`
 * are all the snapshot declares. Documented fields only; anything else is drift
 * and is withheld (spec FR-027).
 *
 * Note this collection paginates with `total_count` where every other Jisr
 * collection uses `total_entries`. Handled in the shared pagination schema.
 */

import { z } from 'zod';
import { collection } from './common.js';

export const auditEventSchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  actor: z.unknown().optional(),
  created_at: z.string().nullable().optional(),
});

export const auditEventsListSchema = collection('audit_events', auditEventSchema);

/** Documented filters, encoded as `filter[...]` by the query encoder. */
export const AUDIT_FILTER_KEYS = [
  'module_name',
  'event_name',
  'event_type',
  'from_date',
  'to_date',
] as const;

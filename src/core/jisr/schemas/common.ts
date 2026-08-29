/**
 * Shapes shared by every Jisr response (data-model §2).
 *
 * All schemas here are `.passthrough()`-free on purpose: unknown fields are
 * detected as drift and withheld, never forwarded (spec FR-027).
 */

import { z } from 'zod';

export const paginationSchema = z.object({
  current_page: z.number(),
  next_page: z.number().nullable(),
  previous_page: z.number().nullable(),
  total_pages: z.number(),
  per_page: z.number().optional(),
  // Audit events use total_count where every other collection uses
  // total_entries. Jisr's own inconsistency, mapped rather than corrected.
  total_entries: z.number().optional(),
  total_count: z.number().optional(),
});

export type UpstreamPaginationShape = z.infer<typeof paginationSchema>;

/** `{ id, name_en, name_ar }` -- the shape every lookup returns. */
export const localisedRefSchema = z.object({
  id: z.number().nullable().optional(),
  name_en: z.string().nullable().optional(),
  name_ar: z.string().nullable().optional(),
});

/** A nested reference that carries only a display name. */
export const namedRefSchema = z.object({
  id: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
});

export function collection<T extends z.ZodTypeAny>(key: string, item: T) {
  return z.object({
    [key]: z.array(item),
    pagination: paginationSchema.optional(),
  });
}

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

/**
 * A nested reference carrying only a display name.
 *
 * `id` accepts both string and number: `line_manager.id` is a UUID STRING
 * (verified live 2026-08-30), while other named references use numeric ids. The
 * OpenAPI document types them all as numbers.
 */
export const namedRefSchema = z.looseObject({
  id: z.union([z.string(), z.number()]).nullable().optional(),
  name: z.string().nullable().optional(),
  // The employee LIST returns the same reference as { guid, full_name } while
  // basic_info returns { id, name }. Same UUID, two dialects -- verified live
  // against the same employee on 2026-08-31. Both are accepted and normalized.
  guid: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
});

/** One identifier and one display name, whichever dialect arrived. */
export function refIdentity(ref: unknown): { id: string | number | null; name: string | null } {
  if (typeof ref !== 'object' || ref === null) return { id: null, name: null };
  const r = ref as Record<string, unknown>;
  return {
    id:
      (r['id'] as string | number | null | undefined) ??
      (r['guid'] as string | null | undefined) ??
      null,
    name:
      (r['name'] as string | null | undefined) ??
      (r['full_name'] as string | null | undefined) ??
      null,
  };
}

/**
 * A Jisr collection payload: `{ <key>: [...], pagination }`.
 *
 * The key is generic so callers get a typed field rather than an index
 * signature -- Jisr names the array differently per domain (`employees`,
 * `records`, `punches`, `leaves_summary`, `subscriptions`...), and losing that
 * name would mean casting at every call site.
 */
export function collection<K extends string, T extends z.ZodTypeAny>(
  key: K,
  item: T,
): z.ZodObject<
  { [P in K]: z.ZodArray<T> } & { pagination: z.ZodOptional<typeof paginationSchema> }
> {
  return z.object({
    [key]: z.array(item),
    pagination: paginationSchema.optional(),
  }) as unknown as z.ZodObject<
    { [P in K]: z.ZodArray<T> } & { pagination: z.ZodOptional<typeof paginationSchema> }
  >;
}

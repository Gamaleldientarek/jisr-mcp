/**
 * The six lookups, from snapshot 2026-08-29.
 * All return the same `{ id, name_en, name_ar }` shape.
 */
import { z } from 'zod';
import { collection } from './common.js';

export const lookupItemSchema = z.object({
  id: z.union([z.number(), z.string()]).nullable().optional(),
  name_en: z.string().nullable().optional(),
  name_ar: z.string().nullable().optional(),
});

/** Collection key differs per lookup; the item shape does not. */
export const LOOKUP_COLLECTION_KEYS = {
  departments: 'departments',
  employment_types: 'employment_types',
  business_units: 'business_units',
  locations: 'locations',
  nationalities: 'nationalities',
  outsourcing_companies: 'outsourcing_companies',
} as const;

export type LookupName = keyof typeof LOOKUP_COLLECTION_KEYS;

export function lookupListSchema(name: LookupName) {
  return collection(LOOKUP_COLLECTION_KEYS[name], lookupItemSchema);
}

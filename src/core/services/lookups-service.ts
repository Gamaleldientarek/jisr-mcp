/**
 * Lookups service (spec FR-007).
 *
 * Six endpoints, one shape: `{ id, name_en, name_ar }`. Class
 * `PUBLIC_REFERENCE` -- reference data an organization uses to describe itself,
 * carrying nothing about any individual. Available to every authorized profile.
 */

import { authorizeTool } from '../authorization/policies.js';
import { buildEnvelope, type ResultEnvelope } from '../envelope.js';
import { decodeCursor, encodeCursor, hashFilters } from '../cursor.js';
import { nextPageFrom, toUpstreamParams, validatePageSize } from '../jisr/pagination.js';
import { lookupListSchema, type LookupName } from '../jisr/schemas/lookups.js';
import type { ToolContext } from '../tools/registry.js';

export interface NormalizedLookup {
  readonly id: string | number | null;
  readonly nameEn: string | null;
  readonly nameAr: string | null;
}

/** Lookup name -> manifest operationId and tool name. */
export const LOOKUPS: Readonly<Record<LookupName, { operationId: string; tool: string }>> = {
  departments: { operationId: 'listDepartments', tool: 'jisr_departments_list' },
  employment_types: { operationId: 'listEmploymentTypes', tool: 'jisr_employment_types_list' },
  business_units: { operationId: 'listBusinessUnits', tool: 'jisr_business_units_list' },
  locations: { operationId: 'listLocations', tool: 'jisr_locations_list' },
  nationalities: { operationId: 'listNationalities', tool: 'jisr_nationalities_list' },
  outsourcing_companies: {
    operationId: 'listOutsourcingCompanies',
    tool: 'jisr_outsourcing_companies_list',
  },
};

export async function listLookup(
  name: LookupName,
  input: { pageSize?: number; cursor?: string },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedLookup> }> {
  const { operationId, tool } = LOOKUPS[name];
  authorizeTool(tool, context);

  const pageSize = validatePageSize(input.pageSize);
  const binding = {
    organizationId: context.principal.organizationId,
    operationId,
    filtersHash: hashFilters({ pageSize }),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(lookupListSchema(name), {
    operationId,
    query: toUpstreamParams(page, pageSize),
  });

  const items = (response.data as Record<string, unknown>)[name] as {
    id?: string | number | null;
    name_en?: string | null;
    name_ar?: string | null;
  }[];

  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: tool,
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: items.map((item) => ({
        id: item.id ?? null,
        nameEn: item.name_en ?? null,
        // Both language forms, always. Arabic is never transliterated.
        nameAr: item.name_ar ?? null,
      })),
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
    }),
  };
}

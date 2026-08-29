/**
 * The six lookup tools (spec FR-007).
 *
 * Generated from one definition because the six differ only in name: writing
 * them out six times would invite them to drift apart.
 */

import { z } from 'zod';
import { LOOKUPS, listLookup } from '../../services/lookups-service.js';
import { summarize } from '../../summary.js';
import { DEFAULT_PAGE_SIZE, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import type { LookupName } from '../../jisr/schemas/lookups.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

const TITLES: Readonly<Record<LookupName, string>> = {
  departments: 'List departments',
  employment_types: 'List employment types',
  business_units: 'List business units',
  locations: 'List locations',
  nationalities: 'List nationalities',
  outsourcing_companies: 'List outsourcing companies',
};

export function lookupTools(): readonly ToolDefinition<{ pageSize?: number; cursor?: string }>[] {
  return (Object.keys(LOOKUPS) as LookupName[]).map((name) => ({
    name: LOOKUPS[name].tool,
    title: TITLES[name],
    description: `Lists the organization's ${name.replace(/_/g, ' ')}, each with its identifier and both English and Arabic names. Use these to resolve names to stable identifiers before filtering other tools.`,
    inputShape: {
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(UPSTREAM_MAX_PAGE_SIZE)
        .optional()
        .describe(
          `Records per page, 1-${UPSTREAM_MAX_PAGE_SIZE}. Defaults to ${DEFAULT_PAGE_SIZE}.`,
        ),
      cursor: z.string().optional().describe('Pass pagination.nextCursor back unchanged.'),
    },
    annotations: READ_ONLY_ANNOTATIONS,
    declaredFieldGroups: ['public_reference'],
    fieldGroupPurpose:
      'Organizational reference data. Contains nothing about any individual employee.',
    handler: async (input, context) => {
      const { envelope } = await listLookup(name, input, context);
      return { structuredContent: envelope, summary: summarize(envelope) };
    },
  }));
}

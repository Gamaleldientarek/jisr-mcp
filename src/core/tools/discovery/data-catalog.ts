/**
 * jisr_data_catalog_get (spec FR-015, FR-028).
 *
 * Describes what each tool can return -- domains, classified field groups, the
 * stated purpose for each, freshness, and pagination -- WITHOUT returning any
 * record data.
 *
 * This is where FR-028's declared field groups become visible: a caller can see
 * what a tool may expose before calling it, which is what makes "return the
 * narrowest data" checkable rather than aspirational.
 */

import { z } from 'zod';
import { resolveAllCapabilities } from '../../authorization/capabilities.js';
import { DEFAULT_PAGE_SIZE, UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition, type ToolRegistry } from '../registry.js';

export function createDataCatalogTool(registry: ToolRegistry): ToolDefinition<{ domain?: string }> {
  return {
    name: 'jisr_data_catalog_get',
    title: 'Jisr data catalog',
    description:
      'Describes the available Jisr domains: which tools serve them, what classified field groups each tool may return and why, how pagination works, and how fresh the data is. Returns no records.',
    inputShape: { domain: z.string().optional().describe('Limit the catalog to one domain.') },
    annotations: READ_ONLY_ANNOTATIONS,
    declaredFieldGroups: ['internal_operational'],
    fieldGroupPurpose: 'Schema and policy metadata only. Returns no record data.',
    handler: async (input, context) => {
      const available = new Set(
        resolveAllCapabilities(context.principal, context.flags, context.observed)
          .filter((c) => c.available)
          .map((c) => c.tool),
      );

      const entries = registry
        .listFor(context)
        .filter((tool) => available.has(tool.name) || tool.name.startsWith('jisr_data_catalog'))
        .map((tool) => ({
          tool: tool.name,
          title: tool.title,
          declaredFieldGroups: tool.declaredFieldGroups,
          fieldGroupPurpose: tool.fieldGroupPurpose,
        }))
        .filter((entry) => input.domain === undefined || entry.tool.includes(input.domain));

      return await Promise.resolve({
        structuredContent: {
          organizationId: context.principal.organizationId,
          freshness: {
            source: 'live_jisr',
            description:
              'Every result is read live from Jisr at call time. Nothing is stored or cached.',
          },
          pagination: {
            style: 'opaque_cursor',
            defaultPageSize: DEFAULT_PAGE_SIZE,
            maxPageSize: UPSTREAM_MAX_PAGE_SIZE,
            description:
              'Pass pagination.nextCursor back unchanged. Cursors are bound to one organization, operation and filter set, and expire.',
          },
          tools: entries,
        },
        summary: `${entries.length} tool(s) described, with the classified field groups each may return. No record data is included.`,
      });
    },
  };
}

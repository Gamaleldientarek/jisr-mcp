/** jisr_audit_events_list (spec FR-007). */
import { z } from 'zod';
import { listAuditEvents } from '../../services/integration-service.js';
import { summarize } from '../../summary.js';
import { UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const auditEventsTool: ToolDefinition<{
  moduleName?: string;
  eventName?: string;
  eventType?: string;
  fromDate?: string;
  toDate?: string;
  pageSize?: number;
  cursor?: string;
}> = {
  name: 'jisr_audit_events_list',
  title: 'List audit events',
  description:
    'Lists Jisr audit events, filterable by module, event name, event type and date range. Filters are ordinary named inputs; the server encodes them into Jisr’s bracketed query syntax.',
  inputShape: {
    moduleName: z.string().optional(),
    eventName: z.string().optional(),
    eventType: z.string().optional(),
    fromDate: z.string().optional().describe('YYYY-MM-DD'),
    toDate: z.string().optional().describe('YYYY-MM-DD'),
    pageSize: z.number().int().min(1).max(UPSTREAM_MAX_PAGE_SIZE).optional(),
    cursor: z.string().optional(),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational'],
  fieldGroupPurpose: 'Audit trail metadata for investigation. No employee or financial records.',
  handler: async (input, context) => {
    const { envelope } = await listAuditEvents(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

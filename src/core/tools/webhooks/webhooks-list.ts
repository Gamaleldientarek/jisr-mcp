/**
 * jisr_webhooks_list (spec FR-025).
 *
 * Returns subscription metadata with all stored authentication material
 * removed. `custom_header` in particular commonly holds a bearer token for a
 * third-party system.
 */
import { z } from 'zod';
import { listWebhooks } from '../../services/integration-service.js';
import { summarize } from '../../summary.js';
import { UPSTREAM_MAX_PAGE_SIZE } from '../../jisr/pagination.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const webhooksListTool: ToolDefinition<{ pageSize?: number; cursor?: string }> = {
  name: 'jisr_webhooks_list',
  title: 'List webhook subscriptions',
  description:
    'Lists the organization’s webhook subscriptions: name, endpoint, HTTP method, status and subscribed events. Stored authentication material is never returned.',
  inputShape: {
    pageSize: z.number().int().min(1).max(UPSTREAM_MAX_PAGE_SIZE).optional(),
    cursor: z.string().optional(),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational'],
  fieldGroupPurpose:
    'Subscription configuration for integration administration. Authentication material is excluded by policy.',
  handler: async (input, context) => {
    const { envelope } = await listWebhooks(input, context);
    return { structuredContent: envelope, summary: summarize(envelope) };
  },
};

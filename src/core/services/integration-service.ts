/**
 * Webhook subscriptions and audit events (spec FR-025).
 *
 * Both are integration/audit metadata rather than employee data. The webhook
 * listing is the one that matters most: the upstream record carries live
 * authentication material for THIRD-PARTY systems, so a leak here reaches
 * beyond Jisr.
 */

import { allowedClassifications } from '../authorization/field-policy.js';
import { authorizeTool } from '../authorization/policies.js';
import { buildEnvelope, type ResultEnvelope } from '../envelope.js';
import { decodeCursor, encodeCursor, hashFilters } from '../cursor.js';
import { mapWebhooks, type NormalizedWebhook } from '../jisr/mappers/webhooks.js';
import { nextPageFrom, toUpstreamParams, validatePageSize } from '../jisr/pagination.js';
import { encodeFilterQuery } from '../jisr/query-encoding.js';
import { auditEventsListSchema } from '../jisr/schemas/audit.js';
import { webhooksListSchema } from '../jisr/schemas/webhooks.js';
import type { ToolContext } from '../tools/registry.js';

export async function listWebhooks(
  input: { pageSize?: number; cursor?: string },
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedWebhook> }> {
  authorizeTool('jisr_webhooks_list', context);

  const pageSize = validatePageSize(input.pageSize);
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: 'listWebhooks',
    filtersHash: hashFilters({ pageSize }),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(webhooksListSchema, {
    operationId: 'listWebhooks',
    query: toUpstreamParams(page, pageSize),
  });

  // The mapper drops auth_data, auth_type, auth_position and custom_header.
  const mapped = mapWebhooks(
    response.data.subscriptions,
    allowedClassifications(context.principal.profile, context.flags),
  );
  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_webhooks_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: mapped.records,
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
      warnings: mapped.warnings,
      isPartial: mapped.isPartial,
    }),
  };
}

export interface AuditEventsInput {
  readonly moduleName?: string;
  readonly eventName?: string;
  readonly eventType?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly pageSize?: number;
  readonly cursor?: string;
}

export interface NormalizedAuditEvent {
  readonly id: string | number | null;
  readonly actor: unknown;
  readonly createdAt: string | null;
}

export async function listAuditEvents(
  input: AuditEventsInput,
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<NormalizedAuditEvent> }> {
  authorizeTool('jisr_audit_events_list', context);

  const pageSize = validatePageSize(input.pageSize);
  const filters = {
    moduleName: input.moduleName,
    eventName: input.eventName,
    eventType: input.eventType,
    fromDate: input.fromDate,
    toDate: input.toDate,
    pageSize,
  };
  const binding = {
    organizationId: context.principal.organizationId,
    operationId: 'listAuditEvents',
    filtersHash: hashFilters(filters),
  };
  const page = input.cursor === undefined ? 1 : decodeCursor(input.cursor, binding);

  const response = await context.client.request(auditEventsListSchema, {
    operationId: 'listAuditEvents',
    query: {
      ...toUpstreamParams(page, pageSize),
      // Ordinary named inputs in; Jisr's bracketed filter[...] syntax out. No
      // model is ever asked to build a bracketed query string.
      ...encodeFilterQuery({
        module_name: input.moduleName,
        event_name: input.eventName,
        event_type: input.eventType,
        from_date: input.fromDate,
        to_date: input.toDate,
      }),
    },
  });

  const nextPage = nextPageFrom(response.pagination);

  return {
    envelope: buildEnvelope({
      operation: 'jisr_audit_events_list',
      organizationId: context.principal.organizationId,
      dataAsOf: response.receivedAt,
      records: response.data.audit_events.map((event) => ({
        id: event.id ?? null,
        actor: event.actor ?? null,
        createdAt: event.created_at ?? null,
      })),
      pageSize,
      nextCursor: nextPage === null ? null : encodeCursor(binding, nextPage),
    }),
  };
}

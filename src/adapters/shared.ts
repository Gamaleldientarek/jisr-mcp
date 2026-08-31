/**
 * Shared adapter logic (spec FR-002a, SC-014).
 *
 * Everything both MCP SDK lines need, expressed once. Parity between adapters
 * is a requirement, not an aspiration -- so the parts that could drift live
 * here rather than being written twice.
 *
 * This file MAY import SDK types. `src/core` may not.
 */

import type { z } from 'zod';
import { isJisrMcpError } from '../core/errors.js';
import { summarize } from '../core/summary.js';
import type { ResultEnvelope } from '../core/envelope.js';

import {
  toolListCacheScope,
  TOOL_LIST_TTL_MS,
  type ToolContext,
  type ToolDefinition,
  type ToolRegistry,
} from '../core/tools/registry.js';
import { buildAuditRecord, type AuditSink } from '../observability/audit.js';
import { beginCorrelation, elapsedMs } from '../observability/correlation.js';
import type { Metrics } from '../observability/metrics.js';

/** The shape both SDKs accept back from a tool callback. */
export interface McpToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

export interface AdapterRuntime {
  readonly registry: ToolRegistry;
  readonly context: ToolContext;
  readonly audit: AuditSink;
  readonly metrics: Metrics;
}

function isEnvelope(value: unknown): value is ResultEnvelope<unknown> {
  return typeof value === 'object' && value !== null && 'operation' in value && 'records' in value;
}

/**
 * Runs a tool and produces the protocol result.
 *
 * Identical for both adapters by construction: an adapter supplies the runtime
 * and receives the finished result, so neither can develop its own error
 * shape, envelope, or audit behaviour.
 */
export async function invokeTool(
  runtime: AdapterRuntime,
  toolName: string,
  rawInput: unknown,
): Promise<McpToolResult> {
  const correlation = beginCorrelation();
  const tool = runtime.registry.get(toolName);

  if (tool === undefined) {
    return errorResult('TOOL_NOT_ENABLED', `Tool "${toolName}" is not available.`);
  }

  const sensitive = tool.declaredFieldGroups.some(
    (group) => group === 'financial_confidential' || group === 'employee_sensitive',
  );

  try {
    const result = await tool.handler(rawInput as never, runtime.context);
    const count = isEnvelope(result.structuredContent)
      ? result.structuredContent.records.length
      : null;

    runtime.audit.write(
      buildAuditRecord({
        correlationId: correlation.correlationId,
        organizationId: runtime.context.principal.organizationId,
        principalRef: runtime.context.principal.reference,
        profile: runtime.context.principal.profile,
        tool: toolName,
        authorizationDecision: 'allow',
        outcome: 'allowed',
        recordCount: count,
        errorCode: null,
        durationMs: elapsedMs(correlation),
        sensitive,
        ...(result.writeAudit ?? {}),
      }),
    );
    runtime.metrics.recordToolCall(toolName, 'allowed', elapsedMs(correlation), sensitive);

    return {
      content: [{ type: 'text', text: result.summary }],
      structuredContent: result.structuredContent as Record<string, unknown>,
    };
  } catch (error) {
    const payload = isJisrMcpError(error)
      ? error.toPayload()
      : {
          // An unexpected internal failure must not leak its message: it may
          // carry a record value or an upstream body (spec FR-035).
          code: 'JISR_RESPONSE_INVALID' as const,
          message: 'The request could not be completed.',
          retryable: false,
        };

    const refused = isJisrMcpError(error);
    runtime.audit.write(
      buildAuditRecord({
        correlationId: correlation.correlationId,
        organizationId: runtime.context.principal.organizationId,
        principalRef: runtime.context.principal.reference,
        profile: runtime.context.principal.profile,
        tool: toolName,
        authorizationDecision: refused ? 'deny' : 'allow',
        outcome: refused ? 'refused' : 'failed',
        recordCount: null,
        errorCode: payload.code,
        durationMs: elapsedMs(correlation),
        sensitive,
      }),
    );
    if (refused) runtime.metrics.recordDenial();
    runtime.metrics.recordUpstreamError(payload.code);
    runtime.metrics.recordToolCall(
      toolName,
      refused ? 'refused' : 'failed',
      elapsedMs(correlation),
      sensitive,
    );

    return errorResult(payload.code, payload.message, payload.suggestedAction, payload.retryable);
  }
}

function errorResult(
  code: string,
  message: string,
  suggestedAction?: string,
  retryable = false,
): McpToolResult {
  const body = { code, message, retryable, ...(suggestedAction ? { suggestedAction } : {}) };
  return {
    content: [{ type: 'text', text: suggestedAction ? `${message} ${suggestedAction}` : message }],
    structuredContent: body,
    isError: true,
  };
}

export interface RegistrationPlan {
  readonly definition: ToolDefinition<never>;
  readonly config: {
    readonly title: string;
    readonly description: string;
    readonly inputSchema: Record<string, z.ZodType>;
    readonly annotations: {
      readonly readOnlyHint: boolean;
      readonly destructiveHint: boolean;
      readonly idempotentHint: boolean;
      readonly openWorldHint: boolean;
    };
    readonly _meta: Record<string, unknown>;
  };
}

/**
 * The tools to register, and how -- computed once and used by both adapters so
 * the surface cannot differ between them.
 */
export function planRegistrations(runtime: AdapterRuntime): readonly RegistrationPlan[] {
  return runtime.registry.listFor(runtime.context).map((definition) => ({
    definition,
    config: {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputShape,
      annotations: definition.annotations,
      _meta: {
        // Published so a caller can see what a tool may expose before calling
        // it (spec FR-028).
        'jisr/declaredFieldGroups': definition.declaredFieldGroups,
        'jisr/fieldGroupPurpose': definition.fieldGroupPurpose,
      },
    },
  }));
}

/**
 * Cache directives for `tools/list` (research R5).
 *
 * The list is filtered per caller, so it MUST NOT be cached at a shared scope.
 * The SDK already defaults to `{ ttlMs: 0, cacheScope: 'private' }`, but this is
 * a release gate rather than something to inherit silently -- so it is stated.
 */
export function toolListCacheHint(runtime: AdapterRuntime): {
  ttlMs: number;
  cacheScope: 'private';
  scopeKey: string;
} {
  return {
    ttlMs: TOOL_LIST_TTL_MS,
    cacheScope: 'private',
    scopeKey: toolListCacheScope(runtime.context),
  };
}

export { summarize };

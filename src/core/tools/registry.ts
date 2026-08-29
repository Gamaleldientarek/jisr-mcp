/**
 * The SDK-free tool registry (spec FR-018, FR-028, FR-037).
 *
 * Nothing in this file imports an MCP SDK -- lint enforces that for everything
 * under src/core. Adapters translate these definitions into whichever protocol
 * version they speak, which is what lets one core serve two SDK lines and,
 * later, a hosted deployment (research R3, spec FR-002).
 */

import type { z } from 'zod';
import type { Classification } from '../authorization/field-policy.js';
import { isToolDiscoverable, type AuthorizationContext } from '../authorization/policies.js';
import type { ResultEnvelope } from '../envelope.js';

/**
 * MCP safety annotations.
 *
 * These are protocol HINTS, not a security control -- the SDK's own type
 * definition says clients must never make tool-use decisions on annotations
 * from untrusted servers (research R6). Ours are accurate because clients and
 * users rely on them for consent, but enforcement lives in authorization and
 * field policy. This release's strongest guarantee is structural: no write code
 * path exists to misannotate.
 */
export interface ToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

/** Every tool in this release. */
export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export interface ToolResult {
  readonly structuredContent: ResultEnvelope<unknown> | Record<string, unknown>;
  readonly summary: string;
}

export interface ToolDefinition<Input = unknown> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<Input>;
  readonly annotations: ToolAnnotations;
  /**
   * The classified field groups this tool's responses may contain, and why
   * (spec FR-028).
   *
   * Declaring them makes "return the narrowest data that answers the request"
   * testable rather than aspirational: a response containing a field outside
   * its declaration is a defect, and the data catalog publishes the
   * declarations so a caller knows what a tool can expose before calling it.
   */
  readonly declaredFieldGroups: readonly Classification[];
  readonly fieldGroupPurpose: string;
  readonly handler: (input: Input, context: AuthorizationContext) => Promise<ToolResult>;
}

export class ToolRegistry {
  readonly #tools = new Map<string, ToolDefinition<never>>();

  register<Input>(definition: ToolDefinition<Input>): void {
    if (this.#tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered.`);
    }
    if (!definition.annotations.readOnlyHint) {
      // This release has no write surface. A tool claiming otherwise is a bug
      // caught at startup rather than at call time (spec FR-012).
      throw new Error(
        `Tool "${definition.name}" is not read-only. This release exposes no write surface.`,
      );
    }
    this.#tools.set(definition.name, definition as unknown as ToolDefinition<never>);
  }

  get(name: string): ToolDefinition<never> | undefined {
    return this.#tools.get(name);
  }

  /** Every registered tool, regardless of authorization. For diagnostics only. */
  all(): readonly ToolDefinition<never>[] {
    return [...this.#tools.values()];
  }

  /**
   * The tools a caller may see.
   *
   * Filtered, not annotated-as-unavailable: an unauthorized capability must be
   * undiscoverable, so a normal employee never learns that payroll tooling
   * exists (spec FR-018).
   */
  listFor(context: AuthorizationContext): readonly ToolDefinition<never>[] {
    return this.all().filter((tool) => isToolDiscoverable(tool.name, context));
  }
}

/**
 * Cache scope for a filtered tool list (research R5).
 *
 * The 2026-07-28 protocol lets clients cache `tools/list`. Since ours is
 * filtered per caller, a list cached at too broad a scope would let one
 * principal observe another's capabilities -- turning a performance feature
 * into a disclosure. The scope is therefore derived from the principal, and the
 * TTL is deliberately short.
 */
export function toolListCacheScope(context: AuthorizationContext): string {
  const { principal, flags } = context;
  return [
    principal.organizationId,
    principal.profile,
    flags.financeSurfaceEnabled ? 'fin:on' : 'fin:off',
  ].join('|');
}

export const TOOL_LIST_TTL_MS = 60_000;

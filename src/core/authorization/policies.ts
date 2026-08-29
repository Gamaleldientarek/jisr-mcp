/**
 * Per-tool authorization (spec FR-017, FR-018).
 *
 * Two INDEPENDENT gates on every call: the caller's role profile, and the
 * connected Jisr key's permissions. Neither is inferred from the other
 * (Constitution Principle II).
 *
 * The model is untrusted input, not a trusted caller. Nothing here reads
 * anything the model supplied.
 */

import type { FeatureFlags } from '../../config/feature-flags.js';
import { JisrMcpError } from '../errors.js';
import { findByTool } from '../jisr/endpoint-manifest.js';
import {
  resolveCapability,
  UNPROBED,
  type CapabilityRecord,
  type ObservedPermissions,
} from './capabilities.js';
import type { Principal } from './principal.js';

export interface AuthorizationContext {
  readonly principal: Principal;
  readonly flags: FeatureFlags;
  readonly observed: ObservedPermissions;
}

/**
 * Decides whether a tool may run.
 *
 * Throws on refusal. The message names the failing gate and who can change it,
 * and never discloses whether the underlying record exists (spec User Story 3).
 */
export function authorizeTool(tool: string, context: AuthorizationContext): CapabilityRecord {
  const entry = findByTool(tool);
  if (entry === undefined) {
    // Unknown tool names are a programming error, not a caller error: the tool
    // set is ours. Raised loudly rather than refused quietly.
    throw new Error(
      `Tool "${tool}" has no endpoint manifest entry. Every tool must be declared (Constitution Principle I).`,
    );
  }

  const capability = resolveCapability(
    entry,
    context.principal,
    context.flags,
    context.observed ?? UNPROBED,
  );
  if (capability === null) {
    throw new Error(`Tool "${tool}" is bound to an unimplemented operation.`);
  }

  if (!capability.available) {
    throw new JisrMcpError(
      capability.unavailableReason ?? 'JISR_PERMISSION_DENIED',
      `This operation is not available to you.`,
      capability.suggestedAction ?? undefined,
    );
  }

  return capability;
}

/** Whether a tool should appear in the listed surface at all (spec FR-018). */
export function isToolDiscoverable(tool: string, context: AuthorizationContext): boolean {
  try {
    authorizeTool(tool, context);
    return true;
  } catch (error) {
    if (error instanceof JisrMcpError) return false;
    throw error;
  }
}

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
import { ROLE_PROFILES, type RoleProfile } from './role-profiles.js';

/**
 * Discovery tools have no upstream Jisr operation, so they have no endpoint
 * manifest entry -- the manifest tracks the documented API surface, and adding
 * a synthetic row would break the coverage gate's correspondence with the
 * snapshot.
 *
 * They are declared here instead, with their own profile requirements, and
 * carry no organization records: connection health, capability metadata, and
 * schema description only (contracts/endpoint-manifest.md).
 */
const DISCOVERY_TOOLS: Readonly<Record<string, readonly RoleProfile[]>> = {
  jisr_connection_status_get: ROLE_PROFILES,
  jisr_capabilities_get: ROLE_PROFILES,
  jisr_data_catalog_get: ROLE_PROFILES,
};

/**
 * Write-tool gates (feature 002, spec FR-001..003).
 *
 * Commit tools are manifest-bound; prepare tools reach no upstream write, so
 * like discovery tools they are declared here. BOTH halves carry the same
 * gates: profile, domain flag, and for the deletion path the finance surface
 * as well. A missing gate makes the pair undiscoverable, not refused.
 */
interface WriteGate {
  readonly profiles: readonly RoleProfile[];
  readonly flag: 'writeAttendance' | 'writeEmployees' | 'writePayrollDelete';
  readonly requiresFinanceSurface: boolean;
  readonly domain: string;
}

const WRITE_TOOL_GATES: Readonly<Record<string, WriteGate>> = {
  jisr_attendance_punch_create_prepare: {
    profiles: ['hr_operations'],
    flag: 'writeAttendance',
    requiresFinanceSurface: false,
    domain: 'attendance_logs',
  },
  jisr_attendance_punch_create_commit: {
    profiles: ['hr_operations'],
    flag: 'writeAttendance',
    requiresFinanceSurface: false,
    domain: 'attendance_logs',
  },
  jisr_employee_create_prepare: {
    profiles: ['hr_operations'],
    flag: 'writeEmployees',
    requiresFinanceSurface: false,
    domain: 'employees',
  },
  jisr_employee_create_commit: {
    profiles: ['hr_operations'],
    flag: 'writeEmployees',
    requiresFinanceSurface: false,
    domain: 'employees',
  },
  jisr_payroll_transaction_delete_prepare: {
    profiles: ['finance'],
    flag: 'writePayrollDelete',
    requiresFinanceSurface: true,
    domain: 'finance',
  },
  jisr_payroll_transaction_delete_commit: {
    profiles: ['finance'],
    flag: 'writePayrollDelete',
    requiresFinanceSurface: true,
    domain: 'finance',
  },
};

function writeCapability(tool: string, context: AuthorizationContext): CapabilityRecord | null {
  const gate = WRITE_TOOL_GATES[tool];
  if (gate === undefined) return null;

  const enabled =
    context.flags[gate.flag] &&
    (!gate.requiresFinanceSurface || context.flags.financeSurfaceEnabled);
  const allowed = gate.profiles.includes(context.principal.profile);
  const permitted = context.observed.probed
    ? !context.observed.deniedDomains.has(gate.domain)
    : 'unknown';

  let unavailableReason: CapabilityRecord['unavailableReason'] = null;
  let suggestedAction: string | null = null;
  if (!enabled) {
    unavailableReason =
      gate.flag === 'writePayrollDelete' ? 'DESTRUCTIVE_ACTION_DISABLED' : 'WRITE_NOT_ENABLED';
    suggestedAction =
      gate.flag === 'writePayrollDelete'
        ? 'The operator must enable JISR_WRITE_PAYROLL_DELETE and the finance surface together. It ships off.'
        : 'The operator must enable this write domain explicitly. Writes are absent by default.';
  } else if (!allowed) {
    unavailableReason = 'JISR_PERMISSION_DENIED';
    suggestedAction = `This write requires the ${gate.profiles.join(' or ')} profile.`;
  } else if (permitted === false) {
    unavailableReason = 'JISR_CAPABILITY_NOT_ENABLED';
    suggestedAction =
      'The connected Jisr API key does not permit this domain. Ask a Jisr administrator to review the key permissions.';
  }

  return {
    domain: gate.domain,
    tool,
    supportedBySpecification: true,
    permittedByJisrKey: permitted,
    allowedByPrincipal: allowed,
    enabledByConfiguration: enabled,
    available: unavailableReason === null,
    unavailableReason,
    suggestedAction,
  };
}

function discoveryCapability(tool: string, principal: Principal): CapabilityRecord | null {
  const profiles = DISCOVERY_TOOLS[tool];
  if (profiles === undefined) return null;

  const allowed = profiles.includes(principal.profile);
  return {
    domain: 'discovery',
    tool,
    supportedBySpecification: true,
    permittedByJisrKey: true,
    allowedByPrincipal: allowed,
    enabledByConfiguration: true,
    available: allowed,
    unavailableReason: allowed ? null : 'JISR_PERMISSION_DENIED',
    suggestedAction: allowed ? null : 'Ask the operator to review the configured role profile.',
  };
}

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
  const write = writeCapability(tool, context);
  if (write !== null) {
    if (!write.available) {
      throw new JisrMcpError(
        write.unavailableReason ?? 'WRITE_NOT_ENABLED',
        'This operation is not available to you.',
        write.suggestedAction ?? undefined,
      );
    }
    return write;
  }

  const discovery = discoveryCapability(tool, context.principal);
  if (discovery !== null) {
    if (!discovery.available) {
      throw new JisrMcpError(
        discovery.unavailableReason ?? 'JISR_PERMISSION_DENIED',
        'This operation is not available to you.',
        discovery.suggestedAction ?? undefined,
      );
    }
    return discovery;
  }

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

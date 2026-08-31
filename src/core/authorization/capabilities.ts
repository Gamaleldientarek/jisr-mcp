/**
 * Four-way capability resolution (spec FR-014, FR-016).
 *
 * Every domain reports four INDEPENDENT facts. Keeping them separate is the
 * point: "you cannot do this" is nearly useless, while "the connected key does
 * not permit it, and a Jisr administrator can change that" is actionable.
 */

import type { FeatureFlags } from '../../config/feature-flags.js';
import type { ErrorCode } from '../errors.js';
import { ENDPOINT_MANIFEST, type ManifestEntry } from '../jisr/endpoint-manifest.js';
import type { Principal } from './principal.js';

export interface CapabilityRecord {
  readonly domain: string;
  readonly tool: string;
  /** The approved snapshot declares the operation. */
  readonly supportedBySpecification: boolean;
  /** The connected Jisr key permits it, as OBSERVED -- never inferred. */
  readonly permittedByJisrKey: boolean | 'unknown';
  /** The caller's role profile allows it. */
  readonly allowedByPrincipal: boolean;
  /** Operator configuration enables it. */
  readonly enabledByConfiguration: boolean;
  readonly available: boolean;
  readonly unavailableReason: ErrorCode | null;
  readonly suggestedAction: string | null;
}

/**
 * Permissions observed during connection setup.
 *
 * Jisr documents no permission-discovery endpoint and no mapping from
 * permission to endpoint (plan > Open Dependencies), so this reports what was
 * actually observed. An unprobed domain is `unknown`, not `false`: claiming a
 * key lacks a permission we never tested would be inventing a fact.
 */
export interface ObservedPermissions {
  readonly probed: boolean;
  readonly deniedDomains: ReadonlySet<string>;
}

export const UNPROBED: ObservedPermissions = { probed: false, deniedDomains: new Set() };

function permittedByKey(entry: ManifestEntry, observed: ObservedPermissions): boolean | 'unknown' {
  if (!observed.probed) return 'unknown';
  return !observed.deniedDomains.has(entry.domain);
}

function configurationEnables(entry: ManifestEntry, flags: FeatureFlags): boolean {
  if (flags.disabledDomains.has(entry.domain)) return false;
  if (entry.readOrWrite === 'write') {
    // Writes ship absent; each domain is a separate operator opt-in, and the
    // destructive path additionally requires the finance surface (feature 002).
    if (entry.operationId === 'createAttendanceLogs') return flags.writeAttendance;
    if (entry.operationId === 'createEmployee') return flags.writeEmployees;
    if (entry.operationId === 'deletePayrollTransaction')
      return flags.writePayrollDelete && flags.financeSurfaceEnabled;
    return false;
  }
  // The finance surface requires an explicit operator opt-in on top of key
  // permission (spec FR-023a).
  if (entry.sensitivity === 'financial_confidential') return flags.financeSurfaceEnabled;
  return true;
}

export function resolveCapability(
  entry: ManifestEntry,
  principal: Principal,
  flags: FeatureFlags,
  observed: ObservedPermissions = UNPROBED,
): CapabilityRecord | null {
  if (entry.implementedTool === null) return null;

  const permitted = permittedByKey(entry, observed);
  const allowed = entry.requiredProfiles.includes(principal.profile);
  const enabled = configurationEnables(entry, flags);

  // Order matters. The first failing gate is the one reported, chosen so the
  // message names the person who can actually change it.
  let unavailableReason: ErrorCode | null = null;
  let suggestedAction: string | null = null;

  if (!enabled) {
    if (entry.readOrWrite === 'write') {
      unavailableReason =
        entry.operationId === 'deletePayrollTransaction'
          ? 'DESTRUCTIVE_ACTION_DISABLED'
          : 'WRITE_NOT_ENABLED';
      suggestedAction =
        entry.operationId === 'deletePayrollTransaction'
          ? 'The operator must enable JISR_WRITE_PAYROLL_DELETE and the finance surface together. It ships off.'
          : 'The operator must enable this write domain explicitly. Writes are absent by default.';
      // fallthrough skipped below via early return shape
    } else {
      unavailableReason = 'TOOL_NOT_ENABLED';
      suggestedAction =
        entry.sensitivity === 'financial_confidential'
          ? 'The operator must enable the finance surface explicitly. Key permission alone is not sufficient.'
          : 'The operator has disabled this domain in configuration.';
    }
  } else if (!allowed) {
    unavailableReason =
      entry.sensitivity === 'financial_confidential'
        ? 'FINANCE_ACCESS_REQUIRED'
        : 'JISR_PERMISSION_DENIED';
    suggestedAction = `This operation requires one of: ${entry.requiredProfiles.join(', ')}. Ask the operator to review the configured role profile.`;
  } else if (permitted === false) {
    unavailableReason = 'JISR_CAPABILITY_NOT_ENABLED';
    suggestedAction =
      'The connected Jisr API key does not permit this domain. Ask a Jisr administrator to review the key permissions.';
  }

  return {
    domain: entry.domain,
    tool: entry.implementedTool,
    supportedBySpecification: true,
    permittedByJisrKey: permitted,
    allowedByPrincipal: allowed,
    enabledByConfiguration: enabled,
    available: unavailableReason === null,
    unavailableReason,
    suggestedAction,
  };
}

export function resolveAllCapabilities(
  principal: Principal,
  flags: FeatureFlags,
  observed: ObservedPermissions = UNPROBED,
): readonly CapabilityRecord[] {
  return ENDPOINT_MANIFEST.map((entry) => resolveCapability(entry, principal, flags, observed))
    .filter((record): record is CapabilityRecord => record !== null)
    .sort((a, b) => a.tool.localeCompare(b.tool));
}

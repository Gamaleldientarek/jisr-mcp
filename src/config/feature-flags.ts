/**
 * Operator-controlled surface narrowing (spec FR-023, FR-023a).
 *
 * The connected Jisr key's permissions are the outer boundary; these flags only
 * ever narrow it further. Nothing here can widen access.
 */

export interface FeatureFlags {
  /**
   * The six financial tools do not exist unless this is true -- even when the
   * connected key permits financial access (spec FR-023a).
   *
   * This is deliberately not derived from key permissions. A convenience key
   * with broad permissions would otherwise put salary data in front of any
   * connected agent by default.
   */
  readonly financeSurfaceEnabled: boolean;

  /** Domains the operator has switched off. Empty means "whatever the key allows". */
  readonly disabledDomains: ReadonlySet<string>;

  /**
   * Per-domain write opt-ins (feature 002, spec FR-001/FR-002). Each defaults
   * to false: a deployment that has not explicitly enabled a write domain
   * exposes no write tool for it -- absence, not refusal.
   */
  readonly writeAttendance: boolean;
  readonly writeEmployees: boolean;
  /** The dormant destructive path. Requires the finance surface as well. */
  readonly writePayrollDelete: boolean;
}

export function createFeatureFlags(input: {
  financeSurfaceEnabled: boolean;
  disabledDomains?: readonly string[];
  writeAttendance?: boolean;
  writeEmployees?: boolean;
  writePayrollDelete?: boolean;
}): FeatureFlags {
  return {
    financeSurfaceEnabled: input.financeSurfaceEnabled,
    disabledDomains: new Set(input.disabledDomains ?? []),
    writeAttendance: input.writeAttendance ?? false,
    writeEmployees: input.writeEmployees ?? false,
    writePayrollDelete: input.writePayrollDelete ?? false,
  };
}

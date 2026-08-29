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
}

export function createFeatureFlags(input: {
  financeSurfaceEnabled: boolean;
  disabledDomains?: readonly string[];
}): FeatureFlags {
  return {
    financeSurfaceEnabled: input.financeSurfaceEnabled,
    disabledDomains: new Set(input.disabledDomains ?? []),
  };
}

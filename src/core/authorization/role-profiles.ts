/**
 * The seven canonical role profiles (spec FR-019).
 *
 * These identifiers are the contract. The endpoint manifest, the authorization
 * matrix, and operator configuration all use them verbatim -- no informal
 * synonyms. In this release the operator selects one by configuration; the same
 * definitions are what an identity provider would later map onto, which is what
 * keeps the hosted deployment additive (spec FR-002).
 */

export const ROLE_PROFILES = [
  'employee_self',
  'manager',
  'hr_operations',
  'finance',
  'integration_admin',
  'auditor',
  'platform_operator',
] as const;

export type RoleProfile = (typeof ROLE_PROFILES)[number];

export function isRoleProfile(value: string): value is RoleProfile {
  return (ROLE_PROFILES as readonly string[]).includes(value);
}

/**
 * How far a profile's reachable set extends (spec FR-018a).
 *
 * `self`         -- its own records only
 * `direct_reports` -- its own records plus employees whose line_manager is the
 *                   caller. Never an indirect tree: Jisr exposes a single-level
 *                   line_manager, so a wider tree would have to be derived and
 *                   then trusted for an authorization decision (spec FR-019a).
 * `organization` -- every record the connected key exposes, still subject to
 *                   the profile's own domain authorization
 * `none`         -- no organization data at all (spec FR-021)
 */
export type ReachableScope = 'self' | 'direct_reports' | 'organization' | 'none';

const REACHABLE_SCOPE: Readonly<Record<RoleProfile, ReachableScope>> = {
  employee_self: 'self',
  manager: 'direct_reports',
  hr_operations: 'organization',
  finance: 'organization',
  integration_admin: 'organization',
  auditor: 'organization',
  platform_operator: 'none',
};

export function reachableScopeFor(profile: RoleProfile): ReachableScope {
  return REACHABLE_SCOPE[profile];
}

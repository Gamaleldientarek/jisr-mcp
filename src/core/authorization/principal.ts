/**
 * The authenticated caller (spec FR-019, FR-022).
 *
 * In this release the profile comes from operator configuration. The shape is
 * exactly what an identity provider would later populate, which is what keeps
 * the hosted deployment additive rather than a rewrite (spec FR-002).
 *
 * `organizationId` is required, never defaulted and never ambient. This release
 * serves one organization, so the field looks redundant -- it is not. It is the
 * seam that makes tenancy enforceable the moment a second organization exists
 * (Constitution Principle IV).
 */

import type { RoleProfile } from './role-profiles.js';

export interface Principal {
  readonly organizationId: string;
  readonly profile: RoleProfile;
  /**
   * Which Jisr employee this caller IS.
   *
   * Required for the employee_self and manager profiles, whose reachable sets
   * are defined relative to it. Undefined for the rest.
   *
   * How an operator declares this in a configuration-driven deployment is an
   * open specification question (checklist security CHK003). Until it is
   * settled, a self or manager profile without it resolves to an empty
   * reachable set -- deny, never allow.
   */
  readonly subjectEmployeeId: string | undefined;
  /** A stable, non-identifying reference for audit records. */
  readonly reference: string;
}

export function createPrincipal(input: {
  organizationId: string;
  profile: RoleProfile;
  subjectEmployeeId?: string;
}): Principal {
  return {
    organizationId: input.organizationId,
    profile: input.profile,
    subjectEmployeeId: input.subjectEmployeeId,
    // Profile plus organization is enough to trace a decision without writing
    // an employee identifier into every audit line.
    reference: `${input.profile}@${input.organizationId.slice(0, 8)}`,
  };
}

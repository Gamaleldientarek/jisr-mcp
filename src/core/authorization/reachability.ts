/**
 * Reachable-set scoping for collections (spec FR-018a, FR-019a).
 *
 * Authorization decides whether a caller may run a tool. This decides which
 * RECORDS that call may return -- a separate question, and the one the
 * specification originally left open.
 *
 * Scoping is applied before pagination, and no count or pagination field may
 * disclose a record outside the set. That is why `nextPageFrom` never surfaces
 * `total_entries`: a total would tell a manager how many employees exist beyond
 * their reach.
 */

import { WARNING_CODES, type Warning } from '../envelope.js';
import { reachableScopeFor, type RoleProfile } from './role-profiles.js';
import type { Principal } from './principal.js';

/** The identifiers a record exposes, extracted per domain. */
export interface RecordIdentity {
  /** The record's own employee UUID, where it has one. */
  readonly employeeId: string | null;
  /** The record's own employee code. */
  readonly employeeCode: string | number | null;
  /** The identifier of this record's line manager, as Jisr reports it. */
  readonly lineManagerId: string | number | null;
}

export interface ScopeResult<T> {
  readonly records: readonly T[];
  readonly warnings: readonly Warning[];
  readonly removed: number;
}

function sameIdentifier(a: string | number | null, b: string | number | null): boolean {
  if (a === null || b === null) return false;
  return String(a) === String(b);
}

/**
 * Filters a collection to the caller's reachable records.
 *
 * FAILS CLOSED. Where the identifier needed to make the decision is missing --
 * a self or manager profile with no subject identity, or a record with no
 * line-manager reference -- the record is excluded. An authorization decision
 * made on absent data must never resolve to "allow".
 *
 * OPEN DEPENDENCY: Jisr does not document whether `line_manager.id` is the
 * employee UUID, the numeric employee id, or the employee code. Both the UUID
 * and the code are compared here, and a record matching neither is excluded.
 * Confirm the semantics with Jisr before relying on the manager profile in
 * production (plan > Open Dependencies).
 */
export function scopeToReachable<T>(
  records: readonly T[],
  principal: Principal,
  identify: (record: T) => RecordIdentity,
): ScopeResult<T> {
  const scope = reachableScopeFor(principal.profile);

  if (scope === 'organization') {
    return { records, warnings: [], removed: 0 };
  }
  if (scope === 'none') {
    return {
      records: [],
      warnings: [scopeWarning(records.length, principal.profile)],
      removed: records.length,
    };
  }

  const subject = principal.subjectEmployeeId;
  if (subject === undefined) {
    // Deny, never allow: a self or manager caller whose own identity is unknown
    // has an empty reachable set by definition.
    return {
      records: [],
      warnings: [scopeWarning(records.length, principal.profile)],
      removed: records.length,
    };
  }

  const kept = records.filter((record) => {
    const identity = identify(record);
    const isSelf =
      sameIdentifier(identity.employeeId, subject) ||
      sameIdentifier(identity.employeeCode, subject);

    if (scope === 'self') return isSelf;
    return isSelf || sameIdentifier(identity.lineManagerId, subject);
  });

  const removed = records.length - kept.length;
  return {
    records: kept,
    warnings: removed > 0 ? [scopeWarning(removed, principal.profile)] : [],
    removed,
  };
}

function scopeWarning(removed: number, profile: RoleProfile): Warning {
  return {
    code: WARNING_CODES.SCOPE_NARROWED,
    // Counts of what was withheld, never which records. The count is already
    // the maximum this profile may learn about records outside its reach.
    message: `${removed} record(s) outside your reachable set were withheld (profile: ${profile}).`,
  };
}

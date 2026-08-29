/**
 * The stable result envelope (spec FR-030, FR-031, FR-036).
 *
 * Every read tool returns this shape. `source` has exactly one possible value
 * this release, and is present anyway: it is what stops a caller ever mistaking
 * stored data for live, and it means a later synchronized store is an additive
 * change rather than a breaking one (spec FR-045).
 */

export type DataSource = 'live_jisr';

export interface Pagination {
  readonly nextCursor: string | null;
  readonly pageSize: number;
}

export interface Warning {
  readonly code: string;
  readonly message: string;
}

export interface ResultEnvelope<T> {
  readonly operation: string;
  readonly source: DataSource;
  readonly organizationId: string;
  /** When the upstream data was received. */
  readonly dataAsOf: string;
  readonly isStale: boolean;
  /** True when field policy, a bulk split, or drift means this is not the whole picture. */
  readonly isPartial: boolean;
  readonly records: readonly T[];
  readonly pagination: Pagination;
  readonly warnings: readonly Warning[];
}

export interface EnvelopeInput<T> {
  readonly operation: string;
  readonly organizationId: string;
  readonly dataAsOf: string;
  readonly records: readonly T[];
  readonly pageSize: number;
  readonly nextCursor?: string | null;
  readonly warnings?: readonly Warning[];
  readonly isPartial?: boolean;
}

export function buildEnvelope<T>(input: EnvelopeInput<T>): ResultEnvelope<T> {
  const warnings = input.warnings ?? [];
  return {
    operation: input.operation,
    source: 'live_jisr',
    organizationId: input.organizationId,
    dataAsOf: input.dataAsOf,
    // Nothing is stored, so nothing can be stale. Stated explicitly rather than
    // omitted, so the contract is stable when a store arrives.
    isStale: false,
    isPartial: input.isPartial ?? warnings.length > 0,
    records: input.records,
    pagination: { nextCursor: input.nextCursor ?? null, pageSize: input.pageSize },
    warnings,
  };
}

/**
 * For sensitive domains, organization metadata a caller does not need is
 * omitted (contracts/result-envelope-and-errors.md).
 */
export function withoutOrganizationMetadata<T>(
  envelope: ResultEnvelope<T>,
): Omit<ResultEnvelope<T>, 'organizationId'> {
  const { organizationId: _omitted, ...rest } = envelope;
  return rest;
}

export const WARNING_CODES = {
  FIELDS_REDACTED: 'FIELDS_REDACTED',
  SCHEMA_DRIFT: 'SCHEMA_DRIFT',
  BULK_REQUEST_SPLIT: 'BULK_REQUEST_SPLIT',
  SCOPE_NARROWED: 'SCOPE_NARROWED',
} as const;

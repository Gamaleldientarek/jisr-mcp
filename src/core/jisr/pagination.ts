/**
 * Upstream pagination (research R7).
 *
 * Jisr paginates by offset: `page` plus `rpp`, with rpp documented as minimum 1,
 * maximum 100, default 100. Its response carries a `pagination` block whose
 * `next_page` is a page NUMBER, not a URL.
 *
 * None of this reaches a caller. Tools expose `pageSize` and an opaque cursor;
 * translation happens here (spec FR-033).
 */

import { JisrMcpError } from '../errors.js';

/** Jisr's documented maximum records per page. */
export const UPSTREAM_MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Ceiling on records returned by a single tool invocation (spec FR-034).
 * Bounds the response a caller can provoke; complete exports are out of scope
 * and would need their own delivery and retention review.
 */
export const MAX_RECORDS_PER_INVOCATION = 1000;

export interface UpstreamPagination {
  readonly current_page: number;
  readonly next_page: number | null;
  readonly previous_page: number | null;
  readonly total_pages: number;
  readonly per_page: number;
  readonly total_entries: number;
}

export function validatePageSize(pageSize: number | undefined): number {
  if (pageSize === undefined) return DEFAULT_PAGE_SIZE;

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new JisrMcpError(
      'PAGE_SIZE_EXCEEDED',
      'pageSize must be a whole number of at least 1.',
      `Use a value between 1 and ${UPSTREAM_MAX_PAGE_SIZE}.`,
    );
  }
  if (pageSize > UPSTREAM_MAX_PAGE_SIZE) {
    throw new JisrMcpError(
      'PAGE_SIZE_EXCEEDED',
      `pageSize ${pageSize} exceeds the maximum of ${UPSTREAM_MAX_PAGE_SIZE}.`,
      `Request at most ${UPSTREAM_MAX_PAGE_SIZE} records per call and page through the rest.`,
    );
  }
  return pageSize;
}

export function toUpstreamParams(page: number, pageSize: number): { page: number; rpp: number } {
  return { page, rpp: validatePageSize(pageSize) };
}

/**
 * The next page number, or null at the end.
 *
 * Note what is NOT returned: total_entries. Exposing a total would disclose the
 * size of the unfiltered collection to a caller whose reachable set is narrower
 * (spec FR-018a).
 */
export function nextPageFrom(pagination: UpstreamPagination | undefined): number | null {
  if (!pagination) return null;
  const next = pagination.next_page;
  return typeof next === 'number' && next > pagination.current_page ? next : null;
}

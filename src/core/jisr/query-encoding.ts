/**
 * Upstream query encoding (spec FR-008, research R7).
 *
 * Jisr uses bracket syntax for ranges and array filters -- `joining_date[from]`,
 * `employee_ids[]`, `filter[module_name]`. Encoding it is the server's job. No
 * model is ever asked to build a bracketed query string, and no caller-supplied
 * string reaches the wire unencoded.
 */

export type QueryValue = string | number | boolean;

export interface QueryInput {
  readonly [key: string]: QueryValue | readonly QueryValue[] | RangeFilter | undefined;
}

/** A `field[from]` / `field[to]` pair. */
export interface RangeFilter {
  readonly from?: QueryValue | undefined;
  readonly to?: QueryValue | undefined;
}

function isRange(value: unknown): value is RangeFilter {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Builds the query string. Keys come from our own tool definitions, never from
 * caller input, so there is no key-injection surface -- only values are
 * caller-influenced, and URLSearchParams escapes those.
 */
export function encodeQuery(input: QueryInput): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      // Jisr expects repeated `field[]` entries for array filters.
      for (const item of value) params.append(`${key}[]`, String(item));
      continue;
    }

    if (isRange(value)) {
      if (value.from !== undefined) params.append(`${key}[from]`, String(value.from));
      if (value.to !== undefined) params.append(`${key}[to]`, String(value.to));
      continue;
    }

    params.append(key, String(value));
  }

  return params.toString();
}

/** The `filter[...]` family used by audit events. */
export function encodeFilterQuery(filters: Record<string, QueryValue | undefined>): QueryInput {
  const out: Record<string, QueryValue> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) out[`filter[${key}]`] = value;
  }
  return out;
}

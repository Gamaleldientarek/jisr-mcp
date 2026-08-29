/**
 * Operational signals (spec FR-040).
 *
 * In-process counters, readable by a diagnostic tool. Deliberately not an
 * exporter: a self-hosted stdio server has nowhere to push to, and adding a
 * network dependency to a read-only local server would be a poor trade.
 *
 * Labels are bounded -- tool name, outcome, error code -- never an employee
 * identifier or filter value, which would make cardinality unbounded and turn
 * a metrics store into an unclassified copy of the data.
 */

export interface MetricSnapshot {
  readonly toolCalls: Readonly<Record<string, number>>;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly authorizationDenials: number;
  readonly sensitiveToolCalls: number;
  readonly upstreamErrors: Readonly<Record<string, number>>;
  readonly upstreamRateLimited: number;
  readonly schemaDriftDetected: number;
  readonly latencyMsTotal: number;
}

export class Metrics {
  readonly #toolCalls = new Map<string, number>();
  readonly #outcomes = new Map<string, number>();
  readonly #upstreamErrors = new Map<string, number>();
  #authorizationDenials = 0;
  #sensitiveToolCalls = 0;
  #upstreamRateLimited = 0;
  #schemaDrift = 0;
  #latencyMsTotal = 0;

  #bump(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  recordToolCall(tool: string, outcome: string, durationMs: number, sensitive: boolean): void {
    this.#bump(this.#toolCalls, tool);
    this.#bump(this.#outcomes, outcome);
    this.#latencyMsTotal += durationMs;
    if (sensitive) this.#sensitiveToolCalls += 1;
  }

  recordDenial(): void {
    this.#authorizationDenials += 1;
  }

  recordUpstreamError(code: string): void {
    this.#bump(this.#upstreamErrors, code);
    if (code === 'JISR_RATE_LIMITED') this.#upstreamRateLimited += 1;
  }

  recordSchemaDrift(): void {
    this.#schemaDrift += 1;
  }

  snapshot(): MetricSnapshot {
    return {
      toolCalls: Object.fromEntries(this.#toolCalls),
      outcomes: Object.fromEntries(this.#outcomes),
      authorizationDenials: this.#authorizationDenials,
      sensitiveToolCalls: this.#sensitiveToolCalls,
      upstreamErrors: Object.fromEntries(this.#upstreamErrors),
      upstreamRateLimited: this.#upstreamRateLimited,
      schemaDriftDetected: this.#schemaDrift,
      latencyMsTotal: this.#latencyMsTotal,
    };
  }
}

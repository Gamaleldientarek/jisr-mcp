/**
 * Audit records (spec FR-038, FR-038a).
 *
 * Emitted as structured JSON on STDERR. Nothing is written to disk: this
 * release has no store, and creating one just for audit would reintroduce the
 * retention problem the live-only decision avoided. Retention, forwarding and
 * protection of that stream are the operator's documented responsibility.
 *
 * Records carry the decision and its subject -- never record CONTENTS. An audit
 * trail that quoted the salary it was auditing would be its own disclosure.
 */

import type { RoleProfile } from '../core/authorization/role-profiles.js';
import { assertNoSecrets, redact } from './redaction.js';

export type AuditOutcome = 'allowed' | 'refused' | 'failed';

export interface AuditRecord {
  readonly kind: 'audit';
  readonly time: string;
  readonly correlationId: string;
  readonly organizationId: string;
  readonly principalRef: string;
  readonly profile: RoleProfile;
  readonly tool: string;
  readonly authorizationDecision: 'allow' | 'deny';
  readonly outcome: AuditOutcome;
  /** How many records were returned. Never which. */
  readonly recordCount: number | null;
  readonly errorCode: string | null;
  readonly durationMs: number;
  /** True when the call touched financial or employee-sensitive data. */
  readonly sensitive: boolean;
}

export interface AuditSink {
  write(record: AuditRecord): void;
}

export function createAuditSink(stream: NodeJS.WriteStream = process.stderr): AuditSink {
  return {
    write(record: AuditRecord): void {
      let line: string;
      try {
        line = JSON.stringify(redact(record));
      } catch {
        return;
      }
      // An audit record must never become the leak it exists to detect.
      if (!assertNoSecrets(line)) return;
      stream.write(`${line}\n`);
    },
  };
}

export function buildAuditRecord(input: Omit<AuditRecord, 'kind' | 'time'>): AuditRecord {
  return { kind: 'audit', time: new Date().toISOString(), ...input };
}

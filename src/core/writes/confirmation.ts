/**
 * Confirmation references (spec FR-004, FR-005).
 *
 * The security boundary of every write. A reference is issued by prepare,
 * HMAC-signed with the per-process key, bound to organization + caller +
 * operation + target, expires 5 minutes after issue, and is single-use.
 *
 * A confirmation string composed by a model is structurally worthless here:
 * without the process's signing key it fails the integrity check before any
 * of its claims are read -- the same order of operations as cursors.
 *
 * Deliberately in-process. A stdio server is one long-lived process per client
 * session, so prepare and commit land in the same process by construction. A
 * restart invalidates outstanding references, which is CORRECT: a reference
 * must not outlive its preview's truth (research W3).
 */

import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { JisrMcpError } from '../errors.js';

const SIGNING_KEY = randomBytes(32);

/** 5 minutes, per clarification 2026-08-31. */
export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

export interface ConfirmationBinding {
  readonly organizationId: string;
  readonly principalRef: string;
  readonly operationId: string;
  /** Hash of the previewed payload or target record. */
  readonly targetHash: string;
}

interface ReferencePayload extends ConfirmationBinding {
  readonly nonce: string;
  readonly expiresAt: number;
}

/** Consumed nonces. Single-use is enforced here, not by expiry. */
const consumed = new Set<string>();

function sign(body: string): string {
  return createHmac('sha256', SIGNING_KEY).update(body).digest('base64url');
}

/** Stable hash of a preview payload, used as the target binding. */
export function hashTarget(target: unknown): string {
  const canonical = JSON.stringify(target, Object.keys(target as object).sort());
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 22);
}

export function issueReference(binding: ConfirmationBinding): {
  reference: string;
  expiresAt: string;
} {
  const payload: ReferencePayload = {
    ...binding,
    nonce: randomBytes(12).toString('base64url'),
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {
    reference: `${body}.${sign(body)}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

/**
 * Validates and CONSUMES a reference. Order matters: signature first, so a
 * forged reference is rejected before any claim inside it is read.
 */
export function consumeReference(reference: string, expected: ConfirmationBinding): void {
  const separator = reference.lastIndexOf('.');
  if (separator <= 0) {
    throw new JisrMcpError(
      'WRITE_CONFIRMATION_REQUIRED',
      'That is not a confirmation reference issued by this server.',
      'Call the prepare tool, review the preview, and confirm with the reference it returns.',
    );
  }

  const body = reference.slice(0, separator);
  const signature = Buffer.from(reference.slice(separator + 1), 'base64url');
  const expectedSignature = Buffer.from(sign(body), 'base64url');
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(signature, expectedSignature)
  ) {
    throw new JisrMcpError(
      'WRITE_CONFIRMATION_REQUIRED',
      'The confirmation reference failed its integrity check.',
      'Only the reference returned by the prepare tool is accepted. Prepare again.',
    );
  }

  let payload: ReferencePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ReferencePayload;
  } catch {
    throw new JisrMcpError(
      'WRITE_CONFIRMATION_REQUIRED',
      'The confirmation reference is malformed.',
    );
  }

  if (Date.now() > payload.expiresAt) {
    throw new JisrMcpError(
      'WRITE_PREPARATION_EXPIRED',
      'The confirmation reference has expired.',
      'Prepare again -- that re-validates everything and issues a fresh reference.',
    );
  }

  if (payload.organizationId !== expected.organizationId) {
    throw new JisrMcpError(
      'ORGANIZATION_MISMATCH',
      'That reference belongs to another organization.',
    );
  }
  if (
    payload.principalRef !== expected.principalRef ||
    payload.operationId !== expected.operationId
  ) {
    throw new JisrMcpError(
      'WRITE_CONFIRMATION_REQUIRED',
      'That reference was issued to a different caller or operation.',
      'References are bound to who prepared, and to what. Prepare again yourself.',
    );
  }
  if (payload.targetHash !== expected.targetHash) {
    throw new JisrMcpError(
      'WRITE_TARGET_CHANGED',
      'The target no longer matches what was previewed.',
      'Something changed between prepare and commit. Prepare again and review the fresh preview.',
    );
  }

  if (consumed.has(payload.nonce)) {
    throw new JisrMcpError(
      'WRITE_CONFIRMATION_REQUIRED',
      'That confirmation reference has already been used.',
      'References are single-use. Prepare again for a new write.',
    );
  }
  consumed.add(payload.nonce);
}

/** Test hook: clear consumption state between cases. */
export function resetConsumedReferences(): void {
  consumed.clear();
}

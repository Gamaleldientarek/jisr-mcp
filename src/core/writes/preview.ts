/**
 * Shared preview shape (spec FR-004). What prepare returns and a person
 * confirms. Never larger than the write it describes.
 */

export interface WritePreview<T> {
  readonly action: string;
  readonly target: T;
  readonly warnings: readonly string[];
  readonly confirmationReference: string;
  readonly expiresAt: string;
}

export function previewSummary(
  action: string,
  expiresAt: string,
  warnings: readonly string[],
): string {
  const parts = [
    `PREVIEW ONLY -- nothing has been written. ${action}.`,
    ...warnings,
    `To proceed, call the matching commit tool with the confirmation reference before ${expiresAt}. To abandon, do nothing.`,
  ];
  return parts.join(' ');
}

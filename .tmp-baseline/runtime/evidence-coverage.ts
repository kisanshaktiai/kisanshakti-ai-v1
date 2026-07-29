// Phase H — EVIDENCE COVERAGE (single source of truth)

export const INFORMATIVE_PLACEHOLDERS = new Set<string>([
  'CROP_IDENTIFIED',
  'STAGE_IDENTIFIED',
  'CONTEXT_AVAILABLE',
  'ACTION_NONE',
  'PHOTO_NOT_PROVIDED',
]);

const UNKNOWN_RE = /(_UNKNOWN$)/i;

export function isInformative(code: string): boolean {
  if (!code) return false;
  if (UNKNOWN_RE.test(code)) return false;
  if (INFORMATIVE_PLACEHOLDERS.has(code)) return false;
  return true;
}

export function computeCoverage(confirmed: ReadonlyArray<string>): number {
  const informative = confirmed.filter(isInformative);
  if (informative.length === 0) return 0;
  // Adaptive denominator: target between 4 (clear signal) and 8 (rich evidence)
  const denom = Math.max(4, Math.min(8, informative.length));
  return Math.min(1, informative.length / denom);
}

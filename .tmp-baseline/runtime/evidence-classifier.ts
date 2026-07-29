// EVIDENCE CLASSIFIER — Farmer-visible symptom vs metadata separator

const METADATA_RE = /(_UNKNOWN$|_NONE$|_NOT_PROVIDED$|^ACTION_|^CROP_IDENTIFIED$|^STAGE_IDENTIFIED$|^SEVERITY_|^CONTEXT_|^PHOTO_)/i;

export interface EvidenceClassification {
  raw_count: number;
  real_symptom_count: number;
  ignored_metadata_count: number;
  real_codes: string[];
  ignored_codes: string[];
}

export function isRealObservation(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = String(code).trim().toUpperCase();
  if (!c) return false;
  if (c === 'UNKNOWN' || c === 'NONE') return false;
  if (METADATA_RE.test(c)) return false;
  return true;
}

export function classifyEvidence(
  codes: ReadonlyArray<string | null | undefined>,
): EvidenceClassification {
  const seen = new Set<string>();
  const real: string[] = [];
  const ignored: string[] = [];

  for (const raw of codes) {
    if (raw == null) continue;
    const c = String(raw).trim().toUpperCase();
    if (!c) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    if (isRealObservation(c)) real.push(c);
    else ignored.push(c);
  }

  return {
    raw_count: seen.size,
    real_symptom_count: real.length,
    ignored_metadata_count: ignored.length,
    real_codes: real,
    ignored_codes: ignored,
  };
}

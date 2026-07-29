/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SessionSSOT — Single Source of Truth for the current turn
 * ───────────────────────────────────────────────────────────────────────────
 * CHANGE LOG (newest first)
 *   2026-07-28 05:00 UTC — FIX D1: added nullable `cultivation_method` to
 *     SessionSSOT (+input, freeze block, SSOT_ESTABLISHED log). Per-request
 *     lane from crop_schedules → BiologicalState; no module-scope state.
 *   2026-07-26 — Initial (R1). Built ONCE at Layer 3 (BIO_STATE_LOCKED /
 *     canonical-context + intent lock). Immutable (Object.frozen). Attached to
 *     the orchestrator instance (`_sessionSSOT`) and to
 *     `response.metadata.session_ssot`. Every downstream layer reads ONE
 *     source. NO agronomy encoded here — pure state plumbing.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type SessionSSOT = Readonly<{
  crop_code: string;         // canonical lowercase (e.g. "rice")
  growth_stage: string;      // canonical lowercase (e.g. "tillering")
  days_since_sowing: number; // integer >= 0
  intent_code: string;       // canonical UPPERCASE (e.g. "GROWTH_ANOMALY")
  language: string;          // ISO 639-1 lowercase (mr, hi, en)
  trace_id: string;
  land_id: string;
  session_id: string;
  established_at: string;    // ISO timestamp for audit
  // FIX D1 (2026-07-28): cultivation lane threaded per request from
  cultivation_method: string | null;
}>;

export interface SessionSSOTInput {
  crop_code: string | null | undefined;
  growth_stage: string | null | undefined;
  days_since_sowing: number | null | undefined;
  intent_code: string | null | undefined;
  language: string | null | undefined;
  trace_id: string;
  land_id: string;
  session_id: string;
  // FIX D1 (2026-07-28): per-request cultivation lane
  cultivation_method?: string | null;
}

// Build and freeze a SessionSSOT. Throws structured error if any required
export function buildSessionSSOT(input: SessionSSOTInput): SessionSSOT {
  const missing: string[] = [];
  if (!input.crop_code || String(input.crop_code).trim() === '') missing.push('crop_code');
  if (!input.growth_stage || String(input.growth_stage).trim() === '') missing.push('growth_stage');
  if (typeof input.days_since_sowing !== 'number' || !isFinite(input.days_since_sowing)) missing.push('days_since_sowing');
  if (!input.intent_code || String(input.intent_code).trim() === '') missing.push('intent_code');
  if (!input.language || String(input.language).trim() === '') missing.push('language');
  if (!input.trace_id) missing.push('trace_id');
  if (!input.land_id) missing.push('land_id');
  if (!input.session_id) missing.push('session_id');

  if (missing.length > 0) {
    throw new Error(`SSOT_BUILD_FAILED: missing fields [${missing.join(',')}] trace=${input.trace_id ?? 'n/a'}`);
  }

  const ssot: SessionSSOT = Object.freeze({
    crop_code: String(input.crop_code).trim().toLowerCase(),
    growth_stage: String(input.growth_stage).trim().toLowerCase(),
    days_since_sowing: Math.floor(input.days_since_sowing as number),
    intent_code: String(input.intent_code).trim().toUpperCase(),
    language: String(input.language).trim().toLowerCase(),
    trace_id: input.trace_id,
    land_id: input.land_id,
    session_id: input.session_id,
    established_at: new Date().toISOString(),
    // FIX D1 (2026-07-28): per-request cultivation lane (nullable = universal)
    cultivation_method: input.cultivation_method
      ? String(input.cultivation_method).trim().toLowerCase()
      : null,
  });

  console.log(
    `[SSOT_ESTABLISHED] trace=${ssot.trace_id} crop=${ssot.crop_code} stage=${ssot.growth_stage} ` +
    `das=${ssot.days_since_sowing} intent=${ssot.intent_code} language=${ssot.language} land_id=${ssot.land_id} cultivation=${ssot.cultivation_method ?? 'null'}`,
  );

  return ssot;
}

// Resolve the SessionSSOT for a given response, orchestrator state, or both.
export function getSessionSSOT(
  response: any,
  orchestratorState: any,
): SessionSSOT | null {
  const fromResponse = response?.metadata?.session_ssot;
  if (fromResponse && typeof fromResponse === 'object' && fromResponse.crop_code) return fromResponse as SessionSSOT;
  const fromOrch = orchestratorState?._sessionSSOT;
  if (fromOrch && typeof fromOrch === 'object' && fromOrch.crop_code) return fromOrch as SessionSSOT;
  return null;
}

// Hard assertion for downstream sites that CANNOT proceed without an SSOT.
export function assertSessionSSOT(ssot: SessionSSOT | null, siteHint: string): asserts ssot is SessionSSOT {
  if (!ssot) throw new Error(`SSOT_MISSING at ${siteHint}: no session_ssot on response or orchestrator state`);
  const missing: string[] = [];
  if (!ssot.crop_code) missing.push('crop_code');
  if (!ssot.growth_stage) missing.push('growth_stage');
  if (typeof ssot.days_since_sowing !== 'number') missing.push('days_since_sowing');
  if (!ssot.intent_code) missing.push('intent_code');
  if (!ssot.language) missing.push('language');
  if (missing.length > 0) throw new Error(`SSOT_INCOMPLETE at ${siteHint}: missing [${missing.join(',')}]`);
}

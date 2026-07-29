/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IOM GATE — Intent×Observation×Stage×DAS allowlist filter
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 *   2026-07-26 — F2/F3 audit: deleted the hardcoded `STAGE_SYNONYMS` agronomy
 *     map; stage families now come exclusively from `public.crop_stage_graph`
 *     via `utils/stage-knowledge-cache.ts::getStageFamilyFromDB`. All code
 *     normalization routed through `utils/canonical-code.ts`.
 *

 *
 * PURPOSE
 *   `intent_observation_mapping` (IOM) is the curated, agronomically valid
 *   set of observation codes for a given (intent, crop, stage, DAS) cell.
 *   It correctly maps GENERAL_CROP_INFO + rice + seedling + DAS≤21 to the
 *   three germination differentials and ZERO Tungro rows.
 *
 *   Historically, candidate/diagnosis assembly ignored IOM, so impossible
 *   diagnoses (e.g. Rice Tungro virus on an ungerminated crop) survived.
 *   This module is the single enforcement point that drops candidates and
 *   hypotheses whose observation_code is not in the IOM-allowed set.
 *
 * USAGE
 *   const { allowedSet, allowedRanked, traceMeta } =
 *     await loadIOMAllowed(supabase, intent, crop, stage, das);
 *   const safe = filterHypothesesByIOM(rawHypotheses, allowedSet, traceMeta);
 *   if (safe.length === 0 && allowedRanked.length > 0) {
 *     // surface allowedRanked as the differentials
 *   }
 *
 * NEVER FAIL OPEN. If the IOM lookup throws, the gate returns an empty
 * allowedSet and the caller decides whether to halt or surface "no
 * differentials"; it must not silently keep Tungro.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { canonicalObsCode, canonicalIntentCode, canonicalCropCode, canonicalStageKey } from '../utils/canonical-code.ts';
import { getStageFamilyFromDB } from '../utils/stage-knowledge-cache.ts';

export interface IOMAllowedRow {
  observation_code: string;
  confidence_rank: number;
  assertion_strength: string | null;
}

export interface IOMAllowedResult {
  /** Canonical lower_snake_case codes (matches observation_master). */
  allowedSet: Set<string>;
  allowedRanked: IOMAllowedRow[];   // rank-ordered, dedup'd
  traceMeta: {
    intent: string;
    crop: string;
    stage: string | null;
    das: number | null;
    rows: number;
    error?: string;
  };
}

/**
 * Stage family expansion — SSOT is `public.crop_stage_graph` via
 * `utils/stage-knowledge-cache.ts`.
 *
 * 2026-07-26 (forensic audit F2): the 13-entry hardcoded `STAGE_SYNONYMS`
 * map that lived here was DELETED. It was agronomy-in-TypeScript, it had
 * already been removed from `runtime/clarification-contract.ts` and
 * `runtime/stage-family-shim.ts`, and it fed a HARD SQL gate
 * (`.in('growth_stage', …)`) — any of the 16 curated IOM stage values that
 * were absent from the map collapsed the allowlist and dropped valid rows.
 *
 * On cache miss we degrade to `[stage, 'all']` and log
 * `[IOM_GATE_STAGE_MISS]`. We NEVER substitute a hardcoded family.
 */
function expandStageFamily(crop: string, stage?: string | null, cultivationMethod?: string | null): string[] {
  const key = canonicalStageKey(stage);
  if (!key) return ['all'];
  const fam = getStageFamilyFromDB(crop, key, cultivationMethod);
  if (!fam || fam.length === 0) {
    console.log(`[IOM_GATE_STAGE_MISS] crop=${crop} stage=${key} source=crop_stage_graph action=singleton_plus_all`);
    return Array.from(new Set([key, 'all']));
  }
  return Array.from(new Set([...fam.map((s) => canonicalStageKey(s)).filter(Boolean), key, 'all']));
}

/**
 * Load the IOM-allowed observation set for the given context.
 * Returns an empty allowedSet on any error — caller MUST NOT default to
 * "keep everything".
 */
export async function loadIOMAllowed(
  supabase: any,
  intentCode: string,
  cropCode: string,
  growthStage: string | null,
  das: number | null,
): Promise<IOMAllowedResult> {
  const intentUpper = canonicalIntentCode(intentCode);
  const cropLower = canonicalCropCode(cropCode);
  const cropVariants = Array.from(new Set([cropLower, 'all', 'universal'].filter(Boolean)));
  const stageVariants = expandStageFamily(cropLower, growthStage);


  const meta: IOMAllowedResult['traceMeta'] = {
    intent: intentUpper,
    crop: cropLower,
    stage: growthStage,
    das,
    rows: 0,
  };

  if (!intentUpper) {
    meta.error = 'missing_intent';
    console.warn('[IOM_GATE] missing intent — returning empty allowlist', meta);
    return { allowedSet: new Set(), allowedRanked: [], traceMeta: meta };
  }

  try {
    // PR-8 · Paginate the intent_observation_mapping query. PostgREST caps a
    // single .select() at 1000 rows; a truncated allowlist silently drops
    // valid observation codes and biases the decision graph. Loop with
    // .range() until an incomplete page arrives.
    const PAGE_SIZE = 1000;
    const rows: any[] = [];
    for (let page = 0; page < 20; page++) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('intent_observation_mapping')
        .select('observation_code, confidence_rank, assertion_strength, das_min, das_max')
        .eq('is_active', true)
        .eq('intent_code', intentUpper)
        .in('crop_code', cropVariants)
        .in('growth_stage', stageVariants)
        .order('confidence_rank', { ascending: true })
        .range(from, to);
      if (error) throw error;
      const batch = Array.isArray(data) ? data : [];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }


    // DAS gate (in-memory; PostgREST doesn't accept null-aware lte/gte cleanly)
    const dasFiltered = rows.filter((r: any) => {
      if (das == null || !isFinite(das)) return true;
      const lo = typeof r.das_min === 'number' ? r.das_min : 0;
      const hi = typeof r.das_max === 'number' ? r.das_max : 9999;
      return das >= lo && das <= hi;
    });

    // Dedupe by canonical observation_code, keep lowest (best) confidence_rank
    const byCode = new Map<string, IOMAllowedRow>();
    for (const r of dasFiltered) {
      const code = canonicalObsCode(r.observation_code);
      if (!code) continue;
      const prev = byCode.get(code);
      const rank = typeof r.confidence_rank === 'number' ? r.confidence_rank : 99;
      if (!prev || rank < prev.confidence_rank) {
        byCode.set(code, {
          observation_code: code,
          confidence_rank: rank,
          assertion_strength: r.assertion_strength ?? null,
        });
      }
    }

    const allowedRanked = Array.from(byCode.values()).sort(
      (a, b) => a.confidence_rank - b.confidence_rank,
    );
    // Canonical lower_snake_case (SSOT: utils/canonical-code.ts).
    const allowedSet = new Set(allowedRanked.map((r) => r.observation_code));


    meta.rows = allowedRanked.length;

    console.log(
      `[IOM_GATE] intent=${intentUpper} crop=${cropLower} stage=${growthStage} ` +
        `das=${das} → ${allowedRanked.length} allowed (raw=${rows.length}, das_filtered=${dasFiltered.length})`,
    );
    if (allowedRanked.length > 0) {
      console.log(
        `[IOM_GATE]   allowed=${allowedRanked.slice(0, 8).map((r) => r.observation_code).join(',')}`,
      );
    }

    return { allowedSet, allowedRanked, traceMeta: meta };
  } catch (e) {
    meta.error = e instanceof Error ? e.message : String(e);
    console.error('[IOM_GATE] load failed — returning empty allowlist (no fail-open)', meta);
    return { allowedSet: new Set(), allowedRanked: [], traceMeta: meta };
  }
}

/**
 * Filter a list of candidate hypotheses to keep only those that have at
 * least one observable_characteristic whose observation_key is in the
 * IOM-allowed set. Returns the kept list and a list of dropped causes for
 * tracing.
 *
 * If `allowedSet` is empty (e.g. IOM lookup failed or no curated rows for
 * this cell), this function returns the input unchanged — the caller is
 * responsible for halting or applying additional safety filters. We never
 * drop everything on an empty allowlist because that would crash genuine
 * diagnosis flows where no IOM row exists yet.
 */
/**
 * AUDIT-ONLY hypothesis IOM check.
 *
 * Architecture invariant (2026-07-08):
 *   `intent_observation_mapping` is the OBSERVATION discovery layer — it
 *   answers "what observations should we collect for this intent?", NOT
 *   "which hypotheses are valid". Hypothesis authority comes from
 *   `hypothesis_conditions` + `hypothesis_master`. Killing hypotheses that
 *   already survived the DB graph just because their surface observation
 *   labels are absent from an IOM cell corrupts the neuro-symbolic pipeline
 *   (OBS → HYP → RULE → DECISION).
 *
 * This function no longer removes hypotheses. It emits an [IOM_AUDIT] trace
 * for observability and always returns the input list unchanged, with any
 * non-overlapping candidates reported in `dropped` so downstream code can
 * still surface them for curation review.
 */
export function filterHypothesesByIOM<
  T extends {
    cause?: string;
    canonical_group?: string;
    observable_characteristics?: Array<{ observation_key?: string }> | null;
  }
>(
  hypotheses: T[],
  allowedSet: Set<string>,
  traceMeta?: IOMAllowedResult['traceMeta'],
): { kept: T[]; dropped: Array<{ cause: string; keys: string[] }> } {
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
    return { kept: [], dropped: [] };
  }
  if (!allowedSet || allowedSet.size === 0) {
    return { kept: hypotheses, dropped: [] };
  }

  const outside: Array<{ cause: string; keys: string[] }> = [];
  for (const h of hypotheses) {
    const keys = (h.observable_characteristics || [])
      .map((o) => canonicalObsCode(o?.observation_key))
      .filter(Boolean);

    const hit = keys.some((k) => allowedSet.has(k));
    if (!hit) outside.push({ cause: String(h.cause || h.canonical_group || 'unknown'), keys });
  }

  if (outside.length > 0) {
    console.log(
      `[IOM_AUDIT] ${outside.length}/${hypotheses.length} surviving hypotheses have no observable_characteristic in the IOM cell ` +
        `(intent=${traceMeta?.intent} crop=${traceMeta?.crop} stage=${traceMeta?.stage}) — kept for hypothesis-authority reasoning`,
    );
    for (const d of outside.slice(0, 6)) {
      console.log(`[IOM_AUDIT]   ~ ${d.cause} (keys=${d.keys.slice(0, 4).join(',') || 'none'})`);
    }
  }

  return { kept: hypotheses, dropped: outside };
}


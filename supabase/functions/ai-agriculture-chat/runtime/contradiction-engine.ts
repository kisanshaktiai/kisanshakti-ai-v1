/**
 * CHANGE LOG
 * 2026-07-29 10:55 UTC — FIX C1-b: stagesEquivalent checks resolve within the request-scoped cultivation lane bound by the orchestrator.
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRADICTION ENGINE — v3 pre-navigation guard
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Detects contradictions between the farmer's current utterance and the
 * frozen canonical context BEFORE any hypothesis activation or clarification
 * generation. Halts the brain with a deterministic reconciliation prompt
 * (rendered by orchestrator) instead of synthesizing symptoms.
 *
 * Reads the per-assertion compatibility envelope from
 * `intent_assertion_pattern` — `stage_compatibility`, `crop_compatibility`,
 * `das_min`, `das_max` — and raises STAGE_MISMATCH / CROP_MISMATCH /
 * DAS_OUT_OF_RANGE when the frozen context falls outside it. Stage equivalence
 * is resolved through the DB-backed `crop_stage_graph` (via `stagesEquivalent`),
 * NOT a hardcoded stage map. When a compatibility field is NULL/empty the
 * corresponding check is skipped (fail-open) — the DB is the sole authority for
 * what an assertion is compatible with, so no agronomy is hardcoded here.
 * BIOLOGICAL_IMPOSSIBILITY is the one crop-agnostic, code-level guard.
 *
 * NO DB writes. ONE indexed read.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type ContradictionKind =
  | 'STAGE_MISMATCH'
  | 'CROP_MISMATCH'
  | 'DAS_OUT_OF_RANGE'
  | 'BIOLOGICAL_IMPOSSIBILITY';

export interface Contradiction {
  readonly kind: ContradictionKind;
  readonly assertion: string;            // canonical intent / assertion code
  readonly assertion_label?: string;     // human-readable for the prompt
  readonly context_field: 'crop_code' | 'growth_stage' | 'days_since_sowing';
  readonly context_value: string | number | null;
  readonly expected: readonly (string | number)[];
  readonly reason: string;
}

export interface ContradictionInput {
  supabase: any;
  intent_code: string;
  crop_code: string;
  growth_stage: string;
  das?: number | null;
  trace_id?: string;
  /** Confirmed observation codes for this turn (any casing). Enables
   *  BIOLOGICAL_IMPOSSIBILITY detection (e.g. NO_GERMINATION at TILLERING). */
  observations?: readonly string[];
}

// ─── BIOLOGICAL_IMPOSSIBILITY: observation ↔ stage incompatibilities ──────
interface StageIncompat {
  readonly obs_pattern: RegExp;               // matches farmer observation code
  readonly incompat_stages: readonly string[]; // stage families that make obs impossible
  readonly label: string;
}
const OBSERVATION_STAGE_INCOMPATIBILITIES: readonly StageIncompat[] = Object.freeze([
  {
    obs_pattern: /(NO_GERMINATION|GERMINATION_FAILURE|POOR_GERMINATION|NOT_GERMINATED|SEED_NOT_EMERGED|EMERGENCE_FAILURE)/,
    incompat_stages: ['tillering', 'vegetative', 'grand_growth', 'flowering', 'reproductive', 'maturity', 'ripening', 'maturation', 'harvest'],
    label: 'germination_failure_asserted_at_advanced_stage',
  },
  {
    obs_pattern: /(SEEDLING_STAGE|NURSERY_STAGE)/,
    incompat_stages: ['flowering', 'reproductive', 'maturity', 'ripening', 'harvest'],
    label: 'seedling_asserted_at_reproductive_stage',
  },
  {
    obs_pattern: /(HARVEST_READY|GRAIN_MATURE|CROP_MATURE)/,
    incompat_stages: ['germination', 'nursery', 'seedling', 'emergence', 'establishment'],
    label: 'maturity_asserted_at_germination_stage',
  },
  {
    obs_pattern: /(FLOWERING|PANICLE_EMERGED|BOOTING)/,
    incompat_stages: ['germination', 'nursery', 'seedling', 'emergence', 'establishment'],
    label: 'reproductive_asserted_at_germination_stage',
  },
]);

// [GRAPH_TRUTH_PENDING] Step 6 — stage equivalence collapsed to a single
import { stagesEquivalent } from './stage-family-shim.ts';

const norm = (s: unknown): string =>
  String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

// Returns the first contradiction found, or null if context and utterance
export async function detectContradiction(
  input: ContradictionInput,
): Promise<Contradiction | null> {
  const { supabase, intent_code, crop_code, growth_stage, das, trace_id, observations } = input;
  const intentUpper = String(intent_code || '').trim().toUpperCase();
  const cropLower   = norm(crop_code);
  const stageLower  = norm(growth_stage);

  // ─── BIOLOGICAL_IMPOSSIBILITY: crop-agnostic observation ↔ stage check ─
  if (stageLower && Array.isArray(observations) && observations.length > 0) {
    const obsUpper = observations.map(o => String(o || '').trim().toUpperCase()).filter(Boolean);
    for (const rule of OBSERVATION_STAGE_INCOMPATIBILITIES) {
      const hitObs = obsUpper.find(o => rule.obs_pattern.test(o));
      if (!hitObs) continue;
      const incompat = rule.incompat_stages.some(s => stagesEquivalent(s, stageLower, cropLower));
      if (!incompat) continue;
      const c: Contradiction = Object.freeze({
        kind: 'BIOLOGICAL_IMPOSSIBILITY',
        assertion: hitObs,
        assertion_label: rule.label,
        context_field: 'growth_stage',
        context_value: stageLower,
        expected: Object.freeze([]),
        reason: `observation ${hitObs} is biologically impossible when growth_stage=${stageLower}`,
      });
      console.log(
        `[BIOLOGICAL_CONTRADICTION]${trace_id ? '[' + trace_id + ']' : ''} ` +
        `obs=${hitObs} stage=${stageLower} label=${rule.label} → routing to clarification`,
      );
      return c;
    }
  }

  if (!intentUpper || !cropLower || !stageLower || !supabase) return null;

  try {
    // Full compatibility envelope. stage_compatibility / crop_compatibility are
    // text[] and das_min/das_max integer (added 2026-08-02); NULL/empty ⇒ the
    // matching contradiction check is skipped downstream.
    const { data, error } = await supabase
      .from('intent_assertion_pattern')
      .select('intent_code, assertion_strength, notes, obs_code_regex, stage_compatibility, crop_compatibility, das_min, das_max')
      .eq('is_active', true)
      .eq('intent_code', intentUpper)
      .limit(5);

    if (error) {
      console.warn(`[CONTRADICTION_ENGINE] lookup error: ${error.message}`);
      return null;
    }
    if (!data || data.length === 0) return null;


    for (const row of data) {
      // obs_code_regex PRECISION GATE — an assertion row may be scoped to the
      // specific farmer observation(s) that evidence it. When the row carries a
      // regex AND the turn supplied observations, only apply this row if at
      // least one observation matches; otherwise this assertion is not in play
      // this turn. When there is no regex, or no observations, the assertion is
      // intent-level and applies as before (default behaviour unchanged).
      const obsRegexRaw = typeof (row as any).obs_code_regex === 'string'
        ? (row as any).obs_code_regex.trim()
        : '';
      if (obsRegexRaw && Array.isArray(observations) && observations.length > 0) {
        let re: RegExp | null = null;
        try { re = new RegExp(obsRegexRaw, 'i'); } catch { re = null; }
        if (re && !observations.some(o => re!.test(String(o || '')))) {
          continue; // assertion not evidenced by this turn's observations
        }
      }

      // STAGE_MISMATCH
      const allowedStages: string[] = Array.isArray((row as any).stage_compatibility)
        ? (row as any).stage_compatibility.map(norm).filter(Boolean)
        : [];
      if (allowedStages.length > 0) {
        const ok = allowedStages.some(s => stagesEquivalent(s, stageLower, cropLower) || s === 'all');
        if (!ok) {
          const c: Contradiction = Object.freeze({
            kind: 'STAGE_MISMATCH',
            assertion: intentUpper,
            assertion_label: row.notes || row.assertion_strength || undefined,
            context_field: 'growth_stage',
            context_value: stageLower,
            expected: Object.freeze([...allowedStages]),
            reason: `assertion ${intentUpper} incompatible with growth_stage=${stageLower}`,
          });
          console.log(`[CONTRADICTION_ENGINE]${trace_id ? '[' + trace_id + ']' : ''} STAGE_MISMATCH intent=${intentUpper} stage=${stageLower} expected=[${allowedStages.join(',')}]`);
          return c;
        }
      }

      // CROP_MISMATCH
      const allowedCrops: string[] = Array.isArray((row as any).crop_compatibility)
        ? (row as any).crop_compatibility.map(norm).filter(Boolean)
        : [];
      if (allowedCrops.length > 0) {
        const ok = allowedCrops.some(c => c === cropLower || c === 'all');
        if (!ok) {
          return Object.freeze({
            kind: 'CROP_MISMATCH',
            assertion: intentUpper,
            assertion_label: row.notes || row.assertion_strength || undefined,
            context_field: 'crop_code',
            context_value: cropLower,
            expected: Object.freeze([...allowedCrops]),
            reason: `assertion ${intentUpper} incompatible with crop=${cropLower}`,
          });
        }
      }

      // DAS_OUT_OF_RANGE
      if (typeof das === 'number' && isFinite(das)) {
        const lo = typeof (row as any).das_min === 'number' ? (row as any).das_min : null;
        const hi = typeof (row as any).das_max === 'number' ? (row as any).das_max : null;
        if ((lo != null && das < lo) || (hi != null && das > hi)) {
          return Object.freeze({
            kind: 'DAS_OUT_OF_RANGE',
            assertion: intentUpper,
            assertion_label: row.notes || row.assertion_strength || undefined,
            context_field: 'days_since_sowing',
            context_value: das,
            expected: Object.freeze([lo ?? 0, hi ?? 9999]),
            reason: `assertion ${intentUpper} expects DAS in [${lo},${hi}] but got ${das}`,
          });
        }
      }
    }
    return null;
  } catch (e) {
    console.warn(`[CONTRADICTION_ENGINE] exception:`, (e as Error)?.message);
    return null;
  }
}

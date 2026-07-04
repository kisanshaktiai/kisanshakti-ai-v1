/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRADICTION ENGINE — v3 pre-navigation guard
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Detects contradictions between the farmer's current utterance and the
 * frozen canonical context BEFORE any hypothesis activation or clarification
 * generation. Halts the brain with a deterministic reconciliation prompt
 * (rendered by orchestrator) instead of synthesizing symptoms.
 *
 * Reads `intent_assertion_pattern.stage_compatibility` if present;
 * otherwise applies built-in stage-family logic mirroring
 * `clarification-contract.STAGE_SYNONYMS`.
 *
 * NO DB writes. ONE indexed `.in()` read.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type ContradictionKind =
  | 'STAGE_MISMATCH'
  | 'CROP_MISMATCH'
  | 'DAS_OUT_OF_RANGE';

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
}

// Stage families — biologically equivalent stages, mirrors clarification-contract.
const STAGE_FAMILIES: Record<string, string[]> = {
  seedling:     ['seedling', 'nursery', 'germination', 'emergence', 'establishment'],
  nursery:      ['nursery', 'seedling', 'germination'],
  germination:  ['germination', 'nursery', 'seedling', 'emergence'],
  emergence:    ['emergence', 'germination', 'seedling', 'nursery'],
  establishment:['establishment', 'seedling', 'germination'],
  vegetative:   ['vegetative', 'tillering'],
  tillering:    ['tillering', 'vegetative'],
  flowering:    ['flowering', 'reproductive', 'grand_growth'],
  reproductive: ['reproductive', 'flowering', 'grand_growth'],
  grand_growth: ['grand_growth', 'flowering', 'reproductive'],
  maturity:     ['maturity', 'ripening', 'maturation'],
  ripening:     ['ripening', 'maturity', 'maturation'],
  maturation:   ['maturation', 'maturity', 'ripening'],
  harvest:      ['harvest', 'harvesting'],
};

const norm = (s: unknown): string =>
  String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function stagesEquivalent(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return true; // unknown → cannot contradict
  if (x === y) return true;
  const fam = STAGE_FAMILIES[x];
  if (fam && fam.includes(y)) return true;
  const fam2 = STAGE_FAMILIES[y];
  if (fam2 && fam2.includes(x)) return true;
  return false;
}

/**
 * Returns the first contradiction found, or null if context and utterance
 * are consistent. Currently checks STAGE_MISMATCH only; CROP_MISMATCH and
 * DAS_OUT_OF_RANGE wired but rely on DB columns added later.
 */
export async function detectContradiction(
  input: ContradictionInput,
): Promise<Contradiction | null> {
  const { supabase, intent_code, crop_code, growth_stage, das, trace_id } = input;
  const intentUpper = String(intent_code || '').trim().toUpperCase();
  const cropLower   = norm(crop_code);
  const stageLower  = norm(growth_stage);

  if (!intentUpper || !cropLower || !stageLower || !supabase) return null;

  try {
    // intent_assertion_pattern schema (as of 2026-07-04):
    //   id, intent_code, obs_code_regex, assertion_strength, notes, is_active, ...
    // Compatibility columns (stage_compatibility, crop_compatibility, das_min/max)
    // are NOT present on this table — treat them as absent and rely on
    // assertion_strength + notes for labelling. Selecting only real columns
    // stops the "column ... does not exist" error that silently disabled the
    // contradiction engine on every request.
    const { data, error } = await supabase
      .from('intent_assertion_pattern')
      .select('intent_code, assertion_strength, notes, obs_code_regex')
      .eq('is_active', true)
      .eq('intent_code', intentUpper)
      .limit(5);

    if (error) {
      console.warn(`[CONTRADICTION_ENGINE] lookup error: ${error.message}`);
      return null;
    }
    if (!data || data.length === 0) return null;


    for (const row of data) {
      // STAGE_MISMATCH
      const allowedStages: string[] = Array.isArray((row as any).stage_compatibility)
        ? (row as any).stage_compatibility.map(norm).filter(Boolean)
        : [];
      if (allowedStages.length > 0) {
        const ok = allowedStages.some(s => stagesEquivalent(s, stageLower) || s === 'all');
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

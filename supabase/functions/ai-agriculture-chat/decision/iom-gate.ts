/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IOM GATE — Intent×Observation×Stage×DAS allowlist filter
 * ═══════════════════════════════════════════════════════════════════════════
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

export interface IOMAllowedRow {
  observation_code: string;
  confidence_rank: number;
  assertion_strength: string | null;
}

export interface IOMAllowedResult {
  allowedSet: Set<string>;          // UPPERCASE codes for case-insensitive lookup
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

// Stage synonyms — pass biologically equivalent stages so we don't drop
// curated rows (e.g. SEEDLING matches nursery / germination / emergence).
const STAGE_SYNONYMS: Record<string, string[]> = {
  seedling:     ['seedling', 'nursery', 'germination', 'emergence'],
  nursery:      ['nursery', 'seedling', 'germination'],
  germination:  ['germination', 'nursery', 'seedling', 'emergence'],
  emergence:    ['emergence', 'germination', 'seedling', 'nursery'],
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

function expandStageSynonyms(stage?: string | null): string[] {
  if (!stage) return ['all'];
  const key = String(stage).toLowerCase().trim().replace(/[\s-]/g, '_');
  const syn = STAGE_SYNONYMS[key] || [key];
  return Array.from(new Set([...syn, 'all']));
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
  const intentUpper = String(intentCode || '').trim().toUpperCase();
  const cropLower = String(cropCode || '').toLowerCase();
  const cropVariants = Array.from(new Set([cropLower, 'all', 'universal'].filter(Boolean)));
  const stageVariants = expandStageSynonyms(growthStage);

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
    const { data, error } = await supabase
      .from('intent_observation_mapping')
      .select('observation_code, confidence_rank, assertion_strength, das_min, das_max')
      .eq('is_active', true)
      .eq('intent_code', intentUpper)
      .in('crop_code', cropVariants)
      .in('growth_stage', stageVariants)
      .order('confidence_rank', { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];

    // DAS gate (in-memory; PostgREST doesn't accept null-aware lte/gte cleanly)
    const dasFiltered = rows.filter((r: any) => {
      if (das == null || !isFinite(das)) return true;
      const lo = typeof r.das_min === 'number' ? r.das_min : 0;
      const hi = typeof r.das_max === 'number' ? r.das_max : 9999;
      return das >= lo && das <= hi;
    });

    // Dedupe by observation_code, keep lowest (best) confidence_rank
    const byCode = new Map<string, IOMAllowedRow>();
    for (const r of dasFiltered) {
      const code = String(r.observation_code || '').trim();
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
    const allowedSet = new Set(allowedRanked.map((r) => r.observation_code.toUpperCase()));

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
    console.warn(
      `[IOM_GATE] empty allowlist for ${traceMeta?.intent}/${traceMeta?.crop}/${traceMeta?.stage} — keeping all ${hypotheses.length} hypotheses (no fail-closed drop)`,
    );
    return { kept: hypotheses, dropped: [] };
  }

  const kept: T[] = [];
  const dropped: Array<{ cause: string; keys: string[] }> = [];

  for (const h of hypotheses) {
    const keys = (h.observable_characteristics || [])
      .map((o) => String(o?.observation_key || '').toUpperCase())
      .filter(Boolean);
    const hit = keys.some((k) => allowedSet.has(k));
    if (hit) {
      kept.push(h);
    } else {
      dropped.push({ cause: String(h.cause || h.canonical_group || 'unknown'), keys });
    }
  }

  if (dropped.length > 0) {
    console.log(
      `[IOM_GATE] dropped ${dropped.length}/${hypotheses.length} hypotheses not in IOM allowlist:`,
    );
    for (const d of dropped.slice(0, 6)) {
      console.log(`[IOM_GATE]   ✗ ${d.cause} (keys=${d.keys.slice(0, 4).join(',') || 'none'})`);
    }
  }
  if (kept.length > 0) {
    console.log(`[IOM_GATE] kept ${kept.length} hypotheses passing IOM gate`);
  }

  return { kept, dropped };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHENOLOGY RECONCILER — Runtime GDD vs DAS stage adjudication
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs BEFORE buildBiologicalState() locks the invariant.
 * Generic, crop-agnostic. No hardcoded rules. No DB writes.
 *
 * Confidence hierarchy (highest wins):
 *   1. morphological_evidence         → 0.95
 *   2. completed_stage_transitions    → 0.90
 *   3. variety_phenology_profile      → 0.85
 *   4. gdd_model                      → 0.80..0.90 (freshness-scaled)
 *   5. crop_stage_master DAS window   → 0.70
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 *   2026-07-12 UTC — v7: NULL cultivation_method rows are excluded from GDD
 *     stage candidates (data-quality issue, mirrors SQL resolver). Only
 *     exact method match or explicit 'any' qualify. Rank order preserved:
 *     exact > 'any'.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface PhenologyCandidate {
  growth_stage: string | null;
  stage_code: string | null;
  stage_uuid: string | null;
  source: string;
  confidence: number;
}

export interface ReconciliationResult {
  winner: PhenologyCandidate;
  das_stage: string | null;
  gdd_stage: string | null;
  reason: string;
  changed: boolean;
}

export async function reconcilePhenology(
  supabase: any,
  args: {
    landId: string;
    cropCode: string | null | undefined;
    das: number | null | undefined;
    phenologyRow: any | null;
  },
): Promise<ReconciliationResult | null> {
  const { landId, cropCode, das, phenologyRow } = args;

  if (!phenologyRow || !cropCode) return null;

  const dasCandidate: PhenologyCandidate = {
    growth_stage: phenologyRow.growth_stage ?? null,
    stage_code: phenologyRow.stage_code ?? null,
    stage_uuid: phenologyRow.stage_uuid ?? null,
    source: phenologyRow.source ?? 'crop_stage_master',
    confidence: typeof phenologyRow.confidence === 'number' ? phenologyRow.confidence : 0.70,
  };

  const candidates: PhenologyCandidate[] = [dasCandidate];

  // ── Candidate: GDD model ───────────────────────────────────────────────
  let gddCandidate: PhenologyCandidate | null = null;
  try {
    // Latest GDD accumulated for this land
    const { data: gddRows } = await supabase
      .from('land_gdd_daily')
      .select('gdd_accumulated, gdd_date')
      .eq('land_id', landId)
      .order('gdd_date', { ascending: false })
      .limit(1);

    const latestGdd =
      gddRows && gddRows.length > 0 && typeof gddRows[0].gdd_accumulated === 'number'
        ? Number(gddRows[0].gdd_accumulated)
        : (typeof phenologyRow.gdd_accumulated === 'number' ? Number(phenologyRow.gdd_accumulated) : null);

    if (latestGdd !== null && latestGdd >= 0) {
      // v6 — scope GDD-window lookup by cultivation_method so the reconciler
      // never crosses biological lanes (e.g. DSR vs transplanted rice).
      const method = (phenologyRow as any)?.cultivation_method
        ? String((phenologyRow as any).cultivation_method).toLowerCase()
        : null;

      let stagesQ = supabase
        .from('crop_stage_master')
        .select('growth_stage, stage_code, id, gdd_min, gdd_max, das_min, das_max, cultivation_method')
        .eq('crop_code', cropCode)
        .eq('is_active', true);
      if (method) {
        // v7 — NULL cultivation_method is a data-quality issue and never matches.
        stagesQ = stagesQ.or(
          `cultivation_method.eq.any,cultivation_method.eq.${method}`,
        );
      }
      const { data: stages } = await stagesQ;

      if (Array.isArray(stages) && stages.length > 0) {
        // Rank: exact method match > 'any' (NULL excluded at query time).
        const rank = (r: any) => {
          const m = r?.cultivation_method ? String(r.cultivation_method).toLowerCase() : null;
          if (method && m === method) return 0;
          if (m === 'any') return 1;
          return 2;
        };
        const hits = stages
          .filter(
            (s: any) =>
              s.cultivation_method != null &&
              s.gdd_min !== null &&
              s.gdd_max !== null &&
              latestGdd >= Number(s.gdd_min) &&
              latestGdd <= Number(s.gdd_max),
          )
          .sort((a: any, b: any) => rank(a) - rank(b));
        const hit = hits[0];
        if (hit) {
          // Freshness: prefer 0.90; if we had to fall back to phenologyRow.gdd_accumulated, use 0.80.
          const freshness = gddRows && gddRows.length > 0 ? 0.90 : 0.80;
          gddCandidate = {
            growth_stage: hit.growth_stage ?? null,
            stage_code: hit.stage_code ?? null,
            stage_uuid: hit.id ?? null,
            source: 'gdd_model',
            confidence: freshness,
          };
          candidates.push(gddCandidate);
        }
      }
    }

  } catch (_e) {
    // GDD path optional — never fail reconciliation.
  }

  // ── Candidate: completed stage transitions ─────────────────────────────
  try {
    const { data: transitions } = await supabase
      .from('stage_transition_log')
      .select('to_stage_code, to_stage_uuid, transition_date')
      .eq('land_id', landId)
      .order('transition_date', { ascending: false })
      .limit(1);
    if (Array.isArray(transitions) && transitions.length > 0) {
      const t = transitions[0];
      if (t.to_stage_code) {
        candidates.push({
          growth_stage: t.to_stage_code,
          stage_code: t.to_stage_code,
          stage_uuid: t.to_stage_uuid ?? null,
          source: 'completed_stage_transitions',
          confidence: 0.90,
        });
      }
    }
  } catch (_e) {
    // Optional signal.
  }

  // Pick highest-confidence candidate.
  const winner = candidates.reduce((best, c) => (c.confidence > best.confidence ? c : best), dasCandidate);
  const changed =
    (winner.growth_stage ?? '') !== (dasCandidate.growth_stage ?? '') ||
    winner.source !== dasCandidate.source;

  const reason = changed
    ? `${winner.source}_conf=${winner.confidence.toFixed(2)}_beats_${dasCandidate.source}_conf=${dasCandidate.confidence.toFixed(2)}`
    : (candidates.length === 1 ? 'only_das_available' : 'das_still_highest_confidence');

  return {
    winner,
    das_stage: dasCandidate.growth_stage,
    gdd_stage: gddCandidate?.growth_stage ?? null,
    reason,
    changed,
  };
}

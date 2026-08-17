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
 *   2026-07-29 UTC — v8: DAS demoted to provisional. Fixed stage_transition_log
 *     tier (was querying non-existent to_stage_code/transition_date; now
 *     to_stage_uuid/evaluated_at joined to crop_stage_master, with das/dat
 *     triggers capped at 0.5). Added morphological_evidence tier sourced from
 *     crop_growth_analysis.detected_growth_stage (0.95, lane-scoped).
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
    /** v9 — anchor for das_reference='transplanting' stage windows. */
    transplantDate?: string | null;
  },
): Promise<ReconciliationResult | null> {
  const { landId, cropCode, das, phenologyRow, transplantDate } = args;

  if (!phenologyRow || !cropCode) return null;

  // ── v9 — DAT anchor (whole days since transplanting). Null when unknown. ──
  const dat: number | null = (() => {
    if (!transplantDate) return null;
    const t = new Date(transplantDate as string);
    if (Number.isNaN(t.getTime())) return null;
    const ms = Date.now() - t.getTime();
    return Math.floor(ms / 86400000);
  })();

  /** Which calendar anchor a crop_stage_master row's DAS window must use. */
  const anchorFor = (row: any): 'das' | 'dat' =>
    String(row?.das_reference ?? '').toLowerCase() === 'transplanting' ? 'dat' : 'das';

  /** Transplant-anchored rows are ineligible when no transplant date exists. */
  const rowEligible = (row: any): boolean => anchorFor(row) === 'das' || dat !== null;

  const anchorValue = (row: any): number | null => (anchorFor(row) === 'dat' ? dat : (das ?? null));

  const anchorLog: string[] = [];

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
        .select('growth_stage, stage_code, id, gdd_min, gdd_max, das_min, das_max, das_reference, cultivation_method')
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
              // v9 — transplant-anchored windows need a transplant date.
              rowEligible(s) &&
              s.gdd_min !== null &&
              s.gdd_max !== null &&
              latestGdd >= Number(s.gdd_min) &&
              latestGdd <= Number(s.gdd_max) &&
              // v9 — honor das_reference: match the row's calendar window
              // against DAT for transplanting-anchored rows, DAS otherwise.
              (() => {
                const lo = s.das_min, hi = s.das_max;
                if (lo === null || hi === null) return true;
                const v = anchorValue(s);
                if (v === null) return true;
                return v >= Number(lo) && v <= Number(hi);
              })(),
          )
          .sort((a: any, b: any) => rank(a) - rank(b));
        const hit = hits[0];
        if (hit) {
          // Freshness: prefer 0.90; if we had to fall back to phenologyRow.gdd_accumulated, use 0.80.
          const freshness = gddRows && gddRows.length > 0 ? 0.90 : 0.80;
          anchorLog.push(
            `gdd_model:anchor=${anchorFor(hit)}` +
            `(${anchorFor(hit) === 'dat' ? `dat=${dat}` : `das=${das ?? 'null'}`})`,
          );
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

  // ── Candidate: completed stage transitions (biological ledger) ─────────
  try {
    const { data: transitions } = await supabase
      .from('stage_transition_log')
      .select('to_stage_uuid, trigger_type, confidence, evaluated_at')
      .eq('land_id', landId)
      .not('to_stage_uuid', 'is', null)
      .order('evaluated_at', { ascending: false })
      .limit(1);
    if (Array.isArray(transitions) && transitions.length > 0) {
      const t = transitions[0];
      const { data: stageRow } = await supabase
        .from('crop_stage_master')
        .select('growth_stage, stage_code, id')
        .eq('id', t.to_stage_uuid)
        .maybeSingle();
      if (stageRow) {
        const isCalendarTrigger =
          typeof t.trigger_type === 'string' &&
          ['das', 'dat'].includes(String(t.trigger_type).toLowerCase());
        candidates.push({
          growth_stage: stageRow.growth_stage ?? null,
          stage_code: stageRow.stage_code ?? null,
          stage_uuid: stageRow.id ?? null,
          source: 'completed_stage_transitions',
          confidence: isCalendarTrigger
            ? Math.min(0.5, Number(t.confidence ?? 0.5))
            : Math.max(0.90, Number(t.confidence ?? 0.90)),
        });
      }
    }
  } catch (_e) {
    // Optional signal.
  }

  // ── Candidate: morphological field evidence (highest authority) ────────
  try {
    const { data: growthRows } = await supabase
      .from('crop_growth_analysis')
      .select('detected_growth_stage, confidence_score, created_at')
      .eq('land_id', landId)
      .not('detected_growth_stage', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const detected = growthRows?.[0]?.detected_growth_stage
      ? String(growthRows[0].detected_growth_stage).trim().toLowerCase()
      : null;

    if (detected) {
      const method = (phenologyRow as any)?.cultivation_method
        ? String((phenologyRow as any).cultivation_method).toLowerCase()
        : null;
      let morphQ = supabase
        .from('crop_stage_master')
        .select('growth_stage, stage_code, id, cultivation_method')
        .eq('crop_code', cropCode)
        .eq('is_active', true)
        .ilike('growth_stage', detected);
      if (method) {
        morphQ = morphQ.or(`cultivation_method.eq.any,cultivation_method.eq.${method}`);
      }
      const { data: morphStages } = await morphQ;
      const morphHit = Array.isArray(morphStages)
        ? morphStages
            .filter((s: any) => s?.cultivation_method != null)
            .sort((a: any, b: any) => {
              const r = (x: any) => {
                const m = String(x.cultivation_method).toLowerCase();
                if (method && m === method) return 0;
                if (m === 'any') return 1;
                return 2;
              };
              return r(a) - r(b);
            })[0]
        : null;

      if (morphHit) {
        const raw = Number(growthRows?.[0]?.confidence_score);
        const normalized = Number.isFinite(raw) ? (raw > 1 ? raw / 100 : raw) : null;
        candidates.push({
          growth_stage: morphHit.growth_stage ?? null,
          stage_code: morphHit.stage_code ?? null,
          stage_uuid: morphHit.id ?? null,
          source: 'morphological_evidence',
          confidence: Math.max(0.95, normalized ?? 0.95),
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

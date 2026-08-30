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
 *   2026-08-30 — v11 (2nd forensic audit, P0 Fix 2/6/7): (a) removed the transitioned_at
 *     column from the stage_transition_log select — it does not exist, so PostgREST
 *     failed the query and the catch silently disabled the completed-transition tier;
 *     now selects/decays on evaluated_at. (b) transition-tier failures log a warning
 *     instead of vanishing (core evidence, not optional). (c) morphology confidence is
 *     the detector's own value, no longer Math.max(0.95, .) which promoted every
 *     reading to 0.95. autonomous_init cap (v10) and GDD/DAS tiers unchanged.
 *   2026-08-19 12:45 UTC — v10: stage_transition_log authority hardening.
 *     trigger_type='autonomous_init' capped at its own stored confidence (never
 *     inflated to 0.90), age decay of 0.05 per 7 days (floor 0.30), and a
 *     stale-transition tie-break (>14 days loses to a disagreeing biological
 *     ledger candidate).
 *   2026-08-15 UTC — v9: honor crop_stage_master.das_reference. Rows anchored on
 *     'transplanting' are matched against DAT (days since transplant_date) and are
 *     ineligible when no transplant date exists; DAS remains the anchor otherwise.
 *     Reason string now reports anchor_das / anchor_dat and per-candidate anchor.
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
        // v9 — a row whose calendar window is honored by its own das_reference
        // anchor (DAT for 'transplanting', DAS otherwise) is preferred.
        const windowFits = (s: any): boolean => {
          const lo = s?.das_min, hi = s?.das_max;
          if (lo === null || lo === undefined || hi === null || hi === undefined) return true;
          const v = anchorValue(s);
          if (v === null) return true;
          return v >= Number(lo) && v <= Number(hi);
        };
        const hits = stages
          .filter(
            (s: any) =>
              s.cultivation_method != null &&
              // v9 — transplant-anchored rows are ineligible without a transplant date.
              rowEligible(s) &&
              s.gdd_min !== null &&
              s.gdd_max !== null &&
              latestGdd >= Number(s.gdd_min) &&
              latestGdd <= Number(s.gdd_max),
          )
          .sort(
            (a: any, b: any) =>
              (windowFits(a) ? 0 : 1) - (windowFits(b) ? 0 : 1) || rank(a) - rank(b),
          );

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
  // SURGICAL FIX 2 (2026-08-19):
  //   • trigger_type='autonomous_init' is a bootstrap marker, NOT field evidence —
  //     it can never be inflated above its own stored confidence.
  //   • Age decay: −0.05 per 7 days since evaluated_at/transitioned_at (floor 0.30).
  //   • Tie-break: a transition record older than 14 days loses to the biological
  //     ledger (GDD / morphological / calendar candidates) when they disagree.
  let transitionCandidate: PhenologyCandidate | null = null;
  let transitionAgeDays: number | null = null;
  let transitionTrigger: string | null = null;
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
        const trigger = typeof t.trigger_type === 'string' ? t.trigger_type.toLowerCase() : '';
        transitionTrigger = trigger || null;
        const stored = Number.isFinite(Number(t.confidence)) ? Number(t.confidence) : 0.5;
        const isCalendarTrigger = ['das', 'dat'].includes(trigger);
        const isAutonomousInit = trigger === 'autonomous_init';

        let conf: number;
        if (isAutonomousInit) {
          // Never inflate a bootstrap row — cap at its OWN stored confidence.
          conf = Math.min(stored, 0.5);
        } else if (isCalendarTrigger) {
          conf = Math.min(0.5, stored);
        } else {
          conf = Math.max(0.90, stored);
        }

        // Age decay from the freshest available timestamp.
        // P0-2026-08-30 (Fix 2): stage_transition_log has no transitioned_at column;
        // evaluated_at is the real event timestamp.
        const ts = t.evaluated_at ?? null;
        const tsMs = ts ? new Date(ts as string).getTime() : NaN;
        if (Number.isFinite(tsMs)) {
          transitionAgeDays = Math.max(0, Math.floor((Date.now() - tsMs) / 86400000));
          const decay = Math.floor(transitionAgeDays / 7) * 0.05;
          conf = Math.max(0.30, conf - decay);
        }

        transitionCandidate = {
          growth_stage: stageRow.growth_stage ?? null,
          stage_code: stageRow.stage_code ?? null,
          stage_uuid: stageRow.id ?? null,
          source: 'completed_stage_transitions',
          confidence: conf,
        };
        candidates.push(transitionCandidate);
        anchorLog.push(
          `transition:trigger=${trigger || 'unknown'} stored=${stored.toFixed(2)} ` +
          `age_days=${transitionAgeDays ?? 'null'} conf=${conf.toFixed(2)}`,
        );
      }
    }
  } catch (e) {
    // P0-2026-08-30 (Fix 2/7): the transition tier feeds the biological ledger, so a
    // schema/query failure here is CORE drift, not optional telemetry. A stale
    // transitioned_at select silently disabled this whole tier; surface it now so drift
    // can never hide again. Still best-effort: reconciliation continues on other tiers.
    console.warn(`[PHENOLOGY_RECON] transition tier unavailable land=${landId} err=${(e as Error)?.message ?? String(e)}`);
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
        .select('growth_stage, stage_code, id, das_min, das_max, das_reference, cultivation_method')
        .eq('crop_code', cropCode)
        .eq('is_active', true)
        .ilike('growth_stage', detected);
      if (method) {
        morphQ = morphQ.or(`cultivation_method.eq.any,cultivation_method.eq.${method}`);
      }
      const { data: morphStages } = await morphQ;
      const morphHit = Array.isArray(morphStages)
        ? morphStages
            // v9 — transplant-anchored rows are ineligible without a transplant date.
            .filter((s: any) => s?.cultivation_method != null && rowEligible(s))
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
        anchorLog.push(`morphological_evidence:anchor=${anchorFor(morphHit)}`);
        candidates.push({
          growth_stage: morphHit.growth_stage ?? null,
          stage_code: morphHit.stage_code ?? null,
          stage_uuid: morphHit.id ?? null,
          source: 'morphological_evidence',
          // P0-2026-08-30 (Fix 6/11): preserve the detector's own confidence rather than
          // flooring every reading at 0.95. A photo scored 0.52 must enter as 0.52, not
          // 0.95; authority is carried by source='morphological_evidence', not by an
          // inflated magnitude. A null score (detector gave none) keeps the prior 0.95.
          confidence: normalized ?? 0.95,
        });

      }
    }
  } catch (_e) {
    // Optional signal.
  }


  // SURGICAL FIX 2 — stale-transition tie-break: a transition record older than
  // 14 days loses to a disagreeing biological-ledger candidate.
  let eligible = candidates;
  if (transitionCandidate && (transitionAgeDays ?? 0) > 14) {
    const disagreeing = candidates.some(
      (c) =>
        c !== transitionCandidate &&
        (c.growth_stage ?? '') !== (transitionCandidate!.growth_stage ?? ''),
    );
    if (disagreeing) {
      eligible = candidates.filter((c) => c !== transitionCandidate);
      anchorLog.push(
        `transition_demoted:stale age_days=${transitionAgeDays} trigger=${transitionTrigger ?? 'unknown'}`,
      );
    }
  }

  // Pick highest-confidence candidate.
  const winner = eligible.reduce((best, c) => (c.confidence > best.confidence ? c : best), dasCandidate);

  const changed =
    (winner.growth_stage ?? '') !== (dasCandidate.growth_stage ?? '') ||
    winner.source !== dasCandidate.source;

  const anchorSuffix =
    ` anchor_das=${das ?? 'null'} anchor_dat=${dat ?? 'null'}` +
    (anchorLog.length ? ` [${anchorLog.join(' ')}]` : '');

  const reason = (changed
    ? `${winner.source}_conf=${winner.confidence.toFixed(2)}_beats_${dasCandidate.source}_conf=${dasCandidate.confidence.toFixed(2)}`
    : (candidates.length === 1 ? 'only_das_available' : 'das_still_highest_confidence')) + anchorSuffix;


  return {
    winner,
    das_stage: dasCandidate.growth_stage,
    gdd_stage: gddCandidate?.growth_stage ?? null,
    reason,
    changed,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHENOLOGY RECONCILER — Runtime stage adjudication (authority first, confidence second)
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs BEFORE buildBiologicalState() locks the invariant.
 * Generic, crop-agnostic. No hardcoded agronomy. No DB writes.
 *
 * Two SEPARATE dimensions (2nd forensic audit, R2, 2026-08-30):
 *   authority   — WHICH KIND of evidence backs the stage (policy.authority_rank from
 *                 system_config.stage_evidence_policy). Ranks the source class.
 *   confidence  — the source's OWN calibrated value, never floored or promoted here.
 *   confirmation — ESTIMATED (calendar / thermal / sensor inference)
 *                  OBSERVED  (one validated field photo or farmer event, this cycle)
 *                  CONFIRMED (policy.photo.min_photos_for_confirmation validated photos
 *                             agreeing within confirmation_window_days)
 * The winner is the candidate with the best authority rank; confidence only breaks
 * ties INSIDE a tier. Every disagreement between tiers is returned as a conflict record
 * (never silently discarded) so the Decision Brain and the narration can hedge.
 *
 * Tiers (all read-only):
 *   resolver row           — resolve_crop_phenology_for_land (v10 tags authority/confirmation
 *                            in evidence_sources; v9 rows are mapped from ledger_trigger)
 *   gdd_model              — crop_stage_master GDD windows, lane-scoped (authority thermal_model)
 *   completed transitions  — stage_transition_log (authority from evidence/trigger via policy;
 *                            calendar & autonomous_init capped <= 0.5; age decay from policy)
 *   morphological evidence — rpc stc_morphology_evidence: the SAME SQL definition of "a photo
 *                            that counts" used by the nightly writer (this cycle, confidence
 *                            NOT NULL >= policy minimum, geo-validated, no identity/quality
 *                            conflicts). A missing policy row => tier UNAVAILABLE (fail closed).
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 *   2026-08-30 — v12 (2nd forensic audit R2, P1): (a) arbitration is authority-first
 *     (policy.authority_rank), confidence second — a 0.62 validated photo now outranks a 0.90
 *     GDD window instead of losing to it; (b) non-calendar transitions keep their STORED
 *     confidence (Math.max(0.90, .) removed); (c) morphology tier moved to the DB helper
 *     stc_morphology_evidence (cycle-scoped, provenance-gated, NULL confidence excluded) —
 *     the land_id-only crop_growth_analysis read that accepted last season's photos is gone;
 *     (d) explicit conflict records + confirmation status + tier_errors in the result;
 *     (e) morphology/GDD tier failures log instead of vanishing (Fix 7); (f) transition tier
 *     scoped to this cycle (evaluated_at >= cycle start) and skips retracted rows; (g) GDD
 *     tier reads the REAL land_gdd_daily columns (cumulative_gdd / obs_date) and the resolver's
 *     current_gdd — the tier had been dead since v7 on a wrong column name.
 *   2026-08-30 — v11 (2nd forensic audit, P0 Fix 2/6/7): removed transitioned_at select;
 *     transition-tier failures warn; morphology confidence is the detector's own value.
 *   2026-08-19 — v10: autonomous_init capped at stored confidence; age decay; stale tie-break.
 *   2026-08-15 — v9: honor crop_stage_master.das_reference (DAT for transplant-anchored rows).
 *   2026-07-29 — v8: DAS demoted to provisional; transition tier on to_stage_uuid/evaluated_at.
 *   2026-07-12 — v7: NULL cultivation_method rows excluded from GDD candidates.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type Confirmation = 'ESTIMATED' | 'OBSERVED' | 'CONFIRMED' | 'UNKNOWN';

export interface PhenologyCandidate {
  growth_stage: string | null;
  stage_code: string | null;
  stage_uuid: string | null;
  source: string;
  confidence: number;
  /** v12 — evidence tier, vocabulary = policy.authority_rank */
  authority: string;
  /** v12 — confirmation contract status */
  confirmation: Confirmation;
  /** v12 — provenance/detail for the trace (never used for arbitration) */
  evidence?: Record<string, unknown>;
}

export interface EvidenceConflict {
  kind: 'tier_disagreement' | 'stale_transition_demoted';
  winner: { source: string; stage: string | null; authority: string; confidence: number };
  other: { source: string; stage: string | null; authority: string; confidence: number };
}

export interface ReconciliationResult {
  winner: PhenologyCandidate;
  das_stage: string | null;
  gdd_stage: string | null;
  reason: string;
  changed: boolean;
  /** v12 */
  authority: string;
  confirmation: Confirmation;
  conflicts: EvidenceConflict[];
  candidates: PhenologyCandidate[];
  tier_errors: string[];
  policy_present: boolean;
}

export interface StageEvidencePolicy {
  authority_rank?: string[];
  trigger_authority?: Record<string, string>;
  photo?: {
    require_location_validated?: boolean;
    max_distance_m?: number;
    max_age_days?: number;
    min_confidence?: number;
    min_photos_for_confirmation?: number;
    confirmation_window_days?: number;
    max_auto_jump_steps?: number;
    min_photos_for_jump?: number;
  };
  transition?: {
    age_decay_per_7_days?: number;
    age_decay_floor?: number;
    stale_after_days?: number;
  };
}

/**
 * Mirror of the migration default (20260830_stage_evidence_authority_p1.sql §0). Used ONLY
 * when the policy row is absent, and then logged as [STAGE_EVIDENCE_POLICY_MISSING]; the
 * photo tier is unavailable in that state regardless (the SQL helper returns nothing).
 */
const FALLBACK_AUTHORITY_RANK = Object.freeze([
  'morphology', 'farmer_observation', 'sensor', 'thermal_model', 'variety_calendar', 'calendar', 'unknown',
]);
const FALLBACK_TRIGGER_AUTHORITY: Readonly<Record<string, string>> = Object.freeze({
  morphology_stage: 'morphology',
  observation: 'farmer_observation',
  event: 'farmer_observation',
  ndvi: 'sensor',
  gdd: 'thermal_model',
  das: 'calendar',
  dat: 'calendar',
  autonomous_init: 'calendar',
});

export async function loadStageEvidencePolicy(
  supabase: any,
): Promise<{ policy: StageEvidencePolicy | null; present: boolean }> {
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'stage_evidence_policy')
      .maybeSingle();
    if (error) throw error;
    const v = data?.config_value;
    if (v && typeof v === 'object') return { policy: v as StageEvidencePolicy, present: true };
  } catch (e) {
    console.warn(`[STAGE_EVIDENCE_POLICY_READ_FAILED] err=${(e as Error)?.message ?? String(e)}`);
  }
  console.warn('[STAGE_EVIDENCE_POLICY_MISSING] system_config.stage_evidence_policy absent — photo tier unavailable, authority order falls back to the migration default');
  return { policy: null, present: false };
}

const tagValue = (tags: unknown, prefix: string): string | null => {
  if (!Array.isArray(tags)) return null;
  const hit = tags.find((t) => typeof t === 'string' && t.startsWith(prefix)) as string | undefined;
  return hit ? hit.slice(prefix.length) : null;
};

const asConfirmation = (v: unknown, fallback: Confirmation): Confirmation => {
  const s = String(v ?? '').toUpperCase();
  return s === 'ESTIMATED' || s === 'OBSERVED' || s === 'CONFIRMED' ? (s as Confirmation) : fallback;
};

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

  const { policy, present: policyPresent } = await loadStageEvidencePolicy(supabase);
  const authorityRank: readonly string[] =
    Array.isArray(policy?.authority_rank) && policy!.authority_rank!.length > 0
      ? policy!.authority_rank!
      : FALLBACK_AUTHORITY_RANK;
  const triggerAuthority: Record<string, string> = {
    ...FALLBACK_TRIGGER_AUTHORITY,
    ...(policy?.trigger_authority ?? {}),
  };
  const rankOf = (a: string): number => {
    const i = authorityRank.indexOf(String(a ?? 'unknown').toLowerCase());
    return i === -1 ? authorityRank.length : i;
  };

  const tierErrors: string[] = [];
  const anchorLog: string[] = [];

  // ── v9 — DAT anchor (whole days since transplanting). Null when unknown. ──
  const dat: number | null = (() => {
    if (!transplantDate) return null;
    const t = new Date(transplantDate as string);
    if (Number.isNaN(t.getTime())) return null;
    return Math.floor((Date.now() - t.getTime()) / 86400000);
  })();

  // Cycle start (ISO date) derived from the resolver's DAS; used to scope ledger reads.
  const cycleStartIso: string | null = (() => {
    if (typeof das !== 'number' || !Number.isFinite(das) || das < 0) return null;
    return new Date(Date.now() - das * 86400000).toISOString().slice(0, 10);
  })();

  /** Which calendar anchor a crop_stage_master row's DAS window must use. */
  const anchorFor = (row: any): 'das' | 'dat' =>
    String(row?.das_reference ?? '').toLowerCase() === 'transplanting' ? 'dat' : 'das';
  /** Transplant-anchored rows are ineligible when no transplant date exists. */
  const rowEligible = (row: any): boolean => anchorFor(row) === 'das' || dat !== null;
  const anchorValue = (row: any): number | null => (anchorFor(row) === 'dat' ? dat : (das ?? null));

  const method: string | null = phenologyRow?.cultivation_method
    ? String(phenologyRow.cultivation_method).toLowerCase()
    : null;
  const laneOk = (m: unknown): boolean => {
    const x = m ? String(m).toLowerCase() : null;
    if (!x) return false;                 // NULL lane is a data-quality issue, never matches
    if (!method) return true;             // unknown land lane: any populated lane qualifies
    return x === method || x === 'any';
  };

  // ── Candidate 0: the resolver row (v10 carries authority/confirmation tags) ──
  const rowTags = phenologyRow?.evidence_sources;
  const rowSource = String(phenologyRow.source ?? 'crop_stage_master');
  const rowAuthority = (() => {
    const tagged = tagValue(rowTags, 'authority:');
    if (tagged) return tagged.toLowerCase();
    // v9 resolver rows: derive from the ledger trigger / source label
    const trig = tagValue(rowTags, 'ledger_trigger:');
    if (rowSource === 'biological_ledger' && trig) return triggerAuthority[trig.toLowerCase()] ?? 'unknown';
    if (rowSource === 'evidence_transition') {
      const tt = tagValue(rowTags, 'transition_trigger:');
      return tt ? (triggerAuthority[tt.toLowerCase()] ?? 'unknown') : 'unknown';
    }
    return 'calendar';
  })();
  const rowConfirmation = asConfirmation(
    tagValue(rowTags, 'confirmation:'),
    rowAuthority === 'morphology' || rowAuthority === 'farmer_observation' ? 'OBSERVED' : 'ESTIMATED',
  );
  const resolverCandidate: PhenologyCandidate = {
    growth_stage: phenologyRow.growth_stage ?? null,
    stage_code: phenologyRow.stage_code ?? null,
    stage_uuid: phenologyRow.stage_uuid ?? null,
    source: rowSource,
    confidence: typeof phenologyRow.confidence === 'number' ? phenologyRow.confidence : 0.5,
    authority: rowAuthority,
    confirmation: rowConfirmation,
    evidence: { resolver_version: phenologyRow.resolver_version ?? null, tags: Array.isArray(rowTags) ? rowTags : [] },
  };

  const candidates: PhenologyCandidate[] = [resolverCandidate];

  // ── Candidate: GDD model (authority thermal_model) ────────────────────────
  let gddCandidate: PhenologyCandidate | null = null;
  try {
    // v12 (wiring fix): land_gdd_daily columns are cumulative_gdd / obs_date (verified live
    // 2026-08-30). v7–v11 selected gdd_accumulated / gdd_date, which do not exist — PostgREST
    // errored and the silent catch disabled this tier on every turn. The resolver row
    // exposes the land's GDD as current_gdd, not gdd_accumulated.
    const { data: gddRows, error: gddErr } = await supabase
      .from('land_gdd_daily')
      .select('cumulative_gdd, obs_date')
      .eq('land_id', landId)
      .order('obs_date', { ascending: false })
      .limit(1);
    if (gddErr) throw gddErr;

    const rowGdd = Number(phenologyRow?.current_gdd ?? phenologyRow?.gdd_accumulated);
    const latestGdd: number | null =
      gddRows && gddRows.length > 0 && gddRows[0].cumulative_gdd !== null && Number.isFinite(Number(gddRows[0].cumulative_gdd))
        ? Number(gddRows[0].cumulative_gdd)
        : (Number.isFinite(rowGdd) ? rowGdd : null);

    if (latestGdd !== null && latestGdd >= 0) {
      let stagesQ = supabase
        .from('crop_stage_master')
        .select('growth_stage, stage_code, id, gdd_min, gdd_max, das_min, das_max, das_reference, cultivation_method')
        .eq('crop_code', cropCode)
        .eq('is_active', true);
      if (method) {
        stagesQ = stagesQ.or(`cultivation_method.eq.any,cultivation_method.eq.${method}`);
      }
      const { data: stages, error: stErr } = await stagesQ;
      if (stErr) throw stErr;

      if (Array.isArray(stages) && stages.length > 0) {
        const rank = (r: any) => {
          const m = r?.cultivation_method ? String(r.cultivation_method).toLowerCase() : null;
          if (method && m === method) return 0;
          if (m === 'any') return 1;
          return 2;
        };
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
          // Freshness: 0.90 when land_gdd_daily is current; 0.80 when only the resolver's copy exists.
          const freshness = gddRows && gddRows.length > 0 && gddRows[0].cumulative_gdd !== null ? 0.90 : 0.80;
          anchorLog.push(
            `gdd_model:anchor=${anchorFor(hit)}` +
            `(${anchorFor(hit) === 'dat' ? `dat=${dat}` : `das=${das ?? 'null'}`}) gdd=${latestGdd.toFixed(1)}`,
          );
          gddCandidate = {
            growth_stage: hit.growth_stage ?? null,
            stage_code: hit.stage_code ?? null,
            stage_uuid: hit.id ?? null,
            source: 'gdd_model',
            confidence: freshness,
            authority: 'thermal_model',
            confirmation: 'ESTIMATED',
            evidence: { cumulative_gdd: latestGdd, obs_date: gddRows?.[0]?.obs_date ?? null, gdd_min: hit.gdd_min, gdd_max: hit.gdd_max },
          };
          candidates.push(gddCandidate);
        }
      }
    }
  } catch (e) {
    // v12 (Fix 7): a failing thermal tier is a diagnostic, not silence.
    const msg = (e as Error)?.message ?? String(e);
    tierErrors.push(`gdd_model:${msg}`);
    console.warn(`[PHENOLOGY_RECON] gdd tier unavailable land=${landId} err=${msg}`);
  }

  // ── Candidate: completed stage transitions (biological ledger) ───────────
  let transitionCandidate: PhenologyCandidate | null = null;
  let transitionAgeDays: number | null = null;
  let transitionTrigger: string | null = null;
  try {
    let tq = supabase
      .from('stage_transition_log')
      .select('to_stage_uuid, trigger_type, confidence, evaluated_at, evidence')
      .eq('land_id', landId)
      .not('to_stage_uuid', 'is', null)
      .order('evaluated_at', { ascending: false })
      .limit(5);
    if (cycleStartIso) tq = tq.gte('evaluated_at', cycleStartIso);   // this cycle only
    const { data: transitions, error: trErr } = await tq;
    if (trErr) throw trErr;

    const t = Array.isArray(transitions)
      ? transitions.find((r: any) => String(r?.evidence?.applied ?? 'true') !== 'false'
                                   && !String(r?.trigger_type ?? '').startsWith('germination_gate'))
      : null;
    if (t) {
      const { data: stageRow, error: sErr } = await supabase
        .from('crop_stage_master')
        .select('growth_stage, stage_code, id, crop_code')
        .eq('id', t.to_stage_uuid)
        .maybeSingle();
      if (sErr) throw sErr;
      if (stageRow && String(stageRow.crop_code ?? '').toLowerCase() === String(cropCode).toLowerCase()) {
        const trigger = typeof t.trigger_type === 'string' ? t.trigger_type.toLowerCase() : '';
        transitionTrigger = trigger || null;
        const stored = Number.isFinite(Number(t.confidence)) ? Number(t.confidence) : 0.5;
        const isCalendarTrigger = ['das', 'dat'].includes(trigger);
        const isAutonomousInit = trigger === 'autonomous_init';

        // v12: stored confidence is PRESERVED for evidence triggers (no Math.max floor).
        let conf: number;
        let authority: string;
        if (isAutonomousInit) {
          conf = Math.min(stored, 0.5);
          authority = 'calendar';
        } else if (isCalendarTrigger) {
          conf = Math.min(0.5, stored);
          authority = 'calendar';
        } else {
          conf = Math.max(0, Math.min(1, stored));
          authority = String(t?.evidence?.authority ?? triggerAuthority[trigger] ?? 'unknown').toLowerCase();
        }
        const confirmation = asConfirmation(
          t?.evidence?.confirmation,
          authority === 'morphology' || authority === 'farmer_observation' ? 'OBSERVED' : 'ESTIMATED',
        );

        // Age decay (policy.transition; defaults mirror the migration row).
        const decayStep = Number(policy?.transition?.age_decay_per_7_days ?? 0.05);
        const decayFloor = Number(policy?.transition?.age_decay_floor ?? 0.30);
        const ts = t.evaluated_at ?? null;
        const tsMs = ts ? new Date(ts as string).getTime() : NaN;
        if (Number.isFinite(tsMs)) {
          transitionAgeDays = Math.max(0, Math.floor((Date.now() - tsMs) / 86400000));
          const decay = Math.floor(transitionAgeDays / 7) * decayStep;
          conf = Math.max(decayFloor, conf - decay);
        }

        transitionCandidate = {
          growth_stage: stageRow.growth_stage ?? null,
          stage_code: stageRow.stage_code ?? null,
          stage_uuid: stageRow.id ?? null,
          source: 'completed_stage_transitions',
          confidence: conf,
          authority,
          confirmation,
          evidence: { trigger, stored_confidence: stored, age_days: transitionAgeDays, evaluated_at: ts },
        };
        candidates.push(transitionCandidate);
        anchorLog.push(
          `transition:trigger=${trigger || 'unknown'} stored=${stored.toFixed(2)} ` +
          `age_days=${transitionAgeDays ?? 'null'} conf=${conf.toFixed(2)} authority=${authority}`,
        );
      }
    }
  } catch (e) {
    // Core evidence tier: surface, never swallow (P0 Fix 2/7).
    const msg = (e as Error)?.message ?? String(e);
    tierErrors.push(`completed_stage_transitions:${msg}`);
    console.warn(`[PHENOLOGY_RECON] transition tier unavailable land=${landId} err=${msg}`);
  }

  // ── Candidate: morphological field evidence (photos of THIS crop on THIS land) ──
  // Provenance and cycle rules live in SQL (stc_morphology_evidence) — one definition for
  // the nightly writer, the SQL resolver preview and this runtime reader.
  let morphologyUnavailable: string | null = policyPresent ? null : 'policy_missing';
  try {
    if (policyPresent) {
      const { data: evRows, error: evErr } = await supabase.rpc('stc_morphology_evidence', {
        p_land_id: landId,
        p_stage_uuid: null,
        p_stage_code: null,
        p_within_days: null,
        p_min_confidence: null,
      });
      if (evErr) throw evErr;

      const rows: any[] = Array.isArray(evRows) ? evRows.filter((r) => laneOk(r?.cultivation_method)) : [];
      if (rows.length > 0) {
        // Group by stage; the stage with the most validated photos wins (tie → most recent).
        const groups = new Map<string, any[]>();
        for (const r of rows) {
          const k = String(r.stage_uuid);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(r);
        }
        const ordered = [...groups.entries()].sort((a, b) => {
          const byCount = b[1].length - a[1].length;
          if (byCount !== 0) return byCount;
          const la = Math.max(...a[1].map((r) => new Date(r.captured_at).getTime() || 0));
          const lb = Math.max(...b[1].map((r) => new Date(r.captured_at).getTime() || 0));
          return lb - la;
        });
        const [stageUuid, group] = ordered[0];
        const latestMs = Math.max(...group.map((r) => new Date(r.captured_at).getTime() || 0));
        const windowDays = Number(policy?.photo?.confirmation_window_days);
        const minPhotos = Number(policy?.photo?.min_photos_for_confirmation);
        const agreeing = Number.isFinite(windowDays)
          ? group.filter((r) => latestMs - (new Date(r.captured_at).getTime() || 0) <= windowDays * 86400000).length
          : group.length;
        const confirmation: Confirmation =
          Number.isFinite(minPhotos) && minPhotos > 0 && agreeing >= minPhotos ? 'CONFIRMED' : 'OBSERVED';
        const confidence = Math.max(...group.map((r) => Number(r.confidence) || 0));

        const { data: stageRow, error: sErr } = await supabase
          .from('crop_stage_master')
          .select('growth_stage, stage_code, id')
          .eq('id', stageUuid)
          .maybeSingle();
        if (sErr) throw sErr;

        if (stageRow) {
          anchorLog.push(
            `morphological_evidence:photos=${group.length} agreeing=${agreeing} ` +
            `conf=${confidence.toFixed(2)} latest=${new Date(latestMs).toISOString().slice(0, 10)} ${confirmation}`,
          );
          candidates.push({
            growth_stage: stageRow.growth_stage ?? null,
            stage_code: stageRow.stage_code ?? null,
            stage_uuid: stageRow.id ?? null,
            source: 'morphological_evidence',
            confidence,
            authority: 'morphology',
            confirmation,
            evidence: {
              photo_count: group.length,
              agreeing_within_window: agreeing,
              latest_captured_at: new Date(latestMs).toISOString(),
              analysis_ids: group.map((r) => r.analysis_id),
              other_stages_seen: ordered.slice(1).map(([k, g]) => ({ stage_uuid: k, photos: g.length })),
            },
          });
        }
      }
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    morphologyUnavailable = msg;
    tierErrors.push(`morphological_evidence:${msg}`);
    console.warn(`[PHENOLOGY_RECON] morphology tier unavailable land=${landId} err=${msg}`);
  }
  if (morphologyUnavailable) anchorLog.push(`morphology_tier_unavailable:${morphologyUnavailable}`);

  // ── Stale-transition tie-break (policy.transition.stale_after_days) ──────
  const conflicts: EvidenceConflict[] = [];
  const staleAfter = Number(policy?.transition?.stale_after_days ?? 14);
  let eligible = candidates;
  if (transitionCandidate && (transitionAgeDays ?? 0) > staleAfter) {
    const disagreeing = candidates.some(
      (c) =>
        c !== transitionCandidate &&
        (c.stage_uuid ?? c.growth_stage ?? '') !== (transitionCandidate!.stage_uuid ?? transitionCandidate!.growth_stage ?? ''),
    );
    if (disagreeing) {
      eligible = candidates.filter((c) => c !== transitionCandidate);
      anchorLog.push(
        `transition_demoted:stale age_days=${transitionAgeDays} trigger=${transitionTrigger ?? 'unknown'}`,
      );
    }
  }

  // ── Arbitration: authority rank first, confidence second ─────────────────
  const sorted = [...eligible].sort((a, b) => {
    const r = rankOf(a.authority) - rankOf(b.authority);
    if (r !== 0) return r;
    return b.confidence - a.confidence;
  });
  const winner = sorted[0] ?? resolverCandidate;

  const sameStage = (a: PhenologyCandidate, b: PhenologyCandidate) =>
    (a.stage_uuid && b.stage_uuid) ? a.stage_uuid === b.stage_uuid
      : (a.growth_stage ?? '').toLowerCase() === (b.growth_stage ?? '').toLowerCase();

  for (const c of candidates) {
    if (c === winner || sameStage(c, winner)) continue;
    conflicts.push({
      kind: c === transitionCandidate && !eligible.includes(c) ? 'stale_transition_demoted' : 'tier_disagreement',
      winner: { source: winner.source, stage: winner.stage_code ?? winner.growth_stage, authority: winner.authority, confidence: winner.confidence },
      other: { source: c.source, stage: c.stage_code ?? c.growth_stage, authority: c.authority, confidence: c.confidence },
    });
  }

  const changed =
    !sameStage(winner, resolverCandidate) || winner.source !== resolverCandidate.source;

  const anchorSuffix =
    ` anchor_das=${das ?? 'null'} anchor_dat=${dat ?? 'null'}` +
    ` authority=${winner.authority} confirmation=${winner.confirmation}` +
    ` conflicts=${conflicts.length}` +
    (tierErrors.length ? ` tier_errors=${tierErrors.length}` : '') +
    (anchorLog.length ? ` [${anchorLog.join(' ')}]` : '');

  const reason = (changed
    ? `${winner.source}(${winner.authority})_conf=${winner.confidence.toFixed(2)}_outranks_${resolverCandidate.source}(${resolverCandidate.authority})_conf=${resolverCandidate.confidence.toFixed(2)}`
    : (candidates.length === 1 ? 'only_resolver_row_available' : 'resolver_row_holds_highest_authority')) + anchorSuffix;

  return {
    winner,
    das_stage: resolverCandidate.growth_stage,
    gdd_stage: gddCandidate?.growth_stage ?? null,
    reason,
    changed,
    authority: winner.authority,
    confirmation: winner.confirmation,
    conflicts,
    candidates,
    tier_errors: tierErrors,
    policy_present: policyPresent,
  };
}

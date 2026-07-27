/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-07-25 UTC — Batch A / P2: added `structured_gap_reason` to
 *   GraphHypothesisResult (NO_OBSERVATION_EVIDENCE | NO_DISCOVERY_SEEDS |
 *   NO_STAGE_VALID_HYPOTHESES | PARTIAL_MATCH_ONLY | ALL_ELIMINATED) plus a
 *   `[GRAPH_STRUCTURED_GAP]` trace. Additive only — no scoring or
 *   elimination behaviour changed.
 * 2026-07-11 UTC — v5-P8: STAGE hard-gate is now confidence-aware.
 *   `GraphHypothesisInput.predicted_stage_confidence` (0..1) is compared to
 *   a runtime graph threshold (`system_config.bio_stage_hard_gate_threshold`
 *   with fallback constant DEFAULT_BIO_STAGE_HARD_GATE_THRESHOLD = 0.6).
 *   When confidence >= threshold the DB SSOT is honored (HARD elimination
 *   on `is_required=true` STAGE mismatch). When confidence < threshold the
 *   stage gate downgrades to a SOFT penalty (STAGE_CONTEXT_CONFLICT warning)
 *   so hypotheses can survive when the field twin contradicts the calendar.
 *   Threshold is graph math, not agronomy.
 * 2026-07-11 UTC — Additive: GraphHypothesisInput accepts optional
 *   `canonical_context`. Stored on the evaluation context so DB rule
 *   predicates that reference field-twin fields can resolve. No logic change.
 * 2026-07-09 02:07 UTC — Expose `rule_edges` (Map<hypothesis_id, rule_id[]>)
 *   on evaluator return value so the orchestrator can invert it into
 *   `edges.ruleToHypothesis` for the pure graph-snapshot builder. No logic
 *   change; additive field only.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HYPOTHESIS GRAPH EVALUATOR — v1.0 (Step 8, graph-first)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure DB graph discovery. NO rule text. NO LLM. NO hardcoded agronomy.
 *
 * Walks the ONLY authoritative graph:
 *
 *     observation_master
 *           ↓
 *     hypothesis_conditions   (OBSERVATION rows anchor discovery)
 *           ↓
 *     hypothesis_master        (crop_group, canonical_group, severity)
 *           ↓
 *     hypothesis_rule_mapping  (ONLY hypothesis→rule edge)
 *
 * SCHEMA REALITY (public.hypothesis_conditions):
 *   condition_type  ∈ {WEATHER, OBSERVATION, SOIL, DAS_RANGE, BOOLEAN_GATE, STAGE}
 *   condition_key   = observation_code OR semantic slot (reported_codes, symptom, etc.)
 *   value_json      = true  → positive expectation (evidence should be present)
 *                     false → negative expectation (evidence should be absent)
 *                     {code|observation_code|observations|observation_codes|...}
 *                     or string[] → canonical observation identities
 *   is_required     = true  → mandatory
 *                     false → supporting/nice-to-have
 *   weight          = numeric [0..1]
 *
 * BUCKET MAPPING (positive/negative reasoning is first-class):
 *   required   = OBSERVATION ∧ value_json=true  ∧ is_required=true
 *   supporting = OBSERVATION ∧ value_json=true  ∧ is_required=false
 *   exclusion  = OBSERVATION ∧ value_json=false ∧ is_required=true
 *   blocking   = OBSERVATION ∧ value_json=false ∧ is_required=false
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { normalizeStageForDB } from '../utils/stage-normalizer.ts';
import { stageCompatibility } from './stage-symbol-resolver.ts';
import { resolveObservationSymbolMap } from './symbol-resolver.ts';

export interface GraphHypothesisInput {
  crop_code: string | null;
  crop_group?: string | null;
  growth_stage: string | null;
  das: number | null;
  observation_codes: string[];
  supabase: any;
  trace_id?: string | null;
  // v2.1.0 — optional frozen field-twin. Not evaluated by this module; stored
  // for downstream predicate evaluators that reference the extended context.
  canonical_context?: unknown;
  // v5-P8 — biological stage-authority signal (0..1). When below the runtime
  // threshold, STAGE hard-gates on `is_required=true` mismatch downgrade to
  // soft penalties (STAGE_CONTEXT_CONFLICT).
  predicted_stage_confidence?: number;
}

/** v5-P8 — graph-math fallback used when `system_config` key is missing. */
const DEFAULT_BIO_STAGE_HARD_GATE_THRESHOLD = 0.6;
let _bioStageHardGateThresholdCache: number | null = null;
async function readBioStageHardGateThreshold(supabase: any): Promise<number> {
  if (_bioStageHardGateThresholdCache !== null) return _bioStageHardGateThresholdCache;
  try {
    const { data } = await supabase
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'bio_stage_hard_gate_threshold')
      .maybeSingle();
    const raw = data?.config_value;
    const n = typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw)
        : (raw && typeof raw === 'object' && 'value' in raw ? Number((raw as any).value) : NaN);
    _bioStageHardGateThresholdCache = Number.isFinite(n) && n >= 0 && n <= 1
      ? n
      : DEFAULT_BIO_STAGE_HARD_GATE_THRESHOLD;
  } catch {
    _bioStageHardGateThresholdCache = DEFAULT_BIO_STAGE_HARD_GATE_THRESHOLD;
  }
  return _bioStageHardGateThresholdCache;
}

/**
 * Only these reasons may REMOVE a hypothesis (true agronomic contradiction).
 * Missing/unknown context is NEVER an elimination reason — it becomes a
 * ContextGap that adjusts confidence and may trigger clarification.
 */
export type HypothesisEliminationReason =
  | 'CONTRADICTORY_OBSERVATION' // exclusion condition observed
  | 'IMPOSSIBLE_CROP'           // hypothesis crop_group ≠ known crop_group
  | 'NO_REQUIRED_MATCH';        // required conditions defined, zero observed
// NOTE: Stage/DAS mismatch is NEVER an elimination reason. Farmer-visible
// symptoms (LEVEL 1 evidence) outrank derived crop calendar (LEVEL 4).
// Stage/DAS conflicts become STAGE_CONTEXT_CONFLICT / DAS_CONTEXT_CONFLICT
// warnings that reduce confidence and request clarification, but never
// block a database-supported diagnosis.

export interface ContextGap {
  missing: 'CROP_UNKNOWN' | 'STAGE_UNKNOWN' | 'DAS_UNKNOWN';
  confidence_penalty: number;
  clarification_required: boolean;
}

export interface GraphHypothesisCandidate {
  hypothesis_id: string;
  cause_en: string | null;
  cause_hi: string | null;
  cause_mr: string | null;
  canonical_group: string | null;
  crop_group: string | null;
  severity_model: string | null;

  positive_matches: string[];   // observed ∩ (required|supporting)
  negative_matches: string[];   // observed ∩ (blocking|exclusion)
  missing_required: string[];   // required ∧ ¬observed
  blocking_conditions: string[]; // blocking hits currently active

  required_total: number;
  required_matched: number;
  required_match_pct: number;
  supporting_score: number;      // weighted 0..1
  confidence: number;            // aggregated 0..1

  context_gaps: ContextGap[];    // unknown/absent context (never blocks)
  warnings: string[];            // soft conflicts (e.g. STAGE_CONTEXT_CONFLICT)
  clarification_required: boolean;

  candidate_rule_ids: string[];  // ONLY from hypothesis_rule_mapping
  selected_rule_id: null;        // populated later by rule evaluator
  eliminated: boolean;
  eliminated_reason?: HypothesisEliminationReason | string;
}

export interface GraphHypothesisResult {
  candidates: GraphHypothesisCandidate[];
  eliminated: GraphHypothesisCandidate[];
  input_observations: string[];
  trace_id: string;
  timings_ms: number;
  /** Map<hypothesis_id, rule_id[]> — orchestrator inverts to ruleToHypothesis. */
  rule_edges?: Map<string, string[]> | Record<string, string[]>;
  /**
   * P2 (Batch A) — machine-readable reason the graph produced no surviving
   * candidate. `null` when at least one candidate survived. Consumers MUST
   * branch on this instead of inferring intent from empty arrays.
   */
  structured_gap_reason?: GraphStructuredGapReason | null;
}

/** P2 (Batch A) — exhaustive set of graph no-survivor causes. */
export type GraphStructuredGapReason =
  | 'NO_OBSERVATION_EVIDENCE'    // nothing resolvable arrived at the graph
  | 'NO_DISCOVERY_SEEDS'         // codes resolved, zero hypothesis_conditions anchors
  | 'NO_STAGE_VALID_HYPOTHESES'  // anchors found, all killed by DB-required STAGE/DAS gates
  | 'PARTIAL_MATCH_ONLY'         // anchors found and partially matched, none survived
  | 'ALL_ELIMINATED';            // anchors found, eliminated by agronomic contradiction


export interface NormalizedObservationCode {
  canonicalCode: string;
  matchKey: string;
}

interface ObservationSet {
  observations: string[];
  keys: Set<string>;
  canonicalByKey: Map<string, string>;
}

type CanonicalCodeMap = Map<string, string>;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function evaluateHypothesisGraph(
  input: GraphHypothesisInput,
): Promise<GraphHypothesisResult> {
  const started = Date.now();
  const trace = String(input.trace_id ?? `hg_${started}`);
  const observed = await normalizeObservationSet(input.observation_codes, input.supabase);

  if (observed.keys.size === 0) {
    emitObsToHyp(trace, input, [], [], [], []);
    emitEmptyHypToRule(trace, 'NO_OBSERVATION_EVIDENCE');
    return {
      candidates: [],
      eliminated: [],
      input_observations: [],
      trace_id: trace,
      timings_ms: Date.now() - started,
      structured_gap_reason: 'NO_OBSERVATION_EVIDENCE',
    };
  }

  // Step 1 — anchor hypotheses that mention ANY observed code
  const anchorHypIds = await queryAnchorHypotheses(input.supabase, observed, trace);
  if (anchorHypIds.length === 0) {
    emitObsToHyp(trace, input, observed.observations, [], [], []);
    emitGraphDataGap(trace, observed.observations, 'NO_OBSERVATION_CONDITION_MATCH');
    emitEmptyHypToRule(trace, 'NO_HYPOTHESIS_EDGE');
    return {
      candidates: [],
      eliminated: [],
      input_observations: observed.observations,
      trace_id: trace,
      timings_ms: Date.now() - started,
      structured_gap_reason: 'NO_DISCOVERY_SEEDS',
    };
  }

  // Step 2 — pull FULL condition sets for those hypotheses (positive + negative)
  const allConditions = await queryAllConditions(input.supabase, anchorHypIds);

  // v5-P8 — biological stage-authority threshold (graph math, not agronomy).
  const bioStageThreshold = await readBioStageHardGateThreshold(input.supabase);
  const predictedStageConfidence =
    typeof input.predicted_stage_confidence === 'number'
      ? input.predicted_stage_confidence
      : 1.0;
  const stageHardGateActive = predictedStageConfidence >= bioStageThreshold;
  console.log(
    `[BIO_STAGE_AUTHORITY] trace=${trace} predicted_stage_confidence=${predictedStageConfidence.toFixed(2)} ` +
      `threshold=${bioStageThreshold.toFixed(2)} hard_gate=${stageHardGateActive}`,
  );

  // Step 3 — join hypothesis_master metadata (active only; NO crop filter here;
  // crop mismatch is evaluated per-candidate as a true contradiction below).
  const master = await queryMaster(input.supabase, anchorHypIds);

  // Step 4 — rule edges
  const ruleEdges = await queryRuleMapping(input.supabase, anchorHypIds);

  const candidates: GraphHypothesisCandidate[] = [];
  const eliminated: GraphHypothesisCandidate[] = [];
  const droppedInactive: string[] = [];
  const droppedMissingMaster: string[] = [];

  // Normalize the known crop identity (null / unknown / '' → UNKNOWN)
  const knownCropGroup = normalizeCropGroup(input.crop_group ?? input.crop_code);
  const cropKnown = knownCropGroup !== null;

  for (const hid of anchorHypIds) {
    const m = master.get(hid);
    if (!m) { droppedMissingMaster.push(hid); continue; }
    if (m.is_active === false) { droppedInactive.push(hid); continue; }

    const conds = allConditions.get(hid) ?? [];
    const conditionCanonical = await buildCanonicalCodeMap(input.supabase, conds.flatMap(resolveConditionObservationCodes));
    const buckets = bucketizeConditions(conds, observed, conditionCanonical);

    const rules = ruleEdges.get(hid) ?? [];

    const requiredTotal = buckets.requiredCodes.size;
    const requiredMatched = buckets.positive_matches.filter((c) =>
      buckets.requiredCodes.has(normalizeObservationCode(c)?.matchKey ?? ''),
    ).length;
    const requiredPct = requiredTotal === 0 ? 1 : requiredMatched / requiredTotal;

    const supportingScore = buckets.positive_weight_total === 0
      ? 0
      : Math.min(1, buckets.positive_weight_matched / buckets.positive_weight_total);
    const hasObservationEvidence = buckets.positive_matches.length > 0;

    // STAGE / DAS are DB-authored context signals. Once farmer-visible
    // observation evidence anchors a hypothesis, context mismatch reduces
    // confidence and asks clarification; it must not delete the candidate.
    const stagePassRaw = checkStageCondition(conds, input.growth_stage, input.crop_code ?? input.crop_group ?? null);
    const dasPass = checkDasCondition(conds, input.das);

    // v5-P8 — downgrade STAGE hard-fail to soft when biological stage
    // authority is below the DB-defined threshold. DAS hard-fail is unchanged.
    const stagePass = (stagePassRaw.required_fail && !stageHardGateActive)
      ? (() => {
          console.log(
            `[BIO_STAGE_AUTHORITY][downgrade] trace=${trace} hypothesis_id=${hid} ` +
              `stage_reason="${stagePassRaw.reason}" → SOFT (predicted_stage_confidence=${predictedStageConfidence.toFixed(2)} < ${bioStageThreshold.toFixed(2)})`,
          );
          return { pass: false, reason: stagePassRaw.reason, required_fail: false };
        })()
      : stagePassRaw;

    // ── S1 — HARD biological stage gate ───────────────────────────────────
    // Biological invariant: a hypothesis whose DB-authored STAGE condition
    // does NOT include the current (known) stage is biologically impossible
    // for this turn. Elimination is a HARD gate, not a soft penalty. This is
    // the symbolic half of "neuro-symbolic": physically impossible hypotheses
    // cannot survive regardless of neural evidence strength.
    // Stage expectations come exclusively from hypothesis_conditions (DB).
    const expectedStages = collectExpectedStages(conds);
    const currentStage = input.growth_stage
      ? normalizeStageForDB(String(input.growth_stage)).toLowerCase()
      : null;
    const _biologicallyImpossible =
      expectedStages.length > 0 &&
      !!currentStage &&
      !stagePassRaw.pass &&
      stagePassRaw.reason.startsWith('expected=');
    if (_biologicallyImpossible) {
      const reason = `REQUIRED_STAGE_FAILED(BIOLOGICALLY_IMPOSSIBLE:${stagePassRaw.reason})`;
      console.warn(
        `[HYP_BIOLOGICAL_GATE] eliminated hypothesis=${hid} ` +
          `reason=stage_impossible expected=[${expectedStages.join('|')}] got=${currentStage} ` +
          `trace=${trace}`,
      );
      eliminated.push({
        hypothesis_id: hid,
        cause_en: m.cause_name_en ?? null,
        cause_hi: m.cause_name_hi ?? null,
        cause_mr: m.cause_name_mr ?? null,
        canonical_group: m.canonical_group ?? null,
        crop_group: m.crop_group ?? null,
        severity_model: m.severity_model ?? null,
        positive_matches: buckets.positive_matches,
        negative_matches: buckets.negative_matches,
        missing_required: buckets.missing_required,
        blocking_conditions: buckets.blocking_conditions,
        required_total: requiredTotal,
        required_matched: requiredMatched,
        required_match_pct: requiredPct,
        supporting_score: supportingScore,
        confidence: 0,
        context_gaps: [],
        warnings: [`ELIMINATED:${reason}`],
        clarification_required: false,
        candidate_rule_ids: [],
        selected_rule_id: null,
        eliminated: true,
        eliminated_reason: reason,
      } as GraphHypothesisCandidate);
      continue;
    }

    if ((stagePass.required_fail || dasPass.required_fail) && !hasObservationEvidence) {

      const reason = stagePass.required_fail
        ? `REQUIRED_STAGE_FAILED(${stagePass.reason})`
        : `REQUIRED_DAS_FAILED(${dasPass.reason})`;
      console.log(`[HYP_ELIMINATED] trace=${trace} hypothesis_id=${hid} reason=${reason} evidence=false`);
      eliminated.push({
        hypothesis_id: hid,
        cause_en: m.cause_name_en ?? null,
        cause_hi: m.cause_name_hi ?? null,
        cause_mr: m.cause_name_mr ?? null,
        canonical_group: m.canonical_group ?? null,
        crop_group: m.crop_group ?? null,
        severity_model: m.severity_model ?? null,
        positive_matches: buckets.positive_matches,
        negative_matches: buckets.negative_matches,
        missing_required: buckets.missing_required,
        blocking_conditions: buckets.blocking_conditions,
        required_total: requiredTotal,
        required_matched: requiredMatched,
        required_match_pct: requiredPct,
        supporting_score: supportingScore,
        confidence: 0,
        context_gaps: [],
        warnings: [`ELIMINATED:${reason}`],
        clarification_required: false,
        candidate_rule_ids: [],
        selected_rule_id: null,
        eliminated: true,
        eliminated_reason: reason,
      } as GraphHypothesisCandidate);
      continue;
    }

    // ── Context gap detection (unknown ≠ contradiction) ──────────────────
    const context_gaps: ContextGap[] = [];
    const warnings: string[] = [];
    let softPenalty = 0;

    if (!cropKnown) {
      context_gaps.push({ missing: 'CROP_UNKNOWN', confidence_penalty: 0.10, clarification_required: true });
    }
    if (stagePass.pass && stagePass.reason === 'STAGE_UNKNOWN' && hasStageCondition(conds)) {
      context_gaps.push({ missing: 'STAGE_UNKNOWN', confidence_penalty: 0.05, clarification_required: false });
    }
    if (dasPass.pass && dasPass.reason === 'DAS_UNKNOWN' && hasDasCondition(conds)) {
      context_gaps.push({ missing: 'DAS_UNKNOWN', confidence_penalty: 0.05, clarification_required: false });
    }
    if (!stagePass.pass) {
      warnings.push(`STAGE_CONTEXT_CONFLICT(${stagePass.reason})`);
      if (stagePass.required_fail && hasObservationEvidence) warnings.push('SURVIVED_WITH_STAGE_WARNING');
      softPenalty += 0.15;
    }
    if (!dasPass.pass) {
      warnings.push(`DAS_CONTEXT_CONFLICT(${dasPass.reason})`);
      if (dasPass.required_fail && hasObservationEvidence) warnings.push('SURVIVED_WITH_DAS_WARNING');
      softPenalty += 0.10;
    }
    const contextPenalty = context_gaps.reduce((s, g) => s + g.confidence_penalty, 0);

    // Aggregated confidence — required 60 %, supporting 30 %, negative penalty 10 %,
    // minus context-gap + soft-conflict penalties (never block).
    const negativePenalty = Math.min(
      1,
      (buckets.negative_matches.length + buckets.blocking_conditions.length * 0.5) / 4,
    );
    let confidence = 0.6 * requiredPct + 0.3 * supportingScore - 0.1 * negativePenalty - contextPenalty - softPenalty;
    confidence = Math.max(0, Math.min(1, confidence));

    const candidate: GraphHypothesisCandidate = {
      hypothesis_id: hid,
      cause_en: m.cause_name_en ?? null,
      cause_hi: m.cause_name_hi ?? null,
      cause_mr: m.cause_name_mr ?? null,
      canonical_group: m.canonical_group ?? null,
      crop_group: m.crop_group ?? null,
      severity_model: m.severity_model ?? null,

      positive_matches: buckets.positive_matches,
      negative_matches: buckets.negative_matches,
      missing_required: buckets.missing_required,
      blocking_conditions: buckets.blocking_conditions,

      required_total: requiredTotal,
      required_matched: requiredMatched,
      required_match_pct: requiredPct,
      supporting_score: supportingScore,
      confidence,

      context_gaps,
      warnings,
      clarification_required:
        context_gaps.some((g) => g.clarification_required) || warnings.length > 0,

      candidate_rule_ids: rules,
      selected_rule_id: null,
      eliminated: false,
    };

    // ── ELIMINATION: only true agronomic contradictions may remove ────────
    // Allowed reasons: CONTRADICTORY_OBSERVATION, IMPOSSIBLE_CROP,
    // NO_REQUIRED_MATCH. Stage/DAS mismatch is NEVER an elimination reason.
    const hypCropGroup = normalizeCropGroup(m.crop_group);
    const cropContradiction =
      cropKnown &&
      hypCropGroup !== null &&
      hypCropGroup !== 'universal' &&
      hypCropGroup !== knownCropGroup;

    if (buckets.negative_matches.some((c) => buckets.exclusionCodes.has(normalizeObservationCode(c)?.matchKey ?? ''))) {
      candidate.eliminated = true;
      candidate.eliminated_reason = 'CONTRADICTORY_OBSERVATION';
    } else if (cropContradiction) {
      candidate.eliminated = true;
      candidate.eliminated_reason = `IMPOSSIBLE_CROP(hyp=${hypCropGroup} ctx=${knownCropGroup})`;
    } else if (requiredTotal > 0 && requiredMatched === 0) {
      candidate.eliminated = true;
      candidate.eliminated_reason = 'NO_REQUIRED_MATCH';
    }

    if (candidate.eliminated) eliminated.push(candidate);
    else candidates.push(candidate);
  }

  // ── RULE/STAGE COHERENCE INVARIANT (2026-07-27) ─────────────────────────
  // A hypothesis that survives the stage gate while EVERY rule it maps to is
  // scoped out of the current stage / crop-age cannot produce a decision. It
  // silently becomes an empty decision → re-promoted clarification → loop.
  // Drop it here, with a curator-visible log, instead of emitting a card.
  {
    const allRuleIds = Array.from(
      new Set(candidates.flatMap((c) => c.candidate_rule_ids ?? []).map(String)),
    );
    const scopes = await queryRuleStageScope(input.supabase, allRuleIds);
    if (scopes.size > 0) {
      const curStage = input.growth_stage
        ? normalizeStageForDB(String(input.growth_stage)).toLowerCase()
        : null;
      const curDas = typeof input.das === 'number' && Number.isFinite(input.das) ? input.das : null;
      const admits = (rid: string): boolean => {
        const s = scopes.get(String(rid));
        if (!s) return true; // unknown scope → never eliminate on missing data
        if (curStage && s.stages.length > 0) {
          const compat = stageCompatibility(curStage, s.stages, input.crop_code ?? input.crop_group ?? null);
          if (!(compat.unknown || compat.exact || compat.family)) return false;
        }
        if (curDas != null) {
          if (s.age_min != null && curDas < s.age_min) return false;
          if (s.age_max != null && curDas > s.age_max) return false;
        }
        return true;
      };
      for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        const rids = (c.candidate_rule_ids ?? []).map(String);
        if (rids.length === 0) continue;
        if (rids.some(admits)) continue;
        console.warn(
          `[HYP_RULE_STAGE_INCOHERENT] trace=${trace} hypothesis=${c.hypothesis_id} ` +
            `stage=${curStage} das=${curDas} rules=[${rids.slice(0, 5).join(',')}] ` +
            `action=eliminated reason=no_rule_applicable_at_context`,
        );
        c.eliminated = true;
        c.eliminated_reason = 'RULE_SCOPE_INCOHERENT';
        c.confidence = 0;
        candidates.splice(i, 1);
        eliminated.push(c);
      }
    }
  }




  // Rank surviving candidates
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (b.required_match_pct !== a.required_match_pct) return b.required_match_pct - a.required_match_pct;
    return b.positive_matches.length - a.positive_matches.length;
  });

  const matchedHypothesisIds = [...candidates, ...eliminated].map((c) => c.hypothesis_id);
  if (droppedMissingMaster.length > 0) {
    emitGraphDataGap(trace, droppedMissingMaster, 'ANCHOR_MATCHED_BUT_NO_MASTER_ROW');
  }
  if (droppedInactive.length > 0) {
    console.warn(`[HYP_VALIDATION] trace=${trace} inactive_dropped=[${cap(droppedInactive).join(',')}]`);
  }

  emitObsToHyp(
    trace,
    input,
    observed.observations,
    matchedHypothesisIds,
    eliminated.map((c) => c.hypothesis_id),
    [], // stage/das mismatch no longer blocks
  );

  // ── HYP_VALIDATION trace — full decision visibility, no silent pruning ─
  console.log(
    `[HYP_VALIDATION] trace=${trace} ` +
      `survived=[${cap(candidates.map((c) => c.hypothesis_id)).join(',')}] ` +
      `blocked=${JSON.stringify(eliminated.map((c) => ({ h: c.hypothesis_id, r: c.eliminated_reason })))} ` +
      `warnings=${JSON.stringify(candidates.map((c) => ({ h: c.hypothesis_id, w: c.warnings })).filter((x) => x.w.length > 0))} ` +
      `stage_penalty_applied=${candidates.some((c) => c.warnings.some((w) => w.includes('STAGE_CONTEXT_CONFLICT')))} ` +
      `context_gaps=${JSON.stringify(candidates.map((c) => ({ h: c.hypothesis_id, g: c.context_gaps.map((x) => x.missing) })).filter((x) => x.g.length > 0))}`,
  );

  // ── GRAPH DEATH INVARIANT ─────────────────────────────────────────────
  // If OBS_TO_HYP matched hypotheses but zero survive AND every elimination
  // reason is non-agronomic → over-filtering bug. Fail loud.
  //
  // DB-required STAGE/DAS gates are different: they are valid curated graph
  // outcomes. A farmer may report an emergence symptom while the locked
  // BiologicalState says transplanting; that is a stage-context conflict / no
  // surviving hypothesis result, not a transport failure. Do not throw here —
  // return the eliminated candidate set so the orchestrator can ask a scoped
  // clarification instead of wrapping this as GRAPH_PIPELINE_BYPASSED.
  const CONTRADICTION_REASONS = new Set(['CONTRADICTORY_OBSERVATION', 'NO_REQUIRED_MATCH']);
  const CONTRADICTION_PREFIXES = ['IMPOSSIBLE_CROP'];
  const DB_REQUIRED_GATE_PREFIXES = ['REQUIRED_STAGE_FAILED', 'REQUIRED_DAS_FAILED'];
  const isDbRequiredGateElimination = (r?: string) =>
    !!r && DB_REQUIRED_GATE_PREFIXES.some((p) => r.startsWith(p));
  const isAgronomicContradiction = (r?: string) =>
    !!r && (
      CONTRADICTION_REASONS.has(r) ||
      CONTRADICTION_PREFIXES.some((p) => r.startsWith(p)) ||
      isDbRequiredGateElimination(r)
    );
  const allEliminatedByDbRequiredGate =
    eliminated.length > 0 && eliminated.every((e) => isDbRequiredGateElimination(e.eliminated_reason));
  if (matchedHypothesisIds.length > 0 && candidates.length === 0 && allEliminatedByDbRequiredGate) {
    const detail = eliminated.map((e) => `${e.hypothesis_id}:${e.eliminated_reason ?? '?'}`).join('|');
    console.warn(
      `[GRAPH_STAGE_CONTEXT_EXHAUSTED] trace=${trace} matched=${matchedHypothesisIds.length} ` +
        `survived=0 db_required_gate=[${detail}] action=return_no_surviving_hypothesis`,
    );
  } else if (
    matchedHypothesisIds.length > 0 &&
    candidates.length === 0 &&
    eliminated.every((e) => !isAgronomicContradiction(e.eliminated_reason))
  ) {
    const detail = eliminated.map((e) => `${e.hypothesis_id}:${e.eliminated_reason ?? '?'}`).join('|');
    console.error(`[STAGE_FILTER_KILLED_VALID_DIAGNOSIS] trace=${trace} matched=${matchedHypothesisIds.length} survived=0 non_contradiction_reasons=[${detail}]`);
    throw new Error(`STAGE_FILTER_KILLED_VALID_DIAGNOSIS: hypotheses removed without agronomic contradiction — ${detail}`);
  }


  if (candidates.length === 0) {
    emitEmptyHypToRule(trace, anchorHypIds.length > 0 ? 'NO_SURVIVING_HYPOTHESIS' : 'NO_HYPOTHESIS_EDGE');
  }

  // ── P2 (Batch A) — structured gap classification ───────────────────────
  // Downstream consumers must never guess why the graph is empty. Order
  // matters: DB-required stage/DAS gates are the most specific cause,
  // partial evidence next, agronomic contradiction last.
  let structured_gap_reason: GraphStructuredGapReason | null = null;
  if (candidates.length === 0) {
    const hasPartialEvidence = eliminated.some((e) => (e.positive_matches ?? []).length > 0);
    if (allEliminatedByDbRequiredGate) {
      structured_gap_reason = 'NO_STAGE_VALID_HYPOTHESES';
    } else if (hasPartialEvidence) {
      structured_gap_reason = 'PARTIAL_MATCH_ONLY';
    } else if (eliminated.length > 0) {
      structured_gap_reason = 'ALL_ELIMINATED';
    } else {
      structured_gap_reason = 'NO_DISCOVERY_SEEDS';
    }
    console.warn(
      `[GRAPH_STRUCTURED_GAP] trace=${trace} reason=${structured_gap_reason} ` +
        `anchors=${anchorHypIds.length} eliminated=${eliminated.length} ` +
        `partial=[${cap(eliminated.filter((e) => (e.positive_matches ?? []).length > 0).map((e) => e.hypothesis_id)).join(',')}]`,
    );
  }

  return {
    candidates,
    eliminated,
    input_observations: observed.observations,
    trace_id: trace,
    timings_ms: Date.now() - started,
    /** Map<hypothesis_id, rule_id[]> — exposed so the orchestrator can invert
     *  it into the pure `edges.ruleToHypothesis` map required by
     *  buildGraphRuntimeSnapshot. Never mutated by the caller. */
    rule_edges: ruleEdges,
    structured_gap_reason,
  };
}

function normalizeCropGroup(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'unknown' || s === 'null' || s === 'undefined') return null;
  return s;
}

/** S1 — union of DB-authored allowed stages across all STAGE conditions. */
function collectExpectedStages(conds: ConditionRow[]): string[] {
  const out = new Set<string>();
  for (const c of conds) {
    if (c.condition_type !== 'STAGE') continue;
    for (const s of extractStages(c.value_json)) out.add(String(s).toLowerCase());
  }
  return [...out];
}

function hasStageCondition(conds: ConditionRow[]): boolean {

  return conds.some((c) => c.condition_type === 'STAGE');
}
function hasDasCondition(conds: ConditionRow[]): boolean {
  return conds.some((c) => c.condition_type === 'DAS_RANGE');
}

// ─────────────────────────────────────────────────────────────────────────────
// DB QUERIES
// ─────────────────────────────────────────────────────────────────────────────

async function queryAnchorHypotheses(supabase: any, observed: ObservationSet, trace: string): Promise<string[]> {
  try {
    const rows: ConditionRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('hypothesis_conditions')
        .select('hypothesis_id, condition_type, condition_key, operator, value_json, is_required, weight')
        .eq('condition_type', 'OBSERVATION')
        .eq('is_quarantined', false)
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn(`[HYP_GRAPH_ANCHOR_ERR] ${error.message}`);
        return [];
      }
      const batch = (data ?? []) as ConditionRow[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }

    const conditionCanonical = await buildCanonicalCodeMap(supabase, rows.flatMap(resolveConditionObservationCodes));
    const set = new Set<string>();
    const matchedRows: Array<{ hypothesis_id: string; matched: string[]; via: string }> = [];
    for (const r of rows) {
      const m = ObservationConditionMatcher(r, observed, conditionCanonical);
      if (m.matched && r?.hypothesis_id) {
        const hid = String(r.hypothesis_id);
        set.add(hid);
        matchedRows.push({ hypothesis_id: hid, matched: m.matched_observations, via: m.source });
      }
    }
    console.log(
      `[OBS_CONDITION_MATCHER] trace=${trace} scanned=${rows.length} matched_rows=${matchedRows.length} ` +
        `hyp=[${cap(matchedRows.map((m) => m.hypothesis_id)).join(',')}]`,
    );
    return [...set];
  } catch (e) {
    console.warn(`[HYP_GRAPH_ANCHOR_EX] ${(e as Error).message}`);
    return [];
  }
}

interface ConditionRow {
  hypothesis_id: string;
  condition_type: string;
  condition_key: string;
  operator: string;
  value_json: any;
  is_required: boolean;
  weight: number | null;
}

async function queryAllConditions(supabase: any, hypIds: string[]): Promise<Map<string, ConditionRow[]>> {
  const out = new Map<string, ConditionRow[]>();
  if (hypIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('hypothesis_conditions')
      .select('hypothesis_id, condition_type, condition_key, operator, value_json, is_required, weight')
      .eq('is_quarantined', false)
      .in('hypothesis_id', hypIds);
    if (error) {
      console.warn(`[HYP_GRAPH_COND_ERR] ${error.message}`);
      return out;
    }
    for (const r of (data ?? []) as ConditionRow[]) {
      const arr = out.get(r.hypothesis_id) ?? [];
      arr.push(r);
      out.set(r.hypothesis_id, arr);
    }
  } catch (e) {
    console.warn(`[HYP_GRAPH_COND_EX] ${(e as Error).message}`);
  }
  return out;
}

interface MasterRow {
  hypothesis_id: string;
  crop_group: string | null;
  canonical_group: string | null;
  cause_name_en: string | null;
  cause_name_hi: string | null;
  cause_name_mr: string | null;
  severity_model: string | null;
  is_active: boolean;
}

async function queryMaster(supabase: any, hypIds: string[]): Promise<Map<string, MasterRow>> {
  const out = new Map<string, MasterRow>();
  if (hypIds.length === 0) return out;
  try {
    // NO crop filter here — crop mismatch is evaluated per-candidate as
    // IMPOSSIBLE_CROP so the decision is visible in the trace instead of
    // silently pruning anchored hypotheses.
    const { data, error } = await supabase
      .from('hypothesis_master')
      .select('hypothesis_id, crop_group, canonical_group, cause_name_en, cause_name_hi, cause_name_mr, severity_model, is_active')
      .in('hypothesis_id', hypIds);
    if (error) {
      console.warn(`[HYP_GRAPH_MASTER_ERR] ${error.message}`);
      return out;
    }
    for (const r of (data ?? []) as MasterRow[]) out.set(r.hypothesis_id, r);
  } catch (e) {
    console.warn(`[HYP_GRAPH_MASTER_EX] ${(e as Error).message}`);
  }
  return out;
}

async function queryRuleMapping(supabase: any, hypIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (hypIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('hypothesis_rule_mapping')
      .select('hypothesis_id, rule_id, priority')
      .in('hypothesis_id', hypIds)
      .order('priority', { ascending: false });
    if (error) {
      console.warn(`[HYP_GRAPH_MAP_ERR] ${error.message}`);
      return out;
    }
    for (const r of (data ?? []) as any[]) {
      const hid = String(r.hypothesis_id);
      const arr = out.get(hid) ?? [];
      if (r.rule_id) arr.push(String(r.rule_id));
      out.set(hid, arr);
    }
  } catch (e) {
    console.warn(`[HYP_GRAPH_MAP_EX] ${(e as Error).message}`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUCKETING & STAGE/DAS GATES
// ─────────────────────────────────────────────────────────────────────────────

interface Buckets {
  requiredCodes: Set<string>;
  supportingCodes: Set<string>;
  blockingCodes: Set<string>;
  exclusionCodes: Set<string>;

  positive_matches: string[];
  negative_matches: string[];
  missing_required: string[];
  blocking_conditions: string[];

  positive_weight_total: number;
  positive_weight_matched: number;
}

function bucketizeConditions(conds: ConditionRow[], observed: ObservationSet, conditionCanonical: CanonicalCodeMap): Buckets {
  const b: Buckets = {
    requiredCodes: new Set(),
    supportingCodes: new Set(),
    blockingCodes: new Set(),
    exclusionCodes: new Set(),
    positive_matches: [],
    negative_matches: [],
    missing_required: [],
    blocking_conditions: [],
    positive_weight_total: 0,
    positive_weight_matched: 0,
  };

  for (const c of conds) {
    if (c.condition_type !== 'OBSERVATION') continue;
    const conditionCodes = resolveConditionObservationCodes(c);
    if (conditionCodes.length === 0) continue;
    const expectPresent = isValueTruthy(c.value_json);
    const w = Number(c.weight ?? 0) || (c.is_required ? 1 : 0.5);

    for (const conditionCode of conditionCodes) {
      const norm = normalizeObservationCode(canonicalizeWithMap(conditionCode, conditionCanonical));
      if (!norm) continue;
      const key = norm.matchKey;
      const displayCode = observed.canonicalByKey.get(key) ?? norm.canonicalCode;

      if (expectPresent) {
        if (c.is_required) b.requiredCodes.add(key);
        else b.supportingCodes.add(key);
        b.positive_weight_total += w;
        if (observed.keys.has(key)) {
          if (!b.positive_matches.includes(displayCode)) b.positive_matches.push(displayCode);
          b.positive_weight_matched += w;
        } else if (c.is_required) {
          if (!b.missing_required.includes(norm.canonicalCode)) b.missing_required.push(norm.canonicalCode);
        }
      } else {
        if (c.is_required) b.exclusionCodes.add(key);
        else b.blockingCodes.add(key);
        if (observed.keys.has(key)) {
          if (!b.negative_matches.includes(displayCode)) b.negative_matches.push(displayCode);
          if (!c.is_required && !b.blocking_conditions.includes(displayCode)) b.blocking_conditions.push(displayCode);
        }
      }
    }
  }
  return b;
}

function checkStageCondition(
  conds: ConditionRow[],
  stage: string | null,
  crop: string | null,
): { pass: boolean; reason: string; required_fail: boolean } {
  const rows = conds.filter((c) => c.condition_type === 'STAGE');
  if (rows.length === 0) return { pass: true, reason: 'NO_STAGE_COND', required_fail: false };
  if (!stage) return { pass: true, reason: 'STAGE_UNKNOWN', required_fail: false }; // don't eliminate without ground truth
  const s = normalizeStageForDB(String(stage)).toLowerCase();
  let requiredFail = false;
  let failReason = '';
  for (const r of rows) {
    const allowed = extractStages(r.value_json);
    if (allowed.length === 0) continue;
    const compatibility = stageCompatibility(s, allowed, crop);
    // FIX (2026-07-27): `crop_stage_graph` edges are ADJACENCY, not identity.
    // Accepting `compatibility.family` for an is_required=true STAGE condition
    // let `transplanting`-only hypotheses survive at `tillering` (adjacent via
    // the TRIGGERS edge) — biologically impossible. Required stages must match
    // EXACTLY; adjacency remains acceptable for supporting (soft) conditions.
    const ok = compatibility.unknown ||
      compatibility.exact ||
      (r.is_required === true ? false : compatibility.family);
    if (!ok) {
      failReason = `expected=[${allowed.join('|')}] got=${s}`;
      // FIX (2026-07-08): Honor DB SSOT — is_required=true STAGE mismatch
      // is a HARD elimination, not a soft penalty. See hypothesis_conditions.
      if (r.is_required === true) {
        if (compatibility.family) failReason += ' match=adjacent_only';
        return { pass: false, reason: failReason, required_fail: true };
      }
      // soft fail (is_required=false) — keep prior behavior (penalty later)
      return { pass: false, reason: failReason, required_fail: false };
    }
  }
  return { pass: true, reason: 'STAGE_OK', required_fail: false };
}

function checkDasCondition(
  conds: ConditionRow[],
  das: number | null,
): { pass: boolean; reason: string; required_fail: boolean } {
  const rows = conds.filter((c) => c.condition_type === 'DAS_RANGE');
  if (rows.length === 0) return { pass: true, reason: 'NO_DAS_COND', required_fail: false };
  if (das == null || !Number.isFinite(das)) return { pass: true, reason: 'DAS_UNKNOWN', required_fail: false };
  for (const r of rows) {
    const v = r.value_json ?? {};
    const min = typeof v.min === 'number' ? v.min : null;
    const max = typeof v.max === 'number' ? v.max : null;
    const op = String(r.operator ?? 'BETWEEN').toUpperCase();
    let failReason: string | null = null;
    if (op === 'BETWEEN') {
      if (min != null && das < min) failReason = `das=${das}<min=${min}`;
      else if (max != null && das > max) failReason = `das=${das}>max=${max}`;
    } else if (op === 'GT') {
      if (min != null && das < min) failReason = `das=${das}<gt_min=${min}`;
    } else if (op === 'LT') {
      if (max != null && das > max) failReason = `das=${das}>lt_max=${max}`;
    }
    if (failReason) {
      // FIX (2026-07-08): Hard-eliminate on is_required=true DAS_RANGE fail.
      return { pass: false, reason: failReason, required_fail: r.is_required === true };
    }
  }
  return { pass: true, reason: 'DAS_OK', required_fail: false };
}

function extractStages(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).toLowerCase());
  if (Array.isArray(v?.stages)) return v.stages.map((x: any) => String(x).toLowerCase());
  if (Array.isArray(v?.allowed_stages)) return v.allowed_stages.map((x: any) => String(x).toLowerCase());
  if (typeof v === 'string') return [v.toLowerCase()];
  return [];
}

function isValueTruthy(v: any): boolean {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  if (v && typeof v === 'object' && 'value' in v) return isValueTruthy((v as any).value);
  return true; // for structured values (WEATHER/SOIL) treat as positive
}

export function normalizeObservationCode(code: unknown): NormalizedObservationCode | null {
  if (code == null) return null;
  const canonicalCode = String(code).trim();
  if (!canonicalCode) return null;
  return {
    canonicalCode,
    matchKey: canonicalCode.toLowerCase(),
  };
}

async function normalizeObservationSet(codes: string[], supabase?: any): Promise<ObservationSet> {
  const observations: string[] = [];
  const keys = new Set<string>();
  const canonicalByKey = new Map<string, string>();
  const canonicalMap = await buildCanonicalCodeMap(supabase, codes ?? []);
  for (const c of codes ?? []) {
    const norm = normalizeObservationCode(canonicalizeWithMap(c, canonicalMap));
    if (!norm || keys.has(norm.matchKey)) continue;
    keys.add(norm.matchKey);
    canonicalByKey.set(norm.matchKey, norm.canonicalCode);
    observations.push(norm.canonicalCode);
  }
  return { observations, keys, canonicalByKey };
}

interface ObservationConditionMatch {
  matched: boolean;
  matched_observations: string[];
  source: 'condition_key' | 'value_json' | 'condition_key_and_value_json';
}

function ObservationConditionMatcher(row: ConditionRow, observed: ObservationSet, conditionCanonical: CanonicalCodeMap): ObservationConditionMatch {
  const keyCodes = normalizeObservationCode(row.condition_key) ? [String(row.condition_key)] : [];
  const valueCodes = extractObservationCodesFromValueJson(row.value_json);
  const keyMatches = keyCodes
    .map((c) => normalizeObservationCode(canonicalizeWithMap(c, conditionCanonical)))
    .filter((x): x is NormalizedObservationCode => !!x && observed.keys.has(x.matchKey))
    .map((x) => observed.canonicalByKey.get(x.matchKey) ?? x.canonicalCode);
  const valueMatches = valueCodes
    .map((c) => normalizeObservationCode(canonicalizeWithMap(c, conditionCanonical)))
    .filter((x): x is NormalizedObservationCode => !!x && observed.keys.has(x.matchKey))
    .map((x) => observed.canonicalByKey.get(x.matchKey) ?? x.canonicalCode);
  const matched_observations = Array.from(new Set([...keyMatches, ...valueMatches]));
  const source = keyMatches.length > 0 && valueMatches.length > 0
    ? 'condition_key_and_value_json'
    : valueMatches.length > 0
      ? 'value_json'
      : 'condition_key';
  return { matched: matched_observations.length > 0, matched_observations, source };
}

async function buildCanonicalCodeMap(supabase: any, codes: ReadonlyArray<unknown>): Promise<CanonicalCodeMap> {
  const unique = Array.from(new Set((codes ?? []).map((c) => String(c ?? '').trim()).filter(Boolean)));
  if (unique.length === 0) return new Map();
  return await resolveObservationSymbolMap(supabase, unique);
}

function canonicalizeWithMap(code: unknown, canonical: CanonicalCodeMap): string {
  const raw = String(code ?? '').trim();
  for (const v of codeVariants(raw)) {
    const found = canonical.get(v);
    if (found) return found;
  }
  return raw;
}

function codeVariants(code: unknown): string[] {
  const raw = String(code ?? '').trim();
  if (!raw) return [];
  return Array.from(new Set([
    raw,
    raw.toLowerCase(),
    raw.toUpperCase(),
    raw.toLowerCase().replace(/[\s-]+/g, '_'),
  ]));
}

function resolveConditionObservationCodes(row: ConditionRow): string[] {
  const valueCodes = extractObservationCodesFromValueJson(row.value_json);
  if (valueCodes.length > 0) return Array.from(new Set(valueCodes.map((x) => String(x).trim()).filter(Boolean)));
  const key = normalizeObservationCode(row.condition_key);
  return key ? [key.canonicalCode] : [];
}

function extractObservationCodesFromValueJson(value: any): string[] {
  const out: string[] = [];
  const push = (v: any) => {
    const norm = normalizeObservationCode(v);
    if (norm) out.push(norm.canonicalCode);
  };
  const walk = (v: any, keyHint?: string) => {
    if (v == null || typeof v === 'boolean' || typeof v === 'number') return;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if ((keyHint && isObservationValueKey(keyHint)) || (s !== 'true' && s !== 'false')) push(v);
      return;
    }
    if (Array.isArray(v)) {
      if (keyHint && isObservationValueKey(keyHint)) {
        for (const item of v) push(item);
      } else {
        for (const item of v) {
          if (typeof item === 'string') push(item);
          else walk(item, keyHint);
        }
      }
      return;
    }
    if (typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        walk(child, isObservationValueKey(k) ? k : undefined);
      }
    }
  };
  walk(value);
  return Array.from(new Set(out));
}

function isObservationValueKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k === 'code'
    || k === 'codes'
    || k === 'observation'
    || k === 'observations'
    || k === 'observation_code'
    || k === 'observation_codes'
    || k === 'reported_code'
    || k === 'reported_codes'
    || k === 'symptom'
    || k === 'symptoms';
}

function emitGraphDataGap(trace: string, observations: string[], reason: string): void {
  console.warn(
    `[GRAPH_DATA_GAP] trace=${trace} reason=${reason} missing_observation_to_hypothesis_edge=[${cap(observations).join(',')}]`,
  );
}

function emitEmptyHypToRule(trace: string, reason: string): void {
  console.log(`[HYP_TO_RULE] trace=${trace} hyp=[] candidate_rules=[] missing_edges=[] reason=${reason}`);
  console.log(`[RULE_RESULT] trace=${trace} winner=none reason=${reason}`);
}

function cap(arr: string[]): string[] {
  return arr.length <= 12 ? arr : [...arr.slice(0, 12), `+${arr.length - 12}`];
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACE
// ─────────────────────────────────────────────────────────────────────────────

function emitObsToHyp(
  trace: string,
  input: GraphHypothesisInput,
  observations: string[],
  matched: string[],
  excluded: string[],
  blocked: string[],
): void {
  console.log(
    `[OBS_TO_HYP] trace=${trace} crop=${input.crop_code ?? '?'} stage=${input.growth_stage ?? '?'} das=${input.das ?? '?'} ` +
      `obs=[${cap(observations).join(',')}] matched=[${cap(matched).join(',')}] blocked=[${cap(blocked).join(',')}] excluded=[${cap(excluded).join(',')}]`,
  );
}

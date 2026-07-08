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

export interface GraphHypothesisInput {
  crop_code: string | null;
  crop_group?: string | null;
  growth_stage: string | null;
  das: number | null;
  observation_codes: string[];
  supabase: any;
  trace_id?: string | null;
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
}

export interface NormalizedObservationCode {
  canonicalCode: string;
  matchKey: string;
}

interface ObservationSet {
  observations: string[];
  keys: Set<string>;
  canonicalByKey: Map<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function evaluateHypothesisGraph(
  input: GraphHypothesisInput,
): Promise<GraphHypothesisResult> {
  const started = Date.now();
  const trace = String(input.trace_id ?? `hg_${started}`);
  const observed = normalizeObservationSet(input.observation_codes);

  if (observed.keys.size === 0) {
    emitObsToHyp(trace, input, [], [], [], []);
    emitEmptyHypToRule(trace, 'NO_OBSERVATION_EVIDENCE');
    return {
      candidates: [],
      eliminated: [],
      input_observations: [],
      trace_id: trace,
      timings_ms: Date.now() - started,
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
    };
  }

  // Step 2 — pull FULL condition sets for those hypotheses (positive + negative)
  const allConditions = await queryAllConditions(input.supabase, anchorHypIds);

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
    const buckets = bucketizeConditions(conds, observed);

    // STAGE / DAS gate — enforced from the DB, not from TS ontology.
    // UNKNOWN context returns pass=true so it never eliminates.
    const stagePass = checkStageCondition(conds, input.growth_stage);
    const dasPass = checkDasCondition(conds, input.das);

    // ── HARD REQUIRED-CONDITION GATE (fix 2026-07-08) ────────────────────
    // hypothesis_conditions.is_required=true is a DB-level HARD contract.
    // If STAGE or DAS_RANGE with is_required=true fails, the hypothesis is
    // eliminated — no soft penalty, no clarification fallback. This is what
    // the DB SSOT already declares; the runtime must respect it.
    if (stagePass.required_fail) {
      console.log(`[HYP_ELIMINATED] trace=${trace} hypothesis_id=${hid} reason=REQUIRED_STAGE_FAILED ${stagePass.reason}`);
      eliminated.push({
        hypothesis_id: hid,
        cause_en: m.cause_name_en ?? null,
        cause_hi: m.cause_name_hi ?? null,
        cause_mr: m.cause_name_mr ?? null,
        canonical_group: m.canonical_group ?? null,
        crop_group: m.crop_group ?? null,
        severity_model: m.severity_model ?? null,
        positive_matches: [], negative_matches: [], missing_required: [],
        blocking_conditions: [], required_total: 0, required_matched: 0,
        required_match_pct: 0, supporting_score: 0, confidence: 0,
        context_gaps: [],
        warnings: [`ELIMINATED:REQUIRED_STAGE_FAILED(${stagePass.reason})`],
        clarification_required: false,
        candidate_rule_ids: [],
        selected_rule_id: null,
        eliminated: true,
        eliminated_reason: `REQUIRED_STAGE_FAILED(${stagePass.reason})`,
      } as GraphHypothesisCandidate);
      continue;
    }
    if (dasPass.required_fail) {
      console.log(`[HYP_ELIMINATED] trace=${trace} hypothesis_id=${hid} reason=REQUIRED_DAS_FAILED ${dasPass.reason}`);
      eliminated.push({
        hypothesis_id: hid,
        cause_en: m.cause_name_en ?? null,
        cause_hi: m.cause_name_hi ?? null,
        cause_mr: m.cause_name_mr ?? null,
        canonical_group: m.canonical_group ?? null,
        crop_group: m.crop_group ?? null,
        severity_model: m.severity_model ?? null,
        positive_matches: [], negative_matches: [], missing_required: [],
        blocking_conditions: [], required_total: 0, required_matched: 0,
        required_match_pct: 0, supporting_score: 0, confidence: 0,
        context_gaps: [],
        warnings: [`ELIMINATED:REQUIRED_DAS_FAILED(${dasPass.reason})`],
        clarification_required: false,
        candidate_rule_ids: [],
      } as GraphHypothesisCandidate);
      continue;
    }

    const rules = ruleEdges.get(hid) ?? [];

    const requiredTotal = buckets.requiredCodes.size;
    const requiredMatched = buckets.positive_matches.filter((c) =>
      buckets.requiredCodes.has(normalizeObservationCode(c)?.matchKey ?? ''),
    ).length;
    const requiredPct = requiredTotal === 0 ? 1 : requiredMatched / requiredTotal;

    const supportingScore = buckets.positive_weight_total === 0
      ? 0
      : Math.min(1, buckets.positive_weight_matched / buckets.positive_weight_total);

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
    // Soft (is_required=false) stage/DAS mismatch remains a soft penalty
    // so farmer-visible symptoms can still outrank a soft calendar signal.
    if (!stagePass.pass && !stagePass.required_fail) {
      warnings.push(`STAGE_CONTEXT_CONFLICT(${stagePass.reason})`);
      softPenalty += 0.15;
    }
    if (!dasPass.pass && !dasPass.required_fail) {
      warnings.push(`DAS_CONTEXT_CONFLICT(${dasPass.reason})`);
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
      `context_gaps=${JSON.stringify(candidates.map((c) => ({ h: c.hypothesis_id, g: c.context_gaps.map((x) => x.missing) })).filter((x) => x.g.length > 0))}`,
  );

  // ── GRAPH DEATH INVARIANT ─────────────────────────────────────────────
  // If OBS_TO_HYP matched hypotheses but zero survive AND every elimination
  // reason is non-agronomic → over-filtering bug. Fail loud.
  const CONTRADICTION_REASONS = new Set(['CONTRADICTORY_OBSERVATION', 'NO_REQUIRED_MATCH']);
  const CONTRADICTION_PREFIXES = ['IMPOSSIBLE_CROP'];
  const isAgronomicContradiction = (r?: string) =>
    !!r && (CONTRADICTION_REASONS.has(r) || CONTRADICTION_PREFIXES.some((p) => r.startsWith(p)));
  if (
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

  return {
    candidates,
    eliminated,
    input_observations: observed.observations,
    trace_id: trace,
    timings_ms: Date.now() - started,
  };
}

function normalizeCropGroup(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'unknown' || s === 'null' || s === 'undefined') return null;
  return s;
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

    const set = new Set<string>();
    const matchedRows: Array<{ hypothesis_id: string; matched: string[]; via: string }> = [];
    for (const r of rows) {
      const m = ObservationConditionMatcher(r, observed);
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

function bucketizeConditions(conds: ConditionRow[], observed: ObservationSet): Buckets {
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
      const norm = normalizeObservationCode(conditionCode);
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
): { pass: boolean; reason: string; required_fail: boolean } {
  const rows = conds.filter((c) => c.condition_type === 'STAGE');
  if (rows.length === 0) return { pass: true, reason: 'NO_STAGE_COND', required_fail: false };
  if (!stage) return { pass: true, reason: 'STAGE_UNKNOWN', required_fail: false }; // don't eliminate without ground truth
  const s = String(stage).toLowerCase();
  let requiredFail = false;
  let failReason = '';
  for (const r of rows) {
    const allowed = extractStages(r.value_json);
    if (allowed.length === 0) continue;
    const ok = allowed.some((x) => x === s || s.includes(x) || x.includes(s));
    if (!ok) {
      failReason = `expected=[${allowed.join('|')}] got=${s}`;
      // FIX (2026-07-08): Honor DB SSOT — is_required=true STAGE mismatch
      // is a HARD elimination, not a soft penalty. See hypothesis_conditions.
      if (r.is_required === true) {
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

function normalizeObservationSet(codes: string[]): ObservationSet {
  const observations: string[] = [];
  const keys = new Set<string>();
  const canonicalByKey = new Map<string, string>();
  for (const c of codes ?? []) {
    const norm = normalizeObservationCode(c);
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

function ObservationConditionMatcher(row: ConditionRow, observed: ObservationSet): ObservationConditionMatch {
  const keyCodes = normalizeObservationCode(row.condition_key) ? [String(row.condition_key)] : [];
  const valueCodes = extractObservationCodesFromValueJson(row.value_json);
  const keyMatches = keyCodes
    .map(normalizeObservationCode)
    .filter((x): x is NormalizedObservationCode => !!x && observed.keys.has(x.matchKey))
    .map((x) => observed.canonicalByKey.get(x.matchKey) ?? x.canonicalCode);
  const valueMatches = valueCodes
    .map(normalizeObservationCode)
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

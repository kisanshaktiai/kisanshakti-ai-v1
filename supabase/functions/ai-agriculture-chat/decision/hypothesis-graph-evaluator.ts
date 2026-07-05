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

  candidate_rule_ids: string[];  // ONLY from hypothesis_rule_mapping
  selected_rule_id: null;        // populated later by rule evaluator
  eliminated: boolean;
  eliminated_reason?: string;
}

export interface GraphHypothesisResult {
  candidates: GraphHypothesisCandidate[];
  eliminated: GraphHypothesisCandidate[];
  input_observations: string[];
  trace_id: string;
  timings_ms: number;
}

interface NormalizedObservationCode {
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

  // Step 3 — join hypothesis_master metadata (active, crop_group, cause names)
  const master = await queryMaster(input.supabase, anchorHypIds, input.crop_group ?? input.crop_code ?? null);

  // Step 4 — rule edges
  const ruleEdges = await queryRuleMapping(input.supabase, anchorHypIds);

  const candidates: GraphHypothesisCandidate[] = [];
  const eliminated: GraphHypothesisCandidate[] = [];

  for (const hid of anchorHypIds) {
    const m = master.get(hid);
    if (!m || m.is_active === false) continue;

    const conds = allConditions.get(hid) ?? [];
    const buckets = bucketizeConditions(conds, observed);

    // STAGE / DAS gate — enforced from the DB, not from TS ontology
    const stagePass = checkStageCondition(conds, input.growth_stage);
    const dasPass = checkDasCondition(conds, input.das);

    const rules = ruleEdges.get(hid) ?? [];

    const requiredTotal = buckets.requiredCodes.size;
    const requiredMatched = buckets.positive_matches.filter((c) =>
      buckets.requiredCodes.has(normalizeObservationCode(c)?.matchKey ?? ''),
    ).length;
    const requiredPct = requiredTotal === 0 ? 1 : requiredMatched / requiredTotal;

    const supportingScore = buckets.positive_weight_total === 0
      ? 0
      : Math.min(1, buckets.positive_weight_matched / buckets.positive_weight_total);

    // Aggregated confidence — required 60 %, supporting 30 %, negative penalty 10 %
    const negativePenalty = Math.min(
      1,
      (buckets.negative_matches.length + buckets.blocking_conditions.length * 0.5) / 4,
    );
    let confidence = 0.6 * requiredPct + 0.3 * supportingScore - 0.1 * negativePenalty;
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

      candidate_rule_ids: rules,
      selected_rule_id: null,
      eliminated: false,
    };

    // Elimination rules (data-driven, no agronomy in code):
    //  1. any exclusion condition currently observed → eliminate
    //  2. STAGE condition present but current stage not in allowed set → eliminate
    //  3. DAS condition present but current DAS out of range → eliminate
    //  4. required conditions defined but zero required observed → eliminate
    if (buckets.negative_matches.some((c) => buckets.exclusionCodes.has(c))) {
      candidate.eliminated = true;
      candidate.eliminated_reason = 'EXCLUSION_HIT';
    } else if (!stagePass.pass) {
      candidate.eliminated = true;
      candidate.eliminated_reason = `STAGE_MISMATCH(${stagePass.reason})`;
    } else if (!dasPass.pass) {
      candidate.eliminated = true;
      candidate.eliminated_reason = `DAS_MISMATCH(${dasPass.reason})`;
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

  emitObsToHyp(
    trace,
    input,
    observed.observations,
    candidates.map((c) => c.hypothesis_id),
    eliminated.filter((c) => c.eliminated_reason?.startsWith('EXCLUSION') || c.eliminated_reason === 'NO_REQUIRED_MATCH').map((c) => c.hypothesis_id),
    eliminated.filter((c) => c.eliminated_reason?.startsWith('STAGE') || c.eliminated_reason?.startsWith('DAS')).map((c) => c.hypothesis_id),
  );

  return {
    candidates,
    eliminated,
    input_observations: observed.observations,
    trace_id: trace,
    timings_ms: Date.now() - started,
  };
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

async function queryMaster(supabase: any, hypIds: string[], cropGroup: string | null): Promise<Map<string, MasterRow>> {
  const out = new Map<string, MasterRow>();
  if (hypIds.length === 0) return out;
  try {
    let q = supabase
      .from('hypothesis_master')
      .select('hypothesis_id, crop_group, canonical_group, cause_name_en, cause_name_hi, cause_name_mr, severity_model, is_active')
      .in('hypothesis_id', hypIds)
      .eq('is_active', true);
    // Filter to crop_group (+universal) if we have one — the DB stores it lowercase
    if (cropGroup) {
      const g = String(cropGroup).toLowerCase();
      q = q.in('crop_group', [g, 'universal']);
    }
    const { data, error } = await q;
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

function bucketizeConditions(conds: ConditionRow[], observed: Set<string>): Buckets {
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
    const key = String(c.condition_key ?? '').toLowerCase();
    if (!key) continue;
    const expectPresent = isValueTruthy(c.value_json);
    const w = Number(c.weight ?? 0) || (c.is_required ? 1 : 0.5);

    if (expectPresent) {
      if (c.is_required) b.requiredCodes.add(key);
      else b.supportingCodes.add(key);
      b.positive_weight_total += w;
      if (observed.has(key)) {
        b.positive_matches.push(key);
        b.positive_weight_matched += w;
      } else if (c.is_required) {
        b.missing_required.push(key);
      }
    } else {
      if (c.is_required) b.exclusionCodes.add(key);
      else b.blockingCodes.add(key);
      if (observed.has(key)) {
        b.negative_matches.push(key);
        if (!c.is_required) b.blocking_conditions.push(key);
      }
    }
  }
  return b;
}

function checkStageCondition(conds: ConditionRow[], stage: string | null): { pass: boolean; reason: string } {
  const rows = conds.filter((c) => c.condition_type === 'STAGE');
  if (rows.length === 0) return { pass: true, reason: 'NO_STAGE_COND' };
  if (!stage) return { pass: true, reason: 'STAGE_UNKNOWN' }; // don't eliminate without ground truth
  const s = String(stage).toLowerCase();
  for (const r of rows) {
    const allowed = extractStages(r.value_json);
    if (allowed.length === 0) continue;
    const ok = allowed.some((x) => x === s || s.includes(x) || x.includes(s));
    if (!ok) return { pass: false, reason: `expected=[${allowed.join('|')}] got=${s}` };
  }
  return { pass: true, reason: 'STAGE_OK' };
}

function checkDasCondition(conds: ConditionRow[], das: number | null): { pass: boolean; reason: string } {
  const rows = conds.filter((c) => c.condition_type === 'DAS_RANGE');
  if (rows.length === 0) return { pass: true, reason: 'NO_DAS_COND' };
  if (das == null || !Number.isFinite(das)) return { pass: true, reason: 'DAS_UNKNOWN' };
  for (const r of rows) {
    const v = r.value_json ?? {};
    const min = typeof v.min === 'number' ? v.min : null;
    const max = typeof v.max === 'number' ? v.max : null;
    const op = String(r.operator ?? 'BETWEEN').toUpperCase();
    if (op === 'BETWEEN') {
      if (min != null && das < min) return { pass: false, reason: `das=${das}<min=${min}` };
      if (max != null && das > max) return { pass: false, reason: `das=${das}>max=${max}` };
    } else if (op === 'GT') {
      if (min != null && das < min) return { pass: false, reason: `das=${das}<gt_min=${min}` };
    } else if (op === 'LT') {
      if (max != null && das > max) return { pass: false, reason: `das=${das}>lt_max=${max}` };
    }
  }
  return { pass: true, reason: 'DAS_OK' };
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

function normalizeObservationSet(codes: string[]): Set<string> {
  const out = new Set<string>();
  for (const c of codes ?? []) {
    if (!c) continue;
    const k = String(c).trim().toLowerCase();
    if (k) out.add(k);
  }
  return out;
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
  const cap = (arr: string[]) => (arr.length <= 12 ? arr : [...arr.slice(0, 12), `+${arr.length - 12}`]);
  console.log(
    `[OBS_TO_HYP] trace=${trace} crop=${input.crop_code ?? '?'} stage=${input.growth_stage ?? '?'} das=${input.das ?? '?'} ` +
      `obs=[${cap(observations).join(',')}] matched=[${cap(matched).join(',')}] blocked=[${cap(blocked).join(',')}] excluded=[${cap(excluded).join(',')}]`,
  );
}

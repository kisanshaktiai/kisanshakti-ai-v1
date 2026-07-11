/**
 * Hypothesis-first clarification builder.
 *
 * IOM is used only as a discovery seed. Farmer UI options are emitted only
 * after traversing hypothesis_conditions and hypothesis_master for the locked
 * crop/stage/DAS context.
 */

import { loadIOMAllowed } from './iom-gate.ts';
import { resolveHypothesesFromObservations } from './observation-hypothesis-resolver.ts';
import { evaluateHypothesisGraph } from './hypothesis-graph-evaluator.ts';
import { resolveObservationSymbols } from './symbol-resolver.ts';
import { normalizeStageForDB } from '../utils/stage-normalizer.ts';
import { stagesEquivalent } from '../runtime/stage-family-shim.ts';
import { classifyEvidence } from '../runtime/evidence-classifier.ts';

export interface HypothesisClarificationInput {
  supabase: any;
  intent_code?: string | null;
  crop_code?: string | null;
  crop_stage?: string | null;
  DAS?: number | null;
  land_context?: any;
  language?: string | null;
  max?: number;
  confirmed_observations?: ReadonlyArray<unknown>;
  trace_id?: string | null;
}

export interface HypothesisClarificationOption {
  observation_id: string;
  observation_code: string;
  observation_key: string;
  hypothesis_id: string;
  hypothesis_condition_id: string;
  display_text: string;
  label: string;
  value: string;
  confidence_weight: number;
  confidence_rank?: number;
  source: 'hypothesis_graph';
  /** Every hypothesis whose OBSERVATION conditions include this code. */
  hypothesis_ids?: string[];
  is_discriminator?: boolean;
  is_required?: boolean;
  aggregate_score?: number;
}

interface ConditionRow {
  id: string;
  hypothesis_id: string;
  condition_type: string;
  condition_key: string;
  operator: string;
  value_json: any;
  is_required: boolean;
  is_discriminator: boolean;
  weight: number | null;
}

export interface HypothesisClarificationResult {
  options: HypothesisClarificationOption[];
  source: 'hypothesis_graph';
  graph_gap?: string;
  candidate_hypotheses: number;
}

/**
 * Tunables sourced from `system_config` (DB is SSOT). Defaults are execution
 * hints only — no agronomy encoded here.
 */
interface ClarificationTunables {
  discriminator_bonus: number;
  required_bonus: number;
  nearest_expansion: number;
  collect_max: number;
  render_max: number;
}

async function readTunables(supabase: any, renderMaxFromCaller: number): Promise<ClarificationTunables> {
  const defaults: ClarificationTunables = {
    discriminator_bonus: 0.25,
    required_bonus: 0.15,
    nearest_expansion: 3,
    collect_max: 12,
    render_max: renderMaxFromCaller,
  };
  try {
    const { data } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'clarification_discriminator_bonus',
        'clarification_required_bonus',
        'clarification_nearest_expansion',
        'clarification_collect_max',
        'clarification_render_max',
      ]);
    for (const row of data ?? []) {
      const raw = typeof row.value === 'object' && row.value !== null ? (row.value as any).value : row.value;
      const v = Number(raw);
      if (!isFinite(v)) continue;
      if (row.key === 'clarification_discriminator_bonus') defaults.discriminator_bonus = v;
      else if (row.key === 'clarification_required_bonus') defaults.required_bonus = v;
      else if (row.key === 'clarification_nearest_expansion') defaults.nearest_expansion = Math.max(0, Math.floor(v));
      else if (row.key === 'clarification_collect_max') defaults.collect_max = Math.max(1, Math.floor(v));
      else if (row.key === 'clarification_render_max') defaults.render_max = Math.max(1, Math.floor(v));
    }
  } catch (e) {
    console.warn(`[HYP_CLARIFICATION] tunable load failed, using defaults: ${e instanceof Error ? e.message : String(e)}`);
  }
  return defaults;
}

export async function buildHypothesisClarificationOptions(
  input: HypothesisClarificationInput,
): Promise<HypothesisClarificationResult> {
  const trace = input.trace_id ?? `hyp_clar_${Date.now()}`;
  const crop = String(input.crop_code || input.land_context?.current_crop || '').trim();
  const stage = input.crop_stage ?? input.land_context?.growth_stage ?? null;
  const das = input.DAS ?? input.land_context?.days_since_sowing ?? null;
  const lang = String(input.language || 'en').toLowerCase();
  const renderMaxIn = input.max ?? 4;
  const tun = await readTunables(input.supabase, renderMaxIn);
  const renderMax = tun.render_max;
  const collectMax = Math.max(tun.collect_max, renderMax);

  const confirmedEvidence = classifyEvidence((input.confirmed_observations ?? []).map((o) => String(o ?? '')));
  const confirmedResolved = await resolveObservationSymbols(input.supabase, confirmedEvidence.real_codes);
  const confirmedCodes = confirmedResolved
    .map((r) => r.canonical_observation_code)
    .filter((x): x is string => !!x);

  let seedCodes = confirmedCodes;
  let iomSeedCount = 0;
  if (seedCodes.length === 0 && input.intent_code) {
    const iom = await loadIOMAllowed(
      input.supabase,
      input.intent_code,
      crop || 'all',
      stage,
      typeof das === 'number' ? das : null,
    );
    seedCodes = iom.allowedRanked.map((r) => r.observation_code).filter(Boolean);
    iomSeedCount = seedCodes.length;
  }

  const seedResolved = await resolveObservationSymbols(input.supabase, seedCodes);
  const graphSeeds = seedResolved
    .map((r) => r.canonical_observation_code)
    .filter((x): x is string => !!x);

  if (graphSeeds.length === 0) {
    console.warn(`[HYP_CLARIFICATION] trace=${trace} graph_gap=NO_DISCOVERY_SEEDS intent=${input.intent_code ?? '?'} crop=${crop || '?'}`);
    return { options: [], source: 'hypothesis_graph', graph_gap: 'NO_DISCOVERY_SEEDS', candidate_hypotheses: 0 };
  }

  const resolver = await resolveHypothesesFromObservations({
    supabase: input.supabase,
    observations: graphSeeds,
    crop_context: { crop_code: crop || null, crop_group: crop || null, growth_stage: stage, das: typeof das === 'number' ? das : null },
    trace_id: trace,
  });

  // Patch C — union matched + nearest hypotheses so competing lineage survives.
  const matchedIds = resolver.hypotheses.map((h) => h.hypothesis_id);
  const nearestIds = resolver.nearest_hypotheses
    .map((h) => h.hypothesis_id)
    .slice(0, tun.nearest_expansion);
  let hypothesisIds = Array.from(new Set([...matchedIds, ...nearestIds]));

  // When confirmed evidence is absent AND the observation→hypothesis resolver
  // returned nothing, run the wider graph evaluator over all IOM seeds.
  if (hypothesisIds.length === 0 && seedCodes.length > 0) {
    const graphOut = await evaluateHypothesisGraph({
      crop_code: crop || null,
      crop_group: crop || null,
      growth_stage: stage,
      das: typeof das === 'number' ? das : null,
      observation_codes: graphSeeds,
      supabase: input.supabase,
      trace_id: `${trace}_seed_graph`,
    });
    hypothesisIds = Array.from(new Set(graphOut.candidates.map((c) => c.hypothesis_id)));
  }

  if (hypothesisIds.length === 0) {
    console.warn(
      `[HYP_CLARIFICATION] trace=${trace} graph_gap=NO_STAGE_VALID_HYPOTHESES ` +
      `intent=${input.intent_code ?? '?'} crop=${crop || '?'} stage=${stage ?? '?'} das=${das ?? '?'}`,
    );
    return { options: [], source: 'hypothesis_graph', graph_gap: 'NO_STAGE_VALID_HYPOTHESES', candidate_hypotheses: 0 };
  }

  const conditions = await loadConditions(input.supabase, hypothesisIds);
  const observationConditions = conditions.filter((c) => c.condition_type === 'OBSERVATION');
  const optionEdges: Array<{ code: string; condition: ConditionRow }> = [];
  const confirmedSet = new Set(confirmedCodes.map((c) => c.toLowerCase()));

  for (const condition of observationConditions) {
    for (const code of extractObservationCodes(condition)) {
      if (!code || confirmedSet.has(code.toLowerCase())) continue;
      optionEdges.push({ code, condition });
    }
  }

  // Patch A — preserve hypothesis lineage: group edges per code, keep ALL
  // contributing hypotheses, compute an aggregate information-gain score.
  interface CodeBucket {
    code: string;
    edges: Array<{ condition: ConditionRow }>;
    hypothesis_ids: Set<string>;
    max_weight: number;
    is_discriminator: boolean;
    is_required: boolean;
    top_condition: ConditionRow;
    aggregate_score: number;
  }
  const buckets = new Map<string, CodeBucket>();
  for (const edge of optionEdges) {
    const key = edge.code.toLowerCase();
    const w = Number(edge.condition.weight ?? 0);
    let b = buckets.get(key);
    if (!b) {
      b = {
        code: edge.code,
        edges: [],
        hypothesis_ids: new Set<string>(),
        max_weight: w,
        is_discriminator: !!edge.condition.is_discriminator,
        is_required: !!edge.condition.is_required,
        top_condition: edge.condition,
        aggregate_score: 0,
      };
      buckets.set(key, b);
    }
    b.edges.push({ condition: edge.condition });
    b.hypothesis_ids.add(edge.condition.hypothesis_id);
    if (w > b.max_weight) { b.max_weight = w; b.top_condition = edge.condition; }
    if (edge.condition.is_discriminator) b.is_discriminator = true;
    if (edge.condition.is_required) b.is_required = true;
  }
  for (const b of buckets.values()) {
    b.aggregate_score =
      b.max_weight +
      (b.is_discriminator ? tun.discriminator_bonus : 0) +
      (b.is_required ? tun.required_bonus : 0);
  }

  const edgesPreDedup = optionEdges.length;
  const edgesPostDedup = buckets.size;

  // Global rank by aggregate score, then cap the collect window.
  const rankedBuckets = Array.from(buckets.values())
    .sort((a, b) => b.aggregate_score - a.aggregate_score)
    .slice(0, collectMax);

  const masterRows = await loadObservationMaster(input.supabase, rankedBuckets.map((b) => b.code));
  const labels = await loadTranslations(input.supabase, Array.from(masterRows.keys()), lang);

  // Patch B — round-robin diversification across candidate hypotheses.
  // Each pass emits one option per hypothesis that has not yet contributed.
  // Only after every candidate hypothesis has contributed do we allow a
  // second option from the same hypothesis. Stops at renderMax (but always
  // guarantees ≥ min(renderMax, distinct_hypotheses) coverage).
  const hypothesisFor = (b: CodeBucket): string => {
    // Prefer the intersection with the resolved candidate hypothesis set
    // (matched ∪ nearest), then fall back to the top-weight condition.
    for (const hid of b.hypothesis_ids) {
      if (hypothesisIds.includes(hid)) return hid;
    }
    return b.top_condition.hypothesis_id;
  };

  const remaining = rankedBuckets.slice();
  const emittedHypotheses = new Set<string>();
  const options: HypothesisClarificationOption[] = [];
  const optionsByHypothesis: Record<string, number> = {};

  const emitBucket = (b: CodeBucket, primary: string) => {
    const master = masterRows.get(b.code.toLowerCase());
    if (!master) return false;
    const label = labels.get(master.observation_code.toLowerCase()) || master.description || master.observation_code;
    options.push({
      observation_id: master.observation_code,
      observation_code: master.observation_code,
      observation_key: master.observation_code,
      hypothesis_id: primary,
      hypothesis_condition_id: b.top_condition.id,
      display_text: label,
      label,
      value: master.observation_code,
      confidence_weight: b.max_weight || 0.5,
      source: 'hypothesis_graph',
      hypothesis_ids: Array.from(b.hypothesis_ids),
      is_discriminator: b.is_discriminator,
      is_required: b.is_required,
      aggregate_score: b.aggregate_score,
    });
    optionsByHypothesis[primary] = (optionsByHypothesis[primary] ?? 0) + 1;
    return true;
  };

  // Pass 1: one per uncovered hypothesis, in rank order.
  for (let i = 0; i < remaining.length && options.length < Math.max(renderMax, hypothesisIds.length); ) {
    const b = remaining[i];
    const primary = hypothesisFor(b);
    if (emittedHypotheses.has(primary)) { i++; continue; }
    if (emitBucket(b, primary)) {
      emittedHypotheses.add(primary);
      remaining.splice(i, 1);
    } else {
      remaining.splice(i, 1);
    }
    if (options.length >= renderMax && emittedHypotheses.size >= hypothesisIds.length) break;
  }
  // Pass 2: fill remaining renderMax slots from top of the ranked list.
  for (const b of remaining) {
    if (options.length >= renderMax) break;
    const primary = hypothesisFor(b);
    emitBucket(b, primary);
  }

  // Patch E — structured trace.
  console.log(
    `[HYP_CLARIFICATION] trace=${trace} source=hypothesis_graph intent=${input.intent_code ?? '?'} ` +
    `crop=${crop || '?'} stage=${stage ?? '?'} das=${das ?? '?'} ` +
    `real_observations=${confirmedEvidence.real_symptom_count} ignored_context_symbols=${confirmedEvidence.ignored_metadata_count} ` +
    `iom_seeds=${iomSeedCount} graph_seeds=${graphSeeds.length} ` +
    `hypotheses_matched=${matchedIds.length} hypotheses_nearest=${nearestIds.length} hypotheses_used=${hypothesisIds.length} ` +
    `edges_pre_dedup=${edgesPreDedup} edges_post_dedup=${edgesPostDedup} codes_ranked=${rankedBuckets.length} ` +
    `collect_max=${collectMax} render_max=${renderMax} options=${options.length} ` +
    `options_by_hypothesis=${JSON.stringify(optionsByHypothesis)} ` +
    `keys=[${options.map((o) => o.observation_code).join(',')}]`,
  );

  return { options, source: 'hypothesis_graph', candidate_hypotheses: hypothesisIds.length };
}

async function loadConditions(supabase: any, hypIds: string[]): Promise<ConditionRow[]> {
  if (hypIds.length === 0) return [];
  const { data, error } = await supabase
    .from('hypothesis_conditions')
    .select('id, hypothesis_id, condition_type, condition_key, operator, value_json, is_required, is_discriminator, weight')
    .eq('is_quarantined', false)
    .in('hypothesis_id', hypIds);
  if (error) {
    console.warn(`[HYP_CLARIFICATION] condition load failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as ConditionRow[];
}

async function loadObservationMaster(
  supabase: any,
  codes: string[],
): Promise<Map<string, { observation_code: string; description: string | null }>> {
  const out = new Map<string, { observation_code: string; description: string | null }>();
  const variants = Array.from(new Set(codes.flatMap((c) => [c, c.toLowerCase(), c.toUpperCase()]).filter(Boolean)));
  if (variants.length === 0) return out;
  const { data, error } = await supabase
    .from('observation_master')
    .select('observation_code, description, is_active, is_farmer_observable, can_generate_question')
    .in('observation_code', variants);
  if (error) {
    console.warn(`[HYP_CLARIFICATION] observation_master load failed: ${error.message}`);
    return out;
  }
  for (const row of data ?? []) {
    if (row.is_active === false) continue;
    if (row.is_farmer_observable === false) continue;
    if ('can_generate_question' in row && row.can_generate_question !== true) continue;
    out.set(String(row.observation_code).toLowerCase(), {
      observation_code: row.observation_code,
      description: row.description ?? null,
    });
  }
  return out;
}

async function loadTranslations(
  supabase: any,
  codes: string[],
  lang: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (codes.length === 0) return out;
  const { data, error } = await supabase
    .from('observation_translations')
    .select('observation_code, display_text, description_text, language_code')
    .in('observation_code', codes)
    .in('language_code', Array.from(new Set([lang, 'en'])));
  if (error) {
    console.warn(`[HYP_CLARIFICATION] translation load failed: ${error.message}`);
    return out;
  }
  const fallback = new Map<string, string>();
  for (const row of data ?? []) {
    const key = String(row.observation_code).toLowerCase();
    const text = String(row.display_text || row.description_text || '').trim();
    if (!text) continue;
    if (row.language_code === lang) out.set(key, text);
    else if (row.language_code === 'en') fallback.set(key, text);
  }
  for (const [k, v] of fallback) if (!out.has(k)) out.set(k, v);
  return out;
}

function extractObservationCodes(condition: ConditionRow): string[] {
  const out: string[] = [];
  const push = (v: any) => {
    if (v == null || typeof v === 'boolean' || typeof v === 'number') return;
    const s = String(v).trim();
    if (s && s.toLowerCase() !== 'true' && s.toLowerCase() !== 'false') out.push(s);
  };
  const walk = (v: any, keyHint?: string) => {
    if (v == null || typeof v === 'boolean' || typeof v === 'number') return;
    if (typeof v === 'string') { if (!keyHint || isObservationKey(keyHint)) push(v); return; }
    if (Array.isArray(v)) { for (const item of v) typeof item === 'string' ? push(item) : walk(item, keyHint); return; }
    if (typeof v === 'object') for (const [k, child] of Object.entries(v)) walk(child, isObservationKey(k) ? k : undefined);
  };
  walk(condition.value_json);
  if (out.length === 0 && condition.condition_key && condition.condition_key !== 'reported_codes') push(condition.condition_key);
  return Array.from(new Set(out));
}

function isObservationKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return ['code', 'codes', 'observation', 'observations', 'observation_code', 'observation_codes', 'reported_code', 'reported_codes', 'symptom', 'symptoms'].includes(k);
}

export function stageAllowedByGraphCondition(
  condition: ConditionRow,
  stage: string | null | undefined,
  crop: string | null | undefined,
): boolean {
  if (condition.condition_type !== 'STAGE' || !stage) return true;
  const allowed = Array.isArray(condition.value_json)
    ? condition.value_json
    : Array.isArray(condition.value_json?.stages)
      ? condition.value_json.stages
      : Array.isArray(condition.value_json?.allowed_stages)
        ? condition.value_json.allowed_stages
        : [];
  if (allowed.length === 0) return true;
  const s = normalizeStageForDB(stage).toLowerCase();
  return allowed.some((x: any) => {
    const a = normalizeStageForDB(String(x)).toLowerCase();
    return a === s || stagesEquivalent(a, s, crop ?? null);
  });
}

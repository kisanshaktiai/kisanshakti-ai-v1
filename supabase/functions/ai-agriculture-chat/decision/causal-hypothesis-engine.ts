// CAUSAL HYPOTHESIS ARBITRATION ENGINE v1.0.0

import { SymbolContract } from '../runtime/symbol-contract.ts';
import { stageCompatibility } from './stage-symbol-resolver.ts';

// Graph-boundary symbol coercion — delegates identity to SymbolContract.
function coerceSymbolViaContract(x: unknown, site: string): string | null {
  const res = SymbolContract.extract(x);
  if (!res.symbol && res.violation && res.violation !== 'EMPTY') {
    console.warn(
      `[SYMBOL_CONTRACT_VIOLATION] site=${site} violation=${res.violation} ` +
      `shape=${res.source_shape ?? 'unknown'}`,
    );
  }
  return res.symbol;
}

function coerceSymbolList(xs: unknown, site = 'causal-hypothesis-engine'): string[] {
  if (!Array.isArray(xs)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const n = coerceSymbolViaContract(x, site);
    if (n && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}



// TYPES

export enum HypothesisConditionStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  SKIPPED_NO_DATA = 'SKIPPED_NO_DATA',
  CONTRADICTED = 'CONTRADICTED'
}

export interface HypothesisLedgerEntry {
  key: string;
  status: HypothesisConditionStatus;
  required: boolean;
  weight: number;
  is_discriminator: boolean;
  inputValue?: unknown;
  ruleValue?: unknown;
}

export interface HypothesisScore {
  hypothesis_id: string;
  cause_name_en: string;
  hypothesis_type: string;
  canonical_group: string;
  passed_required: number;
  total_required: number;
  base_score: number;
  density_weight: number;
  weighted_score: number;
  ledger: HypothesisLedgerEntry[];
  contradictions_found: string[];
  elimination_reason: 'NONE' | 'FAILED_REQUIRED' | 'MISSING_DATA' | 'CONTRADICTION' | 'LOW_SCORE';
  is_eliminated: boolean;
  matched_conditions: string[];
  discriminators_available: string[];
  mapped_rule_ids: string[];
}

export interface DiscriminatorQuestion {
  discriminator_key: string;
  hypothesis_a_id: string;
  hypothesis_b_id: string;
  hypothesis_a_name: string;
  hypothesis_b_name: string;
  question_text_en: string;
  question_text_mr: string;
  question_text_hi: string;
  /** Canonical observation code to be translated by the language layer / observation_translations */
  observation_code?: string;
  weight: number;
}

export interface ArbitrationResult {
  best_hypothesis: HypothesisScore | null;
  competing: HypothesisScore[];
  all_scores: HypothesisScore[];
  needs_clarification: boolean;
  clarification_reason?: 'COMPETING_HYPOTHESES' | 'BELOW_THRESHOLD' | 'ALL_ELIMINATED';
  discriminator_question?: DiscriminatorQuestion;
  decision_path: 'HYPOTHESIS_SCOPED' | 'FULL_RULE_SCOPE' | 'CLARIFICATION_REQUIRED';
  eliminated_hypotheses: Array<{ id: string; reason: string }>;
  hypotheses_evaluated: number;
}

// Database row types
interface HypothesisMasterRow {
  hypothesis_id: string;
  crop_group: string;
  hypothesis_type: string;
  canonical_group: string;
  cause_name_en: string;
  cause_name_mr: string | null;
  cause_name_hi: string | null;
  biological_basis: string | null;
  severity_model: string;
  version: string;
  engine_min_version: string;
  is_active: boolean;
}

interface HypothesisConditionRow {
  id: string;
  hypothesis_id: string;
  condition_type: string;
  condition_key: string;
  operator: string;
  value_json: Record<string, unknown>;
  is_required: boolean;
  is_discriminator: boolean;
  weight: number;
}

interface HypothesisContradictionRow {
  id: string;
  hypothesis_id: string;
  contradiction_type: string;
  contradiction_key: string;
  contradiction_value: string;
  explanation: string | null;
}

interface HypothesisRuleMappingRow {
  hypothesis_id: string;
  rule_id: string;
  priority: number;
}

// CONSTANTS

const MIN_HYPOTHESIS_CONFIDENCE = 0.55;
const DISCRIMINATOR_DELTA = 0.10;
const HYPOTHESIS_CACHE_TTL = 300_000; // 5 minutes
const ENGINE_VERSION = '1.2.0'; // v1.2.0: lowercase crop_group, ontology-bridged observations, SKIPPED penalty

// CROP GROUP NORMALIZER
const CROP_CODE_ALIASES: Record<string, string> = {
  sc: 'sugarcane',
  ctn: 'cotton',
  wht: 'wheat',
  mz: 'maize',
  soy: 'soybean',
  paddy: 'rice',
  pigeon_pea: 'tur',
};

function normalizeCropGroup(input: string): string {
  const lower = String(input || '').trim().toLowerCase();
  if (!lower) return lower;
  return CROP_CODE_ALIASES[lower] || lower;
}


// CACHE

interface CachedHypothesisData {
  hypotheses: HypothesisMasterRow[];
  conditions: Map<string, HypothesisConditionRow[]>;
  contradictions: Map<string, HypothesisContradictionRow[]>;
  ruleMappings: Map<string, string[]>;
  loadedAt: number;
}

const hypothesisCache = new Map<string, CachedHypothesisData>();
let loadingPromise: Map<string, Promise<CachedHypothesisData>> = new Map();

// DATA LOADER — FIX: Sequential 2-phase load (Supabase JS .in() requires array)

async function loadHypothesesForCrop(
  cropGroup: string,
  supabase: any
): Promise<CachedHypothesisData> {
  const cacheKey = normalizeCropGroup(cropGroup);
  const cached = hypothesisCache.get(cacheKey);
  if (cached && (Date.now() - cached.loadedAt) < HYPOTHESIS_CACHE_TTL) {
    return cached;
  }

  // Concurrency lock: prevent N+1 parallel loads for same crop
  const existing = loadingPromise.get(cacheKey);
  if (existing) return existing;

  const promise = _loadHypothesesImpl(cacheKey, supabase);
  loadingPromise.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    loadingPromise.delete(cacheKey);
  }
}

async function _loadHypothesesImpl(
  cropGroup: string,
  supabase: any
): Promise<CachedHypothesisData> {
  // PHASE 1: Load master hypotheses to extract IDs
  const masterRes = await supabase.from('hypothesis_master')
    .select('*')
    .eq('crop_group', cropGroup)
    .eq('is_active', true);

  const hypotheses: HypothesisMasterRow[] = masterRes.data || [];
  const hypothesisIds = hypotheses.map(h => h.hypothesis_id);

  if (hypothesisIds.length === 0) {
    const empty: CachedHypothesisData = {
      hypotheses: [],
      conditions: new Map(),
      contradictions: new Map(),
      ruleMappings: new Map(),
      loadedAt: Date.now()
    };
    hypothesisCache.set(cropGroup, empty);
    console.log(`   📭 [HypothesisLoader] No hypotheses for crop_group=${cropGroup}`);
    return empty;
  }

  // PHASE 2: Load dependent tables in parallel using extracted ID array
  const [condRes, contraRes, mappingRes] = await Promise.all([
    supabase.from('hypothesis_conditions')
      .select('*')
      .in('hypothesis_id', hypothesisIds),
    supabase.from('hypothesis_contradictions')
      .select('*')
      .in('hypothesis_id', hypothesisIds),
    supabase.from('hypothesis_rule_mapping')
      .select('*')
      .in('hypothesis_id', hypothesisIds)
  ]);

  const idSet = new Set(hypothesisIds);

  // Build indexed maps
  const conditions = new Map<string, HypothesisConditionRow[]>();
  const contradictions = new Map<string, HypothesisContradictionRow[]>();
  const ruleMappings = new Map<string, string[]>();

  for (const c of (condRes.data || []) as HypothesisConditionRow[]) {
    if (!idSet.has(c.hypothesis_id)) continue;
    if (!conditions.has(c.hypothesis_id)) conditions.set(c.hypothesis_id, []);
    conditions.get(c.hypothesis_id)!.push(c);
  }

  for (const c of (contraRes.data || []) as HypothesisContradictionRow[]) {
    if (!idSet.has(c.hypothesis_id)) continue;
    if (!contradictions.has(c.hypothesis_id)) contradictions.set(c.hypothesis_id, []);
    contradictions.get(c.hypothesis_id)!.push(c);
  }

  for (const m of (mappingRes.data || []) as HypothesisRuleMappingRow[]) {
    if (!idSet.has(m.hypothesis_id)) continue;
    if (!ruleMappings.has(m.hypothesis_id)) ruleMappings.set(m.hypothesis_id, []);
    ruleMappings.get(m.hypothesis_id)!.push(m.rule_id);
  }

  const result: CachedHypothesisData = {
    hypotheses,
    conditions,
    contradictions,
    ruleMappings,
    loadedAt: Date.now()
  };

  hypothesisCache.set(cropGroup, result);
  console.log(`   📦 [HypothesisLoader] Loaded ${hypotheses.length} hypotheses, ${condRes.data?.length || 0} conditions, ${contraRes.data?.length || 0} contradictions, ${mappingRes.data?.length || 0} rule mappings for crop_group=${cropGroup}`);
  return result;
}

// CONDITION EVALUATOR

function evaluateCondition(
  condition: HypothesisConditionRow,
  canonicalState: Record<string, any>,
  observations: string[]
): HypothesisConditionStatus {
  const { condition_type, condition_key, operator, value_json } = condition;

  switch (condition_type) {
    case 'OBSERVATION': {
      // Shape-agnostic reader — DB ontology stores value_json as either
      const raw = value_json as any;
      const codes: string[] = Array.isArray(raw)
        ? raw.filter((x: any) => typeof x === 'string')
        : (typeof raw?.code === 'string'
            ? [raw.code]
            : (Array.isArray(raw?.codes)
                ? raw.codes.filter((x: any) => typeof x === 'string')
                : []));
      if (codes.length === 0) return HypothesisConditionStatus.FAILED;

      // SymbolContract equality — case/separator-insensitive graph identity.
      const obsSet = SymbolContract.toNormalizedSet(observations);
      const normCodes = codes.map((c) => SymbolContract.normalize(c)).filter((c): c is string => !!c);

      if (operator === 'CONTAINS' || operator === 'IN' || operator === 'ANY_OF') {
        return normCodes.some((c) => obsSet.has(c))
          ? HypothesisConditionStatus.PASSED
          : HypothesisConditionStatus.FAILED;
      }
      if (operator === 'ALL_OF') {
        return normCodes.every((c) => obsSet.has(c))
          ? HypothesisConditionStatus.PASSED
          : HypothesisConditionStatus.FAILED;
      }
      if (operator === 'NOT_EXISTS' || operator === 'NOT_IN') {
        return normCodes.every((c) => !obsSet.has(c))
          ? HypothesisConditionStatus.PASSED
          : HypothesisConditionStatus.FAILED;
      }
      return HypothesisConditionStatus.FAILED;
    }


    case 'DAS_RANGE': {
      const das = canonicalState.days_since_sowing;
      if (das === null || das === undefined) {
        return HypothesisConditionStatus.SKIPPED_NO_DATA;
      }
      const min = (value_json as any)?.min;
      const max = (value_json as any)?.max;
      
      if (operator === 'BETWEEN') {
        if (min !== undefined && max !== undefined) {
          return (das >= min && das <= max)
            ? HypothesisConditionStatus.PASSED
            : HypothesisConditionStatus.FAILED;
        }
      }
      if (operator === 'GT' || operator === 'GTE') {
        const threshold = min ?? (value_json as any)?.value;
        if (threshold === undefined) return HypothesisConditionStatus.SKIPPED_NO_DATA;
        return (operator === 'GT' ? das > threshold : das >= threshold)
          ? HypothesisConditionStatus.PASSED
          : HypothesisConditionStatus.FAILED;
      }
      if (operator === 'LT' || operator === 'LTE') {
        const threshold = max ?? (value_json as any)?.value;
        if (threshold === undefined) return HypothesisConditionStatus.SKIPPED_NO_DATA;
        return (operator === 'LT' ? das < threshold : das <= threshold)
          ? HypothesisConditionStatus.PASSED
          : HypothesisConditionStatus.FAILED;
      }
      return HypothesisConditionStatus.SKIPPED_NO_DATA;
    }

    case 'STAGE': {
      const currentStage = canonicalState.crop_stage || canonicalState.growth_stage;
      if (!currentStage) return HypothesisConditionStatus.SKIPPED_NO_DATA;

      const stages = (value_json as any)?.stages;
      if (!Array.isArray(stages)) return HypothesisConditionStatus.FAILED;

      const crop = canonicalState.crop_code || canonicalState.crop || canonicalState.crop_group;
      const compatibility = stageCompatibility(currentStage, stages, crop ?? null);
      return compatibility.unknown || compatibility.exact || compatibility.family
        ? HypothesisConditionStatus.PASSED
        : HypothesisConditionStatus.FAILED;
    }

    case 'NDVI_PATTERN': {
      const field = (value_json as any)?.field || 'ndvi_trend';
      const expectedValue = (value_json as any)?.value;
      const actual = canonicalState[field] || canonicalState.ndvi_trend || canonicalState.ndvi_level;
      if (!actual) return HypothesisConditionStatus.SKIPPED_NO_DATA;
      
      if (operator === 'EQUALS') {
        return String(actual).toLowerCase() === String(expectedValue).toLowerCase()
          ? HypothesisConditionStatus.PASSED
          : HypothesisConditionStatus.FAILED;
      }
      return HypothesisConditionStatus.SKIPPED_NO_DATA;
    }

    case 'WEATHER': {
      const field = (value_json as any)?.field;
      const threshold = (value_json as any)?.value;
      if (!field || threshold === undefined) return HypothesisConditionStatus.SKIPPED_NO_DATA;
      
      const weather = canonicalState.weather;
      if (!weather) return HypothesisConditionStatus.SKIPPED_NO_DATA;
      
      const actual = weather[field];
      if (actual === null || actual === undefined) return HypothesisConditionStatus.SKIPPED_NO_DATA;
      
      switch (operator) {
        case 'GT': return actual > threshold ? HypothesisConditionStatus.PASSED : HypothesisConditionStatus.FAILED;
        case 'GTE': return actual >= threshold ? HypothesisConditionStatus.PASSED : HypothesisConditionStatus.FAILED;
        case 'LT': return actual < threshold ? HypothesisConditionStatus.PASSED : HypothesisConditionStatus.FAILED;
        case 'LTE': return actual <= threshold ? HypothesisConditionStatus.PASSED : HypothesisConditionStatus.FAILED;
        case 'EQUALS': return actual === threshold ? HypothesisConditionStatus.PASSED : HypothesisConditionStatus.FAILED;
        default: return HypothesisConditionStatus.SKIPPED_NO_DATA;
      }
    }

    case 'SOIL': {
      const soilField = condition_key;
      const expectedValue = (value_json as any)?.value;
      const threshold = (value_json as any)?.threshold;
      
      const actual = canonicalState[soilField] || canonicalState.soil?.[soilField];
      if (actual === null || actual === undefined) return HypothesisConditionStatus.SKIPPED_NO_DATA;
      
      if (operator === 'EQUALS') {
        return String(actual).toLowerCase() === String(expectedValue).toLowerCase()
          ? HypothesisConditionStatus.PASSED
          : HypothesisConditionStatus.FAILED;
      }
      if (operator === 'LT' && threshold !== undefined) {
        return actual < threshold ? HypothesisConditionStatus.PASSED : HypothesisConditionStatus.FAILED;
      }
      if (operator === 'GT' && threshold !== undefined) {
        return actual > threshold ? HypothesisConditionStatus.PASSED : HypothesisConditionStatus.FAILED;
      }
      return HypothesisConditionStatus.SKIPPED_NO_DATA;
    }

    case 'BOOLEAN_GATE': {
      const boolKey = (value_json as any)?.key || condition_key;
      const expected = (value_json as any)?.value ?? true;
      const actual = canonicalState[boolKey];
      if (actual === null || actual === undefined) return HypothesisConditionStatus.SKIPPED_NO_DATA;
      return (Boolean(actual) === Boolean(expected))
        ? HypothesisConditionStatus.PASSED
        : HypothesisConditionStatus.FAILED;
    }

    default:
      return HypothesisConditionStatus.SKIPPED_NO_DATA;
  }
}

// CONTRADICTION CHECKER

function checkContradictions(
  contradictions: HypothesisContradictionRow[],
  canonicalState: Record<string, any>,
  observations: string[]
): string[] {
  const found: string[] = [];
  const obsSet = SymbolContract.toNormalizedSet(observations);

  for (const c of contradictions) {
    const { contradiction_type, contradiction_key, contradiction_value } = c;

    switch (contradiction_type) {
      case 'OBSERVATION': {
        const cvNorm = SymbolContract.normalize(contradiction_value);
        if (cvNorm && obsSet.has(cvNorm)) {

          found.push(`${contradiction_key}=${contradiction_value}: ${c.explanation || 'contradiction detected'}`);
        }
        break;
      }
      case 'STAGE': {
        const currentStage = canonicalState.crop_stage || canonicalState.growth_stage;
        if (currentStage && SymbolContract.equals(currentStage, contradiction_value)) {
          found.push(`stage=${contradiction_value}: ${c.explanation || 'stage contradiction'}`);
        }
        break;
      }
      case 'WEATHER': {
        const weather = canonicalState.weather;
        if (weather && String(weather[contradiction_key]) === contradiction_value) {
          found.push(`weather.${contradiction_key}=${contradiction_value}: ${c.explanation || 'weather contradiction'}`);
        }
        break;
      }
      case 'PATTERN': {
        const actual = canonicalState[contradiction_key];
        if (actual && SymbolContract.equals(String(actual), contradiction_value)) {
          found.push(`${contradiction_key}=${contradiction_value}: ${c.explanation || 'pattern contradiction'}`);
        }
        break;
      }
    }
  }

  return found;
}

// HYPOTHESIS SCORER

function scoreHypothesis(
  hypothesis: HypothesisMasterRow,
  conditions: HypothesisConditionRow[],
  contradictionRows: HypothesisContradictionRow[],
  ruleIds: string[],
  canonicalState: Record<string, any>,
  observations: string[]
): HypothesisScore {
  const ledger: HypothesisLedgerEntry[] = [];
  const matchedConditions: string[] = [];
  const discriminators: string[] = [];

  // Evaluate each condition
  for (const cond of conditions) {
    const status = evaluateCondition(cond, canonicalState, observations);
    
    ledger.push({
      key: `${cond.condition_type}:${cond.condition_key}`,
      status,
      required: cond.is_required,
      weight: cond.weight,
      is_discriminator: cond.is_discriminator,
      inputValue: getInputValue(cond, canonicalState, observations),
      ruleValue: cond.value_json
    });

    if (status === HypothesisConditionStatus.PASSED) {
      matchedConditions.push(cond.condition_key);
    }
    if (cond.is_discriminator) {
      discriminators.push(cond.condition_key);
    }
  }

  // Check contradictions
  const contradictionsFound = checkContradictions(contradictionRows, canonicalState, observations);

  // STRICT FAIL-CLOSED MATCH RULE (Phase 6: SKIPPED_NO_DATA no longer eliminates):
  const hasRequiredFailed = ledger.some(e => e.required && e.status === HypothesisConditionStatus.FAILED);
  const hasRequiredSkipped = ledger.some(e => e.required && e.status === HypothesisConditionStatus.SKIPPED_NO_DATA);
  const hasContradiction = contradictionsFound.length > 0;
  const hasPassed = ledger.some(e => e.status === HypothesisConditionStatus.PASSED);

  let is_eliminated = false;
  let elimination_reason: HypothesisScore['elimination_reason'] = 'NONE';

  if (hasContradiction) {
    is_eliminated = true;
    elimination_reason = 'CONTRADICTION';
  } else if (hasRequiredFailed) {
    is_eliminated = true;
    elimination_reason = 'FAILED_REQUIRED';
  } else if (!hasPassed) {
    is_eliminated = true;
    elimination_reason = 'FAILED_REQUIRED';
  }

  // Compute score (even for eliminated, for logging)
  const requiredEntries = ledger.filter(e => e.required);
  const passedRequired = requiredEntries.filter(e => e.status === HypothesisConditionStatus.PASSED);

  const totalRequiredWeight = requiredEntries.reduce((sum, e) => sum + e.weight, 0);
  const passedRequiredWeight = passedRequired.reduce((sum, e) => sum + e.weight, 0);

  // Include optional passed conditions in score
  const optionalPassed = ledger.filter(e => !e.required && e.status === HypothesisConditionStatus.PASSED);
  const totalWeight = conditions.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = passedRequired.reduce((sum, e) => sum + e.weight, 0) +
                       optionalPassed.reduce((sum, e) => sum + e.weight, 0);

  const base_score = totalWeight > 0 ? passedWeight / totalWeight : 0;

  // Density weight (same formula as layered-rule-evaluator.ts)
  const total_required = requiredEntries.length;
  const density_weight = Math.min(1.0, Math.log(total_required + 1) / Math.log(10));
  let weighted_score = Math.min(1.0, base_score * (0.5 + 0.5 * density_weight));

  // Phase 6: bounded confidence penalty for missing evidence (weight-scaled),
  // capped so a single required SKIPPED cannot exceed 30% of the score.
  const skippedEntries = ledger.filter(e => e.status === HypothesisConditionStatus.SKIPPED_NO_DATA);
  if (skippedEntries.length > 0 && totalWeight > 0) {
    const skippedWeight = skippedEntries.reduce((sum, e) => sum + (e.required ? e.weight : e.weight * 0.5), 0);
    const penaltyRatio = Math.min(0.5, skippedWeight / totalWeight);
    const penalty = weighted_score * penaltyRatio;
    weighted_score = Math.max(0, weighted_score - penalty);
    if (hasRequiredSkipped) {
      console.log(`   ⚠️ [HypothesisScore] ${hypothesis.hypothesis_id} required-SKIPPED_NO_DATA: applied confidence penalty=${penalty.toFixed(3)} (score=${weighted_score.toFixed(3)})`);
    }
  }

  // Apply LOW_SCORE elimination
  if (!is_eliminated && weighted_score < MIN_HYPOTHESIS_CONFIDENCE) {
    is_eliminated = true;
    elimination_reason = 'LOW_SCORE';
  }


  return {
    hypothesis_id: hypothesis.hypothesis_id,
    cause_name_en: hypothesis.cause_name_en,
    hypothesis_type: hypothesis.hypothesis_type,
    canonical_group: hypothesis.canonical_group,
    passed_required: passedRequired.length,
    total_required,
    base_score,
    density_weight,
    weighted_score,
    ledger,
    contradictions_found: contradictionsFound,
    elimination_reason,
    is_eliminated,
    matched_conditions: matchedConditions,
    discriminators_available: discriminators,
    mapped_rule_ids: ruleIds
  };
}

function getInputValue(
  cond: HypothesisConditionRow,
  state: Record<string, any>,
  observations: string[]
): unknown {
  switch (cond.condition_type) {
    case 'OBSERVATION': return observations;
    case 'DAS_RANGE': return state.days_since_sowing;
    case 'STAGE': return state.crop_stage || state.growth_stage;
    case 'NDVI_PATTERN': return state.ndvi_trend || state.ndvi_level;
    case 'WEATHER': return state.weather;
    case 'SOIL': return state[cond.condition_key] || state.soil?.[cond.condition_key];
    case 'BOOLEAN_GATE': return state[cond.condition_key];
    default: return undefined;
  }
}

// DISCRIMINATOR QUESTION BUILDER

function buildDiscriminatorQuestion(
  scoreA: HypothesisScore,
  scoreB: HypothesisScore,
  conditionsA: HypothesisConditionRow[],
  conditionsB: HypothesisConditionRow[]
): DiscriminatorQuestion | undefined {
  // Find discriminator conditions unique to each hypothesis
  const discA = conditionsA.filter(c => c.is_discriminator);
  const discB = conditionsB.filter(c => c.is_discriminator);
  
  // Find the highest-weight discriminator that differs
  const allDiscs = [...discA, ...discB].sort((a, b) => b.weight - a.weight);
  
  for (const disc of allDiscs) {
    const isInA = discA.some(d => d.condition_key === disc.condition_key);
    const isInB = discB.some(d => d.condition_key === disc.condition_key);
    
    // Best discriminator: present in one but not the other
    if (isInA !== isInB) {
      const code = (disc.value_json as any)?.code || disc.condition_key;
      return {
        discriminator_key: disc.condition_key,
        hypothesis_a_id: scoreA.hypothesis_id,
        hypothesis_b_id: scoreB.hypothesis_id,
        hypothesis_a_name: scoreA.cause_name_en,
        hypothesis_b_name: scoreB.cause_name_en,
        // Phase 7: no hardcoded English. Carry the canonical observation code;
        // the language layer / observation_translations produce the farmer text.
        question_text_en: '',
        observation_code: code,
        question_text_mr: '', // @deprecated — LLM translates at runtime
        question_text_hi: '', // @deprecated — LLM translates at runtime
        weight: disc.weight
      };
    }
  }

  return undefined;
}

// COMPETING ARBITRATION

function arbitrateHypotheses(
  scores: HypothesisScore[],
  conditionsMap: Map<string, HypothesisConditionRow[]>,
  cropHasHypotheses: boolean
): ArbitrationResult {
  const eliminated = scores.filter(s => s.is_eliminated);
  const survived = scores.filter(s => !s.is_eliminated);
  const eliminatedDetails = eliminated.map(e => ({ 
    id: e.hypothesis_id, 
    reason: e.elimination_reason 
  }));

  // Sort survived by weighted_score descending
  survived.sort((a, b) => b.weighted_score - a.weighted_score);

  let result: ArbitrationResult = {
    best_hypothesis: null,
    competing: [],
    all_scores: scores,
    needs_clarification: false,
    decision_path: 'FULL_RULE_SCOPE',
    eliminated_hypotheses: eliminatedDetails,
    hypotheses_evaluated: scores.length
  };

  // Case 1: No hypotheses survive
  if (survived.length === 0) {
    if (cropHasHypotheses) {
      // Crop has hypothesis model but none survived -> clarification required
      result.needs_clarification = true;
      result.clarification_reason = 'ALL_ELIMINATED';
      result.decision_path = 'CLARIFICATION_REQUIRED';
    } else {
      // No hypothesis model for this crop -> backward compat fallback
      result.decision_path = 'FULL_RULE_SCOPE';
    }
    return result;
  }

  const best = survived[0];

  // Case 2: Best below threshold
  if (best.weighted_score < MIN_HYPOTHESIS_CONFIDENCE) {
    result.needs_clarification = true;
    result.clarification_reason = 'BELOW_THRESHOLD';
    result.decision_path = 'CLARIFICATION_REQUIRED';
    result.best_hypothesis = best;
    result.competing = survived;
    return result;
  }

  // Case 3: Two competing hypotheses within delta
  if (survived.length >= 2) {
    const second = survived[1];
    const delta = best.weighted_score - second.weighted_score;
    
    if (delta < DISCRIMINATOR_DELTA && second.weighted_score >= MIN_HYPOTHESIS_CONFIDENCE) {
      const question = buildDiscriminatorQuestion(
        best, second,
        conditionsMap.get(best.hypothesis_id) || [],
        conditionsMap.get(second.hypothesis_id) || []
      );

      if (question) {
        result.needs_clarification = true;
        result.clarification_reason = 'COMPETING_HYPOTHESES';
        result.discriminator_question = question;
        result.decision_path = 'CLARIFICATION_REQUIRED';
        result.best_hypothesis = best;
        result.competing = [second];
        return result;
      }
    }
  }

  // Case 4: Clear winner
  result.best_hypothesis = best;
  result.competing = survived.slice(1);
  result.decision_path = 'HYPOTHESIS_SCOPED';
  return result;
}

// METRICS UPDATE (fire-and-forget)

function updateMetrics(
  result: ArbitrationResult,
  supabase: any
): void {
  try {
    // Use RPC or raw update for atomic increment instead of upsert overwrite
    if (result.best_hypothesis && !result.needs_clarification) {
      const hId = result.best_hypothesis.hypothesis_id;
      const conf = result.best_hypothesis.weighted_score;
      // Fire-and-forget: update metrics with proper increment
      supabase.rpc('increment_hypothesis_metric', {
        p_hypothesis_id: hId,
        p_field: 'times_triggered',
        p_confidence: conf
      }).then(() => {}).catch(() => {
        // Fallback: simple upsert if RPC doesn't exist (non-blocking)
        supabase.from('hypothesis_metrics').upsert({
          hypothesis_id: hId,
          times_triggered: 1,
          avg_confidence: conf,
          last_triggered: new Date().toISOString()
        }, { onConflict: 'hypothesis_id' }).then(() => {}).catch(() => {});
      });
    }

    for (const e of result.eliminated_hypotheses) {
      if (e.reason === 'CONTRADICTION') {
        supabase.from('hypothesis_metrics').upsert({
          hypothesis_id: e.id,
          times_contradicted: 1,
          last_triggered: new Date().toISOString()
        }, { onConflict: 'hypothesis_id' }).then(() => {}).catch(() => {});
      }
    }
  } catch {
    // Non-blocking, silently ignore
  }
}

// MAIN ENTRY POINT

export interface CausalHypothesisInput {
  crop_group: string;
  canonical_state: Record<string, any>;
  observations: string[];
  supabase_client: any;
  trace_id?: string;
  // Step 3 — Frozen GraphTruth for the turn. When supplied it OVERRIDES the
  graph_truth?: import('../runtime/graph-truth.ts').GraphTruth | null;
}

export async function runCausalHypothesisArbitration(
  input: CausalHypothesisInput
): Promise<ArbitrationResult> {
  const { canonical_state, supabase_client, trace_id } = input;
  let { crop_group } = input;
  // SymbolContract-coerced observation list — accepts mixed shapes
  // (strings, graph-symbol objects, IOM rows) and normalizes to graph IDs.
  let observations: string[] = coerceSymbolList(input.observations);
  const startTime = Date.now();


  // Step 3 — HYPOTHESIS CONTRACT: GraphTruth is the sole authority.
  const gt = input.graph_truth ?? null;
  if (gt) {
    const { assertGraphTruthIntegrity } = await import('../runtime/graph-truth.ts');
    assertGraphTruthIntegrity(gt, 'RUN_CAUSAL_HYPOTHESIS_ARBITRATION');

    const drift: string[] = [];
    if (gt.crop_code && crop_group && gt.crop_code.toLowerCase() !== crop_group.toLowerCase()) {
      drift.push(`crop(pipe=${crop_group} graph=${gt.crop_code})`);
    }
    const pipeObs = [...(observations || [])].sort().join(',');
    const graphObs = [...gt.canonical_observations].sort().join(',');
    if (pipeObs !== graphObs) drift.push(`obs(pipe=[${pipeObs}] graph=[${graphObs}])`);
    if (drift.length) {
      console.warn(`[HYPOTHESIS_CONTRACT] site=CAUSAL_ARBITRATION trace=${trace_id ?? 'none'} drift=${drift.join(' ')} — using GraphTruth`);
    }

    crop_group = (gt.crop_code ?? crop_group) as string;
    observations = coerceSymbolList([...gt.canonical_observations]);

  } else {
    console.warn(`[HYPOTHESIS_CONTRACT] site=CAUSAL_ARBITRATION trace=${trace_id ?? 'none'} legacy_path — no graph_truth supplied by caller`);
  }

  // Phase 3: normalize to DB-stored lowercase crop_group (rice, sugarcane, ...)
  const normalizedCropGroup = normalizeCropGroup(crop_group);

  console.log(`\n🧠 [CausalHypothesis] ═══ ENGINE v${ENGINE_VERSION} ═══`);
  console.log(`   crop_group=${normalizedCropGroup} (raw=${crop_group}), observations=${observations.length}, trace=${trace_id || 'none'}`);
  console.log(`   Authority: ${gt ? `GRAPH_TRUTH(hash=${gt.hash})` : 'LEGACY_PIPE'}`);


  // Load hypothesis data
  const data = await loadHypothesesForCrop(normalizedCropGroup, supabase_client);
  const cropHasHypotheses = data.hypotheses.length > 0;

  console.log(`[HYPOTHESIS_LOAD] input_crop=${crop_group} resolved_crop_group=${normalizedCropGroup} hypothesis_count=${data.hypotheses.length}`);

  // Phase 4: bridge extractor codes → crop-canonical IOM codes BEFORE evaluation.
  let bridgedObservations: string[] = observations;
  try {
    const { bridgeToCropVocab } = await import('./concept-bridge.ts');
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of observations) {
      if (!raw) continue;
      // Async DB-backed bridge (observation_aliases). MUST be awaited — a
      const bridged = await bridgeToCropVocab(supabase_client, normalizedCropGroup, raw);
      const canonical =
        coerceSymbolViaContract(bridged?.canonical_code, 'bridgeToCropVocab.canonical_code') ??
        coerceSymbolViaContract(raw, 'bridgeToCropVocab.raw');
      if (!canonical) continue;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      out.push(canonical);
      if (bridged?.canonical_code && bridged.canonical_code !== bridged.raw_code) {
        console.log(`[OBSERVATION_BRIDGE] input=${raw} resolved=${bridged.canonical_code} source=${bridged.source} crop=${normalizedCropGroup}`);
      }
    }
    bridgedObservations = out;
  } catch (e) {
    console.warn(`[OBSERVATION_BRIDGE] bridge failed, using raw observations: ${(e as Error).message}`);
  }


  if (!cropHasHypotheses) {
    console.log(`   📭 No hypothesis model for crop_group=${normalizedCropGroup}, falling back to full rule scope`);
    return {
      best_hypothesis: null,
      competing: [],
      all_scores: [],
      needs_clarification: false,
      decision_path: 'FULL_RULE_SCOPE',
      eliminated_hypotheses: [],
      hypotheses_evaluated: 0
    };
  }

  // Score all hypotheses using bridged observations
  const scores: HypothesisScore[] = data.hypotheses.map(h =>
    scoreHypothesis(
      h,
      data.conditions.get(h.hypothesis_id) || [],
      data.contradictions.get(h.hypothesis_id) || [],
      data.ruleMappings.get(h.hypothesis_id) || [],
      canonical_state,
      bridgedObservations
    )
  );

  // OBS_TO_HYP_TRACE — deterministic forensic trace of the observation→hypothesis
  try {
    let searched_conditions = 0;
    let matched_conditions = 0;
    const failed_summary: Record<string, number> = {
      NO_SYMBOL_MATCH: 0,
      STAGE_BLOCKED: 0,
      DAS_BLOCKED: 0,
      OTHER: 0,
    };
    for (const conds of data.conditions.values()) {
      for (const c of conds) {
        if (c.condition_type === 'OBSERVATION') {
          searched_conditions++;
          const status = evaluateCondition(c, canonical_state, bridgedObservations);
          if (status === HypothesisConditionStatus.PASSED) matched_conditions++;
          else failed_summary.NO_SYMBOL_MATCH++;
        } else if (c.condition_type === 'STAGE') {
          const status = evaluateCondition(c, canonical_state, bridgedObservations);
          if (status === HypothesisConditionStatus.FAILED) failed_summary.STAGE_BLOCKED++;
        } else if (c.condition_type === 'DAS_RANGE') {
          const status = evaluateCondition(c, canonical_state, bridgedObservations);
          if (status === HypothesisConditionStatus.FAILED) failed_summary.DAS_BLOCKED++;
        }
      }
    }
    const rejected_reason: string[] = [];
    if (bridgedObservations.length === 0) rejected_reason.push('NO_OBSERVATIONS');
    if (searched_conditions === 0) rejected_reason.push('GRAPH_KNOWLEDGE_GAP:NO_OBSERVATION_CONDITIONS_FOR_CROP');
    if (matched_conditions === 0 && searched_conditions > 0) rejected_reason.push('MISSING_GRAPH_EDGE');
    console.log(
      `[OBS_TO_HYP_TRACE] trace=${trace_id ?? 'none'} crop=${normalizedCropGroup} ` +
      `observations=[${bridgedObservations.join(',')}] ` +
      `candidate_hypotheses_checked=${data.hypotheses.length} ` +
      `searched_conditions=${searched_conditions} matched_conditions=${matched_conditions} ` +
      `failed_summary=${JSON.stringify(failed_summary)} ` +
      `rejected_reason=[${rejected_reason.join(',')}]`
    );
  } catch (_e) { /* trace never throws */ }

  // Arbitrate
  const result = arbitrateHypotheses(scores, data.conditions, cropHasHypotheses);


  // P1-1: Guard against orphan hypotheses (survived arbitration but have no rule mappings)
  if (result.best_hypothesis && result.best_hypothesis.mapped_rule_ids.length === 0) {
    console.warn(`⚠️ [HypothesisEngine] ORPHAN: ${result.best_hypothesis.hypothesis_id} has no rule mappings — triggering fallback`);
    result.decision_path = 'ORPHAN_HYPOTHESIS_FALLBACK';
    result.needs_clarification = true;
    result.clarification_reason = `Hypothesis ${result.best_hypothesis.hypothesis_id} matched but has no associated treatment rules`;
  }

  // OBSERVABILITY BLOCK
  const elapsed = Date.now() - startTime;
  const eliminated = scores.filter(s => s.is_eliminated);
  const survived = scores.filter(s => !s.is_eliminated);

  console.log(`🧠 [CausalHypothesis] Arbitration Result (${elapsed}ms):`);
  console.log(`   hypotheses_evaluated: ${scores.length}`);
  console.log(`   hypotheses_eliminated: ${eliminated.length}`);
  console.log(`   hypotheses_survived: ${survived.length}`);
  console.log(`   best_hypothesis: ${result.best_hypothesis?.hypothesis_id || 'NONE'}`);
  console.log(`   best_score: ${result.best_hypothesis?.weighted_score?.toFixed(3) || '0'}`);
  console.log(`   decision_path: ${result.decision_path}`);
  if (result.needs_clarification) {
    console.log(`   clarification_reason: ${result.clarification_reason}`);
  }
  eliminated.forEach(e => 
    console.log(`   ❌ eliminated: ${e.hypothesis_id} reason=${e.elimination_reason} (score=${e.weighted_score.toFixed(3)})`)
  );
  survived.forEach(s =>
    console.log(`   ✅ survived: ${s.hypothesis_id} score=${s.weighted_score.toFixed(3)} rules=[${s.mapped_rule_ids.join(',')}]`)
  );

  // Fire-and-forget metrics
  updateMetrics(result, supabase_client);

  return result;
}

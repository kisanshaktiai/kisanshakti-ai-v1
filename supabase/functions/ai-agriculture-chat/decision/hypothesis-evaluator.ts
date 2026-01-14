/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HYPOTHESIS-FIRST CLARIFICATION EVALUATOR (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Pre-evaluate symbolic rules to build candidate hypothesis set BEFORE
 * generating clarification options. This ensures clarifications are
 * sourced strictly from stage-scoped symbolic rule hypotheses.
 * 
 * CONSTRAINTS:
 * - Do not change symbolic rule definitions
 * - Do not add new database tables or schemas
 * - Do not introduce new AI reasoning or LLM diagnosis
 * - Do not alter treatment logic or confidence thresholds
 * - Use only existing rule metadata (conditions_json, observable_characteristics)
 * 
 * STEP 1: Load rules filtered by crop_code, stage_applicable, canonical_group
 * STEP 2: Evaluate using partial condition matching only
 * STEP 3: Produce max 4 candidate hypotheses ranked by relevance
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Supabase client is passed via input, no import needed

export const HYPOTHESIS_EVALUATOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface HypothesisEvaluationInput {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  ndvi_level?: string;  // LOW, MEDIUM, HIGH
  ndvi_trend?: string;  // IMPROVING, STABLE, DECLINING
  weather?: {
    temp?: number;
    humidity?: number;
    rain_mm?: number;
  };
  known_observations: string[];
  user_query: string;
  supabaseClient: any;
  trace_id?: string;
}

export interface CandidateHypothesis {
  rule_id: string;
  cause: string;
  canonical_group: string;
  priority: number;
  stage_relevance_score: number;
  partial_match_score: number;
  total_score: number;
  observable_characteristics: ObservableCharacteristic[];
  differentiating_questions: any[];
  matched_conditions: string[];
  conditions_json: any;
}

export interface ObservableCharacteristic {
  id: string;
  observation_key: string;
  label_en?: string;
  label_hi?: string;
  label_mr?: string;
  confidence_boost?: number;
  is_visual?: boolean;
}

export interface HypothesisEvaluationOutput {
  candidates: CandidateHypothesis[];
  total_rules_evaluated: number;
  stage_locked: string;
  evaluation_method: 'PARTIAL_MATCH';
  timestamp: number;
  trace_id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUPS FOR RULE FILTERING
// ═══════════════════════════════════════════════════════════════════════════

const HYPOTHESIS_CANONICAL_GROUPS = [
  'pest', 'disease', 'stress', 'germination', 'irrigation',
  'nutrition', 'deficiency', 'insect', 'fungal', 'bacterial',
  'viral', 'establishment', 'soil_borne', 'borer', 'mite'
];

// ═══════════════════════════════════════════════════════════════════════════
// STAGE COMPATIBILITY PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const SEEDLING_STAGES = ['GERMINATION', 'SEEDLING', 'ESTABLISHMENT', 'SPROUTING', 'EMERGENCE'];
const VEGETATIVE_STAGES = ['VEGETATIVE', 'TILLERING', 'GRAND_GROWTH', 'ROSETTE'];
const REPRODUCTIVE_STAGES = ['FLOWERING', 'FRUITING', 'GRAIN_FILLING', 'POD_FORMATION'];
const MATURITY_STAGES = ['MATURITY', 'RIPENING', 'HARVEST'];

function getStageCategory(stage: string): 'SEEDLING' | 'VEGETATIVE' | 'REPRODUCTIVE' | 'MATURITY' | 'UNKNOWN' {
  const normalizedStage = stage.toUpperCase();
  if (SEEDLING_STAGES.some(s => normalizedStage.includes(s))) return 'SEEDLING';
  if (VEGETATIVE_STAGES.some(s => normalizedStage.includes(s))) return 'VEGETATIVE';
  if (REPRODUCTIVE_STAGES.some(s => normalizedStage.includes(s))) return 'REPRODUCTIVE';
  if (MATURITY_STAGES.some(s => normalizedStage.includes(s))) return 'MATURITY';
  return 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTIAL CONDITION MATCHING
// Evaluate how well a rule's conditions match available facts
// ═══════════════════════════════════════════════════════════════════════════

function evaluatePartialConditionMatch(
  conditionsJson: any,
  input: HypothesisEvaluationInput
): { score: number; matchedConditions: string[] } {
  if (!conditionsJson || Object.keys(conditionsJson).length === 0) {
    return { score: 0.3, matchedConditions: [] }; // Base score for no conditions
  }
  
  const matchedConditions: string[] = [];
  let totalConditions = 0;
  let matchedCount = 0;
  
  // Check crop_stage match
  if (conditionsJson.crop_stage && Array.isArray(conditionsJson.crop_stage)) {
    totalConditions++;
    const stageMatch = conditionsJson.crop_stage.some((s: string) => {
      const normalized = s.toUpperCase();
      return normalized === input.growth_stage.toUpperCase() ||
             normalized === '*' || normalized === 'ALL' ||
             input.growth_stage.toUpperCase().includes(normalized);
    });
    if (stageMatch) {
      matchedCount++;
      matchedConditions.push('crop_stage');
    }
  }
  
  // Check observations match
  if (conditionsJson.observations && Array.isArray(conditionsJson.observations)) {
    totalConditions++;
    const obsMatch = conditionsJson.observations.some((obs: string) => {
      const obsLower = obs.toLowerCase();
      return input.known_observations.some(known => 
        known.toLowerCase().includes(obsLower) || obsLower.includes(known.toLowerCase())
      );
    });
    if (obsMatch) {
      matchedCount++;
      matchedConditions.push('observations');
    }
  }
  
  // Check trigger_keywords in user_query
  if (conditionsJson.trigger_keywords && Array.isArray(conditionsJson.trigger_keywords)) {
    totalConditions++;
    const queryLower = input.user_query.toLowerCase();
    const keywordMatch = conditionsJson.trigger_keywords.some((kw: string) => 
      queryLower.includes(kw.toLowerCase())
    );
    if (keywordMatch) {
      matchedCount += 2; // Higher weight for keyword match
      matchedConditions.push('trigger_keywords');
    }
  }
  
  // Check NDVI conditions if available
  if (conditionsJson.ndvi_level && input.ndvi_level) {
    totalConditions++;
    if (conditionsJson.ndvi_level.toLowerCase() === input.ndvi_level.toLowerCase()) {
      matchedCount++;
      matchedConditions.push('ndvi_level');
    }
  }
  
  // Calculate score (0-1)
  const score = totalConditions > 0 ? matchedCount / (totalConditions + 1) : 0.3;
  
  return { score: Math.min(1, score), matchedConditions };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE RELEVANCE SCORING
// Higher score if rule is specifically applicable to current stage
// ═══════════════════════════════════════════════════════════════════════════

function calculateStageRelevance(
  stageApplicable: string[] | null,
  currentStage: string
): number {
  if (!stageApplicable || !Array.isArray(stageApplicable) || stageApplicable.length === 0) {
    return 0.5; // Base score for universal rules
  }
  
  const normalizedCurrent = currentStage.toUpperCase();
  const currentCategory = getStageCategory(currentStage);
  
  // Exact stage match
  if (stageApplicable.some(s => s.toUpperCase() === normalizedCurrent)) {
    return 1.0;
  }
  
  // Stage contains current
  if (stageApplicable.some(s => normalizedCurrent.includes(s.toUpperCase()))) {
    return 0.9;
  }
  
  // Same category match
  if (stageApplicable.some(s => getStageCategory(s) === currentCategory)) {
    return 0.7;
  }
  
  // Wildcard match
  if (stageApplicable.some(s => s === '*' || s.toUpperCase() === 'ALL')) {
    return 0.5;
  }
  
  // No match - suppress this rule for this stage
  return 0.1;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT OBSERVABLE CHARACTERISTICS
// Parse and normalize observable_characteristics from rule
// ═══════════════════════════════════════════════════════════════════════════

function extractObservableCharacteristics(raw: any): ObservableCharacteristic[] {
  if (!raw) return [];
  
  // CRITICAL FIX: Handle edge cases where observable_characteristics is {} or invalid
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    // It's an object - check if it has valid keys
    const keys = Object.keys(raw);
    if (keys.length === 0) {
      console.log('   [ExtractObs] Skipping empty object {}');
      return [];
    }
    // If object has observation_key, treat as single item
    if (raw.observation_key) {
      raw = [raw];
    } else {
      // Unknown object structure, skip
      console.log('   [ExtractObs] Skipping unknown object structure:', keys.slice(0, 3));
      return [];
    }
  }
  
  const charArray = Array.isArray(raw) ? raw : [raw];
  
  return charArray.map((char: any, idx: number) => {
    // Handle string keys
    if (typeof char === 'string') {
      return {
        id: char,
        observation_key: char,
        label_en: char.replace(/_/g, ' '),
        is_visual: true
      };
    }
    
    // Handle object with observation_key
    if (char && typeof char === 'object' && char.observation_key) {
      return {
        id: char.id || char.observation_key || `obs_${idx}`,
        observation_key: char.observation_key,
        label_en: char.label_en || char.label || char.observation_key.replace(/_/g, ' '),
        label_hi: char.label_hi,
        label_mr: char.label_mr,
        confidence_boost: char.confidence_boost || 0.15,
        is_visual: char.is_visual !== false
      };
    }
    
    // Skip invalid entries
    return null;
  }).filter((c): c is ObservableCharacteristic => c !== null && !!c.observation_key);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HYPOTHESIS EVALUATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-evaluate symbolic rules to build candidate hypothesis set.
 * This is a READ-ONLY step that does NOT fire treatments.
 */
export async function evaluateCandidateHypotheses(
  input: HypothesisEvaluationInput
): Promise<HypothesisEvaluationOutput> {
  const traceId = input.trace_id || `hyp_${Date.now()}`;
  const { crop_code, growth_stage, supabaseClient } = input;
  
  console.log(`🎯 [HypothesisEval v1] Pre-evaluating rules for ${crop_code}/${growth_stage}`);
  console.log(`   Known observations: ${input.known_observations.join(', ') || 'none'}`);
  console.log(`   NDVI: ${input.ndvi_level || 'unknown'} (${input.ndvi_trend || 'unknown'})`);
  
  // Stage normalization map: UI stage names → DB stage names
  const STAGE_DB_MAP: Record<string, string> = {
    'seedling': 'germination',
    'vegetative': 'tillering',
    'tillering': 'tillering',
    'flowering': 'grand_growth',
    'reproductive': 'grand_growth',
    'grand_growth': 'grand_growth',
    'maturation': 'maturity',
    'maturity': 'maturity',
    'ripening': 'maturity',
    'harvesting': 'harvest',
    'harvest': 'harvest',
    'germination': 'germination',
    'planting': 'planting',
  };
  
  const normalizeStage = (stage: string): string => {
    const key = stage.toLowerCase().trim().replace(/[\s-]/g, '_');
    return STAGE_DB_MAP[key] || key;
  };
  
  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Load rules filtered by crop_code, stage_applicable, canonical_group
    // CRITICAL FIX: Normalize stage to DB format and query with lowercase + 'all'
    // ═══════════════════════════════════════════════════════════════════════
    
    const dbStage = normalizeStage(growth_stage);
    const cropLower = crop_code.toLowerCase();
    
    console.log(`   [HypothesisEval] Stage normalization: ${growth_stage} → ${dbStage}`);
    console.log(`   [HypothesisEval] Crop normalization: ${crop_code} → ${cropLower}`);
    
    // CRITICAL FIX: Use separate queries for stage-specific and 'all' rules
    // The .cs. operator requires exact case matching, so we query both variants
    const stageVariants = [dbStage, dbStage.toLowerCase(), dbStage.toUpperCase(), 'all', '*'];
    
    // Query 1: Rules with observable_characteristics for this crop OR universal ('all') rules
    // NOTE: Filter out empty object {} which is not useful
    const { data: rules, error } = await supabaseClient
      .from('decision_rules')
      .select(`
        rule_id,
        cause,
        canonical_group,
        priority,
        stage_applicable,
        conditions_json,
        observable_characteristics,
        differentiating_questions,
        trigger_keywords
      `)
      .eq('is_active', true)
      .or(`crop_code.eq.${cropLower},crop_code.ilike.${cropLower},crop_code.eq.all`)
      .not('observable_characteristics', 'is', null)
      .neq('observable_characteristics', '{}')
      .neq('observable_characteristics', '[]')
      .limit(100);
    
    if (error) {
      console.error(`   ❌ [HypothesisEval] Database error:`, error);
      return {
        candidates: [],
        total_rules_evaluated: 0,
        stage_locked: growth_stage,
        evaluation_method: 'PARTIAL_MATCH',
        timestamp: Date.now(),
        trace_id: traceId
      };
    }
    
    if (!rules || rules.length === 0) {
      console.log(`   ⚠️ [HypothesisEval] No rules found for ${crop_code}/${growth_stage}`);
      return {
        candidates: [],
        total_rules_evaluated: 0,
        stage_locked: growth_stage,
        evaluation_method: 'PARTIAL_MATCH',
        timestamp: Date.now(),
        trace_id: traceId
      };
    }
    
    console.log(`   📦 [HypothesisEval] Loaded ${rules.length} candidate rules`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Evaluate using partial condition matching
    // ═══════════════════════════════════════════════════════════════════════
    
    const scoredCandidates: CandidateHypothesis[] = [];
    
    for (const rule of rules) {
      // Calculate stage relevance
      const stageRelevance = calculateStageRelevance(rule.stage_applicable, growth_stage);
      
      // Skip rules that don't apply to this stage at all
      if (stageRelevance < 0.2) continue;
      
      // Calculate partial condition match
      const { score: partialScore, matchedConditions } = evaluatePartialConditionMatch(
        rule.conditions_json,
        input
      );
      
      // Extract observable characteristics
      const observableChars = extractObservableCharacteristics(rule.observable_characteristics);
      
      // Skip rules with no observable characteristics
      if (observableChars.length === 0) continue;
      
      // Calculate total score
      const priorityScore = (rule.priority || 50) / 100;
      const totalScore = (stageRelevance * 0.4) + (partialScore * 0.4) + (priorityScore * 0.2);
      
      scoredCandidates.push({
        rule_id: rule.rule_id,
        cause: rule.cause || 'unknown',
        canonical_group: rule.canonical_group || 'general',
        priority: rule.priority || 50,
        stage_relevance_score: stageRelevance,
        partial_match_score: partialScore,
        total_score: totalScore,
        observable_characteristics: observableChars,
        differentiating_questions: rule.differentiating_questions || [],
        matched_conditions: matchedConditions,
        conditions_json: rule.conditions_json || {}
      });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Rank and return top 4 candidates
    // ═══════════════════════════════════════════════════════════════════════
    
    scoredCandidates.sort((a, b) => b.total_score - a.total_score);
    const topCandidates = scoredCandidates.slice(0, 4);
    
    console.log(`   ✅ [HypothesisEval] Top ${topCandidates.length} candidates:`);
    topCandidates.forEach((c, i) => {
      console.log(`      ${i + 1}. ${c.cause} (${c.canonical_group}) - score: ${(c.total_score * 100).toFixed(0)}%`);
    });
    
    return {
      candidates: topCandidates,
      total_rules_evaluated: rules.length,
      stage_locked: growth_stage,
      evaluation_method: 'PARTIAL_MATCH',
      timestamp: Date.now(),
      trace_id: traceId
    };
    
  } catch (err) {
    console.error(`   ❌ [HypothesisEval] Exception:`, err);
    return {
      candidates: [],
      total_rules_evaluated: 0,
      stage_locked: growth_stage,
      evaluation_method: 'PARTIAL_MATCH',
      timestamp: Date.now(),
      trace_id: traceId
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK IF AN OBSERVATION DIFFERENTIATES BETWEEN HYPOTHESES
// Higher score if the observation helps distinguish between candidates
// ═══════════════════════════════════════════════════════════════════════════

export function calculateDifferentiationPower(
  observationKey: string,
  candidates: CandidateHypothesis[]
): number {
  if (candidates.length <= 1) return 0.5;
  
  let presenceCount = 0;
  let absenceCount = 0;
  
  for (const candidate of candidates) {
    const hasObservation = candidate.observable_characteristics.some(
      c => c.observation_key.toUpperCase() === observationKey.toUpperCase()
    );
    if (hasObservation) {
      presenceCount++;
    } else {
      absenceCount++;
    }
  }
  
  // Best differentiation is when observation appears in SOME but not ALL candidates
  // Score is highest when split is 50/50
  const splitRatio = Math.min(presenceCount, absenceCount) / candidates.length;
  
  return splitRatio * 2; // 0-1 scale, 1 = perfect differentiation
}

// ═══════════════════════════════════════════════════════════════════════════
// NDVI CONSISTENCY CHECK
// Adjust option ranking based on NDVI signals
// ═══════════════════════════════════════════════════════════════════════════

export function isObservationNDVIConsistent(
  observationKey: string,
  ndviLevel?: string,
  ndviTrend?: string
): boolean {
  const obsUpper = observationKey.toUpperCase();
  
  // Low/localized NDVI → prefer establishment/soil/moisture options
  if (ndviLevel === 'LOW') {
    // Suppress widespread foliar symptoms
    if (['WIDESPREAD_YELLOWING', 'ENTIRE_FIELD_AFFECTED', 'ALL_PLANTS_SHOW'].some(
      p => obsUpper.includes(p)
    )) {
      return false;
    }
    // Prefer localized/establishment issues
    return true;
  }
  
  // Improving NDVI → suppress disease indicators
  if (ndviTrend === 'IMPROVING') {
    // Active disease would typically show declining NDVI
    if (['BLIGHT', 'ROT', 'SPREADING', 'PROGRESSIVE'].some(
      p => obsUpper.includes(p)
    )) {
      return false;
    }
  }
  
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL OBSERVABILITY SCORE
// Prefer symptoms that farmers can easily observe without tools
// ═══════════════════════════════════════════════════════════════════════════

const HIGHLY_VISUAL_PATTERNS = [
  'COLOR', 'YELLOW', 'BROWN', 'BLACK', 'WHITE', 'RED', 'SPOT',
  'HOLE', 'CURL', 'WILT', 'DRY', 'DEAD', 'INSECT', 'GAP', 'MISSING'
];

const ABSTRACT_PATTERNS = [
  'DEFICIENCY', 'STRESS', 'SYNDROME', 'COMPLEX', 'SYSTEMIC'
];

export function getVisualObservabilityScore(observationKey: string): number {
  const obsUpper = observationKey.toUpperCase();
  
  // Check for highly visual patterns
  if (HIGHLY_VISUAL_PATTERNS.some(p => obsUpper.includes(p))) {
    return 1.0;
  }
  
  // Check for abstract patterns (harder to observe)
  if (ABSTRACT_PATTERNS.some(p => obsUpper.includes(p))) {
    return 0.3;
  }
  
  return 0.6; // Default mid-score
}

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
  diagnostic_power?: 'HIGH' | 'MEDIUM' | 'LOW'; // GAP #2: Evidence-weighted boost
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

/**
 * P0 FIX: Observable Characteristics Array Normalizer
 * Handles multiple formats from decision_rules:
 * - Array of strings: ["dead_heart", "larvae_present"]
 * - Array of objects: [{observation_key: "DEAD_HEART"}]
 * - Single object: {observation_key: "DEAD_HEART"}
 * - Empty/null: returns empty array safely
 */
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
  
  // P0 FIX: Diagnostic power registry for evidence-weighted confidence boosts
  // Moved inline to avoid circular deps, aligned with diagnostic-weight-registry.ts
  const getDiagnosticPower = (key: string): 'HIGH' | 'MEDIUM' | 'LOW' => {
    const normalized = key.toUpperCase().replace(/[\s-]/g, '_');
    // HIGH: Pathognomonic (unique to specific pest/disease)
    const HIGH_POWER = [
      'DEAD_HEART', 'DEADHEART', 'DEAD_HEART_PRESENT',
      'TUNNELS_IN_STEM', 'TUNNELING', 'BORE_HOLE',
      'FRASS', 'FRASS_VISIBLE', 'FRASS_NEAR_BASE',
      'MUD_TUNNELS', 'TERMITE_MUD_TUBES', 'MUD_GALLERIES',
      'HONEYDEW', 'SOOTY_MOLD',
      'PINK_LARVAE', 'LARVAE_PRESENT', 'LARVAE_VISIBLE',
      'WHITE_POWDER', 'WOOLLY_MASS', 'COTTONY_MASS'
    ];
    // LOW: Non-specific (common to many causes)
    const LOW_POWER = [
      'YELLOWING', 'LEAF_YELLOWING', 'GENERAL_YELLOWING',
      'WILTING', 'LEAF_WILTING', 'PLANT_WILTING',
      'STUNTED', 'STUNTED_GROWTH', 'POOR_GROWTH',
      'DRYING', 'LEAF_DRYING', 'TIP_DRYING',
      'BROWNING', 'LEAF_BROWNING', 'EDGE_BROWNING',
      'GAPS', 'PATCHY_DAMAGE', 'GAPS_IN_FIELD'
    ];
    if (HIGH_POWER.some(p => normalized.includes(p))) return 'HIGH';
    if (LOW_POWER.some(p => normalized.includes(p))) return 'LOW';
    return 'MEDIUM';
  };
  
  // P0 FIX: Evidence-weighted confidence boosts (GAP #2)
  const getBoostForPower = (power: 'HIGH' | 'MEDIUM' | 'LOW'): number => {
    if (power === 'HIGH') return 0.25;  // +25% for pathognomonic symptoms
    if (power === 'MEDIUM') return 0.12; // +12% for suggestive symptoms
    return 0.05; // +5% for non-specific symptoms
  };
  
  // P0 FIX: Normalize string keys to canonical ObservationKey format
  const normalizeToObservationKey = (str: string): string => {
    // Convert snake_case, kebab-case, or spaces to UPPER_SNAKE_CASE
    return str.toUpperCase().replace(/[\s-]/g, '_');
  };
  
  return charArray.map((char: any, idx: number) => {
    // P0 FIX: Handle string keys (new array format from migration)
    if (typeof char === 'string') {
      const normalizedKey = normalizeToObservationKey(char);
      const power = getDiagnosticPower(normalizedKey);
      return {
        id: normalizedKey,
        observation_key: normalizedKey,
        label_en: char.replace(/_/g, ' ').toLowerCase(),
        is_visual: true,
        diagnostic_power: power,
        confidence_boost: getBoostForPower(power)
      };
    }
    
    // Handle object with observation_key
    if (char && typeof char === 'object' && char.observation_key) {
      const normalizedKey = normalizeToObservationKey(char.observation_key);
      const power = getDiagnosticPower(normalizedKey);
      return {
        id: char.id || normalizedKey || `obs_${idx}`,
        observation_key: normalizedKey,
        label_en: char.label_en || char.label || char.observation_key.replace(/_/g, ' ').toLowerCase(),
        label_hi: char.label_hi,
        label_mr: char.label_mr,
        diagnostic_power: power,
        confidence_boost: getBoostForPower(power),
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
    
    // GAP #3: Detect strong diagnostic signals for cross-stage override
    const STRONG_SIGNALS = new Set([
      'DEAD_HEART', 'DEAD_HEART_PRESENT', 'DEADHEART', 'TUNNELS_IN_STEM',
      'TERMITE_MUD_TUBES', 'MUD_TUNNELS', 'HONEYDEW_PRESENT', 'HONEYDEW',
      'PINK_LARVAE_VISIBLE', 'PLANT_DEATH', 'SUDDEN_WILT'
    ]);
    
    const hasStrongSignal = input.known_observations.some(obs => 
      STRONG_SIGNALS.has(obs.toUpperCase().replace(/[\s-]/g, '_'))
    );
    
    if (hasStrongSignal) {
      console.log(`   ⚠️ [HypothesisEval] STRONG SIGNAL DETECTED - will allow cross-stage evaluation`);
    }
    
    for (const rule of rules) {
      // Calculate stage relevance
      let stageRelevance = calculateStageRelevance(rule.stage_applicable, growth_stage);
      
      // GAP #3: Allow cross-stage evaluation if strong signal present
      const shouldSkipByStage = stageRelevance < 0.2;
      let crossStageOverride = false;
      
      if (shouldSkipByStage && hasStrongSignal) {
        // Override stage restriction for strong diagnostic signals
        stageRelevance = 0.4; // Allow through with reduced score
        crossStageOverride = true;
        console.log(`   ⚠️ [StageOverride] Allowing ${rule.rule_id} despite stage mismatch (strong signal)`);
      } else if (shouldSkipByStage) {
        continue; // Normal skip for low relevance
      }
      
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

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC CONFIRMATION OPTIONS GENERATOR (Trust-First Mode)
// ═══════════════════════════════════════════════════════════════════════════
// When terminal damage is detected (plant died, whole plant affected),
// generate cause-confirmation options from rule observable_characteristics.
// These options help differentiate between hypotheses (pest vs disease vs abiotic).
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticConfirmationOption {
  label_mr: string;
  label_hi: string;
  label_en: string;
  observation_key: string;
  diagnostic_power: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_boost: number;
  source_rule_id?: string;
  icon?: string;
}

export interface DiagnosticConfirmationResult {
  question_mr: string;
  question_hi: string;
  question_en: string;
  options: DiagnosticConfirmationOption[];
  photo_option_included: boolean;
  hypotheses_count: number;
}

// Canonical labels for common diagnostic observations (crop-agnostic)
const DIAGNOSTIC_OBSERVATION_LABELS: Record<string, { mr: string; hi: string; en: string; icon: string }> = {
  'DEAD_HEART_PRESENT': {
    mr: 'मधली सुरळी सुकलेली / ओढल्यास बाहेर येते',
    hi: 'बीच की पत्ती सूखी / खींचने पर निकल जाती है',
    en: 'Central whorl dried / pulls out easily',
    icon: '🔴'
  },
  'LARVAE_PRESENT': {
    mr: 'खोडात / मुळांजवळ अळ्या दिसतात',
    hi: 'तने में / जड़ों के पास इल्ली दिखती है',
    en: 'Larvae visible in stem / near roots',
    icon: '🐛'
  },
  'MUD_TUBES_PRESENT': {
    mr: 'मातीत पांढरे वाळवी / बोगदे दिसतात',
    hi: 'मिट्टी में सफेद दीमक / सुरंग दिखती है',
    en: 'White termites / tunnels visible in soil',
    icon: '🏠'
  },
  'TUNNELS_IN_SOIL': {
    mr: 'जमिनीत बोगदे दिसतात',
    hi: 'जमीन में सुरंग दिखती है',
    en: 'Tunnels visible in soil',
    icon: '🕳️'
  },
  'HONEYDEW_PRESENT': {
    mr: 'पानांवर चिकट पदार्थ / काळी बुरशी',
    hi: 'पत्तों पर चिपचिपा पदार्थ / काली फफूंद',
    en: 'Sticky substance / black mold on leaves',
    icon: '✨'
  },
  'STEM_BORING_MARKS': {
    mr: 'खोडावर छिद्र / भुसा दिसतो',
    hi: 'तने पर छेद / भूसा दिखता है',
    en: 'Holes in stem / frass visible',
    icon: '🕳️'
  },
  'SETT_EASILY_PULLED_OUT': {
    mr: 'रोप सहज बाहेर येते (मूळ कमकुवत)',
    hi: 'पौधा आसानी से निकल जाता है (जड़ कमजोर)',
    en: 'Plant pulls out easily (weak roots)',
    icon: '🌱'
  },
  'FRASS_VISIBLE': {
    mr: 'खोडाजवळ भुसा / मैला दिसतो',
    hi: 'तने के पास भूसा / मैला दिखता है',
    en: 'Frass / excreta visible near stem',
    icon: '💩'
  },
  'WHITE_POWDERY_GROWTH': {
    mr: 'पांढरी भुकटी / पावडर दिसते',
    hi: 'सफेद पाउडर जैसा दिखता है',
    en: 'White powdery substance visible',
    icon: '🤍'
  },
  'ROOT_ROTTED': {
    mr: 'मुळे सडलेली / काळी दिसतात',
    hi: 'जड़ें सड़ी / काली दिखती हैं',
    en: 'Roots rotted / blackened',
    icon: '🪵'
  },
  'SOIL_TOO_DRY': {
    mr: 'माती खूप कोरडी आहे',
    hi: 'मिट्टी बहुत सूखी है',
    en: 'Soil is very dry',
    icon: '🏜️'
  },
  'FIELD_WATERLOGGED': {
    mr: 'शेतात पाणी साचलेले आहे',
    hi: 'खेत में पानी भरा है',
    en: 'Field is waterlogged',
    icon: '💧'
  }
};

/**
 * Generate DIAGNOSTIC_CONFIRMATION options from candidate hypotheses.
 * 
 * This function:
 * 1. Takes top candidate rules from hypothesis evaluation
 * 2. Extracts unique observable_characteristics
 * 3. Ranks by diagnostic power (differentiation ability)
 * 4. Returns max 4-5 options + mandatory photo option
 * 5. Removes "NONE_OF_THE_ABOVE" - replaced with "Take Photo"
 */
/**
 * Generate DIAGNOSTIC_CONFIRMATION options from candidate hypotheses.
 * 
 * AGRONOMIST PRINCIPLE:
 * When terminal damage is detected, we CONFIRM THE CAUSE - not the LOCATION.
 * This mirrors real agronomist behavior: "If the whole plant died, I don't ask 
 * which part - I ask for evidence to find the cause"
 * 
 * This function:
 * 1. Takes top candidate rules from hypothesis evaluation
 * 2. Extracts unique observable_characteristics with field verifiability
 * 3. Ranks by diagnostic power (differentiation ability), not symptom frequency
 * 4. Returns max 4-6 options + mandatory photo option
 * 5. NEVER includes "NONE_OF_THE_ABOVE" - replaced with "Take Photo"
 */
export function generateDiagnosticConfirmationOptions(
  candidates: CandidateHypothesis[],
  language: 'mr' | 'hi' | 'en' = 'mr',
  maxOptions: number = 5
): DiagnosticConfirmationResult {
  console.log(`   🔬 [DiagnosticConfirmation] Generating trust-first options from ${candidates.length} hypotheses`);
  console.log(`      Source=DECISION_RULES, Mode=TRUST_FIRST`);
  
  // Collect all unique observations with their diagnostic power
  const observationMap = new Map<string, {
    observation_key: string;
    diagnostic_power: 'HIGH' | 'MEDIUM' | 'LOW';
    confidence_boost: number;
    differentiation_score: number;
    field_verifiability: number; // How easy for farmer to verify in field
    source_rule_ids: string[];
  }>();
  
  for (const candidate of candidates) {
    for (const char of candidate.observable_characteristics) {
      const key = char.observation_key.toUpperCase();
      
      // Calculate differentiation power (appears in some but not all candidates)
      const diffScore = calculateDifferentiationPower(key, candidates);
      
      // Calculate field verifiability (visual observability)
      const fieldVerifiability = getVisualObservabilityScore(key);
      
      const existing = observationMap.get(key);
      if (!existing) {
        observationMap.set(key, {
          observation_key: key,
          diagnostic_power: char.diagnostic_power || 'MEDIUM',
          confidence_boost: char.confidence_boost || 0.12,
          differentiation_score: diffScore,
          field_verifiability: fieldVerifiability,
          source_rule_ids: [candidate.rule_id]
        });
      } else {
        existing.source_rule_ids.push(candidate.rule_id);
        // Prefer higher diagnostic power
        if (char.diagnostic_power === 'HIGH') {
          existing.diagnostic_power = 'HIGH';
          existing.confidence_boost = Math.max(existing.confidence_boost, 0.25);
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RANKING: By diagnostic weight (40%) + field verifiability (40%) + differentiation (20%)
  // This prioritizes options farmers can actually observe and that distinguish causes
  // ═══════════════════════════════════════════════════════════════════════════
  const sortedObservations = Array.from(observationMap.values())
    .filter(obs => DIAGNOSTIC_OBSERVATION_LABELS[obs.observation_key]) // Only use labeled observations
    .sort((a, b) => {
      // Diagnostic power weight (40%)
      const powerOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const powerScore = (powerOrder[b.diagnostic_power] - powerOrder[a.diagnostic_power]) * 0.4;
      
      // Field verifiability weight (40%)
      const verifyScore = (b.field_verifiability - a.field_verifiability) * 0.4;
      
      // Differentiation weight (20%)
      const diffScore = (b.differentiation_score - a.differentiation_score) * 0.2;
      
      return powerScore + verifyScore + diffScore;
    })
    .slice(0, maxOptions);
  
  console.log(`   📋 [DiagnosticConfirmation] Selected ${sortedObservations.length} diagnostic options (max ${maxOptions})`);
  sortedObservations.forEach((obs, i) => {
    console.log(`      ${i + 1}. ${obs.observation_key} (power=${obs.diagnostic_power}, verify=${(obs.field_verifiability * 100).toFixed(0)}%, diff=${(obs.differentiation_score * 100).toFixed(0)}%)`);
  });
  
  // Build options with multilingual labels
  const options: DiagnosticConfirmationOption[] = sortedObservations.map(obs => {
    const labels = DIAGNOSTIC_OBSERVATION_LABELS[obs.observation_key];
    return {
      label_mr: `${labels.icon} ${labels.mr}`,
      label_hi: `${labels.icon} ${labels.hi}`,
      label_en: `${labels.icon} ${labels.en}`,
      observation_key: obs.observation_key,
      diagnostic_power: obs.diagnostic_power,
      confidence_boost: obs.confidence_boost,
      source_rule_id: obs.source_rule_ids[0],
      icon: labels.icon
    };
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MANDATORY: Add "Take Photo" as FINAL option
  // HARD RULE: NEVER include "NONE_OF_THE_ABOVE"
  // Agronomic principle: If verbal confirmation fails, visual evidence is next step
  // ═══════════════════════════════════════════════════════════════════════════
  const photoOption: DiagnosticConfirmationOption = {
    label_mr: '📷 फोटो काढा (तज्ञ विश्लेषणासाठी)',
    label_hi: '📷 फोटो लें (विशेषज्ञ विश्लेषण के लिए)',
    label_en: '📷 Upload Photo (for expert analysis)',
    observation_key: 'PHOTO_REQUESTED',
    diagnostic_power: 'HIGH',
    confidence_boost: 0.30, // Photo provides high confidence
    icon: '📷'
  };
  options.push(photoOption);
  
  // Build trust-first question text (confirms cause, not restates problem)
  const questionTexts = {
    mr: '🔬 कारण ओळखण्यासाठी, खालीलपैकी काय दिसते ते सांगा:',
    hi: '🔬 कारण पहचानने के लिए, नीचे में से क्या दिखता है बताएं:',
    en: '🔬 To identify the cause, tell us which of these you observe:'
  };
  
  console.log(`   ✅ [DiagnosticConfirmation] Generated ${options.length} options (including photo)`);
  console.log(`      Photo option included=true, None_of_above=REMOVED`);
  
  return {
    question_mr: questionTexts.mr,
    question_hi: questionTexts.hi,
    question_en: questionTexts.en,
    options,
    photo_option_included: true,
    hypotheses_count: candidates.length
  };
}

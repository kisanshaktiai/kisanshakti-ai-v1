/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HYPOTHESIS-FIRST CLARIFICATION STRATEGY (v4.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Source clarification options strictly from stage-scoped symbolic rule
 * hypotheses instead of generic symptom buckets.
 * 
 * ARCHITECTURE:
 * 1. HYPOTHESIS-FIRST: Pre-evaluate rules to build candidate hypothesis set
 * 2. RULE-DRIVEN: Options sourced ONLY from candidate rules' observable_characteristics
 * 3. DIFFERENTIATION: Rank by power to distinguish between hypotheses
 * 4. STAGE-LOCKED: Enforce stage compatibility on all options
 * 5. NON-GENERIC: Block generic output when crop/stage/candidates exist
 * 
 * RULES:
 * 1. Stage-Locked: Once crop stage is derived, lock it for entire turn
 * 2. Trigger Rule: If crop+stage known but symptoms partial → clarify BEFORE rules
 * 3. HYPOTHESIS-FIRST: Pre-evaluate rules before generating options
 * 4. Rule-Driven: Options ONLY from candidate hypotheses' observable_characteristics
 * 5. Confidence Timing: Final confidence computed AFTER clarification response
 * 6. Canonical Rebuild: After clarification → map to symbols → re-run brain
 * 7. Decision Gate: Clarification + rule match → MUST return recommendation
 * 8. STAGE COMPATIBLE: All options must be valid for locked growth stage
 * 9. NON-GENERIC: Never show generic symptom options when candidates exist
 * 
 * FAILURE CLASSES:
 * - ESTABLISHMENT_FAILURE: Plant death, gaps, poor emergence (NO leaf options)
 * - VEGETATIVE_STRESS: Growth issues during vegetative stage
 * - PEST_DAMAGE: Visible insect/pest activity
 * - DISEASE_SYMPTOM: Fungal, bacterial, viral symptoms
 * - NUTRIENT_DEFICIENCY: Nutrient-related visual symptoms
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { ClarificationScope } from './clarification-renderer.ts';
import { ObservationKey } from '../decision/observation-ontology.ts';
import {
  FailureClass,
  FailureClassInput,
  FailureClassResult,
  detectPrimaryFailureClass,
  getClarificationDomain,
  isObservationStageCompatible,
  getFailureClassFallbackOptions,
  logFailureClassDetection,
  ClarificationDomain
} from '../decision/failure-class-detector.ts';
import {
  evaluateCandidateHypotheses,
  CandidateHypothesis,
  HypothesisEvaluationOutput,
  calculateDifferentiationPower,
  isObservationNDVIConsistent,
  getVisualObservabilityScore
} from '../decision/hypothesis-evaluator.ts';

export const CLARIFICATION_STRATEGY_VERSION = '4.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface LockedStageContext {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number;
  locked_at: number; // timestamp
  source: 'CROP_SCHEDULE' | 'LAND_CONTEXT' | 'CALCULATED';
  failure_class?: FailureClass;
  
  // PROMPT 3 FIX: Track validated observations separately from farmer claims
  validated_observations: string[];
  rejected_observations: Array<{ raw: string; reason: string }>;
}

export interface ClarificationTriggerInput {
  crop_known: boolean;
  stage_known: boolean;
  symptom_count: number;
  symptom_coverage: number; // 0-1, percentage of required symptom dimensions filled
  is_ambiguous: boolean;
  has_pending_clarification: boolean;
  clarification_completed: boolean;
  user_query?: string; // Added for failure class detection
  symptom_scope?: 'WHOLE_PLANT' | 'PART' | 'UNKNOWN'; // Added for failure class detection
}

export interface ClarificationTriggerResult {
  should_clarify: boolean;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  bypass_allowed: boolean;
  failure_class?: FailureClass;
}

export interface RuleDrivenClarificationInput {
  crop_code: string;
  stage: string;
  current_symptoms: string[];
  language: string;
  supabaseClient: any;
  user_query?: string;
  days_since_sowing?: number | null;
  detected_intent?: string;
  symptom_scope?: 'WHOLE_PLANT' | 'PART' | 'UNKNOWN';
  trace_id?: string;
  // New: NDVI context for intelligent option ranking
  ndvi_level?: string;
  ndvi_trend?: string;
  // PHASE-4: planted-variety resistance profile for variety-aware hypothesis ranking
  variety_id?: string | null;
  variety_resistance?: any[];
  weather?: {
    temp?: number;
    humidity?: number;
    rain_mm?: number;
  };
}

export interface RuleDrivenOption {
  id: string;
  label: string;
  observation_key: string;
  rule_id: string;
  confidence_boost: number;
  // New: Scoring metadata
  differentiation_score?: number;
  visual_score?: number;
}

export interface RuleDrivenClarificationOutput {
  question: string;
  options: RuleDrivenOption[];
  source: 'HYPOTHESIS_RULES' | 'DECISION_RULES' | 'FAILURE_CLASS_FALLBACK';
  stage_locked: string;
  generated_at: number;
  failure_class: FailureClass;
  fallback_used: boolean;
  fallback_reason?: string;
  // New: Hypothesis metadata
  candidate_hypotheses?: string[];
  total_hypotheses_evaluated?: number;
}

export interface ConfidenceTimingResult {
  pre_clarification_confidence: number;
  post_clarification_confidence: number;
  clarification_boost: number;
  is_final: boolean;
  timing_phase: 'INITIAL' | 'POST_CLARIFICATION';
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: VISUAL OBSERVABILITY HELPER
// Determines if a symptom can be observed visually without tools
// ═══════════════════════════════════════════════════════════════════════════

const VISUAL_OBSERVATION_PATTERNS = [
  // Colors and appearances
  'yellow', 'पिवळ', 'पीला', 'brown', 'तपकिरी', 'भूरा', 'white', 'पांढर', 'सफेद',
  'black', 'काळ', 'काला', 'red', 'लाल', 'green', 'हिरव',
  // Visible damage
  'hole', 'छिद्र', 'भोक', 'spot', 'डाग', 'ठिपके', 'curl', 'वळ', 'मुड',
  'wilt', 'सुक', 'मुरझ', 'dry', 'कोरड', 'सूखा',
  // Insects
  'insect', 'किड', 'कीड़', 'flying', 'उड', 'crawling', 'रांग', 'egg', 'अंड',
  // Physical symptoms
  'powder', 'भुर', 'sticky', 'चिकट', 'webbing', 'जाळ'
];

/**
 * STEP 3: Check if an observation is visually observable by farmer
 */
function isVisuallyObservable(optionId: string, label: string): boolean {
  const combined = `${optionId} ${label}`.toLowerCase();
  return VISUAL_OBSERVATION_PATTERNS.some(pattern => combined.includes(pattern.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. STAGE-LOCKED CLARIFICATION
// Once crop stage is derived from crop_schedules (DOS), lock it for entire turn
//
// W1 HARDENING (2026-06-13): module-level `let _lockedStageContext` deleted.
// Per-turn lock now lives on RequestScope.turnCache.engineState under
// key 'clarification:stage_lock'. See runtime/request-scope.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { type RequestScope, InvariantViolation } from '../runtime/request-scope.ts';

const STAGE_LOCK_KEY = 'clarification:stage_lock';

/**
 * Lock the growth stage for the current turn based on crop_schedules data.
 * This prevents downstream overrides and ensures consistent clarification.
 */
export function lockStageForTurn(
  scope: RequestScope,
  cropCode: string,
  growthStage: string,
  daysSinceSowing: number,
  source: LockedStageContext['source']
): LockedStageContext {
  // Fail loudly on signature drift instead of silently in .toUpperCase().
  // Prior to this guard, a mis-ordered caller passed a number into
  // `growthStage` and the resulting TypeError was swallowed by the
  // orchestrator's try/catch, falling back to a generic template response.
  if (typeof cropCode !== 'string' || typeof growthStage !== 'string') {
    throw new InvariantViolation('lockStageForTurn_invalid_args', {
      cropCode_type: typeof cropCode,
      growthStage_type: typeof growthStage,
      cropCode_value: cropCode,
      growthStage_value: growthStage,
    });
  }

  const ctx: LockedStageContext = {
    // Crop codes are canonical lower_snake_case (DB SSOT). Stages are an
    // intentionally separate UPPER vocabulary used by safety-gates and
    // stage-normalizer — keep them UPPER.
    crop_code: cropCode.toLowerCase(),
    growth_stage: growthStage.toUpperCase(),
    days_since_sowing: daysSinceSowing,
    locked_at: Date.now(),
    source,
  };
  scope.turnCache.engineState.set(STAGE_LOCK_KEY, ctx);

  console.log(`🔒 [ClarificationStrategy] Stage LOCKED: ${ctx.growth_stage} for ${ctx.crop_code} (DAS: ${daysSinceSowing}, source: ${source})`);
  scope.emit({
    stage: 'clarification',
    kind: 'decide',
    payload: { event: 'stage_locked', crop: ctx.crop_code, stage: ctx.growth_stage, das: daysSinceSowing, source },
  });

  return ctx;
}

/**
 * Get the currently locked stage context.
 * Returns null if no stage has been locked for this turn.
 */
export function getLockedStage(scope: RequestScope): LockedStageContext | null {
  return (scope.turnCache.engineState.get(STAGE_LOCK_KEY) as LockedStageContext | undefined) ?? null;
}

/**
 * Clear the locked stage (rarely needed — scope itself dies at request end).
 */
export function clearLockedStage(scope: RequestScope): void {
  scope.turnCache.engineState.delete(STAGE_LOCK_KEY);
}

/**
 * Check if a stage is currently locked for this turn.
 */
export function isStageLockedForTurn(scope: RequestScope): boolean {
  return scope.turnCache.engineState.has(STAGE_LOCK_KEY);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CLARIFICATION TRIGGER RULE
// If crop+stage known but symptoms partial/ambiguous → clarify FIRST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine if clarification should be triggered BEFORE rule evaluation.
 * This treats clarification as confidence-building, not a fallback.
 */
export function shouldTriggerClarificationFirst(
  input: ClarificationTriggerInput
): ClarificationTriggerResult {
  // Log the trigger evaluation
  console.log(`📋 [ClarificationTrigger] Evaluating: crop=${input.crop_known}, stage=${input.stage_known}, symptoms=${input.symptom_count}, coverage=${(input.symptom_coverage * 100).toFixed(0)}%, ambiguous=${input.is_ambiguous}`);
  
  // If clarification already completed for this turn, don't re-trigger
  if (input.clarification_completed) {
    console.log(`   ✅ [ClarificationTrigger] Clarification already completed - proceeding to rules`);
    return {
      should_clarify: false,
      reason: 'CLARIFICATION_COMPLETED',
      priority: 'LOW',
      bypass_allowed: true
    };
  }
  
  // If pending clarification exists, must complete it first
  if (input.has_pending_clarification) {
    console.log(`   ⚠️ [ClarificationTrigger] Pending clarification exists - must complete`);
    return {
      should_clarify: true,
      reason: 'PENDING_CLARIFICATION_INCOMPLETE',
      priority: 'HIGH',
      bypass_allowed: false
    };
  }
  
  // CORE RULE: If crop and stage known, but symptoms are partial or ambiguous
  const isCropStageKnown = input.crop_known && input.stage_known;
  const isSymptomsPartial = input.symptom_coverage < 0.6; // Less than 60% symptom coverage
  const isSymptomsAmbiguous = input.is_ambiguous;
  const hasMinimalSymptoms = input.symptom_count < 2;
  
  if (isCropStageKnown && (isSymptomsPartial || isSymptomsAmbiguous || hasMinimalSymptoms)) {
    console.log(`   🔄 [ClarificationTrigger] TRIGGERED: crop+stage known but symptoms insufficient`);
    console.log(`   📊 Coverage: ${(input.symptom_coverage * 100).toFixed(0)}%, Count: ${input.symptom_count}, Ambiguous: ${isSymptomsAmbiguous}`);
    
    return {
      should_clarify: true,
      reason: isSymptomsAmbiguous 
        ? 'AMBIGUOUS_SYMPTOMS' 
        : isSymptomsPartial 
          ? 'PARTIAL_SYMPTOM_COVERAGE'
          : 'MINIMAL_SYMPTOMS',
      priority: isSymptomsAmbiguous ? 'HIGH' : 'MEDIUM',
      bypass_allowed: false
    };
  }
  
  // If crop or stage unknown, may need different type of clarification
  if (!input.crop_known || !input.stage_known) {
    console.log(`   ℹ️ [ClarificationTrigger] Crop/stage not fully known - standard flow`);
    return {
      should_clarify: false, // Let standard clarification flow handle this
      reason: 'CROP_STAGE_UNKNOWN',
      priority: 'LOW',
      bypass_allowed: true
    };
  }
  
  // If sufficient symptoms are known, proceed to rules
  console.log(`   ✅ [ClarificationTrigger] Sufficient symptoms (${(input.symptom_coverage * 100).toFixed(0)}%) - proceeding to rules`);
  return {
    should_clarify: false,
    reason: 'SUFFICIENT_SYMPTOM_COVERAGE',
    priority: 'LOW',
    bypass_allowed: true
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. HYPOTHESIS-FIRST CLARIFICATION
// Pre-evaluate rules, then source options ONLY from candidate hypotheses
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch clarification options from candidate hypothesis rules.
 * STEP 1: Pre-evaluate rules to build candidate hypothesis set
 * STEP 2: Source options ONLY from candidate rules' observable_characteristics
 * STEP 3: Rank by differentiation power and visual observability
 * STEP 4: Enforce stage compatibility
 * STEP 5: Block generic output when candidates exist
 */
/**
 * Fetch clarification options strictly from stage-scoped rule hypotheses.
 * 
 * ARCHITECTURE (Trust-First):
 * 1. HYPOTHESIS-FIRST: Pre-evaluate rules BEFORE generating options
 * 2. RULE-DRIVEN: Options sourced ONLY from decision_rules.observable_characteristics
 * 3. DIFFERENTIATION: Rank by power to distinguish between hypotheses
 * 4. STAGE-LOCKED: All options must be valid for locked growth stage
 * 5. NON-GENERIC: Block generic output when rule candidates exist
 * 
 * HARD INVARIANTS:
 * - Crop/stage context is NEVER dropped or rebuilt during this function
 * - Rule-driven options CANNOT be overwritten by NLU fallback
 * - IDENTIFY_LOCATION is NEVER returned when terminal damage detected
 */
export async function fetchRuleDrivenClarificationOptions(
  input: RuleDrivenClarificationInput
): Promise<RuleDrivenClarificationOutput | null> {
  const { crop_code, stage, current_symptoms, language, supabaseClient } = input;
  const traceId = input.trace_id || `trace_${Date.now()}`;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HARD INVARIANT: Log preserved context (must never be undefined at this point)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`📊 [HypothesisFirst v5] Trust-First Clarification for ${crop_code}/${stage}`);
  console.log(`   Scope=RULE_DRIVEN, Source=DECISION_RULES`);
  console.log(`   Preserved context: crop=${crop_code}, stage=${stage}, DAS=${input.days_since_sowing ?? 'unknown'}`);
  console.log(`   Current symptoms: ${current_symptoms.join(', ') || 'none'}`);
  console.log(`   NDVI: ${input.ndvi_level || 'unknown'} (trend: ${input.ndvi_trend || 'unknown'})`);
  
  // Validate hard invariants
  if (!crop_code || crop_code === 'UNKNOWN') {
    console.error(`   🚨 [INVARIANT VIOLATION] crop_code missing or UNKNOWN`);
  }
  if (!stage || stage === 'UNKNOWN') {
    console.error(`   🚨 [INVARIANT VIOLATION] stage missing or UNKNOWN`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 0.5: CHECK FOR DISCRIMINATOR QUESTION FROM CAUSAL HYPOTHESIS ENGINE
  // If the causal engine already produced a targeted question, prefer it
  // ═══════════════════════════════════════════════════════════════════════════
  if ((input as any).discriminatorQuestion) {
    const dq = (input as any).discriminatorQuestion;
    console.log(`   🎯 [Clarification] Using discriminator question from causal hypothesis engine`);
    console.log(`      Comparing: ${dq.hypothesis_a_name} vs ${dq.hypothesis_b_name}`);
    // Format as existing clarification output structure
    return {
      clarification_type: 'DISCRIMINATOR',
      options: [
        {
          code: dq.discriminator_key + '_YES',
          label_en: 'Yes',
          label_mr: '', // @deprecated — LLM translates at runtime
          label_hi: '', // @deprecated — LLM translates at runtime
          description_en: dq.question_text_en,
          description_mr: '', // @deprecated — LLM translates at runtime
          description_hi: ''  // @deprecated — LLM translates at runtime
        },
        {
          code: dq.discriminator_key + '_NO',
          label_en: 'No',
          label_mr: '', // @deprecated — LLM translates at runtime
          label_hi: '', // @deprecated — LLM translates at runtime
          description_en: `No, I haven't noticed ${dq.discriminator_key.toLowerCase().replace(/_/g, ' ')}`,
          description_mr: '', // @deprecated — LLM translates at runtime
          description_hi: ''  // @deprecated — LLM translates at runtime
        }
      ],
      question_text: dq.question_text_en,
      question_text_mr: '', // @deprecated — LLM translates at runtime
      question_text_hi: '', // @deprecated — LLM translates at runtime
      competing_hypotheses: [dq.hypothesis_a_name, dq.hypothesis_b_name],
      source: 'CAUSAL_HYPOTHESIS_ENGINE'
    } as any;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: PRE-EVALUATE RULES TO BUILD CANDIDATE HYPOTHESIS SET
  // This MUST happen BEFORE scope selection to ensure rule-awareness
  // ═══════════════════════════════════════════════════════════════════════════
  
  const hypothesisResult = await evaluateCandidateHypotheses({
    crop_code,
    growth_stage: stage,
    days_since_sowing: input.days_since_sowing ?? null,
    ndvi_level: input.ndvi_level,
    ndvi_trend: input.ndvi_trend,
    weather: input.weather,
    known_observations: current_symptoms,
    user_query: input.user_query || '',
    supabaseClient,
    trace_id: traceId,
    // PHASE-4: forward variety-resistance for variety-aware ranking
    variety_id: input.variety_id ?? null,
    variety_resistance: input.variety_resistance,
  });
  
  const candidates = hypothesisResult.candidates;
  console.log(`   🎯 [HypothesisFirst] Found ${candidates.length} candidate hypotheses`);
  
  // Also determine failure class for fallback purposes
  const failureClassInput: FailureClassInput = {
    crop_code,
    growth_stage: stage,
    days_since_sowing: input.days_since_sowing ?? null,
    observations: current_symptoms,
    symptoms: [],
    detected_intent: input.detected_intent || 'UNKNOWN',
    symptom_scope: input.symptom_scope || 'UNKNOWN',
  };
  const failureResult = detectPrimaryFailureClass(failureClassInput);
  const domain = getClarificationDomain(failureResult.primary_class);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: SOURCE OPTIONS ONLY FROM CANDIDATE RULES
  // If candidates exist, do NOT fall back to generic symptom lists
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (candidates.length === 0) {
    console.log(`   ⚠️ [HypothesisFirst] No candidates - using failure class fallback`);
    return useHypothesisFallback(failureResult, stage, language, traceId, 'NO_CANDIDATES');
  }
  
  // Collect all observable characteristics from candidate rules
  interface ScoredHypothesisOption {
    id: string;
    label: string;
    observation_key: string;
    rule_id: string;
    confidence_boost: number;
    differentiation_score: number;
    visual_score: number;
    ndvi_consistent: boolean;
    total_score: number;
  }
  
  const allOptions: ScoredHypothesisOption[] = [];
  const seenOptions = new Set<string>();
  
  for (const candidate of candidates) {
    for (const char of candidate.observable_characteristics) {
      const optionKey = String(char.observation_key).toLowerCase().replace(/[\s-]+/g, "_");
      
      // Skip duplicates
      if (seenOptions.has(optionKey)) continue;
      
      // STEP 3a: Exclude observations not compatible with failure class domain
      if (domain.excluded_observations.some(exc => optionKey.includes(exc))) {
        console.log(`   ⛔ Excluding ${char.observation_key} (excluded by ${failureResult.primary_class} domain)`);
        continue;
      }
      
      // STEP 4: Enforce stage compatibility
      if (!isObservationStageCompatible(char.observation_key, stage)) {
        console.log(`   ⛔ Excluding ${char.observation_key} (stage incompatible with ${stage})`);
        continue;
      }
      
      // Skip if already known
      if (current_symptoms.some(s => String(s).toLowerCase().replace(/[\s-]+/g, '_') === optionKey)) continue;
      
      seenOptions.add(optionKey);
      
      // Get label in requested language
      const label = char[`label_${language}` as keyof typeof char] as string || 
                    char.label_en || 
                    char.observation_key;
      
      // Calculate differentiation power (Step 4 of request)
      const differentiationScore = calculateDifferentiationPower(char.observation_key, candidates);
      
      // Calculate visual observability score
      const visualScore = getVisualObservabilityScore(char.observation_key);
      
      // Check NDVI consistency
      const ndviConsistent = isObservationNDVIConsistent(
        char.observation_key, 
        input.ndvi_level, 
        input.ndvi_trend
      );
      
      // Calculate total score (no new scoring systems - simple ordering)
      // Differentiation power (40%) + Visual observability (30%) + NDVI consistency (30%)
      const totalScore = (differentiationScore * 0.4) + 
                         (visualScore * 0.3) + 
                         (ndviConsistent ? 0.3 : 0);
      
      allOptions.push({
        id: char.id,
        label,
        observation_key: char.observation_key,
        rule_id: candidate.rule_id,
        confidence_boost: char.confidence_boost || 0.15,
        differentiation_score: differentiationScore,
        visual_score: visualScore,
        ndvi_consistent: ndviConsistent,
        total_score: totalScore
      });
    }
  }
  
  console.log(`   📦 [HypothesisFirst] Extracted ${allOptions.length} unique options from ${candidates.length} candidates`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: GUARANTEE NON-GENERIC OUTPUT
  // If we have candidates but no valid options after filtering, regenerate
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (allOptions.length === 0 && candidates.length > 0) {
    console.log(`   ⚠️ [HypothesisFirst] All options filtered - attempting regeneration from candidates`);
    
    // Try to extract ANY observation from candidates, relaxing some filters
    for (const candidate of candidates) {
      for (const char of candidate.observable_characteristics) {
        // Only apply stage filter (mandatory)
        if (!isObservationStageCompatible(char.observation_key, stage)) continue;
        if (seenOptions.has(String(char.observation_key).toLowerCase().replace(/[\s-]+/g, "_"))) continue;
        if (current_symptoms.some(s => String(s).toLowerCase().replace(/[\s-]+/g, '_') === String(char.observation_key).toLowerCase().replace(/[\s-]+/g, '_'))) continue;
        
        const label = char[`label_${language}` as keyof typeof char] as string || 
                      char.label_en || 
                      char.observation_key;
        
        allOptions.push({
          id: char.id,
          label,
          observation_key: char.observation_key,
          rule_id: candidate.rule_id,
          confidence_boost: char.confidence_boost || 0.15,
          differentiation_score: 0.5,
          visual_score: 0.5,
          ndvi_consistent: true,
          total_score: 0.5
        });
        
        seenOptions.add(String(char.observation_key).toLowerCase().replace(/[\s-]+/g, "_"));
        
        // Stop after getting 3 options
        if (allOptions.length >= 3) break;
      }
      if (allOptions.length >= 3) break;
    }
  }
  
  // Final fallback if still no options
  if (allOptions.length === 0) {
    console.log(`   ⚠️ [HypothesisFirst] No options after regeneration - using fallback`);
    return useHypothesisFallback(failureResult, stage, language, traceId, 'ALL_OPTIONS_FILTERED');
  }
  
  // Sort by total score and take top 3
  allOptions.sort((a, b) => b.total_score - a.total_score);
  const topOptions = allOptions.slice(0, 3);
  
  // Build final options array
  const options: RuleDrivenOption[] = topOptions.map(opt => ({
    id: opt.id,
    label: opt.label,
    observation_key: opt.observation_key,
    rule_id: opt.rule_id,
    confidence_boost: opt.confidence_boost,
    differentiation_score: opt.differentiation_score,
    visual_score: opt.visual_score
  }));
  
  // Generate hypothesis-aware question
  const question = getHypothesisAwareQuestion(candidates, stage, language);
  
  // Log for audit
  logFailureClassDetection(traceId, failureClassInput, failureResult, domain.name, false, null);
  
  console.log(`   ✅ [HypothesisFirst] Generated ${options.length} hypothesis-driven options`);
  options.forEach((opt, i) => {
    console.log(`      ${i + 1}. ${opt.observation_key} (diff: ${topOptions[i].differentiation_score.toFixed(2)}, visual: ${topOptions[i].visual_score.toFixed(2)})`);
  });
  
  return {
    question,
    options,
    source: 'HYPOTHESIS_RULES',
    stage_locked: stage,
    generated_at: Date.now(),
    failure_class: failureResult.primary_class,
    fallback_used: false,
    candidate_hypotheses: candidates.map(c => c.cause),
    total_hypotheses_evaluated: hypothesisResult.total_rules_evaluated
  };
}

/**
 * Generate a question that reflects the candidate hypotheses being tested.
 */
function getHypothesisAwareQuestion(
  candidates: CandidateHypothesis[],
  stage: string,
  language: string
): string {
  // If single candidate, ask specifically about it
  if (candidates.length === 1) {
    const cause = candidates[0].cause;
    const questions: Record<string, string> = {
      mr: `🔍 ${cause} साठी, ${stage} अवस्थेत तुम्हाला खालीलपैकी काय दिसते?`,
      hi: `🔍 ${cause} के लिए, ${stage} अवस्था में आपको इनमें से क्या दिखाई देता है?`,
      en: `🔍 For ${cause} in ${stage} stage, which of these do you observe?`
    };
    return questions[language] || questions.en;
  }
  
  // Multiple candidates - ask to differentiate
  const causeList = candidates.slice(0, 2).map(c => c.cause).join(' / ');
  const questions: Record<string, string> = {
    mr: `🔍 ${causeList} यातील फरक ओळखण्यासाठी, ${stage} अवस्थेत तुम्हाला काय दिसते?`,
    hi: `🔍 ${causeList} में अंतर जानने के लिए, ${stage} अवस्था में आपको क्या दिखाई देता है?`,
    en: `🔍 To distinguish between ${causeList} in ${stage} stage, what do you observe?`
  };
  return questions[language] || questions.en;
}

/**
 * Fallback when no hypothesis candidates or all options filtered.
 * Uses failure-class-specific options, NOT generic symptom lists.
 */
function useHypothesisFallback(
  failureResult: FailureClassResult,
  stage: string,
  language: string,
  traceId: string,
  reason: string
): RuleDrivenClarificationOutput {
  const fallbackOptions = getFailureClassFallbackOptions(failureResult.primary_class, language);
  
  // Filter by stage compatibility
  const stageCompatible = fallbackOptions.filter(opt => 
    isObservationStageCompatible(opt.observation_key, stage)
  );
  
  const options: RuleDrivenOption[] = stageCompatible.slice(0, 3).map(opt => ({
    id: opt.id,
    label: opt.label,
    observation_key: opt.observation_key,
    rule_id: 'FALLBACK',
    confidence_boost: 0.10
  }));
  
  const question = getFailureClassQuestion(failureResult.primary_class, stage, language);
  
  console.log(`   🔄 [HypothesisFallback] Using ${failureResult.primary_class} fallback (${options.length} options)`);
  console.log(`   📝 Fallback reason: ${reason}`);
  
  // Log for audit
  const failureClassInput: FailureClassInput = {
    crop_code: '',
    growth_stage: stage,
    days_since_sowing: null,
    observations: [],
    symptoms: [],
    detected_intent: 'UNKNOWN',
    symptom_scope: 'UNKNOWN',
  };
  logFailureClassDetection(traceId, failureClassInput, failureResult, 'FALLBACK', true, reason);
  
  return {
    question,
    options,
    source: 'FAILURE_CLASS_FALLBACK',
    stage_locked: stage,
    generated_at: Date.now(),
    failure_class: failureResult.primary_class,
    fallback_used: true,
    fallback_reason: reason
  };
}

// Legacy useFailureClassFallback removed - replaced by useHypothesisFallback

/**
 * Get failure-class-specific question template.
 */
function getFailureClassQuestion(
  failureClass: FailureClass,
  stage: string,
  language: string
): string {
  const questions: Record<FailureClass, Record<string, string>> = {
    ESTABLISHMENT_FAILURE: {
      mr: `🌱 ${stage} अवस्थेत रोपांच्या उगवणीत काय समस्या दिसत आहे?`,
      hi: `🌱 ${stage} अवस्था में पौधों के अंकुरण में क्या समस्या है?`,
      en: `🌱 What establishment issue are you seeing in ${stage} stage?`
    },
    PEST_DAMAGE: {
      mr: `🐛 ${stage} अवस्थेत कोणते किड/कीटक दिसत आहेत?`,
      hi: `🐛 ${stage} अवस्था में कौन से कीड़े दिखाई दे रहे हैं?`,
      en: `🐛 What pest damage are you observing in ${stage} stage?`
    },
    DISEASE_SYMPTOM: {
      mr: `🦠 ${stage} अवस्थेत रोगाची कोणती लक्षणे दिसत आहेत?`,
      hi: `🦠 ${stage} अवस्था में रोग के कौन से लक्षण दिखाई दे रहे हैं?`,
      en: `🦠 What disease symptoms are you seeing in ${stage} stage?`
    },
    NUTRIENT_DEFICIENCY: {
      mr: `🍃 ${stage} अवस्थेत पोषण कमतरतेची कोणती चिन्हे दिसत आहेत?`,
      hi: `🍃 ${stage} अवस्था में पोषक तत्व की कमी के कौन से संकेत हैं?`,
      en: `🍃 What nutrient deficiency signs do you see in ${stage} stage?`
    },
    VEGETATIVE_STRESS: {
      mr: `🌿 ${stage} अवस्थेत वाढीची काय समस्या दिसत आहे?`,
      hi: `🌿 ${stage} अवस्था में वृद्धि की क्या समस्या है?`,
      en: `🌿 What growth stress are you observing in ${stage} stage?`
    },
    UNKNOWN: {
      mr: `🔍 ${stage} अवस्थेत तुम्ही नेमके काय पाहत आहात?`,
      hi: `🔍 ${stage} अवस्था में आप ठीक से क्या देख रहे हैं?`,
      en: `🔍 What exactly are you observing in ${stage} stage?`
    }
  };
  
  return questions[failureClass]?.[language] || questions.UNKNOWN[language];
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CONFIDENCE CONSTRUCTION TIMING
// Final confidence computed ONLY after clarification response
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate confidence at the appropriate timing phase.
 * Pre-clarification confidence is PRELIMINARY only.
 * Post-clarification confidence is FINAL.
 */
export function calculateConfidenceWithTiming(
  baseConfidence: number,
  clarificationCompleted: boolean,
  clarificationBoost: number = 0.15
): ConfidenceTimingResult {
  if (!clarificationCompleted) {
    // Pre-clarification: Return preliminary confidence
    console.log(`📊 [ConfidenceTiming] PRE-clarification: ${(baseConfidence * 100).toFixed(0)}% (PRELIMINARY)`);
    return {
      pre_clarification_confidence: baseConfidence,
      post_clarification_confidence: 0,
      clarification_boost: 0,
      is_final: false,
      timing_phase: 'INITIAL'
    };
  }
  
  // Post-clarification: Compute final confidence with boost
  const finalConfidence = Math.min(1.0, baseConfidence + clarificationBoost);
  
  console.log(`📊 [ConfidenceTiming] POST-clarification: ${(baseConfidence * 100).toFixed(0)}% + ${(clarificationBoost * 100).toFixed(0)}% = ${(finalConfidence * 100).toFixed(0)}% (FINAL)`);
  
  return {
    pre_clarification_confidence: baseConfidence,
    post_clarification_confidence: finalConfidence,
    clarification_boost: clarificationBoost,
    is_final: true,
    timing_phase: 'POST_CLARIFICATION'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CANONICAL STATE REBUILD AFTER CLARIFICATION
// Map selected options to canonical symbols and re-run symbolic brain
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MERGE selected clarification observation into existing symbols.
 * 
 * CRITICAL: This MERGES, not replaces. The selected observation is added
 * to the existing symbol set, preserving all previously gathered evidence.
 * This ensures incremental evidence accumulation across clarification turns.
 */
export function mapClarificationSelectionToSymbols(
  selectedOption: RuleDrivenOption,
  existingSymbols: string[]
): string[] {
  // MERGE: Start with ALL existing symbols (never discard)
  const mergedSymbols = [...existingSymbols];
  
  // Add the observation key from the selected option if not already present.
  // CANONICAL CASE: push lower_snake_case so the rule engine and
  // observation_aliases / hypothesis_conditions resolve on direct equality.
  if (selectedOption.observation_key) {
    const normalizedKey = String(selectedOption.observation_key).toLowerCase().replace(/[\s-]+/g, '_');
    const alreadyExists = mergedSymbols.some(s =>
      String(s).toLowerCase().replace(/[\s-]+/g, '_') === normalizedKey
    );

    if (!alreadyExists) {
      mergedSymbols.push(normalizedKey);
      console.log(`   ➕ [ClarificationMerge] Merged symbol: ${normalizedKey} (total: ${mergedSymbols.length})`);
    } else {
      console.log(`   ℹ️ [ClarificationMerge] Symbol already exists: ${normalizedKey}`);
    }
  }
  
  console.log(`   📊 [ClarificationMerge] Final symbol set: [${mergedSymbols.join(', ')}]`);
  return mergedSymbols;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. DECISION GATE ALIGNMENT
// If clarification completed + rules fire → MUST return recommendation
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionGateCheckInput {
  clarification_completed: boolean;
  rules_fired: number;
  has_recommendations: boolean;
  authority_blocked: boolean;
  // NEW: Session state is authoritative for clarification status
  session_decision_state?: string;
  clarification_answer_received?: boolean;
}

export interface DecisionGateCheckResult {
  must_return_recommendation: boolean;
  allow_empty_response: boolean;
  reason: string;
  // NEW: Computed clarification active status
  clarification_active: boolean;
}

/**
 * Check if the decision gate mandates a recommendation.
 * 
 * CRITICAL: Session state is AUTHORITATIVE for clarification status.
 * Runtime flags are advisory only.
 * 
 * After clarification + rule match → empty responses are NOT allowed.
 */
export function checkDecisionGateAlignment(
  input: DecisionGateCheckInput
): DecisionGateCheckResult {
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: SESSION STATE IS AUTHORITATIVE
  // Compute clarification_active from session state, NOT runtime flags
  // ═══════════════════════════════════════════════════════════════════════════
  const clarificationActive = input.session_decision_state === 'awaiting_clarification';
  
  // INVARIANT CHECK: If clarification answered but session still says awaiting
  if (input.clarification_answer_received === true && clarificationActive) {
    console.error(`🚨 [DecisionGate] INVARIANT VIOLATION: Clarification answered but session_decision_state is still 'awaiting_clarification'`);
    console.error(`   This should NEVER happen - session state must be transitioned BEFORE DecisionGate`);
    // Force correction
  }
  
  console.log(`🚪 [DecisionGate] Checking:`);
  console.log(`   session_decision_state: ${input.session_decision_state || 'not_provided'}`);
  console.log(`   clarification_active: ${clarificationActive} (from session state)`);
  console.log(`   clarification_completed: ${input.clarification_completed}`);
  console.log(`   rules_fired: ${input.rules_fired}`);
  console.log(`   has_recommendations: ${input.has_recommendations}`);
  console.log(`   authority_blocked: ${input.authority_blocked}`);
  
  // If authority blocked, allow monitoring-only response
  if (input.authority_blocked) {
    return {
      must_return_recommendation: false,
      allow_empty_response: false, // Still must return SOMETHING (monitoring advice)
      reason: 'AUTHORITY_BLOCKED_MONITORING_ONLY',
      clarification_active: false // If blocked, clarification is not active
    };
  }
  
  // CRITICAL: If clarification completed AND rules fired → MUST return recommendation
  if (input.clarification_completed && input.rules_fired > 0) {
    if (!input.has_recommendations) {
      console.warn(`   ⚠️ [DecisionGate] VIOLATION: Clarification done + ${input.rules_fired} rules fired but NO recommendations`);
    }
    
    return {
      must_return_recommendation: true,
      allow_empty_response: false,
      reason: 'CLARIFICATION_PLUS_RULES_MANDATE_RESPONSE',
      clarification_active: false // Clarification is DONE, not active
    };
  }
  
  // Standard case: allow based on rules
  return {
    must_return_recommendation: input.rules_fired > 0,
    allow_empty_response: input.rules_fired === 0,
    reason: input.rules_fired > 0 ? 'RULES_FIRED' : 'NO_RULES_MATCHED',
    clarification_active: clarificationActive
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LOGGING UTILITIES
// Comprehensive logging for clarification flow debugging
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationLogEntry {
  trace_id: string;
  timestamp: number;
  event: 'TRIGGER' | 'STAGE_LOCK' | 'OPTIONS_GENERATED' | 'SELECTION_RECEIVED' | 'CONFIDENCE_COMPUTED' | 'DECISION_GATE';
  stage_used: string;
  confidence_before: number;
  confidence_after: number;
  details: Record<string, any>;
}

const _clarificationLogs: ClarificationLogEntry[] = [];

/**
 * Log a clarification event for debugging and auditing.
 */
export function logClarificationEvent(
  traceId: string,
  event: ClarificationLogEntry['event'],
  stageUsed: string,
  confidenceBefore: number,
  confidenceAfter: number,
  details: Record<string, any> = {}
): void {
  const entry: ClarificationLogEntry = {
    trace_id: traceId,
    timestamp: Date.now(),
    event,
    stage_used: stageUsed,
    confidence_before: confidenceBefore,
    confidence_after: confidenceAfter,
    details
  };
  
  _clarificationLogs.push(entry);
  
  // Keep only last 100 entries
  if (_clarificationLogs.length > 100) {
    _clarificationLogs.shift();
  }
  
  // Console log for debugging
  console.log(`📝 [ClarificationLog] ${event} | stage=${stageUsed} | conf: ${(confidenceBefore * 100).toFixed(0)}% → ${(confidenceAfter * 100).toFixed(0)}%`);
  if (Object.keys(details).length > 0) {
    console.log(`   Details:`, JSON.stringify(details));
  }
}

/**
 * Get recent clarification logs for a trace ID.
 */
export function getClarificationLogs(traceId?: string): ClarificationLogEntry[] {
  if (traceId) {
    return _clarificationLogs.filter(log => log.trace_id === traceId);
  }
  return [..._clarificationLogs];
}

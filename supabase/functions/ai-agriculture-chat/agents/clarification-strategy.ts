/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION-FIRST CONFIDENCE STRATEGY (v3.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Treat clarification as a PRIMARY confidence-building step, not a fallback.
 * Generate clarification options SCOPED BY FAILURE CLASS.
 * 
 * RULES:
 * 1. Stage-Locked: Once crop stage is derived, lock it for entire turn
 * 2. Trigger Rule: If crop+stage known but symptoms partial → clarify BEFORE rules
 * 3. FAILURE CLASS FIRST: Determine primary failure class before generating options
 * 4. Rule-Driven: Options from decision_rules.observable_characteristics filtered by class
 * 5. Confidence Timing: Final confidence computed AFTER clarification response
 * 6. Canonical Rebuild: After clarification → map to symbols → re-run brain
 * 7. Decision Gate: Clarification + rule match → MUST return recommendation
 * 8. STAGE COMPATIBLE: All options must be valid for locked growth stage
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

export const CLARIFICATION_STRATEGY_VERSION = '3.0.0';

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
  language: 'mr' | 'hi' | 'en';
  supabaseClient: any;
  user_query?: string;
  days_since_sowing?: number | null;
  detected_intent?: string;
  symptom_scope?: 'WHOLE_PLANT' | 'PART' | 'UNKNOWN';
  trace_id?: string;
}

export interface RuleDrivenOption {
  id: string;
  label: string;
  observation_key: string;
  rule_id: string;
  confidence_boost: number;
}

export interface RuleDrivenClarificationOutput {
  question: string;
  options: RuleDrivenOption[];
  source: 'DECISION_RULES' | 'FAILURE_CLASS_FALLBACK';
  stage_locked: string;
  generated_at: number;
  failure_class: FailureClass;
  fallback_used: boolean;
  fallback_reason?: string;
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
// ═══════════════════════════════════════════════════════════════════════════

let _lockedStageContext: LockedStageContext | null = null;

/**
 * Lock the growth stage for the current turn based on crop_schedules data.
 * This prevents downstream overrides and ensures consistent clarification.
 */
export function lockStageForTurn(
  cropCode: string,
  growthStage: string,
  daysSinceSowing: number,
  source: LockedStageContext['source']
): LockedStageContext {
  _lockedStageContext = {
    crop_code: cropCode.toUpperCase(),
    growth_stage: growthStage.toUpperCase(),
    days_since_sowing: daysSinceSowing,
    locked_at: Date.now(),
    source
  };
  
  console.log(`🔒 [ClarificationStrategy] Stage LOCKED: ${_lockedStageContext.growth_stage} for ${_lockedStageContext.crop_code} (DAS: ${daysSinceSowing}, source: ${source})`);
  
  return _lockedStageContext;
}

/**
 * Get the currently locked stage context.
 * Returns null if no stage has been locked for this turn.
 */
export function getLockedStage(): LockedStageContext | null {
  return _lockedStageContext;
}

/**
 * Clear the locked stage (call at end of turn).
 */
export function clearLockedStage(): void {
  _lockedStageContext = null;
}

/**
 * Check if a stage is currently locked.
 */
export function isStageLockedForTurn(): boolean {
  return _lockedStageContext !== null;
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
// 3. RULE-DRIVEN CLARIFICATION ONLY
// Generate options strictly from decision_rules metadata
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch clarification options from decision_rules table.
 * SCOPED BY FAILURE CLASS - not generic symptom fallback.
 */
export async function fetchRuleDrivenClarificationOptions(
  input: RuleDrivenClarificationInput
): Promise<RuleDrivenClarificationOutput | null> {
  const { crop_code, stage, current_symptoms, language, supabaseClient } = input;
  const traceId = input.trace_id || `trace_${Date.now()}`;
  
  console.log(`📊 [RuleDriven v3] Fetching clarification options for ${crop_code}/${stage}`);
  console.log(`   Current symptoms: ${current_symptoms.join(', ') || 'none'}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: DETERMINE PRIMARY FAILURE CLASS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const failureClassInput: FailureClassInput = {
    crop_code,
    growth_stage: stage,
    days_since_sowing: input.days_since_sowing ?? null,
    user_query: input.user_query || '',
    detected_intent: input.detected_intent || '',
    symptoms: current_symptoms,
    symptom_scope: input.symptom_scope || 'UNKNOWN'
  };
  
  const failureResult = detectPrimaryFailureClass(failureClassInput);
  const domain = getClarificationDomain(failureResult.primary_class);
  
  console.log(`   🎯 Failure Class: ${failureResult.primary_class} (${(failureResult.confidence * 100).toFixed(0)}%)`);
  console.log(`   📦 Domain: ${domain.name}, Excluded: ${domain.excluded_observations.join(', ') || 'none'}`);
  
  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: QUERY RULES FILTERED BY FAILURE CLASS DOMAIN
    // ═══════════════════════════════════════════════════════════════════════════
    
    let query = supabaseClient
      .from('decision_rules')
      .select(`
        id,
        rule_id,
        canonical_group,
        observable_characteristics,
        differentiating_questions,
        conditions_json,
        stage_applicable
      `)
      .eq('is_active', true)
      .ilike('crop_code', crop_code)
      .or(`stage_applicable.cs.{${stage}},stage_applicable.is.null`)
      .not('observable_characteristics', 'is', null)
      .limit(15);
    
    // Filter by canonical_group if domain has specific groups
    if (domain.canonical_groups.length > 0) {
      const groupFilter = domain.canonical_groups.map(g => `canonical_group.ilike.%${g}%`).join(',');
      query = query.or(groupFilter);
    }
    
    const { data: rules, error } = await query;
    
    if (error) {
      console.error(`   ❌ [RuleDriven] Database error:`, error);
      return useFailureClassFallback(failureResult, stage, language, traceId, 'DATABASE_ERROR');
    }
    
    if (!rules || rules.length === 0) {
      console.log(`   ⚠️ [RuleDriven] No rules found - using failure class fallback`);
      return useFailureClassFallback(failureResult, stage, language, traceId, 'NO_RULES_FOUND');
    }
    
    console.log(`   📦 [RuleDriven] Found ${rules.length} rules for ${domain.name} domain`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: EXTRACT AND FILTER OPTIONS BY FAILURE CLASS
    // ═══════════════════════════════════════════════════════════════════════════
    
    interface ScoredOption extends RuleDrivenOption {
      score: number;
      is_visual: boolean;
      differentiates_count: number;
    }
    
    const scoredOptions: ScoredOption[] = [];
    
    for (const rule of rules) {
      const characteristics = rule.observable_characteristics;
      if (!characteristics) continue;
      
      const charArray = Array.isArray(characteristics) ? characteristics : [characteristics];
      
      for (const char of charArray) {
        const optionId = char.observation_key || char.id || `opt_${scoredOptions.length}`;
        
        // STEP 3a: Exclude observations not compatible with failure class
        if (domain.excluded_observations.some(exc => optionId.toUpperCase().includes(exc))) {
          console.log(`   ⛔ Excluding ${optionId} (not compatible with ${failureResult.primary_class})`);
          continue;
        }
        
        // STEP 4: Exclude observations not compatible with growth stage
        if (!isObservationStageCompatible(optionId, stage)) {
          continue;
        }
        
        // Skip if already known or added
        if (current_symptoms.some(s => s.toLowerCase() === optionId.toLowerCase())) continue;
        if (scoredOptions.some(o => o.id === optionId)) continue;
        
        const label = char[`label_${language}`] || char.label_en || char.label || optionId;
        const isVisual = isVisuallyObservable(optionId, label);
        
        // Calculate score with failure class boost
        let score = 0;
        const ruleStages = rule.stage_applicable || [];
        if (Array.isArray(ruleStages) && ruleStages.some((s: string) => s.toUpperCase() === stage.toUpperCase())) {
          score += 30;
        }
        if (isVisual) score += 20;
        score += (char.confidence_boost || 0.15) * 10;
        
        scoredOptions.push({
          id: optionId,
          label,
          observation_key: char.observation_key || optionId,
          rule_id: rule.rule_id,
          confidence_boost: char.confidence_boost || 0.15,
          score,
          is_visual: isVisual,
          differentiates_count: 1
        });
      }
    }
    
    // Sort and take top 3
    scoredOptions.sort((a, b) => b.score - a.score);
    const options: RuleDrivenOption[] = scoredOptions.slice(0, 3).map(opt => ({
      id: opt.id,
      label: opt.label,
      observation_key: opt.observation_key,
      rule_id: opt.rule_id,
      confidence_boost: opt.confidence_boost
    }));
    
    if (options.length === 0) {
      console.log(`   ⚠️ [RuleDriven] No valid options after filtering - using fallback`);
      return useFailureClassFallback(failureResult, stage, language, traceId, 'ALL_OPTIONS_FILTERED');
    }
    
    // Generate failure-class-appropriate question
    const question = getFailureClassQuestion(failureResult.primary_class, stage, language);
    
    // Log for audit
    logFailureClassDetection(traceId, failureClassInput, failureResult, domain.name, false, null);
    
    console.log(`   ✅ [RuleDriven] Generated ${options.length} options scoped to ${failureResult.primary_class}`);
    
    return {
      question,
      options,
      source: 'DECISION_RULES',
      stage_locked: stage,
      generated_at: Date.now(),
      failure_class: failureResult.primary_class,
      fallback_used: false
    };
  } catch (err) {
    console.error(`   ❌ [RuleDriven] Error:`, err);
    return useFailureClassFallback(failureResult, stage, language, traceId, 'EXCEPTION');
  }
}

/**
 * Generate failure-class-specific fallback when no rule-driven options found.
 */
function useFailureClassFallback(
  failureResult: FailureClassResult,
  stage: string,
  language: 'mr' | 'hi' | 'en',
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
  
  console.log(`   🔄 [Fallback] Using ${failureResult.primary_class} fallback (${options.length} options)`);
  
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

/**
 * Get failure-class-specific question template.
 */
function getFailureClassQuestion(
  failureClass: FailureClass,
  stage: string,
  language: 'mr' | 'hi' | 'en'
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
 * Map selected clarification option to canonical observation keys.
 */
export function mapClarificationSelectionToSymbols(
  selectedOption: RuleDrivenOption,
  existingSymbols: string[]
): string[] {
  const newSymbols = [...existingSymbols];
  
  // Add the observation key from the selected option
  if (selectedOption.observation_key && !newSymbols.includes(selectedOption.observation_key)) {
    newSymbols.push(selectedOption.observation_key);
    console.log(`   ➕ [ClarificationRebuild] Added symbol: ${selectedOption.observation_key}`);
  }
  
  return newSymbols;
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
}

export interface DecisionGateCheckResult {
  must_return_recommendation: boolean;
  allow_empty_response: boolean;
  reason: string;
}

/**
 * Check if the decision gate mandates a recommendation.
 * After clarification + rule match → empty responses are NOT allowed.
 */
export function checkDecisionGateAlignment(
  input: DecisionGateCheckInput
): DecisionGateCheckResult {
  console.log(`🚪 [DecisionGate] Checking: clarification=${input.clarification_completed}, rules=${input.rules_fired}, hasRec=${input.has_recommendations}, blocked=${input.authority_blocked}`);
  
  // If authority blocked, allow monitoring-only response
  if (input.authority_blocked) {
    return {
      must_return_recommendation: false,
      allow_empty_response: false, // Still must return SOMETHING (monitoring advice)
      reason: 'AUTHORITY_BLOCKED_MONITORING_ONLY'
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
      reason: 'CLARIFICATION_PLUS_RULES_MANDATE_RESPONSE'
    };
  }
  
  // Standard case: allow based on rules
  return {
    must_return_recommendation: input.rules_fired > 0,
    allow_empty_response: input.rules_fired === 0,
    reason: input.rules_fired > 0 ? 'RULES_FIRED' : 'NO_RULES_MATCHED'
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

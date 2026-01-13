/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION-FIRST CONFIDENCE STRATEGY (v2.9.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Treat clarification as a PRIMARY confidence-building step, not a fallback.
 * Generate clarification options strictly from decision_rules metadata.
 * 
 * RULES:
 * 1. Stage-Locked: Once crop stage is derived, lock it for entire turn
 * 2. Trigger Rule: If crop+stage known but symptoms partial → clarify BEFORE rules
 * 3. Rule-Driven: Options from decision_rules.observable_characteristics only
 * 4. Confidence Timing: Final confidence computed AFTER clarification response
 * 5. Canonical Rebuild: After clarification → map to symbols → re-run brain
 * 6. Decision Gate: Clarification + rule match → MUST return recommendation
 * 7. STEP 3: Rank options by stage relevance, differentiation, observability
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { ClarificationScope } from './clarification-renderer.ts';
import { ObservationKey } from '../decision/observation-ontology.ts';

export const CLARIFICATION_STRATEGY_VERSION = '2.9.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface LockedStageContext {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number;
  locked_at: number; // timestamp
  source: 'CROP_SCHEDULE' | 'LAND_CONTEXT' | 'CALCULATED';
}

export interface ClarificationTriggerInput {
  crop_known: boolean;
  stage_known: boolean;
  symptom_count: number;
  symptom_coverage: number; // 0-1, percentage of required symptom dimensions filled
  is_ambiguous: boolean;
  has_pending_clarification: boolean;
  clarification_completed: boolean;
}

export interface ClarificationTriggerResult {
  should_clarify: boolean;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  bypass_allowed: boolean;
}

export interface RuleDrivenClarificationInput {
  crop_code: string;
  stage: string;
  current_symptoms: string[];
  language: 'mr' | 'hi' | 'en';
  supabaseClient: any;
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
  source: 'DECISION_RULES';
  stage_locked: string;
  generated_at: number;
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
 * Uses observable_characteristics and differentiating_questions columns.
 */
export async function fetchRuleDrivenClarificationOptions(
  input: RuleDrivenClarificationInput
): Promise<RuleDrivenClarificationOutput | null> {
  const { crop_code, stage, current_symptoms, language, supabaseClient } = input;
  
  console.log(`📊 [RuleDriven] Fetching clarification options for ${crop_code}/${stage}`);
  console.log(`   Current symptoms: ${current_symptoms.join(', ') || 'none'}`);
  
  try {
    // Query decision_rules for observable_characteristics matching crop and stage
    const { data: rules, error } = await supabaseClient
      .from('decision_rules')
      .select(`
        id,
        rule_id,
        canonical_group,
        observable_characteristics,
        differentiating_questions,
        conditions_json
      `)
      .eq('is_active', true)
      .ilike('crop_code', crop_code)
      .or(`stage_applicable.cs.{${stage}},stage_applicable.is.null`)
      .not('observable_characteristics', 'is', null)
      .limit(10);
    
    if (error) {
      console.error(`   ❌ [RuleDriven] Database error:`, error);
      return null;
    }
    
    if (!rules || rules.length === 0) {
      console.log(`   ⚠️ [RuleDriven] No rules with observable_characteristics found`);
      return null;
    }
    
    console.log(`   📦 [RuleDriven] Found ${rules.length} rules with characteristics`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Extract and RANK options by relevance
    // Priority: Stage relevance > Differentiation ability > Visual observability
    // ═══════════════════════════════════════════════════════════════════════════
    
    interface ScoredOption extends RuleDrivenOption {
      score: number;
      is_visual: boolean;
      differentiates_count: number;
    }
    
    const scoredOptions: ScoredOption[] = [];
    const ruleIdSet = new Set<string>();
    
    for (const rule of rules) {
      const characteristics = rule.observable_characteristics;
      if (!characteristics) continue;
      
      // Track which rules each option differentiates
      ruleIdSet.add(rule.rule_id);
      
      // Handle array of characteristics
      const charArray = Array.isArray(characteristics) ? characteristics : [characteristics];
      
      for (const char of charArray) {
        const optionId = char.observation_key || char.id || `opt_${scoredOptions.length}`;
        
        // Skip if already have this symptom
        if (current_symptoms.some(s => s.toLowerCase() === optionId.toLowerCase())) {
          continue;
        }
        
        // Skip if already added
        if (scoredOptions.some(o => o.id === optionId)) {
          continue;
        }
        
        // Get localized label
        const label = char[`label_${language}`] || char.label_en || char.label || char.description || optionId;
        
        // STEP 3: Calculate ranking score
        let score = 0;
        
        // 1. Stage relevance (check if rule's stage matches current stage)
        const ruleStages = rule.stage_applicable || [];
        if (Array.isArray(ruleStages) && ruleStages.some((s: string) => s.toUpperCase() === stage.toUpperCase())) {
          score += 30; // Strong stage match
        } else if (ruleStages.length === 0) {
          score += 15; // Universal rule
        }
        
        // 2. Visual observability (farmer can see without tools)
        const isVisual = isVisuallyObservable(optionId, label);
        if (isVisual) {
          score += 20;
        }
        
        // 3. Differentiation potential (can distinguish between competing rules)
        // Will be calculated after all options collected
        
        // 4. Confidence boost as tiebreaker
        score += (char.confidence_boost || 0.15) * 10;
        
        scoredOptions.push({
          id: optionId,
          label: label,
          observation_key: char.observation_key || optionId,
          rule_id: rule.rule_id,
          confidence_boost: char.confidence_boost || 0.15,
          score,
          is_visual: isVisual,
          differentiates_count: 1
        });
      }
      
      // Also check differentiating_questions (these have inherent high differentiation value)
      const diffQuestions = rule.differentiating_questions;
      if (diffQuestions && Array.isArray(diffQuestions)) {
        for (const q of diffQuestions) {
          if (q.options && Array.isArray(q.options)) {
            for (const opt of q.options) {
              const optId = opt.maps_to || opt.id || `diff_${scoredOptions.length}`;
              
              if (scoredOptions.some(o => o.id === optId) || current_symptoms.includes(optId)) {
                continue;
              }
              
              const optLabel = opt[`label_${language}`] || opt.label || optId;
              const isVisual = isVisuallyObservable(optId, optLabel);
              
              scoredOptions.push({
                id: optId,
                label: optLabel,
                observation_key: opt.maps_to || optId,
                rule_id: rule.rule_id,
                confidence_boost: 0.12,
                score: 25 + (isVisual ? 20 : 0), // Differentiating questions get base score
                is_visual: isVisual,
                differentiates_count: 2 // By definition, differentiating questions help differentiate
              });
            }
          }
        }
      }
    }
    
    // STEP 3 continued: Boost score for options that differentiate between multiple rules
    for (const option of scoredOptions) {
      // Count how many different rules this observation appears in
      const rulesWithThisObservation = rules.filter(r => {
        const chars = r.observable_characteristics;
        if (!chars) return false;
        const charArray = Array.isArray(chars) ? chars : [chars];
        return charArray.some(c => (c.observation_key || c.id) === option.observation_key);
      });
      
      // More differentiation = less value (we want observations that split the possibilities)
      // Ideal: observation that appears in SOME but not ALL rules
      if (rulesWithThisObservation.length < rules.length && rulesWithThisObservation.length > 0) {
        option.score += 15; // Good differentiator
        option.differentiates_count = rulesWithThisObservation.length;
      }
    }
    
    // Sort by score (highest first) and take top 3
    scoredOptions.sort((a, b) => b.score - a.score);
    
    console.log(`   📊 [RuleDriven] Ranked ${scoredOptions.length} options by relevance`);
    scoredOptions.slice(0, 5).forEach((opt, i) => {
      console.log(`      ${i + 1}. ${opt.id} (score: ${opt.score}, visual: ${opt.is_visual})`);
    });
    
    // Convert to RuleDrivenOption array (drop scoring fields)
    const options: RuleDrivenOption[] = scoredOptions.slice(0, 3).map(opt => ({
      id: opt.id,
      label: opt.label,
      observation_key: opt.observation_key,
      rule_id: opt.rule_id,
      confidence_boost: opt.confidence_boost
    }));
    
    if (options.length === 0) {
      console.log(`   ⚠️ [RuleDriven] No new options generated (all symptoms already known)`);
      return null;
    }
    
    // Generate question based on scope
    const questionTemplates = {
      mr: `🔍 ${stage} अवस्थेत तुम्ही नेमके काय पाहत आहात?`,
      hi: `🔍 ${stage} अवस्था में आप ठीक से क्या देख रहे हैं?`,
      en: `🔍 What exactly are you observing in the ${stage} stage?`
    };
    
    console.log(`   ✅ [RuleDriven] Generated ${options.length} options from decision_rules`);
    
    return {
      question: questionTemplates[language],
      options,
      source: 'DECISION_RULES',
      stage_locked: stage,
      generated_at: Date.now()
    };
  } catch (err) {
    console.error(`   ❌ [RuleDriven] Error:`, err);
    return null;
  }
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION READINESS GATE - Hard Safety Gate
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Ensures the system has SUFFICIENT CONFIRMED INFORMATION before attempting
 * any diagnosis or treatment recommendation. This is a HARD safety gate.
 * 
 * CORE PRINCIPLE:
 * The Symbolic Decision Brain decides. The LLM only explains.
 * Clarification is NEVER decision authorization.
 * 
 * GATE CRITERIA (ALL must be TRUE for treatment):
 * 1. Crop is identified (not UNKNOWN or NULL)
 * 2. Growth stage is determined (calculated from sowing date)
 * 3. Symptom is specific (not generic or vague)
 * 4. Decision authority is confirmed (CROP-level minimum)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const DECISION_READINESS_GATE_VERSION = '1.1.0';

// ═══════════════════════════════════════════════════════════════════════════
// P1-1 FIX: Import canonical types from authority-types.ts
// GateStatus and GateAction are now centralized
// ═══════════════════════════════════════════════════════════════════════════

import {
  GateStatus,
  GateAction,
  ResponseMode
} from './authority-types.ts';

// Re-export for backward compatibility
export { GateStatus, GateAction, ResponseMode };

// ═══════════════════════════════════════════════════════════════════════════
// INPUT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionReadinessInput {
  // Crop identification
  crop_name?: string | null;
  crop_source?: 'LAND_CONTEXT' | 'FARMER_CONFIRMATION' | 'SESSION_DATA' | 'UNKNOWN';
  
  // Growth stage
  growth_stage?: string | null;
  days_since_sowing?: number | null;
  sowing_date?: string | null;
  stage_source?: 'CROP_SCHEDULES' | 'FARMER_INPUT' | 'ESTIMATED' | 'UNKNOWN';
  
  // Symptom specificity
  symptom_description?: string | null;
  symptom_keys?: string[];
  is_specific_symptom: boolean;
  
  // Authority confirmation
  authority_confirmed: boolean;
  authority_level?: 'CROP' | 'LAND' | 'NONE' | 'UNKNOWN';
  confirmed_diagnosis?: {
    pest_code?: string;
    disease_code?: string;
    nutrient_deficiency?: string;
  };
  
  // Clarification context
  clarification_turn_count: number;
  pending_clarification: boolean;
  
  // Emergency detection
  has_emergency_indicators: boolean;
  emergency_keywords?: string[];
  
  // Land context availability
  has_land_context: boolean;
  land_id?: string;
}

export interface DecisionReadinessResult {
  gate_status: GateStatus;
  gate_action: GateAction;
  
  // Detailed criteria check
  criteria_results: {
    crop_identified: { passed: boolean; reason: string };
    stage_determined: { passed: boolean; reason: string };
    symptom_specific: { passed: boolean; reason: string };
    authority_confirmed: { passed: boolean; reason: string };
  };
  
  // What's missing (for clarification)
  missing_criteria: string[];
  next_clarification_priority?: string;
  
  // What's allowed
  allowed_response_types: string[];
  blocked_response_types: string[];
  
  // Reasoning
  reason: string;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
  
  // Metadata
  gate_version: string;
  checked_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// VAGUE SYMPTOM DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const VAGUE_SYMPTOM_PATTERNS = new Set([
  'UNKNOWN',
  'GENERAL',
  'SOMETHING_WRONG',
  'PROBLEM',
  'ISSUE',
  'HELP',
  'NOT_GOOD',
  'BAD_CONDITION'
]);

const SPECIFIC_SYMPTOM_INDICATORS = [
  'YELLOWING',
  'WILTING',
  'SPOTS',
  'HOLES',
  'CURLING',
  'BROWNING',
  'DRYING',
  'INSECTS',
  'BORER',
  'RUST',
  'BLIGHT',
  'WILT',
  'MOLD'
];

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENCY KEYWORD DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const EMERGENCY_KEYWORDS = new Set([
  // Marathi
  'संपूर्ण', 'सर्व', 'तातडी', 'गंभीर', 'मरत', 'वाळत', 'सुकत',
  // Hindi
  'पूरा', 'सब', 'तुरंत', 'गंभीर', 'मर', 'सूख',
  // English
  'entire', 'whole', 'emergency', 'urgent', 'dying', 'dead', 'spread rapidly'
]);

const RAPID_SPREAD_INDICATORS = [
  '2 दिवसात', '२ दिवसात', '2 days', 'quickly', 'fast', 'rapid'
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GATE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * checkDecisionReadiness
 * 
 * Validates whether the system has sufficient information to proceed
 * with diagnosis and treatment recommendations.
 * 
 * SAFETY PRINCIPLE: When in doubt, clarify. Never guess treatments.
 */
export function checkDecisionReadiness(input: DecisionReadinessInput): DecisionReadinessResult {
  const checkedAt = new Date().toISOString();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EMERGENCY BYPASS CHECK (Special fast-track)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (input.has_emergency_indicators) {
    console.log('[DecisionReadinessGate] EMERGENCY detected - fast-track enabled');
    
    return {
      gate_status: GateStatus.EMERGENCY_BYPASS,
      gate_action: GateAction.ALLOW_TREATMENT,
      criteria_results: {
        crop_identified: { passed: !!input.crop_name, reason: input.crop_name ? 'Crop identified' : 'Emergency bypass' },
        stage_determined: { passed: true, reason: 'Emergency bypass - stage not required' },
        symptom_specific: { passed: true, reason: 'Emergency severity overrides specificity requirement' },
        authority_confirmed: { passed: true, reason: 'Emergency authority auto-confirmed' }
      },
      missing_criteria: [],
      allowed_response_types: ['TREATMENT', 'URGENT_ACTION', 'EXPERT_ESCALATION'],
      blocked_response_types: [],
      reason: 'Emergency severity detected - fast-track enabled with reduced clarification',
      confidence_level: 'MEDIUM',
      gate_version: DECISION_READINESS_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITERIA 1: Crop Identification
  // ═══════════════════════════════════════════════════════════════════════════
  
  const cropIdentified = !!(input.crop_name && 
    input.crop_name !== 'UNKNOWN' && 
    input.crop_name !== 'null' &&
    input.crop_name.length > 0);
  
  const cropReason = cropIdentified 
    ? `Crop identified: ${input.crop_name} (source: ${input.crop_source || 'UNKNOWN'})`
    : 'Crop not identified - required for treatment recommendations';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITERIA 2: Growth Stage Determination
  // ═══════════════════════════════════════════════════════════════════════════
  
  const stageDetermined = !!(input.growth_stage && input.growth_stage !== 'UNKNOWN') ||
    (input.days_since_sowing !== null && input.days_since_sowing !== undefined && input.days_since_sowing >= 0);
  
  const stageReason = stageDetermined
    ? `Stage determined: ${input.growth_stage || `Day ${input.days_since_sowing}`} (source: ${input.stage_source || 'UNKNOWN'})`
    : 'Growth stage unknown - sowing date required for accurate recommendations';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITERIA 3: Symptom Specificity
  // ═══════════════════════════════════════════════════════════════════════════
  
  let symptomSpecific = input.is_specific_symptom;
  
  // Additional check: Are symptom keys specific?
  if (input.symptom_keys && input.symptom_keys.length > 0) {
    const hasVagueKey = input.symptom_keys.some(k => VAGUE_SYMPTOM_PATTERNS.has(k));
    const hasSpecificKey = input.symptom_keys.some(k => 
      SPECIFIC_SYMPTOM_INDICATORS.some(ind => k.includes(ind))
    );
    symptomSpecific = !hasVagueKey && hasSpecificKey;
  }
  
  const symptomReason = symptomSpecific
    ? `Specific symptom detected: ${input.symptom_keys?.join(', ') || input.symptom_description}`
    : 'Symptom description is too vague for diagnosis';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITERIA 4: Authority Confirmation
  // ═══════════════════════════════════════════════════════════════════════════
  
  const authorityConfirmed = input.authority_confirmed && 
    input.authority_level !== 'NONE' && 
    input.authority_level !== 'UNKNOWN';
  
  const hasConfirmedDiagnosis = !!(
    input.confirmed_diagnosis?.pest_code || 
    input.confirmed_diagnosis?.disease_code || 
    input.confirmed_diagnosis?.nutrient_deficiency
  );
  
  const authorityReason = authorityConfirmed
    ? `Authority confirmed: ${input.authority_level}${hasConfirmedDiagnosis ? ' with diagnosis' : ''}`
    : 'Decision authority not confirmed - cannot recommend treatments';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATE GATE STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const allCriteriaPassed = cropIdentified && stageDetermined && symptomSpecific && authorityConfirmed;
  const someCriteriaPassed = cropIdentified || stageDetermined || symptomSpecific;
  
  const missingCriteria: string[] = [];
  if (!cropIdentified) missingCriteria.push('CROP_IDENTIFICATION');
  if (!stageDetermined) missingCriteria.push('GROWTH_STAGE');
  if (!symptomSpecific) missingCriteria.push('SPECIFIC_SYMPTOM');
  if (!authorityConfirmed) missingCriteria.push('AUTHORITY_CONFIRMATION');
  
  // Determine priority for next clarification
  let nextClarificationPriority: string | undefined;
  if (!cropIdentified) {
    nextClarificationPriority = 'IDENTIFY_CROP';
  } else if (!stageDetermined) {
    nextClarificationPriority = 'IDENTIFY_SOWING_DATE';
  } else if (!symptomSpecific) {
    nextClarificationPriority = 'CLARIFY_SYMPTOM';
  } else if (!authorityConfirmed) {
    nextClarificationPriority = 'CONFIRM_OBSERVATION';
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CLARIFICATION LIMIT CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  
  const MAX_CLARIFICATION_TURNS = 3;
  const clarificationLimitReached = input.clarification_turn_count >= MAX_CLARIFICATION_TURNS;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINE GATE ACTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  let gateStatus: GateStatus;
  let gateAction: GateAction;
  let allowedResponseTypes: string[];
  let blockedResponseTypes: string[];
  let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
  let reason: string;
  
  if (allCriteriaPassed) {
    // GATE PASS: All criteria met
    gateStatus = GateStatus.PASS;
    gateAction = GateAction.ALLOW_TREATMENT;
    allowedResponseTypes = ['TREATMENT', 'DIAGNOSIS', 'ACTION_RECOMMENDATION'];
    blockedResponseTypes = [];
    confidenceLevel = 'HIGH';
    reason = 'All criteria met - treatment recommendations allowed';
    
  } else if (clarificationLimitReached && someCriteriaPassed) {
    // PARTIAL: Limit reached, some info available
    gateStatus = GateStatus.PARTIAL;
    gateAction = GateAction.PROVIDE_GENERAL_GUIDANCE;
    allowedResponseTypes = ['GENERAL_GUIDANCE', 'PREVENTIVE_MEASURES', 'MONITORING'];
    blockedResponseTypes = ['TREATMENT', 'SPECIFIC_DIAGNOSIS', 'DOSAGE'];
    confidenceLevel = 'LOW';
    reason = `Clarification limit reached (${MAX_CLARIFICATION_TURNS} turns). Providing general guidance only.`;
    
  } else if (clarificationLimitReached) {
    // PARTIAL: Limit reached, minimal info
    gateStatus = GateStatus.PARTIAL;
    gateAction = GateAction.REQUEST_PHOTO;
    allowedResponseTypes = ['PHOTO_REQUEST', 'EXPERT_ESCALATION', 'GENERAL_INFO'];
    blockedResponseTypes = ['TREATMENT', 'DIAGNOSIS', 'DOSAGE'];
    confidenceLevel = 'VERY_LOW';
    reason = 'Clarification limit reached with insufficient information. Requesting photo or escalating.';
    
  } else if (input.pending_clarification) {
    // FAIL: Clarification in progress
    gateStatus = GateStatus.FAIL;
    gateAction = GateAction.REQUIRE_CLARIFICATION;
    allowedResponseTypes = ['CLARIFICATION_QUESTION'];
    blockedResponseTypes = ['TREATMENT', 'DIAGNOSIS', 'DOSAGE', 'PRODUCT_RECOMMENDATION'];
    confidenceLevel = 'LOW';
    reason = 'Clarification pending - awaiting farmer response';
    
  } else {
    // FAIL: Need more information
    gateStatus = GateStatus.FAIL;
    gateAction = GateAction.REQUIRE_CLARIFICATION;
    allowedResponseTypes = ['CLARIFICATION_QUESTION', 'INFORMATION_ONLY'];
    blockedResponseTypes = ['TREATMENT', 'DIAGNOSIS', 'DOSAGE', 'PRODUCT_RECOMMENDATION'];
    confidenceLevel = 'LOW';
    reason = `Missing criteria: ${missingCriteria.join(', ')}`;
  }
  
  return {
    gate_status: gateStatus,
    gate_action: gateAction,
    criteria_results: {
      crop_identified: { passed: cropIdentified, reason: cropReason },
      stage_determined: { passed: stageDetermined, reason: stageReason },
      symptom_specific: { passed: symptomSpecific, reason: symptomReason },
      authority_confirmed: { passed: authorityConfirmed, reason: authorityReason }
    },
    missing_criteria: missingCriteria,
    next_clarification_priority: nextClarificationPriority,
    allowed_response_types: allowedResponseTypes,
    blocked_response_types: blockedResponseTypes,
    reason: reason,
    confidence_level: confidenceLevel,
    gate_version: DECISION_READINESS_GATE_VERSION,
    checked_at: checkedAt
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENCY DETECTION HELPER
// ═══════════════════════════════════════════════════════════════════════════

export function detectEmergencyIndicators(farmerMessage: string): {
  is_emergency: boolean;
  indicators: string[];
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'NONE';
} {
  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY GUARD: Handle undefined/empty input gracefully
  // ═══════════════════════════════════════════════════════════════════════════
  const safeMessage = typeof farmerMessage === 'string' ? farmerMessage : '';
  if (!safeMessage.trim()) {
    return { is_emergency: false, indicators: [], severity: 'NONE' };
  }
  
  const lowerMessage = safeMessage.toLowerCase();
  const foundIndicators: string[] = [];
  
  // Check emergency keywords
  EMERGENCY_KEYWORDS.forEach(keyword => {
    if (safeMessage.includes(keyword) || lowerMessage.includes(keyword.toLowerCase())) {
      foundIndicators.push(keyword);
    }
  });
  
  // Check rapid spread indicators
  RAPID_SPREAD_INDICATORS.forEach(indicator => {
    if (safeMessage.includes(indicator) || lowerMessage.includes(indicator.toLowerCase())) {
      foundIndicators.push(`RAPID_SPREAD: ${indicator}`);
    }
  });
  
  // Determine severity
  let severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'NONE' = 'NONE';
  if (foundIndicators.length >= 3) {
    severity = 'CRITICAL';
  } else if (foundIndicators.length >= 2) {
    severity = 'HIGH';
  } else if (foundIndicators.length >= 1) {
    severity = 'MODERATE';
  }
  
  return {
    is_emergency: severity !== 'NONE',
    indicators: foundIndicators,
    severity
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION RE-ENTRY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * validateClarificationReEntry
 * 
 * Ensures that when a farmer answers a clarification question,
 * the system RE-RUNS the full decision pipeline with PRESERVED context.
 * 
 * CRITICAL: Clarification answer = NEW EVIDENCE, not task completion.
 */
export function validateClarificationReEntry(
  previousState: {
    crop_name?: string;
    growth_stage?: string;
    days_since_sowing?: number;
    confirmed_symptoms?: string[];
    turn_count: number;
  },
  newAnswer: {
    selected_option?: string;
    mapped_observation?: string;
    text_answer?: string;
  }
): {
  valid: boolean;
  enriched_state: {
    crop_name?: string;
    growth_stage?: string;
    days_since_sowing?: number;
    confirmed_symptoms: string[];
    turn_count: number;
  };
  violations: string[];
  must_re_run_pipeline: boolean;
} {
  const violations: string[] = [];
  
  // INVARIANT: Previous confirmed values must be preserved
  const enrichedState = {
    crop_name: previousState.crop_name,
    growth_stage: previousState.growth_stage,
    days_since_sowing: previousState.days_since_sowing,
    confirmed_symptoms: [...(previousState.confirmed_symptoms || [])],
    turn_count: previousState.turn_count + 1
  };
  
  // VIOLATION CHECK: State degradation
  if (previousState.crop_name && !enrichedState.crop_name) {
    violations.push('STATE_DEGRADATION: crop_name reverted to UNKNOWN');
  }
  
  if (previousState.growth_stage && !enrichedState.growth_stage) {
    violations.push('STATE_DEGRADATION: growth_stage reverted to UNKNOWN');
  }
  
  // ENRICHMENT: Add new evidence from clarification answer
  if (newAnswer.mapped_observation) {
    enrichedState.confirmed_symptoms.push(newAnswer.mapped_observation);
  }
  
  // CRITICAL: Always re-run pipeline after clarification
  // Clarification is NEVER task completion
  const mustReRunPipeline = true;
  
  return {
    valid: violations.length === 0,
    enriched_state: enrichedState,
    violations,
    must_re_run_pipeline: mustReRunPipeline
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REJECT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface AutoRejectValidation {
  should_reject: boolean;
  rejection_reason: string;
  rejection_code: string;
}

/**
 * validateOutputBeforeSend
 * 
 * Final validation before sending response to farmer.
 * Rejects invalid outputs that violate Decision Brain principles.
 */
export function validateOutputBeforeSend(output: {
  response_type: string;
  decision_brain_source: boolean;
  has_treatment_content: boolean;
  has_product_names: boolean;
  has_dosages: boolean;
  gate_status: GateStatus;
  symbolic_decision_id?: string;
  reasoning_provided: boolean;
}): AutoRejectValidation {
  // REJECTION 1: Treatment without symbolic approval
  if (output.has_treatment_content && !output.decision_brain_source) {
    return {
      should_reject: true,
      rejection_reason: 'Treatment content without symbolic brain approval',
      rejection_code: 'TREATMENT_NO_APPROVAL'
    };
  }
  
  // REJECTION 2: Gate failed but treatment content present
  if (output.gate_status === GateStatus.FAIL && output.has_treatment_content) {
    return {
      should_reject: true,
      rejection_reason: 'Gate FAIL but treatment content present',
      rejection_code: 'GATE_FAIL_TREATMENT'
    };
  }
  
  // REJECTION 3: Products/dosages without symbolic decision ID
  if ((output.has_product_names || output.has_dosages) && !output.symbolic_decision_id) {
    return {
      should_reject: true,
      rejection_reason: 'Product/dosage without symbolic decision ID',
      rejection_code: 'PRODUCT_NO_DECISION_ID'
    };
  }
  
  // REJECTION 4: Treatment without reasoning
  if (output.has_treatment_content && !output.reasoning_provided) {
    return {
      should_reject: true,
      rejection_reason: 'Treatment without reasoning explanation',
      rejection_code: 'TREATMENT_NO_REASONING'
    };
  }
  
  return {
    should_reject: false,
    rejection_reason: '',
    rejection_code: ''
  };
}

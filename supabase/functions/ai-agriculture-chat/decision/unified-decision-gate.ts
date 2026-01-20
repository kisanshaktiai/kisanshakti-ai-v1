/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIFIED DECISION GATE - Single Point of Treatment Validation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * P1-4 GOVERNANCE FIX: Consolidates prescription-gate and decision-readiness-gate
 * into a single unified gate that:
 * 
 * 1. Validates authority (from authority-resolver)
 * 2. Checks crop stage safety
 * 3. Validates symptom specificity
 * 4. Enforces symbolic decision requirements
 * 5. Applies PHI/pollinator safety (delegated to existing safety modules)
 * 
 * RULE: There is exactly ONE gate. All treatment decisions pass through here.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  DecisionAuthority,
  AuthorityStatus,
  ResponseMode,
  GateStatus,
  GateAction,
  type AuthorityDecision,
  type UnifiedGateResult,
  type DiagnosticEscalationData,
  isTreatmentAuthority,
  blocksCtopTreatments
} from './authority-types.ts';

import {
  generateDiagnosticEscalationData,
  type DiagnosticEscalationInput
} from './diagnostic-escalation-generator.ts';

export const UNIFIED_GATE_VERSION = '1.0.1';

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION SUPPRESSION GUARD
// ═══════════════════════════════════════════════════════════════════════════

export interface SuppressionGuardResult {
  should_allow: boolean;
  reason: string;
  rules_fired_count: number;
  has_treatment_actions: boolean;
  authority_blocking: boolean;
  clarification_pending: boolean;
  suppression_prevented: boolean;
}

/**
 * validateRecommendationSuppression
 * 
 * PRODUCTION BUG FIX: Ensures that if prescription-level rules fire AND 
 * authority is not blocking AND no clarification is triggered, 
 * recommendations MUST NOT be dropped silently.
 * 
 * Call this AFTER evaluateUnifiedGate to detect potential silent suppression.
 */
export function validateRecommendationSuppression(
  gateResult: UnifiedGateResult,
  symbolicDecision: {
    decision_brain_source?: boolean;
    rules_fired?: string[];
    actions_returned?: Array<{ action_type?: string; product_name?: string }>;
    matched_responses?: string[];
  } | null
): SuppressionGuardResult {
  const rulesFiredCount = symbolicDecision?.rules_fired?.length ?? 0;
  const actionsReturned = symbolicDecision?.actions_returned ?? [];
  const hasTreatmentActions = actionsReturned.some(a => 
    a.action_type && TREATMENT_ACTIONS.has(a.action_type)
  );
  const hasProducts = actionsReturned.some(a => !!a.product_name);
  const hasMatchedResponses = (symbolicDecision?.matched_responses?.length ?? 0) > 0;
  
  const authorityBlocking = gateResult.authority_decision.authority !== DecisionAuthority.CROP &&
    gateResult.authority_decision.authority !== DecisionAuthority.NONE &&
    !gateResult.authority_decision.treatments_allowed;
  
  const clarificationPending = gateResult.response_mode === ResponseMode.CLARIFICATION;
  
  // SUPPRESSION DETECTION:
  // If rules fired AND (has treatment actions OR products OR matched_responses)
  // AND authority NOT blocking AND NO clarification pending
  // BUT gate returned FAIL or no recommendations → SILENT SUPPRESSION
  
  const rulesIndicateTreatment = rulesFiredCount > 0 && (hasTreatmentActions || hasProducts || hasMatchedResponses);
  const gateDenied = !gateResult.treatments_allowed && 
    gateResult.response_mode !== ResponseMode.CLARIFICATION &&
    gateResult.response_mode !== ResponseMode.DIAGNOSTIC_ESCALATION;
  
  const isSilentSuppression = rulesIndicateTreatment && !authorityBlocking && !clarificationPending && gateDenied;
  
  if (isSilentSuppression) {
    console.warn(`\n⚠️ [SuppressionGuard] SILENT SUPPRESSION DETECTED!`);
    console.warn(`   Rules Fired: ${rulesFiredCount}`);
    console.warn(`   Has Treatment Actions: ${hasTreatmentActions}`);
    console.warn(`   Has Products: ${hasProducts}`);
    console.warn(`   Has Matched Responses: ${hasMatchedResponses}`);
    console.warn(`   Authority Blocking: ${authorityBlocking}`);
    console.warn(`   Gate Status: ${gateResult.gate_status}`);
    console.warn(`   Response Mode: ${gateResult.response_mode}`);
    console.warn(`   → RECOMMENDATION SUPPRESSION PREVENTED`);
  }
  
  return {
    should_allow: isSilentSuppression ? true : gateResult.treatments_allowed,
    reason: isSilentSuppression 
      ? 'Suppression guard overrode gate - rules fired with valid treatments' 
      : gateResult.reason,
    rules_fired_count: rulesFiredCount,
    has_treatment_actions: hasTreatmentActions || hasProducts,
    authority_blocking: authorityBlocking,
    clarification_pending: clarificationPending,
    suppression_prevented: isSilentSuppression
  };
}

/**
 * applySuppressionGuard
 * 
 * Applies the suppression guard to a gate result, potentially upgrading
 * the response mode if silent suppression is detected.
 */
export function applySuppressionGuard(
  gateResult: UnifiedGateResult,
  symbolicDecision: {
    decision_brain_source?: boolean;
    rules_fired?: string[];
    actions_returned?: Array<{ action_type?: string; product_name?: string }>;
    matched_responses?: string[];
  } | null
): UnifiedGateResult {
  const guardResult = validateRecommendationSuppression(gateResult, symbolicDecision);
  
  if (guardResult.suppression_prevented) {
    // Upgrade the gate result to allow treatments
    const products = (symbolicDecision?.actions_returned ?? [])
      .filter(a => a.product_name)
      .map(a => a.product_name!.toLowerCase());
    
    return {
      ...gateResult,
      gate_status: GateStatus.PASS,
      gate_action: GateAction.ALLOW_TREATMENT,
      treatments_allowed: true,
      allowed_products: products.length > 0 ? products : gateResult.allowed_products,
      response_mode: ResponseMode.TREATMENT,
      reason: `Suppression guard: ${guardResult.rules_fired_count} rules fired with valid treatments - gate upgraded`,
      criteria_results: {
        ...gateResult.criteria_results,
        symbolic_decision_valid: { 
          passed: true, 
          reason: `Suppression guard: ${guardResult.rules_fired_count} rules with treatments` 
        }
      }
    };
  }
  
  return gateResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

export interface UnifiedGateInput {
  // Authority decision (MANDATORY - must be resolved before calling)
  authority_decision: AuthorityDecision;
  
  // Symbolic decision output
  symbolic_decision?: {
    decision_brain_source: boolean;
    status?: string;
    primary_decision?: {
      action_type?: string;
      target?: {
        pest_code?: string;
        disease_code?: string;
        nutrient_deficiency?: string;
      };
      application_details?: {
        product_name?: string;
        dosage?: string;
        dosage_per_acre?: string;
      };
    };
    actions_returned?: Array<{
      action_type?: string;
      product_name?: string;
      dosage?: string;
    }>;
    clarification_needed?: boolean;
    clarification_options?: Array<{
      label: string;
      value: string;
      observation_key?: string;
      i18n_key?: string;
    }>;
  } | null;
  
  // Crop context
  crop_name?: string | null;
  growth_stage?: string | null;
  days_since_sowing?: number | null;
  stage_source?: 'CONFIRMED' | 'DEFAULT' | 'UNKNOWN';
  
  // Symptom context
  symptom_keys?: string[];
  is_specific_symptom?: boolean;
  
  // Session context
  clarification_turn_count?: number;
  pending_clarification?: boolean;
  has_emergency_indicators?: boolean;
  
  // Land context
  land_id?: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Confidence-driven fields (CRITICAL FOR MODE RESOLUTION)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Decision confidence from semantic extraction (0-100) */
  decision_confidence?: number;
  
  /** Whether photo would help resolve visual ambiguity */
  has_visual_ambiguity?: boolean;
  
  /** Semantic extractor confidence */
  semantic_confidence?: number;
  
  /** Observation certainty from prior clarification */
  observation_certainty?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT ACTION CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

// CRITICAL FIX: Include new symbolic action_types that indicate treatment/prescription
// These come from the decision_rules table action_type column
const TREATMENT_ACTIONS = new Set([
  // Legacy action types (application method based)
  'APPLY_PESTICIDE',
  'APPLY_FUNGICIDE',
  'APPLY_INSECTICIDE',
  'APPLY_HERBICIDE',
  'APPLY_BIOLOGICAL',
  'APPLY_SPRAY',
  'APPLY_FERTILIZER',
  'FOLIAR_SPRAY',
  'SOIL_APPLICATION',
  'DRENCH_APPLICATION',
  'SEED_TREATMENT',
  'GRANULAR_APPLICATION',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Dominance action types from decision_rules.action_type column
  // These indicate a rule has prescription-level content
  // ═══════════════════════════════════════════════════════════════════════════
  'BLOCK',           // Urgent action required (e.g., rogue smutted plants)
  'URGENT_BLOCK',    // Emergency action
  'URGENT_ACTION',   // Time-critical intervention
  'URGENT_TREATMENT',// Immediate treatment required
  'urgent_treatment',// Lowercase variant
  'IMMEDIATE_ACTION',// Must act now
  'IMMEDIATE_TREATMENT',
  'TREATMENT',       // Standard treatment recommendation
  'treatment',       // Lowercase variant
  'RECOMMEND',       // Recommended action with products
  'PREVENTION',      // Preventive treatment
  'prevention'       // Lowercase variant
]);

// Actions that are observation/monitoring only (NOT treatment)
const OBSERVATION_ACTIONS = new Set([
  'MONITOR',
  'MONITOR_ONLY',
  'OBSERVE',
  'SCOUT',
  'INSPECT',
  'CHECK',
  'WATCH',
  'advisory',        // General advisory without treatment
  'DIAGNOSIS',       // Diagnosis only, not treatment
  'diagnosis',
  'NO_ACTION_REQUIRED'
]);

// ═══════════════════════════════════════════════════════════════════════════
// YOUNG CROP DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const YOUNG_CROP_STAGES = new Set([
  'GERMINATION',
  'SEEDLING',
  'EMERGENCE',
  'VEGETATIVE_EARLY',
  'VEGETATIVE',
  'TILLERING'
]);

const YOUNG_CROP_MAX_DAYS: Record<string, number> = {
  'SUGARCANE': 45,
  'COTTON': 30,
  'RICE': 30,
  'WHEAT': 25,
  'MAIZE': 25,
  'SOYBEAN': 20,
  'GROUNDNUT': 25,
  'TUR': 30,
  'GRAM': 25,
  'ONION': 40,
  'TOMATO': 25,
  'CHILLI': 30
};

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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN UNIFIED GATE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * evaluateUnifiedGate
 * 
 * The SINGLE gate that all treatment decisions must pass through.
 * Combines authority validation, stage safety, and symbolic decision validation.
 * 
 * @param input - UnifiedGateInput with authority decision and context
 * @returns UnifiedGateResult with gate status and allowed actions
 */
export function evaluateUnifiedGate(input: UnifiedGateInput): UnifiedGateResult {
  const checkedAt = new Date().toISOString();
  const { authority_decision, symbolic_decision } = input;
  
  console.log(`\n🚦 [UnifiedGate] ═══ EVALUATING UNIFIED DECISION GATE ═══`);
  console.log(`   Authority: ${authority_decision.authority} (${authority_decision.authority_status})`);
  console.log(`   Treatments Allowed by Authority: ${authority_decision.treatments_allowed}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATE DECISION CONFIDENCE (CRITICAL FOR MODE RESOLUTION)
  // ═══════════════════════════════════════════════════════════════════════════
  const baseConfidence = input.decision_confidence ?? 0;
  const semanticConfidence = input.semantic_confidence ?? 50;
  const observationCertainty = input.observation_certainty ?? 50;
  
  // Weighted confidence calculation
  const calculatedConfidence = Math.round(
    (baseConfidence * 0.4) + 
    (semanticConfidence * 0.3) + 
    (observationCertainty * 0.3)
  );
  
  // Detect symptom presence from input
  const hasSymptoms = !!(input.symptom_keys && input.symptom_keys.length > 0);
  const hasVisualAmbiguity = input.has_visual_ambiguity ?? false;
  const clarificationOptions = symbolic_decision?.clarification_options ?? [];
  
  console.log(`   Decision Confidence: ${calculatedConfidence}`);
  console.log(`   Has Symptoms: ${hasSymptoms}`);
  console.log(`   Has Visual Ambiguity: ${hasVisualAmbiguity}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 1: EMERGENCY BYPASS CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (input.has_emergency_indicators) {
    console.log(`   🚨 EMERGENCY BYPASS - Fast-tracking`);
    
    return {
      gate_status: GateStatus.EMERGENCY_BYPASS,
      gate_action: GateAction.ALLOW_TREATMENT,
      treatments_allowed: true,
      allowed_actions: ['TREATMENT', 'URGENT_ACTION', 'EXPERT_ESCALATION'],
      blocked_actions: [],
      allowed_products: extractProducts(symbolic_decision),
      allowed_dosages: extractDosages(symbolic_decision),
      response_mode: ResponseMode.TREATMENT,
      authority_decision,
      criteria_results: {
        authority_resolved: { passed: true, reason: 'Emergency bypass' },
        crop_identified: { passed: true, reason: 'Emergency bypass' },
        stage_determined: { passed: true, reason: 'Emergency bypass' },
        symptom_specific: { passed: true, reason: 'Emergency bypass' },
        symbolic_decision_valid: { passed: true, reason: 'Emergency bypass' }
      },
      missing_criteria: [],
      reason: 'Emergency severity detected - fast-track enabled',
      confidence_level: 'MEDIUM',
      decision_confidence: 80,
      has_symptoms: hasSymptoms,
      has_visual_ambiguity: false,
      clarification_options: [],
      gate_version: UNIFIED_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 2: AUTHORITY VALIDATION (FROM RESOLVER)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const authorityResolved = authority_decision.authority !== DecisionAuthority.NONE;
  const authorityAllowsTreatment = authority_decision.treatments_allowed;
  const authorityBlocksCrop = blocksCtopTreatments(authority_decision.authority);
  
  console.log(`   Authority Resolved: ${authorityResolved}`);
  console.log(`   Authority Allows Treatment: ${authorityAllowsTreatment}`);
  console.log(`   Authority Blocks Crop: ${authorityBlocksCrop}`);
  
  // If authority blocks crop treatments (LAND, CLIMATE, SAFETY, etc.)
  if (authorityBlocksCrop && authority_decision.authority !== DecisionAuthority.NONE) {
    console.log(`   🚫 AUTHORITY BLOCK - ${authority_decision.authority} blocks crop treatments`);
    
    return {
      gate_status: GateStatus.FAIL,
      gate_action: GateAction.PROVIDE_INFORMATION_ONLY,
      treatments_allowed: false,
      allowed_actions: ['PROVIDE_INFO', 'LAND_REMEDIATION', 'CLIMATE_GUIDANCE'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      response_mode: ResponseMode.INFORMATION,
      authority_decision,
      criteria_results: {
        authority_resolved: { passed: true, reason: `${authority_decision.authority} authority confirmed` },
        crop_identified: { passed: !!input.crop_name, reason: input.crop_name ? 'Crop identified' : 'Not relevant' },
        stage_determined: { passed: true, reason: 'Not relevant for authority block' },
        symptom_specific: { passed: true, reason: 'Not relevant for authority block' },
        symbolic_decision_valid: { passed: false, reason: 'Blocked by authority' }
      },
      missing_criteria: [],
      reason: `${authority_decision.authority} authority blocks crop treatments: ${authority_decision.reason}`,
      confidence_level: 'HIGH',
      decision_confidence: 80,
      has_symptoms: hasSymptoms,
      has_visual_ambiguity: false,
      clarification_options: [],
      gate_version: UNIFIED_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 3: CLARIFICATION CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (input.pending_clarification || symbolic_decision?.clarification_needed) {
    console.log(`   ⏳ CLARIFICATION PENDING`);
    
    return {
      gate_status: GateStatus.FAIL,
      gate_action: GateAction.REQUIRE_CLARIFICATION,
      treatments_allowed: false,
      allowed_actions: ['ASK_CLARIFICATION'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      response_mode: ResponseMode.CLARIFICATION,
      authority_decision,
      criteria_results: {
        authority_resolved: { passed: authorityResolved, reason: authority_decision.reason },
        crop_identified: { passed: !!input.crop_name, reason: input.crop_name ? `Crop: ${input.crop_name}` : 'Unknown' },
        stage_determined: { passed: !!input.growth_stage, reason: input.growth_stage ? `Stage: ${input.growth_stage}` : 'Unknown' },
        symptom_specific: { passed: false, reason: 'Clarification needed' },
        symbolic_decision_valid: { passed: false, reason: 'Clarification needed' }
      },
      missing_criteria: ['CLARIFICATION_RESPONSE'],
      reason: 'Clarification required before treatment can be recommended',
      confidence_level: 'LOW',
      decision_confidence: calculatedConfidence,
      has_symptoms: hasSymptoms,
      has_visual_ambiguity: hasVisualAmbiguity,
      clarification_options: clarificationOptions,
      gate_version: UNIFIED_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4: SYMBOLIC DECISION VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  const hasSymbolicDecision = symbolic_decision?.decision_brain_source === true;
  const hasTreatmentActions = checkHasTreatmentActions(symbolic_decision);
  const products = extractProducts(symbolic_decision);
  const dosages = extractDosages(symbolic_decision);
  
  console.log(`   Has Symbolic Decision: ${hasSymbolicDecision}`);
  console.log(`   Has Treatment Actions: ${hasTreatmentActions}`);
  console.log(`   Products: ${products.length}, Dosages: ${dosages.length}`);
  
  if (!hasSymbolicDecision) {
    console.log(`   🚫 NO SYMBOLIC DECISION - Information only`);
    
    return {
      gate_status: GateStatus.FAIL,
      gate_action: GateAction.PROVIDE_INFORMATION_ONLY,
      treatments_allowed: false,
      allowed_actions: ['PROVIDE_INFO', 'ANSWER_QUERY'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      // CRITICAL FIX: Use confidence-driven mode instead of always INFORMATION
      response_mode: hasSymptoms && calculatedConfidence < 50 
        ? (hasVisualAmbiguity ? ResponseMode.PHOTO_REQUIRED : ResponseMode.CLARIFICATION)
        : ResponseMode.INFORMATION,
      authority_decision,
      criteria_results: {
        authority_resolved: { passed: authorityResolved, reason: authority_decision.reason },
        crop_identified: { passed: !!input.crop_name, reason: input.crop_name ? `Crop: ${input.crop_name}` : 'Unknown' },
        stage_determined: { passed: !!input.growth_stage, reason: input.growth_stage ? `Stage: ${input.growth_stage}` : 'Unknown' },
        symptom_specific: { passed: false, reason: 'No diagnosis available' },
        symbolic_decision_valid: { passed: false, reason: 'No symbolic brain decision' }
      },
      missing_criteria: ['SYMBOLIC_DECISION'],
      reason: 'No symbolic brain decision - LLM restricted to information only',
      confidence_level: 'LOW',
      decision_confidence: calculatedConfidence,
      has_symptoms: hasSymptoms,
      has_visual_ambiguity: hasVisualAmbiguity,
      clarification_options: hasSymptoms ? clarificationOptions : [],
      gate_version: UNIFIED_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 5: YOUNG CROP PROTECTION (Stage × Authority)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const isYoungCrop = checkIfYoungCrop(
    input.growth_stage,
    input.days_since_sowing,
    input.crop_name
  );
  const stageIsDefault = input.stage_source === 'DEFAULT';
  const hasConfirmedDiagnosis = hasConfirmedPestOrDisease(symbolic_decision);
  
  console.log(`   Is Young Crop: ${isYoungCrop}`);
  console.log(`   Stage Source: ${input.stage_source}`);
  console.log(`   Has Confirmed Diagnosis: ${hasConfirmedDiagnosis}`);
  
  // If young crop without confirmed diagnosis → check for DIAGNOSTIC_ESCALATION
  if (isYoungCrop && !hasConfirmedDiagnosis && !input.has_emergency_indicators) {
    // Check if we have symptoms that warrant diagnostic escalation (not just observation)
    const hasSpecificSymptoms = input.symptom_keys && input.symptom_keys.length > 0 && 
      !input.symptom_keys.every(s => VAGUE_SYMPTOM_PATTERNS.has(s.toUpperCase()));
    
    if (hasSpecificSymptoms && input.crop_name && input.growth_stage) {
      console.log(`   🔬 DIAGNOSTIC ESCALATION - Expert-level response with hypotheses`);
      
      // Generate diagnostic escalation data
      const escalationData = generateDiagnosticEscalationData({
        language: 'en', // Will be overridden at render time
        crop_name: input.crop_name,
        growth_stage: input.growth_stage,
        days_since_sowing: input.days_since_sowing || undefined,
        symptom_keys: input.symptom_keys || [],
        matched_rules: [], // Will be populated by orchestrator
        current_confidence: 0.4,
        treatment_threshold: 0.7
      });
      
      return {
        gate_status: GateStatus.PARTIAL,
        gate_action: GateAction.DIAGNOSTIC_ESCALATION,
        treatments_allowed: false,
        allowed_actions: [...OBSERVATION_ACTIONS, 'PROVIDE_INFO', 'REQUEST_PHOTO', 'DIAGNOSTIC_EXPLANATION'],
        blocked_actions: [...TREATMENT_ACTIONS],
        allowed_products: [],
        allowed_dosages: [],
        response_mode: ResponseMode.DIAGNOSTIC_ESCALATION,
        authority_decision,
        criteria_results: {
          authority_resolved: { passed: authorityResolved, reason: authority_decision.reason },
          crop_identified: { passed: true, reason: `Crop: ${input.crop_name}` },
          stage_determined: { passed: true, reason: `Stage: ${input.growth_stage}` },
          symptom_specific: { passed: true, reason: `Symptoms: ${input.symptom_keys?.join(', ')}` },
          symbolic_decision_valid: { passed: false, reason: 'Confidence below treatment threshold' }
        },
        missing_criteria: ['PHOTO_CONFIRMATION', 'SEVERITY_ASSESSMENT'],
        reason: `Diagnostic escalation: symptoms identified but confidence below treatment threshold. Photo recommended.`,
        confidence_level: 'MEDIUM',
        decision_confidence: 40,
        has_symptoms: true,
        has_visual_ambiguity: true,
        clarification_options: [],
        gate_version: UNIFIED_GATE_VERSION,
        checked_at: checkedAt,
        diagnostic_escalation: escalationData
      };
    }
    
    // Fallback to observation-only for vague symptoms
    console.log(`   ⚠️ YOUNG CROP PROTECTION - Observation only`);
    
    return {
      gate_status: GateStatus.PARTIAL,
      gate_action: GateAction.PROVIDE_OBSERVATION_ONLY,
      treatments_allowed: false,
      allowed_actions: [...OBSERVATION_ACTIONS, 'PROVIDE_INFO'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      response_mode: ResponseMode.OBSERVATION,
      authority_decision,
      criteria_results: {
        authority_resolved: { passed: authorityResolved, reason: authority_decision.reason },
        crop_identified: { passed: !!input.crop_name, reason: input.crop_name ? `Crop: ${input.crop_name}` : 'Unknown' },
        stage_determined: { passed: !!input.growth_stage, reason: `Stage: ${input.growth_stage || 'unknown'} (${stageIsDefault ? 'DEFAULT' : 'CONFIRMED'})` },
        symptom_specific: { passed: false, reason: 'Young crop - diagnosis not confirmed' },
        symbolic_decision_valid: { passed: false, reason: 'Young crop protection active' }
      },
      missing_criteria: ['CONFIRMED_DIAGNOSIS'],
      reason: `Young crop (${input.growth_stage || 'early'} stage, ${input.days_since_sowing || 0} days) without confirmed diagnosis - monitoring only`,
      confidence_level: 'MEDIUM',
      decision_confidence: 50,
      has_symptoms: false,
      has_visual_ambiguity: false,
      clarification_options: [],
      gate_version: UNIFIED_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 6: PRODUCT/DOSAGE VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (hasTreatmentActions && products.length === 0 && dosages.length === 0) {
    console.log(`   ⚠️ NO PRODUCTS/DOSAGES - Observation only`);
    
    return {
      gate_status: GateStatus.PARTIAL,
      gate_action: GateAction.PROVIDE_OBSERVATION_ONLY,
      treatments_allowed: false,
      allowed_actions: [...OBSERVATION_ACTIONS, 'PROVIDE_INFO'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      response_mode: ResponseMode.OBSERVATION,
      authority_decision,
      criteria_results: {
        authority_resolved: { passed: authorityResolved, reason: authority_decision.reason },
        crop_identified: { passed: !!input.crop_name, reason: input.crop_name ? `Crop: ${input.crop_name}` : 'Unknown' },
        stage_determined: { passed: !!input.growth_stage, reason: input.growth_stage ? `Stage: ${input.growth_stage}` : 'Unknown' },
        symptom_specific: { passed: hasConfirmedDiagnosis, reason: hasConfirmedDiagnosis ? 'Diagnosis confirmed' : 'No diagnosis' },
        symbolic_decision_valid: { passed: false, reason: 'Treatment action without products/dosages' }
      },
      missing_criteria: ['PRODUCTS_AND_DOSAGES'],
      reason: 'Symbolic brain returned treatment action but no products/dosages - blocking LLM',
      confidence_level: 'MEDIUM',
      decision_confidence: 60,
      has_symptoms: hasSymptoms,
      has_visual_ambiguity: false,
      clarification_options: [],
      gate_version: UNIFIED_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE PASSED: Allow Treatments
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log(`   ✅ GATE PASSED - Treatments allowed`);
  
  const allowedActions = extractAllowedActions(symbolic_decision);
  
  return {
    gate_status: GateStatus.PASS,
    gate_action: GateAction.ALLOW_TREATMENT,
    treatments_allowed: true,
    allowed_actions: allowedActions,
    blocked_actions: [],
    allowed_products: products,
    allowed_dosages: dosages,
    response_mode: ResponseMode.TREATMENT,
    authority_decision,
    criteria_results: {
      authority_resolved: { passed: true, reason: `${authority_decision.authority} authority confirmed` },
      crop_identified: { passed: true, reason: `Crop: ${input.crop_name}` },
      stage_determined: { passed: true, reason: `Stage: ${input.growth_stage}` },
      symptom_specific: { passed: true, reason: 'Diagnosis confirmed' },
      symbolic_decision_valid: { passed: true, reason: 'Symbolic decision with products and dosages' }
    },
    missing_criteria: [],
    reason: 'All criteria met - treatment recommendations allowed',
    confidence_level: 'HIGH',
    decision_confidence: 85,
    has_symptoms: hasSymptoms,
    has_visual_ambiguity: false,
    clarification_options: [],
    gate_version: UNIFIED_GATE_VERSION,
    checked_at: checkedAt
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function checkIfYoungCrop(
  cropStage?: string | null,
  daysSinceSowing?: number | null,
  cropName?: string | null
): boolean {
  // Check by stage name
  if (cropStage) {
    const normalizedStage = cropStage.toUpperCase().replace(/[_\s-]+/g, '_');
    if (YOUNG_CROP_STAGES.has(normalizedStage)) {
      return true;
    }
  }
  
  // Check by days since sowing
  if (daysSinceSowing !== undefined && daysSinceSowing !== null && cropName) {
    const maxYoungDays = YOUNG_CROP_MAX_DAYS[cropName.toUpperCase()] || 30;
    if (daysSinceSowing <= maxYoungDays) {
      return true;
    }
  }
  
  // Default: if days < 30, consider young
  if (daysSinceSowing !== undefined && daysSinceSowing !== null && daysSinceSowing <= 30) {
    return true;
  }
  
  return false;
}

function checkHasTreatmentActions(decision: UnifiedGateInput['symbolic_decision']): boolean {
  if (!decision) return false;
  
  const primary = decision.primary_decision;
  if (primary?.action_type) {
    // CRITICAL FIX: Normalize action_type and check against treatment set
    const normalizedActionType = primary.action_type.toUpperCase();
    if (TREATMENT_ACTIONS.has(primary.action_type) || TREATMENT_ACTIONS.has(normalizedActionType)) {
      return true;
    }
    // Also check if action_type indicates prescription (not observation)
    if (!OBSERVATION_ACTIONS.has(primary.action_type) && !OBSERVATION_ACTIONS.has(normalizedActionType)) {
      // If it's not explicitly observation, and has action_text with treatment language, consider it treatment
      const appDetails = primary.application_details as Record<string, unknown> | undefined;
      if (appDetails?.action_text && typeof appDetails.action_text === 'string') {
        const actionText = appDetails.action_text.toLowerCase();
        if (actionText.includes('apply') || actionText.includes('spray') || 
            actionText.includes('drench') || actionText.includes('treat') ||
            actionText.includes('rogue') || actionText.includes('remove') ||
            actionText.includes('burn') || actionText.includes('cut')) {
          return true;
        }
      }
    }
  }
  
  const actions = decision.actions_returned || [];
  return actions.some(a => {
    if (!a.action_type) return false;
    const normalized = a.action_type.toUpperCase();
    return TREATMENT_ACTIONS.has(a.action_type) || TREATMENT_ACTIONS.has(normalized);
  });
}

function hasConfirmedPestOrDisease(decision: UnifiedGateInput['symbolic_decision']): boolean {
  if (!decision?.primary_decision?.target) return false;
  
  const target = decision.primary_decision.target;
  return !!(
    (target.pest_code && target.pest_code !== 'UNKNOWN') ||
    (target.disease_code && target.disease_code !== 'UNKNOWN') ||
    (target.nutrient_deficiency && target.nutrient_deficiency !== 'UNKNOWN')
  );
}

function extractProducts(decision: UnifiedGateInput['symbolic_decision']): string[] {
  if (!decision) return [];
  
  const products = new Set<string>();
  
  // From primary decision
  if (decision.primary_decision?.application_details?.product_name) {
    products.add(decision.primary_decision.application_details.product_name.toLowerCase());
  }
  
  // From actions_returned
  for (const action of decision.actions_returned || []) {
    if (action.product_name) {
      products.add(action.product_name.toLowerCase());
    }
  }
  
  return [...products];
}

function extractDosages(decision: UnifiedGateInput['symbolic_decision']): string[] {
  if (!decision) return [];
  
  const dosages = new Set<string>();
  
  // From primary decision
  const appDetails = decision.primary_decision?.application_details;
  if (appDetails?.dosage) {
    dosages.add(appDetails.dosage.toLowerCase());
  }
  if (appDetails?.dosage_per_acre) {
    dosages.add(appDetails.dosage_per_acre.toLowerCase());
  }
  
  // From actions_returned
  for (const action of decision.actions_returned || []) {
    if (action.dosage) {
      dosages.add(action.dosage.toLowerCase());
    }
  }
  
  return [...dosages];
}

function extractAllowedActions(decision: UnifiedGateInput['symbolic_decision']): string[] {
  if (!decision) return [];
  
  const actions = new Set<string>();
  
  if (decision.primary_decision?.action_type) {
    actions.add(decision.primary_decision.action_type);
  }
  
  for (const action of decision.actions_returned || []) {
    if (action.action_type) {
      actions.add(action.action_type);
    }
  }
  
  return [...actions];
}

// PRESCRIPTION GATE ENFORCER - Symbolic-Only Output Control

export const PRESCRIPTION_GATE_VERSION = '1.2.0';

// P1-1 FIX: Import canonical types from authority-types.ts

import {
  AuthorityStatus,
  ResponseMode,
  GateStatus,
  GateAction
} from './authority-types.ts';

// Re-export for backward compatibility
export { AuthorityStatus, ResponseMode, GateStatus, GateAction };

// LEGACY BRIDGE: AuthorityConfirmation maps to AuthorityStatus

export enum AuthorityConfirmation {
  CONFIRMED_PEST = 'CONFIRMED_PEST',
  CONFIRMED_DISEASE = 'CONFIRMED_DISEASE',
  CONFIRMED_NUTRIENT = 'CONFIRMED_NUTRIENT',
  UNCONFIRMED = 'UNCONFIRMED',
  PENDING_CLARIFICATION = 'PENDING_CLARIFICATION'
}

// Convert AuthorityConfirmation to canonical AuthorityStatus
export function toAuthorityStatus(confirmation: AuthorityConfirmation): AuthorityStatus {
  switch (confirmation) {
    case AuthorityConfirmation.CONFIRMED_PEST:
    case AuthorityConfirmation.CONFIRMED_DISEASE:
    case AuthorityConfirmation.CONFIRMED_NUTRIENT:
      return AuthorityStatus.CONFIRMED;
    case AuthorityConfirmation.PENDING_CLARIFICATION:
      return AuthorityStatus.PENDING_CLARIFICATION;
    case AuthorityConfirmation.UNCONFIRMED:
    default:
      return AuthorityStatus.UNCONFIRMED;
  }
}

// SYMBOLIC DECISION VALIDATION

export interface SymbolicDecision {
  decision_id: string;
  decision_brain_source: boolean;
  status: string;
  primary_decision?: {
    action_type: string;
    target?: {
      pest_code?: string;
      disease_code?: string;
      nutrient_deficiency?: string;
    };
    application_details?: {
      product_name?: string;
      dosage?: string;
      dosage_per_acre?: string;
      method?: string;
      timing?: string;
      phi_days?: number;
    };
    rule_id?: string;
  };
  actions_returned?: Array<{
    action_type: string;
    product_name?: string;
    dosage?: string;
    rule_id?: string;
  }>;
  secondary_actions?: any[];
  clarification_needed?: boolean;
}

export interface PrescriptionGateInput {
  symbolic_decision: SymbolicDecision | null;
  crop_stage?: string;
  days_since_sowing?: number;
  crop_name?: string;
  has_confirmed_diagnosis?: boolean;
  land_id?: string;
}

export interface PrescriptionGateResult {
  allowed: boolean;
  response_mode: ResponseMode;
  authority_confirmation: AuthorityConfirmation;
  allowed_actions: string[];
  blocked_actions: string[];
  allowed_products: string[];
  allowed_dosages: string[];
  reason: string;
  stage_gate_triggered: boolean;
  gate_version: string;
  checked_at: string;
}

// CROP STAGE SAFETY DEFINITIONS

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

// ACTION TYPE CLASSIFICATION

const TREATMENT_ACTIONS = new Set([
  'APPLY_PESTICIDE',
  'APPLY_FUNGICIDE',
  'APPLY_INSECTICIDE',
  'APPLY_HERBICIDE',
  'APPLY_BIOLOGICAL',
  'APPLY_SPRAY',
  'FOLIAR_SPRAY',
  'SOIL_APPLICATION',
  'DRENCH_APPLICATION',
  'SEED_TREATMENT',
  'GRANULAR_APPLICATION'
]);

const OBSERVATION_ACTIONS = new Set([
  'MONITOR',
  'OBSERVE',
  'SCOUT',
  'INSPECT',
  'CHECK',
  'WATCH'
]);

const INFORMATION_ACTIONS = new Set([
  'PROVIDE_INFO',
  'PROVIDE_GENERAL_INFO',
  'ANSWER_QUERY',
  'EXPLAIN'
]);

// MAIN PRESCRIPTION GATE FUNCTION

// enforcePrescriptionGate
export function enforcePrescriptionGate(input: PrescriptionGateInput): PrescriptionGateResult {
  const checkedAt = new Date().toISOString();
  const { symbolic_decision, crop_stage, days_since_sowing, crop_name, has_confirmed_diagnosis, land_id } = input;
  
  // GATE 0a: INTENT-GATE LEAKAGE GUARD (FIX 4)
  const winningRule: any =
    (symbolic_decision as any)?.primary_decision?._sourceRule ||
    (symbolic_decision as any)?.primary_decision;
  if (winningRule && (winningRule._noTreatmentEligible === true || winningRule._intentGateLeakage === true)) {
    console.warn(
      `🚫 [PrescriptionGate] GATE 0a BLOCKED: winning rule ${winningRule.rule_id ?? '?'} carries ` +
      `_noTreatmentEligible flag from RULE_INTENT_GATE (kept=0 leakage). Treatment prohibited.`
    );
    return {
      allowed: false,
      response_mode: ResponseMode.INFORMATION,
      authority_confirmation: AuthorityConfirmation.UNCONFIRMED,
      allowed_actions: ['PROVIDE_INFO', 'ASK_CLARIFICATION'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      reason: 'Intent-gate leakage: no rule matches the current intent — routing to clarification/information.',
      stage_gate_triggered: false,
      gate_version: PRESCRIPTION_GATE_VERSION,
      checked_at: checkedAt
    };
  }

  // GATE 0: PRIMARY ACTION TYPE VALIDATION (CRITICAL - MUST BE FIRST)
  
  if (symbolic_decision?.primary_decision) {
    const primary = symbolic_decision.primary_decision;
    if (!primary.action_type) {
      console.error(`🚨 [PrescriptionGate] GATE 0 BLOCKED: Missing action_type in primary_decision`);
      console.error(`   rule_id=${primary.rule_id}, source=prescription-gate-enforcer`);
      return {
        allowed: false,
        response_mode: ResponseMode.INFORMATION,
        authority_confirmation: AuthorityConfirmation.UNCONFIRMED,
        allowed_actions: ['PROVIDE_INFO', 'MONITOR'],
        blocked_actions: [...TREATMENT_ACTIONS],
        allowed_products: [],
        allowed_dosages: [],
        reason: 'Missing action_type - invalid rule output. Decision blocked for safety.',
        stage_gate_triggered: false,
        gate_version: PRESCRIPTION_GATE_VERSION,
        checked_at: checkedAt
      };
    }
  }
  
  // GATE 1: No Symbolic Decision = No Treatments
  
  if (!symbolic_decision || !symbolic_decision.decision_brain_source) {
    return {
      allowed: false,
      response_mode: ResponseMode.INFORMATION,
      authority_confirmation: AuthorityConfirmation.UNCONFIRMED,
      allowed_actions: ['PROVIDE_INFO', 'ANSWER_QUERY'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      reason: 'No symbolic brain decision - LLM restricted to information only',
      stage_gate_triggered: false,
      gate_version: PRESCRIPTION_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // GATE 2: Clarification Needed = No Treatments
  
  if (symbolic_decision.clarification_needed) {
    return {
      allowed: false,
      response_mode: ResponseMode.CLARIFICATION,
      authority_confirmation: AuthorityConfirmation.PENDING_CLARIFICATION,
      allowed_actions: ['ASK_CLARIFICATION'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      reason: 'Clarification required before treatment can be recommended',
      stage_gate_triggered: false,
      gate_version: PRESCRIPTION_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // GATE 3: Check Authority Confirmation
  
  const authorityConfirmation = determineAuthorityConfirmation(symbolic_decision);
  
  // GATE 4: Stage × Authority Hard Gate (Young Crop Protection)
  
  const isYoungCrop = checkIfYoungCrop(crop_stage, days_since_sowing, crop_name);
  const hasTreatmentActions = checkHasTreatmentActions(symbolic_decision);
  
  // If crop is young AND no confirmed diagnosis → Block treatments
  if (isYoungCrop && authorityConfirmation === AuthorityConfirmation.UNCONFIRMED) {
    return {
      allowed: false,
      response_mode: ResponseMode.OBSERVATION,
      authority_confirmation: authorityConfirmation,
      allowed_actions: [...OBSERVATION_ACTIONS, 'PROVIDE_INFO'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      reason: `Young crop (${crop_stage || 'early'} stage, ${days_since_sowing || 0} days) without confirmed diagnosis - monitoring only`,
      stage_gate_triggered: true,
      gate_version: PRESCRIPTION_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // GATE 5: Extract Allowed Products & Dosages (Strict from Symbolic Output)
  
  const { allowedProducts, allowedDosages, allowedActions } = extractAllowedFromSymbolic(symbolic_decision);
  
  // If no products/dosages in symbolic output → No treatments allowed
  if (hasTreatmentActions && allowedProducts.length === 0 && allowedDosages.length === 0) {
    return {
      allowed: false,
      response_mode: ResponseMode.OBSERVATION,
      authority_confirmation: authorityConfirmation,
      allowed_actions: [...OBSERVATION_ACTIONS, 'PROVIDE_INFO'],
      blocked_actions: [...TREATMENT_ACTIONS],
      allowed_products: [],
      allowed_dosages: [],
      reason: 'Symbolic brain returned treatment action but no products/dosages - blocking LLM',
      stage_gate_triggered: false,
      gate_version: PRESCRIPTION_GATE_VERSION,
      checked_at: checkedAt
    };
  }
  
  // GATE PASSED: Allow Treatments with Strict Product/Dosage Constraints
  
  return {
    allowed: true,
    response_mode: ResponseMode.TREATMENT,
    authority_confirmation: authorityConfirmation,
    allowed_actions: allowedActions,
    blocked_actions: [],
    allowed_products: allowedProducts,
    allowed_dosages: allowedDosages,
    reason: 'Symbolic brain decision approved with explicit products and dosages',
    stage_gate_triggered: false,
    gate_version: PRESCRIPTION_GATE_VERSION,
    checked_at: checkedAt
  };
}

// HELPER FUNCTIONS

function determineAuthorityConfirmation(decision: SymbolicDecision): AuthorityConfirmation {
  const primary = decision.primary_decision;
  
  if (!primary) {
    return AuthorityConfirmation.UNCONFIRMED;
  }
  
  const target = primary.target;
  if (!target) {
    return AuthorityConfirmation.UNCONFIRMED;
  }
  
  // Check for confirmed pest
  if (target.pest_code && target.pest_code !== 'UNKNOWN') {
    return AuthorityConfirmation.CONFIRMED_PEST;
  }
  
  // Check for confirmed disease
  if (target.disease_code && target.disease_code !== 'UNKNOWN') {
    return AuthorityConfirmation.CONFIRMED_DISEASE;
  }
  
  // Check for confirmed nutrient deficiency
  if (target.nutrient_deficiency && target.nutrient_deficiency !== 'UNKNOWN') {
    return AuthorityConfirmation.CONFIRMED_NUTRIENT;
  }
  
  return AuthorityConfirmation.UNCONFIRMED;
}

function checkIfYoungCrop(
  cropStage?: string, 
  daysSinceSowing?: number, 
  cropName?: string
): boolean {
  // Check by stage name
  if (cropStage) {
    const normalizedStage = cropStage.toUpperCase().replace(/[_\s-]+/g, '_');
    if (YOUNG_CROP_STAGES.has(normalizedStage)) {
      return true;
    }
  }
  
  // Check by days since sowing
  if (daysSinceSowing !== undefined && cropName) {
    const maxYoungDays = YOUNG_CROP_MAX_DAYS[cropName.toUpperCase()] || 30;
    if (daysSinceSowing <= maxYoungDays) {
      return true;
    }
  }
  
  // Default: if days < 30, consider young
  if (daysSinceSowing !== undefined && daysSinceSowing <= 30) {
    return true;
  }
  
  return false;
}

function checkHasTreatmentActions(decision: SymbolicDecision): boolean {
  const primary = decision.primary_decision;
  if (primary?.action_type && TREATMENT_ACTIONS.has(primary.action_type)) {
    return true;
  }
  
  const actions = decision.actions_returned || [];
  return actions.some(a => a.action_type && TREATMENT_ACTIONS.has(a.action_type));
}

function extractAllowedFromSymbolic(decision: SymbolicDecision): {
  allowedProducts: string[];
  allowedDosages: string[];
  allowedActions: string[];
} {
  const allowedProducts: Set<string> = new Set();
  const allowedDosages: Set<string> = new Set();
  const allowedActions: Set<string> = new Set();
  
  // From primary decision
  const primary = decision.primary_decision;
  if (primary) {
    if (primary.action_type) {
      allowedActions.add(primary.action_type);
    }
    
    const appDetails = primary.application_details;
    if (appDetails) {
      if (appDetails.product_name) {
        allowedProducts.add(appDetails.product_name.toLowerCase());
      }
      if (appDetails.dosage) {
        allowedDosages.add(appDetails.dosage.toLowerCase());
      }
      if (appDetails.dosage_per_acre) {
        allowedDosages.add(appDetails.dosage_per_acre.toLowerCase());
      }
    }
  }
  
  // From actions_returned
  const actions = decision.actions_returned || [];
  for (const action of actions) {
    if (action.action_type) {
      allowedActions.add(action.action_type);
    }
    if (action.product_name) {
      allowedProducts.add(action.product_name.toLowerCase());
    }
    if (action.dosage) {
      allowedDosages.add(action.dosage.toLowerCase());
    }
  }
  
  // From secondary_actions
  const secondary = decision.secondary_actions || [];
  for (const action of secondary) {
    if (action.action_type) {
      allowedActions.add(action.action_type);
    }
    if (action.application_details?.product_name) {
      allowedProducts.add(action.application_details.product_name.toLowerCase());
    }
    if (action.application_details?.dosage) {
      allowedDosages.add(action.application_details.dosage.toLowerCase());
    }
    if (action.product_name) {
      allowedProducts.add(action.product_name.toLowerCase());
    }
    if (action.dosage) {
      allowedDosages.add(action.dosage.toLowerCase());
    }
  }
  
  return {
    allowedProducts: [...allowedProducts],
    allowedDosages: [...allowedDosages],
    allowedActions: [...allowedActions]
  };
}

// AUDIT LOG BUILDER

export interface PrescriptionGateAudit {
  gate_result: PrescriptionGateResult;
  input_snapshot: {
    had_symbolic_decision: boolean;
    decision_brain_source: boolean;
    crop_stage?: string;
    days_since_sowing?: number;
    has_primary_decision: boolean;
    actions_count: number;
  };
}

export function buildPrescriptionGateAudit(
  input: PrescriptionGateInput,
  result: PrescriptionGateResult
): PrescriptionGateAudit {
  return {
    gate_result: result,
    input_snapshot: {
      had_symbolic_decision: !!input.symbolic_decision,
      decision_brain_source: input.symbolic_decision?.decision_brain_source || false,
      crop_stage: input.crop_stage,
      days_since_sowing: input.days_since_sowing,
      has_primary_decision: !!input.symbolic_decision?.primary_decision,
      actions_count: input.symbolic_decision?.actions_returned?.length || 0
    }
  };
}

// OBSERVATION-ONLY RESPONSE GENERATOR

// Generate observation-only response when treatments are blocked
export function generateObservationOnlyResponse(
  language: string,
  cropName?: string,
  reason?: string
): string {
  // English-only — LLM narration layer translates at runtime via forceTranslateResponse
  return `🌾 Hello!\n\nUnderstood about your ${cropName || 'crop'}.\n\n📋 **What to do now:**\n• Carefully observe the crop\n• Take photos of affected areas\n• Watch if symptoms are spreading\n\n🔍 We'll suggest proper treatment once we have more information.\n\n👉 Please send a photo if possible.`;
}

// Generate monitoring-only response for young crops
export function generateYoungCropMonitoringResponse(
  language: string,
  cropName?: string,
  cropStage?: string,
  daysSinceSowing?: number
): string {
  // English-only — LLM narration layer translates at runtime via forceTranslateResponse
  return `🌱 Hello!\n\nYour ${cropName || 'crop'} is currently in ${cropStage || 'early'} stage (${daysSinceSowing || '?'} days).\n\n📋 **What to do at this stage:**\n• Regularly monitor the crop\n• Maintain proper water management\n• Inform us if symptoms increase\n\n⚠️ Young crops require careful treatment approach.\n\n👉 Tell us what you see or send a photo.`;
}

// EXPORTS

export default {
  enforcePrescriptionGate,
  buildPrescriptionGateAudit,
  generateObservationOnlyResponse,
  generateYoungCropMonitoringResponse,
  PRESCRIPTION_GATE_VERSION,
  AuthorityConfirmation,
  toAuthorityStatus,
  ResponseMode
};

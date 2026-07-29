// SYMBOLIC DECISION REPRESENTATION SCHEMA

export const DECISION_REPRESENTATION_VERSION = '2.0.0';

// MASTER PROMPT v3: UNDERSTANDING CONFIDENCE ENUM

export enum UnderstandingConfidence {
  VERY_LOW = 'VERY_LOW',   // < 2 critical fields known - MUST clarify
  LOW = 'LOW',             // 2-3 critical fields known - SHOULD clarify
  MEDIUM = 'MEDIUM',       // 4-5 critical fields known - CAN proceed with caution
  HIGH = 'HIGH'            // 6+ critical fields known - SAFE to prescribe
}

// ENUMS FOR DETERMINISTIC STATES

export type DataConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type SafetyFlag = 'URGENT' | 'CROP_DYING' | 'CHEMICAL_HAZARD' | 'WEATHER_RISK' | 'PHI_VIOLATION';
export type ProblemType = 'PEST_ISSUE' | 'DISEASE_ISSUE' | 'NUTRIENT_ISSUE' | 'WATER_ISSUE' | 'WEATHER_ISSUE' | 'GENERAL_INFO' | 'UNKNOWN';

// NLU CONTRACT OUTPUT - What AI/NLU can extract (OBSERVATIONS ONLY)

export interface NLUDecisionGraphInput {
  // EXACT farmer words - preserved verbatim
  inferred_observations: string[];
  
  // HIGH-LEVEL problem categorization (NOT diagnosis)
  inferred_problem_type: ProblemType;
  
  // NLU confidence score 0.0 - 1.0
  confidence_level: number;
  
  // What's missing to make a decision
  required_missing_inputs: string[];
  
  // Safety flags that override normal processing
  safety_flags: SafetyFlag[];
  
  // Detected input language for response matching
  language_detected: string;
  
  // Urgency assessment
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Emotional state for tone adjustment
  emotional_state: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT';
}

// RULE ENGINE INPUT - Structured for deterministic evaluation

export interface RuleEngineInput {
  // From NLU (observations only)
  nlu_output: NLUDecisionGraphInput;
  
  // From Land Context (database)
  land_context?: {
    land_id: string;
    crop_code?: string;
    crop_stage?: string;
    days_after_sowing?: number;
    area_acres?: number;
  };
  
  // From Soil Data (database)
  soil_state?: {
    nitrogen_level: 'HIGH' | 'ADEQUATE' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
    phosphorus_level: 'HIGH' | 'ADEQUATE' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
    potassium_level: 'HIGH' | 'ADEQUATE' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
    ph_level?: number;
    organic_carbon?: number;
  };
  
  // From NDVI Data (satellite)
  ndvi_state?: {
    current_value?: number;
    level: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' | 'CRITICAL' | 'UNKNOWN';
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'RAPID_DECLINE' | 'UNKNOWN';
  };
  
  // From Weather Data
  weather_state?: {
    temperature?: number;
    humidity?: number;
    rain_probability?: number;
    is_spray_safe: boolean;
  };
  
  // Session context
  session_context?: {
    previous_pest?: string;
    previous_disease?: string;
    turn_count?: number;
  };
}

// RULE ENGINE OUTPUT - ALL decisions come from here

export interface SymbolicAction {
  action_type: string;
  product_name?: string;      // ONLY from Rule Engine
  dosage?: string;            // ONLY from Rule Engine
  timing?: string;            // ONLY from Rule Engine
  method?: string;            // ONLY from Rule Engine
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  rule_id: string;            // Traceability
  ipm_level?: number;         // IPM escalation level
  safety_notes?: string[];
}

export interface SymbolicDecisionOutput {
  // Unique decision identifier
  decision_id: string;
  
  // Decision status
  status: 'DECISION_MADE' | 'CLARIFICATION_NEEDED' | 'ESCALATION_REQUIRED' | 'NO_ACTION_NEEDED';
  
  // CRITICAL: All actions come EXCLUSIVELY from Rule Engine
  actions: SymbolicAction[];
  
  // Causes identified by Rule Engine (NOT NLU)
  identified_causes: {
    cause_code: string;
    cause_type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'WEATHER';
    confidence: number;
    rule_id: string;
  }[];
  
  // If clarification needed - options come from RULE ENGINE (not AI)
  clarification?: {
    question_type: 'SYMPTOM_DETAIL' | 'LOCATION' | 'SEVERITY' | 'TIMING';
    options: string[];  // From predefined database, NOT AI-generated
    photo_helpful: boolean;
  };
  
  // Actions blocked by safety rules
  blocked_actions: {
    action: string;
    reason: string;
    rule_id: string;
    alternatives?: string[];
  }[];
  
  // Rules that fired during evaluation
  rules_fired: string[];
  
  // Overall confidence
  confidence: number;
  
  // Data quality assessment
  data_confidence: DataConfidence;
  
  // Processing metadata
  metadata: {
    turn_id: string;
    trace_id: string;
    processing_time_ms: number;
    engine_version: string;
  };
}

// LLM FORMATTER INPUT - What LLM receives (render-only)

export interface LLMRenderInput {
  // Original farmer message (for context/tone matching)
  farmer_message: string;
  
  // Target language
  language: string;
  
  // Symbolic decision - LLM can ONLY render this, not modify
  symbolic_decision: SymbolicDecisionOutput;
  
  // Crop context for natural phrasing
  crop_context?: {
    crop_name: string;
    stage: string;
  };
}

// VALIDATION FUNCTIONS

// Validate NLU output does NOT contain forbidden fields
export function validateNLUOutputContract(nluOutput: any): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // MASTER PROMPT v3 - CRITICAL REMOVALS FROM NLU OUTPUT
  const forbiddenFields = [
    // Diagnosis codes - FORBIDDEN in NLU
    'pest',                   // NLU must NOT identify pests
    'disease',                // NLU must NOT identify diseases
    'deficiency',             // NLU must NOT identify deficiencies
    'pest_code',              // No internal codes
    'disease_code',           // No internal codes
    'crop_code',              // Crop comes from DB context, not NLU inference
    
    // Action/recommendation fields - Rule Engine only
    'product_name',
    'dosage',
    'action',
    'recommendation',
    'treatment',
    'rule_id',
    'product_id',
    
    // Behavioral decisions - Rule Engine only
    'response_strategy',      // Rule Engine decides behavior
    'clarification_type',     // Rule Engine decides clarification
    'clarification_options',  // Options come from database only
  ];
  
  const checkObject = (obj: any, path: string = ''): void => {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if key matches forbidden pattern
      for (const forbidden of forbiddenFields) {
        if (key.toLowerCase() === forbidden.toLowerCase() ||
            key.toLowerCase().includes(forbidden.toLowerCase() + '_')) {
          violations.push(`Forbidden field found: ${currentPath} (NLU must not identify causes)`);
        }
      }
      
      // Recursively check nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        checkObject(value, currentPath);
      }
    }
  };
  
  checkObject(nluOutput);
  
  return {
    valid: violations.length === 0,
    violations
  };
}

// Validate LLM output matches symbolic input exactly
export function validateLLMOutputIntegrity(
  symbolicInput: SymbolicDecisionOutput,
  llmOutput: string
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Extract products/dosages from symbolic input
  const allowedProducts = new Set<string>();
  const allowedDosages = new Set<string>();
  
  for (const action of symbolicInput.actions) {
    if (action.product_name) {
      allowedProducts.add(action.product_name.toLowerCase());
    }
    // P0 FIX: Add active_ingredient and its individual words
    const activeIngredient = (action as any).active_ingredient;
    if (activeIngredient) {
      allowedProducts.add(activeIngredient.toLowerCase());
      // Add individual words (e.g., "Chlorpyrifos 20% EC" → "chlorpyrifos")
      for (const word of activeIngredient.toLowerCase().split(/[\s+@\/,%]+/)) {
        if (word.length > 3) allowedProducts.add(word);
      }
    }
    if (action.dosage) {
      allowedDosages.add(action.dosage.toLowerCase());
    }
  }
  
  // Common product patterns to check for unauthorized additions
  const productPatterns = [
    /(\d+)\s*(ml|l|g|kg|gm)\s*(per|\/)\s*(acre|hectare|ha)/gi,
    /spray\s+\d+\s*(ml|l)/gi,
    /apply\s+\d+\s*(kg|g)/gi,
  ];
  
  // Check for percentage claims (forbidden unless in symbolic)
  const percentagePattern = /(\d{1,3})\s*%\s*(effective|control|reduction)/gi;
  const percentageMatches = llmOutput.match(percentagePattern);
  if (percentageMatches) {
    violations.push(`Unauthorized percentage claim: ${percentageMatches[0]}`);
  }
  
  // Check for forbidden product mentions not in symbolic
  const commonPesticides = [
    'chlorpyrifos', 'monocrotophos', 'cypermethrin', 'imidacloprid',
    'carbofuran', 'phorate', 'thiamethoxam', 'fipronil', 'cartap'
  ];
  
  for (const pesticide of commonPesticides) {
    if (llmOutput.toLowerCase().includes(pesticide) && !allowedProducts.has(pesticide)) {
      violations.push(`Unauthorized product mentioned: ${pesticide}`);
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

// Create empty decision graph input (when NLU confidence is low)
export function createEmptyNLUInput(
  language: string,
  message: string
): NLUDecisionGraphInput {
  return {
    inferred_observations: [message],
    inferred_problem_type: 'UNKNOWN',
    confidence_level: 0.0,
    required_missing_inputs: ['problem_type', 'symptom_details'],
    safety_flags: [],
    language_detected: language,
    urgency: 'LOW',
    emotional_state: 'NEUTRAL'
  };
}

// Check if decision requires escalation
export function requiresEscalation(decision: SymbolicDecisionOutput): boolean {
  return (
    decision.status === 'ESCALATION_REQUIRED' ||
    decision.confidence < 0.5 ||
    decision.data_confidence === 'LOW' ||
    decision.blocked_actions.length > decision.actions.length
  );
}

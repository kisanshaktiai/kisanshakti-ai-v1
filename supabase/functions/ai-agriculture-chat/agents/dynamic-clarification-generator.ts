// ✅ FORENSIC REFACTOR COMPLETE
// Authority: Pure clarification orchestration layer - receives symbolic outputs, emits clarification requests

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DYNAMIC CLARIFICATION GENERATOR v3.0.0 - REFACTORED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ROLE: Clarification orchestration layer
 * 
 * DOES:
 * - Receive pre-computed symbolic outputs (hypotheses, observations)
 * - Decide if clarification is required based on symbolic state
 * - Emit language-neutral clarification requests with observation codes
 * 
 * DOES NOT:
 * - Interpret NDVI values (removed → authoritative-state-loader.ts)
 * - Interpret soil nutrients (removed → authoritative-state-loader.ts)
 * - Calculate probabilities (removed → symbolic-reasoner.ts)
 * - Generate language-specific text (removed → LLM narration layer)
 * - Perform query/intent classification (removed → LIL layer)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ClarificationScope } from './clarification-renderer.ts';
import type { AuthoritativeLandState } from '../decision/authoritative-state-loader.ts';

export const DYNAMIC_CLARIFICATION_VERSION = '3.0.0'; // SSOT-compliant refactor

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS - LANGUAGE-NEUTRAL, CODE-ONLY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Symbolic hypothesis from decision brain
 * All text labels come from upstream, NOT generated here
 */
export interface SymbolicHypothesis {
  cause_id: string;
  confidence: number;
  observation_codes: string[];
  rule_ids: string[];
}

/**
 * Canonical clarification request - language-neutral
 * LLM narration layer converts this to farmer-readable text
 */
export interface ClarificationRequest {
  clarification_required: boolean;
  reason_code: 'MULTIPLE_VALID_OBSERVATIONS' | 'MISSING_OBSERVATION' | 'AMBIGUOUS_SYMPTOM' | 'INSUFFICIENT_DATA' | 'PHOTO_NEEDED' | 'NONE';
  required_observation_codes: string[];
  competing_hypotheses?: SymbolicHypothesis[];
  scope: ClarificationScope;
  confidence_threshold_met: boolean;
  // TODO: Requires upstream symbolic decision output for differentiating_tests
}

/**
 * Agronomic context - structured data only, no interpretations
 * Interpretations come from AuthoritativeLandState.derived
 */
export interface AgronomicContext {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  
  // Raw values only - interpretation in authoritative-state-loader.ts
  ndvi_value: number | null;
  ndvi_trend: string | null;
  
  // Raw values only - interpretation in authoritative-state-loader.ts
  soil_n: number | null;
  soil_p: number | null;
  soil_k: number | null;
  
  // Flags
  has_land_context: boolean;
  has_soil_data: boolean;
  has_ndvi_data: boolean;
}

/**
 * Input for clarification decision - receives symbolic outputs
 */
export interface ClarificationInput {
  scope: ClarificationScope;
  farmer_message: string;
  language: string;
  agronomic_context: AgronomicContext;
  
  // Pre-computed by symbolic brain - NOT calculated here
  symbolic_hypotheses: SymbolicHypothesis[];
  observation_codes_detected: string[];
  confidence_from_brain: number;
  
  // From authoritative state loader
  authoritative_state?: AuthoritativeLandState | null;
}

/**
 * Output - language-neutral clarification request
 */
export interface ClarificationOutput {
  request: ClarificationRequest;
  metadata: {
    generated_at: string;
    version: string;
    input_observation_count: number;
    hypothesis_count: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION DECISION LOGIC - PURE SYMBOLIC ROUTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimum confidence threshold for decision without clarification
 */
const CONFIDENCE_THRESHOLD = 0.65;

/**
 * Maximum number of competing hypotheses before requiring clarification
 */
const MAX_COMPETING_HYPOTHESES = 2;

/**
 * Determine if clarification is needed based on symbolic state
 * 
 * Decision logic:
 * 1. If confidence >= threshold AND single hypothesis → NO clarification
 * 2. If multiple competing hypotheses → YES clarification
 * 3. If missing required observations → YES clarification
 * 4. If no observations detected → Request photo
 */
export function decideClarificationNeeded(input: ClarificationInput): ClarificationRequest {
  const {
    symbolic_hypotheses,
    observation_codes_detected,
    confidence_from_brain,
    scope
  } = input;
  
  console.log(`   🔍 [ClarificationDecision] Evaluating: ${observation_codes_detected.length} observations, ${symbolic_hypotheses.length} hypotheses, confidence=${confidence_from_brain}`);
  
  // Case 1: High confidence with single dominant hypothesis
  if (confidence_from_brain >= CONFIDENCE_THRESHOLD && symbolic_hypotheses.length <= 1) {
    return {
      clarification_required: false,
      reason_code: 'NONE',
      required_observation_codes: [],
      scope,
      confidence_threshold_met: true
    };
  }
  
  // Case 2: Multiple competing hypotheses
  if (symbolic_hypotheses.length > MAX_COMPETING_HYPOTHESES) {
    // Find observation codes that differentiate between hypotheses
    const differentiatingCodes = findDifferentiatingObservations(symbolic_hypotheses);
    
    return {
      clarification_required: true,
      reason_code: 'MULTIPLE_VALID_OBSERVATIONS',
      required_observation_codes: differentiatingCodes,
      competing_hypotheses: symbolic_hypotheses.slice(0, 3),
      scope: ClarificationScope.REFINE_OBSERVATION,
      confidence_threshold_met: false
    };
  }
  
  // Case 3: No observations detected - request photo
  if (observation_codes_detected.length === 0) {
    return {
      clarification_required: true,
      reason_code: 'PHOTO_NEEDED',
      required_observation_codes: [],
      scope: ClarificationScope.PHOTO_ONLY,
      confidence_threshold_met: false
    };
  }
  
  // Case 4: Low confidence with some observations - need refinement
  if (confidence_from_brain < CONFIDENCE_THRESHOLD) {
    // Get observation codes from top hypotheses
    const neededCodes = symbolic_hypotheses
      .flatMap(h => h.observation_codes)
      .filter((code, i, arr) => arr.indexOf(code) === i)
      .filter(code => !observation_codes_detected.includes(code))
      .slice(0, 3);
    
    return {
      clarification_required: true,
      reason_code: neededCodes.length > 0 ? 'MISSING_OBSERVATION' : 'AMBIGUOUS_SYMPTOM',
      required_observation_codes: neededCodes,
      scope: ClarificationScope.REFINE_OBSERVATION,
      confidence_threshold_met: false
    };
  }
  
  // Default: No clarification needed
  return {
    clarification_required: false,
    reason_code: 'NONE',
    required_observation_codes: [],
    scope,
    confidence_threshold_met: true
  };
}

/**
 * Find observation codes that differentiate between hypotheses
 * Returns codes that appear in some but not all hypotheses
 */
function findDifferentiatingObservations(hypotheses: SymbolicHypothesis[]): string[] {
  if (hypotheses.length < 2) return [];
  
  const allCodes = new Map<string, number>();
  
  // Count occurrence of each code across hypotheses
  for (const hypothesis of hypotheses) {
    for (const code of hypothesis.observation_codes) {
      allCodes.set(code, (allCodes.get(code) || 0) + 1);
    }
  }
  
  // Find codes that appear in some but not all hypotheses (differentiating)
  const differentiating: string[] = [];
  for (const [code, count] of allCodes.entries()) {
    if (count < hypotheses.length) {
      differentiating.push(code);
    }
  }
  
  return differentiating.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT - ORCHESTRATION ONLY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate clarification request based on symbolic brain output
 * 
 * This function does NOT:
 * - Interpret NDVI or soil values
 * - Generate language-specific text
 * - Calculate probabilities or causes
 * 
 * All of the above come from upstream layers
 */
export function generateClarificationRequest(input: ClarificationInput): ClarificationOutput {
  console.log(`   🧠 [DynamicClarification] Processing for ${input.agronomic_context.crop_code}/${input.agronomic_context.growth_stage}`);
  
  // Decide if clarification is needed
  const request = decideClarificationNeeded(input);
  
  console.log(`   ✅ [DynamicClarification] Result: clarification_required=${request.clarification_required}, reason=${request.reason_code}`);
  
  return {
    request,
    metadata: {
      generated_at: new Date().toISOString(),
      version: DYNAMIC_CLARIFICATION_VERSION,
      input_observation_count: input.observation_codes_detected.length,
      hypothesis_count: input.symbolic_hypotheses.length
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Build Agronomic Context from Authoritative State
// Pure data extraction, NO interpretation
// ═══════════════════════════════════════════════════════════════════════════

export function buildAgronomicContext(authoritativeState: AuthoritativeLandState | null): AgronomicContext {
  if (!authoritativeState) {
    return {
      crop_code: 'UNKNOWN',
      growth_stage: 'UNKNOWN',
      days_since_sowing: null,
      ndvi_value: null,
      ndvi_trend: null,
      soil_n: null,
      soil_p: null,
      soil_k: null,
      has_land_context: false,
      has_soil_data: false,
      has_ndvi_data: false
    };
  }
  
  return {
    crop_code: authoritativeState.crop.crop_code || 'UNKNOWN',
    growth_stage: authoritativeState.crop.growth_stage || 'UNKNOWN',
    days_since_sowing: authoritativeState.crop.days_since_sowing,
    
    // Raw values only - no interpretation
    ndvi_value: authoritativeState.ndvi.latest_value,
    ndvi_trend: authoritativeState.ndvi.trend,
    
    // Raw values only - no interpretation
    soil_n: authoritativeState.soil.nitrogen_kg_per_ha,
    soil_p: authoritativeState.soil.phosphorus_kg_per_ha,
    soil_k: authoritativeState.soil.potassium_kg_per_ha,
    
    // Flags
    has_land_context: true,
    has_soil_data: authoritativeState.soil.data_fresh,
    has_ndvi_data: authoritativeState.ndvi.data_fresh
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS - BACKWARD COMPATIBILITY
// These will be removed after orchestrator migration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use generateClarificationRequest instead
 * This is a compatibility wrapper for the old API
 */
export interface DynamicClarificationInput {
  scope: ClarificationScope;
  farmer_message: string;
  language: string;
  agronomic_context: {
    crop_name?: string;
    crop_code?: string;
    growth_stage?: string;
    days_since_sowing?: number;
    ndvi_value?: number;
    ndvi_trend?: string;
    soil_n?: number | string;
    soil_p?: number | string;
    soil_k?: number | string;
    soil_tested?: boolean;
    temperature?: number;
    humidity?: number;
    rain_expected?: boolean;
    area_acres?: number;
    irrigation_type?: string;
    village?: string;
    district?: string;
  };
  max_options?: number;
}

/**
 * @deprecated Use ClarificationOutput instead
 */
export interface DynamicClarificationOutput {
  question: string;
  options: { label: string; observation_key: string; confidence: number; evidence: string }[];
  context_frame: string;
  evidence_summary: string;
  generated_by: 'LLM_DYNAMIC' | 'SYMBOLIC_RULES' | 'HYBRID';
}

/**
 * @deprecated Use generateClarificationRequest instead
 * Legacy wrapper - returns minimal response to prevent breaks
 */
export async function generateDynamicClarification(
  input: DynamicClarificationInput,
  dialectResult?: any
): Promise<DynamicClarificationOutput> {
  console.warn('[DEPRECATED] generateDynamicClarification called - migrate to generateClarificationRequest');
  
  // TODO: Requires upstream symbolic decision output
  // Return minimal response to prevent runtime errors
  return {
    question: '', // TODO: Text must come from LLM narration layer
    options: [],
    context_frame: '',
    evidence_summary: '',
    generated_by: 'SYMBOLIC_RULES'
  };
}

/**
 * @deprecated Probability calculation moved to symbolic-reasoner.ts
 */
export function calculateProbableCauses(
  context: any,
  farmerMessage: string,
  dialectResult?: any
): any[] {
  console.warn('[DEPRECATED] calculateProbableCauses called - use symbolic-reasoner.ts instead');
  // TODO: Requires upstream symbolic decision output
  return [];
}

export default {
  generateClarificationRequest,
  buildAgronomicContext,
  decideClarificationNeeded,
  DYNAMIC_CLARIFICATION_VERSION
};

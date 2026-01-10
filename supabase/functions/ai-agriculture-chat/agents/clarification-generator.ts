/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-15: CLARIFICATION GENERATOR (DYNAMIC CONTEXT-AWARE)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Generate intelligent, context-aware clarification responses using ALL
 * agronomic data: crop, DOS, soil, NDVI, weather, and schedule data.
 * 
 * PHILOSOPHY:
 * - NOT a traditional chatbot with static templates
 * - World-class symbolic decision brain with LLM rendering
 * - Options are EVIDENCE-BASED from actual field conditions
 * 
 * PHASE-15 UPDATE:
 * - Integrated dynamic-clarification-generator for context-aware options
 * - Options now use crop stage, soil NPK, NDVI trends, weather forecasts
 * - Farmer sees RELEVANT choices based on actual conditions
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ObservationExtraction } from './observation-extractor.ts';
import type { UnderstandingCheckResult } from './understanding-completeness-checker.ts';
import { UnderstandingConfidence } from './understanding-completeness-checker.ts';
import {
  ClarificationScope,
  resolveClarificationPlan,
  needsClarification,
  hasSufficientInformation,
  type ClarificationPlan,
  type ClarificationState
} from './clarification-scope-resolver.ts';

import {
  renderClarification,
  validateClarificationSafety,
  getMonitoringAdvice,
  type ClarificationRenderOutput
} from './clarification-renderer.ts';

import {
  mapToObservationKeys,
  serializeKeys
} from './observation-key-mapper.ts';

import { ObservationKey } from '../decision/observation-ontology.ts';

// PHASE-8.1: Import CropContextAuthority
import type { CropContextAuthority } from '../decision/context-authority.ts';

// PHASE-15: Import Dynamic Clarification Generator
import {
  generateDynamicClarification,
  buildAgronomicContext,
  type AgronomicContext,
  type DynamicClarificationOutput
} from './dynamic-clarification-generator.ts';

export const CLARIFICATION_GENERATOR_VERSION = '3.0.0'; // Phase-15: Dynamic context-aware

// Re-export types for convenience
export { ClarificationScope };
export type { ClarificationPlan, ClarificationState };

// ═══════════════════════════════════════════════════════════════════════════
// INPUT/OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationInput {
  language: 'mr' | 'hi' | 'en';
  farmer_message: string;
  observations: string[];
  crop_code?: string;
  clarification_type: 'NONE' | 'OPTIONS' | 'PHOTO' | 'OPTIONS_PLUS_PHOTO';
  clarification_options?: string[];
}

export interface ScopedClarificationInput {
  language: 'mr' | 'hi' | 'en';
  observations: ObservationExtraction;
  understandingResult: UnderstandingCheckResult;
  hasLandContext: boolean;
  diagnosisRulesFired: boolean;
  clarificationState?: ClarificationState;
  /** PHASE-8.1: Flag to skip crop clarification when CropContextAuthority exists */
  hasCropContext?: boolean;
  /** PHASE-8.1: Crop context for stage-aware framing */
  cropContext?: CropContextAuthority | null;
  /** PHASE-15: Full land context for dynamic clarification */
  landContext?: any;
  /** PHASE-15: Farmer message for LLM context */
  farmerMessage?: string;
}

export interface ClarificationOutput {
  response_text: string;
  options: string[];
  photo_requested: boolean;
  clarification_prompt: string;
  scope?: ClarificationScope;
  validation_passed?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACKNOWLEDGMENT TEMPLATES (Simple, No Diagnosis)
// ═══════════════════════════════════════════════════════════════════════════

const ACKNOWLEDGMENT_TEMPLATES: Record<string, string> = {
  mr: '🌾 समजले.',
  hi: '🌾 समझ गया.',
  en: '🌾 Understood.'
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate PHASE-15 DYNAMIC clarification response.
 * Uses full agronomic context (crop, DOS, soil, NDVI, weather) for intelligent options.
 */
export async function generateScopedClarification(
  input: ScopedClarificationInput
): Promise<ClarificationOutput> {
  const { language, observations, understandingResult, hasLandContext, clarificationState, hasCropContext, cropContext, landContext, farmerMessage } = input;
  
  console.log(`📋 [Clarification] Phase-15 DYNAMIC clarification generation...`);
  console.log(`   hasCropContext: ${hasCropContext || false}, cropContext: ${cropContext ? cropContext.crop_name : 'none'}`);
  console.log(`   hasLandContext: ${!!landContext}, DOS: ${landContext?.days_since_sowing || 'N/A'}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Map observations to ObservationKeys (with cropContext)
  // ═══════════════════════════════════════════════════════════════════════════
  const keyMappingResult = mapToObservationKeys(
    observations, 
    { current_crop: observations.crop_mentioned },
    cropContext // PHASE-8.1: Pass crop context authority
  );
  
  const observedKeys = keyMappingResult.keys;
  const turnCount = clarificationState?.turn_count || 0;
  
  console.log(`   ObservationKeys: ${keyMappingResult.key_count} keys, ${keyMappingResult.unknown_count} unknowns`);
  console.log(`   Turn count: ${turnCount}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Resolve clarification plan (ObservationKey-based, deterministic)
  // PHASE-8.1: Pass hasCropContext to skip crop clarification
  // ═══════════════════════════════════════════════════════════════════════════
  const clarificationPlan = resolveClarificationPlan(
    observedKeys,
    turnCount,
    clarificationState?.previous_scopes || [],
    hasCropContext || false // PHASE-8.1: Skip crop clarification if true
  );
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-15: USE DYNAMIC CLARIFICATION if land context available
  // This generates context-aware options using crop, DOS, soil, NDVI, weather
  // ═══════════════════════════════════════════════════════════════════════════
  if (landContext && landContext.current_crop && clarificationPlan.scope === ClarificationScope.REFINE_OBSERVATION) {
    try {
      console.log(`   🧠 Using DYNAMIC clarification generator with full context`);
      
      const agronomicContext = buildAgronomicContext(landContext);
      const dynamicResult = await generateDynamicClarification({
        scope: clarificationPlan.scope,
        farmer_message: farmerMessage || '',
        language,
        agronomic_context: agronomicContext,
        max_options: 3
      });
      
      console.log(`   ✅ Dynamic options generated: ${dynamicResult.options.length} (${dynamicResult.generated_by})`);
      
      // Return dynamic result
      const acknowledgment = language === 'mr' ? '🌾 समजले.' : language === 'hi' ? '🌾 समझ गया.' : '🌾 Understood.';
      return {
        response_text: `${acknowledgment}\n\n${dynamicResult.question}`,
        options: dynamicResult.options.map(o => o.label),
        photo_requested: false,
        clarification_prompt: dynamicResult.question,
        scope: clarificationPlan.scope,
        validation_passed: true
      };
    } catch (dynamicError) {
      console.error(`   ⚠️ Dynamic clarification failed, falling back to templates:`, dynamicError);
      // Fall through to template-based rendering
    }
  }
  
  console.log(`   Clarification plan: scope=${clarificationPlan.scope}, reason=${clarificationPlan.reason}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Handle STOP_ESCALATE (max turns or sufficient info)
  // ═══════════════════════════════════════════════════════════════════════════
  if (clarificationPlan.should_stop) {
    const monitoringAdvice = getMonitoringAdvice(language);
    return {
      response_text: monitoringAdvice,
      options: [],
      photo_requested: false,
      clarification_prompt: monitoringAdvice,
      scope: ClarificationScope.STOP_ESCALATE,
      validation_passed: true
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Render clarification using templates (no LLM)
  // PHASE-8.1: Pass cropContext for stage-aware framing
  // ═══════════════════════════════════════════════════════════════════════════
  const renderResult = renderClarification({
    scope: clarificationPlan.scope,
    target_observation_keys: clarificationPlan.target_keys,
    language_code: language,
    // PHASE-14: Enforce max 3 options per Farmer Interaction Engine rules
    max_options: 3,
    turn_count: turnCount,
    constraints: {
      no_diagnosis: true,
      no_treatment: true,
      no_assumptions: true
    },
    cropContext: cropContext // PHASE-8.1: For stage-aware framing
  });
  
  console.log(`   Rendered: validation_passed=${renderResult.validation_passed}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: SAFETY VALIDATION (Hard Gate)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!renderResult.validation_passed) {
    console.error(`   ❌ SAFETY VIOLATION: ${renderResult.violations.join(', ')}`);
    // Return safe fallback - no options, just monitoring advice
    return {
      response_text: getMonitoringAdvice(language),
      options: [],
      photo_requested: true,
      clarification_prompt: getMonitoringAdvice(language),
      scope: ClarificationScope.PHOTO_ONLY,
      validation_passed: false
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: Format final response
  // ═══════════════════════════════════════════════════════════════════════════
  const acknowledgment = ACKNOWLEDGMENT_TEMPLATES[language] || ACKNOWLEDGMENT_TEMPLATES.en;
  const responseText = `${acknowledgment}\n\n${renderResult.question}`;
  
  return {
    response_text: responseText,
    options: renderResult.options,
    photo_requested: renderResult.photo_request,
    clarification_prompt: renderResult.question,
    scope: renderResult.scope,
    validation_passed: true
  };
}

/**
 * LEGACY FUNCTION: Generate clarification response (backward compatibility).
 * Routes to Phase-8 system internally.
 */
export function generateClarificationResponse(input: ClarificationInput): ClarificationOutput {
  const { language, farmer_message, observations, crop_code, clarification_type } = input;
  
  // If no clarification needed, return empty
  if (clarification_type === 'NONE') {
    return {
      response_text: '',
      options: [],
      photo_requested: false,
      clarification_prompt: ''
    };
  }
  
  // Convert legacy input to Phase-8 format
  const observationExtraction: ObservationExtraction = {
    crop_mentioned: crop_code,
    raw_symptom_text: observations,
    affected_part: 'unknown',
    symptom_distribution: 'unknown',
    severity_words: [],
    time_reference: undefined,
    action_taken: [],
    uncertainty_markers: [],
    detected_language: language,
    observation_count: observations.length
  };
  
  // Use Phase-8 scoped clarification
  return generateScopedClarification({
    language,
    observations: observationExtraction,
    understandingResult: {
      understanding_confidence: UnderstandingConfidence.LOW,
      completeness_score: 40,
      unknown_critical_fields: ['affected_part', 'severity'],
      contradiction_detected: [],
      clarification_required: true,
      missing_for_diagnosis: ['affected_part', 'severity'],
      clarification_priority: 'symptom',
      clarification_reason: 'Legacy clarification request',
      diagnosis_rules_fired: false
    },
    hasLandContext: !!crop_code,
    diagnosisRulesFired: false
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTION MATCHING (For farmer response processing)
// ═══════════════════════════════════════════════════════════════════════════

export interface MatchedOption {
  original_option: string;
  observation: string;
  likely_cause: string;
  match_confidence: number;
}

/**
 * PHASE-9.1: Standardized match result interface
 * Used by orchestrator to handle option matching safely
 */
export interface OptionMatchResult {
  /** Whether a match was found */
  matched: boolean;
  /** The matched option text */
  matched_option?: string;
  /** Index of the matched option (0-based) */
  option_index?: number;
  /** Match confidence (0-1) */
  match_confidence: number;
}

/**
 * Match farmer's response to a clarification option.
 * Used when farmer selects from options or types something similar.
 * 
 * PHASE-9.1: Returns standardized OptionMatchResult with NULL-SAFE design.
 */
export function matchFarmerResponseToOption(
  farmerResponse: string,
  pendingOptions: string[]
): OptionMatchResult {
  // PHASE-9.1: NULL-SAFE - Always return a valid object
  if (!pendingOptions || pendingOptions.length === 0) {
    return {
      matched: false,
      match_confidence: 0
    };
  }
  
  const response = farmerResponse.trim().toLowerCase();
  
  // PHASE-9.1: NULL-SAFE option parsing with guard
  // Check for numeric selection (1, 2, 3, 4 or Devanagari १, २, ३, ४)
  const numMatch = response.match(/^[१२३४1-4]$/);
  
  // PATCH 2: NULL-SAFE - Check if match exists before accessing properties
  if (numMatch && numMatch[0]) {
    // Convert Devanagari numerals to Arabic
    const devanagariMap: Record<string, string> = { '१': '1', '२': '2', '३': '3', '४': '4' };
    const numStr = devanagariMap[numMatch[0]] || numMatch[0];
    const index = parseInt(numStr) - 1;
    
    if (index >= 0 && index < pendingOptions.length) {
      return {
        matched: true,
        matched_option: pendingOptions[index],
        option_index: index,
        match_confidence: 1.0
      };
    }
  }
  
  // Check for text match
  for (let i = 0; i < pendingOptions.length; i++) {
    const option = pendingOptions[i].toLowerCase();
    // Exact or partial match
    if (response === option || response.includes(option) || option.includes(response)) {
      return {
        matched: true,
        matched_option: pendingOptions[i],
        option_index: i,
        match_confidence: response === option ? 1.0 : 0.8
      };
    }
  }
  
  // PHASE-9.1: No match - return safe default
  return {
    matched: false,
    match_confidence: 0
  };
}

/**
 * Map selected option back to ObservationKey.
 * This is used to update the observation state after farmer selects an option.
 */
export function mapOptionToObservation(
  option: string,
  scope: ClarificationScope
): ObservationKey | null {
  // Map based on scope
  switch (scope) {
    case ClarificationScope.IDENTIFY_CROP:
      return ObservationKey.CROP_IDENTIFIED;
      
    case ClarificationScope.IDENTIFY_LOCATION:
      // Map based on option content
      if (option.includes('पान') || option.includes('पत्त') || option.toLowerCase().includes('leaf')) {
        return ObservationKey.AFFECTED_PART_LEAF;
      }
      if (option.includes('खोड') || option.includes('तना') || option.toLowerCase().includes('stem')) {
        return ObservationKey.AFFECTED_PART_STEM;
      }
      if (option.includes('मूळ') || option.includes('जड़') || option.toLowerCase().includes('root')) {
        return ObservationKey.AFFECTED_PART_ROOT;
      }
      if (option.includes('फळ') || option.includes('फल') || option.toLowerCase().includes('fruit')) {
        return ObservationKey.AFFECTED_PART_FRUIT;
      }
      return ObservationKey.AFFECTED_PART_WHOLE;
      
    case ClarificationScope.IDENTIFY_DISTRIBUTION:
      if (option.includes('सगळीकडे') || option.includes('हर जगह') || option.toLowerCase().includes('uniform')) {
        return ObservationKey.DISTRIBUTION_UNIFORM;
      }
      if (option.includes('ठिकठिकाणी') || option.includes('जगह-जगह') || option.toLowerCase().includes('patch')) {
        return ObservationKey.DISTRIBUTION_PATCHY;
      }
      if (option.includes('कडे') || option.includes('किनार') || option.toLowerCase().includes('edge')) {
        return ObservationKey.DISTRIBUTION_EDGE;
      }
      return ObservationKey.DISTRIBUTION_CENTER;
      
    case ClarificationScope.IDENTIFY_SEVERITY:
      if (option.includes('थोड') || option.toLowerCase().includes('light')) {
        return ObservationKey.SEVERITY_LOW;
      }
      if (option.includes('मध्यम') || option.toLowerCase().includes('moderate')) {
        return ObservationKey.SEVERITY_MEDIUM;
      }
      if (option.includes('जास्त') || option.includes('ज्यादा') || option.toLowerCase().includes('heavy')) {
        return ObservationKey.SEVERITY_HIGH;
      }
      return ObservationKey.SEVERITY_MEDIUM;
      
    case ClarificationScope.IDENTIFY_TIMING:
      if (option.includes('आज') || option.includes('काल') || option.toLowerCase().includes('today')) {
        return ObservationKey.TIMING_RECENT;
      }
      if (option.includes('आठवड') || option.includes('हफ्त') || option.toLowerCase().includes('week')) {
        return ObservationKey.TIMING_WEEK;
      }
      if (option.includes('दिवस') || option.includes('दिन') || option.toLowerCase().includes('long')) {
        return ObservationKey.TIMING_LONG;
      }
      return ObservationKey.TIMING_WEEK;
    
    // PHASE-10: Insect type identification for wheat pests
    case ClarificationScope.IDENTIFY_INSECT_TYPE:
      if (option.includes('माव') || option.toLowerCase().includes('aphid') || option.includes('हिरव') || option.includes('पिवळ')) {
        return ObservationKey.PEST_TYPE_APHID;
      }
      if (option.includes('थ्रिप्स') || option.toLowerCase().includes('thrips') || option.includes('पातळ') || option.includes('लांब')) {
        return ObservationKey.PEST_TYPE_THRIPS;
      }
      if (option.includes('कोळी') || option.toLowerCase().includes('mite') || option.includes('जाळी')) {
        return ObservationKey.PEST_TYPE_MITE;
      }
      return ObservationKey.PEST_TYPE_UNKNOWN;
      
    default:
      return null;
  }
}

export default {
  generateScopedClarification,
  generateClarificationResponse,
  matchFarmerResponseToOption,
  mapOptionToObservation,
  ClarificationScope,
  CLARIFICATION_GENERATOR_VERSION
};

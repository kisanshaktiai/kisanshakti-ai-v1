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
  renderClarificationAsync,
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

// PHASE-15: Dynamic clarification generator removed (R1 FIX). The deprecated
// `generateDynamicClarification` stub returned empty data and forced the
// pipeline into the English template fallback. Intent-driven clarification
// now runs through `resolveIntentToObservations` against
// `intent_observation_mapping`. The legacy module is no longer imported.

// R1 FIX: Wire intent_observation_mapping through the canonical intent resolver.
import { resolveIntentToObservations } from '../decision/intent-resolver.ts';
import { loadObservationLabels } from '../i18n/observation-label-loader.ts';
import { createClient as createSupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

// PHASE-16: Import Clarification Validator to prevent diagnosis leakage
import {
  validateClarificationOptions,
  validateAndSanitizeClarification,
  DIAGNOSIS_KEYWORDS
} from '../decision/clarification-validator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// v6.0: CANONICAL CONTEXT CONTRACT (IMMUTABLE, PASSED BY REFERENCE)
// ═══════════════════════════════════════════════════════════════════════════
import {
  type CanonicalContext,
  assertCanonicalContextLocked,
  hasDiagnosticContext,
  logCanonicalContextAudit
} from '../decision/canonical-context-contract.ts';

export const CLARIFICATION_GENERATOR_VERSION = '6.0.0'; // v6: Eliminate context rebuilding

// Re-export types for convenience
export { ClarificationScope };
export type { ClarificationPlan, ClarificationState };
export type { CanonicalContext };

// ═══════════════════════════════════════════════════════════════════════════
// INPUT/OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationInput {
  language: string;
  farmer_message: string;
  observations: string[];
  crop_code?: string;
  clarification_type: 'NONE' | 'OPTIONS' | 'PHOTO' | 'OPTIONS_PLUS_PHOTO';
  clarification_options?: string[];
}

export interface ScopedClarificationInput {
  language: string;
  observations: ObservationExtraction;
  understandingResult: UnderstandingCheckResult;
  diagnosisRulesFired: boolean;
  clarificationState?: ClarificationState;

  canonicalContext: CanonicalContext | null;

  /** PHASE-8.1: Crop context for stage-aware framing (DEPRECATED - use canonicalContext) */
  cropContext?: CropContextAuthority | null;
  /** PHASE-15: Farmer message for LLM context */
  farmerMessage?: string;
  /**
   * Phase J — Canonical ConversationState (single runtime authority).
   * When provided, clarification stage / crop / language / observations MUST
   * be sourced from this frozen object and never recomputed.
   */
  conversationState?: import('../runtime/conversation-state.ts').ConversationState;
  /**
   * R1 FIX — Canonical intent_code resolved upstream (semantic extraction / NLU).
   * Required to drive the intent_observation_mapping path; when present, the
   * clarification engine queries curated DB observations for this intent
   * BEFORE falling back to template/decision-rule heuristics.
   */
  intent_code?: string;
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
 * 
 * v6.0: Context is RECEIVED, not rebuilt. canonicalContext is IMMUTABLE.
 */
export async function generateScopedClarification(
  input: ScopedClarificationInput
): Promise<ClarificationOutput> {
  const { language, observations, understandingResult, clarificationState, cropContext, canonicalContext, farmerMessage, conversationState, intent_code } = input;

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase J — ConversationState is the single runtime authority.
  // Stage / crop / language are pulled from the frozen state when provided.
  // ═══════════════════════════════════════════════════════════════════════════
  const effectiveLanguage = (conversationState?.semantic_status ? language : language) || 'en';
  const stateStage = conversationState?.stage || canonicalContext?.growth_stage || null;
  const stateCrop  = conversationState?.crop  || canonicalContext?.crop_code   || canonicalContext?.crop_name || null;

  if (conversationState) {
    console.log(`📋 [CLARIFICATION_TRACE] state.mode=${conversationState.mode} stage=${stateStage} crop=${stateCrop} lang=${effectiveLanguage} confirmed=${conversationState.confirmed.length} inferred=${conversationState.inferred.length} reason=${conversationState.clarification_reason}`);
  } else {
    console.warn(`📋 [CLARIFICATION_TRACE] ConversationState NOT provided — falling back to canonicalContext (legacy path)`);
  }

  const hasLandContext = canonicalContext !== null;
  const effectiveHasLandContext = hasDiagnosticContext(canonicalContext);
  const hasCropContext = effectiveHasLandContext;

  console.log(`📋 [Clarification v6] Canonical Context State:`);
  if (canonicalContext) {
    logCanonicalContextAudit(canonicalContext, 'CLARIFICATION_GENERATOR', 'CANONICAL_CONTRACT');
    console.log(`   ✅ Context received (NOT rebuilt) - Phase-1 locked`);
  } else {
    console.log(`   Context=NULL (General Query Mode)`);
  }

  console.log(`   hasCropContext: ${hasCropContext}, cropContext: ${cropContext ? cropContext.crop_name : 'none'}`);
  console.log(`   hasLandContext: ${hasLandContext}, effectiveContext: ${effectiveHasLandContext}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Map observations to ObservationKeys (with cropContext)
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
  // STEP 3: Resolve clarification plan (ObservationKey-based, deterministic)
  // v6.0: Pass canonicalContext directly to scope resolver
  // ═══════════════════════════════════════════════════════════════════════════
  
  const clarificationPlan = resolveClarificationPlan(
    observedKeys,
    turnCount,
    clarificationState?.previous_scopes || [],
    hasCropContext,
    canonicalContext // v6.0: Pass canonical context directly
  );
  
  // ═══════════════════════════════════════════════════════════════════════════
  // R1 FIX — Intent-driven clarification using intent_observation_mapping.
  //
  // The previous path called the deprecated `generateDynamicClarification`
  // stub (which returns empty) and silently fell back to BASE_TEMPLATES,
  // producing generic English options (e.g. "🔍 Insects visible"). The
  // mapping table is healthy (e.g. 29 curated rows for
  // EMERGENCE_FAILURE / RICE / SEEDLING / DAS 17) but was unreachable.
  //
  // We now route REFINE_OBSERVATION through the canonical resolver:
  //   intent_code + crop_code + growth_stage + DAS
  //     → intent_observation_mapping (crop / stage-synonym / DAS filtered)
  //     → observation_translations (language-localized labels)
  //
  // Falls through to the legacy renderer if intent_code is missing or the
  // mapping returns no curated rows for the context.
  // ═══════════════════════════════════════════════════════════════════════════
  const resolvedIntent =
    intent_code ||
    (conversationState as any)?.intent_code ||
    (understandingResult as any)?.intent_code ||
    null;

  if (
    effectiveHasLandContext &&
    canonicalContext &&
    clarificationPlan.scope === ClarificationScope.REFINE_OBSERVATION &&
    resolvedIntent &&
    resolvedIntent !== 'UNKNOWN' &&
    resolvedIntent !== 'UNKNOWN_OBSERVATION'
  ) {
    try {
      console.log(`   🧠 [R1] Intent-driven clarification via intent_observation_mapping → intent=${resolvedIntent}, crop=${canonicalContext.crop_code}, stage=${canonicalContext.growth_stage}, das=${canonicalContext.days_since_sowing}`);

      const resolved = await resolveIntentToObservations({
        intent_code: resolvedIntent,
        crop_code: canonicalContext.crop_code || canonicalContext.crop_name || 'all',
        days_since_sowing: canonicalContext.days_since_sowing || 0,
        growth_stage: canonicalContext.growth_stage || undefined
      });

      if (resolved.success && resolved.observation_codes.length > 0) {
        // Top-N by confidence_rank (mapping rows are pre-ordered ASC by resolver)
        const topCodes = resolved.observation_codes.slice(0, 6);

        const url = Deno.env.get('SUPABASE_URL');
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (url && key) {
          const client = createSupabaseClient(url, key);
          const labelMap = await loadObservationLabels(client, topCodes, language);

          const optionLabels: string[] = [];
          for (const code of topCodes) {
            const lbl = labelMap.get(code.toUpperCase());
            if (lbl?.display_text) optionLabels.push(lbl.display_text);
            if (optionLabels.length >= 3) break;
          }

          // Diagnosis-leakage gate (unchanged contract)
          const leakageValidation = validateClarificationOptions(optionLabels);
          if (!leakageValidation.valid) {
            console.warn(`   ⚠️ [R1] Diagnosis leakage in DB-resolved options → falling back to template renderer:`, leakageValidation.violations);
          } else if (optionLabels.length > 0) {
            console.log(`   ✅ [R1] Intent-resolver options ready (${optionLabels.length}) for lang=${language}`);

            // Render the question via the async renderer so framing + DB
            // label resolution stays consistent, then OVERRIDE the options
            // with the intent-curated set.
            const renderResult = await renderClarificationAsync({
              scope: clarificationPlan.scope,
              target_observation_keys: clarificationPlan.target_keys,
              language_code: language,
              max_options: 3,
              turn_count: turnCount,
              constraints: { no_diagnosis: true, no_treatment: true, no_assumptions: true },
              cropContext
            });

            const acknowledgment = ACKNOWLEDGMENT_TEMPLATES[language] || ACKNOWLEDGMENT_TEMPLATES.en;
            return {
              response_text: `${acknowledgment}\n\n${renderResult.question}`,
              options: optionLabels.slice(0, 3),
              photo_requested: false,
              clarification_prompt: renderResult.question,
              scope: clarificationPlan.scope,
              validation_passed: true
            };
          }
        }
      } else {
        console.warn(`   ⚠️ [R1] resolveIntentToObservations returned 0 curated codes for intent=${resolvedIntent} (${resolved.error || 'no rows'}) — falling back`);
      }
    } catch (intentErr) {
      console.error(`   ⚠️ [R1] Intent-driven clarification failed, falling back to renderer:`, intentErr);
    }
  } else if (clarificationPlan.scope === ClarificationScope.REFINE_OBSERVATION) {
    console.warn(`   ⚠️ [R1] Skipping intent path (intent=${resolvedIntent || 'NONE'}, hasContext=${effectiveHasLandContext})`);
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
  // STEP 4: Render clarification using ASYNC DB-driven renderer
  // PHASE-18: Use renderClarificationAsync for DB-driven options
  // ═══════════════════════════════════════════════════════════════════════════
  const renderResult = await renderClarificationAsync({
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
  
  console.log(`   Rendered: validation_passed=${renderResult.validation_passed}, source=DB+Template`);
  
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
 * 
 * v6.0 FIX: This function does NOT have land context, so it must pass
 * canonicalContext: null. This fixes the INVARIANT VIOLATION bug.
 */
export async function generateClarificationResponse(input: ClarificationInput): Promise<ClarificationOutput> {
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
  
  // v6.0 FIX: Pass canonicalContext: null (legacy function has no land context)
  // This fixes the bug where hasLandContext: !!crop_code was true but landContext was undefined
  return await generateScopedClarification({
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
    canonicalContext: null,  // v6.0: Legacy function has NO context - this is correct
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
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LANGUAGE-AGNOSTIC TEXT NORMALIZATION (v2.0)
 * Strips emojis, symbols, and metadata for pure text comparison
 * ═══════════════════════════════════════════════════════════════════════════
 */
function normalizeTextForComparison(text: string): string {
  if (!text) return '';
  
  return text
    // Remove embedded observation keys: [obs_keys:...]
    .replace(/\[obs_keys:[^\]]*\]/gi, '')
    // Remove emojis and common symbols (Unicode-safe)
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Most emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Miscellaneous symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[🌾🐛💧🍂📷🔍✅❌⚠️🌱💚🪲🦠]/g, '') // Common agriculture emojis
    // Remove punctuation but keep letters/numbers/spaces (Unicode-safe)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    // Collapse multiple spaces to single
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Calculate token-based similarity between two strings (0-1)
 * Language-agnostic: works on tokenized words in any script
 */
function calculateTokenSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  
  const tokens1 = new Set(text1.toLowerCase().split(/\s+/).filter(t => t.length > 1));
  const tokens2 = new Set(text2.toLowerCase().split(/\s+/).filter(t => t.length > 1));
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  // Count common tokens
  let commonCount = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) commonCount++;
  }
  
  // Jaccard-style similarity: intersection / union
  const union = new Set([...tokens1, ...tokens2]);
  return union.size > 0 ? commonCount / union.size : 0;
}

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
  
  const response = farmerResponse.trim();
  
  // ========================================
  // CHECK 1: EMBEDDED OBSERVATION KEYS (HIGHEST PRIORITY)
  // If message contains [obs_keys:...], this IS an option selection
  // ========================================
  const obsKeysMatch = response.match(/\[obs_keys:([^\]]+)\]/);
  if (obsKeysMatch) {
    // This is definitely an option selection from the UI
    // Find the matching option by its embedded key
    for (let i = 0; i < pendingOptions.length; i++) {
      const optionObsMatch = pendingOptions[i].match(/\[obs_keys:([^\]]+)\]/);
      if (optionObsMatch && optionObsMatch[1] === obsKeysMatch[1]) {
        return {
          matched: true,
          matched_option: pendingOptions[i],
          option_index: i,
          match_confidence: 1.0
        };
      }
    }
  }
  
  // ========================================
  // CHECK 2: UNICODE-AWARE DIGIT NORMALIZATION
  // Supports Devanagari (Hindi/Marathi), Arabic, and other numeral systems
  // ========================================
  const UNICODE_DIGIT_MAP: Record<string, string> = {
    // Devanagari digits
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
    // Arabic-Indic digits (used in some regions)
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    // Extended Arabic-Indic
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  };
  
  // Normalize response: convert all Unicode digits to ASCII
  const digitsNormalized = response
    .split('')
    .map(c => UNICODE_DIGIT_MAP[c] || c)
    .join('')
    .trim();
  
  // Check for numeric selection (1, 2, 3, 4) after normalization
  const numMatch = digitsNormalized.match(/^[1-4]$/);
  
  if (numMatch && numMatch[0]) {
    const index = parseInt(numMatch[0]) - 1;
    
    if (index >= 0 && index < pendingOptions.length) {
      return {
        matched: true,
        matched_option: pendingOptions[index],
        option_index: index,
        match_confidence: 1.0
      };
    }
  }
  
  // ========================================
  // CHECK 3: NORMALIZED TEXT MATCHING (Language-Agnostic)
  // Strip emojis/symbols and compare pure text
  // ========================================
  const normalizedResponse = normalizeTextForComparison(response);
  
  // If normalized response is too short (< 2 chars), it's not a valid selection
  if (normalizedResponse.length < 2) {
    return {
      matched: false,
      match_confidence: 0
    };
  }
  
  for (let i = 0; i < pendingOptions.length; i++) {
    const normalizedOption = normalizeTextForComparison(pendingOptions[i]);
    
    // Exact normalized match
    if (normalizedResponse === normalizedOption) {
      return {
        matched: true,
        matched_option: pendingOptions[i],
        option_index: i,
        match_confidence: 1.0
      };
    }
    
    // Strong substring match: response is contained in option OR vice versa
    // Require at least 3 chars to prevent false positives
    if (normalizedResponse.length >= 3) {
      if (normalizedOption.includes(normalizedResponse)) {
        return {
          matched: true,
          matched_option: pendingOptions[i],
          option_index: i,
          match_confidence: 0.85
        };
      }
      if (normalizedResponse.includes(normalizedOption) && normalizedOption.length >= 3) {
        return {
          matched: true,
          matched_option: pendingOptions[i],
          option_index: i,
          match_confidence: 0.8
        };
      }
    }
  }
  
  // ========================================
  // CHECK 4: TOKEN SIMILARITY (Language-Agnostic Fuzzy Match)
  // For cases like "कीड" matching "🐛 कीड/किडीचा हल्ला"
  // ========================================
  let bestMatch: { index: number; confidence: number } | null = null;
  
  for (let i = 0; i < pendingOptions.length; i++) {
    const normalizedOption = normalizeTextForComparison(pendingOptions[i]);
    const similarity = calculateTokenSimilarity(normalizedResponse, normalizedOption);
    
    // Require >= 50% token overlap for a fuzzy match
    if (similarity >= 0.5) {
      if (!bestMatch || similarity > bestMatch.confidence) {
        bestMatch = { index: i, confidence: similarity };
      }
    }
  }
  
  if (bestMatch && bestMatch.confidence >= 0.5) {
    return {
      matched: true,
      matched_option: pendingOptions[bestMatch.index],
      option_index: bestMatch.index,
      match_confidence: bestMatch.confidence * 0.9 // Slightly reduce confidence for fuzzy matches
    };
  }
  
  // ========================================
  // NO MATCH FOUND
  // This could be a NEW QUERY, not an option selection
  // ========================================
  return {
    matched: false,
    match_confidence: 0
  };
}

/**
 * Map selected option back to ObservationKey.
 * This is used to update the observation state after farmer selects an option.
 * 
 * WORLD-CLASS FIX: Uses ENGLISH canonical keywords ONLY
 * All matching is done against English canonical terms, making this
 * language-agnostic and maintainable. The UI renders in the farmer's language,
 * but option matching uses standardized English keywords embedded in option IDs.
 */
export function mapOptionToObservation(
  option: string,
  scope: ClarificationScope
): ObservationKey | null {
  // Normalize option to lowercase for matching
  const optionLower = option.toLowerCase();
  
  // ========================================
  // ENGLISH CANONICAL KEYWORD PATTERNS
  // These are the ONLY allowed matching patterns
  // Multilingual UI labels should contain these English keywords
  // ========================================
  
  switch (scope) {
    case ClarificationScope.IDENTIFY_CROP:
      return ObservationKey.CROP_IDENTIFIED;
      
    case ClarificationScope.IDENTIFY_LOCATION:
      // Plant part keywords (English canonical)
      if (optionLower.includes('leaf') || optionLower.includes('leaves') || optionLower.includes('foliage')) {
        return ObservationKey.AFFECTED_PART_LEAF;
      }
      if (optionLower.includes('stem') || optionLower.includes('stalk') || optionLower.includes('trunk')) {
        return ObservationKey.AFFECTED_PART_STEM;
      }
      if (optionLower.includes('root') || optionLower.includes('underground')) {
        return ObservationKey.AFFECTED_PART_ROOT;
      }
      if (optionLower.includes('fruit') || optionLower.includes('pod') || optionLower.includes('grain') || optionLower.includes('ear')) {
        return ObservationKey.AFFECTED_PART_FRUIT;
      }
      if (optionLower.includes('flower') || optionLower.includes('blossom')) {
        return ObservationKey.AFFECTED_PART_FLOWER;
      }
      if (optionLower.includes('whole') || optionLower.includes('entire') || optionLower.includes('plant')) {
        return ObservationKey.AFFECTED_PART_WHOLE;
      }
      return ObservationKey.AFFECTED_PART_WHOLE;
      
    case ClarificationScope.IDENTIFY_DISTRIBUTION:
      // Distribution keywords (English canonical)
      if (optionLower.includes('uniform') || optionLower.includes('everywhere') || optionLower.includes('all over') || optionLower.includes('entire field')) {
        return ObservationKey.DISTRIBUTION_UNIFORM;
      }
      if (optionLower.includes('patch') || optionLower.includes('scattered') || optionLower.includes('random') || optionLower.includes('spots')) {
        return ObservationKey.DISTRIBUTION_PATCHY;
      }
      if (optionLower.includes('edge') || optionLower.includes('border') || optionLower.includes('boundary') || optionLower.includes('margin')) {
        return ObservationKey.DISTRIBUTION_EDGE;
      }
      if (optionLower.includes('center') || optionLower.includes('middle') || optionLower.includes('central')) {
        return ObservationKey.DISTRIBUTION_CENTER;
      }
      return ObservationKey.DISTRIBUTION_PATCHY; // Default to patchy if unclear
      
    case ClarificationScope.IDENTIFY_SEVERITY:
      // Severity keywords (English canonical)
      if (optionLower.includes('light') || optionLower.includes('mild') || optionLower.includes('slight') || optionLower.includes('minor') || optionLower.includes('few')) {
        return ObservationKey.SEVERITY_LOW;
      }
      if (optionLower.includes('moderate') || optionLower.includes('medium') || optionLower.includes('some') || optionLower.includes('several')) {
        return ObservationKey.SEVERITY_MEDIUM;
      }
      if (optionLower.includes('heavy') || optionLower.includes('severe') || optionLower.includes('serious') || optionLower.includes('many') || optionLower.includes('most')) {
        return ObservationKey.SEVERITY_HIGH;
      }
      if (optionLower.includes('critical') || optionLower.includes('complete') || optionLower.includes('total') || optionLower.includes('all')) {
        return ObservationKey.SEVERITY_CRITICAL;
      }
      return ObservationKey.SEVERITY_MEDIUM;
      
    case ClarificationScope.IDENTIFY_TIMING:
      // Timing keywords (English canonical)
      if (optionLower.includes('today') || optionLower.includes('yesterday') || optionLower.includes('just') || optionLower.includes('recent') || optionLower.includes('1-2 day')) {
        return ObservationKey.TIMING_RECENT;
      }
      if (optionLower.includes('week') || optionLower.includes('3-7 day') || optionLower.includes('few day')) {
        return ObservationKey.TIMING_WEEK;
      }
      if (optionLower.includes('long') || optionLower.includes('month') || optionLower.includes('2+ week') || optionLower.includes('chronic')) {
        return ObservationKey.TIMING_LONG;
      }
      return ObservationKey.TIMING_WEEK;
    
    case ClarificationScope.IDENTIFY_INSECT_TYPE:
      // Pest type keywords (English canonical)
      if (optionLower.includes('aphid') || optionLower.includes('aphis') || optionLower.includes('lice') || optionLower.includes('green insect') || optionLower.includes('sucking')) {
        return ObservationKey.PEST_TYPE_APHID;
      }
      if (optionLower.includes('thrips') || optionLower.includes('thin') || optionLower.includes('slender') || optionLower.includes('rasping')) {
        return ObservationKey.PEST_TYPE_THRIPS;
      }
      if (optionLower.includes('mite') || optionLower.includes('spider') || optionLower.includes('web') || optionLower.includes('tiny red')) {
        return ObservationKey.PEST_TYPE_MITE;
      }
      if (optionLower.includes('whitefly') || optionLower.includes('white fly') || optionLower.includes('bemisia')) {
        return ObservationKey.PEST_TYPE_WHITEFLY;
      }
      if (optionLower.includes('borer') || optionLower.includes('stem borer') || optionLower.includes('hole in stem')) {
        return ObservationKey.PEST_TYPE_BORER;
      }
      if (optionLower.includes('caterpillar') || optionLower.includes('worm') || optionLower.includes('larva') || optionLower.includes('grub')) {
        return ObservationKey.PEST_TYPE_CATERPILLAR;
      }
      if (optionLower.includes('hopper') || optionLower.includes('jumping') || optionLower.includes('leafhopper') || optionLower.includes('planthopper')) {
        return ObservationKey.PEST_TYPE_HOPPER;
      }
      return ObservationKey.PEST_TYPE_UNKNOWN;
    
    case ClarificationScope.IDENTIFY_INSECT_BEHAVIOR:
      // Insect behavior keywords (English canonical)
      if (optionLower.includes('flying') || optionLower.includes('fly') || optionLower.includes('flies')) {
        return ObservationKey.BEHAVIOR_FLYING;
      }
      if (optionLower.includes('crawling') || optionLower.includes('crawl') || optionLower.includes('walking')) {
        return ObservationKey.BEHAVIOR_CRAWLING;
      }
      if (optionLower.includes('jumping') || optionLower.includes('jump') || optionLower.includes('hopping')) {
        return ObservationKey.BEHAVIOR_JUMPING;
      }
      if (optionLower.includes('stationary') || optionLower.includes('still') || optionLower.includes('not moving')) {
        return ObservationKey.BEHAVIOR_STATIONARY;
      }
      return null;
      
    case ClarificationScope.IDENTIFY_PLANT_RESPONSE:
      // Plant response keywords (English canonical)
      if (optionLower.includes('wilting') || optionLower.includes('wilt') || optionLower.includes('drooping')) {
        return ObservationKey.RESPONSE_WILTING;
      }
      if (optionLower.includes('yellowing') || optionLower.includes('yellow') || optionLower.includes('chlorosis')) {
        return ObservationKey.RESPONSE_YELLOWING;
      }
      if (optionLower.includes('drying') || optionLower.includes('dry') || optionLower.includes('necrosis') || optionLower.includes('dead')) {
        return ObservationKey.RESPONSE_DRYING;
      }
      if (optionLower.includes('stunted') || optionLower.includes('poor growth') || optionLower.includes('not growing')) {
        return ObservationKey.RESPONSE_STUNTED;
      }
      return null;
      
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

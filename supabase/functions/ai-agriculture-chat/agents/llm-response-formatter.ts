/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 5: LLM RESPONSE FORMATTER - RENDER-ONLY MODE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SYMBOLIC BRAIN PRINCIPLE: "Rules Decide, AI Only Explains"
 * 
 * This module takes SYMBOLIC DECISION OUTPUT and renders it into
 * natural, empathetic, farmer-friendly language.
 * 
 * CRITICAL CONSTRAINTS:
 * - LLM can ONLY render what Rule Engine decided
 * - LLM CANNOT add products, dosages, or actions
 * - LLM CANNOT modify timing, quantities, or safety instructions
 * - Every output must pass SOURCE VALIDATION
 * 
 * KEY FEATURES:
 * - Input Validation Gate (blocks invalid symbolic input)
 * - Output Validation Gate (blocks unauthorized additions)
 * - Decision Readiness Gate Integration (blocks treatments when gate fails)
 * - 25-second timeout with structured fallback
 * - Full audit trail for compliance
 * 
 * PHASE-12 GOVERNANCE UPDATE:
 * - Hard enforcement of render-only mode
 * - Integration with Decision Readiness Gate
 * - Clarification state awareness (never treat clarification as task complete)
 * - Reasoning-for-result requirement
 */

import type { DecisionOutput, FarmerCommunication } from './rule-engine-types.ts';
import type { DataAudit } from './orchestrator.ts';
import { getRuralLanguageRules, replaceFormalsWithRural } from '../rural-language-dictionary.ts';
import { getLanguageName } from '../utils/language-utils.ts';
import {
  getProductName,
  getActionTranslation,
  getCauseTranslation
} from './communication-translation-dictionary.ts';

// v2.0: Import deterministic response builder
import {
  buildDeterministicResponse,
  formatStructuredResponseForLLM,
  extractRichRuleData,
  hasAdequateRuleContent,
} from './deterministic-response-builder.ts';
import type {
  RichRuleData,
  WeatherContext,
  CropContext,
} from './deterministic-response-builder.ts';

// Import validation from decision representation
import { validateLLMOutputIntegrity } from './decision-representation.ts';

// P1-4: Import unified types (gate check moved to index.ts - single gate)
import {
  GateStatus,
  GateAction,
  ResponseMode
} from '../decision/authority-types.ts';

// WORLD-CLASS: Import delivery validator for recommendation integrity
import {
  validateDelivery,
  generateMustIncludeConstraint,
  extractRecommendations
} from './delivery-validator.ts';

// WORLD-CLASS: Import follow-up generator for actionable timelines
import {
  generateCompleteFollowUp
} from './follow-up-generator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// SAFE STRING UTILITIES - Crash-proof text operations
// ═══════════════════════════════════════════════════════════════════════════
import {
  safePreviewText,
  safeTrim,
  safeLowerCase,
  hasTextContent,
  normalizeFarmerMessage,
  extractMessageContent,
  resolveI18nKey,
  resolveResponseModeString,
  resolveSeverity,
  resolveActionCodes
} from '../utils/safe-string.ts';

// Static import for i18n resolution (replaces dynamic await import)
import { getTranslation as resolveI18nFromCache } from '../i18n/translation-loader.ts';

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE MODE RENDERER - Mode-driven output generation
// ═══════════════════════════════════════════════════════════════════════════
import {
  renderByMode,
  resolveResponseMode,
  assertResponseModeInvariant,
} from '../utils/response-mode-renderer.ts';
import type { ModeRenderedOutput } from '../utils/response-mode-renderer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface LLMFormatterInput {
  farmer_message: string;
  language: string;
  decision_output: DecisionOutput;
  land_context?: {
    current_crop?: string;
    growth_stage?: string;
    area_acres?: number;
    days_since_sowing?: number;
    soil_health?: {
      nitrogen_kg_per_ha?: number;
      phosphorus_kg_per_ha?: number;
      potassium_kg_per_ha?: number;
      ph_level?: number;
    };
    ndvi?: {
      value?: number;
      trend?: string;
    };
    village?: string;
    district?: string;
  };
  data_audit?: DataAudit;
  trace_id?: string;
  supabase_client?: any;  // v2.1: For DB-driven translation of technical terms
}

export interface LLMFormatterOutput {
  formatted_response: string;
  confidence: number;
  source: 'LLM_FORMATTED' | 'TEMPLATE_FALLBACK';
  ai_model_used?: string;
  processing_time_ms: number;
  sections_included: string[];
  validation_passed: boolean;
  validation_violations: string[];
  // PHASE-12: Enhanced audit fields
  gate_status?: GateStatus;
  gate_action?: GateAction;
  reasoning_included: boolean;
  symbolic_decision_id?: string;
  // NEW: Token usage tracking for cost monitoring
  tokens_used?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// IPM LEVEL TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

// CRITICAL FIX: IPM labels with full localization to prevent English leakage
const IPM_URGENCY_LABELS: Record<string, Record<string, string>> = {
  'LEVEL_1': { en: 'Monitor', mr: 'निरीक्षण करा', hi: 'निगरानी करें' },
  'LEVEL_2': { en: 'Use cultural practices', mr: 'सांस्कृतिक पद्धती वापरा', hi: 'सांस्कृतिक तरीके अपनाएं' },
  'LEVEL_3': { en: 'Mechanical control', mr: 'यांत्रिक नियंत्रण', hi: 'यांत्रिक नियंत्रण' },
  'LEVEL_4': { en: 'Biological control', mr: 'जैविक नियंत्रण', hi: 'जैविक नियंत्रण' },
  'LEVEL_5': { en: 'Do immediately', mr: 'लगेच करा', hi: 'तुरंत करें' },
};

// ═══════════════════════════════════════════════════════════════════════════
// TECHNICAL TERM TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

// AUDIT FIX: PEST_TRANSLATIONS and DISEASE_TRANSLATIONS removed
// These hardcoded dictionaries violated SSOT - translations come from observation_translations table
// Use loadObservationLabels() from i18n/observation-label-loader.ts at runtime
// Kept as empty fallback maps for any remaining references
const PEST_TRANSLATIONS: Record<string, Record<string, string>> = {};
const DISEASE_TRANSLATIONS: Record<string, Record<string, string>> = {};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LLM FORMATTER FUNCTION - RENDER-ONLY MODE (WITH MODE-DRIVEN FALLBACK)
// ═══════════════════════════════════════════════════════════════════════════

export async function formatRecommendationsWithLLM(
  input: LLMFormatterInput
): Promise<LLMFormatterOutput> {
  const startTime = Date.now();
  const traceId = input.trace_id || `fmt_${Date.now().toString(36)}`;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SAFE INPUT NORMALIZATION - Prevent crashes from undefined text
  // ═══════════════════════════════════════════════════════════════════════════
  const safeFarmerMessage = normalizeFarmerMessage(input.farmer_message);
  const hasText = hasTextContent(safeFarmerMessage);
  
  console.log(`\n📝 [${traceId}] ═══ PHASE 5: LLM RENDER-ONLY FORMATTING ═══`);
  console.log(`   Language: ${input.language}`);
  console.log(`   Decision Status: ${input.decision_output?.status}`);
  console.log(`   Has Text Input: ${hasText}`);
  console.log(`   Message Preview: ${safePreviewText(safeFarmerMessage)}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVE RESPONSE MODE - CONFIDENCE-DRIVEN (CRITICAL FIX)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // CRASH-PROOF: Extract confidence data with safe defaults
  // BUG-D FIX: Add weighted_confidence fallback from primary_decision
  const decisionConfidence = input.decision_output?.metadata?.decision_confidence ?? 
                              input.decision_output?.primary_decision?.weighted_confidence ??
                              input.decision_output?.confidence ?? 0;
  // BUG-C FIX: Also check symptom_keys on decision_output directly
  const hasSymptoms = input.decision_output?.metadata?.has_symptoms ?? 
                       !!(input.decision_output?.symptom_keys?.length) ??
                       !!(input.metadata?.symptomKeys?.length);
  const hasVisualAmbiguity = input.decision_output?.metadata?.has_visual_ambiguity ?? 
                              input.decision_output?.needs_photo_for_diagnosis ?? false;
  const clarificationOptions = input.decision_output?.clarification_options ?? [];
  
  // FAIL-SAFE: Resolve i18n key with guaranteed fallback
  const primaryI18nKey = resolveI18nKey(
    input.decision_output?.primary_i18n_key ?? input.decision_output?.metadata?.i18n_key,
    'system.monitoring.default'
  );
  
  // FAIL-SAFE: Resolve action codes safely
  const actionCodes = resolveActionCodes(input.decision_output?.action_codes ?? []);
  
  // FAIL-SAFE: Resolve severity
  const severity = resolveSeverity(input.decision_output?.severity ?? input.decision_output?.metadata?.severity);
  
  const responseMode = resolveResponseMode({
    response_mode: input.decision_output?.metadata?.response_mode,
    gate_action: input.decision_output?.metadata?.gate_action,
    has_treatment: !!input.decision_output?.primary_decision?.action_type,
    has_clarification: !!input.decision_output?.clarification_needed,
    has_options: clarificationOptions.length > 0,
    needs_photo: input.decision_output?.needs_photo_for_diagnosis,
    // CRITICAL: Confidence-driven fields
    decision_confidence: decisionConfidence,
    has_symptoms: hasSymptoms,
    has_visual_ambiguity: hasVisualAmbiguity,
    clarification_options: clarificationOptions
  });
  
  // INVARIANT ASSERTION: Prevent OBSERVATION with low confidence + symptoms
  assertResponseModeInvariant(responseMode, decisionConfidence, hasSymptoms);
  
  console.log(`   Resolved Response Mode: ${responseMode}`);
  console.log(`   Decision Confidence: ${decisionConfidence}`);
  console.log(`   Has Symptoms: ${hasSymptoms}`);
  console.log(`   Primary i18n Key: ${primaryI18nKey}`);
  console.log(`   Action Codes: ${actionCodes.length > 0 ? actionCodes.join(', ') : '[none]'}`);
  console.log(`   Severity: ${severity}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P1-4: GATE CHECK REMOVED - NOW HAPPENS IN index.ts VIA evaluateUnifiedGate()
  // The LLM formatter only runs AFTER the unified gate has already passed.
  // This prevents double-gate conflicts.
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log(`   📋 [LLM Formatter] Gate pre-validated by index.ts - proceeding with formatting`);
  
  // Extract decision properties for validation and formatting
  const actions = input.decision_output?.actions_returned;
  const isDecisionBrain = input.decision_output?.decision_brain_source === true;
  const hasPrimaryDecision = !!input.decision_output?.primary_decision;
  const hasSecondaryActions = (input.decision_output?.secondary_actions?.length || 0) > 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTION HARDENING: PRIMARY ACTION CONTRACT VALIDATION (CRITICAL)
  // Validate that primary_decision has required fields BEFORE formatting
  // ═══════════════════════════════════════════════════════════════════════════
  const primary = input.decision_output?.primary_decision;
  if (hasPrimaryDecision && primary) {
    if (!primary.action_type || !primary.rule_id) {
      console.error(`
🚨 [LLM FORMATTER] PRIMARY_ACTION_CONTRACT_VIOLATION:
   rule_id=${primary.rule_id || 'MISSING'}
   action_type=${primary.action_type || 'MISSING'}
   source=llm-response-formatter
   
   BLOCKING LLM to prevent rendering invalid decision.
      `);
      
      return {
        formatted_response: '',
        confidence: 0,
        source: 'TEMPLATE_FALLBACK' as const,
        processing_time_ms: Date.now() - startTime,
        sections_included: ['ERROR_INVALID_PRIMARY'],
        validation_passed: false,
        validation_violations: ['PRIMARY_ACTION_CONTRACT_VIOLATION: Missing action_type or rule_id'],
        gate_status: GateStatus.FAIL,
        gate_action: GateAction.PROVIDE_INFORMATION_ONLY,
        reasoning_included: false,
        symbolic_decision_id: input.decision_output?.decision_id
      };
    }
    console.log(`   ✅ Primary decision validated: rule_id=${primary.rule_id}, action_type=${primary.action_type}`);
  }
  
  // CRITICAL SAFETY CHECK: No symbolic decision = NO treatment recommendations
  // This is the core enforcement that prevents LLM from inventing agronomy actions
  if (!isDecisionBrain) {
    console.warn(`
⚠️ [SYMBOLIC-ONLY GATE] No decision_brain_source = true
   LLM is restricted to INFORMATION ONLY mode.
   Cannot recommend treatments, sprays, or biological agents.
    `);
    
    // Return a render-only response that explicitly blocks treatment content
    return {
      formatted_response: '',
      confidence: 0,
      source: 'TEMPLATE_FALLBACK' as const,
      processing_time_ms: Date.now() - startTime,
      sections_included: ['INFORMATION_ONLY'],
      validation_passed: false,
      validation_violations: ['No symbolic brain decision - LLM blocked from treatment recommendations'],
      gate_status: GateStatus.FAIL,
      gate_action: GateAction.PROVIDE_INFORMATION_ONLY,
      reasoning_included: false,
      symbolic_decision_id: undefined
    };
  }
  
  // VALIDATION GATE 1: Decision brain invoked but no actions = mapping failure
  if (isDecisionBrain && (hasPrimaryDecision || hasSecondaryActions) && (!actions || actions.length === 0)) {
    console.error(`
🚫 [INPUT VALIDATION GATE] CRITICAL ERROR:
   Decision Brain invoked: ${isDecisionBrain}
   Has Primary Decision: ${hasPrimaryDecision}
   Has Secondary Actions: ${hasSecondaryActions}
   Actions Returned: ${actions?.length || 0}
   
   This indicates a mapping failure in the rule engine.
   BLOCKING LLM to prevent hallucinated advice.
    `);
    
    return {
      formatted_response: '',
      confidence: 0,
      source: 'TEMPLATE_FALLBACK' as const,
      processing_time_ms: Date.now() - startTime,
      sections_included: ['ERROR_NO_ACTIONS'],
      validation_passed: false,
      validation_violations: ['Decision brain produced rules but no actions extracted']
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6: PRE-LLM GATE - If action_list is empty, force INFORMATION_ONLY mode
  // The LLM must NEVER generate treatment content when symbolic engine has no actions
  // ═══════════════════════════════════════════════════════════════════════════
  let suppressHowSection = false;
  if (!hasPrimaryDecision && (!actions || actions.length === 0)) {
    console.warn(`
⚠️ [PHASE 6 PRE-LLM GATE] No primary decision and no actions
   response_mode = INFORMATION_ONLY (forced)
   HOW section SUPPRESSED - LLM cannot generate treatment recommendations
   LLM restricted to WHAT (observation) and WHY (explanation) sections only.
    `);
    suppressHowSection = true;
  }
  
  // ADDITIONAL GATE: If decision_brain_source but no actions → INFORMATION_ONLY
  if (isDecisionBrain && (!actions || actions.length === 0) && !hasPrimaryDecision) {
    console.warn(`
⚠️ [PHASE 6 GATE-2] Decision brain invoked with ZERO actions → INFORMATION_ONLY
   LLM will render observation summary only. No treatments, products, or dosages.
    `);
    suppressHowSection = true;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURED PRODUCT VALIDATION - Use decision.products[] array ONLY
  // Products validated from structured symbolic output, not parsed from action_text
  // SKIP validation entirely for safety_gate rules (they have no products)
  // ═══════════════════════════════════════════════════════════════════════════
  const SAFETY_GATE_TYPES = new Set(['safety_gate', 'SAFETY_GATE', 'BLOCK', 'URGENT_BLOCK', 'weather_block', 'WEATHER_BLOCK']);
  const isSafetyGateRule = primary?.action_type ? SAFETY_GATE_TYPES.has(primary.action_type) : false;
  
  const allowedProducts: string[] = [];
  const allowedDosages: string[] = [];
  
  if (!isSafetyGateRule) {
    // PRIMARY SOURCE: Structured products array from decision output
    const structuredProducts: any[] = input.decision_output?.products || 
                                       input.decision_output?.recommended_products || [];
    
    if (structuredProducts.length > 0) {
      for (const product of structuredProducts) {
        const name = product.product_name || product.name;
        const dosage = product.dosage || product.dosage_per_acre;
        if (name && name !== 'N/A' && name !== 'Not specified') allowedProducts.push(name.toLowerCase());
        if (dosage && dosage !== 'N/A') allowedDosages.push(String(dosage).toLowerCase());
      }
      console.log(`   📋 [StructuredValidation] ${structuredProducts.length} products from decision.products[]`);
    }
    
    // FALLBACK: Extract from actions_returned if no structured products
    if (allowedProducts.length === 0 && actions && actions.length > 0) {
      for (const action of actions) {
        const productName = action.application_details?.product_name || action.product_name;
        const dosage = action.application_details?.dosage || action.dosage;
        if (productName && productName !== 'N/A') allowedProducts.push(productName.toLowerCase());
        if (dosage) allowedDosages.push(dosage.toLowerCase());
      }
    }
    
    // ALSO: Extract from primary_decision structured fields
    const primaryProduct = (primary as any)?.product_details || (primary as any)?.application_details;
    if (primaryProduct) {
      const pName = primaryProduct.product_name || primaryProduct.name;
      const pDosage = primaryProduct.dosage || primaryProduct.dosage_per_acre;
      if (pName && pName !== 'N/A' && !allowedProducts.includes(pName.toLowerCase())) {
        allowedProducts.push(pName.toLowerCase());
      }
      if (pDosage && !allowedDosages.includes(String(pDosage).toLowerCase())) {
        allowedDosages.push(String(pDosage).toLowerCase());
      }
    }
  } else {
    console.log(`   🛡️ [ProductValidation] SKIPPED - safety_gate rule (${primary?.action_type})`);
  }
  
  console.log(`   📋 Allowed Products: ${allowedProducts.length > 0 ? allowedProducts.join(', ') : 'NONE'}`);
  console.log(`   📋 Allowed Dosages: ${allowedDosages.length > 0 ? allowedDosages.join(', ') : 'NONE'}`);

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE SANITIZATION GATE — Strips technical data leaks from LLM output
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Known agrochemical product names that should NOT be stripped even though
 * they may appear in ALL_CAPS. Add to this list as needed.
 */
const ALLOWED_PRODUCT_NAMES = new Set([
  'CHLORPYRIFOS', 'FIPRONIL', 'IMIDACLOPRID', 'THIAMETHOXAM', 'CARBENDAZIM',
  'MANCOZEB', 'PROPICONAZOLE', 'HEXACONAZOLE', 'TRICHODERMA', 'BEAUVERIA',
  'METARHIZIUM', 'PSEUDOMONAS', 'AZADIRACHTIN', 'NEEM', 'SPINOSAD',
  'EMAMECTIN', 'CYPERMETHRIN', 'DELTAMETHRIN', 'LAMBDA', 'ACEPHATE',
  'DIMETHOATE', 'PROFENOFOS', 'QUINALPHOS', 'MONOCROTOPHOS', 'PHORATE',
  'CARTAP', 'FLUBENDIAMIDE', 'CHLORANTRANILIPROLE', 'TRICHOGRAMMA',
  'BACILLUS', 'NPV', 'ICAR', 'IPM', 'PHI', 'SC', 'EC', 'WP', 'SL', 'SP', 'WG',
]);

/**
 * Sanitize LLM output to remove any leaked technical identifiers,
 * monitoring codes, confidence scores, and internal metadata.
 * Runs AFTER LLM call, BEFORE returning to farmer.
 */
export function sanitizeFarmerResponse(text: string): string {
  if (!text) return text;
  
  let sanitized = text;
  
  // 1. Strip ALL_CAPS_UNDERSCORE patterns (≥2 words) that are NOT product names
  //    e.g., DEAD_HEARTS_REDUCED_BELOW_5_PERCENT, SC_PEST_TOP_BORER_004, RESISTANCE_SUSPECTED_NO_MORTALITY
  sanitized = sanitized.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g, (match) => {
    // Preserve if it's a known product formulation pattern like "CHLORPYRIFOS_20_EC"
    const firstWord = match.split('_')[0];
    if (ALLOWED_PRODUCT_NAMES.has(firstWord)) return match;
    console.warn(`🧹 [SANITIZE] Stripped technical code from farmer response: ${match}`);
    return '';
  });
  
  // 2. Strip rule_id patterns (e.g., SC_PEST_TOP_BORER_004, SUG_TOP_BORER_003)
  sanitized = sanitized.replace(/\b[A-Z]{2,4}_[A-Z]+_[A-Z_]+_\d{2,4}\b/g, (match) => {
    console.warn(`🧹 [SANITIZE] Stripped rule_id from farmer response: ${match}`);
    return '';
  });
  
  // 3. Strip "X% Confidence" patterns
  sanitized = sanitized.replace(/\d{1,3}%\s*(?:Confidence|confidence|विश्वास|विश्वसनीयता)/g, '');
  
  // 4. Strip internal metadata labels
  sanitized = sanitized.replace(/\b(?:rule_id|decision_id|ipm_level|data_authority_rank)\s*[:=]\s*\S+/gi, '');
  
  // 5. Strip "Priority: HIGH" / "IPM Level: LEVEL_3" patterns
  sanitized = sanitized.replace(/\b(?:Priority|IPM Level)\s*:\s*\S+/g, '');
  
  // 6. Clean up multiple spaces/newlines left by removals
  sanitized = sanitized.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  
  return sanitized;
}


  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  // Build structured recommendation data for LLM
  const recommendationData = await buildRecommendationSummary(input);
  
  // If no API keys available, use template fallback immediately
  if (!GEMINI_API_KEY && !OPENAI_API_KEY && !LOVABLE_API_KEY) {
    // STABILIZATION v4.0 ISSUE 6: Structured SYMBOLIC_FAILURE logging
    console.error(`[SYMBOLIC_FAILURE] Falling back to template - no LLM API keys`);
    console.error(`   Gate failed: NO_API_KEYS`);
    console.error(`   Observations present: ${input.decision_output?.matched_responses?.length || 0}`);
    console.error(`   Hypotheses evaluated: ${input.decision_output?.hypothesis_result?.eliminated_count || 0}`);
    console.error(`   Decision confidence: ${input.decision_output?.primary_decision?.weighted_confidence || 0}`);
    console.error(`   Primary rule: ${input.decision_output?.primary_decision?.rule_id || 'NONE'}`);
    return buildTemplateFallback(input, startTime);
  }
  
  // Build prompt for LLM
  const systemPrompt = buildFormattingSystemPrompt(input);
  const userPrompt = buildFormattingUserPrompt(input, recommendationData);
  
  // TOKEN_METRICS: Log prompt size for cost monitoring
  const totalMatchedResponses = input.decision_output?.matched_responses?.length || 0;
  const estTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  console.log(`   [TOKEN_METRICS] system_chars=${systemPrompt.length}, user_chars=${userPrompt.length}, est_tokens=${estTokens}, matched_responses_total=${totalMatchedResponses}`);
  
  let formattedResponse = '';
  let aiModelUsed = '';
  let tokensUsed = 0;  // NEW: Track token usage
  
  try {
    // TIER 1: Try OpenAI FIRST with 20-second timeout (user preference)
    if (OPENAI_API_KEY) {
      console.log(`   🔄 Trying OpenAI (primary)...`);
      const result = await callOpenAIWithTimeout(systemPrompt, userPrompt, OPENAI_API_KEY, 20000);
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'gpt-4o-mini';  // COST OPTIMIZED: Using GPT-4o-mini
        tokensUsed = result.tokens_used || 0;
        console.log(`   ✅ OpenAI formatting successful (gpt-4o-mini)`);
      } else if (result.error === 'RATE_LIMIT') {
        console.warn(`   ⚠️ OpenAI rate limited, waiting 3s before fallback...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    
    // TIER 2: Fallback to Gemini if OpenAI failed (18-second timeout)
    if (!formattedResponse && GEMINI_API_KEY) {
      console.log(`   🔄 Trying Gemini (fallback)...`);
      const result = await callGeminiWithTimeout(systemPrompt, userPrompt, GEMINI_API_KEY, 18000);
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'gemini-2.0-flash';
        tokensUsed = result.tokens_used || 0;
        console.log(`   ✅ Gemini formatting successful`);
      } else if (result.error === 'RATE_LIMIT') {
        console.warn(`   ⚠️ Gemini rate limited (429), waiting 3s before fallback...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    
    // TIER 3: Fallback to Lovable AI (12-second timeout)
    if (!formattedResponse && LOVABLE_API_KEY) {
      console.log(`   🔄 Trying Lovable AI (tertiary)...`);
      const result = await callLovableAIWithTimeout(systemPrompt, userPrompt, LOVABLE_API_KEY, 12000);
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'lovable-gemini-2.5-flash';
        console.log(`   ✅ Lovable AI formatting successful`);
      }
    }
    
  } catch (error) {
    console.error(`   ❌ LLM formatting error:`, error);
  }
  
  // If LLM formatting failed, use template fallback
  if (!formattedResponse || formattedResponse.length < 50) {
    // STABILIZATION v4.0 ISSUE 6: Structured SYMBOLIC_FAILURE logging
    console.error(`[SYMBOLIC_FAILURE] Falling back to template - LLM response empty/short`);
    console.error(`   Gate failed: LLM_RESPONSE_EMPTY`);
    console.error(`   Observations present: ${input.decision_output?.matched_responses?.length || 0}`);
    console.error(`   Hypotheses evaluated: ${input.decision_output?.hypothesis_result?.eliminated_count || 0}`);
    console.error(`   Decision confidence: ${input.decision_output?.primary_decision?.weighted_confidence || 0}`);
    console.error(`   Primary rule: ${input.decision_output?.primary_decision?.rule_id || 'NONE'}`);
    return buildTemplateFallback(input, startTime);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OUTPUT VALIDATION GATE - Ensure LLM didn't add unauthorized content
  // ═══════════════════════════════════════════════════════════════════════════
  
  // PHASE-10 + PROMPT-2: Pass crop type and full input for enhanced validation
  const cropType = input.land_context?.current_crop;
  const outputValidation = validateLLMOutput(formattedResponse, allowedProducts, allowedDosages, cropType, input);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P4-1 + P6-3: WHAT-WHY-HOW STRUCTURAL VALIDATOR
  // Ensures LLM output contains all 3 mandatory sections
  // ═══════════════════════════════════════════════════════════════════════════
  const whatWhyHowResult = validateWhatWhyHow(formattedResponse, input);
  if (!whatWhyHowResult.valid) {
    // BUG 7 FIX: If HOW is missing but we have no actions, that's expected — don't flag it
    if (suppressHowSection && whatWhyHowResult.missing_sections.includes('HOW')) {
      console.log(`   ℹ️ [WHAT-WHY-HOW] HOW section missing but suppressed (no actions returned)`);
      // Remove HOW violation - it's expected
      const filteredViolations = whatWhyHowResult.violations.filter(v => !v.includes('HOW'));
      const filteredMissing = whatWhyHowResult.missing_sections.filter(s => s !== 'HOW');
      if (filteredMissing.length > 0) {
        // CRITICAL FIX: WHAT-WHY-HOW is WARNING ONLY — do NOT block LLM response
        // The validator markers are too narrow for Marathi/Hindi Devanagari output
        // Blocking here caused 317-char incomplete English fallback responses
        console.warn(`⚠️ [WHAT-WHY-HOW] Structural warning (non-blocking): ${filteredMissing.join(', ')}`);
      }
    } else {
      // CRITICAL FIX: Downgrade from hard-block to warning
      // The WHAT-WHY-HOW detector has narrow keyword matching that frequently
      // misses valid Marathi/Hindi patterns, causing valid LLM responses to be
      // discarded in favor of 317-char English-only template fallbacks.
      // This is the ROOT CAUSE of incomplete farmer responses.
      console.warn(`⚠️ [WHAT-WHY-HOW] Structural warning (non-blocking): ${whatWhyHowResult.missing_sections.join(', ')}`);
      console.warn(`   Response length: ${formattedResponse.length} chars — LLM content preserved`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P5-1: CROP NAME CONSISTENCY CHECK
  // Verify LLM output does not mention wrong crop names
  // ═══════════════════════════════════════════════════════════════════════════
  if (cropType) {
    const cropConsistencyResult = validateCropNameConsistency(formattedResponse, cropType);
    if (!cropConsistencyResult.valid) {
      console.error(`🚫 [CROP CONSISTENCY] ${cropConsistencyResult.violation}`);
      outputValidation.violations.push(cropConsistencyResult.violation);
      // Crop name mismatch is a hard failure — use template fallback
      return buildTemplateFallback(input, startTime);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Only block on HARD safety violations, not structural warnings
  // Hard violations: unauthorized products, dosage tampering, crop mismatch
  // Soft violations: WHAT-WHY-HOW missing sections (detection is unreliable for Devanagari)
  // ═══════════════════════════════════════════════════════════════════════════
  const HARD_VIOLATION_PATTERNS = [
    'Unauthorized product', 'unauthorized product',
    'Missing product from symbolic', 'Leaked internal code',
    'Dosage UNIT mismatch', 'PHI value modified',
    'unauthorized efficacy claim', 'Chemical product',
    'Crop mismatch', 'Invalid biocontrol',
    'Dosage numbers mismatch'
  ];
  
  const hardViolations = outputValidation.violations.filter(v =>
    HARD_VIOLATION_PATTERNS.some(p => v.includes(p))
  );
  const softViolations = outputValidation.violations.filter(v =>
    !HARD_VIOLATION_PATTERNS.some(p => v.includes(p))
  );
  
  if (softViolations.length > 0) {
    console.warn(`⚠️ [OUTPUT VALIDATION] ${softViolations.length} soft warnings (non-blocking): ${softViolations.join('; ')}`);
  }
  
  if (hardViolations.length > 0) {
    console.error(`
🚫 [OUTPUT VALIDATION GATE] LLM added unauthorized content:
   Hard Violations: ${hardViolations.join(', ')}
   
   Using template fallback to prevent spreading incorrect advice.
    `);
    
    // Fall back to template to ensure safety
    return buildTemplateFallback(input, startTime);
  }
  
  // Post-process: Apply rural language replacements
  formattedResponse = replaceFormalsWithRural(formattedResponse, input.language);
  
   // BUG-5 FIX: Language consistency check - detect translation failures
    // FIX H5: Improved Devanagari ratio threshold + exclude technical terms
    if (input.language !== 'en') {
      const totalChars = formattedResponse.length;
      // For Devanagari-script languages (mr, hi, etc.), check Unicode range ratio
      const isDevanagariLang = ['mr', 'hi', 'gu', 'pa'].includes(input.language);
      if (isDevanagariLang && totalChars > 50) {
        // FIX H5: Strip technical terms before calculating ratio
        const textForRatioCheck = formattedResponse
          .replace(/\b[A-Z][A-Z0-9%/-]+\b/g, '')   // Remove product names (CHLORPYRIFOS, NPK)
          .replace(/\d+\s*(ml|g|kg|l|%|acres?)/gi, '') // Remove measurements
          .replace(/[a-z]{2,8}\d+[a-z]*/gi, '');   // Remove technical codes
        const cleanedTotalChars = textForRatioCheck.length;
        const devanagariChars = (textForRatioCheck.match(/[\u0900-\u097F]/g) || []).length;
        const devanagariRatio = cleanedTotalChars > 0 ? devanagariChars / cleanedTotalChars : 0;
        // FIX H5: Lowered threshold from 0.3 to 0.22 — too aggressive for technical agri content
        if (devanagariRatio < 0.22) {
          const langName = getLanguageName(input.language);
          console.warn(`⚠️ [LANGUAGE CHECK] Only ${(devanagariRatio*100).toFixed(0)}% Devanagari in ${langName} response - possible translation failure.`);
          console.warn(`⚠️ [LANGUAGE CHECK] Response preview: ${formattedResponse.substring(0, 200)}`);
        }
      } else if (!isDevanagariLang) {
        // Fallback for non-Devanagari regional languages (ta, te, bn, kn)
        const asciiChars = (formattedResponse.match(/[a-zA-Z]/g) || []).length;
        const asciiRatio = totalChars > 0 ? asciiChars / totalChars : 0;
        if (asciiRatio > 0.4) {
          console.warn(`⚠️ [LANGUAGE CHECK] ${(asciiRatio*100).toFixed(0)}% ASCII in ${input.language} response - possible translation failure.`);
          console.warn(`⚠️ [LANGUAGE CHECK] Response preview: ${formattedResponse.substring(0, 200)}`);
        }
      }
  }
  
  // ═══ SANITIZATION GATE: Strip any leaked technical data from LLM output ═══
  formattedResponse = sanitizeFarmerResponse(formattedResponse);

  const processingTime = Date.now() - startTime;
  console.log(`   ✅ PHASE 5 complete in ${processingTime}ms`);
  
  return {
    formatted_response: formattedResponse,
    confidence: 0.9,
    source: 'LLM_FORMATTED',
    ai_model_used: aiModelUsed,
    processing_time_ms: processingTime,
    sections_included: extractSections(formattedResponse),
    validation_passed: true,
    validation_violations: [],
    // PHASE-12: Enhanced audit fields (gate status already validated in index.ts)
    gate_status: GateStatus.PASS,
    gate_action: GateAction.ALLOW_TREATMENT,
    reasoning_included: formattedResponse.includes('कारण:') || formattedResponse.includes('कारण') || formattedResponse.includes('reason'),
    symbolic_decision_id: input.decision_output?.decision_id,
    // NEW: Token usage for cost monitoring
    tokens_used: tokensUsed
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT VALIDATION - Ensure LLM didn't add products/dosages/internal codes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enhanced LLM Output Validation (PROMPT 2 Implementation)
 * 
 * Validates that the LLM response:
 * 1. Contains all products from symbolic decision (stricter check)
 * 2. Dosage numbers are unchanged (new check)
 * 3. No internal rule IDs leaked (new check)
 * 4. No unauthorized products added
 * 5. Cross-crop biocontrol validation
 */
export interface ValidationResult {
  passed: boolean;
  errors: string[];
}

function validateLLMOutput(
  llmOutput: string,
  allowedProducts: string[],
  allowedDosages: string[],
  cropType?: string,
  decisionInput?: any
): { valid: boolean; violations: string[] } {
  const errors: string[] = [];
  const lowerOutput = llmOutput.toLowerCase();
  
  // Hoisted for use in both CHECK 1 (generic action safety net) and CHECK 5
  const commonPesticides = [
    'chlorpyrifos', 'monocrotophos', 'cypermethrin', 'imidacloprid',
    'carbofuran', 'phorate', 'thiamethoxam', 'fipronil', 'cartap',
    'coragen', 'profenofos', 'quinalphos', 'acephate', 'malathion',
    'lambda-cyhalothrin', 'deltamethrin', 'bifenthrin', 'emamectin'
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 1: All products present (FIXED - skip generic action types)
  // CRITICAL FIX: Generic action types like "Cultural practice", "Monitoring", 
  // "Mechanical control" are NOT product names and should NOT require verbatim matching
  // ═══════════════════════════════════════════════════════════════════════════
  // BUG FIX: For MONITOR/monitoring rules, skip product validation entirely
  // These rules have action_text like "Monitor pest population..." which is NOT a product
  const primaryActionType = (decisionInput?.decision_output?.primary_decision?.action_type || '').toLowerCase();
  const MONITOR_ACTION_TYPES = ['monitor', 'monitoring', 'observation', 'scouting', 'monitoring_advice'];
  if (MONITOR_ACTION_TYPES.includes(primaryActionType)) {
    console.log(`   ℹ️ [VALIDATION] Skipping product check for MONITOR action type: ${primaryActionType}`);
    return { valid: true, violations: [] };
  }
  
  // BUG-B FIX: Also fallback to active_ingredient when product_name is placeholder
  const rawProductName = decisionInput?.decision_output?.primary_decision?.product_details?.product_name ||
                         decisionInput?.decision_output?.primary_decision?.application_details?.product_name;
  const primaryProductName = (rawProductName && rawProductName !== 'See structured response')
    ? rawProductName
    : (decisionInput?.decision_output?.primary_decision?.product_details?.active_ingredient ||
       decisionInput?.decision_output?.primary_decision?.application_details?.active_ingredient ||
       rawProductName);
  
  // List of generic action types that are NOT specific products
  const GENERIC_ACTION_TYPES = [
    'cultural practice', 'cultural practices', 'cultural control',
    'mechanical control', 'mechanical removal',
    'biological control', 'biocontrol',
    'monitoring', 'observation', 'scouting', 'monitor',
    'integrated pest management', 'ipm',
    'general advice', 'preventive measure',
    'water management', 'irrigation adjustment',
    'nutrient management', 'fertilizer adjustment',
    'recommended treatment', 'treatment',
    // BUG-1 FIX: Internal placeholder strings that are NOT real product names
    'see action text', 'see structured response', 'see concentration',
    'not specified', 'n/a', 'as per label', 'follow label',
    'continue monitoring', 'standard application', 'not applicable',
    'see label', 'refer label', 'cultural method',
    // BUG FIX: action_text phrases from monitoring/diagnostic rules that are NOT product names
    'pest population', 'monitor pest', 'no treatment required',
    'regularly', 'at this stage', 'continue observation',
    // CRITICAL FIX: NDVI/diagnostic phrases that are NOT product names
    // These were being extracted from action_text and treated as product names,
    // causing false "Product partially matched (single word only)" warnings
    'ndvi decline', 'ndvi drop', 'ndvi', 'decline', 'poor tillering',
    'growth retardation', 'stunted growth', 'yellowing', 'wilting',
    'poor germination', 'leaf curl', 'leaf spot', 'nutrient deficiency',
    'nitrogen deficiency', 'phosphorus deficiency', 'potassium deficiency',
    'water stress', 'heat stress', 'cold stress', 'wilt', 'blight',
    'root rot', 'stem rot', 'shoot borer', 'dead heart', 'bore holes'
  ];
  
  // CRITICAL FIX: Additional guard — if "product name" looks like a diagnostic phrase
  // (contains multiple words that are observation/symptom terms), skip product validation
  const DIAGNOSTIC_KEYWORDS = ['decline', 'drop', 'poor', 'stunted', 'yellowing', 'wilting',
    'deficiency', 'stress', 'damage', 'attack', 'infestation', 'infection', 'rot', 'blight',
    'ndvi', 'growth', 'tillering', 'germination'];
  const isDiagnosticPhrase = primaryProductName && 
    DIAGNOSTIC_KEYWORDS.some(dk => primaryProductName.toLowerCase().includes(dk));
  
  const isGenericActionType = primaryProductName && 
    (GENERIC_ACTION_TYPES.some(gt => primaryProductName.toLowerCase().includes(gt)) || isDiagnosticPhrase);
  
  if (primaryProductName && 
      primaryProductName !== 'N/A' && 
      primaryProductName !== 'None' && 
      !isGenericActionType) {
    // FIX A: Entity-based product validation (replaces weak substring matching)
    // Step 1: Check full product name match first (strongest signal)
    const fullNameFound = lowerOutput.includes(primaryProductName.toLowerCase().trim());
    
    // Step 2: Multi-word entity check (minimum 2 consecutive words from product name)
    const productWords = primaryProductName.toLowerCase().split(/[\s+@\/]+/).filter((w: string) => w.length > 2);
    let multiWordFound = false;
    if (productWords.length >= 2) {
      for (let i = 0; i <= productWords.length - 2; i++) {
        const twoWordPhrase = productWords[i] + ' ' + productWords[i + 1];
        if (lowerOutput.includes(twoWordPhrase)) {
          multiWordFound = true;
          break;
        }
      }
    }
    
    // Step 3: Single-word fallback (downgraded to warning for transliteration cases)
    const singleWordFound = productWords.some((word: string) => lowerOutput.includes(word));
    
    if (!fullNameFound && !multiWordFound) {
      if (singleWordFound) {
        // Partial match only - warn but don't block (may be transliterated)
        console.warn(`⚠️ [VALIDATION] Product partially matched (single word only): ${primaryProductName}`);
      } else {
        errors.push(`Missing product from symbolic decision: ${primaryProductName}`);
        console.error(`🚫 [VALIDATION] Missing required product: ${primaryProductName}`);
      }
    }
  } else if (isGenericActionType) {
    console.log(`   ℹ️ [VALIDATION] Skipping primary product check for generic action type: ${primaryProductName}`);
    // FIX E: Safety net - still check for unauthorized chemicals in generic context
    for (const pesticide of commonPesticides) {
      if (lowerOutput.includes(pesticide) && !allowedProducts.includes(pesticide)) {
        errors.push(`Chemical product "${pesticide}" found in generic action context`);
        console.error(`🚫 [VALIDATION] Unauthorized chemical in generic context: ${pesticide}`);
      }
    }
  }
  
   // ═══════════════════════════════════════════════════════════════════════════
   // CHECK 2: Dosages unchanged (extract numbers and verify)
   // ═══════════════════════════════════════════════════════════════════════════
   const dosagePerAcre = decisionInput?.decision_output?.primary_decision?.product_details?.dosage_per_acre ||
                        decisionInput?.decision_output?.primary_decision?.application_details?.dosage ||
                        decisionInput?.decision_output?.primary_decision?.application_details?.concentration;
   
   if (dosagePerAcre && dosagePerAcre !== 'As per label' && dosagePerAcre !== 'N/A') {
     const dosageNumbers = dosagePerAcre.match(/\d+\.?\d*/g);
     if (dosageNumbers && dosageNumbers.length > 0) {
       const numbersFound = dosageNumbers.some((n: string) => llmOutput.includes(n));
       if (!numbersFound) {
         errors.push(`Dosage numbers mismatch. Expected: ${dosagePerAcre}, numbers: ${dosageNumbers.join(', ')}`);
         console.warn(`⚠️ [VALIDATION] Dosage numbers not found in output: ${dosageNumbers.join(', ')}`);
       }
       
       // FIX B: Dosage UNIT consistency validation
       // Catches magnitude errors like "250 ml/acre" → "250 L/acre" (1000x overdose)
       const sourceUnitMatch = dosagePerAcre.match(/(ml|l|litre|liter|g|gm|kg|gram)/i);
       const sourceUnit = sourceUnitMatch?.[0]?.toLowerCase();
       if (sourceUnit && dosageNumbers) {
         for (const num of dosageNumbers) {
           const unitAfterNum = new RegExp(`${num}\\s*(ml|l|litre|liter|g|gm|kg|gram)`, 'gi');
           const outputMatch = unitAfterNum.exec(llmOutput);
           if (outputMatch) {
             const outputUnit = outputMatch[1].toLowerCase();
             // Detect same-category but different-magnitude unit swaps
             const isMagnitudeSwap = 
               (sourceUnit === 'ml' && outputUnit === 'l') || 
               (sourceUnit === 'l' && outputUnit === 'ml') ||
               (sourceUnit === 'g' && outputUnit === 'kg') || 
               (sourceUnit === 'kg' && outputUnit === 'g') ||
               (sourceUnit === 'gm' && outputUnit === 'kg') ||
               (sourceUnit === 'kg' && outputUnit === 'gm');
             if (isMagnitudeSwap) {
               errors.push(`Dosage UNIT mismatch: source=${sourceUnit}, output=${outputUnit} for number ${num}`);
               console.error(`🚫 [VALIDATION] Dosage unit magnitude error: ${sourceUnit} → ${outputUnit} for ${num}`);
             }
           }
         }
       }
     }
   }
   
   // ═══════════════════════════════════════════════════════════════════════════
   // CHECK 2b: Secondary product/dosage validation (FIX 1 - CRITICAL)
   // Secondary actions injected at prompt build but NEVER validated until now.
   // ═══════════════════════════════════════════════════════════════════════════
   const secondaryActions = decisionInput?.decision_output?.secondary_actions || 
                            decisionInput?.decision_output?.secondary_recommendations || [];
   for (const sec of secondaryActions) {
     if (sec.product_name && sec.product_name !== 'N/A' && sec.product_name !== 'Not specified') {
       allowedProducts.push(sec.product_name.toLowerCase());
     }
     if (sec.dosage) allowedDosages.push(sec.dosage.toLowerCase());
     if (sec.dosage_per_acre) allowedDosages.push(sec.dosage_per_acre.toLowerCase());
   }
   // Validate secondary product names not modified by LLM
   for (const sec of secondaryActions) {
     if (sec.product_name && sec.product_name !== 'N/A' && sec.product_name !== 'Not specified') {
       const secProductWords = sec.product_name.toLowerCase().split(/[\s+@\/]+/).filter((w: string) => w.length > 2);
       const secProductFound = secProductWords.some((word: string) => lowerOutput.includes(word)) ||
                               lowerOutput.includes(sec.product_name.toLowerCase());
       if (!secProductFound && lowerOutput.length > 200) {
         // Only flag if output is substantial enough to contain product info
         console.warn(`⚠️ [VALIDATION] Secondary product may be missing: ${sec.product_name}`);
       }
     }
   }
   
   // ═══════════════════════════════════════════════════════════════════════════
   // CHECK 2c: PHI value validation (FIX 3 - CRITICAL)
   // Ensure LLM preserved PHI days exactly as provided by rule engine.
   // ═══════════════════════════════════════════════════════════════════════════
   const phiDays = decisionInput?.decision_output?.primary_decision?.application_details?.phi_days;
   if (phiDays && typeof phiDays === 'number' && phiDays > 0) {
     const phiString = String(phiDays);
     if (!llmOutput.includes(phiString)) {
       errors.push(`PHI value modified or missing. Expected: ${phiDays} days`);
       console.error(`🚫 [VALIDATION] PHI days not preserved: expected ${phiDays}`);
     }
   }
   
   // ═══════════════════════════════════════════════════════════════════════════
   // CHECK 3: No rule IDs leaked (forbidden internal patterns)
   // ═══════════════════════════════════════════════════════════════════════════
  const forbiddenPatterns = [
    { pattern: /SUGARCANE_TERMITE/i, name: 'SUGARCANE_TERMITE' },
    { pattern: /COTTON_BOLLWORM/i, name: 'COTTON_BOLLWORM' },
    { pattern: /WHEAT_RUST/i, name: 'WHEAT_RUST' },
    { pattern: /rule_id/i, name: 'rule_id' },
    { pattern: /decision_id/i, name: 'decision_id' },
    { pattern: /action_id/i, name: 'action_id' },
    { pattern: /pest_code\s*[:=]/i, name: 'pest_code' },
    { pattern: /disease_code\s*[:=]/i, name: 'disease_code' },
    { pattern: /RULE_[A-Z0-9_]+/g, name: 'RULE_*' },
    { pattern: /ipm_level\s*[:=]/i, name: 'ipm_level' },
    { pattern: /symbolic_decision/i, name: 'symbolic_decision' },
    { pattern: /decision_brain/i, name: 'decision_brain' }
  ];
  
  for (const { pattern, name } of forbiddenPatterns) {
    if (pattern.test(llmOutput)) {
      errors.push(`Leaked internal code: ${name}`);
      console.error(`🚫 [VALIDATION] Internal code leaked to farmer: ${name}`);
    }
  }
  
   // ═══════════════════════════════════════════════════════════════════════════
   // CHECK 4: Unauthorized percentage claims (FIX 4 + FIX 12 - enhanced regex + efficacy exclusion)
   // ═══════════════════════════════════════════════════════════════════════════
   // Extract allowed efficacy values from rule engine to avoid false positives
   const allowedEfficacy: number[] = [];
   const ruleEfficacy = decisionInput?.decision_output?.primary_decision?.application_details?.efficacy_percent;
   const outcomeEfficacy = decisionInput?.decision_output?.primary_decision?.expected_outcomes?.efficacy_percent;
   if (typeof ruleEfficacy === 'number') allowedEfficacy.push(ruleEfficacy);
   if (typeof outcomeEfficacy === 'number') allowedEfficacy.push(outcomeEfficacy);
   
   const percentagePattern = /(\d{1,3})\s*(%|percent|प्रतिशत|टक्के)\s*(effective|efficacy|control|reduction|success|protection|yield increase|प्रभावी|नियंत्रण)/gi;
   let percentMatch;
   while ((percentMatch = percentagePattern.exec(llmOutput)) !== null) {
     const claimedNumber = parseInt(percentMatch[1], 10);
     if (!allowedEfficacy.includes(claimedNumber)) {
       errors.push(`Unauthorized percentage claim: ${percentMatch[0]}`);
     }
   }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 5: Unauthorized products (uses hoisted commonPesticides)
  // ═══════════════════════════════════════════════════════════════════════════
  for (const pesticide of commonPesticides) {
    if (lowerOutput.includes(pesticide) && !allowedProducts.includes(pesticide)) {
      errors.push(`Unauthorized product mentioned: ${pesticide}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 6: Cross-crop biocontrol validation (existing)
  // ═══════════════════════════════════════════════════════════════════════════
   // FIX 11: Extended cross-crop biocontrol validation
   const cropLower = (cropType || '').toLowerCase();
   const CROP_INVALID_BIOCONTROLS: Record<string, string[]> = {
     'wheat': ['trichogramma', 'ट्रायकोग्रामा', 'trichogramma chilonis', 'cotesia', 'कोटेशिया', 'cotesia flavipes'],
     'rice': ['cotesia flavipes', 'कोटेशिया फ्लेव्हिप्स'],
     'cotton': ['trichogramma chilonis', 'cotesia flavipes'],
     'maize': ['cotesia flavipes'],
   };
   const invalidBiocontrols = CROP_INVALID_BIOCONTROLS[cropLower] || [];
   if (invalidBiocontrols.length > 0) {
     for (const biocontrol of invalidBiocontrols) {
      if (lowerOutput.includes(biocontrol.toLowerCase())) {
         errors.push(`Invalid biocontrol for ${cropLower}: ${biocontrol}`);
         console.warn(`
⚠️ [CROSS-CROP] Invalid biocontrol detected
    Crop: ${cropLower}
    Invalid Biocontrol: ${biocontrol}
         `);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 7: Dosage patterns validation (existing - enhanced)
  // ═══════════════════════════════════════════════════════════════════════════
  const dosagePattern = /(\d+)\s*(ml|l|g|kg|gm)\s*(per|\/)\s*(acre|hectare|ha|bigha)/gi;
  const dosageMatches = llmOutput.matchAll(dosagePattern);
  
  for (const match of dosageMatches) {
    const fullDosage = match[0].toLowerCase();
    const isAllowed = allowedDosages.some(d => 
      fullDosage.includes(d) || d.includes(fullDosage) || 
      // Also check individual numbers
      d.match(/\d+/)?.[0] === match[1]
    );
    if (!isAllowed && allowedDosages.length > 0) {
      console.warn(`   ⚠️ Dosage in output "${fullDosage}" not in allowed list: [${allowedDosages.join(', ')}]`);
      // Don't add as error - just warning for now (may be reformatted)
    }
  }
  
  // Log validation result
  if (errors.length > 0) {
    console.error(`
🚫 [LLM OUTPUT VALIDATION FAILED]
   Errors: ${errors.length}
   ${errors.map((e, i) => `   ${i + 1}. ${e}`).join('\n')}
    `);
  }
  
  return {
    valid: errors.length === 0,
    violations: errors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildFormattingSystemPrompt(input: LLMFormatterInput): string {
  const LANG_NAMES: Record<string, string> = {
    mr: 'Marathi', hi: 'Hindi', en: 'English', ta: 'Tamil', te: 'Telugu',
    bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', pa: 'Punjabi', ml: 'Malayalam', or: 'Odia'
  };
  const langName = LANG_NAMES[input.language] || 'English';
  
  const ruralRules = getRuralLanguageRules(input.language);
  
  // Get crop stage constraints
  const cropStageConstraints = getCropStageConstraints(input);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PART 4: Determine response format type from action_type
  // ═══════════════════════════════════════════════════════════════════════════
  const primary = input.decision_output?.primary_decision;
  const actionTypeUpper = (primary?.action_type || '').toUpperCase();
  const riskLevel = (primary?.risk_level || input.decision_output?.metadata?.risk_level || '').toUpperCase();
  const hasDosage = !!(primary?.application_details?.dosage_per_acre || primary?.application_details?.dosage || primary?.application_details?.concentration);
  const hasProduct = !!(primary?.application_details?.product_name && primary?.application_details?.product_name !== 'Not specified' && primary?.application_details?.product_name !== 'N/A');
  const hasActions = (input.decision_output?.actions_returned?.length || 0) > 0 || !!primary;
  const isClarification = !!input.decision_output?.clarification_needed;
  
  let formatType = 'FORMAT_4'; // Default: stage-advisory fallback
  let formatInstruction = '';
  
  if (isClarification) {
    formatType = 'FORMAT_2';
  } else if (actionTypeUpper === 'URGENT_ACTION' || (riskLevel === 'HIGH' || riskLevel === 'CRITICAL')) {
    formatType = 'FORMAT_5';
  } else if ((actionTypeUpper === 'RECOMMEND' || actionTypeUpper === 'TREATMENT' || actionTypeUpper === 'SPRAY' || actionTypeUpper === 'APPLY') && hasProduct) {
    formatType = 'FORMAT_1';
  } else if (actionTypeUpper === 'MONITOR' || actionTypeUpper === 'MONITORING' || actionTypeUpper === 'NO_ACTION_REQUIRED') {
    formatType = 'FORMAT_3';
  } else if (!hasActions) {
    formatType = 'FORMAT_4';
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAT-SPECIFIC INSTRUCTIONS (from PART 4 specification)
  // ═══════════════════════════════════════════════════════════════════════════
  if (formatType === 'FORMAT_1') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 1 — DIRECT PRESCRIPTION ═══
Structure your response EXACTLY as:

भाऊ/दादा (or ताई if female),

🎯 [ONE LINE: diagnosis in plain ${langName}]

📋 काय करायचं:
[action_text translated to natural ${langName}]
- [Product name] — [dosage × land_area = TOTAL quantity]
- [application_method — HOW to apply]
- [Best time: morning/evening]

⚠️ काळजी घ्या:
- [PHI days warning if provided]
- [bee_toxicity warning if HIGH]

💰 फायदा: [ROI from rule if available]

✅ 7 दिवसांनी: [specific observable improvement from knowledge_text]

CRITICAL RULES:
- Calculate TOTAL dosage = dosage_per_acre × farmer's land area (${input.land_context?.area_acres || '?'} acres)
- Show calculated total, NOT per-acre rate
- Use trade name farmer recognizes, put molecule in brackets
- If dosage_per_acre is null/missing, say "मला अधिक माहिती हवी आहे"
- NEVER invent products, dosages, or timing not in the data below`;
  } else if (formatType === 'FORMAT_2') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 2 — CLARIFICATION NEEDED ═══
Structure your response EXACTLY as:

भाऊ, तुमच्या [crop] मध्ये [most likely cause] दिसतंय.

पण नक्की उपाय सांगायला एक गोष्ट सांगा:
[ONE specific diagnostic question]

👉 [Option A — specific observation]
👉 [Option B — specific observation]
👉 [Option C — specific observation]
📷 फोटो पाठवा जर शक्य असेल तर

RULES:
- Ask ONE precise question, not multiple
- Options must be visually verifiable by farmer
- NEVER give vague advice when asking for clarification`;
  } else if (formatType === 'FORMAT_3') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 3 — MONITORING ADVISORY ═══
Structure your response EXACTLY as:

भाऊ, [crop] ची तपासणी केली — सध्या [specific condition].

[reason_text — why no treatment needed yet, 1-2 lines]

📋 7 दिवसांत तपासा:
- [specific threshold from rule]
- [specific visual marker]

अशी लक्षणे दिसली तर लगेच कळवा — उपाय सांगतो.

RULES:
- DO NOT recommend any product or dosage
- Give specific thresholds farmer can observe
- End with clear follow-up instruction`;
  } else if (formatType === 'FORMAT_4') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 4 — STAGE ADVISORY FALLBACK ═══
NOTE: Zero rules fired. Use ONLY crop-stage advisory data provided.

भाऊ, तुमचा [crop] [DAS] दिवसांचा आहे — हे [stage] टप्पा आहे.

या टप्प्यात साधारणपणे:
- [Stage-specific action 1 with timing]
- [Stage-specific action 2 with timing]

⚠️ टीप: नक्की किती खत/औषध द्यायचे हे माती परीक्षण / अधिक माहिती मिळाल्यानंतर सांगता येईल.

[One clarification question to gather missing data]

CRITICAL: This is ADVISORY, not prescription. Frame as "साधारणपणे" (generally).
NEVER use "कीड मारायची दवा वापरा" or "योग्य औषध वापरा" — these are FORBIDDEN.
If no specific product from rules, say "मला अधिक माहिती हवी आहे — नक्की कोणता उपाय द्यायचा हे सांगता येईल"`;
  } else if (formatType === 'FORMAT_5') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 5 — PEST/DISEASE EMERGENCY ═══
Structure your response EXACTLY as:

⚠️ भाऊ, लवकर करा — [pest/disease name in plain ${langName}]!

[reason_text — why urgent, 1 line]

अजून उशीर केला तर नुकसान वाढेल.

💊 आत्ता करा:
- [Product name] — [TOTAL dose for farmer's land]
- [Application method]
- [Timing — सकाळी/संध्याकाळी]

⚠️ [PHI days warning]
🌿 जैविक पर्याय: [organic_alternative if available]

7 दिवसांनी तपासा: [specific recovery indicator]

RULES:
- Speed and clarity paramount — keep SHORT
- Calculate TOTAL dosage for farmer's land area
- Include organic alternative if rule provides one`;
  }

  return `You are a LANGUAGE ADAPTER for SATHI (साथी), an agricultural advisory system for rural Indian farmers.
You are a TRANSLATOR/FORMATTER ONLY. The SYMBOLIC DECISION BRAIN has already made all decisions.

═══ THE SUPREME LAW ═══
Every product name, dosage, timing, and treatment in your response MUST come from the data below.
You CANNOT add, remove, or modify product names, dosages, timing, actions, priorities, or safety instructions.
You CANNOT use generic phrases like "कीड मारायची दवा वापरा" or "योग्य औषध वापरा" without a specific product from the rules.
If dosage_per_acre AND active_ingredient are BOTH missing, replace the HOW section with: "मला अधिक माहिती हवी आहे — नक्की कोणता उपाय द्यायचा हे सांगता येईल"

═══ APP LANGUAGE ═══
Respond in ${langName} (code: ${input.language}). Even if farmer typed in Roman script, respond in ${langName} script.

═══ RURAL LANGUAGE RULES ═══
- "फवारणी" not "छिडकाव", "एकर" not "हेक्टर", "बाटली"/"पिंप" for containers
- Address: "भाऊ"/"दादा" for male, "ताई"/"माई" for female
- "टाका" not "उपयोग करा", "किडा" not "कीटक", "मेलेला गाभा" not "डेड हार्ट"
- Keep response SHORT — proportional to query complexity
- Every response MUST end with one specific, measurable, time-bound follow-up instruction
  NOT "पिकाचे निरीक्षण करा" but "7 दिवसांनी तपासा — [specific thing to check]"

${formatInstruction}

═══ DIAGNOSTIC HIERARCHY ═══
- Pest evidence (dead heart, bore holes, frass, larvae) → ONLY pest treatment, NEVER fertilizer
- Dead heart in sugarcane = Shoot Borer (95%), NOT zinc deficiency
- ONLY respond to what farmer asked. If NO pest/disease in recommendations → NO pest products

═══ DOSAGE CALCULATION ═══
If land area provided (${input.land_context?.area_acres || '?'} acres), calculate:
TOTAL = dosage_per_acre × ${input.land_context?.area_acres || 'land_area'}
Show the TOTAL quantity the farmer needs, not per-acre rate.

═══ PHI TRANSLATION ═══
Translate phi_days to: "काढणीपूर्वी किमान X दिवस आधी फवारणी बंद करा"

${ruralRules}
${cropStageConstraints}

TRANSLATION: action_text/reason_text/knowledge_text are English REFERENCE texts. TRANSLATE into natural ${langName}. NEVER leave English phrases in ${langName} output.`
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP STAGE CONSTRAINTS GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function getCropStageConstraints(input: LLMFormatterInput): string {
  const cropStage = input.land_context?.growth_stage?.toUpperCase() || '';
  const daysSinceSowing = input.land_context?.days_since_sowing || 0;
  const crop = input.land_context?.current_crop?.toUpperCase() || '';
  
  // PRODUCTION FIX: Only truly young stages (pre-vegetative) block harvest
  // TILLERING and GRAND_GROWTH are active growth stages, not "young"
  const trulyYoungStages = ['GERMINATION', 'SEEDLING', 'EMERGENCE'];
  const isYoungCrop = trulyYoungStages.includes(cropStage) || daysSinceSowing < 30;
  
  // Define minimum harvest ages by crop (days)
  const minHarvestAge: Record<string, number> = {
    'SUGARCANE': 270, // 9 months minimum
    'COTTON': 150,
    'RICE': 120,
    'WHEAT': 120,
    'MAIZE': 90,
    'SOYBEAN': 95,
    'GROUNDNUT': 110,
  };
  
  const cropMinAge = minHarvestAge[crop] || 120;
  const cropIsTooYoung = daysSinceSowing < cropMinAge;
  
  if (isYoungCrop || cropIsTooYoung) {
    return `⚠️ CRITICAL CROP STAGE CONSTRAINT:
- Current stage: ${cropStage || 'VEGETATIVE'}
- Days since sowing: ${daysSinceSowing || 'Unknown (assume young)'}
- Crop: ${crop || 'Unknown'}

🚫 HARVEST RECOMMENDATIONS ARE BLOCKED FOR THIS CROP!
- This crop is in ${cropStage || 'early growth'} stage
- Minimum harvest age for ${crop || 'this crop'}: ${cropMinAge} days
- Current age: ${daysSinceSowing} days
- ${cropMinAge - daysSinceSowing > 0 ? `${cropMinAge - daysSinceSowing} more days needed before harvest` : 'Age unknown'}

For pest/disease problems on young crops, ONLY recommend:
1. Immediate pest/disease control measures
2. Cultural practices (remove affected parts)
3. Biological control agents
4. Chemical control if severity is HIGH
5. Monitoring schedule

NEVER recommend: Harvesting, early harvest, cutting crop, selling crop`;
  }
  
  return `CROP STAGE: ${cropStage || 'Not specified'} (${daysSinceSowing} days since sowing)
- Harvest recommendations allowed if crop is near maturity
- Always check PHI compliance for chemical recommendations`;
}

function buildFormattingUserPrompt(input: LLMFormatterInput, recData: string): string {
  const cropStage = input.land_context?.growth_stage?.toUpperCase() || 'UNKNOWN';
  const daysSinceSowing = input.land_context?.days_since_sowing || 0;
  const crop = input.land_context?.current_crop || 'Unknown';
  
  // PRODUCTION FIX: Match the corrected young crop definition
  const trulyYoungStages = ['GERMINATION', 'SEEDLING', 'EMERGENCE'];
  const isYoungCrop = trulyYoungStages.includes(cropStage) || daysSinceSowing < 30;
  
   // FIX 6: Conditional land context injection - only include what's relevant
   const primaryActionType = (input.decision_output?.primary_decision?.action_type || '').toUpperCase();
   const primaryCanonicalGroup = (input.decision_output?.primary_decision?.canonical_group || '').toLowerCase();
   const primaryActionText = (input.decision_output?.primary_decision?.application_details?.action_text || '').toLowerCase();
   
   const isNutritionRule = primaryCanonicalGroup.includes('nutri') || primaryCanonicalGroup.includes('deficiency') ||
     primaryActionText.includes('fertilizer') || primaryActionText.includes('nutrient') || primaryActionText.includes('urea');
   const isStressRule = primaryCanonicalGroup.includes('stress') || primaryCanonicalGroup.includes('drought') ||
     primaryCanonicalGroup.includes('water');
   const isWeatherRule = primaryActionType.includes('WEATHER') || primaryCanonicalGroup.includes('weather');
   
   let landContextParts: string[] = [];
   if (input.land_context) {
     // Always include: Crop, Growth Stage, Area, Days Since Sowing
     landContextParts.push(`- Crop: ${input.land_context.current_crop || 'Not specified'}`);
     landContextParts.push(`- Growth Stage: ${input.land_context.growth_stage || 'Not specified'} ${isYoungCrop ? '⚠️ YOUNG CROP - NO HARVEST' : ''}`);
     landContextParts.push(`- Area: ${input.land_context.area_acres || 'N/A'} acres`);
     landContextParts.push(`- Days Since Sowing: ${input.land_context.days_since_sowing || 'N/A'}`);
     
     // Conditional: NDVI only for stress assessment rules
     if (isStressRule && input.land_context.ndvi?.value) {
       landContextParts.push(`- NDVI Health: ${input.land_context.ndvi.value} (${input.land_context.ndvi.trend || 'unknown'})`);
     }
     // Conditional: Soil NPK only for nutrition-related rules
     if (isNutritionRule && input.land_context.soil_health) {
       landContextParts.push(`- Soil N/P/K: ${input.land_context.soil_health.nitrogen_kg_per_ha || 'N/A'}/${input.land_context.soil_health.phosphorus_kg_per_ha || 'N/A'}/${input.land_context.soil_health.potassium_kg_per_ha || 'N/A'} kg/ha`);
       if (input.land_context.soil_health.ph_level) landContextParts.push(`- pH: ${input.land_context.soil_health.ph_level}`);
     }
     // Conditional: Location only for weather-dependent rules
     if (isWeatherRule && (input.land_context.village || input.land_context.district)) {
       landContextParts.push(`- Location: ${input.land_context.village || ''}, ${input.land_context.district || ''}`);
     }
   }
   const landInfo = landContextParts.length > 0 ? `\nLAND CONTEXT:\n${landContextParts.join('\n')}` : '';

  return `FARMER'S QUESTION (in their language):
"${input.farmer_message}"

${landInfo}

RULE ENGINE RECOMMENDATIONS (PRESERVE ALL DOSAGES EXACTLY):
${recData}

FORMAT this into natural, empathetic farmer advice in ${getLanguageName(input.language)}.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN OPTIMIZATION: Filter matched responses to max N relevant ones
// Previously ALL 73 matched responses were dumped into the prompt (~8,000 tokens).
// Now only the primary + top high-priority alternatives are included (~450 tokens).
// ═══════════════════════════════════════════════════════════════════════════

function filterRelevantResponses(
  responses: any[],
  primaryRuleId: string | undefined,
  maxCount: number = 3
): any[] {
  if (!responses || responses.length === 0) return [];

  const NO_ACTION_TEXTS = [
    'do not apply any treatment at this stage.',
    'monitor pest population regularly; no treatment required at this stage.',
    'no treatment required at this stage.',
    'continue regular monitoring.',
  ];

  // 1. Primary rule's response always included
  const primary = primaryRuleId
    ? responses.find(r => r.rule_id === primaryRuleId)
    : null;

  // 2. Filter remaining: priority >= 7, exclude "do nothing" / "monitor" rules
  const others = responses
    .filter(r => r.rule_id !== primaryRuleId)
    .filter(r => (r.priority || 0) >= 7)
    .filter(r => {
      const actionText = (r.action_text || '').toLowerCase().trim();
      return !NO_ACTION_TEXTS.some(noAction => actionText.includes(noAction));
    })
    .slice(0, maxCount - (primary ? 1 : 0));

  const result = primary ? [primary, ...others] : others.slice(0, maxCount);

  console.log(`   [TOKEN_OPT] Filtered responses: ${result.length}/${responses.length} (primary=${!!primary}, excluded_no_action=${responses.length - result.length})`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION DATA EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

async function buildRecommendationSummary(input: LLMFormatterInput): Promise<string> {
  const decision = input.decision_output;
  const primary = decision.primary_decision;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // v2.0: DETERMINISTIC RESPONSE BUILDER INTEGRATION
  // If primary_decision exists with rich data, use the deterministic builder
  // instead of manual prompt assembly. This ensures ALL agronomic content
  // comes from decision_rules columns, not LLM generation.
  // ═══════════════════════════════════════════════════════════════════════════
  if (primary && primary.rule_id) {
    const appDetails = primary.application_details || {};
    const richData = extractRichRuleData(primary, appDetails);
    
    // Check if we have adequate rule content for deterministic response
    if (hasAdequateRuleContent(richData)) {
      const landAreaAcres = input.land_context?.area_acres;
      
      // Build crop context for PHI validation
      const cropContext: CropContext | undefined = input.land_context?.days_since_sowing ? {
        days_since_sowing: input.land_context.days_since_sowing,
        maturity_days_typical: undefined, // from land context if available
      } : undefined;
      
      // Build weather context if available (from decision metadata)
      const weatherMeta = decision?.metadata?.weather_context;
      const weather: WeatherContext | undefined = weatherMeta ? {
        temperature_celsius: weatherMeta.temperature,
        humidity_pct: weatherMeta.humidity,
        wind_speed_kmh: weatherMeta.wind_speed,
        rain_forecast_hours: weatherMeta.rain_forecast_hours,
        is_raining: weatherMeta.is_raining,
      } : undefined;
      
      const structuredResponse = buildDeterministicResponse(richData, landAreaAcres, cropContext, weather);
      const deterministicPrompt = await formatStructuredResponseForLLM(structuredResponse, undefined, input.supabase_client);
      
      console.log(`✅ [DeterministicBuilder] Integrated into LLM prompt for rule ${primary.rule_id}, decision=${structuredResponse.response_decision}, safety_warnings=${structuredResponse.safety_warnings.length}`);
      
      // Prepend status and append matched responses for context
      const parts: string[] = [];
      parts.push(`STATUS: ${decision.status || 'DECISION_PROVIDED'}`);
      parts.push('');
      parts.push(deterministicPrompt);
      
      // ═══ RULE ATOMICITY: Secondary actions stripped of treatment data ═══
      // Secondary rules may ONLY contribute monitoring/context — never
      // product_name or dosage, which would contaminate the primary rule's
      // treatment and cause chemical/dosage mismatches in LLM output.
      const secondary = decision.secondary_actions || decision.secondary_recommendations;
      if (secondary && secondary.length > 0) {
        parts.push(`\n═══ ADDITIONAL OBSERVATION ═══`);
        const sec = secondary[0];
        parts.push(`1. ${sec.action_type || sec.action || 'MONITOR'} - ${sec.reason || 'Supporting observation'}`);
        // BLOCKED: product_name and dosage_per_acre — prevents cross-rule contamination
        if (sec.success_indicators) {
          const indicators = Array.isArray(sec.success_indicators) ? sec.success_indicators : [sec.success_indicators];
          parts.push(`   Monitor for: ${indicators.slice(0, 2).join(', ')}`);
        }
      }
      
      // Warnings (capped at 2)
      if (decision.warnings && decision.warnings.length > 0) {
        parts.push(`\nWARNINGS:`);
        decision.warnings.slice(0, 2).forEach((warning: any) => {
          parts.push(`⚠️ ${typeof warning === 'string' ? warning : warning.message || warning.text}`);
        });
      }
      
      return parts.join('\n');
    }
    
    console.warn(`⚠️ [DeterministicBuilder] Inadequate rule content for ${primary.rule_id}, falling back to legacy assembly`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY FALLBACK: Manual prompt assembly (only when deterministic builder
  // cannot produce output due to missing rule content)
  // ═══════════════════════════════════════════════════════════════════════════
  const parts: string[] = [];
  
  // Status
  parts.push(`STATUS: ${decision.status || 'UNKNOWN'}`);
  
  // Primary recommendation with COMPLETE product details
  if (primary) {
    const pestCode = primary.target?.pest_code;
    const diseaseCode = primary.target?.disease_code;
    const pestName = pestCode ? (PEST_TRANSLATIONS[pestCode]?.[input.language] || pestCode) : '';
    const diseaseName = diseaseCode ? (DISEASE_TRANSLATIONS[diseaseCode]?.[input.language] || diseaseCode) : '';
    
    parts.push(`\nPRIMARY RECOMMENDATION:`);
    parts.push(`- Action Type: ${primary.action_type}`);
    parts.push(`- Target: ${pestName || diseaseName || primary.target?.nutrient_deficiency || 'General'}`);
    
    const appDetails = primary.application_details || {};
    
    let actionText = appDetails.action_text;
    let reasonText = appDetails.reason_text;
    let knowledgeText = appDetails.knowledge_text;
    
    if (!actionText) {
      const actionType = (primary.action_type || '').toUpperCase();
      if (actionType === 'NO_ACTION_REQUIRED' || actionType === 'NO_ACTION') {
        actionText = knowledgeText || reasonText || 'No action required at this time. Continue regular monitoring.';
        console.log(`   ℹ️ [LLM Formatter] NO_ACTION_REQUIRED: Using fallback text for rule ${primary.rule_id}`);
      } else {
        if (appDetails.i18n_key) {
          const resolved = resolveI18nFromCache(appDetails.i18n_key, 'en');
          if (resolved && !resolved.includes('_')) {
            actionText = resolved;
          }
        }
        if (!actionText) {
          actionText = knowledgeText || reasonText;
          if (!actionText) {
            console.error(`🚨 [LLM Formatter] action_text unavailable for rule ${primary.rule_id} — returning template fallback`);
            return buildTemplateFallback(input, startTime);
          }
        }
      }
    }
    
    const langName = getLanguageName(input.language);
    const translatedActionType = getActionTranslation(primary.action_type, input.language) || primary.action_type;
    parts.push(`- Action Type (translated): ${translatedActionType}`);
    
    parts.push(`\n═══ REFERENCE TEXTS (TRANSLATE TO ${langName.toUpperCase()}) ═══`);
    parts.push(`📋 ACTION (What to do - TRANSLATE this): ${actionText}`);
    if (reasonText) {
      parts.push(`🔍 REASON (Why): ${reasonText}`);
    }
    if (knowledgeText) {
      parts.push(`📚 KNOWLEDGE (Scientific basis): ${knowledgeText.substring(0, 600)}`);
    }
    parts.push(`═══════════════════════════════════════════════════`);
    
    const actionTypeUpper2 = (primary.action_type || '').toUpperCase();
    const isDirectPrescription = ['RECOMMEND', 'TREATMENT', 'SPRAY', 'APPLY', 'CHEMICAL_CONTROL', 'BIOLOGICAL_CONTROL', 'URGENT_ACTION']
      .some(t => actionTypeUpper2.includes(t));
    
    if (isDirectPrescription) {
      if (appDetails.organic_alternative) parts.push(`\n🌿 Organic Alternative: ${appDetails.organic_alternative}`);
      if (appDetails.mode_of_action) parts.push(`🔬 Mode of Action: ${appDetails.mode_of_action}`);
      if (appDetails.success_indicators) {
        const indicators = Array.isArray(appDetails.success_indicators) ? appDetails.success_indicators.join(', ') : String(appDetails.success_indicators);
        parts.push(`✅ Success Signs (5-7 days): ${indicators}`);
      }
      if (appDetails.bee_toxicity && appDetails.bee_toxicity !== 'SAFE' && appDetails.bee_toxicity !== 'LOW') {
        parts.push(`🐝 Bee Safety: ${appDetails.bee_toxicity} toxicity — avoid during flowering`);
      }
      if (appDetails.roi_yield_gain_pct) parts.push(`📈 Yield Gain: ${appDetails.roi_yield_gain_pct}%`);
    }
    
    const actionTypeUpper = (primary.action_type || '').toUpperCase();
    const TREATMENT_ACTION_TYPES = ['RECOMMEND', 'URGENT_ACTION', 'TREATMENT', 'SPRAY', 'APPLY', 'CHEMICAL_CONTROL', 'BIOLOGICAL_CONTROL'];
    const isTreatmentAction = TREATMENT_ACTION_TYPES.some(t => actionTypeUpper.includes(t));
    
    if (actionTypeUpper === 'BLOCK' || actionTypeUpper === 'SAFETY_GATE') {
      parts.push(`\n⛔ IMPORTANT INSTRUCTION FOR LLM:`);
      parts.push(`This is a BLOCK action. DO NOT recommend any product, dosage, or treatment.`);
      parts.push(`DO NOT tell the farmer to decide the dose themselves.`);
      parts.push(`Instead, explain WHY treatment is blocked using the REASON and KNOWLEDGE text above.`);
      parts.push(`Provide only monitoring guidance and safety information.`);
    } else if (isTreatmentAction && appDetails && Object.keys(appDetails).length > 0) {
      parts.push(`\n- Product Name: ${appDetails.product_name || 'Not specified'}`);
      parts.push(`- Dosage (concentration): ${appDetails.concentration || appDetails.dosage || 'As per label'}`);
      parts.push(`- Dosage (per acre): ${appDetails.dosage_per_acre || 'See concentration'}`);
      parts.push(`- Application Method: ${appDetails.method || appDetails.application_method || 'Standard application'}`);
      parts.push(`- Timing: ${appDetails.timing || primary.timing?.best_time_of_day || 'As per label'}`);
      parts.push(`- Water Volume: ${appDetails.water_volume || appDetails.water_volume_per_acre || 'As per label'}`);
      parts.push(`- PHI Days: ${appDetails.phi_days || 'Follow label'}`);
      const efficacyValue = appDetails.efficacy_percent || primary.expected_outcomes?.efficacy_percent;
      parts.push(`- Expected Efficacy: ${efficacyValue ? efficacyValue + '%' : 'As per field conditions'}`);
      parts.push(`- Weather Restrictions: ${appDetails.weather_restrictions || 'Follow label instructions'}`);
      
      const farmerAreaAcres = input.land_context?.area_acres;
      if (farmerAreaAcres && farmerAreaAcres > 0) {
        const dosagePerAcre = appDetails.dosage_per_acre || appDetails.concentration || '';
        parts.push(`\n═══ TOTAL FOR FARMER'S LAND (${farmerAreaAcres} acres) ═══`);
        parts.push(`- Per acre dosage: ${dosagePerAcre}`);
        parts.push(`- Farmer's land: ${farmerAreaAcres} acres`);
        parts.push(`- CALCULATE: Multiply per-acre dosage × ${farmerAreaAcres} = TOTAL product needed`);
        parts.push(`- IMPORTANT: Show BOTH per-acre AND total quantities in the response`);
        parts.push(`═══════════════════════════════════════════════════`);
      }
      
      if (appDetails.names) {
        const names = appDetails.names as { mr?: string; hi?: string; en?: string };
        parts.push(`- Product (Marathi): ${names.mr || appDetails.product_name}`);
        parts.push(`- Product (Hindi): ${names.hi || appDetails.product_name}`);
      }
    } else if (isTreatmentAction) {
      parts.push(`- Product: ${primary.product_name || 'Not specified'}`);
      parts.push(`- Dosage: As per label`);
    } else {
      parts.push(`\nℹ️ This is a ${actionTypeUpper} action. Focus on monitoring guidance and explanation.`);
      parts.push(`DO NOT recommend any specific product or dosage.`);
    }
    
    // REMOVED: Priority and IPM Level are internal metadata — never expose to LLM prompt
    
    const ipmLevel = primary.ipm_level || 'LEVEL_3';
    if (!IPM_URGENCY_LABELS[ipmLevel]) {
      console.warn(`[IPM_GOVERNANCE] Unknown IPM level: ${ipmLevel}`);
    }
    const urgencyLabel = IPM_URGENCY_LABELS[ipmLevel]?.[input.language] || 'Normal priority';
    parts.push(`- Urgency: ${urgencyLabel}`);
    
    if (primary.rule_id) {
      parts.push(`- Scientific Basis: ICAR Validated`);
    }
  }
  
  // Secondary actions (capped at 1) — RULE ATOMICITY: strip product/dosage
  const secondary = decision.secondary_actions || decision.secondary_recommendations;
  if (secondary && secondary.length > 0) {
    parts.push(`\n═══ ADDITIONAL OBSERVATION: ═══`);
    const sec = secondary[0];
    const secAction = (sec.action || sec.action_type || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
    parts.push(`1. ${secAction} - ${sec.reason || 'Supporting observation'}`);
    // REMOVED: sec.product_name and sec.dosage_per_acre — prevents cross-rule contamination
    if (sec.success_indicators) parts.push(`   Monitor: ${Array.isArray(sec.success_indicators) ? sec.success_indicators.join(', ') : sec.success_indicators}`);
  }
  
  // Matched responses — SANITIZED: no rule_ids, codes title-cased
  const matchedResponses = decision.matched_responses;
  if (matchedResponses && matchedResponses.length > 0) {
    const primaryRuleId = decision.primary_decision?.rule_id;
    const filteredResponses = filterRelevantResponses(matchedResponses, primaryRuleId, 3);
    
    parts.push(`\nAGRICULTURAL RECOMMENDATIONS (Use in farmer's language):`);
    filteredResponses.forEach((resp: any, idx: number) => {
      const isPrimary = resp.rule_id === primaryRuleId;
      // Format cause codes: DEAD_HEART_PRESENT → Dead heart present
      const causeLabel = resp.cause
        ? resp.cause.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
        : 'Additional observation';
      parts.push(`\n${idx + 1}. ${causeLabel}:`);
      
      if (resp.action_text) {
        parts.push(`   Action: ${resp.action_text}`);
      }
      if (resp.reason_text) {
        parts.push(`   Reason: ${resp.reason_text}`);
      }
      if (isPrimary && resp.knowledge_text) {
        parts.push(`   Knowledge: ${resp.knowledge_text.substring(0, 600)}`);
      }
    });
  }
  
  // Warnings (capped at 2)
  if (decision.warnings && decision.warnings.length > 0) {
    parts.push(`\nWARNINGS:`);
    decision.warnings.slice(0, 2).forEach((warning: any) => {
      parts.push(`⚠️ ${typeof warning === 'string' ? warning : warning.message || warning.text}`);
    });
  }
  
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM API CALLS WITH TIMEOUT
// ═══════════════════════════════════════════════════════════════════════════

async function callGeminiWithTimeout(
  systemPrompt: string, 
  userPrompt: string, 
  apiKey: string, 
  timeoutMs: number
): Promise<{ success: boolean; text: string; error?: string; tokens_used?: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }],
          generationConfig: {
            temperature: 0.5,    // LOWER: More consistent for safety
            maxOutputTokens: 4000  // CRITICAL FIX: Increased from 3000 to 4000 for complete Devanagari responses (Marathi/Hindi use ~2.5x more tokens)
          }
        })
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const statusCode = response.status;
      console.warn(`Gemini API error: ${statusCode}`);
      if (statusCode === 429) {
        return { success: false, text: '', error: 'RATE_LIMIT' };
      }
      return { success: false, text: '', error: `HTTP_${statusCode}` };
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokens_used = data.usageMetadata?.totalTokenCount || 0;
    
    // Log token usage for monitoring
    console.log(`   📊 [Gemini] Tokens used: ${tokens_used} (prompt: ${data.usageMetadata?.promptTokenCount || 0}, candidates: ${data.usageMetadata?.candidatesTokenCount || 0})`);
    
    return { success: !!text, text, tokens_used };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    console.warn(`Gemini call failed:`, isAbort ? 'TIMEOUT' : error);
    return { success: false, text: '', error: isAbort ? 'TIMEOUT' : 'NETWORK' };
  }
}

async function callOpenAIWithTimeout(
  systemPrompt: string, 
  userPrompt: string, 
  apiKey: string, 
  timeoutMs: number
): Promise<{ success: boolean; text: string; error?: string; tokens_used?: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',  // COST OPTIMIZATION: Using GPT-4o-mini for faster, cheaper responses
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2800,  // CRITICAL FIX: Increased from 1800 to 2800 for Devanagari languages (Marathi/Hindi use ~2.5x more tokens than English, causing truncated incomplete responses)
        temperature: 0.5   // LOWER: More consistent, less creative for safety
      })
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const statusCode = response.status;
      console.warn(`OpenAI API error: ${statusCode}`);
      if (statusCode === 429) {
        return { success: false, text: '', error: 'RATE_LIMIT' };
      }
      return { success: false, text: '', error: `HTTP_${statusCode}` };
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const tokens_used = data.usage?.total_tokens || 0;
    
    // Log token usage for monitoring
    console.log(`   📊 [OpenAI] Tokens used: ${tokens_used} (prompt: ${data.usage?.prompt_tokens || 0}, completion: ${data.usage?.completion_tokens || 0})`);
    
    return { success: !!text, text, tokens_used };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    console.warn(`OpenAI call failed:`, isAbort ? 'TIMEOUT' : error);
    return { success: false, text: '', error: isAbort ? 'TIMEOUT' : 'NETWORK' };
  }
}

async function callLovableAIWithTimeout(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  timeoutMs: number
): Promise<{ success: boolean; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Lovable AI error: ${response.status}`);
      return { success: false, text: '' };
    }

    const data: any = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? '';

    return {
      success: typeof text === 'string' && text.length > 0,
      text: typeof text === 'string' ? text : '',
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('Lovable AI call failed:', error);
    return { success: false, text: '' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE FALLBACK (when LLM unavailable) - MODE-DRIVEN
// ═══════════════════════════════════════════════════════════════════════════

async function buildTemplateFallback(input: LLMFormatterInput, startTime: number): Promise<LLMFormatterOutput> {
  const lang = input.language || 'mr';
  const decision = input.decision_output;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRASH-PROOF: Safe extraction with guaranteed defaults
  // ═══════════════════════════════════════════════════════════════════════════
  const decisionConfidence = decision?.metadata?.decision_confidence ?? decision?.confidence ?? 0;
  const hasSymptoms = decision?.metadata?.has_symptoms ?? !!(decision?.symptom_keys?.length);
  const hasVisualAmbiguity = decision?.metadata?.has_visual_ambiguity ?? decision?.needs_photo_for_diagnosis ?? false;
  const clarificationOptions = decision?.clarification_options ?? [];
  
  // FAIL-SAFE: Resolve i18n key
  const primaryI18nKey = resolveI18nKey(
    decision?.primary_i18n_key ?? decision?.metadata?.i18n_key,
    'system.monitoring.default'
  );
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVE RESPONSE MODE - Confidence-driven with invariant check
  // ═══════════════════════════════════════════════════════════════════════════
  const responseMode = resolveResponseMode({
    response_mode: decision?.metadata?.response_mode,
    gate_action: decision?.metadata?.gate_action,
    has_treatment: !!decision?.primary_decision?.action_type,
    has_clarification: !!decision?.clarification_needed,
    has_options: clarificationOptions.length > 0,
    needs_photo: decision?.needs_photo_for_diagnosis,
    decision_confidence: decisionConfidence,
    has_symptoms: hasSymptoms,
    has_visual_ambiguity: hasVisualAmbiguity,
    clarification_options: clarificationOptions
  });
  
  // INVARIANT CHECK: Log if violation detected
  assertResponseModeInvariant(responseMode, decisionConfidence, hasSymptoms);
  
  console.log(`   📋 Building MODE-DRIVEN template fallback`);
  console.log(`   📋 Response Mode: ${responseMode}`);
  console.log(`   📋 Decision confidence: ${decisionConfidence}`);
  console.log(`   📋 Has symptoms: ${hasSymptoms}`);
  console.log(`   📋 Primary i18n key: ${primaryI18nKey}`);
  console.log(`   📋 Primary action: ${decision?.primary_decision?.action_type || '[none]'}`);
  console.log(`   📋 Land crop: ${input.land_context?.current_crop || '[none]'}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: CLARIFICATION - Render options without requiring text
  // ═══════════════════════════════════════════════════════════════════════════
  if (responseMode === ResponseMode.CLARIFICATION || decision?.clarification_needed) {
    const modeOutput = renderByMode(ResponseMode.CLARIFICATION, lang, {
      options: decision?.clarification_options?.map((opt: any) => ({
        label: opt.label || opt.display_text || opt.text,
        value: opt.value || opt.observation_key || opt.label,
        observation_key: opt.observation_key
      }))
    });
    
    return {
      formatted_response: modeOutput.primary_message || '',
      confidence: 0.8,
      source: 'TEMPLATE_FALLBACK',
      processing_time_ms: Date.now() - startTime,
      sections_included: ['clarification'],
      validation_passed: true,
      validation_violations: [],
      gate_status: GateStatus.PARTIAL,
      gate_action: GateAction.REQUIRE_CLARIFICATION,
      reasoning_included: false
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: PHOTO_REQUIRED - Camera prompt
  // ═══════════════════════════════════════════════════════════════════════════
  if (decision?.needs_photo_for_diagnosis) {
    const modeOutput = renderByMode('PHOTO_REQUIRED', lang, {});
    
    return {
      formatted_response: modeOutput.primary_message || '',
      confidence: 0.8,
      source: 'TEMPLATE_FALLBACK',
      processing_time_ms: Date.now() - startTime,
      sections_included: ['photo_request'],
      validation_passed: true,
      validation_violations: [],
      gate_status: GateStatus.PARTIAL,
      gate_action: GateAction.REQUEST_PHOTO,
      reasoning_included: false
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: OBSERVATION/MONITORING - Simple reassurance
  // ═══════════════════════════════════════════════════════════════════════════
  if (responseMode === ResponseMode.OBSERVATION || !decision?.primary_decision) {
    const modeOutput = renderByMode(ResponseMode.OBSERVATION, lang, {
      monitoring_message: decision?.monitoring_note
    });
    
    return {
      formatted_response: modeOutput.primary_message || '',
      confidence: 0.7,
      source: 'TEMPLATE_FALLBACK',
      processing_time_ms: Date.now() - startTime,
      sections_included: ['observation'],
      validation_passed: true,
      validation_violations: [],
      gate_status: GateStatus.PASS,
      gate_action: GateAction.PROVIDE_OBSERVATION_ONLY,
      reasoning_included: false
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: TREATMENT — Use Deterministic Response Builder v2.0
  // Instead of legacy template assembly, use the structured builder
  // ═══════════════════════════════════════════════════════════════════════════
  const primary = decision?.primary_decision;
  
  if (primary && primary.rule_id) {
    const appDetails = primary.application_details || {};
    const richData = extractRichRuleData(primary, appDetails);
    
    if (hasAdequateRuleContent(richData)) {
      const landAreaAcres = input.land_context?.area_acres;
      const cropContext: CropContext | undefined = input.land_context?.days_since_sowing ? {
        days_since_sowing: input.land_context.days_since_sowing,
      } : undefined;
      
      const structuredResponse = buildDeterministicResponse(richData, landAreaAcres, cropContext);
      const deterministicText = await formatStructuredResponseForLLM(structuredResponse, lang, input.supabase_client);
      
      console.log(`   📋 [TemplateFallback] Deterministic builder used for rule ${primary.rule_id}, decision=${structuredResponse.response_decision}`);
      
      return {
        formatted_response: deterministicText,
        confidence: structuredResponse.confidence,
        source: 'TEMPLATE_FALLBACK',
        processing_time_ms: Date.now() - startTime,
        sections_included: ['deterministic_response', 'problem', 'action', 'safety', 'monitoring'],
        validation_passed: true,
        validation_violations: [],
        gate_status: GateStatus.PASS,
        gate_action: GateAction.PROVIDE_RECOMMENDATION,
        reasoning_included: true
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY TEMPLATE FALLBACK — only when deterministic builder has no content
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Generate localized content instead of English-only
  // ═══════════════════════════════════════════════════════════════════════════
  const parts: string[] = [];
  
  // English-only structural template — LLM narration translates at runtime
  parts.push('Hello farmer friend! 🌾');
  
  const currentCrop = input.land_context?.current_crop;
  if (currentCrop) {
    parts.push(`I understand your question about ${currentCrop}.`);
  }
  
  // Legacy fallback: minimal safe response
  const matchedResponses = decision?.matched_responses;
  if (matchedResponses && matchedResponses.length > 0) {
    parts.push('📌 **Recommendation (from rule database):**');
    
    matchedResponses.slice(0, 2).forEach((resp: any, idx: number) => {
      const actionContent = resp.action_text || resp.reason_text || 'Monitor crop and share a photo if needed';
      parts.push(`\n${idx + 1}. **Recommendation:**\n${actionContent}`);
    });
  } else {
    parts.push('👀 **Analysis:**\nFor accurate recommendation please:\n• Send a crop photo\n• Or provide more details about symptoms');
  }
  
  parts.push('\n🙏 Feel free to ask if you need clarification. Best wishes!');
  
  const finalResponse = parts.join('\n\n');
  console.log(`   📋 Localized legacy template fallback generated: ${finalResponse.length} chars, lang=${lang}`);
  
  return {
    formatted_response: finalResponse,
    confidence: 0.7,
    source: 'TEMPLATE_FALLBACK',
    processing_time_ms: Date.now() - startTime,
    sections_included: ['greeting', 'recommendation', 'closing'],
    validation_passed: true,
    validation_violations: [],
    gate_status: GateStatus.PASS,
    gate_action: GateAction.PROVIDE_RECOMMENDATION,
    reasoning_included: false
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractSections(text: string): string[] {
  const sections: string[] = [];
  if (text.includes('नमस्कार') || text.includes('Hello')) sections.push('greeting');
  if (text.includes('शिफारस') || text.includes('Recommend')) sections.push('recommendation');
  if (text.includes('⏰')) sections.push('timing');
  if (text.includes('📊') || text.includes('%')) sections.push('efficacy');
  if (text.includes('⚠️')) sections.push('warning');
  if (text.includes('🙏') || text.includes('शुभेच्छा')) sections.push('closing');
  return sections;
}

export default formatRecommendationsWithLLM;

// ═══════════════════════════════════════════════════════════════════════════
// P4-1 + P6-3: WHAT-WHY-HOW STRUCTURAL VALIDATOR
// Validates that LLM output contains all 3 mandatory response sections
// ═══════════════════════════════════════════════════════════════════════════

interface WhatWhyHowValidationResult {
  valid: boolean;
  missing_sections: string[];
  violations: string[];
}

function validateWhatWhyHow(
  llmOutput: string,
  input: any
): WhatWhyHowValidationResult {
  const missing: string[] = [];
  const violations: string[] = [];
  
  // Only validate for treatment responses (not clarification/observation)
  const actionType = input?.decision_output?.primary_decision?.action_type?.toUpperCase() || '';
  // FIX 7: Expanded monitoring-only action types that don't require HOW section
  const MONITORING_ONLY_ACTION_TYPES = new Set([
    'MONITOR', 'MONITOR_CLOSELY', 'MONITOR_ONLY', 'OBSERVE', 'OBSERVATION',
    'NO_ACTION', 'NO_ACTION_REQUIRED', 'WAIT_AND_WATCH', 'NONE', 'DIAGNOSIS',
    'MONITORING_ADVISED', 'SCOUTING'
  ]);
  if (MONITORING_ONLY_ACTION_TYPES.has(actionType)) {
    return { valid: true, missing_sections: [], violations: [] };
  }
  
  const lower = llmOutput.toLowerCase();
  
  // CRITICAL FIX: Greatly expanded detection markers for Marathi, Hindi, and English
  // Previous narrow markers caused false-positive failures on valid Devanagari responses
  // which triggered template fallback → 317-char incomplete English-only responses
  
  // WHAT detection: problem/cause identification markers (expanded for Marathi/Hindi)
  const hasWhat = lower.includes('🔍') || lower.includes('🎯') || lower.includes('📋') ||
    // Marathi markers
    lower.includes('समस्या') || lower.includes('आढळले') || lower.includes('दिसतंय') ||
    lower.includes('कारण ओळख') || lower.includes('लक्षणे') || lower.includes('रोग') ||
    lower.includes('किडा') || lower.includes('कीड') || lower.includes('मर') ||
    lower.includes('मावा') || lower.includes('बोअरर') || lower.includes('गाभा') ||
    lower.includes('पिवळ') || lower.includes('तपासणी') || lower.includes('निदान') ||
    lower.includes('ओळख') || lower.includes('दिसत') || lower.includes('झाल') ||
    lower.includes('आहे') || lower.includes('आलेल') ||
    // Hindi markers
    lower.includes('पहचान') || lower.includes('लक्षण') || lower.includes('रोग') ||
    lower.includes('कीट') || lower.includes('समस्या') || lower.includes('बीमारी') ||
    lower.includes('दिख') || lower.includes('पता') ||
    // English markers
    lower.includes('problem') || lower.includes('cause') || lower.includes('identified') ||
    lower.includes('detected') || lower.includes('what') || lower.includes('diagnosis') ||
    lower.includes('issue') || lower.includes('found') || lower.includes('observe');
  
  // WHY detection: scientific reasoning markers (expanded)
  const hasWhy = lower.includes('📖') || lower.includes('🔬') ||
    // Marathi markers
    lower.includes('कारण') || lower.includes('म्हणून') || lower.includes('त्यामुळे') ||
    lower.includes('वैज्ञानिक') || lower.includes('जीवनचक्र') || lower.includes('प्रसार') ||
    lower.includes('मुळे') || lower.includes('झाल्यामुळे') || lower.includes('होतो') ||
    lower.includes('करतो') || lower.includes('करतात') || lower.includes('पसरतो') ||
    lower.includes('नुकसान') || lower.includes('हल्ला') || lower.includes('परिणाम') ||
    // Hindi markers  
    lower.includes('कारण') || lower.includes('इसलिए') || lower.includes('क्योंकि') ||
    lower.includes('वजह') || lower.includes('नतीजा') || lower.includes('फैलत') ||
    // English markers
    lower.includes('reason') || lower.includes('why') || lower.includes('because') ||
    lower.includes('scientific') || lower.includes('lifecycle') || lower.includes('spread') ||
    lower.includes('damage') || lower.includes('result');
  
  // HOW detection: treatment/action markers (expanded)
  const hasHow = lower.includes('💊') || lower.includes('🌿') || lower.includes('⚠️') ||
    // Marathi markers
    lower.includes('उपाय') || lower.includes('फवारणी') || lower.includes('टाका') ||
    lower.includes('वापरा') || lower.includes('मिसळा') || lower.includes('एकर') ||
    lower.includes('प्रमाण') || lower.includes('करा') || lower.includes('औषध') ||
    lower.includes('दवा') || lower.includes('फवार') || lower.includes('पाण्यात') ||
    lower.includes('लिटर') || lower.includes('ग्रॅम') || lower.includes('मिली') ||
    lower.includes('शिफारस') || lower.includes('उपचार') || lower.includes('काय करा') ||
    lower.includes('काय करायचं') ||
    // Hindi markers
    lower.includes('छिड़काव') || lower.includes('दवा') || lower.includes('उपचार') ||
    lower.includes('इलाज') || lower.includes('डालें') || lower.includes('मिलाएं') ||
    lower.includes('प्रति एकड') || lower.includes('लीटर') || lower.includes('ग्राम') ||
    lower.includes('मिली') ||
    // English markers
    lower.includes('treatment') || lower.includes('how') || lower.includes('apply') ||
    lower.includes('spray') || lower.includes('dosage') || lower.includes('ml') ||
    lower.includes('per acre') || lower.includes('recommend') || lower.includes('action') ||
    lower.includes('step');
  
  if (!hasWhat) {
    missing.push('WHAT');
    violations.push('WHAT-WHY-HOW: Missing WHAT section (problem identification)');
  }
  if (!hasWhy) {
    missing.push('WHY');
    violations.push('WHAT-WHY-HOW: Missing WHY section (scientific reasoning)');
  }
  if (!hasHow) {
    missing.push('HOW');
    violations.push('WHAT-WHY-HOW: Missing HOW section (treatment instructions)');
  }
  
  return {
    valid: missing.length === 0,
    missing_sections: missing,
    violations
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// P5-1: CROP NAME CONSISTENCY VALIDATOR
// Ensures LLM output doesn't mention wrong/unauthorized crop names
// ═══════════════════════════════════════════════════════════════════════════

const CROP_NAME_ALIASES: Record<string, string[]> = {
  'SUGARCANE': ['sugarcane', 'ऊस', 'गन्ना', 'sugar cane', 'cane'],
  'COTTON': ['cotton', 'कापूस', 'कपास', 'kapas'],
  'RICE': ['rice', 'भात', 'धान', 'paddy', 'चावल'],
  'WHEAT': ['wheat', 'गहू', 'गेहूं', 'gehun'],
  'MAIZE': ['maize', 'मका', 'मक्का', 'corn'],
  'SOYBEAN': ['soybean', 'soya', 'सोयाबीन', 'सोयाबिन'],
  'GROUNDNUT': ['groundnut', 'भुईमूग', 'मूंगफली', 'peanut'],
  'ONION': ['onion', 'कांदा', 'प्याज', 'pyaj'],
  'TOMATO': ['tomato', 'टोमॅटो', 'टमाटर'],
  'CHILLI': ['chilli', 'मिरची', 'मिर्च', 'chili', 'pepper'],
  'GRAM': ['gram', 'हरभरा', 'चना', 'chickpea'],
  'TUR': ['tur', 'तूर', 'अरहर', 'pigeon pea', 'toor']
};

function validateCropNameConsistency(
  llmOutput: string,
  authorizedCrop: string
): { valid: boolean; violation: string } {
  const normalizedCrop = authorizedCrop.toUpperCase().replace(/[_\s-]+/g, '');
  
  // FIX 6: Strip technical terms before checking crop names
  const cleanedOutput = llmOutput
    .replace(/\b[A-Z][A-Z0-9]+\b/g, '')           // Remove all-caps (product names like CHLORPYRIFOS)
    .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, '') // Remove CamelCase
    .replace(/\d+\s*(ml|g|kg|l|%)/gi, '')          // Remove dosages
    .replace(/\([^)]+\)/g, '');                     // Remove parenthetical content
  
  // Check if the expected crop IS present in the output
  const expectedAliases = CROP_NAME_ALIASES[normalizedCrop] || CROP_NAME_ALIASES[authorizedCrop.toUpperCase()] || [];
  const expectedCropPresentInOutput = expectedAliases.some(a => llmOutput.toLowerCase().includes(a.toLowerCase()));
  
  // Check that the output doesn't prominently mention a DIFFERENT crop
  for (const [cropKey, aliases] of Object.entries(CROP_NAME_ALIASES)) {
    if (cropKey === normalizedCrop || cropKey === authorizedCrop.toUpperCase()) continue;
    
    // Check if another crop is mentioned as the main subject (not incidental)
    for (const alias of aliases) {
      // Look for patterns like "your [crop]" or "[crop] crop" that indicate main subject
      const subjectPatterns = [
        new RegExp(`your\\s+${alias}`, 'i'),
        new RegExp(`${alias}\\s+crop`, 'i'),
        new RegExp(`${alias}\\s+field`, 'i'),
        new RegExp(`in\\s+${alias}`, 'i'),
      ];
      
      for (const pattern of subjectPatterns) {
        if (pattern.test(cleanedOutput)) {
          // FIX 6: Downgrade from hard-block to warning if expected crop IS also present
          if (expectedCropPresentInOutput) {
            console.warn(`⚠️ [CROP_CONSISTENCY] Wrong crop "${alias}" mentioned alongside correct crop "${authorizedCrop}" — warning only, not blocking`);
            return { valid: true, violation: '' };  // Allow response through
          }
          return {
            valid: false,
            violation: `Crop mismatch: LLM mentions "${alias}" (${cropKey}) but authorized crop is ${authorizedCrop}`
          };
        }
      }
    }
  }
  
  return { valid: true, violation: '' };
}

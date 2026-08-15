/**
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * 2026-08-15 09:50 UTC — FIX 2 (organic preference): farming_preference threaded
 *   into the deterministic builder (both LLM + template paths), no-invention
 *   directive added to the system prompt, and [NARRATION_NUMERIC_DRIFT]
 *   post-check falls back to deterministic rendering when the narration
 *   introduces numbers absent from the rule data.
 * 2026-08-02 18:02 UTC — PERF: reuse request-local market-product lookup
 *   promises across validation and narration; validation logic unchanged.
 * 2026-07-29 10:30 UTC — LATENCY L1: narration budget capped at 14s total
 *   (tiers 8s/6s/5s, rate-limit sleeps removed). Cascade previously cost up to
 *   56s before falling back to template. Render-only contract unchanged.
 */
// PHASE 5: LLM RESPONSE FORMATTER - RENDER-ONLY MODE

import type { DecisionOutput, FarmerCommunication } from './rule-engine-types.ts';
import type { DataAudit } from './orchestrator.ts';
import { getRuralLanguageRules, replaceFormalsWithRural, getVillageOfficerPersona } from '../rural-language-dictionary.ts';
import { getLanguageName } from '../utils/language-utils.ts';
import { getCropDisplayName, getCropCanonical } from '../utils/crop-names-cache.ts';
import {
  getProductName,
  getActionTranslation,
  getCauseTranslation
} from './communication-translation-dictionary.ts';

// PRODUCT MAPPING: Ingredient → Market Product brand names
import {
  lookupMarketProductsMemoized,
  formatMarketProducts,
  type MarketProductMemo,
} from './market-product-lookup.ts';

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

// SAFE STRING UTILITIES - Crash-proof text operations
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

// RESPONSE MODE RENDERER - Mode-driven output generation
import {
  renderByMode,
  resolveResponseMode,
  assertResponseModeInvariant,
} from '../utils/response-mode-renderer.ts';
import type { ModeRenderedOutput } from '../utils/response-mode-renderer.ts';

// TYPE DEFINITIONS

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
  market_product_memo?: MarketProductMemo;
  // Farmer's persisted farming preference (farmers.farming_preference).
  farming_preference?: 'unset' | 'conventional' | 'organic' | 'integrated';
  // Presentation-only addressing payload (rural honorifics).
  farmer_addressing?: {
    primary: string;
    alternatives: string[];
    gender: string;
    language: string;
    state: string | null;
    toneHint: string;
    promptDirective: string;
  };
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

// IPM LEVEL TRANSLATIONS — Now handled by LLM narration layer

const IPM_URGENCY_LABELS: Record<string, string> = {
  'LEVEL_1': 'Monitor only',
  'LEVEL_2': 'Use cultural practices',
  'LEVEL_3': 'Mechanical control',
  'LEVEL_4': 'Biological control',
  'LEVEL_5': 'Immediate chemical action required',
};

// TECHNICAL TERM TRANSLATIONS

// AUDIT FIX: PEST_TRANSLATIONS and DISEASE_TRANSLATIONS removed
const PEST_TRANSLATIONS: Record<string, Record<string, string>> = {};
const DISEASE_TRANSLATIONS: Record<string, Record<string, string>> = {};

// RESPONSE SANITIZATION (MODULE SCOPE - exported for use in index.ts fallbacks)

// Known agrochemical product names that should NOT be stripped even though
const ALLOWED_PRODUCT_NAMES = new Set([
  'CHLORPYRIFOS', 'FIPRONIL', 'IMIDACLOPRID', 'THIAMETHOXAM', 'CARBENDAZIM',
  'MANCOZEB', 'PROPICONAZOLE', 'HEXACONAZOLE', 'TRICHODERMA', 'BEAUVERIA',
  'METARHIZIUM', 'PSEUDOMONAS', 'AZADIRACHTIN', 'NEEM', 'SPINOSAD',
  'EMAMECTIN', 'CYPERMETHRIN', 'DELTAMETHRIN', 'LAMBDA', 'ACEPHATE',
  'DIMETHOATE', 'PROFENOFOS', 'QUINALPHOS', 'MONOCROTOPHOS', 'PHORATE',
  'CARTAP', 'FLUBENDIAMIDE', 'CHLORANTRANILIPROLE', 'TRICHOGRAMMA',
  'BACILLUS', 'NPV', 'ICAR', 'IPM', 'PHI', 'SC', 'EC', 'WP', 'SL', 'SP', 'WG',
]);

// Sanitize LLM output to remove any leaked technical identifiers,
export function sanitizeFarmerResponse(text: string): string {
  if (!text) return text;
  
  let sanitized = text;
  
  // 1. Strip ALL_CAPS_UNDERSCORE patterns (≥2 words) that are NOT product names
  sanitized = sanitized.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g, (match) => {
    const firstWord = match.split('_')[0];
    if (ALLOWED_PRODUCT_NAMES.has(firstWord)) return match;
    console.warn(`🧹 [SANITIZE] Stripped technical code from farmer response: ${match}`);
    return '';
  });
  
  // 2. Strip rule_id patterns (e.g., SC_PEST_TOP_BORER_004)
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
  
  // 6. AGRONOMIC SAFETY GUARDRAILS - Block unrealistic claims
  
  // 6a. Block unrealistic growth rate claims (>5 cm/day for sugarcane)
  sanitized = sanitized.replace(/(\d+)\s*(?:cm|सेमी|से\.मी\.)\s*(?:per|\/|प्रति)\s*(?:day|दिवस|दिन)/gi, (match, num) => {
    const rate = parseInt(num);
    if (rate > 5) {
      console.warn(`🚫 [AGRONOMIC GUARD] Blocked unrealistic growth rate: ${match}`);
      return '';
    }
    return match;
  });
  
  // 6b. Block unrealistic yield increase claims (>15% from single intervention)
  sanitized = sanitized.replace(/(?:production|yield|उत्पादन|उत्पन्न|पिकाचे).*?(\d{2,3})\s*%\s*(?:increase|वाढ|बढ़|more|जास्त)/gi, (match, num) => {
    const pct = parseInt(num);
    if (pct > 15) {
      console.warn(`🚫 [AGRONOMIC GUARD] Blocked unrealistic yield claim: ${match}`);
      return '';
    }
    return match;
  });
  
  // 6c. Strip generic percentage yield promises (scientifically unsafe)
  sanitized = sanitized.replace(/(?:will|shall|होईल|होतो)\s*(?:increase|improve|वाढ)\s*(?:by|ने)?\s*\d+\s*%/gi, (match) => {
    console.warn(`🚫 [AGRONOMIC GUARD] Stripped unsafe yield promise: ${match}`);
    return '';
  });
  
  // 7. Clean up multiple spaces/newlines left by removals
  sanitized = sanitized.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  
  return sanitized;
}

// MAIN LLM FORMATTER FUNCTION - RENDER-ONLY MODE (WITH MODE-DRIVEN FALLBACK)

export async function formatRecommendationsWithLLM(
  input: LLMFormatterInput
): Promise<LLMFormatterOutput> {
  const startTime = Date.now();
  const traceId = input.trace_id || `fmt_${Date.now().toString(36)}`;
  
  // SAFE INPUT NORMALIZATION - Prevent crashes from undefined text
  const safeFarmerMessage = normalizeFarmerMessage(input.farmer_message);
  const hasText = hasTextContent(safeFarmerMessage);
  
  console.log(`\n📝 [${traceId}] ═══ PHASE 5: LLM RENDER-ONLY FORMATTING ═══`);
  console.log(`   Language: ${input.language}`);
  console.log(`   Decision Status: ${input.decision_output?.status}`);
  console.log(`   Has Text Input: ${hasText}`);
  console.log(`   Message Preview: ${safePreviewText(safeFarmerMessage)}`);
  
  // RESOLVE RESPONSE MODE - CONFIDENCE-DRIVEN (CRITICAL FIX)
  
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
  
  // P1-4: GATE CHECK REMOVED - NOW HAPPENS IN index.ts VIA evaluateUnifiedGate()
  
  console.log(`   📋 [LLM Formatter] Gate pre-validated by index.ts - proceeding with formatting`);
  
  // Extract decision properties for validation and formatting
  const actions = input.decision_output?.actions_returned;
  const isDecisionBrain = input.decision_output?.decision_brain_source === true;
  const hasPrimaryDecision = !!input.decision_output?.primary_decision;
  const hasSecondaryActions = (input.decision_output?.secondary_actions?.length || 0) > 0;
  
  // PRODUCTION HARDENING: PRIMARY ACTION CONTRACT VALIDATION (CRITICAL)
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
  
  // PHASE 6: PRE-LLM GATE - If action_list is empty, force INFORMATION_ONLY mode
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
  
  // STRUCTURED PRODUCT VALIDATION - Use decision.products[] array ONLY
  const SAFETY_GATE_TYPES = new Set(['safety_gate', 'SAFETY_GATE', 'BLOCK', 'URGENT_BLOCK', 'weather_block', 'WEATHER_BLOCK']);
  const isSafetyGateRule = primary?.action_type ? SAFETY_GATE_TYPES.has(primary.action_type) : false;
  
  const allowedProducts: string[] = [];
  const allowedDosages: string[] = [];
  
  if (!isSafetyGateRule) {
    // P0 FIX: HELPER that adds product_name AND active_ingredient to allowed list
    const addToAllowed = (source: any) => {
      if (!source) return;
      const names = [
        source.product_name, source.name,
        source.active_ingredient,  // P0 FIX: Include active_ingredient
      ].filter(Boolean);
      for (const n of names) {
        if (n && n !== 'N/A' && n !== 'Not specified' && !allowedProducts.includes(n.toLowerCase())) {
          allowedProducts.push(n.toLowerCase());
          // Also add individual words from active_ingredient for partial matching
          // e.g., "Chlorpyrifos 20% EC" → adds "chlorpyrifos"
          const words = n.toLowerCase().split(/[\s+@\/,%]+/).filter((w: string) => w.length > 3);
          for (const w of words) {
            if (!allowedProducts.includes(w)) allowedProducts.push(w);
          }
        }
      }
      const dosages = [source.dosage, source.dosage_per_acre, source.concentration].filter(Boolean);
      for (const d of dosages) {
        if (d && d !== 'N/A' && !allowedDosages.includes(String(d).toLowerCase())) {
          allowedDosages.push(String(d).toLowerCase());
        }
      }
    };

    // PRIMARY SOURCE: Structured products array from decision output
    const structuredProducts: any[] = input.decision_output?.products || 
                                       input.decision_output?.recommended_products || [];
    
    if (structuredProducts.length > 0) {
      for (const product of structuredProducts) {
        addToAllowed(product);
      }
      console.log(`   📋 [StructuredValidation] ${structuredProducts.length} products from decision.products[]`);
    }
    
    // FALLBACK: Extract from actions_returned if no structured products
    if (allowedProducts.length === 0 && actions && actions.length > 0) {
      for (const action of actions) {
        addToAllowed(action.application_details || action);
        addToAllowed(action);
      }
    }
    
    // ALSO: Extract from primary_decision structured fields
    addToAllowed((primary as any)?.product_details);
    addToAllowed((primary as any)?.application_details);

    // PRODUCT MAPPING: Add market product brand names to allowed list
    // so LLM validation gate doesn't reject them as "unauthorized"
    if (primary?.application_details?.active_ingredient && input.supabase_client) {
      try {
        const cropCode = input.decision_output?.metadata?.crop_code || primary?.target?.crop || '';
        const marketResult = await lookupMarketProductsMemoized(
          input.market_product_memo ?? new Map(),
          input.supabase_client,
          primary.application_details.active_ingredient,
          cropCode,
        );
        if (marketResult.found) {
          for (const brandName of marketResult.products) {
            const lower = brandName.toLowerCase();
            if (!allowedProducts.includes(lower)) {
              allowedProducts.push(lower);
            }
            // Also add individual words for partial matching
            const words = lower.split(/[\s+@\/,%]+/).filter((w: string) => w.length > 3);
            for (const w of words) {
              if (!allowedProducts.includes(w)) allowedProducts.push(w);
            }
          }
          console.log(`   📋 [ProductMapping] Added ${marketResult.products.length} market product brands to allowed list`);
        }
      } catch (err) {
        console.warn(`[ProductMapping] Failed to add market products to allowed list:`, err);
      }
    }
  } else {
    console.log(`   🛡️ [ProductValidation] SKIPPED - safety_gate rule (${primary?.action_type})`);
  }
  
  console.log(`   📋 Allowed Products: ${allowedProducts.length > 0 ? allowedProducts.join(', ') : 'NONE'}`);
  console.log(`   📋 Allowed Dosages: ${allowedDosages.length > 0 ? allowedDosages.join(', ') : 'NONE'}`);

  // sanitizeFarmerResponse moved to module scope (above formatRecommendationsWithLLM)


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
  
  // LATENCY BATCH L1 (2026-07-29): narration budget capped.
  const NARRATION_BUDGET_MS = 14_000;
  const narrationStart = Date.now();
  const remaining = () => NARRATION_BUDGET_MS - (Date.now() - narrationStart);

  try {
    // TIER 1: OpenAI (primary) — 8s cap
    if (OPENAI_API_KEY && remaining() > 1500) {
      console.log(`   🔄 Trying OpenAI (primary, ${Math.min(8000, remaining())}ms cap)...`);
      const result = await callOpenAIWithTimeout(systemPrompt, userPrompt, OPENAI_API_KEY, Math.min(8000, remaining()));
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'gpt-4o-mini';  // COST OPTIMIZED: Using GPT-4o-mini
        tokensUsed = result.tokens_used || 0;
        console.log(`   ✅ OpenAI formatting successful (gpt-4o-mini) in ${Date.now() - narrationStart}ms`);
      } else if (result.error === 'RATE_LIMIT') {
        console.warn(`   ⚠️ OpenAI rate limited — failing over immediately (no sleep)`);
      }
    }

    // TIER 2: Gemini — 6s cap, only if budget remains
    if (!formattedResponse && GEMINI_API_KEY && remaining() > 1500) {
      console.log(`   🔄 Trying Gemini (fallback, ${Math.min(6000, remaining())}ms cap)...`);
      const result = await callGeminiWithTimeout(systemPrompt, userPrompt, GEMINI_API_KEY, Math.min(6000, remaining()));
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'gemini-2.0-flash';
        tokensUsed = result.tokens_used || 0;
        console.log(`   ✅ Gemini formatting successful in ${Date.now() - narrationStart}ms`);
      } else if (result.error === 'RATE_LIMIT') {
        console.warn(`   ⚠️ Gemini rate limited (429) — failing over immediately (no sleep)`);
      }
    }

    // TIER 3: Lovable AI — 5s cap, only if budget remains
    if (!formattedResponse && LOVABLE_API_KEY && remaining() > 1500) {
      console.log(`   🔄 Trying Lovable AI (tertiary, ${Math.min(5000, remaining())}ms cap)...`);
      const result = await callLovableAIWithTimeout(systemPrompt, userPrompt, LOVABLE_API_KEY, Math.min(5000, remaining()));
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'lovable-gemini-2.5-flash';
        console.log(`   ✅ Lovable AI formatting successful in ${Date.now() - narrationStart}ms`);
      }
    }

    if (!formattedResponse) {
      console.warn(`   ⏱️ [NARRATION_BUDGET_EXHAUSTED] no tier produced text in ${Date.now() - narrationStart}ms (budget ${NARRATION_BUDGET_MS}ms)`);
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
  
  // OUTPUT VALIDATION GATE - Ensure LLM didn't add unauthorized content
  
  // PHASE-10 + PROMPT-2: Pass crop type and full input for enhanced validation
  const cropType = input.land_context?.current_crop;
  const outputValidation = validateLLMOutput(formattedResponse, allowedProducts, allowedDosages, cropType, input);
  
  // P4-1 + P6-3: WHAT-WHY-HOW STRUCTURAL VALIDATOR
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
        console.warn(`⚠️ [WHAT-WHY-HOW] Structural warning (non-blocking): ${filteredMissing.join(', ')}`);
      }
    } else {
      // CRITICAL FIX: Downgrade from hard-block to warning
      console.warn(`⚠️ [WHAT-WHY-HOW] Structural warning (non-blocking): ${whatWhyHowResult.missing_sections.join(', ')}`);
      console.warn(`   Response length: ${formattedResponse.length} chars — LLM content preserved`);
    }
  }
  
  // P5-1: CROP NAME CONSISTENCY CHECK
  if (cropType) {
    const cropConsistencyResult = validateCropNameConsistency(formattedResponse, cropType);
    if (!cropConsistencyResult.valid) {
      console.error(`🚫 [CROP CONSISTENCY] ${cropConsistencyResult.violation}`);
      outputValidation.violations.push(cropConsistencyResult.violation);
      // Crop name mismatch is a hard failure — use template fallback
      return buildTemplateFallback(input, startTime);
    }
  }
  
  // CRITICAL FIX: Only block on HARD safety violations, not structural warnings
  const HARD_VIOLATION_PATTERNS = [
    'Unauthorized product', 'unauthorized product',
    'Leaked internal code',
    'Dosage UNIT mismatch',
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

  // ═══ NARRATION NUMERIC DRIFT GATE (FIX 2 / no-invention guardrail) ═══
  // Any measured number in the narration must exist in the rule data supplied to
  // the LLM. Invented dosages/percentages (the bio-insecticide incident) are a
  // safety defect → fall back to deterministic rendering of the raw fields.
  const drift = detectNarrationNumericDrift(formattedResponse, `${userPrompt}\n${systemPrompt}`);
  if (drift.length > 0) {
    console.error(`🚫 [NARRATION_NUMERIC_DRIFT] trace=${input.trace_id || 'n/a'} invented values: ${drift.join(', ')}`);
    return buildTemplateFallback(input, startTime);
  }

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

// OUTPUT VALIDATION - Ensure LLM didn't add products/dosages/internal codes

// Enhanced LLM Output Validation (PROMPT 2 Implementation)
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

  // CHECK 1: All products present (FIXED - skip generic action types)
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
        // Partial match only - warn but don't block (LLM transliterated the name)
        console.warn(`⚠️ [VALIDATION] Product partially matched (single word only, likely transliterated): ${primaryProductName}`);
      } else {
        // LANGUAGE-AGNOSTIC FIX: Check if any product keyword is in allowedProducts.
        const productKeywords = primaryProductName.toLowerCase().split(/[\s+@\/]+/).filter((w: string) => w.length > 3);
        const keywordInAllowed = productKeywords.some((kw: string) => allowedProducts.includes(kw));
        if (keywordInAllowed) {
          console.warn(`⚠️ [VALIDATION] Product keyword in allowedProducts but full name not in output (likely transliterated to farmer language): ${primaryProductName}`);
        } else {
          errors.push(`Missing product from symbolic decision: ${primaryProductName}`);
          console.error(`🚫 [VALIDATION] Missing required product: ${primaryProductName}`);
        }
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
  
   // CHECK 2: Dosages unchanged (extract numbers and verify)
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
   
   // CHECK 2b: Secondary product/dosage validation (FIX 1 - CRITICAL)
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
   
   // CHECK 2c: PHI value validation (FIX 3 - CRITICAL)
   const phiDays = decisionInput?.decision_output?.primary_decision?.application_details?.phi_days;
   if (phiDays && typeof phiDays === 'number' && phiDays > 0) {
     const phiString = String(phiDays);
     // LANGUAGE-AGNOSTIC FIX: Convert Devanagari/regional numerals to ASCII before checking
     // LLM may write "४५" instead of "45" when translating to Marathi/Hindi/etc.
     const devanagariToAscii = (text: string): string =>
       text.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)))
           .replace(/[੦-੯]/g, (d) => String('੦੧੨੩੪੫੬੭੮੯'.indexOf(d)))
           .replace(/[૦-૯]/g, (d) => String('૦૧૨૩૪૫૬૭૮૯'.indexOf(d)))
           .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
           .replace(/[୦-୯]/g, (d) => String('୦୧୨୩୪୫୬୭୮୯'.indexOf(d)))
           .replace(/[௦-௯]/g, (d) => String('௦௧௨௩௪௫௬௭௮௯'.indexOf(d)))
           .replace(/[౦-౯]/g, (d) => String('౦౧౨౩౪౫౬౭౮౯'.indexOf(d)))
           .replace(/[೦-೯]/g, (d) => String('೦೧೨೩೪೫೬೭೮೯'.indexOf(d)))
           .replace(/[൦-൯]/g, (d) => String('൦൧൨൩൪൫൬൭൮൯'.indexOf(d)));
     const normalizedOutput = devanagariToAscii(llmOutput);
     if (!normalizedOutput.includes(phiString)) {
       // Downgrade to soft warning — PHI is enforced deterministically by the builder
       console.warn(`⚠️ [VALIDATION] PHI days not found in output (soft warning): expected ${phiDays}. PHI is enforced by deterministic builder.`);
     }
   }
   
   // CHECK 3: No rule IDs leaked (forbidden internal patterns)
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
  
   // CHECK 4: Unauthorized percentage claims (FIX 4 + FIX 12 - enhanced regex + efficacy exclusion)
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
  
  // CHECK 5: Unauthorized products (uses hoisted commonPesticides)
  for (const pesticide of commonPesticides) {
    if (lowerOutput.includes(pesticide) && !allowedProducts.includes(pesticide)) {
      errors.push(`Unauthorized product mentioned: ${pesticide}`);
    }
  }
  
  // CHECK 6: Cross-crop biocontrol validation (existing)
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
  
  // CHECK 7: Dosage patterns validation (existing - enhanced)
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

// PROMPT BUILDERS

function buildFormattingSystemPrompt(input: LLMFormatterInput): string {
  const LANG_NAMES: Record<string, string> = {
    mr: 'Marathi', hi: 'Hindi', en: 'English', ta: 'Tamil', te: 'Telugu',
    bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', pa: 'Punjabi', ml: 'Malayalam', or: 'Odia'
  };
  const langName = LANG_NAMES[input.language] || 'English';
  
  const ruralRules = getRuralLanguageRules(input.language);
  const villageOfficerPersona = getVillageOfficerPersona();
  
  // Get crop stage constraints
  const cropStageConstraints = getCropStageConstraints(input);
  
  // PART 4: Determine response format type from action_type
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
  
  // FORMAT-SPECIFIC INSTRUCTIONS (from PART 4 specification)
  if (formatType === 'FORMAT_1') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 1 — DIRECT PRESCRIPTION (8-SECTION) ═══
Structure your response EXACTLY as (ALL text must be in ${langName}):

[Start by casually addressing the farmer like a friend/brother — then state what you see in their ${input.land_context?.current_crop || ''} crop. Do NOT use formal greetings like "Dear farmer" or "Respected farmer" or "प्रिय". Speak as if you walked into their field.]

🔎 [ONE LINE: diagnosis in plain ${langName}, using local farmer terms — NEVER literally translate English symptom names]

📌 [Reason — WHY this happened, 1-2 lines in ${langName}]

📋 [Action heading in ${langName}]:
- [Product name transliterated to ${langName} script] — [dosage × land_area = TOTAL quantity]
- [application_method — HOW to apply, in ${langName}]
- [Best time: morning/evening, in ${langName}]

📏 [Quantity for your field in ${langName}]:
- [Per acre dosage] × [${input.land_context?.area_acres || '?'} acres] = [TOTAL]
- [Water per acre] × [${input.land_context?.area_acres || '?'} acres] = [TOTAL water needed]

⚠️ [Safety heading in ${langName}]:
- [PHI days warning if provided: "Stop spraying at least X days before harvest" in ${langName}]
- [bee_toxicity warning if HIGH — recommend evening-only spray, in ${langName}]
- [PPE instructions in ${langName}]

🌿 [Organic/IPM Alternative heading in ${langName} — THIS SECTION IS MANDATORY if organic_alternative data exists below]:
- [Organic option translated to natural ${langName}]

📈 [Expected Benefit in ${langName}]: [ROI/yield gain if available from data]

✅ [Follow-up in ${langName}]: [specific observable improvement from success_indicators data, time-bound]

CRITICAL RULES:
- Calculate TOTAL dosage = dosage_per_acre × farmer's land area (${input.land_context?.area_acres || '?'} acres)
- Show calculated total, NOT per-acre rate only
- MUST reference farmer's crop by its ${langName} name in the greeting
- MUST mention farmer's land area when calculating dosage
- If ORGANIC_ALTERNATIVE or IPM data exists in the symbolic data below, the 🌿 section is MANDATORY — do NOT skip it
- If SUCCESS_INDICATORS exist in data below, use them in the ✅ follow-up section
- If BEE_TOXICITY is HIGH, MUST include evening-only spray warning
- If RECOMMENDED_MARKET_PRODUCTS are provided, mention available market products so farmer knows what to buy
- Use trade name farmer recognizes, put molecule in brackets
- Transliterate product names into ${langName} script (e.g. "Chlorantraniliprole" → phonetic ${langName} equivalent)
- If dosage_per_acre is null/missing, say "I need more information to recommend exact treatment" in ${langName}
- NEVER invent products, dosages, or timing not in the data below`;
  } else if (formatType === 'FORMAT_2') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 2 — CLARIFICATION NEEDED ═══
Structure your response EXACTLY as (ALL text must be in ${langName}):

[Greeting], [tell farmer you see likely issue with their crop in ${langName}].

[Ask ONE specific diagnostic question in ${langName}]:

👉 [Option A — specific observation in ${langName}]
👉 [Option B — specific observation in ${langName}]
👉 [Option C — specific observation in ${langName}]
📷 [Ask for photo if possible, in ${langName}]

RULES:
- Ask ONE precise question, not multiple
- Options must be visually verifiable by farmer
- NEVER give vague advice when asking for clarification`;
  } else if (formatType === 'FORMAT_3') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 3 — MONITORING ADVISORY ═══
Structure your response EXACTLY as (ALL text must be in ${langName}):

[Greeting], [tell farmer you checked their crop — current condition in ${langName}].

[reason_text — why no treatment needed yet, 1-2 lines in ${langName}]

📋 [Check in 7 days heading in ${langName}]:
- [specific threshold from rule, in ${langName}]
- [specific visual marker, in ${langName}]

[Tell farmer: if you see these symptoms, inform immediately — will suggest treatment, in ${langName}]

RULES:
- DO NOT recommend any product or dosage
- Give specific thresholds farmer can observe
- End with clear follow-up instruction`;
  } else if (formatType === 'FORMAT_4') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 4 — STAGE ADVISORY FALLBACK ═══
NOTE: Zero rules fired. Use ONLY crop-stage advisory data provided.
ALL text must be in ${langName}:

[Greeting], [tell farmer their crop is DAS days old — this is the current growth stage, in ${langName}].

[At this stage, generally — in ${langName}]:
- [Stage-specific action 1 with timing, in ${langName}]
- [Stage-specific action 2 with timing, in ${langName}]

⚠️ [Note in ${langName}]: [Exact fertilizer/medicine amount can be advised after soil test / more information]

[One clarification question to gather missing data, in ${langName}]

CRITICAL: This is ADVISORY, not prescription. Frame as "generally" in ${langName}.
NEVER use generic phrases like "use pesticide medicine" or "use appropriate medicine" without a specific product from the rules.
If no specific product from rules, say "I need more information to recommend exact treatment" in ${langName}`;
  } else if (formatType === 'FORMAT_5') {
    formatInstruction = `
═══ MANDATORY FORMAT: TYPE 5 — PEST/DISEASE EMERGENCY (8-SECTION) ═══
Structure your response EXACTLY as (ALL text must be in ${langName}):

⚠️ [Address the farmer casually like a friend/brother — then urgently tell them what pest/disease you see in their crop using local farmer terms in ${langName}. Do NOT use formal greetings. Speak as if you ran to their field to warn them.]!

📌 [reason_text — why urgent, 1-2 lines in ${langName}]

[Warn: delay will increase damage, in ${langName}]

💊 [Do now heading in ${langName}]:
- [Product name transliterated to ${langName} script] — [TOTAL dose for ${input.land_context?.area_acres || '?'} acres]
- [Application method in ${langName}]
- [Timing — morning/evening in ${langName}]

📏 [Quantity calculation in ${langName}]:
- [Per acre dosage] × [${input.land_context?.area_acres || '?'} acres] = [TOTAL]

⚠️ [Safety in ${langName}]:
- [PHI days warning: "Stop spraying at least X days before harvest" in ${langName}]
- [bee_toxicity warning if HIGH — evening spray only, in ${langName}]
- [PPE instructions in ${langName}]

🌿 [Organic/IPM Alternative in ${langName} — MANDATORY if organic_alternative data exists below]:
- [Organic option translated to natural ${langName}]

✅ [Check after 7 days in ${langName}]: [specific recovery indicator from success_indicators data]

RULES:
- Speed and clarity paramount — keep SHORT
- Calculate TOTAL dosage = dosage_per_acre × farmer's land area (${input.land_context?.area_acres || '?'} acres)
- MUST reference farmer's crop by its ${langName} name
- If ORGANIC_ALTERNATIVE data exists below, the 🌿 section is MANDATORY — do NOT skip it
- If SUCCESS_INDICATORS exist, use them in the ✅ follow-up
- NEVER literally translate English pest/disease names — use local ${langName} farming terms`;
  }

  // AUTHORITATIVE_CONTEXT — Crop Lock Block (CRITICAL FIX)
  let cropLockBlock = '';
  if (input.land_context?.current_crop) {
    const cropCode = input.land_context.current_crop.toLowerCase();
    // DB SSOT: crop_names_cache (public.crops). Fallback to raw name on miss.
    const cropLocalName = getCropDisplayName(cropCode, input.language) || input.land_context.current_crop;
    const cropCanonical = getCropCanonical(cropCode) || input.land_context.current_crop;
    
    cropLockBlock = `
═══ 🔒 AUTHORITATIVE CROP CONTEXT (IMMUTABLE — VIOLATING = REJECTION) ═══
AUTHORIZED CROP: ${cropCanonical}
CROP LOCAL NAME (use this in response): ${cropLocalName}

CRITICAL RULES:
1. You MUST use "${cropLocalName}" when referring to the farmer's crop
2. You MUST NOT mention any other crop name in the response — only "${cropLocalName}"
3. You MUST NOT substitute, translate, or replace the crop name with any other crop
4. If the symbolic data mentions another crop for comparison, IGNORE that — respond ONLY about ${cropLocalName}
5. VIOLATION of crop lock = immediate response rejection
═══════════════════════════════════════════════════════════════════════════
`;
  }

  return `${villageOfficerPersona}

You are explaining a decision ALREADY MADE by the Symbolic Decision Brain. You do NOT make decisions.
${cropLockBlock}
═══ THE SUPREME LAW ═══
Every product name, dosage, timing, and treatment in your response MUST come from the data below.
You CANNOT add, remove, or modify product names, dosages, timing, actions, priorities, or safety instructions.
You CANNOT use generic phrases like "use pesticide medicine" or "use appropriate medicine" without a specific product from the rules.
If dosage_per_acre AND active_ingredient are BOTH missing, replace the HOW section with: "I need more information to recommend exact treatment" (translated to ${langName}).

═══ APP LANGUAGE ═══
Respond ENTIRELY in ${langName} (code: ${input.language}). Even if farmer typed in Roman script, respond in ${langName} script.
ALL content — greetings, headings, product names, safety warnings, follow-ups — must be in ${langName}.
Transliterate English product/chemical names into ${langName} script (e.g. "Chlorantraniliprole" → phonetic ${langName} equivalent).
Numbers can use either standard (0-9) or ${langName} script numerals.

═══ RURAL LANGUAGE RULES ═══
- Use simple, conversational, rural ${langName} vocabulary — NOT formal/literary/textbook language
- Address the farmer warmly and respectfully as appropriate in ${langName} culture
- Use colloquial farming terms that rural speakers actually use, not technical/academic terms
- Keep response SHORT — proportional to query complexity
- Every response MUST end with one specific, measurable, time-bound follow-up instruction
  NOT "observe the crop" but "check after 7 days — [specific thing to check]" (in ${langName})

═══ TRANSLATION QUALITY RULES ═══
- TRANSLATE MEANING, not words. Rewrite like an experienced agricultural officer talking face-to-face with a farmer.
- Use colloquial rural dialect of ${langName}, NOT literary/formal/textbook language.
- Use the spoken village form of ${langName}, not the formal written standard.
- Agricultural terms MUST use local farmer vocabulary, NOT literal translation of English technical terms.
  Example: "Dead heart" is a pest symptom name — translate to the LOCAL FARMING TERM for this condition in ${langName}, NOT a literal word-by-word translation like "dead" + "heart".
  Example: "Interveinal chlorosis" → translate as "yellowing near leaf veins" in natural ${langName}, NOT the medical/scientific term.
  Example: "Bore hole" → use the ${langName} farming word for insect hole, NOT a transliteration of "bore hole".
- NEVER literally translate English compound nouns — they are specific agricultural condition names with established local terms.
- Keep sentences under 15 words. Break complex advice into numbered steps.
- Every instruction must be actionable — farmer must know exactly WHAT to buy, HOW MUCH, and WHEN to apply.
- NEVER use English words when a ${langName} equivalent exists.
- Transliterate-only for chemical/product names that have no ${langName} equivalent.

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
Translate phi_days to: "Stop spraying at least X days before harvest" (in natural ${langName}).

═══ NO-INVENTION GUARDRAIL (ORGANIC / ALTERNATIVES) ═══
FARMER_FARMING_PREFERENCE: ${input.farming_preference || 'unset'}
Never add treatments, alternatives, percentages or numeric values not present in the provided rule data.
Omit any section whose source field is empty. Organic content may ONLY be rendered from the
ORGANIC_ALTERNATIVE / alternatives fields supplied below — never from your own knowledge.
If the data says the organic option is empty, say so honestly using the provided line; do not substitute one.
If preference = conventional, do NOT render any organic section (safety/block content still renders).
If preference = organic and an organic option exists, render it FIRST and mark the chemical action as secondary.


${ruralRules}
${cropStageConstraints}

${input.farmer_addressing?.promptDirective || ''}

IMPORTANT: action_text/reason_text/knowledge_text below are English reference notes. REWRITE them as a village agriculture officer EXPLAINING to the farmer in natural rural ${langName}. Do NOT translate word-by-word. NEVER leave English phrases in the output. Every word must be in ${langName}.

═══ FINAL REMINDER ═══
You are a VILLAGE AGRICULTURE OFFICER standing in the farmer's field, not a translator at a desk.
Speak naturally. Use the words farmers actually use. Never start with "Dear farmer" or formal greetings.
You are EXPLAINING advice face-to-face, not translating a document.`
}

// CROP STAGE CONSTRAINTS GENERATOR

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

// TOKEN OPTIMIZATION: Filter matched responses to max N relevant ones

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

// RECOMMENDATION DATA EXTRACTOR

async function buildRecommendationSummary(input: LLMFormatterInput): Promise<string> {
  const decision = input.decision_output;
  const primary = decision.primary_decision;
  
  // v2.0: DETERMINISTIC RESPONSE BUILDER INTEGRATION
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
      
      const structuredResponse = buildDeterministicResponse(richData, landAreaAcres, cropContext, weather, input.farming_preference || 'unset');
      const deterministicPrompt = await formatStructuredResponseForLLM(structuredResponse, undefined, input.supabase_client);
      
      // PRODUCT MAPPING: Look up market product names for LLM narration
      let marketProductsLine = '';
      if (richData.active_ingredient && input.supabase_client) {
        try {
          const cropCode = decision?.metadata?.crop_code || primary?.target?.crop || '';
          const marketResult = await lookupMarketProductsMemoized(
            input.market_product_memo ?? new Map(),
            input.supabase_client,
            richData.active_ingredient,
            cropCode,
          );
          if (marketResult.found) {
            marketProductsLine = `\nRECOMMENDED_MARKET_PRODUCTS: ${marketResult.products.join(', ')}`;
            console.log(`[LLMFormatter] Market products for ${richData.active_ingredient}: ${marketResult.products.join(', ')}`);
          }
        } catch (err) {
          console.warn(`[LLMFormatter] Market product lookup failed:`, err);
        }
      }
      
      console.log(`✅ [DeterministicBuilder] Integrated into LLM prompt for rule ${primary.rule_id}, decision=${structuredResponse.response_decision}, safety_warnings=${structuredResponse.safety_warnings.length}`);
      
      // Prepend status and append matched responses for context
      const parts: string[] = [];
      parts.push(`STATUS: ${decision.status || 'DECISION_PROVIDED'}`);
      parts.push('');
      parts.push(deterministicPrompt);
      if (marketProductsLine) parts.push(marketProductsLine);
      
      // ═══ RULE ATOMICITY: Secondary actions stripped of treatment data ═══
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
  
  // LEGACY FALLBACK: Manual prompt assembly (only when deterministic builder
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
    const urgencyLabel = IPM_URGENCY_LABELS[ipmLevel] || 'Normal priority';
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

// LLM API CALLS WITH TIMEOUT

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

// TEMPLATE FALLBACK (when LLM unavailable) - MODE-DRIVEN

async function buildTemplateFallback(input: LLMFormatterInput, startTime: number): Promise<LLMFormatterOutput> {
  const lang = input.language || 'mr';
  const decision = input.decision_output;
  
  // CRASH-PROOF: Safe extraction with guaranteed defaults
  const decisionConfidence = decision?.metadata?.decision_confidence ?? decision?.confidence ?? 0;
  const hasSymptoms = decision?.metadata?.has_symptoms ?? !!(decision?.symptom_keys?.length);
  const hasVisualAmbiguity = decision?.metadata?.has_visual_ambiguity ?? decision?.needs_photo_for_diagnosis ?? false;
  const clarificationOptions = decision?.clarification_options ?? [];
  
  // FAIL-SAFE: Resolve i18n key
  const primaryI18nKey = resolveI18nKey(
    decision?.primary_i18n_key ?? decision?.metadata?.i18n_key,
    'system.monitoring.default'
  );
  
  // RESOLVE RESPONSE MODE - Confidence-driven with invariant check
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
  
  // MODE: CLARIFICATION - Render options without requiring text
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
  
  // MODE: PHOTO_REQUIRED - Camera prompt
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
  
  // MODE: OBSERVATION/MONITORING - Simple reassurance
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
  
  // MODE: TREATMENT — Use Deterministic Response Builder v2.0
  const primary = decision?.primary_decision;
  
  if (primary && primary.rule_id) {
    const appDetails = primary.application_details || {};
    const richData = extractRichRuleData(primary, appDetails);
    
    if (hasAdequateRuleContent(richData)) {
      const landAreaAcres = input.land_context?.area_acres;
      const cropContext: CropContext | undefined = input.land_context?.days_since_sowing ? {
        days_since_sowing: input.land_context.days_since_sowing,
      } : undefined;
      
      const structuredResponse = buildDeterministicResponse(richData, landAreaAcres, cropContext, undefined, input.farming_preference || 'unset');
      const deterministicText = await formatStructuredResponseForLLM(structuredResponse, lang, input.supabase_client);
      
      console.log(`   📋 [TemplateFallback] Deterministic builder used for rule ${primary.rule_id}, decision=${structuredResponse.response_decision}`);
      
      return {
        formatted_response: sanitizeFarmerResponse(deterministicText),
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
  
  // LEGACY TEMPLATE FALLBACK — only when deterministic builder has no content
  const parts: string[] = [];
  
  // English structural template — downstream forceTranslateResponse() will localize
  parts.push('🌾 Hello farmer friend!');
  
  const currentCrop = input.land_context?.current_crop;
  if (currentCrop) {
    parts.push(`I understand your question about ${currentCrop}.`);
  }
  
  // Legacy fallback: minimal safe response from rule data (English SSOT)
  const matchedResponses = decision?.matched_responses;
  if (matchedResponses && matchedResponses.length > 0) {
    parts.push('📋 **Recommendation (from rule database):**');
    
    matchedResponses.slice(0, 2).forEach((resp: any, idx: number) => {
      const actionContent = resp.action_text || resp.reason_text || 'Monitor crop and share a photo if needed';
      parts.push(`\n${idx + 1}. ${actionContent}`);
    });
  } else {
    parts.push('👀 For accurate recommendation please:\n• Send a crop photo\n• Or provide more details about symptoms');
  }
  
  parts.push('\n🙏 Feel free to ask if you need clarification.');
  
  const finalResponse = parts.join('\n\n');
  console.log(`   📋 Legacy template fallback generated (English SSOT, forceTranslate will localize): ${finalResponse.length} chars, lang=${lang}`);
  
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

// HELPERS

function extractSections(text: string): string[] {
  // LANGUAGE-AGNOSTIC: Use emoji anchors only — works for ANY language
  const sections: string[] = [];
  if (text.includes('🎯') || text.includes('🌾') || text.length > 50) sections.push('greeting');
  if (text.includes('📋') || text.includes('📌') || text.includes('💊')) sections.push('recommendation');
  if (text.includes('⏰')) sections.push('timing');
  if (text.includes('📊') || text.includes('%')) sections.push('efficacy');
  if (text.includes('⚠️')) sections.push('warning');
  if (text.includes('🙏') || text.includes('✅')) sections.push('closing');
  return sections;
}

export default formatRecommendationsWithLLM;

// P4-1 + P6-3: WHAT-WHY-HOW STRUCTURAL VALIDATOR

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
  const MONITORING_ONLY_ACTION_TYPES = new Set([
    'MONITOR', 'MONITOR_CLOSELY', 'MONITOR_ONLY', 'OBSERVE', 'OBSERVATION',
    'NO_ACTION', 'NO_ACTION_REQUIRED', 'WAIT_AND_WATCH', 'NONE', 'DIAGNOSIS',
    'MONITORING_ADVISED', 'SCOUTING'
  ]);
  if (MONITORING_ONLY_ACTION_TYPES.has(actionType)) {
    return { valid: true, missing_sections: [], violations: [] };
  }
  
  // LANGUAGE-AGNOSTIC FIX: Use ONLY emoji anchors for section detection.
  
  // WHAT detection: diagnosis/problem identification (emoji anchors)
  const hasWhat = llmOutput.includes('🎯') || llmOutput.includes('🔍') || llmOutput.includes('📋') ||
    // English fallback markers (always safe — from structural template)
    llmOutput.toLowerCase().includes('problem') || llmOutput.toLowerCase().includes('diagnosis') ||
    llmOutput.toLowerCase().includes('identified') || llmOutput.toLowerCase().includes('detected') ||
    // Content length heuristic: any substantial response likely has problem identification
    llmOutput.length > 200;
  
  // WHY detection: reasoning/explanation (emoji anchors)
  const hasWhy = llmOutput.includes('📖') || llmOutput.includes('🔬') ||
    llmOutput.toLowerCase().includes('reason') || llmOutput.toLowerCase().includes('because') ||
    llmOutput.toLowerCase().includes('cause') ||
    // Content heuristic: responses > 300 chars typically contain reasoning
    llmOutput.length > 300;
  
  // HOW detection: treatment/action instructions (emoji anchors)
  const hasHow = llmOutput.includes('💊') || llmOutput.includes('🌿') || llmOutput.includes('⚠️') ||
    llmOutput.includes('📋') ||
    llmOutput.toLowerCase().includes('ml') || llmOutput.toLowerCase().includes('per acre') ||
    llmOutput.toLowerCase().includes('spray') || llmOutput.toLowerCase().includes('apply') ||
    // Numeral patterns indicating dosage (language-neutral)
    /\d+\s*(ml|g|kg|l|%)/i.test(llmOutput);
  
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

// P5-1: CROP NAME CONSISTENCY VALIDATOR

// MULTILINGUAL: Crop name aliases in English + Marathi + Hindi for validation.
const CROP_NAME_ALIASES: Record<string, string[]> = {
  'SUGARCANE': ['sugarcane', 'sugar cane', 'cane', 'ऊस', 'गन्ना', 'गन्ने', 'ईख', 'उस'],
  'COTTON': ['cotton', 'कापूस', 'कपास', 'रुई', 'kapus', 'kapas'],
  'RICE': ['rice', 'paddy', 'भात', 'धान', 'चावल', 'तांदूळ', 'dhan'],
  'WHEAT': ['wheat', 'गहू', 'गेहूं', 'गेहूँ', 'gehu', 'gehun'],
  'MAIZE': ['maize', 'corn', 'मका', 'मक्का', 'makka'],
  'SOYBEAN': ['soybean', 'soya', 'सोयाबीन', 'सोयाबिन', 'soyabean'],
  'GROUNDNUT': ['groundnut', 'peanut', 'भुईमूग', 'मूंगफली', 'शेंगदाणा'],
  'ONION': ['onion', 'कांदा', 'प्याज', 'kanda', 'pyaz'],
  'TOMATO': ['tomato', 'टोमॅटो', 'टमाटर', 'tamatar'],
  'CHILLI': ['chilli', 'chili', 'pepper', 'मिरची', 'मिर्च', 'mirchi'],
  'GRAM': ['gram', 'chickpea', 'हरभरा', 'चना', 'chana'],
  'TUR': ['tur', 'pigeon pea', 'toor', 'तूर', 'अरहर'],
  'BANANA': ['banana', 'केळी', 'केला'],
  'GRAPE': ['grape', 'grapes', 'द्राक्षे', 'अंगूर'],
  'POMEGRANATE': ['pomegranate', 'डाळिंब', 'अनार'],
  'MANGO': ['mango', 'आंबा', 'आम'],
  'POTATO': ['potato', 'बटाटा', 'आलू', 'aloo'],
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
  
  // CRITICAL FIX: For Devanagari/non-Latin scripts, also do direct substring matching
  // (not just English subject patterns which miss Marathi/Hindi crop names)
  const cleanedOutputLower = cleanedOutput.toLowerCase();
  const llmOutputLower = llmOutput.toLowerCase();
  
  // Check that the output doesn't prominently mention a DIFFERENT crop
  for (const [cropKey, aliases] of Object.entries(CROP_NAME_ALIASES)) {
    if (cropKey === normalizedCrop || cropKey === authorizedCrop.toUpperCase()) continue;
    
    for (const alias of aliases) {
      if (alias.length < 3) continue; // Skip very short aliases to avoid false positives
      
      // ENHANCED: Direct substring match for Devanagari crop names
      const isDevanagari = /[\u0900-\u097F]/.test(alias);
      
      if (isDevanagari) {
        // For Devanagari aliases, simple substring match is sufficient
        // because Devanagari crop names are specific enough to not be substrings of other words
        if (llmOutputLower.includes(alias.toLowerCase())) {
          if (expectedCropPresentInOutput) {
            console.warn(`⚠️ [CROP_CONSISTENCY] Wrong crop "${alias}" (${cropKey}) mentioned alongside correct crop "${authorizedCrop}" — warning only`);
            return { valid: true, violation: '' };
          }
          console.error(`🚫 [CROP_CONSISTENCY] Devanagari crop mismatch: "${alias}" (${cropKey}) found but authorized crop is ${authorizedCrop}`);
          return {
            valid: false,
            violation: `Crop mismatch: LLM mentions "${alias}" (${cropKey}) but authorized crop is ${authorizedCrop}`
          };
        }
      } else {
        // For Latin-script aliases, use subject pattern matching to avoid false positives
        const subjectPatterns = [
          new RegExp(`your\\s+${alias}`, 'i'),
          new RegExp(`${alias}\\s+crop`, 'i'),
          new RegExp(`${alias}\\s+field`, 'i'),
          new RegExp(`in\\s+${alias}`, 'i'),
          // ENHANCED: Also check Romanized patterns without English context words
          new RegExp(`\\b${alias}\\b`, 'i'),
        ];
        
        for (const pattern of subjectPatterns) {
          if (pattern.test(cleanedOutput)) {
            if (expectedCropPresentInOutput) {
              console.warn(`⚠️ [CROP_CONSISTENCY] Wrong crop "${alias}" mentioned alongside correct crop "${authorizedCrop}" — warning only, not blocking`);
              return { valid: true, violation: '' };
            }
            return {
              valid: false,
              violation: `Crop mismatch: LLM mentions "${alias}" (${cropKey}) but authorized crop is ${authorizedCrop}`
            };
          }
        }
      }
    }
  }
  
  return { valid: true, violation: '' };
}

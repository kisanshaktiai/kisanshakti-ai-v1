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
import { 
  getProductName, 
  getActionTranslation 
} from './communication-translation-dictionary.ts';

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

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE MODE RENDERER - Mode-driven output generation
// ═══════════════════════════════════════════════════════════════════════════
import {
  renderByMode,
  resolveResponseMode,
  assertResponseModeInvariant,
  type ModeRenderedOutput
} from '../utils/response-mode-renderer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface LLMFormatterInput {
  farmer_message: string;
  language: 'mr' | 'hi' | 'en' | 'ta' | 'te' | 'bn' | 'gu' | 'kn' | 'pa';
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

const IPM_URGENCY_LABELS: Record<string, Record<string, string>> = {
  'LEVEL_1': { mr: 'निरीक्षण करा', hi: 'निगरानी करें', en: 'Monitor' },
  'LEVEL_2': { mr: 'सांस्कृतिक पद्धत वापरा', hi: 'सांस्कृतिक तरीके अपनाएं', en: 'Use cultural practices' },
  'LEVEL_3': { mr: 'यांत्रिक नियंत्रण करा', hi: 'यांत्रिक नियंत्रण करें', en: 'Mechanical control' },
  'LEVEL_4': { mr: 'जैविक नियंत्रण करा', hi: 'जैविक नियंत्रण करें', en: 'Biological control' },
  'LEVEL_5': { mr: '⚠️ तुरंत करा', hi: '⚠️ तुरंत करें', en: '⚠️ Do immediately' },
};

// ═══════════════════════════════════════════════════════════════════════════
// TECHNICAL TERM TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const PEST_TRANSLATIONS: Record<string, Record<string, string>> = {
  'SHOOT_BORER': { mr: 'अंकुर बेधक (खोड किडा)', hi: 'अंकुर बेधक (तना छेदक)', en: 'Shoot Borer' },
  'STEM_BORER': { mr: 'खोड किडा', hi: 'तना छेदक', en: 'Stem Borer' },
  'BOLLWORM': { mr: 'बोंड अळी', hi: 'बॉलवर्म', en: 'Bollworm' },
  'APHID': { mr: 'मावा', hi: 'माहूं', en: 'Aphid' },
  'WHITEFLY': { mr: 'पांढरी माशी', hi: 'सफेद मक्खी', en: 'Whitefly' },
  'THRIPS': { mr: 'तुडतुडे', hi: 'थ्रिप्स', en: 'Thrips' },
  'JASSID': { mr: 'तुडतुडा', hi: 'जैसिड', en: 'Jassid' },
  'MEALYBUG': { mr: 'पिठ्या ढेकूण', hi: 'मिलीबग', en: 'Mealybug' },
};

const DISEASE_TRANSLATIONS: Record<string, Record<string, string>> = {
  'RUST': { mr: 'तांबेरा', hi: 'रतुआ', en: 'Rust' },
  'WILT': { mr: 'मर रोग', hi: 'उकठा', en: 'Wilt' },
  'BLAST': { mr: 'करपा', hi: 'ब्लास्ट', en: 'Blast' },
  'BLIGHT': { mr: 'करपा', hi: 'झुलसा', en: 'Blight' },
  'LEAF_SPOT': { mr: 'पान ठिपके', hi: 'पत्ती धब्बा', en: 'Leaf Spot' },
  'POWDERY_MILDEW': { mr: 'भुरी', hi: 'चूर्णिल आसिता', en: 'Powdery Mildew' },
  'DOWNY_MILDEW': { mr: 'केवडा', hi: 'मृदुरोमिल आसिता', en: 'Downy Mildew' },
};

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
  const decisionConfidence = input.decision_output?.metadata?.decision_confidence ?? 
                              input.decision_output?.confidence ?? 0;
  const hasSymptoms = input.decision_output?.metadata?.has_symptoms ?? 
                       !!(input.decision_output?.symptom_keys?.length);
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
  
  // VALIDATION GATE 2: If no primary decision and no actions, restrict to information
  if (!hasPrimaryDecision && (!actions || actions.length === 0)) {
    console.warn(`
⚠️ [SYMBOLIC-ONLY GATE] No primary decision and no actions
   LLM restricted to rendering general information only.
   TREATMENT RECOMMENDATIONS ARE BLOCKED.
    `);
  }
  
  // VALIDATION GATE 2: Check product details are present when actions exist
  const allowedProducts: string[] = [];
  const allowedDosages: string[] = [];
  
  if (actions && actions.length > 0) {
    for (const action of actions) {
      const productName = action.application_details?.product_name || action.product_name;
      const dosage = action.application_details?.dosage || action.dosage;
      
      if (productName) allowedProducts.push(productName.toLowerCase());
      if (dosage) allowedDosages.push(dosage.toLowerCase());
    }
    
    const primaryAction = actions.find((a: any) => a.type === 'primary');
    if (primaryAction) {
      const hasProductName = !!primaryAction.application_details?.product_name || !!primaryAction.product_name;
      const hasDosage = !!primaryAction.application_details?.dosage || !!primaryAction.dosage;
      
      if (!hasProductName || !hasDosage) {
        console.warn(`
⚠️ [INPUT VALIDATION GATE] WARNING: Incomplete product details
   Product Name: ${hasProductName ? 'Present' : 'MISSING'}
   Dosage: ${hasDosage ? 'Present' : 'MISSING'}
   
   LLM will be constrained to ONLY mention products from symbolic output.
        `);
      }
    }
  }
  
  console.log(`   📋 Allowed Products: ${allowedProducts.length > 0 ? allowedProducts.join(', ') : 'NONE'}`);
  console.log(`   📋 Allowed Dosages: ${allowedDosages.length > 0 ? allowedDosages.join(', ') : 'NONE'}`);
  
  
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  // Build structured recommendation data for LLM
  const recommendationData = buildRecommendationSummary(input);
  
  // If no API keys available, use template fallback immediately
  if (!GEMINI_API_KEY && !OPENAI_API_KEY && !LOVABLE_API_KEY) {
    console.log(`   ⚠️ No LLM API keys - using template fallback`);
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
    console.log(`   ⚠️ LLM response empty/short - using template fallback`);
    return buildTemplateFallback(input, startTime);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OUTPUT VALIDATION GATE - Ensure LLM didn't add unauthorized content
  // ═══════════════════════════════════════════════════════════════════════════
  
  // PHASE-10 + PROMPT-2: Pass crop type and full input for enhanced validation
  const cropType = input.land_context?.current_crop;
  const outputValidation = validateLLMOutput(formattedResponse, allowedProducts, allowedDosages, cropType, input);
  
  if (!outputValidation.valid) {
    console.error(`
🚫 [OUTPUT VALIDATION GATE] LLM added unauthorized content:
   Violations: ${outputValidation.violations.join(', ')}
   
   Using template fallback to prevent spreading incorrect advice.
    `);
    
    // Fall back to template to ensure safety
    return buildTemplateFallback(input, startTime);
  }
  
  // Post-process: Apply rural language replacements
  formattedResponse = replaceFormalsWithRural(formattedResponse, input.language);
  
  // BUG-5 FIX: Language consistency check - detect translation failures
   // FIX 9: Improved language detection using Devanagari Unicode range
   if (input.language !== 'en') {
     const totalChars = formattedResponse.length;
     // For Devanagari-script languages (mr, hi, etc.), check Unicode range ratio
     const isDevanagariLang = ['mr', 'hi', 'gu', 'pa'].includes(input.language);
     if (isDevanagariLang && totalChars > 50) {
       const devanagariChars = (formattedResponse.match(/[\u0900-\u097F]/g) || []).length;
       const devanagariRatio = devanagariChars / totalChars;
       if (devanagariRatio < 0.3) {
         const langName = input.language === 'mr' ? 'Marathi' : input.language === 'hi' ? 'Hindi' : input.language;
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
  const primaryProductName = decisionInput?.decision_output?.primary_decision?.product_details?.product_name ||
                             decisionInput?.decision_output?.primary_decision?.application_details?.product_name;
  
  // List of generic action types that are NOT specific products
  const GENERIC_ACTION_TYPES = [
    'cultural practice', 'cultural practices', 'cultural control',
    'mechanical control', 'mechanical removal',
    'biological control', 'biocontrol',
    'monitoring', 'observation', 'scouting',
    'integrated pest management', 'ipm',
    'general advice', 'preventive measure',
    'water management', 'irrigation adjustment',
    'nutrient management', 'fertilizer adjustment',
    'recommended treatment', 'treatment',
    // BUG-1 FIX: Internal placeholder strings that are NOT real product names
    'see action text', 'see structured response', 'see concentration',
    'not specified', 'n/a', 'as per label', 'follow label',
    'continue monitoring', 'standard application', 'not applicable',
    'see label', 'refer label', 'cultural method'
  ];
  
  const isGenericActionType = primaryProductName && 
    GENERIC_ACTION_TYPES.some(gt => primaryProductName.toLowerCase().includes(gt));
  
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
  const langName = input.language === 'mr' ? 'Marathi' : 
                   input.language === 'hi' ? 'Hindi' : 'English';
  
  const ruralRules = getRuralLanguageRules(input.language);
  
  // Get crop stage constraints
  const cropStageConstraints = getCropStageConstraints(input);
  
  return `You are a LANGUAGE ADAPTER for SATHI (साथी), an agricultural advisory system.
You are a TRANSLATOR/FORMATTER ONLY. The SYMBOLIC DECISION BRAIN has already made all decisions.
You CANNOT add, remove, or modify product names, dosages, timing, actions, priorities, or safety instructions. Copy them EXACTLY.
Your ONLY job: translate symbolic brain output to ${langName}, format for readability, add empathetic tone.

FORBIDDEN: ❌ Invent products/dosages ❌ Add effectiveness claims ❌ Recommend harvest for young crops ❌ Add actions not in recommendations ❌ Modify PHI values ❌ Mention unreported pests/diseases

DIAGNOSTIC HIERARCHY:
- Pest evidence (dead heart, bore holes, frass, larvae) → ONLY pest treatment, NEVER fertilizer
- Dead heart in sugarcane = Shoot Borer (95%), NOT zinc deficiency
- White bands/streaks = Zinc deficiency, NOT pest
- Patchy damage = Biotic, Uniform = Abiotic
- ONLY respond to what farmer asked. If NO pest/disease in recommendations → NO pest products
- If symbolic brain output is empty → answer farmer's question directly, NEVER invent pest problems

OUTPUT: 1.Greeting 2.What to do 3.When 4.How much 5.What to avoid + closing
OUTPUT LANGUAGE: ${langName}
${ruralRules}

${cropStageConstraints}

TRANSLATION: action_text/reason_text/knowledge_text are English REFERENCE texts. TRANSLATE into natural ${langName}. NEVER leave English phrases in ${langName} output.

DOSAGE: If land area provided, calculate TOTAL: dosage_per_acre × land_area. Show BOTH per-acre AND total.`;
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

FORMAT this into natural, empathetic farmer advice in ${input.language === 'mr' ? 'Marathi' : input.language === 'hi' ? 'Hindi' : 'English'}.`;
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

function buildRecommendationSummary(input: LLMFormatterInput): string {
  const decision = input.decision_output;
  const parts: string[] = [];
  
  // Status
  parts.push(`STATUS: ${decision.status || 'UNKNOWN'}`);
  
  // Primary recommendation with COMPLETE product details
  const primary = decision.primary_decision;
  if (primary) {
    const pestCode = primary.target?.pest_code;
    const diseaseCode = primary.target?.disease_code;
    const pestName = pestCode ? (PEST_TRANSLATIONS[pestCode]?.[input.language] || pestCode) : '';
    const diseaseName = diseaseCode ? (DISEASE_TRANSLATIONS[diseaseCode]?.[input.language] || diseaseCode) : '';
    
    parts.push(`\nPRIMARY RECOMMENDATION:`);
    parts.push(`- Action Type: ${primary.action_type}`);
    // FIX 7: Rule ID removed from LLM prompt to prevent leakage risk
    parts.push(`- Target: ${pestName || diseaseName || primary.target?.nutrient_deficiency || 'General'}`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PRODUCTION HARDENING: NEW RESPONSE CONTRACT (PRIORITY OVER LEGACY)
    // Use action_text, reason_text, knowledge_text FIRST, then fall back to legacy
    // MANDATORY FALLBACK CHAIN: action_text || i18n(i18n_key) || "[Action unavailable]"
    // ═══════════════════════════════════════════════════════════════════════════
    const appDetails = primary.application_details || {};
    
    // NEW CONTRACT FIELDS (PRIORITY)
    let actionText = appDetails.action_text;
    let reasonText = appDetails.reason_text;
    let knowledgeText = appDetails.knowledge_text;
    
    // MANDATORY FALLBACK CHAIN for action_text (Change F: NO_ACTION_REQUIRED fix)
    if (!actionText) {
      const actionType = (primary.action_type || '').toUpperCase();
      if (actionType === 'NO_ACTION_REQUIRED' || actionType === 'NO_ACTION') {
        // For NO_ACTION_REQUIRED, use knowledge_text or reason_text as primary content
        actionText = knowledgeText || reasonText || 
          (input.language === 'mr' ? 'सध्या कोणतीही कृती आवश्यक नाही. नियमित निरीक्षण करा.' :
           input.language === 'hi' ? 'अभी कोई कार्रवाई आवश्यक नहीं। नियमित निगरानी करें।' :
           'No action required at this time. Continue regular monitoring.');
        console.log(`   ℹ️ [LLM Formatter] NO_ACTION_REQUIRED: Using fallback text for rule ${primary.rule_id}`);
      } else {
        // Try i18n_key lookup (placeholder - would need i18n loader)
        if (appDetails.i18n_key) {
          console.warn(`⚠️ [LLM Formatter] action_text missing, i18n_key=${appDetails.i18n_key} - i18n lookup not implemented`);
        }
        // Final fallback - use knowledge/reason text before error placeholder
        actionText = knowledgeText || reasonText || '[Action text unavailable — data error. Please consult agricultural expert.]';
        if (!knowledgeText && !reasonText) {
          console.error(`🚨 [LLM Formatter] FALLBACK TRIGGERED: action_text unavailable for rule ${primary.rule_id}`);
        }
      }
    }
    
    // Translate action_type for LLM context (Change D)
    const langName = input.language === 'mr' ? 'Marathi' : input.language === 'hi' ? 'Hindi' : 'English';
    const translatedActionType = getActionTranslation(primary.action_type, input.language) || primary.action_type;
    parts.push(`- Action Type (translated): ${translatedActionType}`);
    
    // Always output structured response section
    parts.push(`\n═══ REFERENCE TEXTS (TRANSLATE TO ${langName.toUpperCase()}) ═══`);
    parts.push(`📋 ACTION (What to do - TRANSLATE this): ${actionText}`);
    if (reasonText) {
      parts.push(`🔍 REASON (Why): ${reasonText}`);
    }
     if (knowledgeText) {
       // FIX 5: Cap knowledge_text to prevent token bloat from long ICAR references
       parts.push(`📚 KNOWLEDGE (Scientific basis): ${knowledgeText.substring(0, 600)}`);
    }
    parts.push(`═══════════════════════════════════════════════════`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // LEGACY: Extract and pass product details (fallback when new contract empty)
    // ═══════════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════════
    // v2.0.0: ACTION TYPE GUARD - Skip product/dosage for non-treatment rules
    // BLOCK rules: Explicitly instruct LLM NOT to recommend treatment
    // NO_ACTION/MONITORING: Skip product section entirely
    // ═══════════════════════════════════════════════════════════════════════════
    const actionTypeUpper = (primary.action_type || '').toUpperCase();
    const TREATMENT_ACTION_TYPES = ['RECOMMEND', 'URGENT_ACTION', 'TREATMENT', 'SPRAY', 'APPLY', 'CHEMICAL_CONTROL', 'BIOLOGICAL_CONTROL'];
    const isTreatmentAction = TREATMENT_ACTION_TYPES.some(t => actionTypeUpper.includes(t));
    
    if (actionTypeUpper === 'BLOCK' || actionTypeUpper === 'SAFETY_GATE') {
      // BLOCK/SAFETY_GATE: Explicitly prevent treatment recommendation
      parts.push(`\n⛔ IMPORTANT INSTRUCTION FOR LLM:`);
      parts.push(`This is a BLOCK action. DO NOT recommend any product, dosage, or treatment.`);
      parts.push(`DO NOT tell the farmer to decide the dose themselves.`);
      parts.push(`Instead, explain WHY treatment is blocked using the REASON and KNOWLEDGE text above.`);
      parts.push(`Provide only monitoring guidance and safety information.`);
    } else if (isTreatmentAction && appDetails && Object.keys(appDetails).length > 0) {
      // Treatment rules: Output product/dosage details
      parts.push(`\n- Product Name: ${appDetails.product_name || 'Not specified'}`);
      parts.push(`- Dosage (concentration): ${appDetails.concentration || appDetails.dosage || 'As per label'}`);
      parts.push(`- Dosage (per acre): ${appDetails.dosage_per_acre || 'See concentration'}`);
      parts.push(`- Application Method: ${appDetails.method || appDetails.application_method || 'Standard application'}`);
       // FIX 8: Remove hardcoded timing/water defaults - must come from rule engine
       parts.push(`- Timing: ${appDetails.timing || primary.timing?.best_time_of_day || 'As per label'}`);
       parts.push(`- Water Volume: ${appDetails.water_volume || appDetails.water_volume_per_acre || 'As per label'}`);
       parts.push(`- PHI Days: ${appDetails.phi_days || 'Follow label'} (कापणीपूर्वी वाट पाहा)`);
       // FIX 12: Remove hardcoded 75% efficacy default - only use rule engine value
       const efficacyValue = appDetails.efficacy_percent || primary.expected_outcomes?.efficacy_percent;
       parts.push(`- Expected Efficacy: ${efficacyValue ? efficacyValue + '%' : 'As per field conditions'}`);
      parts.push(`- Weather Restrictions: ${appDetails.weather_restrictions || 'Follow label instructions'}`);
      
      // BUG-2 FIX: Land-area-based total dosage calculation
      const farmerAreaAcres = input.land_context?.area_acres;
      if (farmerAreaAcres && farmerAreaAcres > 0) {
        const dosagePerAcre = appDetails.dosage_per_acre || appDetails.concentration || '';
        const waterPerAcre = appDetails.water_volume || appDetails.water_volume_per_acre || 'As per label';
        parts.push(`\n═══ TOTAL FOR FARMER'S LAND (${farmerAreaAcres} acres) ═══`);
        parts.push(`- Per acre dosage: ${dosagePerAcre}`);
        parts.push(`- Farmer's land: ${farmerAreaAcres} acres`);
        parts.push(`- CALCULATE: Multiply per-acre dosage × ${farmerAreaAcres} = TOTAL product needed`);
        parts.push(`- CALCULATE: Multiply per-acre water × ${farmerAreaAcres} = TOTAL water needed`);
        parts.push(`- IMPORTANT: Show BOTH per-acre AND total quantities in the response`);
        parts.push(`═══════════════════════════════════════════════════`);
      }
      
      // Multilingual product names for farmer
      if (appDetails.names) {
        const names = appDetails.names as { mr?: string; hi?: string; en?: string };
        parts.push(`- Product (Marathi): ${names.mr || appDetails.product_name}`);
        parts.push(`- Product (Hindi): ${names.hi || appDetails.product_name}`);
      }
    } else if (isTreatmentAction) {
      // Treatment but no appDetails
      parts.push(`- Product: ${primary.product_name || 'Not specified'}`);
      parts.push(`- Dosage: As per label`);
    } else {
      // NO_ACTION_REQUIRED, MONITORING, OBSERVATION: Skip product section entirely
      parts.push(`\nℹ️ This is a ${actionTypeUpper} action. Focus on monitoring guidance and explanation.`);
      parts.push(`DO NOT recommend any specific product or dosage.`);
    }
    
    parts.push(`- Priority: ${primary.priority || 'HIGH'}`);
    parts.push(`- IPM Level: ${primary.ipm_level || 'LEVEL_3'}`);
    
    // Urgency indicator
     // FIX 10: IPM level unknown guard with warning log
     const ipmLevel = primary.ipm_level || 'LEVEL_3';
     if (!IPM_URGENCY_LABELS[ipmLevel]) {
       console.warn(`[IPM_GOVERNANCE] Unknown IPM level: ${ipmLevel}`);
     }
     const urgencyLabel = IPM_URGENCY_LABELS[ipmLevel]?.[input.language] || 'Normal priority';
     parts.push(`- Urgency: ${urgencyLabel}`);
    
     if (primary.rule_id) {
       // FIX 7: Remove rule_id from LLM prompt to prevent leakage
       parts.push(`- Scientific Basis: ICAR Validated`);
    }
  }
  
  // Secondary recommendations with product details
  const secondary = decision.secondary_actions || decision.secondary_recommendations;
  if (secondary && secondary.length > 0) {
    parts.push(`\n═══ ADDITIONAL RECOMMENDATIONS (Include ALL in response): ═══`);
    secondary.forEach((sec: any, idx: number) => {
      parts.push(`\n${idx + 1}. ${sec.action || sec.action_type} - ${sec.reason || 'Supporting action'}`);
      if (sec.product_name) parts.push(`   Product: ${sec.product_name}`);
      if (sec.dosage) parts.push(`   Dosage: ${sec.dosage}`);
      if (sec.dosage_per_acre) parts.push(`   Per Acre: ${sec.dosage_per_acre}`);
      if (sec.timing) parts.push(`   Timing: ${sec.timing}`);
      if (sec.phi_days) parts.push(`   PHI: ${sec.phi_days} days`);
      if (sec.priority) parts.push(`   Priority: ${sec.priority}`);
      if (sec.names?.mr) parts.push(`   Name (MR): ${sec.names.mr}`);
    });
  }
  
   // FIX 2: Removed hardcoded biocontrol dosages (Trichogramma/Cotesia).
   // Biocontrol dosage comes from rule engine via application_details.dosage_per_acre.
   // The product/dosage rendering at lines 984-1007 already handles this correctly.
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MATCHED RESPONSES - TOKEN OPTIMIZED: Filter to max 3 relevant responses
  // Previously sent ALL 73 matched responses (~8,000 tokens). Now sends only
  // the primary + top 2 high-priority alternatives (~450 tokens).
  // ═══════════════════════════════════════════════════════════════════════════
  const matchedResponses = decision.matched_responses;
  if (matchedResponses && matchedResponses.length > 0) {
    const primaryRuleId = decision.primary_decision?.rule_id;
    const filteredResponses = filterRelevantResponses(matchedResponses, primaryRuleId, 3);
    
    parts.push(`\nIPM TREATMENT RESPONSES (Use in farmer's language):`);
    filteredResponses.forEach((resp: any, idx: number) => {
      const isPrimary = resp.rule_id === primaryRuleId;
      parts.push(`\n${idx + 1}. IPM TREATMENT (${resp.cause || resp.rule_id || 'General'}):`);
      
      // Use structured response contract fields (skip legacy when action_text exists)
      if (resp.action_text) {
        parts.push(`   Action: ${resp.action_text}`);
      }
      if (resp.reason_text) {
        parts.push(`   Reason: ${resp.reason_text}`);
      }
      // Only include knowledge_text for PRIMARY response (biggest token consumer)
       // FIX 5: Cap knowledge_text for matched responses too
       if (isPrimary && resp.knowledge_text) {
         parts.push(`   Knowledge: ${resp.knowledge_text.substring(0, 600)}`);
      }
      
      // Fallback to legacy response fields ONLY if no action_text
      if (!resp.action_text) {
        const localizedResponse = resp[`response_${input.language}`] || resp.response_en || resp.response_mr || '';
        if (localizedResponse) {
          parts.push(`   Response: ${localizedResponse}`);
        }
      }
    });
  }
  
  // Warnings
  if (decision.warnings && decision.warnings.length > 0) {
    parts.push(`\nWARNINGS:`);
    decision.warnings.forEach((warning: any) => {
      parts.push(`⚠️ ${typeof warning === 'string' ? warning : warning.message || warning.text}`);
    });
  }
  
  // Blocked actions (explain why some actions were filtered)
  if (decision.blocked_actions && decision.blocked_actions.length > 0) {
    parts.push(`\nBLOCKED ACTIONS (explain these to farmer):`);
    decision.blocked_actions.forEach((blocked: any) => {
      parts.push(`- ${blocked.action}: ${blocked.reason}`);
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
            maxOutputTokens: 900  // INCREASED: Devanagari (Marathi/Hindi) uses ~1.5x more tokens
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
        max_tokens: 900,  // INCREASED: Devanagari (Marathi/Hindi) uses ~1.5x more tokens
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
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`Lovable AI error: ${response.status}`);
      return { success: false, text: '' };
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { success: !!text, text };
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(`Lovable AI call failed:`, error);
    return { success: false, text: '' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE FALLBACK (when LLM unavailable) - MODE-DRIVEN
// ═══════════════════════════════════════════════════════════════════════════

function buildTemplateFallback(input: LLMFormatterInput, startTime: number): LLMFormatterOutput {
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
  // MODE: TREATMENT - Full recommendation with legacy template
  // ═══════════════════════════════════════════════════════════════════════════
  const parts: string[] = [];
  
  // Greeting
  const greetings: Record<string, string> = {
    mr: 'नमस्कार शेतकरी मित्र! 🌾',
    hi: 'नमस्कार किसान मित्र! 🌾',
    en: 'Hello farmer friend! 🌾'
  };
  parts.push(greetings[lang]);
  
  // Acknowledgment - from CURRENT land_context only
  const currentCrop = input.land_context?.current_crop;
  if (currentCrop) {
    const acks: Record<string, string> = {
      mr: `तुमच्या ${currentCrop} पिकाबद्दलचा प्रश्न समजला.`,
      hi: `आपकी ${currentCrop} फसल के बारे में प्रश्न समझा।`,
      en: `I understand your question about ${currentCrop}.`
    };
    parts.push(acks[lang]);
  }
  
  // Primary recommendation - EXTRACT ONLY FROM CURRENT decision_output
  const primary = decision?.primary_decision;
  
  // VALIDATION: Check if template data matches current session
  const templatePestCode = primary?.target?.pest_code;
  const templateDiseaseCode = primary?.target?.disease_code;
  const hasValidRecommendation = primary && 
    primary.action_type && 
    primary.action_type !== 'NO_ACTION' &&
    (primary.application_details?.product_name || 
     primary.application_details?.concentration ||
     templatePestCode || templateDiseaseCode);
  
  if (hasValidRecommendation) {
    const headers: Record<string, string> = {
      mr: '📌 **शिफारस:**',
      hi: '📌 **सिफारिश:**',
      en: '📌 **Recommendation:**'
    };
    parts.push(headers[lang]);
    
    // CRITICAL: Extract from current decision_output ONLY
    const rawProductName = primary.application_details?.product_name;
    const rawActionType = primary.action_type;
    const rawActionText = primary.action_text;
    const dosage = primary.application_details?.concentration || primary.application_details?.dosage;
    const method = primary.application_details?.method || primary.application_details?.application_method;
    const timing = primary.timing?.best_time_of_day;
    
    // CRITICAL FIX: Translate generic action types to farmer-friendly language
    const GENERIC_ACTION_TRANSLATIONS: Record<string, Record<string, string>> = {
      'cultural practice': { mr: 'सांस्कृतिक पद्धती', hi: 'सांस्कृतिक तरीके', en: 'Cultural practice' },
      'cultural control': { mr: 'सांस्कृतिक नियंत्रण', hi: 'सांस्कृतिक नियंत्रण', en: 'Cultural control' },
      'mechanical control': { mr: 'यांत्रिक नियंत्रण', hi: 'यांत्रिक नियंत्रण', en: 'Mechanical control' },
      'biological control': { mr: 'जैविक नियंत्रण', hi: 'जैविक नियंत्रण', en: 'Biological control' },
      'monitoring': { mr: 'निरीक्षण', hi: 'निगरानी', en: 'Monitoring' },
      'treatment': { mr: 'उपचार', hi: 'उपचार', en: 'Treatment' },
      'prevention': { mr: 'प्रतिबंध', hi: 'रोकथाम', en: 'Prevention' }
    };
    
    // Check if this is a generic action type and translate
    const lowerProductName = (rawProductName || '').toLowerCase();
    let translatedProductName = rawProductName || '';
    let isGenericAction = false;
    
    for (const [key, translations] of Object.entries(GENERIC_ACTION_TRANSLATIONS)) {
      if (lowerProductName.includes(key)) {
        translatedProductName = translations[lang] || translations.en;
        isGenericAction = true;
        break;
      }
    }
    
    // If not generic, use the normal translation function
    if (!isGenericAction && rawProductName) {
      translatedProductName = getProductName(rawProductName, lang);
    }
    
    // If product_name is null/empty, try to use action_text
    if (rawProductName && rawProductName !== 'Recommended treatment') {
      let recText = `1. **${translatedProductName}**`;
      // Only add dosage if not already included and it's not a generic action
      if (!isGenericAction && dosage && dosage !== 'As per label' && dosage !== 'N/A' && !translatedProductName.includes('/')) {
        recText += ` @ ${dosage}`;
      }
      
      // For generic actions, include the action text in farmer's language
      if (isGenericAction && rawActionText) {
        recText += `\n   🔧 ${rawActionText}`;
      }
      
      if (method) {
        // CRITICAL FIX: Translate method name
        const methodLabel = getActionTranslation(method, lang) || 
          (lang === 'mr' ? 
            (method === 'SOIL_APPLICATION' ? 'जमिनीत द्या' : method === 'FOLIAR_SPRAY' ? 'पर्णीय फवारणी' : method) :
          lang === 'hi' ? 
            (method === 'SOIL_APPLICATION' ? 'मिट्टी में डालें' : method === 'FOLIAR_SPRAY' ? 'पत्ते पर छिड़काव' : method) :
          method);
        recText += `\n   📍 ${methodLabel}`;
      }
      if (timing) {
        const timingLabel = timing === 'MORNING' ? 
          (lang === 'mr' ? 'सकाळी' : lang === 'hi' ? 'सुबह' : 'Morning') :
          (lang === 'mr' ? 'संध्याकाळी' : lang === 'hi' ? 'शाम को' : 'Evening');
        recText += `\n   ⏰ ${timingLabel}`;
      }
      
      if (primary.expected_outcomes?.efficacy_percent) {
        recText += ` | 📊 ${primary.expected_outcomes.efficacy_percent}% ${lang === 'mr' ? 'प्रभावी' : lang === 'hi' ? 'प्रभावी' : 'effective'}`;
      }
      
      parts.push(recText);
      
      // IPM urgency indicator
      const ipmLevel = primary.ipm_level || 'LEVEL_3';
      const urgencyLabel = IPM_URGENCY_LABELS[ipmLevel]?.[lang] || '';
      if (urgencyLabel) {
        parts.push(`\n${urgencyLabel}`);
      }
    } else if (rawActionText) {
      // Use action_text as fallback - translate generic terms
      let translatedActionText = rawActionText;
      for (const [key, translations] of Object.entries(GENERIC_ACTION_TRANSLATIONS)) {
        if (rawActionText.toLowerCase().includes(key)) {
          translatedActionText = rawActionText.replace(new RegExp(key, 'gi'), translations[lang] || translations.en);
        }
      }
      const actionHeader: Record<string, string> = {
        mr: '📋 **कृती:**',
        hi: '📋 **कार्रवाई:**',
        en: '📋 **Action:**'
      };
      parts.push(`${actionHeader[lang]}\n${translatedActionText}`);
    } else {
      // No valid product - ask for more info instead of giving wrong advice
      const askMore: Record<string, string> = {
        mr: '📋 **अधिक माहिती आवश्यक:**\nकृपया तुमच्या समस्येबद्दल अधिक तपशील द्या किंवा फोटो पाठवा.',
        hi: '📋 **अधिक जानकारी आवश्यक:**\nकृपया अपनी समस्या के बारे में अधिक विवरण दें या फोटो भेजें।',
        en: '📋 **More information needed:**\nPlease provide more details about your problem or send a photo.'
      };
      parts.push(askMore[lang]);
    }
  } else {
    // Check for matched_responses (IPM treatment responses from rule database)
    const matchedResponses = decision?.matched_responses;
    if (matchedResponses && matchedResponses.length > 0) {
      // Use pre-formatted responses from the rule database in farmer's language
      const ipmHeader: Record<string, string> = {
        mr: '📌 **शिफारस (IPM):**',
        hi: '📌 **सिफारिश (IPM):**',
        en: '📌 **Recommendation (IPM):**'
      };
      parts.push(ipmHeader[lang]);
      
      matchedResponses.slice(0, 2).forEach((resp: any, idx: number) => {
        // Use the response in farmer's preferred language
        const localizedResponse = resp[`response_${lang}`] || resp.response_en || resp.response_mr || '';
        if (localizedResponse) {
          parts.push(`\n${idx + 1}. **${resp.cause || 'उपचार'}:**\n${localizedResponse}`);
        }
      });
    } else {
      // No valid recommendation from rule engine - provide safe fallback
      const safeAdvice: Record<string, string> = {
        mr: '👀 **विश्लेषण:**\nतुमचा प्रश्न समजला. अचूक शिफारसीसाठी कृपया:\n• पिकाचा फोटो पाठवा\n• किंवा लक्षणांचे अधिक तपशील द्या',
        hi: '👀 **विश्लेषण:**\nआपका प्रश्न समझा। सटीक सिफारिश के लिए कृपया:\n• फसल का फोटो भेजें\n• या लक्षणों का अधिक विवरण दें',
        en: '👀 **Analysis:**\nI understand your question. For accurate recommendation please:\n• Send a crop photo\n• Or provide more details about symptoms'
      };
      parts.push(safeAdvice[lang]);
    }
  }
  
  // Secondary recommendations - from CURRENT decision only
  const secondary = decision?.secondary_actions || decision?.secondary_recommendations;
  if (secondary && secondary.length > 0) {
    parts.push('');
    secondary.slice(0, 2).forEach((sec: any, idx: number) => {
      const rawAction = sec.action || sec.product_name;
      if (rawAction && rawAction !== 'N/A' && rawAction !== 'None') {
        // CRITICAL FIX: Translate secondary action names to farmer-friendly language
        const translatedAction = getProductName(rawAction, lang);
        parts.push(`${idx + 2}. ${translatedAction}${sec.reason ? ` - ${sec.reason}` : ''}`);
      }
    });
  }
  
  // Supportive closing
  const closings: Record<string, string> = {
    mr: '\n🙏 काही शंका असल्यास विचारा. शुभेच्छा!',
    hi: '\n🙏 कोई सवाल हो तो पूछें। शुभकामनाएं!',
    en: '\n🙏 Feel free to ask if you need clarification. Best wishes!'
  };
  parts.push(closings[lang]);
  
  const finalResponse = parts.join('\n\n');
  console.log(`   📋 Template fallback generated: ${finalResponse.length} chars`);
  
  return {
    formatted_response: finalResponse,
    confidence: 0.7,
    source: 'TEMPLATE_FALLBACK',
    processing_time_ms: Date.now() - startTime,
    sections_included: ['greeting', 'recommendation', 'closing']
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

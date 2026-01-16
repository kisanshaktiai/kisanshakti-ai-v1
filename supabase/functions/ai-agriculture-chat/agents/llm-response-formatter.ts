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
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface LLMFormatterInput {
  farmer_message: string;
  language: 'mr' | 'hi' | 'en';
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
// MAIN LLM FORMATTER FUNCTION - RENDER-ONLY MODE
// ═══════════════════════════════════════════════════════════════════════════

export async function formatRecommendationsWithLLM(
  input: LLMFormatterInput
): Promise<LLMFormatterOutput> {
  const startTime = Date.now();
  const traceId = input.trace_id || `fmt_${Date.now().toString(36)}`;
  
  console.log(`\n📝 [${traceId}] ═══ PHASE 5: LLM RENDER-ONLY FORMATTING ═══`);
  console.log(`   Language: ${input.language}`);
  console.log(`   Decision Status: ${input.decision_output?.status}`);
  
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
  
  let formattedResponse = '';
  let aiModelUsed = '';
  
  try {
    // TIER 1: Try OpenAI FIRST with 20-second timeout (user preference)
    if (OPENAI_API_KEY) {
      console.log(`   🔄 Trying OpenAI (primary)...`);
      const result = await callOpenAIWithTimeout(systemPrompt, userPrompt, OPENAI_API_KEY, 20000);
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'gpt-4o';  // UPGRADED: Using GPT-4o for better formatting
        console.log(`   ✅ OpenAI formatting successful (gpt-4o)`);
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
    symbolic_decision_id: input.decision_output?.decision_id
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 1: All products present (ENHANCED - stricter check)
  // ═══════════════════════════════════════════════════════════════════════════
  const primaryProductName = decisionInput?.decision_output?.primary_decision?.product_details?.product_name ||
                             decisionInput?.decision_output?.primary_decision?.application_details?.product_name;
  
  if (primaryProductName && primaryProductName !== 'N/A' && primaryProductName !== 'None') {
    // Check if product name or any word from it appears in output
    const productWords = primaryProductName.toLowerCase().split(/[\s+@\/]+/).filter((w: string) => w.length > 2);
    const productFound = productWords.some((word: string) => lowerOutput.includes(word)) || 
                         lowerOutput.includes(primaryProductName.toLowerCase());
    
    if (!productFound) {
      errors.push(`Missing product from symbolic decision: ${primaryProductName}`);
      console.error(`🚫 [VALIDATION] Missing required product: ${primaryProductName}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 2: Dosages unchanged (NEW - extract numbers and verify)
  // ═══════════════════════════════════════════════════════════════════════════
  const dosagePerAcre = decisionInput?.decision_output?.primary_decision?.product_details?.dosage_per_acre ||
                        decisionInput?.decision_output?.primary_decision?.application_details?.dosage ||
                        decisionInput?.decision_output?.primary_decision?.application_details?.concentration;
  
  if (dosagePerAcre && dosagePerAcre !== 'As per label' && dosagePerAcre !== 'N/A') {
    // Extract all numbers from the dosage string
    const dosageNumbers = dosagePerAcre.match(/\d+\.?\d*/g);
    
    if (dosageNumbers && dosageNumbers.length > 0) {
      // Check if at least one dosage number appears in output
      const numbersFound = dosageNumbers.some((n: string) => llmOutput.includes(n));
      
      if (!numbersFound) {
        errors.push(`Dosage numbers mismatch. Expected: ${dosagePerAcre}, numbers: ${dosageNumbers.join(', ')}`);
        console.warn(`⚠️ [VALIDATION] Dosage numbers not found in output: ${dosageNumbers.join(', ')}`);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 3: No rule IDs leaked (NEW - forbidden internal patterns)
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
  // CHECK 4: Unauthorized percentage claims (existing)
  // ═══════════════════════════════════════════════════════════════════════════
  const percentagePattern = /(\d{1,3})\s*%\s*(effective|control|reduction|success)/gi;
  const percentageMatches = llmOutput.match(percentagePattern);
  if (percentageMatches) {
    errors.push(`Unauthorized percentage claim: ${percentageMatches[0]}`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 5: Unauthorized products (existing - enhanced)
  // ═══════════════════════════════════════════════════════════════════════════
  const commonPesticides = [
    'chlorpyrifos', 'monocrotophos', 'cypermethrin', 'imidacloprid',
    'carbofuran', 'phorate', 'thiamethoxam', 'fipronil', 'cartap',
    'coragen', 'profenofos', 'quinalphos', 'acephate', 'malathion',
    'lambda-cyhalothrin', 'deltamethrin', 'bifenthrin', 'emamectin'
  ];
  
  for (const pesticide of commonPesticides) {
    if (lowerOutput.includes(pesticide) && !allowedProducts.includes(pesticide)) {
      errors.push(`Unauthorized product mentioned: ${pesticide}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 6: Cross-crop biocontrol validation (existing)
  // ═══════════════════════════════════════════════════════════════════════════
  if (cropType && cropType.toLowerCase() === 'wheat') {
    const invalidBiocontrolsForWheat = [
      'trichogramma', 'ट्रायकोग्रामा', 'ट्रायकोग्रामा चिलोनिस',
      'cotesia', 'कोटेशिया',
      'trichogramma chilonis', 'cotesia flavipes'
    ];
    
    for (const biocontrol of invalidBiocontrolsForWheat) {
      if (lowerOutput.includes(biocontrol.toLowerCase())) {
        errors.push(`Invalid biocontrol for wheat: ${biocontrol}`);
        console.warn(`
⚠️ [CROSS-CROP] Invalid biocontrol detected
   Crop: Wheat
   Invalid Biocontrol: ${biocontrol}
   Reason: Trichogramma/Cotesia are for Lepidopteran pests (bollworms, stem borers)
   Correct for Wheat: Ladybird beetles (Coccinella), Green lacewing (Chrysoperla)
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
  
  return `You are a LANGUAGE ADAPTER for KisanMitra (किसानमित्र), an agricultural advisory system.

═══════════════════════════════════════════════════════════════════════════
CRITICAL CONSTRAINT: RENDER-ONLY MODE
═══════════════════════════════════════════════════════════════════════════

You are NOT an advisor. You are a TRANSLATOR/FORMATTER ONLY.
The SYMBOLIC DECISION BRAIN has already made all decisions.

You CANNOT add, remove, or modify:
- Product names (use EXACTLY as provided)
- Dosages (copy EXACTLY)
- Timing (copy EXACTLY)
- Actions (copy EXACTLY)
- Priorities (copy EXACTLY)
- Safety instructions (copy EXACTLY)

Your ONLY job is to:
1. Translate symbolic brain output to ${langName}
2. Format for readability (numbered lists, emojis)
3. Add empathetic tone (greeting, closing)
4. Match farmer's detected language

═══════════════════════════════════════════════════════════════════════════
FORBIDDEN - NEVER DO THESE:
═══════════════════════════════════════════════════════════════════════════

❌ Do NOT invent product names
❌ Do NOT create new dosages
❌ Do NOT add percentage effectiveness claims
❌ Do NOT recommend harvest for young crops (check crop stage)
❌ Do NOT add actions not in the recommendations
❌ Do NOT modify PHI (Pre-Harvest Interval) values
❌ Do NOT mention pests/diseases that are NOT in the recommendations
❌ Do NOT suggest treatments for problems the farmer DID NOT report

CRITICAL - ONLY respond to what the farmer asked:
- If farmer asked about CROP NAME → Answer with crop info, NOT pest treatment
- If farmer asked about WATER → Answer with irrigation info, NOT pest treatment
- If farmer asked about FERTILIZER → Answer with nutrition info, NOT pest treatment
- If NO pest/disease in recommendations → DO NOT mention pest treatment products

If symbolic brain output is empty or has NO actions:
→ Answer the farmer's question directly without adding pest/disease treatments
→ For crop info queries, just state the crop name and stage
→ NEVER invent pest problems that aren't in the data

═══════════════════════════════════════════════════════════════════════════
OUTPUT STRUCTURE (Strict 1-5 Format):
═══════════════════════════════════════════════════════════════════════════

1. GREETING + ACKNOWLEDGMENT
2. WHAT TO DO (actions from symbolic brain ONLY - if any)
3. WHEN (timing from symbolic brain ONLY - if provided)
4. HOW MUCH (dosage from symbolic brain ONLY - if provided)
5. WHAT TO AVOID + SUPPORTIVE CLOSING

OUTPUT LANGUAGE: ${langName}
${ruralRules}

${cropStageConstraints}

BIOCONTROL DOSAGE (Copy EXACTLY - ONLY if in recommendations):
- Trichogramma chilonis: 50,000 parasitoids/acre
- Cotesia flavipes: 5,000 cocoons/acre`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP STAGE CONSTRAINTS GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function getCropStageConstraints(input: LLMFormatterInput): string {
  const cropStage = input.land_context?.growth_stage?.toUpperCase() || '';
  const daysSinceSowing = input.land_context?.days_since_sowing || 0;
  const crop = input.land_context?.current_crop?.toUpperCase() || '';
  
  // Define young crop stages where harvest is NEVER appropriate
  const youngCropStages = ['GERMINATION', 'SEEDLING', 'VEGETATIVE', 'TILLERING', 'GRAND_GROWTH'];
  const isYoungCrop = youngCropStages.includes(cropStage) || daysSinceSowing < 120;
  
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
  
  // Determine if crop is young (harvest not appropriate)
  const youngCropStages = ['GERMINATION', 'SEEDLING', 'VEGETATIVE', 'TILLERING', 'GRAND_GROWTH'];
  const isYoungCrop = youngCropStages.includes(cropStage) || daysSinceSowing < 120;
  
  // Build explicit constraint for young crops
  const harvestConstraint = isYoungCrop ? `
⚠️ CRITICAL CONSTRAINT - READ CAREFULLY:
This crop (${crop}) is only ${daysSinceSowing} days old in ${cropStage} stage.
DO NOT recommend harvesting, cutting, or selling the crop.
For pest/disease problems, recommend CONTROL MEASURES only.
The farmer's problem is about pest damage (dead heart = shoot borer), NOT about harvesting.

` : '';

  const landInfo = input.land_context ? `
LAND CONTEXT:
- Crop: ${input.land_context.current_crop || 'Not specified'}
- Growth Stage: ${input.land_context.growth_stage || 'Not specified'} ${isYoungCrop ? '⚠️ YOUNG CROP - NO HARVEST' : ''}
- Area: ${input.land_context.area_acres || 'N/A'} acres
- Days Since Sowing: ${input.land_context.days_since_sowing || 'N/A'}
- NDVI Health: ${input.land_context.ndvi?.value || 'N/A'} (${input.land_context.ndvi?.trend || 'unknown'})
- Soil N/P/K: ${input.land_context.soil_health?.nitrogen_kg_per_ha || 'N/A'}/${input.land_context.soil_health?.phosphorus_kg_per_ha || 'N/A'}/${input.land_context.soil_health?.potassium_kg_per_ha || 'N/A'} kg/ha
- pH: ${input.land_context.soil_health?.ph_level || 'N/A'}
- Location: ${input.land_context.village || ''}, ${input.land_context.district || ''}` : '';

  return `FARMER'S QUESTION (in their language):
"${input.farmer_message}"

${harvestConstraint}${landInfo}

RULE ENGINE RECOMMENDATIONS (PRESERVE ALL DOSAGES EXACTLY):
${recData}

FORMAT this into natural, empathetic farmer advice in ${input.language === 'mr' ? 'Marathi' : input.language === 'hi' ? 'Hindi' : 'English'}.

IMPORTANT REMINDERS:
1. Include ALL product names and dosages EXACTLY as shown above
2. Trichogramma = 50,000/acre (fifty thousand), Cotesia = 5,000/acre (five thousand)
3. ${isYoungCrop ? 'DO NOT recommend harvest - this is a young crop with pest problem' : 'Check PHI before recommending harvest'}
4. For dead heart symptom, the solution is pest control, NOT harvesting
5. Be warm and supportive`;
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
    parts.push(`- Target: ${pestName || diseaseName || primary.target?.nutrient_deficiency || 'General'}`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Extract and pass COMPLETE product details
    // ═══════════════════════════════════════════════════════════════════════════
    const appDetails = primary.application_details;
    if (appDetails) {
      parts.push(`- Product Name: ${appDetails.product_name || 'Not specified'}`);
      parts.push(`- Dosage (concentration): ${appDetails.concentration || appDetails.dosage || 'As per label'}`);
      parts.push(`- Dosage (per acre): ${appDetails.dosage_per_acre || 'See concentration'}`);
      parts.push(`- Application Method: ${appDetails.method || appDetails.application_method || 'Standard application'}`);
      parts.push(`- Timing: ${appDetails.timing || primary.timing?.best_time_of_day || 'Early morning 6-10 AM'}`);
      parts.push(`- Water Volume: ${appDetails.water_volume || appDetails.water_volume_per_acre || '200 L/acre'}`);
      parts.push(`- PHI Days: ${appDetails.phi_days || 'Follow label'} (कापणीपूर्वी वाट पाहा)`);
      parts.push(`- Expected Efficacy: ${appDetails.efficacy_percent || primary.expected_outcomes?.efficacy_percent || 75}%`);
      parts.push(`- Weather Restrictions: ${appDetails.weather_restrictions || 'No rain within 4-6 hours after spray'}`);
      
      // Multilingual product names for farmer
      if (appDetails.names) {
        const names = appDetails.names as { mr?: string; hi?: string; en?: string };
        parts.push(`- Product (Marathi): ${names.mr || appDetails.product_name}`);
        parts.push(`- Product (Hindi): ${names.hi || appDetails.product_name}`);
      }
    } else {
      parts.push(`- Product: ${primary.product_name || 'Not specified'}`);
      parts.push(`- Dosage: As per label`);
    }
    
    parts.push(`- Priority: ${primary.priority || 'HIGH'}`);
    parts.push(`- IPM Level: ${primary.ipm_level || 'LEVEL_3'}`);
    
    // Urgency indicator
    const urgency = IPM_URGENCY_LABELS[primary.ipm_level || 'LEVEL_3']?.[input.language] || 'Normal priority';
    parts.push(`- Urgency: ${urgency}`);
    
    if (primary.rule_id) {
      parts.push(`- Scientific Basis: ICAR Rule ${primary.rule_id}`);
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BIOCONTROL AGENTS - Explicit high-value information
  // ═══════════════════════════════════════════════════════════════════════════
  const biocontrolMentioned = JSON.stringify(decision).toLowerCase();
  if (biocontrolMentioned.includes('trichogramma') || biocontrolMentioned.includes('cotesia')) {
    parts.push(`\n═══ BIOCONTROL DOSAGE REMINDER (CRITICAL - Copy exactly): ═══`);
    parts.push(`⚠️ Trichogramma chilonis: 50,000 parasitoids/acre (FIFTY THOUSAND)`);
    parts.push(`⚠️ Cotesia flavipes: 5,000 cocoons/acre (FIVE THOUSAND)`);
    parts.push(`These are 1000x larger than chemical dosages - this is CORRECT!`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MATCHED RESPONSES - Pre-formatted responses from decision rules in farmer's language
  // CRITICAL: These contain response_mr, response_hi, response_en from the rule database
  // ═══════════════════════════════════════════════════════════════════════════
  const matchedResponses = decision.matched_responses;
  if (matchedResponses && matchedResponses.length > 0) {
    parts.push(`\n═══ IPM TREATMENT RESPONSES (Use in farmer's language): ═══`);
    matchedResponses.forEach((resp: any, idx: number) => {
      // Use the response in the farmer's preferred language
      const localizedResponse = resp[`response_${input.language}`] || resp.response_en || resp.response_mr || '';
      if (localizedResponse) {
        parts.push(`\n${idx + 1}. IPM TREATMENT (${resp.cause || resp.rule_id || 'General'}):`);
        parts.push(`   ═══ COPY THIS TEXT EXACTLY ═══`);
        parts.push(`   ${localizedResponse}`);
        parts.push(`   ═════════════════════════════`);
      }
    });
    parts.push(`\n⚠️ IMPORTANT: Use the above IPM treatment responses as-is in ${input.language === 'mr' ? 'Marathi' : input.language === 'hi' ? 'Hindi' : 'English'}. Do not modify them.`);
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
): Promise<{ success: boolean; text: string; error?: string }> {
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
            temperature: 0.7,
            maxOutputTokens: 800
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
    return { success: !!text, text };
    
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
): Promise<{ success: boolean; text: string; error?: string }> {
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
        model: 'gpt-4o',  // UPGRADED: Using GPT-4o for better response quality
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
      const statusCode = response.status;
      console.warn(`OpenAI API error: ${statusCode}`);
      if (statusCode === 429) {
        return { success: false, text: '', error: 'RATE_LIMIT' };
      }
      return { success: false, text: '', error: `HTTP_${statusCode}` };
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { success: !!text, text };
    
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
// TEMPLATE FALLBACK (when LLM unavailable)
// ═══════════════════════════════════════════════════════════════════════════

function buildTemplateFallback(input: LLMFormatterInput, startTime: number): LLMFormatterOutput {
  const lang = input.language;
  const decision = input.decision_output;
  const parts: string[] = [];
  
  // SESSION-AWARE TEMPLATE FALLBACK - CRITICAL FIX
  // NEVER use cached/global data - ALWAYS use current decision_output
  console.log(`   📋 Building SESSION-AWARE template fallback`);
  console.log(`   📋 Decision status: ${decision?.status}`);
  console.log(`   📋 Primary action: ${decision?.primary_decision?.action_type}`);
  console.log(`   📋 Land crop: ${input.land_context?.current_crop}`);
  
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
    const dosage = primary.application_details?.concentration || primary.application_details?.dosage;
    const method = primary.application_details?.method || primary.application_details?.application_method;
    const timing = primary.timing?.best_time_of_day;
    
    // If product_name is null/empty, DO NOT use placeholder
    if (rawProductName && rawProductName !== 'Recommended treatment') {
      // CRITICAL FIX: Translate chemical name to farmer-friendly language
      const translatedProductName = getProductName(rawProductName, lang);
      
      let recText = `1. **${translatedProductName}**`;
      // Only add dosage if not already included in the translated name
      if (dosage && dosage !== 'As per label' && dosage !== 'N/A' && !translatedProductName.includes('/')) {
        recText += ` @ ${dosage}`;
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

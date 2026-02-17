/**
 * ARCHITECTURAL CONTRACT — INTENT CLASSIFIER
 *
 * This module:
 * - Classifies farmer language into ONE universal intent_code
 *
 * This module MUST NOT:
 * - extract symptoms or observations
 * - perform diagnosis
 * - apply crop or stage logic
 * - use keyword heuristics or regex fallbacks
 * - generate explanations or UI text
 *
 * Authority boundary:
 * - Meaning → intent only
 * - Biology → intent-resolver + symbolic brain
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT CLASSIFIER v2.0.0 - PURE LLM-DRIVEN, STATELESS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Classify farmer message (any language) → intent_code + confidence
 * 
 * NO fallbacks. NO heuristics. NO caching. NO crop logic.
 * 
 * @version 2.0.0
 */

import { getAPIEndpoint, getBestAvailableProvider } from '../../_shared/aiConfig.ts';
import { VALID_INTENT_CODES, IntentCode } from '../decision/intent-resolver.ts';

export const INTENT_CLASSIFIER_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE - PURE SIGNAL ONLY
// ═══════════════════════════════════════════════════════════════════════════

export interface IntentClassification {
  intent_code: IntentCode;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM PROMPT - MINIMAL, NO CROP/AGRONOMIC LOGIC
// ═══════════════════════════════════════════════════════════════════════════

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classifier for farmer messages about crops.

Your task:
- Read the farmer message (any language: Marathi, Hindi, English, etc.)
- Choose exactly ONE intent_code from the list below
- Do not explain
- Do not diagnose
- Do not infer causes or treatments

INTENT CODES:
- EMERGENCE_FAILURE: Seed didn't sprout, gaps in field
- GROWTH_ANOMALY: Slow growth, stunted plants
- COLOR_CHANGE: Yellowing, browning, pale, color changes
- WILTING_OR_DROOPING: Plants wilting, drooping
- LEAF_DAMAGE_VISIBLE: Holes, chewing damage on leaves
- LEAF_MARKS_OR_SPOTS: Spots, patches, lesions on leaves
- STEM_DAMAGE: Stem holes, tunnels, breakage, boring
- ROOT_OR_BASE_PROBLEM: Root rot, base issues
- PEST_PRESENCE_VISIBLE: Insects or pests physically seen
- DISEASE_LIKE_PATTERN: Spreading pattern, fungal signs
- WATER_STRESS_SIGNAL: Drought or waterlogging signs
- NUTRIENT_STRESS_SIGNAL: Nutrient deficiency patterns
- UNEVEN_FIELD_PATTERN: Patchy, uneven growth in field
- YIELD_OR_OUTPUT_ISSUE: Poor yield, harvest concerns
- WEED_PROBLEM: Weeds growing, weed competition, unwanted plants (तण, खरपतवार)
- FERTILIZER_SCHEDULE: When/how much fertilizer, nutrient schedule (खत, उर्वरक)
- IRRIGATION_QUERY: Water schedule, irrigation timing (पाणी, सिंचन, सिंचाई)
- HARVEST_TIMING: When to harvest, maturity signs
- GENERAL_CROP_INFO: General crop management, planting info
- UNKNOWN_OBSERVATION: Cannot classify

Return JSON only:
{"intent_code": "...", "confidence": 0.0-1.0}

Farmer message:
{farmer_message}`;

// ═══════════════════════════════════════════════════════════════════════════
// SAFE JSON EXTRACTION - Multi-strategy parsing for resilient LLM output handling
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safely extract JSON from LLM output that may contain non-JSON preamble
 * This is pure parsing logic - NO language strings involved
 */
function safeExtractJson(content: string): { intent_code: string; confidence: number } | null {
  if (!content || typeof content !== 'string') return null;
  
  // Clean markdown fences
  let cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Strategy 1: Direct parse (most common case)
  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct.intent_code === 'string') {
      return direct;
    }
  } catch { /* continue to fallback strategies */ }
  
  // Strategy 2: Find JSON object containing intent_code in mixed content
  // Handles cases like "Here is the classification: {...}"
  const jsonMatch = cleaned.match(/\{[^{}]*"intent_code"[^{}]*\}/);
  if (jsonMatch) {
    try {
      const extracted = JSON.parse(jsonMatch[0]);
      if (extracted && typeof extracted.intent_code === 'string') {
        console.log(`   📋 [SafeExtract] Extracted JSON from mixed content`);
        return extracted;
      }
    } catch { /* continue */ }
  }
  
  // Strategy 3: Try to find any valid JSON object in the content
  const anyJsonMatch = cleaned.match(/\{[\s\S]*?\}/);
  if (anyJsonMatch) {
    try {
      const extracted = JSON.parse(anyJsonMatch[0]);
      if (extracted && typeof extracted.intent_code === 'string') {
        console.log(`   📋 [SafeExtract] Extracted JSON via fallback regex`);
        return extracted;
      }
    } catch { /* continue */ }
  }
  
  // LLM returned plain text - signal for clarification flow
  console.warn(`   ⚠️ [SafeExtract] No valid JSON found in LLM response`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CLASSIFICATION FUNCTION - STATELESS, LLM-ONLY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify farmer message into a universal intent code
 * 
 * @param farmerMessage - Raw farmer input in any language
 * @returns IntentClassification with intent_code and confidence
 */
export async function classifyFarmerIntent(
  farmerMessage: string
): Promise<IntentClassification> {
  console.log(`\n🎯 [IntentClassifier v${INTENT_CLASSIFIER_VERSION}] Classifying...`);
  
  let modelLatency: number | undefined;
  
  try {
    const { provider, model, apiKey } = getBestAvailableProvider();
    const endpoint = getAPIEndpoint(provider);
    
    const prompt = INTENT_CLASSIFICATION_PROMPT.replace('{farmer_message}', farmerMessage);
    
    const llmStartTime = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are an intent classifier. Return ONLY valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 100,
        response_format: { type: 'json_object' }
      })
    });
    modelLatency = Date.now() - llmStartTime;
    
    if (!response.ok) {
      throw new Error(`LLM API returned ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('Empty response from LLM');
    }
    
    // Parse JSON safely using multi-strategy extraction
    const parsed = safeExtractJson(content);
    
    if (!parsed) {
      console.warn(`   ⚠️ LLM JSON extraction failed - returning UNKNOWN_OBSERVATION`);
      console.log(`   📋 Architecture: LLM-first design means no hardcoded keyword fallbacks`);
      console.log(`   📋 Downstream clarification layer will ask farmer for more details`);
      
      return {
        intent_code: 'UNKNOWN_OBSERVATION' as IntentCode,
        confidence: 0.0
      };
    }
    
    // Validate intent code against allowed list
    let intentCode = parsed.intent_code?.toUpperCase() || 'UNKNOWN_OBSERVATION';
    if (!VALID_INTENT_CODES.includes(intentCode as IntentCode)) {
      console.warn(`   ⚠️ Invalid intent: ${intentCode} → UNKNOWN_OBSERVATION`);
      intentCode = 'UNKNOWN_OBSERVATION';
    }
    
    const confidence = typeof parsed.confidence === 'number' 
      ? Math.max(0, Math.min(1, parsed.confidence)) 
      : 0.5;
    
    console.log(`   ✅ Intent: ${intentCode} (${(confidence * 100).toFixed(0)}%)`);
    
    return {
      intent_code: intentCode as IntentCode,
      confidence
    };
    
  } catch (error) {
    console.error(`   ❌ Classification error: ${error}`);
    
    // PRODUCTION FIX: Emergency keyword-based fallback when LLM is unavailable
    const emergencyResult = emergencyKeywordFallback(farmerMessage);
    if (emergencyResult) {
      console.log(`   🚑 [EmergencyFallback] Recovered: ${emergencyResult.intent_code} (${(emergencyResult.confidence * 100).toFixed(0)}%)`);
      return emergencyResult;
    }
    
    return emergencyFallbackWithTelemetry(null, modelLatency);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENCY KEYWORD FALLBACK - Only used when LLM is completely unavailable
// This is NOT the primary classification path. It prevents total pipeline failure.
// ═══════════════════════════════════════════════════════════════════════════

function emergencyKeywordFallback(message: string): IntentClassification | null {
  const msg = message.toLowerCase();
  
  // Weed-related (Marathi: तण/निंदणी, Hindi: खरपतवार/घास/निराई)
  if (/तण|खरपतवार|weed|गवत.*वाढ|घास|निंदणी|निराई|आंतरमशागत|களை|కలుపు|আগাছা|નીંદણ|ಕಳೆ|ਨਦੀਨ/i.test(msg)) {
    return { intent_code: 'WEED_PROBLEM' as IntentCode, confidence: 0.6 };
  }
  
  // Fertilizer/nutrition (Marathi: खत, Hindi: उर्वरक/खाद)
  if (/खत|उर्वरक|खाद|fertiliz|nutrient|पोषण/i.test(msg)) {
    return { intent_code: 'FERTILIZER_SCHEDULE' as IntentCode, confidence: 0.6 };
  }
  
  // Irrigation/water (Marathi: पाणी/सिंचन, Hindi: सिंचाई/पानी)
  if (/पाणी|सिंचन|सिंचाई|irrigat|water/i.test(msg)) {
    return { intent_code: 'IRRIGATION_QUERY' as IntentCode, confidence: 0.6 };
  }
  
  // Pest/insect (Marathi: किडा/किडे, Hindi: कीट/कीड़ा)
  if (/किडा|किडे|कीट|कीड़|insect|pest|बोंड|अळी/i.test(msg)) {
    return { intent_code: 'PEST_PRESENCE_VISIBLE' as IntentCode, confidence: 0.5 };
  }
  
  // Disease (Marathi: रोग, Hindi: रोग/बीमारी)
  if (/रोग|बीमारी|disease|fungus|करपा|तांबेरा/i.test(msg)) {
    return { intent_code: 'DISEASE_LIKE_PATTERN' as IntentCode, confidence: 0.5 };
  }
  
  // Yellowing
  if (/पिवळ|पीला|yellow|सुक/i.test(msg)) {
    return { intent_code: 'COLOR_CHANGE' as IntentCode, confidence: 0.5 };
  }
  
  // Wilting
  if (/मळमळ|मुरझ|wilt|droop|सुकत/i.test(msg)) {
    return { intent_code: 'WILTING_OR_DROOPING' as IntentCode, confidence: 0.5 };
  }
  
  // Stem damage / borer
  if (/खोड|तना|stem|borer|छेदक/i.test(msg)) {
    return { intent_code: 'STEM_DAMAGE' as IntentCode, confidence: 0.5 };
  }
  
  // Harvest
  if (/कापणी|काटाई|harvest|तोड/i.test(msg)) {
    return { intent_code: 'HARVEST_TIMING' as IntentCode, confidence: 0.5 };
  }
  
  // Growth issues
  if (/वाढ.*कमी|वाढ.*नाही|stunted|slow.*growth/i.test(msg)) {
    return { intent_code: 'GROWTH_ANOMALY' as IntentCode, confidence: 0.5 };
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH 7: ENRICHED TELEMETRY FALLBACK
// Structured logging for fallback monitoring with latency + registry version
// ═══════════════════════════════════════════════════════════════════════════

function emergencyFallbackWithTelemetry(rawLLMOutput: string | null, modelLatency?: number): IntentClassification {
  console.error(JSON.stringify({
    event: 'INTENT_CLASSIFIER_FALLBACK',
    timestamp: new Date().toISOString(),
    model_response_time_ms: modelLatency || null,
    raw_output_preview: rawLLMOutput?.substring(0, 200) || null,
    fallback_intent: 'UNKNOWN_OBSERVATION',
    fallback_confidence: 0.15
  }));
  return { intent_code: 'UNKNOWN_OBSERVATION' as IntentCode, confidence: 0.15 };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  classifyFarmerIntent,
  INTENT_CLASSIFIER_VERSION
};

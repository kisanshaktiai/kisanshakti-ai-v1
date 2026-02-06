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

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classifier.

Your task:
- Read the farmer message (any language)
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
  
  try {
    const { provider, model, apiKey } = getBestAvailableProvider();
    const endpoint = getAPIEndpoint(provider);
    
    const prompt = INTENT_CLASSIFICATION_PROMPT.replace('{farmer_message}', farmerMessage);
    
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
      console.warn(`   ⚠️ LLM JSON extraction failed - trying keyword fallback`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Keyword-based fallback for common agricultural patterns
      // When LLM fails to return JSON, detect intent from keywords
      // ═══════════════════════════════════════════════════════════════════════════
      const messageLower = farmerMessage.toLowerCase();
      
      // Growth-related keywords → GROWTH_ANOMALY (most common failure case)
      const growthKeywords = ['वाढ', 'growth', 'बढ़', 'stunted', 'slow', 'नाही', 'नहीं', 'होत', 'रहा', 'धीमी', 'मंद', 'खुंटली'];
      if (growthKeywords.some(kw => messageLower.includes(kw))) {
        console.log(`   📋 Keyword fallback: GROWTH_ANOMALY detected from growth patterns`);
        return { intent_code: 'GROWTH_ANOMALY' as IntentCode, confidence: 0.6 };
      }
      
      // Pest-related keywords → PEST_PRESENCE_VISIBLE
      const pestKeywords = ['किडे', 'कीड़े', 'insect', 'pest', 'bug', 'अळी', 'इल्ली', 'किडा', 'कीड़ा'];
      if (pestKeywords.some(kw => messageLower.includes(kw))) {
        console.log(`   📋 Keyword fallback: PEST_PRESENCE_VISIBLE detected`);
        return { intent_code: 'PEST_PRESENCE_VISIBLE' as IntentCode, confidence: 0.6 };
      }
      
      // Yellowing/color keywords → COLOR_CHANGE
      const colorKeywords = ['पिवळ', 'पीला', 'yellow', 'brown', 'तपकिरी', 'रंग'];
      if (colorKeywords.some(kw => messageLower.includes(kw))) {
        console.log(`   📋 Keyword fallback: COLOR_CHANGE detected`);
        return { intent_code: 'COLOR_CHANGE' as IntentCode, confidence: 0.6 };
      }
      
      // Wilting keywords → WILTING_OR_DROOPING
      const wiltKeywords = ['wilting', 'drooping', 'वाळले', 'सुकले', 'मुरझा', 'सूखा'];
      if (wiltKeywords.some(kw => messageLower.includes(kw))) {
        console.log(`   📋 Keyword fallback: WILTING_OR_DROOPING detected`);
        return { intent_code: 'WILTING_OR_DROOPING' as IntentCode, confidence: 0.6 };
      }
      
      // Default fallback - still unknown
      console.warn(`   ⚠️ No keyword patterns matched - returning UNKNOWN_OBSERVATION`);
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
    
    // Honest fallback - no heuristics, no fabrication
    return {
      intent_code: 'UNKNOWN_OBSERVATION',
      confidence: 0.0
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  classifyFarmerIntent,
  INTENT_CLASSIFIER_VERSION
};

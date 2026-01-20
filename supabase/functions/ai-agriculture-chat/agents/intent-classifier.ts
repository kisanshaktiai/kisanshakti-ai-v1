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
    
    // Parse JSON safely
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanContent);
    
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

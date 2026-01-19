/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT CLASSIFIER v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Classify farmer messages into universal intent codes using LLM.
 * This is a THIN layer that ONLY classifies - no diagnosis, no observations.
 * 
 * OUTPUT:
 * A single intent_code from the 15 universal intents defined in
 * observation_intent_master table.
 * 
 * @version 1.0.0
 */

import { getAPIEndpoint, getBestAvailableProvider } from '../../_shared/aiConfig.ts';
import { VALID_INTENT_CODES, IntentCode } from '../decision/intent-resolver.ts';

export const INTENT_CLASSIFIER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface IntentClassification {
  intent_code: IntentCode;
  confidence: number;
  detected_language: string;
  raw_input: string;
  classification_method: 'LLM' | 'FALLBACK';
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM PROMPT FOR INTENT CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

const INTENT_CLASSIFICATION_PROMPT = `You are an agricultural intent classifier. Your ONLY job is to classify what TYPE of problem the farmer is describing.

INTENT CODES (choose exactly ONE):
1. EMERGENCE_FAILURE - Seed/sett didn't sprout, gaps in field, crop not emerging
2. GROWTH_ANOMALY - Slow growth, stunted plants, abnormal growth pattern
3. COLOR_CHANGE - Yellowing, browning, pale leaves, any color changes
4. WILTING_OR_DROOPING - Plants losing turgor, drooping, wilting
5. LEAF_DAMAGE_VISIBLE - Holes in leaves, chewed leaves, torn leaves, physical leaf damage
6. LEAF_MARKS_OR_SPOTS - Spots, patches, lesions, streaks on leaves
7. STEM_DAMAGE - Stem holes, tunnels, breakage, stem boring, dead heart
8. ROOT_OR_BASE_PROBLEM - Root rot, base issues, root damage
9. PEST_PRESENCE_VISIBLE - Insects physically seen, bugs, worms, pests visible
10. DISEASE_LIKE_PATTERN - Spreading pattern, fungal signs, disease symptoms
11. WATER_STRESS_SIGNAL - Drought signs, waterlogging, water excess/deficiency
12. NUTRIENT_STRESS_SIGNAL - Nutrient deficiency patterns, fertilizer issues
13. UNEVEN_FIELD_PATTERN - Patchy field, uneven growth distribution
14. YIELD_OR_OUTPUT_ISSUE - Poor yield, output concerns, harvest problems
15. UNKNOWN_OBSERVATION - Cannot classify, unclear description

RULES:
- Return ONLY ONE intent_code
- If multiple problems mentioned, pick the PRIMARY one (most severe or first mentioned)
- Do NOT diagnose, do NOT suggest treatments
- For "dead heart" in sugarcane, use STEM_DAMAGE
- For yellowing/browning, use COLOR_CHANGE
- For any insect/pest mention, use PEST_PRESENCE_VISIBLE
- For spots/patches on leaves, use LEAF_MARKS_OR_SPOTS
- For holes in leaves, use LEAF_DAMAGE_VISIBLE

Return ONLY valid JSON in this format:
{"intent_code": "...", "confidence": 0.0-1.0}

Examples:
"माझ्या ऊसाची पाने पिवळी झाली" → {"intent_code": "COLOR_CHANGE", "confidence": 0.95}
"रोपांचा मधला पोंगा मेला" → {"intent_code": "STEM_DAMAGE", "confidence": 0.95}
"पानांवर छिद्रे दिसत आहेत" → {"intent_code": "LEAF_DAMAGE_VISIBLE", "confidence": 0.9}
"छोटे कीड़े दिख रहे हैं" → {"intent_code": "PEST_PRESENCE_VISIBLE", "confidence": 0.9}
"पाने सुकत आहेत" → {"intent_code": "WILTING_OR_DROOPING", "confidence": 0.85}

Now classify this farmer message:
{farmer_message}`;

// ═══════════════════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry {
  result: IntentClassification;
  timestamp: number;
}

const classificationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(message: string): string {
  const normalized = message.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `int_${hash}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CLASSIFICATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify farmer message into a universal intent code
 * 
 * @param farmerMessage - Raw farmer input in any language
 * @param detectedLanguage - Language code for logging
 * @returns IntentClassification with intent_code and confidence
 */
export async function classifyFarmerIntent(
  farmerMessage: string,
  detectedLanguage: string = 'unknown'
): Promise<IntentClassification> {
  const startTime = Date.now();
  
  console.log(`\n🎯 [IntentClassifier v${INTENT_CLASSIFIER_VERSION}] Classifying intent...`);
  console.log(`   Input (${detectedLanguage}): "${farmerMessage.substring(0, 60)}${farmerMessage.length > 60 ? '...' : ''}"`);
  
  // Check cache
  const cacheKey = getCacheKey(farmerMessage);
  const cached = classificationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`   📦 Cache HIT: ${cached.result.intent_code}`);
    return cached.result;
  }
  
  try {
    // Get LLM provider
    const { provider, model, apiKey } = getBestAvailableProvider();
    const endpoint = getAPIEndpoint(provider);
    
    console.log(`   🤖 Using ${provider.toUpperCase()} (${model})`);
    
    // Build prompt
    const prompt = INTENT_CLASSIFICATION_PROMPT.replace('{farmer_message}', farmerMessage);
    
    // Make LLM call
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are an agricultural intent classifier. Return ONLY valid JSON.' },
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
    
    // Parse JSON
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanContent);
    
    // Validate intent code
    let intentCode = parsed.intent_code?.toUpperCase() || 'UNKNOWN_OBSERVATION';
    if (!VALID_INTENT_CODES.includes(intentCode as IntentCode)) {
      console.warn(`   ⚠️ Invalid intent code: ${intentCode}, using UNKNOWN_OBSERVATION`);
      intentCode = 'UNKNOWN_OBSERVATION';
    }
    
    const result: IntentClassification = {
      intent_code: intentCode as IntentCode,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      detected_language: detectedLanguage,
      raw_input: farmerMessage,
      classification_method: 'LLM',
      timestamp: new Date().toISOString()
    };
    
    // Cache
    classificationCache.set(cacheKey, { result, timestamp: Date.now() });
    
    const elapsed = Date.now() - startTime;
    console.log(`   ✅ Classified: ${result.intent_code} (${(result.confidence * 100).toFixed(0)}% confidence) in ${elapsed}ms`);
    
    return result;
    
  } catch (error) {
    console.error(`   ❌ Classification error: ${error}`);
    
    // Fallback: try basic keyword matching
    const fallbackIntent = fallbackClassification(farmerMessage);
    
    return {
      intent_code: fallbackIntent,
      confidence: 0.4,
      detected_language: detectedLanguage,
      raw_input: farmerMessage,
      classification_method: 'FALLBACK',
      timestamp: new Date().toISOString()
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK KEYWORD CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Basic keyword-based fallback when LLM is unavailable
 */
function fallbackClassification(message: string): IntentCode {
  const lower = message.toLowerCase();
  
  // Color keywords
  if (lower.includes('पिवळ') || lower.includes('पीला') || lower.includes('yellow') ||
      lower.includes('तपकिरी') || lower.includes('भूरा') || lower.includes('brown')) {
    return 'COLOR_CHANGE';
  }
  
  // Stem/borer keywords
  if (lower.includes('खोड') || lower.includes('तना') || lower.includes('stem') ||
      lower.includes('पोंगा') || lower.includes('मेला') || lower.includes('dead heart') ||
      lower.includes('borer') || lower.includes('छेदक')) {
    return 'STEM_DAMAGE';
  }
  
  // Pest keywords
  if (lower.includes('किड') || lower.includes('कीड़') || lower.includes('insect') ||
      lower.includes('pest') || lower.includes('bug') || lower.includes('अळी') ||
      lower.includes('लार्वा')) {
    return 'PEST_PRESENCE_VISIBLE';
  }
  
  // Wilting keywords
  if (lower.includes('वाळ') || lower.includes('सुक') || lower.includes('मुरझा') ||
      lower.includes('wilt') || lower.includes('droop') || lower.includes('dry')) {
    return 'WILTING_OR_DROOPING';
  }
  
  // Leaf damage keywords
  if (lower.includes('छिद्र') || lower.includes('छेद') || lower.includes('hole') ||
      lower.includes('खाल्ल') || lower.includes('chew')) {
    return 'LEAF_DAMAGE_VISIBLE';
  }
  
  // Spots keywords
  if (lower.includes('डाग') || lower.includes('spot') || lower.includes('धब्बे')) {
    return 'LEAF_MARKS_OR_SPOTS';
  }
  
  // Growth keywords
  if (lower.includes('वाढ') || lower.includes('बढ़') || lower.includes('growth') ||
      lower.includes('stunted') || lower.includes('खुंट')) {
    return 'GROWTH_ANOMALY';
  }
  
  return 'UNKNOWN_OBSERVATION';
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  classifyFarmerIntent,
  INTENT_CLASSIFIER_VERSION
};

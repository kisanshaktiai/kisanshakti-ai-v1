/**
 * ARCHITECTURAL CONTRACT — INTENT CLASSIFIER
 *
 * This module:
 * - Classifies farmer language into ONE universal intent_code
 * - Uses land context (crop, stage, DAS, NDVI) to improve classification
 *
 * This module MUST NOT:
 * - extract symptoms or observations
 * - perform diagnosis
 * - apply crop or stage logic
 * - generate explanations or UI text
 *
 * Authority boundary:
 * - Meaning → intent only
 * - Biology → intent-resolver + symbolic brain
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT CLASSIFIER v3.0.0 - LLM-DRIVEN WITH CONTEXT + RETRY RESILIENCE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Classify farmer message (any language) → intent_code + confidence
 * 
 * v3.0.0 CHANGES:
 * - Accept optional landContext for context-enriched prompts
 * - Add retry with exponential backoff for 429 rate limits
 * - Enrich prompt with crop/stage/DAS/NDVI when available
 * - Explicit romanized regional language instruction
 * - Minimal romanized crop+symptom emergency fallback
 * 
 * @version 3.0.0
 */

import { getAPIEndpoint, getBestAvailableProvider } from '../../_shared/aiConfig.ts';
import { VALID_INTENT_CODES, IntentCode } from '../decision/intent-resolver.ts';

export const INTENT_CLASSIFIER_VERSION = '3.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// LAND CONTEXT INTERFACE (minimal, for prompt enrichment only)
// ═══════════════════════════════════════════════════════════════════════════

export interface IntentLandContext {
  current_crop?: string;
  growth_stage?: string;
  days_since_sowing?: number;
  ndvi_value?: number;
  soil_type?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE - PURE SIGNAL ONLY
// ═══════════════════════════════════════════════════════════════════════════

export interface IntentClassification {
  intent_code: IntentCode;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM PROMPT - CONTEXT-ENRICHED, ROMANIZED-AWARE
// ═══════════════════════════════════════════════════════════════════════════

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classifier for farmer messages about crops.

Your task:
- Read the farmer message (any language: Marathi, Hindi, English, Tamil, Telugu, Kannada, etc.)
- The farmer may write in ROMANIZED regional languages using Latin/English script
- Examples of ROMANIZED input:
  * "mazya usala kide lagale" = Marathi: "my sugarcane has pests"
  * "us mela aahe" = Marathi: "sugarcane has died"  
  * "paan pivli zali" = Marathi: "leaves turned yellow"
  * "mera ganna mar raha hai" = Hindi: "my sugarcane is dying"
  * "pani kab dena hai" = Hindi: "when to give water"
  * "kapus la rog lagla" = Marathi: "cotton got disease"
  * "kidi lagali" = Marathi: "pests appeared"
  * "us chi fawaarni" = Marathi: "sugarcane spraying"
- Common romanized agricultural terms:
  * Crops: us/oos (sugarcane), kapus (cotton), soybean, tur (pigeon pea), gehu (wheat), bhaat (rice), mka/makka (maize)
  * Parts: paan/pan (leaf), khod (stem), mul (root), surli (shoot)
  * Problems: kidi/kida (pest), rog (disease), ali (worm), mela/sukla (died/dried), pivla (yellow), dag (spots), tambera (rust), karpa (blight)
  * Actions: fawaarni (spray), khat (fertilizer), pani (water), nindani (weeding), kapni (harvest)
- Interpret romanized text in the context of the crop and region
- Choose exactly ONE intent_code from the list below
- Do not explain
- Do not diagnose
- Do not infer causes or treatments

{land_context_block}

INTENT CODES:
- EMERGENCE_FAILURE: Seed didn't sprout, gaps in field
- GROWTH_ANOMALY: Slow growth, stunted plants
- COLOR_CHANGE: Yellowing, browning, pale, color changes
- WILTING_OR_DROOPING: Plants wilting, drooping, dying, drying
- LEAF_DAMAGE_VISIBLE: Holes, chewing damage on leaves
- LEAF_MARKS_OR_SPOTS: Spots, patches, lesions, marks on leaves
- STEM_DAMAGE: Stem holes, tunnels, breakage, boring
- ROOT_OR_BASE_PROBLEM: Root rot, base issues
- PEST_PRESENCE_VISIBLE: Insects or pests physically seen
- DISEASE_LIKE_PATTERN: Spreading pattern, fungal signs, plant death/decay
- WATER_STRESS_SIGNAL: Drought or waterlogging signs
- NUTRIENT_STRESS_SIGNAL: Nutrient deficiency patterns
- UNEVEN_FIELD_PATTERN: Patchy, uneven growth in field
- YIELD_OR_OUTPUT_ISSUE: Poor yield, harvest concerns
- WEED_PROBLEM: Weeds growing, weed competition, unwanted plants
- FERTILIZER_SCHEDULE: When/how much fertilizer, nutrient schedule
- IRRIGATION_QUERY: Water schedule, irrigation timing
- HARVEST_TIMING: When to harvest, maturity signs
- GENERAL_CROP_INFO: General crop management, planting info
- SOIL_TESTING_QUERY: Soil testing, soil health questions
- SEED_SELECTION: Seed variety, seed selection questions
- MARKET_PRICE_QUERY: Market prices, selling, mandi rates
- WEATHER_QUERY: Weather forecast, rain prediction
- UNKNOWN_OBSERVATION: Cannot classify

Return JSON only:
{"intent_code": "...", "confidence": 0.0-1.0}

Farmer message:
{farmer_message}`;

// ═══════════════════════════════════════════════════════════════════════════
// BUILD LAND CONTEXT BLOCK FOR PROMPT
// ═══════════════════════════════════════════════════════════════════════════

function buildLandContextBlock(landContext?: IntentLandContext): string {
  if (!landContext || !landContext.current_crop) {
    return '';
  }
  
  const lines: string[] = ['FARM CONTEXT (use this to interpret the farmer\'s message):'];
  
  if (landContext.current_crop) {
    lines.push(`- Crop: ${landContext.current_crop}`);
  }
  if (landContext.growth_stage) {
    const dasStr = landContext.days_since_sowing ? ` (${landContext.days_since_sowing} days after sowing)` : '';
    lines.push(`- Growth Stage: ${landContext.growth_stage}${dasStr}`);
  }
  if (typeof landContext.ndvi_value === 'number') {
    lines.push(`- NDVI: ${landContext.ndvi_value.toFixed(2)}`);
  }
  if (landContext.soil_type) {
    lines.push(`- Soil: ${landContext.soil_type}`);
  }
  
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRY WITH EXPONENTIAL BACKOFF - Handles 429 rate limits
// ═══════════════════════════════════════════════════════════════════════════

async function callLLMWithRetry(
  endpoint: string,
  payload: RequestInit,
  maxRetries: number = 2
): Promise<Response> {
  let attempt = 0;
  let delay = 300; // Start at 300ms

  while (true) {
    const response = await fetch(endpoint, payload);
    
    if (response.status === 429 && attempt < maxRetries) {
      const jitter = Math.random() * 200;
      const waitTime = delay + jitter;
      console.warn(`   ⚠️ [IntentClassifier] 429 rate limit - retry ${attempt + 1}/${maxRetries} after ${waitTime.toFixed(0)}ms`);
      await new Promise(res => setTimeout(res, waitTime));
      delay *= 2;
      attempt++;
      continue;
    }
    
    return response;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFE JSON EXTRACTION - Multi-strategy parsing for resilient LLM output
// ═══════════════════════════════════════════════════════════════════════════

function safeExtractJson(content: string): { intent_code: string; confidence: number } | null {
  if (!content || typeof content !== 'string') return null;
  
  let cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Strategy 1: Direct parse
  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct.intent_code === 'string') return direct;
  } catch { /* continue */ }
  
  // Strategy 2: Find JSON object containing intent_code
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
  
  // Strategy 3: Any valid JSON object
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
  
  console.warn(`   ⚠️ [SafeExtract] No valid JSON found in LLM response`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CLASSIFICATION FUNCTION - WITH RETRY + CONTEXT ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify farmer message into a universal intent code
 * 
 * @param farmerMessage - Raw farmer input in any language
 * @param landContext - Optional land context for prompt enrichment
 * @returns IntentClassification with intent_code and confidence
 */
export async function classifyFarmerIntent(
  farmerMessage: string,
  landContext?: IntentLandContext
): Promise<IntentClassification> {
  console.log(`\n🎯 [IntentClassifier v${INTENT_CLASSIFIER_VERSION}] Classifying...`);
  if (landContext?.current_crop) {
    console.log(`   📋 Land context: ${landContext.current_crop}/${landContext.growth_stage || '?'} DAS=${landContext.days_since_sowing || '?'} NDVI=${landContext.ndvi_value ?? '?'}`);
  }
  
  let modelLatency: number | undefined;
  
  try {
    const { provider, model, apiKey } = getBestAvailableProvider();
    const endpoint = getAPIEndpoint(provider);
    
    const landContextBlock = buildLandContextBlock(landContext);
    const prompt = INTENT_CLASSIFICATION_PROMPT
      .replace('{land_context_block}', landContextBlock)
      .replace('{farmer_message}', farmerMessage);
    
    const llmStartTime = Date.now();
    const response = await callLLMWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are an intent classifier for agricultural queries. Return ONLY valid JSON. The farmer may use romanized regional languages (Latin script for Marathi, Hindi, etc.).' },
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
    
    let parsed = safeExtractJson(content);
    
    if (!parsed) {
      console.warn(`   ⚠️ LLM JSON extraction failed on first attempt. Retrying with stricter prompt...`);
      
      // RETRY: One more attempt with a strict JSON-only prompt
      try {
        const retryStartTime = Date.now();
        const retryResponse = await callLLMWithRetry(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'Return ONLY valid JSON with intent_code and confidence fields. No explanation. No markdown. No additional text.' },
              { role: 'user', content: `Classify this agricultural query into an intent. Query: "${farmerMessage}"\n\nReturn JSON: {"intent_code": "...", "confidence": 0.0-1.0}` }
            ],
            temperature: 0,
            max_tokens: 80,
            response_format: { type: 'json_object' }
          })
        });
        const retryLatency = Date.now() - retryStartTime;
        
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryContent = retryData.choices?.[0]?.message?.content;
          if (retryContent) {
            parsed = safeExtractJson(retryContent);
            if (parsed) {
              console.log(`   🔄 [Retry] JSON extraction succeeded on retry [${retryLatency}ms]`);
            }
          }
        }
      } catch (retryError) {
        console.warn(`   ⚠️ [Retry] Second attempt also failed: ${retryError}`);
      }
      
      if (!parsed) {
        console.error(`   ❌ LLM JSON extraction failed after retry - falling back to emergency keyword matcher`);
        // Try emergency keyword fallback before returning UNKNOWN
        const emergencyResult = emergencyKeywordFallback(farmerMessage);
        if (emergencyResult) {
          console.log(`   🚑 [EmergencyFallback] Recovered after JSON failure: ${emergencyResult.intent_code}`);
          return emergencyResult;
        }
        return { intent_code: 'UNKNOWN_OBSERVATION' as IntentCode, confidence: 0.0 };
      }
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
    
    console.log(`   ✅ Intent: ${intentCode} (${(confidence * 100).toFixed(0)}%) [${modelLatency}ms]`);
    
    return { intent_code: intentCode as IntentCode, confidence };
    
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
// Includes Devanagari, English, AND minimal romanized Marathi/Hindi patterns
// ═══════════════════════════════════════════════════════════════════════════

function emergencyKeywordFallback(message: string): IntentClassification | null {
  const msg = message.toLowerCase();
  
  // Weed-related (Devanagari + English + Romanized)
  if (/तण|खरपतवार|weed|गवत.*वाढ|घास|निंदणी|निराई|आंतरमशागत|களை|కలుపు|আগাছা|નીંદણ|ಕಳೆ|ਨਦੀਨ|\btan\b|nindani|gawat/i.test(msg)) {
    return { intent_code: 'WEED_PROBLEM' as IntentCode, confidence: 0.6 };
  }
  
  // Fertilizer/nutrition (Devanagari + English + Romanized)
  if (/खत|उर्वरक|खाद|fertiliz|nutrient|पोषण|\bkhat\b|\bkhaad\b/i.test(msg)) {
    return { intent_code: 'FERTILIZER_SCHEDULE' as IntentCode, confidence: 0.6 };
  }
  
  // Irrigation/water (Devanagari + English + Romanized)
  if (/पाणी|सिंचन|सिंचाई|irrigat|water|\bpani\b|\bpaani\b/i.test(msg)) {
    return { intent_code: 'IRRIGATION_QUERY' as IntentCode, confidence: 0.6 };
  }
  
  // Pest/insect (Devanagari + English + Romanized)
  if (/किडा|किडे|कीट|कीड़|insect|pest|बोंड|अळी|\bkidi\b|\bkida\b|\bali\b|\balu\b/i.test(msg)) {
    return { intent_code: 'PEST_PRESENCE_VISIBLE' as IntentCode, confidence: 0.5 };
  }
  
  // Disease (Devanagari + English + Romanized)
  if (/रोग|बीमारी|disease|fungus|करपा|तांबेरा|\brog\b/i.test(msg)) {
    return { intent_code: 'DISEASE_LIKE_PATTERN' as IntentCode, confidence: 0.5 };
  }
  
  // Leaf spots/marks (Romanized: thimaki, thipke, dag, dhabbe)
  if (/thim[ae]ki|thipke|ठिपके|dag\b|dhabbe|spots?.*leaf|leaf.*spots?/i.test(msg)) {
    return { intent_code: 'LEAF_MARKS_OR_SPOTS' as IntentCode, confidence: 0.55 };
  }
  
  // Yellowing (Devanagari + Romanized)
  if (/पिवळ|पीला|yellow|सुक|\bpival[ae]?\b|\bpivla\b|\bpila\b/i.test(msg)) {
    return { intent_code: 'COLOR_CHANGE' as IntentCode, confidence: 0.5 };
  }
  
  // Wilting/dying (Devanagari + Romanized: mela, sukla = died/wilted)
  if (/मळमळ|मुरझ|wilt|droop|सुकत|\bmel[ae]\b|\bsukl[ae]\b|\bsukle\b/i.test(msg)) {
    return { intent_code: 'WILTING_OR_DROOPING' as IntentCode, confidence: 0.5 };
  }
  
  // Combined romanized: crop affected/died (e.g., "us mela" = sugarcane died)
  if (/\b(us|oos|kapus|soybean|tur)\b/i.test(msg) && /\b(mel[ae]|sukl[ae]|dead|marat?|affect)/i.test(msg)) {
    return { intent_code: 'DISEASE_LIKE_PATTERN' as IntentCode, confidence: 0.5 };
  }
  
  // Stem damage / borer
  if (/खोड|तना|stem|borer|छेदक|\bkhod\b/i.test(msg)) {
    return { intent_code: 'STEM_DAMAGE' as IntentCode, confidence: 0.5 };
  }
  
  // Harvest
  if (/कापणी|काटाई|harvest|तोड|\bkapni\b|\bkapani\b/i.test(msg)) {
    return { intent_code: 'HARVEST_TIMING' as IntentCode, confidence: 0.5 };
  }
  
  // Growth issues
  if (/वाढ.*कमी|वाढ.*नाही|stunted|slow.*growth/i.test(msg)) {
    return { intent_code: 'GROWTH_ANOMALY' as IntentCode, confidence: 0.5 };
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENRICHED TELEMETRY FALLBACK
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

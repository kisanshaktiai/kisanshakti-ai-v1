/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIVERSAL SEMANTIC EXTRACTOR v3.0.0 (Intent-Based Architecture)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Extract semantic meaning from farmer messages in ANY language and output
 * a universal INTENT_CODE that maps to database-validated observations.
 * 
 * v3.0.0 CHANGES:
 * - Now outputs intent_code instead of detailed observations
 * - Intents are validated against observation_intent_master table
 * - Observations are resolved via intent_observation_mapping (crop+stage aware)
 * 
 * FLOW:
 * 1. Farmer message (any language) → LLM → intent_code
 * 2. intent_code → intent-resolver.ts → observation_code[]
 * 3. observation_code[] → rule engine → treatment
 * 
 * @version 3.0.0
 * @phase Database-Driven Symbolic Brain
 */

import { getAPIEndpoint, getBestAvailableProvider } from '../../_shared/aiConfig.ts';
import { classifyFarmerIntent, IntentClassification } from './intent-classifier.ts';

export const SEMANTIC_EXTRACTOR_VERSION = '3.0.0'; // Intent-based architecture

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE (v3.0.0 - Intent-Based)
// ═══════════════════════════════════════════════════════════════════════════

export interface SemanticExtraction {
  // v3.0.0: Primary output is now intent_code
  intent_code: string;                        // Universal intent from LLM
  intent_confidence: number;                  // Confidence in intent classification
  
  // Legacy fields for backward compatibility
  farmer_concern: string;                     // Plain English description of problem
  affected_plant_parts: string[];             // ["leaves", "stem", "roots", etc.]
  visual_changes: string[];                   // ["turning yellow", "drying out", etc.]
  pest_behavior: string[] | null;             // ["small insects visible", "flying", etc.]
  severity_indicator: 'mild' | 'moderate' | 'severe' | 'critical' | 'unknown';
  distribution_pattern: string;               // "entire field", "patches", "scattered", etc.
  temporal_pattern: string;                   // "sudden", "gradual", "recently started", etc.
  extraction_timestamp: string;
  confidence: number;                         // 0.0-1.0
  extraction_method: 'LLM' | 'FALLBACK' | 'INTENT_CLASSIFIER' | 'FALLBACK_UNAVAILABLE';
  detected_language: string;
  raw_input: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM PROMPT TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

const SEMANTIC_EXTRACTION_PROMPT = `You are an agricultural observation extractor. Your job is to understand what the farmer is describing and convert it to simple, plain English.

INPUT: Farmer's message in any language (Marathi, Hindi, English, Telugu, Gujarati, Tamil, or any other)
OUTPUT: JSON object with plain English descriptions

Extract the following:
1. farmer_concern: What is the farmer seeing/experiencing? (plain English, 1-2 sentences)
2. affected_plant_parts: Which parts of the plant are affected? Array of: "leaves", "stem", "roots", "whole plant", "fruit", "flower", "grain", "boll"
3. visual_changes: What physical changes are visible? Array of descriptions like: "turning yellow", "drying out", "wilting", "spots appearing", "holes", "rotting", "curling", "browning"
4. pest_behavior: If insects are mentioned, describe their behavior. Array like: "small insects visible", "flying insects", "crawling insects", "jumping insects", "larvae present", "small green insects", "small black insects", "white insects". Set to null if no insects mentioned.
5. severity_indicator: Based on the farmer's tone and description, what is the severity? One of: "mild", "moderate", "severe", "critical"
6. distribution_pattern: Is the problem affecting the whole field or just some areas? One of: "entire field", "patches", "scattered", "field edges", "specific area", "not specified"
7. temporal_pattern: When did this start or how is it progressing? One of: "sudden", "gradual", "recently started", "ongoing for weeks", "just noticed", "not specified"

CRITICAL RULES:
- Use ONLY plain English words, NO codes, NO technical terms, NO pest/disease names
- If insects are mentioned, describe their size/color/behavior in English (e.g., "small green insects", "large brown insects")
- If the farmer mentions a time period, extract it (e.g., "started 3 days ago" → "recently started")
- Keep descriptions simple and farmer-understandable
- For visual_changes, use simple descriptive phrases like "turning yellow" not "yellowing"
- Do NOT diagnose - only describe what the farmer observes

Example 1:
Input (Marathi): "माझ्या ऊस पिकाचे पान पिवळे झाले आणि सुकत आहेत"
Output:
{
  "farmer_concern": "Leaves are turning yellow and drying out",
  "affected_plant_parts": ["leaves"],
  "visual_changes": ["turning yellow", "drying out"],
  "pest_behavior": null,
  "severity_indicator": "moderate",
  "distribution_pattern": "not specified",
  "temporal_pattern": "not specified"
}

Example 2:
Input (Hindi): "मेरे खेत में कुछ जगह पर पौधे मर गए हैं और छोटे काले कीड़े दिख रहे हैं"
Output:
{
  "farmer_concern": "Plants have died in some areas and small black insects are visible",
  "affected_plant_parts": ["whole plant"],
  "visual_changes": ["plant death"],
  "pest_behavior": ["small insects visible", "black insects"],
  "severity_indicator": "severe",
  "distribution_pattern": "patches",
  "temporal_pattern": "not specified"
}

Example 3:
Input (Telugu): "నా పంట ఆకులు పసుపు అయ్యాయి మరియు చిన్న తెల్ల పురుగులు కనిపిస్తున్నాయి"
Output:
{
  "farmer_concern": "Leaves have turned yellow and small white insects are visible",
  "affected_plant_parts": ["leaves"],
  "visual_changes": ["turning yellow"],
  "pest_behavior": ["small insects visible", "white insects"],
  "severity_indicator": "moderate",
  "distribution_pattern": "not specified",
  "temporal_pattern": "not specified"
}

Example 4:
Input (English): "My sugarcane has dead heart, the central shoot dried and can be pulled easily"
Output:
{
  "farmer_concern": "Central shoot is dead and dried, can be pulled out easily",
  "affected_plant_parts": ["stem"],
  "visual_changes": ["dead heart", "central shoot dried", "easily pulled out"],
  "pest_behavior": null,
  "severity_indicator": "severe",
  "distribution_pattern": "not specified",
  "temporal_pattern": "not specified"
}

Now process this farmer message:
{farmer_message}

Return ONLY valid JSON, no markdown, no explanations, no code blocks.`;

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE (5 minute TTL)
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry {
  result: SemanticExtraction;
  timestamp: number;
}

const extractionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(message: string): string {
  // Simple hash for cache key
  const normalized = message.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sem_${hash}`;
}

function getFromCache(message: string): SemanticExtraction | null {
  const key = getCacheKey(message);
  const entry = extractionCache.get(key);
  
  if (!entry) return null;
  
  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    extractionCache.delete(key);
    return null;
  }
  
  console.log(`   📦 [SemanticExtractor] Cache HIT for message hash: ${key}`);
  return entry.result;
}

function setCache(message: string, result: SemanticExtraction): void {
  const key = getCacheKey(message);
  extractionCache.set(key, { result, timestamp: Date.now() });
  
  // Cleanup old entries (keep cache size reasonable)
  if (extractionCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of extractionCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) {
        extractionCache.delete(k);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION (v3.0.0 - Intent-First)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract semantic meaning from farmer's message in ANY language
 * 
 * v3.0.0: Now uses intent classification as primary output.
 * The intent_code is used by intent-resolver.ts to get database-validated observations.
 * 
 * @param farmerMessage - Raw farmer input in any language
 * @param detectedLanguage - Optional language code (for logging only)
 * @returns SemanticExtraction - With intent_code as primary output
 */
export async function extractSemanticMeaning(
  farmerMessage: string,
  detectedLanguage: string = 'unknown'
): Promise<SemanticExtraction> {
  const startTime = Date.now();
  
  console.log(`\n🔮 [SemanticExtractor v${SEMANTIC_EXTRACTOR_VERSION}] Processing message (Intent-First)...`);
  console.log(`   Input (${detectedLanguage}): \"${farmerMessage.substring(0, 80)}${farmerMessage.length > 80 ? '...' : ''}\"`);
  
  // Check cache first
  const cached = getFromCache(farmerMessage);
  if (cached) {
    return cached;
  }
  
  try {
    // v3.0.0: Use Intent Classifier as PRIMARY extraction
    const intentResult: IntentClassification = await classifyFarmerIntent(
      farmerMessage,
      detectedLanguage
    );
    
    console.log(`   🎯 Intent: ${intentResult.intent_code} (${(intentResult.confidence * 100).toFixed(0)}%)`);
    
    // Build result with intent as primary output
    const result: SemanticExtraction = {
      // v3.0.0: Intent-first fields
      intent_code: intentResult.intent_code,
      intent_confidence: intentResult.confidence,
      
      // Legacy fields (populated from intent for backward compatibility)
      farmer_concern: getDefaultConcernFromIntent(intentResult.intent_code),
      affected_plant_parts: getAffectedPartsFromIntent(intentResult.intent_code),
      visual_changes: getVisualChangesFromIntent(intentResult.intent_code),
      pest_behavior: intentResult.intent_code === 'PEST_PRESENCE_VISIBLE' ? ['insects visible'] : null,
      severity_indicator: getSeverityFromIntent(intentResult.intent_code),
      distribution_pattern: 'not specified',
      temporal_pattern: 'not specified',
      extraction_timestamp: new Date().toISOString(),
      confidence: intentResult.confidence,
      extraction_method: intentResult.classification_method === 'LLM' ? 'INTENT_CLASSIFIER' : 'FALLBACK',
      detected_language: detectedLanguage,
      raw_input: farmerMessage
    };
    
    // Cache result
    setCache(farmerMessage, result);
    
    const elapsed = Date.now() - startTime;
    console.log(`   ✅ Extraction complete in ${elapsed}ms`);
    console.log(`      Intent: ${result.intent_code} (confidence: ${result.intent_confidence})`);
    
    return result;
    
  } catch (error) {
    console.error(`   ❌ [SemanticExtractor] Error: ${error}`);
    
    // Return fallback extraction
    return createFallbackExtraction(farmerMessage, detectedLanguage, error as Error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT TO LEGACY FIELD MAPPERS
// ═══════════════════════════════════════════════════════════════════════════

function getDefaultConcernFromIntent(intent: string): string {
  const concernMap: Record<string, string> = {
    'EMERGENCE_FAILURE': 'Crop emergence/germination problem',
    'GROWTH_ANOMALY': 'Abnormal or slow growth observed',
    'COLOR_CHANGE': 'Plant color changes observed',
    'WILTING_OR_DROOPING': 'Plants wilting or drooping',
    'LEAF_DAMAGE_VISIBLE': 'Physical damage to leaves visible',
    'LEAF_MARKS_OR_SPOTS': 'Spots or marks on leaves',
    'STEM_DAMAGE': 'Stem damage or boring observed',
    'ROOT_OR_BASE_PROBLEM': 'Root or base issues',
    'PEST_PRESENCE_VISIBLE': 'Insects or pests visible',
    'DISEASE_LIKE_PATTERN': 'Disease-like pattern spreading',
    'WATER_STRESS_SIGNAL': 'Water stress signs visible',
    'NUTRIENT_STRESS_SIGNAL': 'Nutrient deficiency signs',
    'UNEVEN_FIELD_PATTERN': 'Uneven growth pattern in field',
    'YIELD_OR_OUTPUT_ISSUE': 'Yield or output concern',
    'UNKNOWN_OBSERVATION': 'Observation needs clarification'
  };
  return concernMap[intent] || 'Agricultural observation';
}

function getAffectedPartsFromIntent(intent: string): string[] {
  const partsMap: Record<string, string[]> = {
    'LEAF_DAMAGE_VISIBLE': ['leaves'],
    'LEAF_MARKS_OR_SPOTS': ['leaves'],
    'COLOR_CHANGE': ['leaves'],
    'STEM_DAMAGE': ['stem'],
    'ROOT_OR_BASE_PROBLEM': ['roots'],
    'WILTING_OR_DROOPING': ['whole plant'],
    'EMERGENCE_FAILURE': ['whole plant'],
    'GROWTH_ANOMALY': ['whole plant']
  };
  return partsMap[intent] || [];
}

function getVisualChangesFromIntent(intent: string): string[] {
  const changesMap: Record<string, string[]> = {
    'COLOR_CHANGE': ['color change visible'],
    'WILTING_OR_DROOPING': ['wilting'],
    'LEAF_DAMAGE_VISIBLE': ['physical damage'],
    'LEAF_MARKS_OR_SPOTS': ['spots or marks'],
    'STEM_DAMAGE': ['stem damage'],
    'GROWTH_ANOMALY': ['growth abnormality']
  };
  return changesMap[intent] || [];
}

function getSeverityFromIntent(intent: string): 'mild' | 'moderate' | 'severe' | 'critical' | 'unknown' {
  const severeIntents = ['STEM_DAMAGE', 'ROOT_OR_BASE_PROBLEM', 'EMERGENCE_FAILURE'];
  const moderateIntents = ['COLOR_CHANGE', 'WILTING_OR_DROOPING', 'PEST_PRESENCE_VISIBLE', 'DISEASE_LIKE_PATTERN'];
  
  if (severeIntents.includes(intent)) return 'severe';
  if (moderateIntents.includes(intent)) return 'moderate';
  return 'moderate';
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function validateSeverity(severity: any): 'mild' | 'moderate' | 'severe' | 'critical' {
  const valid = ['mild', 'moderate', 'severe', 'critical'];
  if (typeof severity === 'string' && valid.includes(severity.toLowerCase())) {
    return severity.toLowerCase() as 'mild' | 'moderate' | 'severe' | 'critical';
  }
  return 'moderate'; // Default
}

/**
 * HONEST FALLBACK - No hardcoded language patterns
 * 
 * When LLM fails (API error, rate limit, network issue), we return an honest
 * 0.0 confidence response. We do NOT attempt to parse symptoms with hardcoded
 * patterns because:
 * 
 * 1. Can't cover all languages/dialects/regional variations
 * 2. 40% confidence is unreliable for diagnosis anyway
 * 3. Better to fail gracefully than give wrong diagnosis
 * 4. Maintains "Universal Language" architecture integrity
 * 
 * @version 2.0.0 - Removed all hardcoded Marathi/Hindi/Telugu patterns
 */
function createFallbackExtraction(
  farmerMessage: string,
  language: string,
  error: Error
): SemanticExtraction {
  console.log(`   ⚠️ [SemanticExtractor] LLM UNAVAILABLE - returning honest fallback`);
  console.log(`   ⚠️ [SemanticExtractor] Error: ${error.message}`);
  console.log(`   ⚠️ [SemanticExtractor] NO symptom detection attempted (respecting Universal Language Architecture)`);
  
  // Return honest 0.0 confidence - system is unavailable
  return {
    farmer_concern: 'System temporarily unavailable - please try again in a moment',
    affected_plant_parts: [],
    visual_changes: [],
    pest_behavior: null,
    severity_indicator: 'unknown',
    distribution_pattern: 'not specified',
    temporal_pattern: 'not specified',
    extraction_timestamp: new Date().toISOString(),
    confidence: 0.0, // HONEST: We couldn't understand the message
    extraction_method: 'FALLBACK_UNAVAILABLE',
    detected_language: language,
    raw_input: farmerMessage
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  extractSemanticMeaning,
  SEMANTIC_EXTRACTOR_VERSION
};

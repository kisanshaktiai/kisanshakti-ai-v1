/**
 * IMPORTANT ARCHITECTURAL CONTRACT
 *
 * This module is INTENT-ONLY.
 * It MUST NOT:
 * - infer observations
 * - infer severity
 * - infer affected plant parts
 * - infer symptoms
 *
 * Intent ≠ Observation.
 * Observation resolution happens ONLY via:
 * intent → intent-resolver → intent_observation_mapping (database)
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIVERSAL SEMANTIC EXTRACTOR v4.0.0 (Pure Intent Architecture)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Extract INTENT ONLY from farmer messages. This module does NOT infer
 * observations, severity, plant parts, or any agronomic meaning.
 * 
 * v4.0.0 CHANGES:
 * - REMOVED: getDefaultConcernFromIntent (violates symbolic authority)
 * - REMOVED: getAffectedPartsFromIntent (violates symbolic authority)
 * - REMOVED: getVisualChangesFromIntent (violates symbolic authority)
 * - REMOVED: getSeverityFromIntent (violates symbolic authority)
 * - All legacy fields now use neutral/empty values only
 * - Observation resolution happens ONLY in intent-resolver.ts via database
 * 
 * FLOW:
 * 1. Farmer message (any language) → classifyFarmerIntent() → intent_code
 * 2. intent_code → intent-resolver.ts → observation_code[] (database lookup)
 * 3. observation_code[] → rule engine → treatment
 * 
 * @version 4.0.0
 * @phase Pure Intent Architecture - No Observation Inference
 */

import { classifyFarmerIntent, IntentClassification } from './intent-classifier.ts';

export const SEMANTIC_EXTRACTOR_VERSION = '4.0.0'; // Pure intent architecture

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE (v4.0.0 - Pure Intent)
// ═══════════════════════════════════════════════════════════════════════════

export interface SemanticExtraction {
  // v4.0.0: Primary output - ONLY these fields carry meaning
  intent_code: string;                        // Universal intent from LLM
  intent_confidence: number;                  // Confidence in intent classification
  raw_input: string;                          // Original farmer message
  detected_language: string;                  // Detected language code
  extraction_timestamp: string;               // ISO timestamp
  extraction_method: 'INTENT_CLASSIFIER' | 'FALLBACK_UNAVAILABLE';
  confidence: number;                         // 0.0-1.0
  
  // Legacy fields - MUST remain neutral for backward compatibility
  // These fields exist ONLY for API compatibility and MUST NOT contain inferred meaning
  farmer_concern: string | null;              // Always null - no inference allowed
  affected_plant_parts: string[];             // Always empty - no inference allowed
  visual_changes: string[];                   // Always empty - no inference allowed
  pest_behavior: string[] | null;             // Always null - no inference allowed
  severity_indicator: 'unknown';              // Always 'unknown' - no inference allowed
  distribution_pattern: 'unknown';            // Always 'unknown' - no inference allowed
  temporal_pattern: 'unknown';                // Always 'unknown' - no inference allowed
}

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
// MAIN EXTRACTION FUNCTION (v4.0.0 - Pure Intent)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract INTENT ONLY from farmer's message in ANY language.
 * 
 * v4.0.0: This function outputs ONLY intent_code and confidence.
 * All legacy fields are set to neutral/empty values.
 * Observation resolution happens ONLY via intent-resolver.ts + database.
 * 
 * @param farmerMessage - Raw farmer input in any language
 * @param detectedLanguage - Optional language code (for logging only)
 * @returns SemanticExtraction - With intent_code as ONLY meaningful output
 */
export async function extractSemanticMeaning(
  farmerMessage: string,
  detectedLanguage: string = 'unknown'
): Promise<SemanticExtraction> {
  const startTime = Date.now();
  
  console.log(`\n🔮 [SemanticExtractor v${SEMANTIC_EXTRACTOR_VERSION}] Processing message (Pure Intent)...`);
  console.log(`   Input (${detectedLanguage}): "${farmerMessage.substring(0, 80)}${farmerMessage.length > 80 ? '...' : ''}"`);
  
  // Check cache first
  const cached = getFromCache(farmerMessage);
  if (cached) {
    return cached;
  }
  
  try {
    // v4.0.0: Use Intent Classifier as ONLY extraction method
    const intentResult: IntentClassification = await classifyFarmerIntent(
      farmerMessage,
      detectedLanguage
    );
    
    console.log(`   🎯 Intent: ${intentResult.intent_code} (${(intentResult.confidence * 100).toFixed(0)}%)`);
    
    // Build result with intent as ONLY meaningful output
    // All legacy fields are neutral - NO inference allowed
    const result: SemanticExtraction = {
      // v4.0.0: Authoritative fields - these are the ONLY meaningful outputs
      intent_code: intentResult.intent_code,
      intent_confidence: intentResult.confidence,
      raw_input: farmerMessage,
      detected_language: detectedLanguage,
      extraction_timestamp: new Date().toISOString(),
      extraction_method: intentResult.classification_method === 'LLM' ? 'INTENT_CLASSIFIER' : 'FALLBACK_UNAVAILABLE',
      confidence: intentResult.confidence,
      
      // Legacy fields - ALL neutral/empty for backward compatibility
      // These MUST NOT contain inferred meaning per architectural contract
      farmer_concern: null,
      affected_plant_parts: [],
      visual_changes: [],
      pest_behavior: null,
      severity_indicator: 'unknown',
      distribution_pattern: 'unknown',
      temporal_pattern: 'unknown'
    };
    
    // Cache result
    setCache(farmerMessage, result);
    
    const elapsed = Date.now() - startTime;
    console.log(`   ✅ Extraction complete in ${elapsed}ms`);
    console.log(`      Intent: ${result.intent_code} (confidence: ${result.intent_confidence})`);
    
    return result;
    
  } catch (error) {
    console.error(`   ❌ [SemanticExtractor] Error: ${error}`);
    
    // Return fallback extraction with honest 0.0 confidence
    return createFallbackExtraction(farmerMessage, detectedLanguage, error as Error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HONEST FALLBACK - No hardcoded language patterns, no inference
 * 
 * When LLM fails (API error, rate limit, network issue), we return an honest
 * 0.0 confidence response. We do NOT attempt to infer anything because:
 * 
 * 1. Intent ≠ Observation (observation resolution is database-driven)
 * 2. Can't cover all languages/dialects/regional variations
 * 3. 0.0 confidence is honest - system is unavailable
 * 4. Maintains Pure Intent Architecture integrity
 * 
 * @version 4.0.0 - No inference, no hardcoded patterns
 */
function createFallbackExtraction(
  farmerMessage: string,
  language: string,
  error: Error
): SemanticExtraction {
  console.log(`   ⚠️ [SemanticExtractor] LLM UNAVAILABLE - returning honest fallback`);
  console.log(`   ⚠️ [SemanticExtractor] Error: ${error.message}`);
  console.log(`   ⚠️ [SemanticExtractor] NO inference attempted (Pure Intent Architecture)`);
  
  // Return honest 0.0 confidence - system is unavailable
  // All fields neutral/empty per architectural contract
  return {
    // Authoritative fields - honest failure state
    intent_code: 'UNKNOWN_OBSERVATION',
    intent_confidence: 0.0,
    raw_input: farmerMessage,
    detected_language: language,
    extraction_timestamp: new Date().toISOString(),
    extraction_method: 'FALLBACK_UNAVAILABLE',
    confidence: 0.0,
    
    // Legacy fields - ALL neutral/empty
    farmer_concern: null,
    affected_plant_parts: [],
    visual_changes: [],
    pest_behavior: null,
    severity_indicator: 'unknown',
    distribution_pattern: 'unknown',
    temporal_pattern: 'unknown'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  extractSemanticMeaning,
  SEMANTIC_EXTRACTOR_VERSION
};

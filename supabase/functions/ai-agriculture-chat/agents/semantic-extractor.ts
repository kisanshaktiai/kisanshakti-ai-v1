/**
 * ARCHITECTURAL CONTRACT — SEMANTIC EXTRACTOR v5.1.0
 *
 * This module:
 * - Converts raw farmer language (ANY language) → intent_code
 * - Provides backward-compatible fields with safe defaults
 *
 * This module MUST NOT:
 * - extract detailed observations (deprecated in v5.0)
 * - describe symptoms (moved to intent-resolver.ts)
 * - infer severity (derived from intent_code downstream)
 * - map to crops or stages (context-authority.ts handles this)
 * - perform diagnosis (symbolic-reasoner.ts handles this)
 * - generate user-facing text (narration layer handles this)
 *
 * All biological meaning is resolved downstream via:
 * intent-resolver.ts → symbolic decision brain → LLM narration
 * 
 * @version 5.1.0 - Added backward-compatible defaults to prevent orchestrator crashes
 */

import { classifyFarmerIntent, type IntentLandContext } from './intent-classifier.ts';

export const SEMANTIC_EXTRACTOR_VERSION = '5.1.0';

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE - PURE INTENT + BACKWARD-COMPATIBLE DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SemanticExtraction v5.1.0
 * 
 * Primary output: intent_code + intent_confidence
 * Backward-compatible defaults: All legacy fields have safe empty/default values
 * 
 * This prevents crashes in code that still accesses deprecated fields.
 */
export interface SemanticExtraction {
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIMARY OUTPUT (v5.0.0+)
  // ═══════════════════════════════════════════════════════════════════════════
  intent_code: string;
  intent_confidence: number;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BACKWARD-COMPATIBLE DEFAULTS (all deprecated, but safe to access)
  // These fields are NOT populated by the extractor but have safe defaults
  // to prevent crashes in legacy code that accesses them.
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** @deprecated Use intent_code instead. Empty string default. */
  farmer_concern: string;
  
  /** @deprecated Derived from intent_code in downstream layers. Empty array default. */
  affected_plant_parts: string[];
  
  /** @deprecated Derived from intent_code in downstream layers. Empty array default. */
  visual_changes: string[];
  
  /** @deprecated Derived from intent_code in downstream layers. Empty array default. */
  pest_behavior: string[];
  
  /** @deprecated Use 'not specified' as default. */
  distribution_pattern: string;
  
  /** @deprecated Use 'moderate' as default. */
  severity_indicator: string;
  
  /** @deprecated Use intent_confidence instead. */
  confidence: number;
  
  /** @deprecated Always 'INTENT_CLASSIFICATION' in v5.x */
  extraction_method: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFE DEFAULT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a SemanticExtraction with all required fields having safe defaults.
 * This guarantees no undefined access errors.
 */
function buildSafeSemanticExtraction(
  intent_code: string,
  intent_confidence: number
): SemanticExtraction {
  return {
    // Primary output
    intent_code,
    intent_confidence,
    
    // Backward-compatible defaults (all safe to access)
    farmer_concern: '',                    // Empty string - safe for .substring()
    affected_plant_parts: [],              // Empty array - safe for .join()
    visual_changes: [],                    // Empty array - safe for .slice()
    pest_behavior: [],                     // Empty array - safe for iteration
    distribution_pattern: 'not specified', // Default pattern
    severity_indicator: 'moderate',        // Default severity
    confidence: intent_confidence,         // Map to legacy field
    extraction_method: 'INTENT_CLASSIFICATION' // v5.x method
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION - STATELESS, PURE INTENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract intent_code from farmer message in ANY language.
 * 
 * @param farmerMessage - Raw farmer input in any language
 * @param _detectedLanguage - Optional language hint (not used in v5.x)
 * @param landContext - Optional land context for prompt enrichment
 * @returns SemanticExtraction - { intent_code, intent_confidence, ...backward-compatible defaults }
 */
export async function extractSemanticMeaning(
  farmerMessage: string,
  _detectedLanguage?: string,
  landContext?: IntentLandContext
): Promise<SemanticExtraction> {
  console.log(`\n🔮 [SemanticExtractor v${SEMANTIC_EXTRACTOR_VERSION}] Extracting intent...`);
  
  // Normalize input to prevent crashes
  const safeMessage = typeof farmerMessage === 'string' ? farmerMessage : '';
  
  if (!safeMessage.trim()) {
    console.log(`   ⚠️ Empty message - returning UNKNOWN_OBSERVATION`);
    return buildSafeSemanticExtraction('UNKNOWN_OBSERVATION', 0.0);
  }
  
  try {
    const intentResult = await classifyFarmerIntent(safeMessage, landContext);
    
    // Validate intent_code is non-empty
    const intent_code = intentResult.intent_code && intentResult.intent_code.trim() !== ''
      ? intentResult.intent_code
      : 'UNKNOWN_OBSERVATION';
    
    console.log(`   🎯 Intent: ${intent_code} (${(intentResult.confidence * 100).toFixed(0)}%)`);
    
    return buildSafeSemanticExtraction(intent_code, intentResult.confidence);
    
  } catch (error) {
    console.error(`   ❌ [SemanticExtractor] Error: ${error}`);
    
    // Honest fallback - no fabrication
    return buildSafeSemanticExtraction('UNKNOWN_OBSERVATION', 0.0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  extractSemanticMeaning,
  SEMANTIC_EXTRACTOR_VERSION
};

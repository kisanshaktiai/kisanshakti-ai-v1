// ARCHITECTURAL CONTRACT — SEMANTIC EXTRACTOR v5.1.0

import { classifyFarmerIntent, type IntentLandContext } from './intent-classifier.ts';

export const SEMANTIC_EXTRACTOR_VERSION = '5.1.0';

// OUTPUT INTERFACE - PURE INTENT + BACKWARD-COMPATIBLE DEFAULTS

// SemanticExtraction v5.1.0
export interface SemanticExtraction {
  // PRIMARY OUTPUT (v5.0.0+)
  intent_code: string;
  intent_confidence: number;
  
  // BACKWARD-COMPATIBLE DEFAULTS (all deprecated, but safe to access)
  
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

// SAFE DEFAULT BUILDER

// Build a SemanticExtraction with all required fields having safe defaults.
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

// MAIN EXTRACTION FUNCTION - STATELESS, PURE INTENT

// Extract intent_code from farmer message in ANY language.
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
    // P0-B.1 — thread the farmer language so the classifier can label the
    // crop-scoped candidate list with DB `intent_translations` display text.
    const lcWithLang = _detectedLanguage
      ? { ...(landContext || {}), language: _detectedLanguage }
      : landContext;
    const intentResult = await classifyFarmerIntent(safeMessage, lcWithLang);

    
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

// EXPORTS

export default {
  extractSemanticMeaning,
  SEMANTIC_EXTRACTOR_VERSION
};

/**
 * ARCHITECTURAL CONTRACT — SEMANTIC EXTRACTOR
 *
 * This module:
 * - Converts raw farmer language (ANY language) → intent_code
 *
 * This module MUST NOT:
 * - extract observations
 * - describe symptoms
 * - infer severity
 * - map to crops or stages
 * - perform diagnosis
 * - generate user-facing text
 *
 * All biological meaning is resolved downstream via:
 * intent-resolver.ts → symbolic decision brain → LLM narration
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEMANTIC EXTRACTOR v5.0.0 - PURE INTENT ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Convert farmer text (ANY language) → intent_code + confidence
 * 
 * This is the ONLY output. Nothing else.
 * 
 * @version 5.0.0
 */

import { classifyFarmerIntent } from './intent-classifier.ts';

export const SEMANTIC_EXTRACTOR_VERSION = '5.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE - INTENT ONLY
// ═══════════════════════════════════════════════════════════════════════════

export interface SemanticExtraction {
  intent_code: string;
  intent_confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION - STATELESS, PURE INTENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract intent_code from farmer message in ANY language.
 * 
 * @param farmerMessage - Raw farmer input in any language
 * @returns SemanticExtraction - { intent_code, intent_confidence }
 */
export async function extractSemanticMeaning(
  farmerMessage: string
): Promise<SemanticExtraction> {
  console.log(`\n🔮 [SemanticExtractor v${SEMANTIC_EXTRACTOR_VERSION}] Extracting intent...`);
  
  try {
    const intentResult = await classifyFarmerIntent(farmerMessage);
    
    // Validate intent_code is non-empty
    const intent_code = intentResult.intent_code && intentResult.intent_code.trim() !== ''
      ? intentResult.intent_code
      : 'UNKNOWN_OBSERVATION';
    
    console.log(`   🎯 Intent: ${intent_code} (${(intentResult.confidence * 100).toFixed(0)}%)`);
    
    return {
      intent_code,
      intent_confidence: intentResult.confidence
    };
    
  } catch (error) {
    console.error(`   ❌ [SemanticExtractor] Error: ${error}`);
    
    // Honest fallback - no fabrication
    return {
      intent_code: 'UNKNOWN_OBSERVATION',
      intent_confidence: 0.0
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  extractSemanticMeaning,
  SEMANTIC_EXTRACTOR_VERSION
};

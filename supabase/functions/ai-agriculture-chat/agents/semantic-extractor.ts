/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIVERSAL SEMANTIC EXTRACTOR (LLM-Based)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Extract semantic meaning from farmer messages in ANY language and output
 * structured English descriptions. This replaces 2,700+ lines of hardcoded
 * multilingual dictionaries with a single LLM-based extraction layer.
 * 
 * SUPPORTED LANGUAGES:
 * - Marathi, Hindi, English (primary)
 * - Telugu, Gujarati, Tamil, Kannada, Bengali, Punjabi (automatic)
 * - ANY other language the LLM understands
 * 
 * OUTPUT:
 * Plain English descriptions that are then mapped to canonical ObservationKeys
 * by the deterministic observation-code-mapper.ts
 * 
 * @version 1.0.0
 * @phase Universal NLU Refactoring
 */

import { AI_CONFIG, getAPIKey, getAPIEndpoint, hasGeminiKey } from '../../_shared/aiConfig.ts';

export const SEMANTIC_EXTRACTOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface SemanticExtraction {
  farmer_concern: string;                     // Plain English description of problem
  affected_plant_parts: string[];             // ["leaves", "stem", "roots", etc.]
  visual_changes: string[];                   // ["turning yellow", "drying out", etc.]
  pest_behavior: string[] | null;             // ["small insects visible", "flying", etc.]
  severity_indicator: 'mild' | 'moderate' | 'severe' | 'critical';
  distribution_pattern: string;               // "entire field", "patches", "scattered", etc.
  temporal_pattern: string;                   // "sudden", "gradual", "recently started", etc.
  extraction_timestamp: string;
  confidence: number;                         // 0.0-1.0
  extraction_method: 'LLM' | 'FALLBACK';
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
// MAIN EXTRACTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract semantic meaning from farmer's message in ANY language
 * Returns structured English descriptions for downstream mapping
 * 
 * @param farmerMessage - Raw farmer input in any language
 * @param detectedLanguage - Optional language code (for logging only)
 * @returns SemanticExtraction - Structured English observations
 */
export async function extractSemanticMeaning(
  farmerMessage: string,
  detectedLanguage: string = 'unknown'
): Promise<SemanticExtraction> {
  const startTime = Date.now();
  
  console.log(`\n🔮 [SemanticExtractor v${SEMANTIC_EXTRACTOR_VERSION}] Processing message...`);
  console.log(`   Input (${detectedLanguage}): \"${farmerMessage.substring(0, 80)}${farmerMessage.length > 80 ? '...' : ''}\"`);
  
  // Check cache first
  const cached = getFromCache(farmerMessage);
  if (cached) {
    return cached;
  }
  
  try {
    // Determine which provider to use
    // PRODUCTION FIX: Prefer OpenAI first (more reliable here), then Gemini fallback
    const hasOpenAIKey = !!(Deno.env.get('OPENAI_API_KEY')?.trim());
    const hasGemini = hasGeminiKey();

    const provider = hasOpenAIKey ? 'openai' : (hasGemini ? 'gemini' : 'openai');
    const model = provider === 'openai' ? 'gpt-4o' : AI_CONFIG.GEMINI_MODEL;
    const endpoint = getAPIEndpoint(provider as any);
    const apiKey = getAPIKey(provider as any);
    
    console.log(`   🤖 Using ${provider.toUpperCase()} (${model})`);
    
    // Build prompt
    const prompt = SEMANTIC_EXTRACTION_PROMPT.replace('{farmer_message}', farmerMessage);
    
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
          { 
            role: 'system', 
            content: 'You are an agricultural observation extractor. Extract observations from farmer messages and return JSON only.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Low temperature for consistency
        max_tokens: 1000,
        response_format: useGemini ? { type: 'json_object' } : undefined
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ LLM API Error: ${response.status} - ${errorText}`);
      throw new Error(`LLM API returned ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('Empty response from LLM');
    }
    
    // Parse JSON response
    let parsed: any;
    try {
      // Remove any markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error(`   ❌ JSON Parse Error: ${parseError}`);
      console.error(`   Raw content: ${content.substring(0, 200)}`);
      throw new Error('Failed to parse LLM response as JSON');
    }
    
    // Build result
    const result: SemanticExtraction = {
      farmer_concern: parsed.farmer_concern || 'Unable to extract concern',
      affected_plant_parts: Array.isArray(parsed.affected_plant_parts) ? parsed.affected_plant_parts : [],
      visual_changes: Array.isArray(parsed.visual_changes) ? parsed.visual_changes : [],
      pest_behavior: Array.isArray(parsed.pest_behavior) ? parsed.pest_behavior : null,
      severity_indicator: validateSeverity(parsed.severity_indicator),
      distribution_pattern: parsed.distribution_pattern || 'not specified',
      temporal_pattern: parsed.temporal_pattern || 'not specified',
      extraction_timestamp: new Date().toISOString(),
      confidence: 0.9, // High confidence for successful LLM extraction
      extraction_method: 'LLM',
      detected_language: detectedLanguage,
      raw_input: farmerMessage
    };
    
    // Cache result
    setCache(farmerMessage, result);
    
    const elapsed = Date.now() - startTime;
    console.log(`   ✅ Extraction complete in ${elapsed}ms`);
    console.log(`      Concern: \"${result.farmer_concern}\"`);
    console.log(`      Parts: [${result.affected_plant_parts.join(', ')}]`);
    console.log(`      Changes: [${result.visual_changes.join(', ')}]`);
    console.log(`      Pests: ${result.pest_behavior ? `[${result.pest_behavior.join(', ')}]` : 'none'}`);
    console.log(`      Severity: ${result.severity_indicator}, Distribution: ${result.distribution_pattern}`);
    
    return result;
    
  } catch (error) {
    console.error(`   ❌ [SemanticExtractor] Error: ${error}`);
    
    // Return fallback extraction
    return createFallbackExtraction(farmerMessage, detectedLanguage, error as Error);
  }
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
 * Create fallback extraction when LLM fails
 * Uses basic keyword detection for emergency response
 */
function createFallbackExtraction(
  farmerMessage: string,
  language: string,
  error: Error
): SemanticExtraction {
  console.log(`   ⚠️ [SemanticExtractor] Using FALLBACK extraction due to: ${error.message}`);
  
  const lowerMessage = farmerMessage.toLowerCase();
  
  // Basic keyword detection for fallback
  const visualChanges: string[] = [];
  const affectedParts: string[] = [];
  let pestBehavior: string[] | null = null;
  
  // Leaf symptoms
  if (lowerMessage.includes('पिवळ') || lowerMessage.includes('पीला') || lowerMessage.includes('yellow')) {
    visualChanges.push('turning yellow');
    affectedParts.push('leaves');
  }
  if (lowerMessage.includes('सुक') || lowerMessage.includes('सूख') || lowerMessage.includes('dry')) {
    visualChanges.push('drying out');
    if (!affectedParts.includes('leaves')) affectedParts.push('leaves');
  }
  if (lowerMessage.includes('मुरझ') || lowerMessage.includes('wilt')) {
    visualChanges.push('wilting');
    if (!affectedParts.includes('leaves')) affectedParts.push('leaves');
  }
  
  // Insect detection
  if (lowerMessage.includes('किडे') || lowerMessage.includes('कीड़') || lowerMessage.includes('insect') || lowerMessage.includes('bug')) {
    pestBehavior = ['insects visible'];
  }
  
  // Plant death
  if (lowerMessage.includes('मेला') || lowerMessage.includes('मर गय') || lowerMessage.includes('dead') || lowerMessage.includes('died')) {
    visualChanges.push('plant death');
    affectedParts.push('whole plant');
  }
  
  // Default if nothing detected
  if (visualChanges.length === 0) {
    visualChanges.push('general problem observed');
  }
  if (affectedParts.length === 0) {
    affectedParts.push('whole plant');
  }
  
  return {
    farmer_concern: 'Unable to fully extract - using basic detection',
    affected_plant_parts: affectedParts,
    visual_changes: visualChanges,
    pest_behavior: pestBehavior,
    severity_indicator: 'moderate',
    distribution_pattern: 'not specified',
    temporal_pattern: 'not specified',
    extraction_timestamp: new Date().toISOString(),
    confidence: 0.4, // Low confidence for fallback
    extraction_method: 'FALLBACK',
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

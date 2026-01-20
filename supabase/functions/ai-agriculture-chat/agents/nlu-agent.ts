/**
 * ARCHITECTURAL CONTRACT — PURE NLU PERCEPTION LAYER
 *
 * This module:
 * - Extracts RAW farmer observations only
 * - Detects language, urgency, and emotion
 *
 * This module MUST NOT:
 * - classify intent
 * - infer pests or diseases
 * - infer crops or growth stages
 * - generate clarification logic
 * - generate farmer-facing text
 *
 * All reasoning is handled downstream by:
 * semantic-extractor → intent-resolver → symbolic decision brain
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT 1: NATURAL LANGUAGE UNDERSTANDING (NLU) - PURE PERCEPTION LAYER v7.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module is a PURE PERCEPTION LAYER that:
 * - Extracts raw farmer observations (exact words, no interpretation)
 * - Detects language as metadata
 * - Assesses urgency and emotional state as signals
 * - Provides perception quality metrics
 * 
 * This module does NOT:
 * - Classify intent (handled by semantic-extractor.ts)
 * - Infer pests, diseases, or crops (handled by intent-resolver + database)
 * - Generate clarification questions (handled by symbolic brain)
 * - Produce farmer-facing text (handled by narration layer)
 * 
 * @version 7.0.0
 * @phase Pure Perception Architecture
 */

import {
  NLUAgentInput,
  NLUAgentOutput,
  LanguageDetectionResult,
  UrgencyAssessment,
} from './types.ts';

import {
  URGENCY_PATTERNS,
  EMOTION_PATTERNS,
} from './agricultural-vocabulary.ts';

const NLU_VERSION = '7.0.0'; // Pure perception layer - no intent/entity inference

// ═══════════════════════════════════════════════════════════════════════════
// PURE PERCEPTION OUTPUT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

interface PerceptionResult {
  /** Raw farmer observations - EXACT words only, no interpretation */
  raw_observations: string[];
  /** Emotional state as signal */
  emotional_state: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT';
  /** Urgency level as signal */
  urgency_level: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Safety flags only - URGENT, CROP_DYING */
  safety_flags: string[];
  /** Perception confidence 0.0 - 1.0 */
  confidence: number;
}

interface AIPerceptionResult {
  language: 'mr' | 'hi' | 'en';
  /** Raw observations - EXACT farmer words */
  observations: string[];
  /** Perception confidence 0.0 - 1.0 */
  confidence: number;
  /** Safety flags only */
  safety_flags: string[];
  /** Urgency assessment */
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Emotional state */
  emotional_state: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT';
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRY UTILITY WITH EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════════════════════

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 2,
  baseDelay: number = 500,
  timeoutMs: number = 5000
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? Math.min(parseInt(retryAfter) * 1000, 2000) : baseDelay * attempt;
        console.warn(`⚠️ [NLU] Rate limited (429), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      
      if (response.status >= 500 && attempt < maxRetries) {
        const delay = baseDelay * attempt;
        console.warn(`⚠️ [NLU] Server error (${response.status}), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      const errorName = (error as Error).name;
      
      if (errorName === 'AbortError' || errorName === 'TimeoutError') {
        console.warn(`⚠️ [NLU] Request timed out after ${timeoutMs}ms (attempt ${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          await sleep(baseDelay);
          continue;
        }
        break;
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * attempt;
        console.warn(`⚠️ [NLU] Network error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries}):`, error);
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// ═══════════════════════════════════════════════════════════════════════════
// AI-POWERED PERCEPTION (Gemini/OpenAI) - OBSERVATION EXTRACTION ONLY
// ═══════════════════════════════════════════════════════════════════════════

async function callAIForPerception(message: string): Promise<AIPerceptionResult | null> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

  if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    console.log('⚠️ [NLU] No AI API keys configured, using pattern-based perception');
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PURE PERCEPTION CONTRACT - Extract observations ONLY, NO reasoning
  // ═══════════════════════════════════════════════════════════════════════════

  const systemPrompt = `You are a Pure Perception Agent for agricultural text.

═══════════════════════════════════════════════════════════════════════════
CORE PRINCIPLE: YOU ONLY PERCEIVE. YOU DO NOT REASON OR DECIDE.
═══════════════════════════════════════════════════════════════════════════

Your ONLY job is to:
1. Extract EXACT observations from farmer's message (verbatim words)
2. Detect language
3. Assess urgency and emotional state as signals
4. Flag safety concerns

You do NOT:
- Classify intent
- Infer what pest/disease/problem this is
- Suggest actions or treatments
- Generate clarification questions
- Make any diagnostic decisions

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no markdown):
═══════════════════════════════════════════════════════════════════════════

{
  "language": "mr" | "hi" | "en",
  "observations": ["<EXACT farmer words - preserve original language>"],
  "confidence": 0.0-1.0,
  "safety_flags": ["URGENT" if dying/emergency, otherwise empty],
  "urgency": "HIGH" | "MEDIUM" | "LOW",
  "emotional_state": "PANIC" | "STRESSED" | "NEUTRAL" | "CONFIDENT"
}

═══════════════════════════════════════════════════════════════════════════
OBSERVATION EXTRACTION - PRESERVE FARMER'S EXACT WORDS:
═══════════════════════════════════════════════════════════════════════════

Examples:
- "मधली सुरळी वाळली" → observations: ["मधली सुरळी वाळली"]
- "dead heart in my sugarcane" → observations: ["dead heart in my sugarcane"]
- "पाने पिवळी झाली आणि काळे डाग" → observations: ["पाने पिवळी झाली", "काळे डाग"]
- "white flies everywhere" → observations: ["white flies everywhere"]

URGENCY INDICATORS: "dying", "emergency", "मरतंय", "वाचवा", "ताबडतोब"

═══════════════════════════════════════════════════════════════════════════
ABSOLUTELY FORBIDDEN - NEVER OUTPUT THESE:
═══════════════════════════════════════════════════════════════════════════

❌ intent, intent_code, intent_label
❌ pest_code, disease_code, crop_code
❌ recommendations, actions, treatments
❌ clarification_type, clarification_options
❌ diagnosis, causes, solutions`;

  let geminiError: string | null = null;
  let openaiError: string | null = null;

  try {
    // OpenAI first
    if (OPENAI_API_KEY) {
      console.log('🔄 [NLU] Using OpenAI for perception...');
      try {
        const response = await fetchWithRetry(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Extract observations from: "${message}"` }
              ],
              max_tokens: 300,
              temperature: 0.1
            }),
          },
          2,
          500
        );

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            let jsonStr = content.trim();
            if (jsonStr.startsWith('```')) {
              jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            }
            const result = JSON.parse(jsonStr) as AIPerceptionResult;
            console.log('✅ [NLU] OpenAI perception complete:', result.observations?.length, 'observations');
            return result;
          }
        } else {
          openaiError = `Status ${response.status}`;
          console.error('❌ [NLU] OpenAI API error:', response.status);
        }
      } catch (error) {
        openaiError = String(error);
        console.error('❌ [NLU] OpenAI API failed:', error);
      }
    }

    // Gemini fallback
    if (GEMINI_API_KEY) {
      console.log('🔄 [NLU] Using Gemini for perception...');
      try {
        const response = await fetchWithRetry(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `${systemPrompt}\n\nExtract observations from: "${message}"`
                }]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 300
              }
            }),
          },
          2,
          500
        );

        if (response.ok) {
          const data = await response.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (content) {
            let jsonStr = content.trim();
            if (jsonStr.startsWith('```')) {
              jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            }
            const result = JSON.parse(jsonStr) as AIPerceptionResult;
            console.log('✅ [NLU] Gemini perception complete:', result.observations?.length, 'observations');
            return result;
          }
        } else {
          geminiError = `Status ${response.status}`;
          console.warn('⚠️ [NLU] Gemini API error:', response.status);
        }
      } catch (error) {
        geminiError = String(error);
        console.warn('⚠️ [NLU] Gemini API failed:', error);
      }
    }

    if (geminiError || openaiError) {
      console.error('❌ [NLU] All AI APIs failed:', { openaiError, geminiError });
    }

    return null;
  } catch (error) {
    console.error('❌ [NLU] AI perception failed:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE DETECTION (Pure Perception)
// ═══════════════════════════════════════════════════════════════════════════

function detectLanguage(text: string): LanguageDetectionResult {
  const devanagariPattern = /[\u0900-\u097F]/g;
  const hindiWords = /है|हैं|का|की|के|में|से|को|पर|और|था|थी|थे|हूँ|हो/g;
  const marathiWords = /आहे|आहेत|चे|ची|च्या|मध्ये|वर|आणि|होते|होती|असे/g;
  const englishPattern = /[a-zA-Z]/g;
  
  const devanagariCount = (text.match(devanagariPattern) || []).length;
  const englishCount = (text.match(englishPattern) || []).length;
  const marathiWordCount = (text.match(marathiWords) || []).length;
  const hindiWordCount = (text.match(hindiWords) || []).length;
  
  let primaryLanguage: 'mr' | 'hi' | 'en' = 'en';
  let confidence = 0.5;
  let isCodeSwitched = false;
  
  if (devanagariCount > englishCount) {
    if (marathiWordCount > hindiWordCount) {
      primaryLanguage = 'mr';
      confidence = Math.min(0.95, 0.7 + (marathiWordCount * 0.05));
    } else {
      primaryLanguage = 'hi';
      confidence = Math.min(0.95, 0.7 + (hindiWordCount * 0.05));
    }
    
    if (englishCount > 2) {
      isCodeSwitched = true;
    }
  } else if (englishCount > 0) {
    primaryLanguage = 'en';
    confidence = Math.min(0.95, 0.7 + (englishCount * 0.02));
    
    if (devanagariCount > 0) {
      isCodeSwitched = true;
    }
  }
  
  const tokens = text.split(/\s+/).filter(t => t.length > 0);
  
  return {
    primary_language: primaryLanguage,
    confidence,
    is_code_switched: isCodeSwitched,
    secondary_language: isCodeSwitched ? (primaryLanguage === 'en' ? 'hi' : 'en') : undefined,
    dialect_detected: primaryLanguage === 'mr' ? 'STANDARD_MARATHI' : primaryLanguage === 'hi' ? 'STANDARD_HINDI' : 'STANDARD_ENGLISH',
    normalized_text: text.trim(),
    tokens
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// URGENCY & EMOTION DETECTION (Pure Perception Signals)
// ═══════════════════════════════════════════════════════════════════════════

function assessUrgency(text: string): UrgencyAssessment {
  const normalizedText = text.toLowerCase();
  let urgencyLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let emotionalState: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT' = 'NEUTRAL';
  const indicators: string[] = [];
  
  // Check for high urgency patterns
  for (const [_lang, patterns] of Object.entries(URGENCY_PATTERNS.high)) {
    for (const pattern of patterns) {
      if (normalizedText.includes(pattern.toLowerCase())) {
        urgencyLevel = 'HIGH';
        indicators.push(pattern);
      }
    }
  }
  
  // Check for medium urgency if not already high
  if (urgencyLevel !== 'HIGH') {
    for (const [_lang, patterns] of Object.entries(URGENCY_PATTERNS.medium)) {
      for (const pattern of patterns) {
        if (normalizedText.includes(pattern.toLowerCase())) {
          urgencyLevel = 'MEDIUM';
          indicators.push(pattern);
        }
      }
    }
  }
  
  // Check emotional state
  for (const [_lang, patterns] of Object.entries(EMOTION_PATTERNS.panic)) {
    for (const pattern of patterns) {
      if (normalizedText.includes(pattern.toLowerCase()) || text.includes(pattern)) {
        emotionalState = 'PANIC';
        break;
      }
    }
  }
  
  if (emotionalState === 'NEUTRAL') {
    for (const [_lang, patterns] of Object.entries(EMOTION_PATTERNS.stressed)) {
      for (const pattern of patterns) {
        if (normalizedText.includes(pattern.toLowerCase())) {
          emotionalState = 'STRESSED';
          break;
        }
      }
    }
  }
  
  return {
    level: urgencyLevel,
    emotional_state: emotionalState,
    urgency_indicators: indicators,
    requires_immediate_response: urgencyLevel === 'HIGH' || emotionalState === 'PANIC'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN NLU AGENT FUNCTION - PURE PERCEPTION
// ═══════════════════════════════════════════════════════════════════════════

export async function processNLUAgent(input: Partial<NLUAgentInput> & { raw_input: string }): Promise<NLUAgentOutput> {
  const startTime = Date.now();
  
  console.log(`🧪 [NLU v${NLU_VERSION}] Pure perception layer processing...`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: AI-Powered Perception (extract raw observations only)
  // ═══════════════════════════════════════════════════════════════════════════
  let aiResult: AIPerceptionResult | null = null;
  try {
    aiResult = await callAIForPerception(input.raw_input);
  } catch (err) {
    console.warn('⚠️ [NLU] AI perception failed, using pattern-based fallback:', err);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Language Detection (as metadata only)
  // ═══════════════════════════════════════════════════════════════════════════
  const languageResult = detectLanguage(input.raw_input);
  if (aiResult?.language) {
    languageResult.primary_language = aiResult.language;
    languageResult.confidence = Math.max(languageResult.confidence, 0.9);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Urgency & Emotion Assessment (as signals only)
  // ═══════════════════════════════════════════════════════════════════════════
  const urgencyResult = assessUrgency(input.raw_input);
  if (aiResult?.urgency) {
    urgencyResult.level = aiResult.urgency;
  }
  if (aiResult?.emotional_state) {
    urgencyResult.emotional_state = aiResult.emotional_state;
    urgencyResult.requires_immediate_response = aiResult.urgency === 'HIGH' || aiResult.emotional_state === 'PANIC';
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Extract raw observations (exact farmer words, no interpretation)
  // ═══════════════════════════════════════════════════════════════════════════
  const rawObservations = aiResult?.observations || [input.raw_input];
  const safetyFlags = aiResult?.safety_flags || (urgencyResult.level === 'HIGH' ? ['URGENT'] : []);
  
  // Calculate perception quality
  const perceptionConfidence = aiResult?.confidence || 
    (languageResult.confidence * 0.5 + (rawObservations.length > 1 ? 0.3 : 0.2));
  
  const processingTime = Date.now() - startTime;
  console.log(`⚡ [NLU] Perception complete in ${processingTime}ms, AI used: ${!!aiResult}, observations: ${rawObservations.length}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PURE PERCEPTION OUTPUT - NO intent, NO entities, NO clarification
  // ═══════════════════════════════════════════════════════════════════════════
  
  return {
    understanding_metadata: {
      nlu_version: NLU_VERSION,
      processing_timestamp: new Date().toISOString(),
      processing_time_ms: processingTime
    },
    language_analysis: {
      detected_language: languageResult.primary_language,
      language_confidence: languageResult.confidence,
      dialect: languageResult.dialect_detected || 'STANDARD',
      code_switching_present: languageResult.is_code_switched,
      normalization_applied: true
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // NEUTRAL intent_classification - NO reasoning here
    // Intent is resolved by semantic-extractor.ts upstream
    // ═══════════════════════════════════════════════════════════════════════════
    intent_classification: {
      primary_intent: 'UNKNOWN' as any, // Intent resolved upstream by semantic-extractor
      intent_confidence: 0,
      secondary_intents: [],
      urgency_level: urgencyResult.level,
      emotional_state: urgencyResult.emotional_state
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // NEUTRAL crop_identification - comes from land context ONLY
    // ═══════════════════════════════════════════════════════════════════════════
    crop_identification: {
      crop_code: input.land_context?.crop_code || 'UNKNOWN',
      local_name: undefined,
      identification_source: input.land_context?.crop_code ? 'FROM_LAND_CONTEXT' : 'UNKNOWN',
      confidence: input.land_context?.crop_code ? 0.95 : 0
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // RAW OBSERVATIONS ONLY - exact farmer words, no interpretation
    // ═══════════════════════════════════════════════════════════════════════════
    symptom_extraction: {
      visual_symptoms: [], // No symptom inference - handled by symbolic brain
      behavioral_symptoms: [],
      raw_observations: rawObservations,
      temporal_pattern: {
        onset: 'UNKNOWN',
        progression: 'UNKNOWN'
      }
    },
    context_integration: {
      is_follow_up: input.conversation_context?.session_state !== 'NEW',
      context_from_land: !!input.land_context
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // PERCEPTION QUALITY METRICS
    // ═══════════════════════════════════════════════════════════════════════════
    understanding_quality: {
      overall_confidence: perceptionConfidence,
      confidence_breakdown: {
        language_clarity: languageResult.confidence,
        symptom_specificity: 0, // No symptom inference here
        context_completeness: input.land_context ? 0.9 : 0.5,
        ambiguity_score: rawObservations.length === 1 && rawObservations[0].length < 20 ? 0.6 : 0.3
      },
      missing_information: [] // Clarification decided by symbolic brain
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // NEUTRAL photo_recommendation - decision made by symbolic brain
    // ═══════════════════════════════════════════════════════════════════════════
    photo_recommendation: {
      photo_needed: false, // Decided by symbolic brain, not NLU
      photo_priority: 'LOW',
      reason: undefined, // No text generation here
      specific_instructions: undefined // No language-specific text here
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // PERCEPTION SIGNALS - urgency and safety only
    // ═══════════════════════════════════════════════════════════════════════════
    safety_flags: {
      is_safe_to_respond: true,
      contains_harmful_advice_request: false,
      requires_expert_referral: urgencyResult.level === 'HIGH',
      detected_issues: safetyFlags
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // NEUTRAL next_agent - routing decided by orchestrator
    // ═══════════════════════════════════════════════════════════════════════════
    next_agent_recommendation: {
      recommended_agent: 'SEMANTIC_EXTRACTOR', // Always hand off to semantic extraction
      reason_code: 'PERCEPTION_COMPLETE',
      additional_context: {}
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { NLU_VERSION };

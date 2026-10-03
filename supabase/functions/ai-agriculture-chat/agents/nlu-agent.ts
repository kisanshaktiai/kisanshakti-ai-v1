/**
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * 2026-09-27 — AI model SSOT: callAIForPerception calls callAITask('brain.nlu'); the model
 *   comes from ai_task_route_step. Removed the dead native gemini-2.0-flash fallback (shut down,
 *   404) and fetchWithRetry/sleep (their only caller). Prompt, tokens, 4 s limit unchanged.
 * 2026-09-26 16:20 UTC — Type-only fixes: localized `as any` casts on three literal
 *   fields (identification_source, safety_flags.contains_harmful_advice_request,
 *   next_agent_recommendation.reason_code) whose runtime values are legitimate but
 *   wider/different than the shared types.ts interfaces (NextAgentRecommendation,
 *   SafetyFlags, crop_identification.identification_source) currently declare.
 *   types.ts is not owned by this task; values/logic unchanged.
 * 2026-07-29 10:30 UTC — LATENCY L7: perception model gpt-4o -> gpt-4o-mini;
 *   retry budget 2x5s -> 1x4s. Extraction contract unchanged.
 */
// ARCHITECTURAL CONTRACT — PURE NLU PERCEPTION LAYER

// AGENT 1: NATURAL LANGUAGE UNDERSTANDING (NLU) - PURE PERCEPTION LAYER v7.0.0

import { callAITask } from '../../_shared/aiConfig.ts';
import { aiRegistryClient } from '../utils/db-ssot/ai-registry-client.ts';
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

// PURE PERCEPTION OUTPUT CONTRACT

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
  language: string;
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

// AI-POWERED PERCEPTION (Gemini/OpenAI) - OBSERVATION EXTRACTION ONLY

async function callAIForPerception(message: string): Promise<AIPerceptionResult | null> {
  const db = aiRegistryClient();
  if (!db) {
    console.log('⚠️ [NLU] No Supabase credentials for the AI model registry, using pattern-based perception');
    return null;
  }

  // PURE PERCEPTION CONTRACT - Extract observations ONLY, NO reasoning

const systemPrompt = `You are a Pure Perception Agent for agricultural text.

═══════════════════════════════════════════════════════════════════════════
CORE PRINCIPLE: YOU ONLY PERCEIVE. YOU DO NOT REASON OR DECIDE.
═══════════════════════════════════════════════════════════════════════════

Your ONLY job is to:
1. Extract EXACT observations from farmer's message (verbatim words)
2. Detect language (the ACTUAL language the farmer intends, not the script)
3. Assess urgency and emotional state as signals
4. Flag safety concerns

CRITICAL - ROMANIZED REGIONAL LANGUAGE DETECTION:
Farmers often type in ROMANIZED regional languages using Latin/English script.
This means they write Marathi, Hindi, Tamil, etc. using English letters.
You MUST detect the ACTUAL LANGUAGE, not just the script.

Examples of ROMANIZED input:
- "mazya usala kide lagale" → This is MARATHI written in Roman script → language: "mr"
- "mera ganna mar raha hai" → This is HINDI written in Roman script → language: "hi"  
- "us mela aahe" → This is MARATHI (sugarcane died) → language: "mr"
- "pani kab dena hai" → This is HINDI (when to water) → language: "hi"
- "paan pivli zaleet" → This is MARATHI (leaves turned yellow) → language: "mr"
- "fasal kharab ho rahi" → This is HINDI (crop is getting damaged) → language: "hi"
- "kapus la rog lagla" → This is MARATHI (cotton got disease) → language: "mr"

Common romanized agricultural terms:
- Marathi: us/oos (sugarcane), pik (crop), kidi/kida (pest), rog (disease), pani (water), paan (leaf), khod (stem), mela/sukla (died/dried), pivla/pivli (yellow), khat (fertilizer), fawaarni (spray), kapni (harvest), nindani (weeding)
- Hindi: ganna (sugarcane), fasal (crop), keeda (pest), rog (disease), pani (water), patta (leaf), tana (stem), khat/khaad (fertilizer), katai (harvest)

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
  "language": "<ISO 639-1 code of the ACTUAL language, e.g. mr, hi, en, ta, te, kn, etc.>",
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
- "मधली सुरळी वाळली" → language: "mr", observations: ["मधली सुरळी वाळली"]
- "dead heart in my sugarcane" → language: "en", observations: ["dead heart in my sugarcane"]
- "पाने पिवळी झाली आणि काळे डाग" → language: "mr", observations: ["पाने पिवळी झाली", "काळे डाग"]
- "mazya usala kide lagale" → language: "mr", observations: ["mazya usala kide lagale"]
- "mera ganna mar raha hai" → language: "hi", observations: ["mera ganna mar raha hai"]
- "us mela aahe" → language: "mr", observations: ["us mela aahe"]

URGENCY INDICATORS: "dying", "emergency", "मरतंय", "वाचवा", "ताबडतोब", "marat", "bachava", "turant"

═══════════════════════════════════════════════════════════════════════════
ABSOLUTELY FORBIDDEN - NEVER OUTPUT THESE:
═══════════════════════════════════════════════════════════════════════════

❌ intent, intent_code, intent_label
❌ pest_code, disease_code, crop_code
❌ recommendations, actions, treatments
❌ clarification_type, clarification_options
❌ diagnosis, causes, solutions`;

  // 2026-09-27 — AI model SSOT: model chain from registry task brain.nlu (was OpenAI
  // AI_MODELS.openai.default, then a hardcoded native gemini-2.0-flash call that Google shut down
  // 2026-06-01 and that answered 404). Same 300-token budget, temperature 0.1 where the model's
  // contract allows one, same 4 s limit (LATENCY L7), same fence-strip + JSON.parse.
  try {
    const r = await callAITask({
      db,
      task: 'brain.nlu',
      functionName: 'ai-agriculture-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract observations from: "${message}"` }
      ],
      maxOutputTokens: 300,
      temperature: 0.1,
      attemptTimeoutMs: 4000,
      timeoutMs: 4000,
      metadata: { caller: 'callAIForPerception' },
    });
    if (!r.ok) {
      console.error('❌ [NLU] brain.nlu failed:', r.errorClass, r.detail.slice(0, 200));
      return null;
    }
    let jsonStr = r.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    const result = JSON.parse(jsonStr) as AIPerceptionResult;
    console.log(`✅ [NLU] ${r.modelKey} perception complete:`, result.observations?.length, 'observations');
    return result;
  } catch (error) {
    console.error('❌ [NLU] AI perception failed:', error);
    return null;
  }
}

// LANGUAGE DETECTION (Pure Perception)

function detectLanguage(text: string): LanguageDetectionResult {
  const SCRIPT_RANGES: Record<string, RegExp> = {
    ta: /[\u0B80-\u0BFF]/g,
    te: /[\u0C00-\u0C7F]/g,
    kn: /[\u0C80-\u0CFF]/g,
    ml: /[\u0D00-\u0D7F]/g,
    bn: /[\u0980-\u09FF]/g,
    gu: /[\u0A80-\u0AFF]/g,
    pa: /[\u0A00-\u0A7F]/g,
    or: /[\u0B00-\u0B7F]/g,
    en: /[a-zA-Z]/g,
  };
  
  // Devanagari disambiguation (mr vs hi)
  const devanagariPattern = /[\u0900-\u097F]/g;
  const hindiWords = /है|हैं|का|की|के|में|से|को|पर|और|था|थी|थे|हूँ|हो/g;
  const marathiWords = /आहे|आहेत|चे|ची|च्या|मध्ये|वर|आणि|होते|होती|असे/g;

  // Count all scripts
  const scriptCounts: Record<string, number> = {};
  const devanagariCount = (text.match(devanagariPattern) || []).length;
  
  for (const [lang, regex] of Object.entries(SCRIPT_RANGES)) {
    scriptCounts[lang] = (text.match(regex) || []).length;
  }
  
  // Find dominant non-Latin script
  const nonLatinScripts = Object.entries(scriptCounts)
    .filter(([k]) => k !== 'en')
    .sort((a, b) => b[1] - a[1]);
  
  let primaryLanguage: string = 'en';
  let confidence = 0.5;
  let isCodeSwitched = false;
  
  const englishCount = scriptCounts['en'] || 0;
  
  // Check if a non-Latin script dominates
  if (devanagariCount > englishCount || (nonLatinScripts[0] && nonLatinScripts[0][1] > englishCount)) {
    if (devanagariCount > 0 && devanagariCount >= (nonLatinScripts[0]?.[1] || 0)) {
      // Devanagari dominant - disambiguate mr vs hi
      const marathiWordCount = (text.match(marathiWords) || []).length;
      const hindiWordCount = (text.match(hindiWords) || []).length;
      primaryLanguage = marathiWordCount > hindiWordCount ? 'mr' : 'hi';
      confidence = Math.min(0.95, 0.7 + (Math.max(marathiWordCount, hindiWordCount) * 0.05));
    } else if (nonLatinScripts[0] && nonLatinScripts[0][1] > 0) {
      // Other script dominant
      primaryLanguage = nonLatinScripts[0][0];
      confidence = Math.min(0.95, 0.7 + (nonLatinScripts[0][1] * 0.03));
    }
    
    if (englishCount > 2) isCodeSwitched = true;
  } else if (englishCount > 0) {
    primaryLanguage = 'en';
    confidence = Math.min(0.95, 0.7 + (englishCount * 0.02));
    if (devanagariCount > 0 || (nonLatinScripts[0] && nonLatinScripts[0][1] > 0)) {
      isCodeSwitched = true;
    }
  }
  
  // ISO validation
  const VALID_ISO639 = new Set(['en','hi','mr','ta','te','kn','ml','bn','gu','pa','or','as','ur','sd','ne','si']);
  if (!VALID_ISO639.has(primaryLanguage)) primaryLanguage = 'en';
  
  const tokens = text.split(/\s+/).filter(t => t.length > 0);
  
  return {
    primary_language: primaryLanguage as any,
    confidence,
    is_code_switched: isCodeSwitched,
    secondary_language: isCodeSwitched ? (primaryLanguage === 'en' ? 'hi' : 'en') as any : undefined,
    dialect_detected: `STANDARD_${primaryLanguage.toUpperCase()}`,
    normalized_text: text.trim(),
    tokens
  };
}

// URGENCY & EMOTION DETECTION (Pure Perception Signals)

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

// MAIN NLU AGENT FUNCTION - PURE PERCEPTION

export async function processNLUAgent(input: Partial<NLUAgentInput> & { raw_input: string }): Promise<NLUAgentOutput> {
  const startTime = Date.now();
  
  console.log(`🧪 [NLU v${NLU_VERSION}] Pure perception layer processing...`);
  
  // STEP 1: AI-Powered Perception (extract raw observations only)
  let aiResult: AIPerceptionResult | null = null;
  try {
    aiResult = await callAIForPerception(input.raw_input);
  } catch (err) {
    console.warn('⚠️ [NLU] AI perception failed, using pattern-based fallback:', err);
  }
  
  // STEP 2: Language Detection (as metadata only)
  const languageResult = detectLanguage(input.raw_input);
  if (aiResult?.language) {
    languageResult.primary_language = aiResult.language;
    languageResult.confidence = Math.max(languageResult.confidence, 0.9);
  }
  
  // STEP 3: Urgency & Emotion Assessment (as signals only)
  const urgencyResult = assessUrgency(input.raw_input);
  if (aiResult?.urgency) {
    urgencyResult.level = aiResult.urgency;
  }
  if (aiResult?.emotional_state) {
    urgencyResult.emotional_state = aiResult.emotional_state;
    urgencyResult.requires_immediate_response = aiResult.urgency === 'HIGH' || aiResult.emotional_state === 'PANIC';
  }
  
  // STEP 4: Extract raw observations (exact farmer words, no interpretation)
  const rawObservations = aiResult?.observations || [input.raw_input];
  const safetyFlags = aiResult?.safety_flags || (urgencyResult.level === 'HIGH' ? ['URGENT'] : []);
  
  // Calculate perception quality
  const perceptionConfidence = aiResult?.confidence || 
    (languageResult.confidence * 0.5 + (rawObservations.length > 1 ? 0.3 : 0.2));
  
  const processingTime = Date.now() - startTime;
  console.log(`⚡ [NLU] Perception complete in ${processingTime}ms, AI used: ${!!aiResult}, observations: ${rawObservations.length}`);
  
  // PURE PERCEPTION OUTPUT - NO intent, NO entities, NO clarification

  // Type-only note: the returned literal below carries a few fields
  // (identification_source value, safety_flags.contains_harmful_advice_request,
  // next_agent_recommendation.reason_code) that are valid at runtime but do not
  // structurally match the shared types.ts interfaces owned outside this task.
  // The literal is asserted via `as unknown as NLUAgentOutput` at the end to avoid
  // both excess/missing-property structural checks without altering any values.
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
    // NEUTRAL intent_classification - NO reasoning here
    intent_classification: {
      primary_intent: 'UNKNOWN' as any, // Intent resolved upstream by semantic-extractor
      intent_confidence: 0,
      secondary_intents: [],
      urgency_level: urgencyResult.level,
      emotional_state: urgencyResult.emotional_state
    },
    // NEUTRAL crop_identification - comes from land context ONLY
    crop_identification: {
      crop_code: input.land_context?.crop_code || 'UNKNOWN',
      local_name: undefined,
      identification_source: input.land_context?.crop_code ? 'FROM_LAND_CONTEXT' : 'UNKNOWN',
      confidence: input.land_context?.crop_code ? 0.95 : 0
    },
    // RAW OBSERVATIONS ONLY - exact farmer words, no interpretation
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
    // PERCEPTION QUALITY METRICS
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
    // NEUTRAL photo_recommendation - decision made by symbolic brain
    photo_recommendation: {
      photo_needed: false, // Decided by symbolic brain, not NLU
      photo_priority: 'LOW',
      reason: undefined, // No text generation here
      specific_instructions: undefined // No language-specific text here
    },
    // PERCEPTION SIGNALS - urgency and safety only
    safety_flags: {
      is_safe_to_respond: true,
      contains_harmful_advice_request: false,
      requires_expert_referral: urgencyResult.level === 'HIGH',
      detected_issues: safetyFlags
    },
    // NEUTRAL next_agent - routing decided by orchestrator
    next_agent_recommendation: {
      recommended_agent: 'SEMANTIC_EXTRACTOR', // Always hand off to semantic extraction
      reason_code: 'PERCEPTION_COMPLETE',
      additional_context: {}
    }
  } as unknown as NLUAgentOutput;
}

// EXPORTS

export { NLU_VERSION };

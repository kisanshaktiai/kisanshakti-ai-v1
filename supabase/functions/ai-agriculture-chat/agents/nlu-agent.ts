/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT 1: NATURAL LANGUAGE UNDERSTANDING (NLU) - PRODUCTION v4.0 (AI-Powered)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * AI-ENHANCED NLU using Gemini API for semantic understanding + pattern matching:
 * - Uses Gemini Flash for deep semantic analysis
 * - Extracts structured intent, entities, and meaning
 * - Falls back to pattern matching if AI unavailable
 * - Processes Marathi, Hindi, and English with code-switching
 */

import {
  NLUAgentInput,
  NLUAgentOutput,
  LanguageDetectionResult,
  IntentDetectionResult,
  EntityExtractionResult,
  UrgencyAssessment,
  PrimaryIntent,
  VisualSymptom,
  ClarificationQuestion,
} from './types.ts';

import {
  PEST_VOCABULARY,
  DISEASE_VOCABULARY,
  SYMPTOM_VOCABULARY,
  CROP_VOCABULARY,
  URGENCY_PATTERNS,
  EMOTION_PATTERNS,
  findCanonicalTerm,
  getAllCropTerms,
  getAllPestTerms,
  getAllDiseaseTerms,
  getAllSymptomTerms,
} from './agricultural-vocabulary.ts';

// CRITICAL FIX: Import CENTRALIZED entity normalizer for consistent codes across pipeline
import { 
  normalizePestEntity, 
  normalizeDiseaseEntity, 
  normalizeCropEntity,
  validateEntityConsistency 
} from './entity-normalizer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED: Old dialect-normalizer removed - now using LLM-based semantic extraction
// The new system (semantic-extractor.ts + observation-code-mapper.ts) is called 
// from orchestrator.ts BEFORE NLU agent runs
// ═══════════════════════════════════════════════════════════════════════════

const NLU_VERSION = '6.0.0'; // REFACTORED: LLM-based semantic extraction (no hardcoded dictionaries)

// ═══════════════════════════════════════════════════════════════════════════
// AI-POWERED SEMANTIC UNDERSTANDING (Gemini/OpenAI)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC BRAIN CONTRACT: NLU OUTPUT MUST CONFORM TO THIS SCHEMA
// AI extracts OBSERVATIONS ONLY - NO decisions, NO codes, NO recommendations
// ═══════════════════════════════════════════════════════════════════════════

interface AIUnderstandingResult {
  language: 'mr' | 'hi' | 'en';
  
  /**
   * PLAIN LANGUAGE intent description - NOT internal codes
   * Examples: "pest problem on crop", "disease issue", "general question"
   */
  intent_label: string;
  
  /**
   * EXACT farmer observations - verbatim words
   * Examples: ["मधली सुरळी वाळली", "dead heart", "पाने पिवळी"]
   */
  observations: string[];
  
  /**
   * Confidence 0.0 - 1.0
   */
  confidence: number;
  
  /**
   * What's missing to understand the problem
   */
  missing_inputs: string[];
  
  /**
   * Safety flags only - URGENT, CROP_DYING
   */
  safety_flags: string[];
  
  /**
   * Urgency assessment
   */
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  
  /**
   * Emotional state for tone
   */
  emotional_state: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT';
  
  /**
   * Brief context summary in farmer's language
   */
  extracted_context: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY FIELDS (for backward compatibility during transition)
  // These will be DEPRECATED - Rule Engine decides, not NLU
  // ═══════════════════════════════════════════════════════════════════════════
  intent?: PrimaryIntent;  // DEPRECATED: Use intent_label
  intent_confidence?: number;  // DEPRECATED: Use confidence
  symptoms?: string[];  // DEPRECATED: Use observations
  crop?: { name: string; code: string };  // DEPRECATED: Context from DB
  pest?: { name: string; code: string };  // DEPRECATED: Rule Engine decides
  disease?: { name: string; code: string };  // DEPRECATED: Rule Engine decides
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
  timeoutMs: number = 5000  // CRITICAL FIX: Hard timeout to prevent 20s waits
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? Math.min(parseInt(retryAfter) * 1000, 2000) : baseDelay * attempt;
        console.warn(`⚠️ [NLU] Rate limited (429), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      
      // Handle server errors with retry (but quick)
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
      
      // Quick fail on timeout or abort
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
// AI-POWERED SEMANTIC UNDERSTANDING (Gemini/OpenAI) WITH RETRY
// ═══════════════════════════════════════════════════════════════════════════

async function callAIForUnderstanding(message: string): Promise<AIUnderstandingResult | null> {
  // Prefer OpenAI first (per production reliability), then Gemini as fallback
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

  if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    console.log('⚠️ [NLU] No AI API keys configured, falling back to pattern matching');
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYMBOLIC BRAIN CONTRACT - NLU EXTRACTS OBSERVATIONS ONLY
  // CRITICAL: AI does NOT decide actions, clarifications, or recommendations
  // Those decisions belong EXCLUSIVELY to the Rule Engine
  // ═══════════════════════════════════════════════════════════════════════════

  const systemPrompt = `You are a Symbolic Agricultural NLU Agent.

═══════════════════════════════════════════════════════════════════════════
CORE PRINCIPLE: YOU DO NOT DECIDE. YOU ONLY OBSERVE.
═══════════════════════════════════════════════════════════════════════════

Your ONLY job is to:
1. Extract EXACT observations from farmer's message (verbatim words)
2. Assess confidence in understanding
3. Flag urgency and safety concerns
4. Detect language

The RULE ENGINE decides:
- What pest/disease/problem this is
- What actions to take
- Whether clarification is needed
- What clarification options to show

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no markdown):
═══════════════════════════════════════════════════════════════════════════

{
  "language": "mr" | "hi" | "en",
  "intent_label": "<PLAIN LANGUAGE: 'pest problem', 'disease issue', 'general question'>",
  "observations": ["<EXACT farmer words - colors, symptoms, what they see>"],
  "confidence": 0.0-1.0,
  "missing_inputs": ["<what info would help: 'symptom_location', 'affected_area'>"],
  "safety_flags": ["URGENT" if dying/emergency, otherwise empty],
  "urgency": "HIGH" | "MEDIUM" | "LOW",
  "emotional_state": "PANIC" | "STRESSED" | "NEUTRAL" | "CONFIDENT",
  "extracted_context": "brief summary in farmer's language"
}

═══════════════════════════════════════════════════════════════════════════
ABSOLUTELY FORBIDDEN - NEVER OUTPUT THESE:
═══════════════════════════════════════════════════════════════════════════

❌ pest_code, disease_code, crop_code, rule_id, product_id
❌ response_strategy (Rule Engine decides)
❌ clarification_type (Rule Engine decides)
❌ clarification_options (Rule Engine provides from database)
❌ recommendations, actions, treatments
❌ product names, dosages
❌ percentage claims (80% effective, etc.)

═══════════════════════════════════════════════════════════════════════════
OBSERVATION EXTRACTION - PRESERVE FARMER'S EXACT WORDS:
═══════════════════════════════════════════════════════════════════════════

Examples of CORRECT observation extraction:
- "मधली सुरळी वाळली" → observations: ["मधली सुरळी वाळली"]
- "dead heart in my sugarcane" → observations: ["dead heart in sugarcane"]
- "पाने पिवळी झाली आणि काळे डाग" → observations: ["पाने पिवळी झाली", "काळे डाग"]
- "white flies everywhere" → observations: ["white flies visible"]

For intent_label, use PLAIN LANGUAGE only:
✅ "pest problem on crop"
✅ "disease symptoms on leaves"
✅ "crop dying - urgent"
✅ "general farming question"
✅ "irrigation query"

❌ NOT: "PEST_PROBLEM", "SHOOT_BORER_ATTACK", "P-001"

URGENCY INDICATORS: "dying", "emergency", "मरतंय", "वाचवा", "ताबडतोब"`;

  const normalizeAIResult = (raw: AIUnderstandingResult): AIUnderstandingResult => {
    // Backward compatibility: convert new contract fields into legacy fields used downstream.
    // This prevents logs like "undefined undefined" and ensures AI result affects intent/confidence.
    const normalized: AIUnderstandingResult = { ...raw };

    if (normalized.intent_confidence === undefined && typeof normalized.confidence === 'number') {
      normalized.intent_confidence = normalized.confidence;
    }

    if (!normalized.intent && typeof normalized.intent_label === 'string') {
      const l = normalized.intent_label.toLowerCase();
      if (l.includes('pest') || l.includes('insect')) normalized.intent = 'PEST_PROBLEM' as PrimaryIntent;
      else if (l.includes('disease') || l.includes('fung')) normalized.intent = 'DISEASE_PROBLEM' as PrimaryIntent;
      else if (l.includes('nutrient') || l.includes('fertil')) normalized.intent = 'NUTRIENT_ISSUE' as PrimaryIntent;
      else if (l.includes('irrig') || l.includes('water')) normalized.intent = 'WATER_ISSUE' as PrimaryIntent;
      else if (l.includes('weather') || l.includes('rain')) normalized.intent = 'WEATHER_QUERY' as PrimaryIntent;
      else if (l.includes('market') || l.includes('price')) normalized.intent = 'MARKET_QUERY' as PrimaryIntent;
      else if (l.includes('urgent') || l.includes('dying') || l.includes('emergency')) normalized.intent = 'EMERGENCY' as PrimaryIntent;
      else if (l.includes('greet') || l.includes('hello') || l.includes('namaste')) normalized.intent = 'GREETING' as PrimaryIntent;
      else normalized.intent = 'GENERAL_QUERY' as PrimaryIntent;
    }

    return normalized;
  };

  let geminiError: string | null = null;
  let openaiError: string | null = null;

  try {
    // 1) OpenAI FIRST (requested): more reliable for this project right now.
    if (OPENAI_API_KEY) {
      console.log('🔄 [NLU] Using OpenAI API for understanding...');
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
                { role: 'user', content: `Analyze this farmer message: "${message}"` }
              ],
              max_tokens: 500,
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
            const raw = JSON.parse(jsonStr) as AIUnderstandingResult;
            const result = normalizeAIResult(raw);
            console.log('✅ [NLU] OpenAI understanding complete:', result.intent_label, result.confidence);
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

    // 2) Gemini fallback
    if (GEMINI_API_KEY) {
      console.log('🔄 [NLU] Falling back to Gemini API for understanding...');
      try {
        const response = await fetchWithRetry(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `${systemPrompt}\n\nAnalyze this farmer message: "${message}"`
                }]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 500
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
            const raw = JSON.parse(jsonStr) as AIUnderstandingResult;
            const result = normalizeAIResult(raw);
            console.log('✅ [NLU] Gemini understanding complete:', result.intent_label, result.confidence);
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
    console.error('❌ [NLU] AI call failed:', error);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: LANGUAGE DETECTION & NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

function detectLanguage(text: string): LanguageDetectionResult {
  const devanagariPattern = /[\u0900-\u097F]/g;
  const marathiSpecific = /[\u0905-\u0914]|ळ|ऱ|ॲ/g;
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
// STEP 2: INTENT CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

const INTENT_PATTERNS: Record<PrimaryIntent, RegExp[]> = {
  PEST_PROBLEM: [
    /किडी|कीड़|माशी|मावा|इल्ली|अळी|pest|insect|bug|कीट/i,
    /किडी\s*(लाग|पड|आल|दिस)/i,
    /कीड़े?\s*(लग|दिख|आ)/i,
    // CRITICAL: Sugarcane shoot borer / dead heart patterns (highest priority)
    /मधली\s*सुरळी/i,
    /सुरळी.*(वाळली|मरली|सुकली|वाळल|पूर्ण)/i,
    /dead\s*heart|शूट\s*बोरर|गाभा\s*सुक/i,
    /सुखी\s*सुरळी/i,
    /ऊसाची.*सुरळी/i,
    /डेड\s*हार्ट|deadheart/i,
    /गाभा.*सुकला|सुक.*गाभा/i
  ],
  DISEASE_PROBLEM: [
    /रोग|बीमारी|disease|infection|बुरशी|फफूंद/i,
    /विल्ट|करपा|ब्लाइट|rust|तांबेरा/i,
    /पांढरा\s*पावडर|सफेद\s*पाउडर|mildew/i
  ],
  NUTRIENT_ISSUE: [
    /पाने?\s*(पिवळ|पीला|yellow)/i,
    /खत|खाद|fertilizer|urea|dap|npk/i,
    /वाढ\s*(कमी|नाही)|बढ़त\s*(कम|नहीं)|stunted/i
  ],
  WATER_ISSUE: [
    /पाणी|पानी|water|irrigat/i,
    /सुक|सूख|dry|wilt/i,
    /ओलावा|नमी|moisture/i
  ],
  WEATHER_QUERY: [
    /हवामान|मौसम|weather/i,
    /पाऊस|बारिश|rain/i,
    /फवारणी\s*करू\s*का|spray.*when/i
  ],
  MARKET_QUERY: [
    /भाव|किंमत|price|rate/i,
    /विक्री|बेचना|sell/i,
    /मंडी|market|बाजार/i
  ],
  GENERAL_QUERY: [
    /कैसे|कसे|how/i,
    /क्या|काय|what/i,
    /कब|कधी|when/i
  ],
  EMERGENCY: [
    /ताबडतोब|तुरंत|immediately|urgent|emergency/i,
    /मर.*रह|मरतंय|dying/i,
    /संपलं|खत्म|destroyed/i,
    /वाचवा|बचाओ|save/i
  ],
  GREETING: [
    /^(नमस्ते|नमस्कार|hello|hi|hey)$/i
  ],
  CONFIRMATION: [
    /^(हाँ|हो|yes|ok|okay|ठीक|बरोबर)$/i
  ],
  CLARIFICATION_RESPONSE: []
};

function classifyIntent(text: string, context?: NLUAgentInput['conversation_context']): IntentDetectionResult {
  const results: { intent: PrimaryIntent; confidence: number; patterns: string[] }[] = [];
  
  // CRITICAL FIX: Pre-check for high-confidence pest/disease patterns that should override others
  const isShootBorerPattern = /मधली\s*सुरळी|सुरळी.*(वाळली|मरली|सुकली|पूर्ण)|dead\s*heart|डेड\s*हार्ट|गाभा\s*सुक/i.test(text);
  const isClearPestPattern = isShootBorerPattern || /बोअरर|किड.*पड|अळी.*लाग|pest\s+attack/i.test(text);
  
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    let matchCount = 0;
    const matchedPatterns: string[] = [];
    
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        matchCount++;
        matchedPatterns.push(pattern.source);
      }
    }
    
    if (matchCount > 0) {
      // CRITICAL FIX: Boost PEST_PROBLEM confidence when clear pest patterns detected
      let confidence = Math.min(0.95, 0.5 + (matchCount * 0.15));
      
      if (intent === 'PEST_PROBLEM' && isClearPestPattern) {
        confidence = Math.min(0.95, confidence + 0.2);
        console.log(`🎯 [Intent] Boosted PEST_PROBLEM confidence for pattern: ${matchedPatterns[0]}`);
      }
      
      results.push({
        intent: intent as PrimaryIntent,
        confidence,
        patterns: matchedPatterns
      });
    }
  }
  
  results.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`📊 [Intent] Top results: ${results.slice(0, 2).map(r => `${r.intent}(${(r.confidence * 100).toFixed(0)}%)`).join(', ')}`);
  
  if (results.length === 0) {
    return {
      primary: 'GENERAL_QUERY',
      primary_confidence: 0.4,
      secondary: [],
      detected_patterns: []
    };
  }
  
  // Check if this is a follow-up response (with null safety)
  const sessionState = context?.session_state;
  if (sessionState === 'CLARIFICATION' && results[0].confidence < 0.7) {
    return {
      primary: 'CLARIFICATION_RESPONSE',
      primary_confidence: 0.8,
      secondary: results.slice(0, 2).map(r => ({ intent: r.intent, confidence: r.confidence })),
      detected_patterns: results[0]?.patterns || []
    };
  }
  
  return {
    primary: results[0].intent,
    primary_confidence: results[0].confidence,
    secondary: results.slice(1, 3).map(r => ({ intent: r.intent, confidence: r.confidence })),
    detected_patterns: results[0].patterns
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: ENTITY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

function extractEntities(text: string): EntityExtractionResult {
  const cropTerms = getAllCropTerms();
  const pestTerms = getAllPestTerms();
  const diseaseTerms = getAllDiseaseTerms();
  const symptomTerms = getAllSymptomTerms();
  
  const crops: { canonical: string; localTerm: string; confidence: number }[] = [];
  const pests: { canonical: string; localTerm: string; confidence: number }[] = [];
  const diseases: { canonical: string; localTerm: string; confidence: number }[] = [];
  const symptoms: VisualSymptom[] = [];
  
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  
  // CRITICAL FIX: Check multi-word patterns FIRST before single word matching
  // Sugarcane shoot borer patterns (multi-word, must be checked against full text)
  if (/मधली\s*सुरळी|सुखी\s*सुरळी|dead\s*heart|deadheart|डेड\s*हार्ट/.test(text) ||
      /सुरळी.*(वाळली|मरली|सुकली|पूर्ण)/.test(text) ||
      /ऊसाची.*सुरळी/.test(text) ||
      /गाभा\s*सुकला/.test(text)) {
    // CRITICAL: Normalize to canonical code using centralized normalizer
    const normalizedCode = normalizePestEntity('SHOOT_BORER');
    pests.push({ canonical: normalizedCode, localTerm: 'शूट बोरर / Dead Heart', confidence: 0.92 });
    console.log(`🎯 [EntityExtraction] Multi-word match: ${normalizedCode}`);
  }
  
  // Check multi-word pest terms from vocabulary against full text
  for (const [term, code] of pestTerms.entries()) {
    if (term.includes(' ') && lowerText.includes(term)) {
      if (!pests.find(p => p.canonical === code)) {
        pests.push({ canonical: code, localTerm: term, confidence: 0.88 });
      }
    }
  }
  
  // Then check single words and NORMALIZE all entity codes
  for (const word of words) {
    if (cropTerms.has(word) && !crops.find(c => c.canonical === normalizeCropEntity(cropTerms.get(word)))) {
      const normalizedCrop = normalizeCropEntity(cropTerms.get(word)!);
      crops.push({ canonical: normalizedCrop, localTerm: word, confidence: 0.9 });
    }
    if (pestTerms.has(word) && !pests.find(p => p.canonical === normalizePestEntity(pestTerms.get(word)))) {
      const normalizedPest = normalizePestEntity(pestTerms.get(word)!);
      pests.push({ canonical: normalizedPest, localTerm: word, confidence: 0.85 });
    }
    if (diseaseTerms.has(word) && !diseases.find(d => d.canonical === normalizeDiseaseEntity(diseaseTerms.get(word)))) {
      const normalizedDisease = normalizeDiseaseEntity(diseaseTerms.get(word)!);
      diseases.push({ canonical: normalizedDisease, localTerm: word, confidence: 0.85 });
    }
  }
  
  // Extract symptoms using vocabulary
  const symptomResult = findCanonicalTerm(text, SYMPTOM_VOCABULARY);
  if (symptomResult) {
    symptoms.push({
      symptom_code: symptomResult.canonical,
      severity: 'MODERATE',
      affected_part: 'LEAVES',
      location: 'ALL',
      confidence: symptomResult.confidence
    });
  }
  
  return {
    crops,
    pests,
    diseases,
    symptoms,
    chemicals: [],
    quantities: [],
    times: []
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: URGENCY & EMOTION DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function assessUrgency(text: string): UrgencyAssessment {
  const normalizedText = text.toLowerCase();
  let urgencyLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let emotionalState: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT' = 'NEUTRAL';
  const indicators: string[] = [];
  
  // Check for high urgency
  for (const [lang, patterns] of Object.entries(URGENCY_PATTERNS.high)) {
    for (const pattern of patterns) {
      if (normalizedText.includes(pattern.toLowerCase())) {
        urgencyLevel = 'HIGH';
        indicators.push(pattern);
      }
    }
  }
  
  // Check for medium urgency
  if (urgencyLevel !== 'HIGH') {
    for (const [lang, patterns] of Object.entries(URGENCY_PATTERNS.medium)) {
      for (const pattern of patterns) {
        if (normalizedText.includes(pattern.toLowerCase())) {
          urgencyLevel = 'MEDIUM';
          indicators.push(pattern);
        }
      }
    }
  }
  
  // Check emotional state
  for (const [lang, patterns] of Object.entries(EMOTION_PATTERNS.panic)) {
    for (const pattern of patterns) {
      if (normalizedText.includes(pattern.toLowerCase()) || text.includes(pattern)) {
        emotionalState = 'PANIC';
        break;
      }
    }
  }
  
  if (emotionalState === 'NEUTRAL') {
    for (const [lang, patterns] of Object.entries(EMOTION_PATTERNS.stressed)) {
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
// STEP 5: CLARIFICATION STRATEGY
// ═══════════════════════════════════════════════════════════════════════════

function buildClarificationStrategy(
  entities: EntityExtractionResult,
  intent: IntentDetectionResult,
  context: NLUAgentInput
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  
  // If no crop identified
  if (entities.crops.length === 0 && !context.land_context?.crop_code) {
    questions.push({
      question_id: 'Q1_CROP',
      question_text_mr: 'तुम्ही कोणतं पीक घेतलंय - कापूस, सोयाबीन, भाजीपाला की इतर?',
      question_text_hi: 'आप कौन सी फसल उगा रहे हैं - कपास, सोयाबीन, सब्जी या अन्य?',
      question_text_en: 'Which crop are you growing - cotton, soybean, vegetables or other?',
      expected_answer_type: 'MULTIPLE_CHOICE',
      options: [
        { value: 'COTTON', label_mr: 'कापूस', label_hi: 'कपास', label_en: 'Cotton' },
        { value: 'SOYBEAN', label_mr: 'सोयाबीन', label_hi: 'सोयाबीन', label_en: 'Soybean' },
        { value: 'VEGETABLE', label_mr: 'भाजीपाला', label_hi: 'सब्जी', label_en: 'Vegetables' }
      ],
      skip_if_urgent: true
    });
  }
  
  // If pest/disease mentioned but symptoms unclear
  if ((intent.primary === 'PEST_PROBLEM' || intent.primary === 'DISEASE_PROBLEM') && entities.symptoms.length === 0) {
    questions.push({
      question_id: 'Q2_SYMPTOMS',
      question_text_mr: 'पिकात नक्की काय दिसतंय - पाने पिवळी, किडी, डाग की इतर काही?',
      question_text_hi: 'फसल में क्या दिख रहा है - पीले पत्ते, कीड़े, दाग या कुछ और?',
      question_text_en: 'What exactly do you see - yellow leaves, insects, spots or something else?',
      expected_answer_type: 'TEXT',
      skip_if_urgent: true
    });
  }
  
  return questions;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE E: SYMPTOM-TO-ENTITY INFERENCE (Pattern-based fallback)
// ═══════════════════════════════════════════════════════════════════════════

interface SymptomInference {
  pest?: { canonical: string; localTerm: string; confidence: number };
  disease?: { canonical: string; localTerm: string; confidence: number };
}

function inferPestDiseaseFromSymptoms(text: string, symptoms: VisualSymptom[]): SymptomInference {
  const result: SymptomInference = {};
  const lowerText = text.toLowerCase();
  
  // CRITICAL: Sugarcane shoot borer patterns (MUST use SHOOT_BORER to match decision graph)
  // Expanded patterns to catch more variations
  if (/dead\s*heart|मधली\s*सुरळी|सुखी\s*सुरळी|मरलेली\s*सुरळी|गाभा\s*सुकला/.test(text) ||
      /सुरळी.*(वाळली|मरली|सुकली|पूर्ण|वाळल)/.test(text) ||
      /ऊसाची.*सुरळी/.test(text) ||
      /डेड\s*हार्ट|deadheart/i.test(text)) {
    const normalizedCode = normalizePestEntity('SHOOT_BORER');
    result.pest = { canonical: normalizedCode, localTerm: 'शूट बोरर / Dead Heart', confidence: 0.92 };
    console.log(`🎯 [NLU] Detected ${normalizedCode} from symptom pattern:`, text.substring(0, 50));
  }
  
  // Whitefly patterns
  if (/पांढऱ्या?\s*माश[ाी]|सफेद\s*मक्खी|white\s*fl(y|ies)/.test(text)) {
    result.pest = { canonical: normalizePestEntity('WHITEFLY'), localTerm: 'पांढरी माशी', confidence: 0.9 };
  }
  
  // Bollworm patterns
  if (/बोंड\s*(अळी|किडा)|बोंडातील|boll\s*worm|bolls?\s*damaged/.test(text)) {
    result.pest = { canonical: normalizePestEntity('BOLLWORM'), localTerm: 'बोंड अळी', confidence: 0.85 };
  }
  
  // Aphid patterns
  if (/मावा|माव[ाे]|aphid|चिकट\s*पाणी|honeydew/.test(text)) {
    result.pest = { canonical: normalizePestEntity('APHID'), localTerm: 'मावा', confidence: 0.85 };
  }
  
  // Powdery mildew patterns
  if (/पांढरी?\s*भुकटी|सफेद\s*पाउडर|powdery\s*mildew|white\s*powder/.test(text)) {
    result.disease = { canonical: normalizeDiseaseEntity('POWDERY_MILDEW'), localTerm: 'भुरी', confidence: 0.85 };
  }
  
  // Rust patterns
  if (/तांबेरा|रस्ट|rust|तांबड[ेा]\s*डाग|orange\s*spots/.test(text)) {
    result.disease = { canonical: normalizeDiseaseEntity('RUST'), localTerm: 'तांबेरा', confidence: 0.85 };
  }
  
  // Wilt patterns
  if (/विल्ट|wilt|मरगळ|सुकणे|wilting|drooping/.test(text)) {
    result.disease = { canonical: normalizeDiseaseEntity('WILT'), localTerm: 'मरगळ', confidence: 0.8 };
  }
  
  // Leaf curl patterns
  if (/पाने?\s*(वळ|curl)|leaf\s*curl|curled\s*leaves/.test(text)) {
    result.disease = { canonical: normalizeDiseaseEntity('LEAF_CURL'), localTerm: 'पाने वळणे', confidence: 0.8 };
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN NLU AGENT FUNCTION (AI-ENHANCED)
// ═══════════════════════════════════════════════════════════════════════════

export async function processNLUAgent(input: Partial<NLUAgentInput> & { raw_input: string }): Promise<NLUAgentOutput> {
  const startTime = Date.now();
  
  // Ensure conversation_context exists with defaults
  const conversationContext = input.conversation_context || {
    previous_turns: [],
    session_state: 'NEW' as const
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPRECATED: OLD DIALECT NORMALIZATION REMOVED
  // The new LLM-based semantic extraction is now called from orchestrator.ts:
  //   1. extractSemanticMeaning() - LLM extracts English descriptions  
  //   2. mapToObservationCodes() - Deterministic mapping to ObservationKeys
  // These codes are merged into inductionResult.symptoms before NLU runs
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`🧪 [NLU v${NLU_VERSION}] Semantic extraction handled by orchestrator (LLM-based)`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 0B: Try AI-Powered Understanding (Gemini) - for intent classification
  // ═══════════════════════════════════════════════════════════════════════════
  let aiResult: AIUnderstandingResult | null = null;
  try {
    aiResult = await callAIForUnderstanding(input.raw_input);
  } catch (err) {
    console.warn('⚠️ [NLU] AI understanding failed, using pattern matching:', err);
  }
  
  // Step 1: Language Detection (use AI result if available)
  const languageResult = detectLanguage(input.raw_input);
  if (aiResult?.language) {
    languageResult.primary_language = aiResult.language;
    languageResult.confidence = Math.max(languageResult.confidence, 0.9);
  }
  
  // Step 2: Intent Classification (prefer AI result)
  let intentResult = classifyIntent(input.raw_input, conversationContext);
  if (aiResult?.intent && aiResult.intent_confidence > 0.6) {
    intentResult = {
      primary: aiResult.intent,
      primary_confidence: aiResult.intent_confidence,
      secondary: intentResult.secondary,
      detected_patterns: intentResult.detected_patterns
    };
  }
  
  // Step 3: Entity Extraction (merge AI + pattern results)
  const entityResult = extractEntities(input.raw_input);
  if (aiResult?.crop && !entityResult.crops.length) {
    entityResult.crops.push({
      canonical: aiResult.crop.code,
      localTerm: aiResult.crop.name,
      confidence: 0.9
    });
  }
  if (aiResult?.pest && !entityResult.pests.length) {
    // CRITICAL: Use centralized entity normalizer for consistent codes
    const normalizedPestCode = normalizePestEntity(aiResult.pest.code);
    entityResult.pests.push({
      canonical: normalizedPestCode,
      localTerm: aiResult.pest.name,
      confidence: 0.85
    });
    console.log(`🔄 [NLU] AI pest normalized: "${aiResult.pest.code}" → "${normalizedPestCode}"`);
  }
  if (aiResult?.disease && !entityResult.diseases.length) {
    // Use centralized normalizer for diseases too
    const normalizedDiseaseCode = normalizeDiseaseEntity(aiResult.disease.code);
    entityResult.diseases.push({
      canonical: normalizedDiseaseCode,
      localTerm: aiResult.disease.name,
      confidence: 0.85
    });
    console.log(`🔄 [NLU] AI disease normalized: "${aiResult.disease.code}" → "${normalizedDiseaseCode}"`);
  }
  
  // VALIDATION LOGGING: Log entity codes for pipeline consistency verification
  if (entityResult.pests.length > 0 || entityResult.diseases.length > 0) {
    console.log('📋 [NLU_ENTITY_VALIDATION] Extracted entities:', {
      pests: entityResult.pests.map(p => ({ code: p.canonical, term: p.localTerm })),
      diseases: entityResult.diseases.map(d => ({ code: d.canonical, term: d.localTerm })),
      crops: entityResult.crops.map(c => ({ code: c.canonical, term: c.localTerm })),
      stage: 'NLU_EXTRACTION'
    });
  }
  
  // PHASE E: Enhanced symptom-to-entity resolution
  // If no pest/disease detected but symptoms suggest specific issues, infer them
  if (!entityResult.pests.length && !entityResult.diseases.length) {
    const symptomBasedInference = inferPestDiseaseFromSymptoms(input.raw_input, entityResult.symptoms);
    if (symptomBasedInference.pest) {
      entityResult.pests.push(symptomBasedInference.pest);
      console.log(`🎯 [NLU] Symptom inference added pest: ${symptomBasedInference.pest.canonical}`);
    }
    if (symptomBasedInference.disease) {
      entityResult.diseases.push(symptomBasedInference.disease);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPRECATED: OLD DIALECT INTEGRATION REMOVED
  // Symptom detection is now handled by LLM semantic extraction in orchestrator
  // The observation codes are merged into inductionResult.symptoms upstream
  // ═══════════════════════════════════════════════════════════════════════════
  // dialectResult integration removed - see orchestrator.ts for new LLM-based flow
  
  // Step 4: Urgency Assessment (use AI if available)
  const urgencyResult = assessUrgency(input.raw_input);
  if (aiResult?.urgency) {
    urgencyResult.level = aiResult.urgency;
    urgencyResult.emotional_state = aiResult.emotional_state;
    urgencyResult.requires_immediate_response = aiResult.urgency === 'HIGH' || aiResult.emotional_state === 'PANIC';
  }
  
  // Step 5: Build Clarification Strategy
  const clarificationQuestions = buildClarificationStrategy(entityResult, intentResult, input);
  
  // Calculate overall confidence (boost if AI was used)
  let overallConfidence = (
    languageResult.confidence * 0.2 +
    intentResult.primary_confidence * 0.4 +
    (entityResult.crops.length > 0 ? 0.2 : 0) +
    (entityResult.symptoms.length > 0 ? 0.2 : 0)
  );
  
  // AI boost - higher confidence when AI successfully analyzed
  if (aiResult && aiResult.intent_confidence > 0.7) {
    overallConfidence = Math.min(0.95, overallConfidence + 0.15);
  }
  
  const processingTime = Date.now() - startTime;
  console.log(`⚡ [NLU] Processed in ${processingTime}ms, AI used: ${!!aiResult}, confidence: ${(overallConfidence * 100).toFixed(1)}%`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MASTER PROMPT v3 - NLU OUTPUT (Observations Only, NO pest/disease codes)
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: NLU extracts OBSERVATIONS ONLY - Rule Engine does diagnosis
  // Fields like pest_code, disease_code are FORBIDDEN in this output
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
    intent_classification: {
      // PLAIN LANGUAGE intent - NOT internal codes
      primary_intent: intentResult.primary,
      intent_confidence: intentResult.primary_confidence,
      secondary_intents: intentResult.secondary,
      urgency_level: urgencyResult.level,
      emotional_state: urgencyResult.emotional_state
    },
    // Crop comes from CONTEXT (land DB), not from NLU inference
    crop_identification: {
      crop_code: input.land_context?.crop_code || entityResult.crops[0]?.canonical || 'UNKNOWN',
      local_name: entityResult.crops[0]?.localTerm,
      identification_source: input.land_context?.crop_code ? 'FROM_LAND_CONTEXT' : (entityResult.crops.length > 0 ? 'FARMER_MENTIONED' : 'UNKNOWN'),
      confidence: input.land_context?.crop_code ? 0.95 : (entityResult.crops[0]?.confidence || 0.5)
    },
    // OBSERVATIONS ONLY - NO diagnosis
    symptom_extraction: {
      visual_symptoms: entityResult.symptoms,
      behavioral_symptoms: [],
      // Store raw farmer observations for Rule Engine
      raw_observations: aiResult?.observations || [input.raw_input],
      temporal_pattern: {
        onset: 'UNKNOWN',
        progression: 'UNKNOWN'
      }
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // REMOVED: pest_disease_hypothesis - Rule Engine does this, NOT NLU
    // REMOVED: entities_extracted.pest_mentioned - Rule Engine determines pest
    // REMOVED: entities_extracted.disease_mentioned - Rule Engine determines disease
    // ═══════════════════════════════════════════════════════════════════════════
    context_integration: {
      is_follow_up: conversationContext?.session_state !== 'NEW',
      context_from_land: !!input.land_context
    },
    understanding_quality: {
      overall_confidence: overallConfidence,
      confidence_breakdown: {
        language_clarity: languageResult.confidence,
        symptom_specificity: entityResult.symptoms.length > 0 ? 0.8 : 0.3,
        context_completeness: input.land_context ? 0.9 : 0.5,
        ambiguity_score: clarificationQuestions.length * 0.2
      },
      missing_information: clarificationQuestions.length > 0 ? ['SYMPTOM_DETAILS'] : []
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // REMOVED: clarification_strategy - Rule Engine decides clarification
    // REMOVED: clarification_type - Rule Engine decides
    // REMOVED: clarification_options - Come from database ONLY
    // REMOVED: response_strategy - Rule Engine decides
    // ═══════════════════════════════════════════════════════════════════════════
    photo_recommendation: {
      photo_needed: intentResult.primary === 'PEST_PROBLEM' || intentResult.primary === 'DISEASE_PROBLEM',
      photo_priority: overallConfidence < 0.7 ? 'HIGH' : 'MEDIUM',
      reason: 'Visual confirmation will increase diagnostic confidence',
      specific_instructions: {
        mr: 'कृपया पानांच्या जवळून फोटो घ्या जिथे समस्या दिसते',
        hi: 'कृपया पत्तों की नजदीकी फोटो लें जहां समस्या दिख रही है',
        en: 'Please take close-up photo of leaves where the problem is visible',
        what_to_capture: 'Affected plant parts',
        lighting: 'Natural daylight',
        distance: '15-20 cm'
      }
    },
    normalized_text: {
      original_language: input.raw_input,
      cleaned: languageResult.normalized_text,
      english_translation: '' // Would require translation service
    },
    safety_flags: {
      banned_substance_mentioned: false,
      dangerous_practice_mentioned: false,
      emergency_escalation_needed: urgencyResult.requires_immediate_response,
      human_expert_needed: overallConfidence < 0.4
    },
    next_agent_recommendation: {
      proceed_to: overallConfidence > 0.6 ? 'CANONICAL_STATE_BUILDER' : 'CLARIFICATION_REQUIRED',
      skip_photo_agent: overallConfidence > 0.85,
      escalate_to_expert: urgencyResult.emotional_state === 'PANIC' && overallConfidence < 0.5,
      confidence_sufficient: overallConfidence > 0.7
    }
  };
}

export { NLU_VERSION };

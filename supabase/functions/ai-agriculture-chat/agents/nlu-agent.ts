/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT 1: NATURAL LANGUAGE UNDERSTANDING (NLU) - PRODUCTION v3.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Processes farmer input in Marathi, Hindi, and English including:
 * - Regional dialects and colloquialisms
 * - Mixed-language (code-switching) sentences
 * - Agricultural terminology in local languages
 * - Voice-to-text transcriptions with errors
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

const NLU_VERSION = '3.0.1';

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
    /कीड़े?\s*(लग|दिख|आ)/i
  ],
  DISEASE_PROBLEM: [
    /रोग|बीमारी|disease|infection|बुरशी|फफूंद/i,
    /सुरळी|विल्ट|करपा|ब्लाइट|rust|तांबेरा/i,
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
      results.push({
        intent: intent as PrimaryIntent,
        confidence: Math.min(0.95, 0.5 + (matchCount * 0.15)),
        patterns: matchedPatterns
      });
    }
  }
  
  results.sort((a, b) => b.confidence - a.confidence);
  
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
  
  const words = text.toLowerCase().split(/\s+/);
  
  for (const word of words) {
    if (cropTerms.has(word)) {
      crops.push({ canonical: cropTerms.get(word)!, localTerm: word, confidence: 0.9 });
    }
    if (pestTerms.has(word)) {
      pests.push({ canonical: pestTerms.get(word)!, localTerm: word, confidence: 0.85 });
    }
    if (diseaseTerms.has(word)) {
      diseases.push({ canonical: diseaseTerms.get(word)!, localTerm: word, confidence: 0.85 });
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
// MAIN NLU AGENT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function processNLUAgent(input: Partial<NLUAgentInput> & { raw_input: string }): NLUAgentOutput {
  const startTime = Date.now();
  
  // Ensure conversation_context exists with defaults
  const conversationContext = input.conversation_context || {
    previous_turns: [],
    session_state: 'NEW' as const
  };
  
  // Step 1: Language Detection
  const languageResult = detectLanguage(input.raw_input);
  
  // Step 2: Intent Classification (with null-safe context)
  const intentResult = classifyIntent(input.raw_input, conversationContext);
  
  // Step 3: Entity Extraction
  const entityResult = extractEntities(input.raw_input);
  
  // Step 4: Urgency Assessment
  const urgencyResult = assessUrgency(input.raw_input);
  
  // Step 5: Build Clarification Strategy
  const clarificationQuestions = buildClarificationStrategy(entityResult, intentResult, input);
  
  // Calculate overall confidence
  const overallConfidence = (
    languageResult.confidence * 0.2 +
    intentResult.primary_confidence * 0.4 +
    (entityResult.crops.length > 0 ? 0.2 : 0) +
    (entityResult.symptoms.length > 0 ? 0.2 : 0)
  );
  
  const processingTime = Date.now() - startTime;
  
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
      primary_intent: intentResult.primary,
      intent_confidence: intentResult.primary_confidence,
      secondary_intents: intentResult.secondary,
      urgency_level: urgencyResult.level,
      emotional_state: urgencyResult.emotional_state
    },
    crop_identification: {
      crop_code: entityResult.crops[0]?.canonical || input.land_context?.crop_code || 'UNKNOWN',
      local_name: entityResult.crops[0]?.localTerm,
      identification_source: entityResult.crops.length > 0 ? 'EXPLICIT' : (input.land_context?.crop_code ? 'INFERRED_FROM_CONTEXT' : 'UNKNOWN'),
      confidence: entityResult.crops[0]?.confidence || 0.5
    },
    symptom_extraction: {
      visual_symptoms: entityResult.symptoms,
      behavioral_symptoms: [],
      temporal_pattern: {
        onset: 'UNKNOWN',
        progression: 'UNKNOWN'
      }
    },
    pest_disease_hypothesis: {
      suspected_causes: {
        primary: entityResult.pests.map(p => ({
          type: 'PEST' as const,
          code: p.canonical,
          confidence: p.confidence,
          evidence: [p.localTerm]
        })).concat(entityResult.diseases.map(d => ({
          type: 'DISEASE' as const,
          code: d.canonical,
          confidence: d.confidence,
          evidence: [d.localTerm]
        }))),
        secondary: []
      }
    },
    entities_extracted: {
      pest_mentioned: entityResult.pests[0] ? {
        local_term: entityResult.pests[0].localTerm,
        canonical: entityResult.pests[0].canonical,
        confidence: entityResult.pests[0].confidence
      } : undefined,
      disease_mentioned: entityResult.diseases[0] ? {
        local_term: entityResult.diseases[0].localTerm,
        canonical: entityResult.diseases[0].canonical,
        confidence: entityResult.diseases[0].confidence
      } : undefined
    },
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
    clarification_strategy: {
      clarification_needed: clarificationQuestions.length > 0 && !urgencyResult.requires_immediate_response,
      clarification_priority: clarificationQuestions.length > 1 ? 'HIGH' : clarificationQuestions.length > 0 ? 'MEDIUM' : 'NONE',
      questions_to_ask: clarificationQuestions
    },
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
      proceed_to: overallConfidence > 0.6 ? 'AGENT_2_DIAGNOSTIC_FLOW' : 'AGENT_3_PHOTO_ANALYSIS',
      skip_photo_agent: overallConfidence > 0.85,
      escalate_to_expert: urgencyResult.emotional_state === 'PANIC' && overallConfidence < 0.5,
      confidence_sufficient: overallConfidence > 0.7
    }
  };
}

export { NLU_VERSION };

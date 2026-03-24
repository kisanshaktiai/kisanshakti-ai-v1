/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT ROUTER - Enhanced Intent Classification & Response Routing
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PART 1 of KisanShakti comprehensive fix:
 * - Enhanced intent classification with INFORMATION_SHARING, PROGRESS_UPDATE, FOLLOW_UP
 * - Intent-based response routing (acknowledgment vs treatment vs information)
 * - Pattern recognition for growth stage updates and progress sharing
 * 
 * VERSION: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED INTENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type EnhancedIntent = 
  | 'INFORMATION_SHARING'     // Farmer providing status update
  | 'PROGRESS_UPDATE'         // Growth milestone achieved  
  | 'PROBLEM_REPORTING'       // Actual problem requiring diagnosis
  | 'QUESTION_ASKING'         // Information request
  | 'FOLLOW_UP'               // Continuing previous conversation
  | 'GREETING'                // Simple greeting
  | 'CONFIRMATION'            // Yes/Ok response
  | 'PEST_PROBLEM'            // Pest issue requiring treatment
  | 'DISEASE_PROBLEM'         // Disease issue requiring treatment
  | 'NUTRIENT_ISSUE'          // Nutrient deficiency
  | 'WATER_ISSUE'             // Irrigation related
  | 'WEATHER_QUERY'           // Weather questions
  | 'MARKET_QUERY'            // Market/price questions
  | 'GENERAL_QUERY'           // General farming questions
  | 'EMERGENCY';              // Urgent crisis

// Response types based on intent
export type ResponseType = 
  | 'ACKNOWLEDGMENT_WITH_GUIDANCE'   // For information sharing
  | 'DIAGNOSTIC_TREATMENT'           // For problem reporting
  | 'DIRECT_INFORMATION'             // For questions
  | 'PROGRESSIVE_GUIDANCE'           // For follow-ups
  | 'GREETING_RESPONSE'              // For greetings
  | 'RULE_ENGINE_REQUIRED';          // For pest/disease/treatment

export interface IntentClassificationResult {
  primary_intent: EnhancedIntent;
  confidence: number;
  response_type: ResponseType;
  requires_rule_engine: boolean;
  matched_patterns: string[];
  detected_stage?: string;
  metadata: {
    is_progress_update: boolean;
    is_problem_report: boolean;
    is_question: boolean;
    is_follow_up: boolean;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INFORMATION SHARING PATTERNS (farmer providing status updates)
// ═══════════════════════════════════════════════════════════════════════════

const INFORMATION_SHARING_PATTERNS = {
  completion_markers: {
    mr: [
      /पूर्ण\s*झाले?/i,
      /पूर्ण\s*झाली/i,
      /झाले?\s*आहे/i,
      /झाली\s*आहे/i,
      /केले?\s*आहे/i,
      /केली\s*आहे/i,
      /संपले?/i,
      /संपली/i,
      /लागवड\s*केली/i,
      /पेरणी\s*केली/i,
      /फवारणी\s*केली/i,
      /खत\s*दिले/i,
    ],
    hi: [
      /पूर्ण\s*हुआ/i,
      /पूरा\s*हुआ/i,
      /हो\s*गया/i,
      /हो\s*गई/i,
      /कर\s*दिया/i,
      /कर\s*दी/i,
      /बुवाई\s*की/i,
      /रोपाई\s*की/i,
      /छिड़काव\s*किया/i,
      /खाद\s*डाली/i,
    ],
    en: [
      /completed?/i,
      /finished/i,
      /done/i,
      /applied/i,
      /sowed/i,
      /planted/i,
      /sprayed/i,
      /added\s*fertilizer/i,
    ]
  },
  
  start_markers: {
    mr: [
      /सुरू\s*झाले?/i,
      /सुरू\s*झाली/i,
      /चालू\s*झाले?/i,
      /लागले?/i,
      /दिसत\s*आहे/i,
      /येत\s*आहे/i,
    ],
    hi: [
      /शुरू\s*हुआ/i,
      /शुरू\s*हो\s*गया/i,
      /लग\s*गया/i,
      /दिख\s*रहा/i,
      /आ\s*रहा/i,
    ],
    en: [
      /started/i,
      /beginning/i,
      /showing/i,
      /appearing/i,
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS UPDATE PATTERNS (growth milestones)
// ═══════════════════════════════════════════════════════════════════════════

const PROGRESS_UPDATE_PATTERNS = {
  growth_stages: {
    mr: [
      /अंकुरण.*(?:पूर्ण|झाले|सुरू)/i,
      /कंसे.*(?:फुटले|आले|सुरू)/i,
      /फुलोरा.*(?:सुरू|आला|येत)/i,
      /पक.*(?:सुरू|होत|लागल)/i,
      /सुरुवाती.*(?:अवस्था|टप्पा)/i,
      /वाढ.*(?:चांगली|होत)/i,
      /फांद्या.*(?:फुटत|आल)/i,
    ],
    hi: [
      /अंकुरण.*(?:पूर्ण|हुआ|शुरू)/i,
      /कल्ले.*(?:फूटे|आए|शुरू)/i,
      /फूल.*(?:आए|लगे|शुरू)/i,
      /पकना.*(?:शुरू|हो)/i,
      /बढ़वार.*(?:अच्छी|हो)/i,
    ],
    en: [
      /germination.*(?:complete|done|started)/i,
      /tillering.*(?:started|begun|complete)/i,
      /flowering.*(?:started|begun|complete)/i,
      /maturity.*(?:reached|approaching)/i,
      /growth.*(?:good|excellent|started)/i,
    ]
  },
  
  positive_indicators: {
    mr: [/चांगले/i, /उत्तम/i, /निरोगी/i, /मजबूत/i],
    hi: [/अच्छा/i, /उत्तम/i, /स्वस्थ/i, /मजबूत/i],
    en: [/good/i, /excellent/i, /healthy/i, /strong/i]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEM REPORTING PATTERNS (issues requiring diagnosis)
// ═══════════════════════════════════════════════════════════════════════════

const PROBLEM_REPORTING_PATTERNS = {
  symptom_words: {
    mr: [
      /पिवळे?\s*पडत/i,
      /वाळत/i,
      /सुकत/i,
      /मरत/i,
      /पडत\s*आहे/i,
      /खराब/i,
      /नुकसान/i,
      /रोग\s*लागला/i,
      /किडी\s*लागली/i,
      /छिद्र/i,
      /डाग/i,
      /तांबडे/i,
    ],
    hi: [
      /पीला\s*पड/i,
      /सूख\s*रहा/i,
      /मुरझा/i,
      /मर\s*रहा/i,
      /खराब/i,
      /नुकसान/i,
      /रोग\s*लगा/i,
      /कीड़े\s*लगे/i,
      /छेद/i,
      /धब्बे/i,
    ],
    en: [
      /yellowing/i,
      /wilting/i,
      /dying/i,
      /damaged/i,
      /disease/i,
      /pest/i,
      /holes/i,
      /spots/i,
      /infected/i,
    ]
  },
  
  distress_words: {
    mr: [/वाचवा/i, /मदत/i, /त्रास/i, /समस्या/i],
    hi: [/बचाओ/i, /मदद/i, /परेशान/i, /समस्या/i],
    en: [/help/i, /save/i, /problem/i, /issue/i, /trouble/i]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const FOLLOW_UP_PATTERNS = {
  continuation_markers: {
    mr: [
      /आता\s*काय/i,
      /पुढे\s*काय/i,
      /नंतर\s*काय/i,
      /केले.*आता/i,
      /दिले.*आता/i,
      /फवारणी\s*केली.*काय/i,
      /अजूनही/i,
      /तरीही/i,
    ],
    hi: [
      /अब\s*क्या/i,
      /आगे\s*क्या/i,
      /फिर\s*क्या/i,
      /किया.*अब/i,
      /दिया.*अब/i,
      /अभी\s*भी/i,
      /फिर\s*भी/i,
    ],
    en: [
      /now\s*what/i,
      /what\s*next/i,
      /after\s*that/i,
      /applied.*now/i,
      /still\s*not/i,
      /not\s*better/i,
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const QUESTION_PATTERNS = {
  question_words: {
    mr: [/काय/i, /कसे/i, /कधी/i, /किती/i, /कोणते/i, /का\?/i],
    hi: [/क्या/i, /कैसे/i, /कब/i, /कितना/i, /कौन/i, /क्यों/i],
    en: [/what/i, /how/i, /when/i, /how much/i, /which/i, /why/i]
  },
  question_markers: [/\?/, /।.*\?/]
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN INTENT CLASSIFICATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function classifyEnhancedIntent(
  message: string,
  sessionContext?: {
    last_recommendation?: { type: string; pest?: string; product?: string };
    pending_follow_up?: boolean;
    conversation_stage?: string;
  }
): IntentClassificationResult {
  const normalizedMessage = message.trim().toLowerCase();
  const matchedPatterns: string[] = [];
  
  // Track detection flags
  let isProgressUpdate = false;
  let isInformationSharing = false;
  let isProblemReport = false;
  let isQuestion = false;
  let isFollowUp = false;
  let detectedStage: string | undefined;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Check for INFORMATION_SHARING (status updates without problems)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Check completion markers
  for (const [lang, patterns] of Object.entries(INFORMATION_SHARING_PATTERNS.completion_markers)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchedPatterns.push(`completion_${lang}:${pattern.source}`);
        isInformationSharing = true;
      }
    }
  }
  
  // Check start markers
  for (const [lang, patterns] of Object.entries(INFORMATION_SHARING_PATTERNS.start_markers)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchedPatterns.push(`start_${lang}:${pattern.source}`);
        isInformationSharing = true;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Check for PROGRESS_UPDATE (growth milestones)
  // ═══════════════════════════════════════════════════════════════════════════
  
  for (const [lang, patterns] of Object.entries(PROGRESS_UPDATE_PATTERNS.growth_stages)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchedPatterns.push(`stage_${lang}:${pattern.source}`);
        isProgressUpdate = true;
        // Extract stage if possible
        if (/अंकुरण|germination/i.test(message)) detectedStage = 'GERMINATION';
        else if (/कंसे|कल्ले|tillering/i.test(message)) detectedStage = 'TILLERING';
        else if (/फुलोरा|फूल|flowering/i.test(message)) detectedStage = 'FLOWERING';
        else if (/पक|maturity/i.test(message)) detectedStage = 'MATURITY';
      }
    }
  }
  
  // Check positive indicators (no problem, just update)
  for (const [lang, patterns] of Object.entries(PROGRESS_UPDATE_PATTERNS.positive_indicators)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchedPatterns.push(`positive_${lang}:${pattern.source}`);
        isProgressUpdate = true;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Check for PROBLEM_REPORTING (issues requiring diagnosis)
  // ═══════════════════════════════════════════════════════════════════════════
  
  for (const [lang, patterns] of Object.entries(PROBLEM_REPORTING_PATTERNS.symptom_words)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchedPatterns.push(`symptom_${lang}:${pattern.source}`);
        isProblemReport = true;
      }
    }
  }
  
  for (const [lang, patterns] of Object.entries(PROBLEM_REPORTING_PATTERNS.distress_words)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchedPatterns.push(`distress_${lang}:${pattern.source}`);
        isProblemReport = true;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Check for FOLLOW_UP
  // ═══════════════════════════════════════════════════════════════════════════
  
  for (const [lang, patterns] of Object.entries(FOLLOW_UP_PATTERNS.continuation_markers)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchedPatterns.push(`followup_${lang}:${pattern.source}`);
        isFollowUp = true;
      }
    }
  }
  
  // Also check session context for pending follow-up
  if (sessionContext?.pending_follow_up) {
    isFollowUp = true;
    matchedPatterns.push('session:pending_follow_up');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Check for QUESTION_ASKING
  // ═══════════════════════════════════════════════════════════════════════════
  
  for (const [lang, patterns] of Object.entries(QUESTION_PATTERNS.question_words)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchedPatterns.push(`question_${lang}:${pattern.source}`);
        isQuestion = true;
      }
    }
  }
  
  for (const pattern of QUESTION_PATTERNS.question_markers) {
    if (pattern.test(message)) {
      matchedPatterns.push('question_marker');
      isQuestion = true;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: DETERMINE PRIMARY INTENT based on priority
  // Priority: PROBLEM > FOLLOW_UP > QUESTION > PROGRESS > INFORMATION_SHARING
  // ═══════════════════════════════════════════════════════════════════════════
  
  let primaryIntent: EnhancedIntent;
  let responseType: ResponseType;
  let requiresRuleEngine = false;
  let confidence = 0.7;
  let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  
  // Check for greeting first (exact match)
  if (/^(नमस्कार|नमस्ते|hello|hi|hey)\s*[\!\।]*$/i.test(message.trim())) {
    primaryIntent = 'GREETING';
    responseType = 'GREETING_RESPONSE';
    confidence = 0.95;
  }
  // Problem reporting takes highest priority
  else if (isProblemReport && !isProgressUpdate) {
    // Determine if it's pest, disease, or general problem
    if (/किडी|किडे|किड|कीड़|कीड|pest|insect|bug|अळी|इल्ली|कीटक/i.test(message)) {
      primaryIntent = 'PEST_PROBLEM';
    } else if (/रोग|disease|बीमारी|बुरशी/i.test(message)) {
      primaryIntent = 'DISEASE_PROBLEM';
    } else if (/पिवळे|पीला|yellow|खत|fertilizer/i.test(message)) {
      primaryIntent = 'NUTRIENT_ISSUE';
    } else {
      primaryIntent = 'PROBLEM_REPORTING';
    }
    responseType = 'RULE_ENGINE_REQUIRED';
    requiresRuleEngine = true;
    urgency = /वाचवा|बचाओ|मरत|dying|urgent|ताबडतोब|तुरंत/i.test(message) ? 'HIGH' : 'MEDIUM';
    confidence = 0.85;
  }
  // Follow-up questions
  else if (isFollowUp) {
    primaryIntent = 'FOLLOW_UP';
    responseType = 'PROGRESSIVE_GUIDANCE';
    confidence = 0.8;
    urgency = 'MEDIUM';
  }
  // Questions take next priority
  else if (isQuestion && !isProgressUpdate && !isInformationSharing) {
    primaryIntent = 'QUESTION_ASKING';
    responseType = 'DIRECT_INFORMATION';
    confidence = 0.8;
  }
  // Progress updates
  else if (isProgressUpdate) {
    primaryIntent = 'PROGRESS_UPDATE';
    responseType = 'ACKNOWLEDGMENT_WITH_GUIDANCE';
    confidence = 0.85;
  }
  // Information sharing (general status updates)
  else if (isInformationSharing) {
    primaryIntent = 'INFORMATION_SHARING';
    responseType = 'ACKNOWLEDGMENT_WITH_GUIDANCE';
    confidence = 0.8;
  }
  // Default to general query
  else {
    primaryIntent = 'GENERAL_QUERY';
    responseType = 'DIRECT_INFORMATION';
    confidence = 0.5;
  }
  
  console.log(`🎯 [IntentRouter] Classified: ${primaryIntent} (${(confidence * 100).toFixed(0)}%) → ${responseType}`);
  console.log(`   Patterns matched: ${matchedPatterns.slice(0, 3).join(', ')}${matchedPatterns.length > 3 ? '...' : ''}`);
  
  return {
    primary_intent: primaryIntent,
    confidence,
    response_type: responseType,
    requires_rule_engine: requiresRuleEngine,
    matched_patterns: matchedPatterns,
    detected_stage: detectedStage,
    metadata: {
      is_progress_update: isProgressUpdate,
      is_problem_report: isProblemReport,
      is_question: isQuestion,
      is_follow_up: isFollowUp,
      urgency
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE TYPE GUIDELINES
// ═══════════════════════════════════════════════════════════════════════════

export function getResponseGuidelines(responseType: ResponseType): {
  should_recommend_treatment: boolean;
  should_ask_clarification: boolean;
  should_acknowledge_progress: boolean;
  should_provide_next_steps: boolean;
  template_style: string;
} {
  switch (responseType) {
    case 'ACKNOWLEDGMENT_WITH_GUIDANCE':
      return {
        should_recommend_treatment: false,  // CRITICAL: Never recommend pesticides for status updates
        should_ask_clarification: false,
        should_acknowledge_progress: true,
        should_provide_next_steps: true,
        template_style: 'SUPPORTIVE_GUIDANCE'
      };
      
    case 'DIAGNOSTIC_TREATMENT':
    case 'RULE_ENGINE_REQUIRED':
      return {
        should_recommend_treatment: true,
        should_ask_clarification: true,  // May need more info
        should_acknowledge_progress: false,
        should_provide_next_steps: true,
        template_style: 'IPM_TREATMENT'
      };
      
    case 'DIRECT_INFORMATION':
      return {
        should_recommend_treatment: false,
        should_ask_clarification: false,
        should_acknowledge_progress: false,
        should_provide_next_steps: false,
        template_style: 'FACTUAL_ANSWER'
      };
      
    case 'PROGRESSIVE_GUIDANCE':
      return {
        should_recommend_treatment: false,  // Only continue previous treatment
        should_ask_clarification: true,
        should_acknowledge_progress: true,
        should_provide_next_steps: true,
        template_style: 'FOLLOW_UP'
      };
      
    case 'GREETING_RESPONSE':
      return {
        should_recommend_treatment: false,
        should_ask_clarification: false,
        should_acknowledge_progress: false,
        should_provide_next_steps: false,
        template_style: 'GREETING'
      };
      
    default:
      return {
        should_recommend_treatment: false,
        should_ask_clarification: true,
        should_acknowledge_progress: false,
        should_provide_next_steps: false,
        template_style: 'GENERAL'
      };
  }
}

export default classifyEnhancedIntent;

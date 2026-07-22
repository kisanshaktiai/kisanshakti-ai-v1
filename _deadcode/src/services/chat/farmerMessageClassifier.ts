/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER MESSAGE CLASSIFIER - KisanShakti AI Decision Brain
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * STEP 1: FARMER MESSAGE UNDERSTANDING (CRITICAL FIX)
 * 
 * Farmers may:
 * - Ask incomplete questions
 * - Use Marathi / Hindi / English mix
 * - Speak in observations, not commands
 * - Continue a previous discussion
 * 
 * Before answering, classify the farmer message into ONE intent type.
 * ⚠️ Do NOT treat every message as an action command.
 */

// ═══════════════════════════════════════════════════════════════════════════
// INTENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FarmerMessageIntent = 
  | 'OBSERVATION'      // Field condition described
  | 'DOUBT'            // Doubt / confirmation question
  | 'SYMPTOM'          // Symptom reporting
  | 'ACTION_REQUEST'   // Direct action request
  | 'FOLLOW_UP'        // Follow-up to last advice
  | 'UNCLEAR';         // Mixed intent

export interface MessageClassification {
  intent: FarmerMessageIntent;
  confidence: number;
  matchedPatterns: string[];
  subIntent?: string;           // e.g., 'WATER', 'PEST', 'NUTRIENT'
  isQuestion: boolean;
  isUrgent: boolean;
  language: 'en' | 'hi' | 'mr' | 'mixed';
  responseStyle: 'diagnostic' | 'advisory' | 'confirmation' | 'monitoring';
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const OBSERVATION_PATTERNS = {
  en: [
    'i see', 'i noticed', 'there is', 'there are', 'found', 'seeing',
    'crop is', 'plant is', 'leaves are', 'field has', 'my crop has',
    'looking', 'appears', 'seems like', 'turned', 'becoming'
  ],
  hi: [
    'दिख रहा', 'दिखाई दे', 'देखा', 'है', 'हो गया', 'हो रहा', 
    'लग रहा', 'पत्ते हो गए', 'फसल में', 'पौधे में', 'खेत में',
    'मेरे खेत में', 'मेरी फसल में', 'पीला हो', 'सूख रहा'
  ],
  mr: [
    'दिसतोय', 'दिसत आहे', 'आढळले', 'आहे', 'झाले', 'होत आहे',
    'वाटतोय', 'पाने झाले', 'पिकात', 'झाडावर', 'शेतात',
    'माझ्या शेतात', 'माझ्या पिकात', 'पिवळे झाले', 'वाळत आहे',
    'मधली सुरळी', 'सुरळी वाळली', 'गाभा मेला', 'गाभा वाळला'
  ]
};

const DOUBT_PATTERNS = {
  en: [
    'is it', 'should i', 'can i', 'will it', 'is this', 'are these',
    'do i need', 'is it safe', 'is it ok', 'correct', 'right',
    'confirm', 'verify', 'check if', 'make sure'
  ],
  hi: [
    'क्या यह', 'क्या मैं', 'क्या ये', 'ये सही है', 'ठीक है क्या',
    'करना चाहिए', 'कर सकता', 'होगा क्या', 'जरूरी है क्या',
    'सही है', 'गलत है', 'पक्का', 'पता करो'
  ],
  mr: [
    'हे बरोबर', 'करावे का', 'करू का', 'होईल का', 'हे योग्य',
    'ठीक आहे का', 'चालेल का', 'गरजेचे आहे का', 'आवश्यक आहे का',
    'खरं का', 'चुकीचं', 'नक्की', 'खात्री करा'
  ]
};

const SYMPTOM_PATTERNS = {
  en: [
    'yellow', 'brown', 'wilting', 'dying', 'drying', 'spots', 'holes',
    'curling', 'drooping', 'rotting', 'attacked', 'infected', 'damaged',
    'not growing', 'stunted', 'falling', 'dead heart', 'borer', 'worm'
  ],
  hi: [
    'पीला', 'भूरा', 'मुरझा', 'सूख', 'धब्बे', 'छेद', 'मुड़',
    'झुक', 'सड़', 'हमला', 'संक्रमित', 'खराब', 'बढ़ नहीं रहा',
    'छोटा रह गया', 'गिर', 'कीड़ा', 'अळी', 'इल्ली', 'गभा सूख'
  ],
  mr: [
    'पिवळे', 'तपकिरी', 'कोमेजणे', 'मरत', 'वाळत', 'डाग', 'भोके',
    'मुडपणे', 'झुकणे', 'कुजणे', 'हल्ला', 'संसर्ग', 'खराब', 'वाढत नाही',
    'खुजे राहिले', 'गळणे', 'किडा', 'अळी', 'बोरर', 'गाभा वाळला',
    'मधली सुरळी वाळली', 'शेंडा मेला', 'खोड पोखरले'
  ]
};

const ACTION_REQUEST_PATTERNS = {
  en: [
    'tell me what', 'what should', 'how to', 'when to', 'how much',
    'give advice', 'suggest', 'recommend', 'need to', 'want to',
    'apply', 'spray', 'water', 'irrigate', 'fertilize', 'treat'
  ],
  hi: [
    'क्या करें', 'कब करें', 'कैसे करें', 'कितना', 'सलाह दो',
    'बताओ', 'सुझाव दो', 'देना है', 'लगाना है', 'डालना है',
    'छिड़काव करें', 'पानी दें', 'खाद डालें', 'दवाई दें'
  ],
  mr: [
    'काय करावे', 'कधी करावे', 'कसे करावे', 'किती द्यावे', 'सल्ला द्या',
    'सांगा', 'शिफारस करा', 'द्यावे लागेल', 'टाकावे', 'द्यावे',
    'फवारणी करावी', 'पाणी द्यावे', 'खत द्यावे', 'औषध द्यावे'
  ]
};

const FOLLOW_UP_PATTERNS = {
  en: [
    'did that', 'done', 'after that', 'what next', 'then what',
    'now what', 'still', 'but', 'however', 'it did not work',
    'did not help', 'same problem', 'again', 'yesterday', 'last time',
    'you said', 'as you said', 'according to', 'following your'
  ],
  hi: [
    'वो किया', 'कर दिया', 'उसके बाद', 'अब क्या', 'फिर क्या',
    'अभी क्या', 'अभी भी', 'लेकिन', 'फिर भी', 'काम नहीं किया',
    'फायदा नहीं', 'वही समस्या', 'फिर से', 'कल', 'पिछली बार',
    'आपने कहा था', 'जैसा बताया', 'के अनुसार'
  ],
  mr: [
    'ते केले', 'केले', 'त्यानंतर', 'आता काय', 'मग काय',
    'अजून काय', 'अजूनही', 'पण', 'तरीही', 'काम केले नाही',
    'फायदा नाही', 'तीच समस्या', 'परत', 'काल', 'मागील वेळी',
    'तुम्ही सांगितले', 'तसेच केले', 'प्रमाणे'
  ]
};

const URGENCY_PATTERNS = {
  en: ['urgent', 'emergency', 'immediately', 'quickly', 'asap', 'dying', 'critical', 'help'],
  hi: ['जल्दी', 'तुरंत', 'अभी', 'जरूरी', 'गंभीर', 'मदद', 'बचाओ', 'मर रहा'],
  mr: ['त्वरित', 'ताबडतोब', 'आत्ता', 'गरजेचे', 'गंभीर', 'मदत', 'वाचवा', 'मरतोय']
};

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function detectLanguage(message: string): 'en' | 'hi' | 'mr' | 'mixed' {
  const devanagariCount = (message.match(/[\u0900-\u097F]/g) || []).length;
  const englishCount = (message.match(/[a-zA-Z]/g) || []).length;
  const totalChars = message.replace(/\s/g, '').length;
  
  if (totalChars === 0) return 'en';
  
  const devanagariRatio = devanagariCount / totalChars;
  const englishRatio = englishCount / totalChars;
  
  // Check for Marathi-specific characters/words
  const marathiIndicators = /मी|आहे|आहेत|माझा|माझी|माझे|तुमचा|तुमची|तुमचे|करावे|द्यावे|ठेवावे/;
  
  if (devanagariRatio > 0.5) {
    return marathiIndicators.test(message) ? 'mr' : 'hi';
  } else if (englishRatio > 0.7) {
    return 'en';
  } else {
    return 'mixed';
  }
}

function matchPatterns(message: string, patterns: Record<string, string[]>): string[] {
  const lowerMessage = message.toLowerCase();
  const matched: string[] = [];
  
  for (const [lang, patternList] of Object.entries(patterns)) {
    for (const pattern of patternList) {
      if (lowerMessage.includes(pattern.toLowerCase())) {
        matched.push(pattern);
      }
    }
  }
  
  return matched;
}

function detectSubIntent(message: string): string | undefined {
  const lowerMessage = message.toLowerCase();
  
  // Water-related
  if (/water|पानी|पाणी|सिंचाई|सिंचन|irrigation|drip|ड्रिप/i.test(lowerMessage)) {
    return 'WATER';
  }
  
  // Pest-related
  if (/pest|कीट|किडे|insect|bug|worm|कीड़ा|अळी|बोरर|borer|सुरळी|गाभा/i.test(lowerMessage)) {
    return 'PEST';
  }
  
  // Disease-related
  if (/disease|रोग|आजार|fungus|blight|rust|wilt|ब्लाइट|करपा|तांबेरा/i.test(lowerMessage)) {
    return 'DISEASE';
  }
  
  // Nutrient-related
  if (/fertilizer|खाद|खत|urea|dap|npk|nitrogen|यूरिया|युरिया|पोषक/i.test(lowerMessage)) {
    return 'NUTRIENT';
  }
  
  // Weed-related
  if (/weed|खरपतवार|तण|गवत|grass|निराई|निंदणी/i.test(lowerMessage)) {
    return 'WEED';
  }
  
  // Harvest-related
  if (/harvest|कटाई|कापणी|काढणी|ready|तैयार|पिकले|mature/i.test(lowerMessage)) {
    return 'HARVEST';
  }
  
  return undefined;
}

function isQuestion(message: string): boolean {
  // Check for question mark
  if (message.includes('?')) return true;
  
  // Check for question words
  const questionPatterns = /^(what|when|how|why|which|is|are|do|does|can|should|क्या|कब|कैसे|क्यों|कौन|काय|कधी|कसे|का|कोण)/i;
  return questionPatterns.test(message.trim());
}

/**
 * Classify farmer message intent
 */
export function classifyFarmerMessage(message: string): MessageClassification {
  const language = detectLanguage(message);
  
  // Match all pattern types
  const observationMatches = matchPatterns(message, OBSERVATION_PATTERNS);
  const doubtMatches = matchPatterns(message, DOUBT_PATTERNS);
  const symptomMatches = matchPatterns(message, SYMPTOM_PATTERNS);
  const actionMatches = matchPatterns(message, ACTION_REQUEST_PATTERNS);
  const followUpMatches = matchPatterns(message, FOLLOW_UP_PATTERNS);
  const urgencyMatches = matchPatterns(message, URGENCY_PATTERNS);
  
  // Calculate scores
  const scores: Record<FarmerMessageIntent, number> = {
    OBSERVATION: observationMatches.length * 2,
    DOUBT: doubtMatches.length * 2,
    SYMPTOM: symptomMatches.length * 3, // Higher weight for symptoms
    ACTION_REQUEST: actionMatches.length * 2,
    FOLLOW_UP: followUpMatches.length * 2.5, // Follow-ups are important
    UNCLEAR: 0
  };
  
  // Boost symptom score if observation patterns are also present
  if (symptomMatches.length > 0 && observationMatches.length > 0) {
    scores.SYMPTOM += 2;
  }
  
  // Find highest scoring intent
  let maxScore = 0;
  let maxIntent: FarmerMessageIntent = 'UNCLEAR';
  let allMatched: string[] = [];
  
  for (const [intent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxIntent = intent as FarmerMessageIntent;
    }
  }
  
  // Combine matched patterns
  allMatched = [
    ...observationMatches,
    ...doubtMatches,
    ...symptomMatches,
    ...actionMatches,
    ...followUpMatches
  ];
  
  // If no clear intent, default to UNCLEAR
  if (maxScore < 2) {
    maxIntent = 'UNCLEAR';
  }
  
  // Calculate confidence
  const totalMatches = allMatched.length;
  let confidence = Math.min(0.95, 0.3 + (maxScore / 10));
  
  // Detect sub-intent
  const subIntent = detectSubIntent(message);
  
  // Determine response style based on intent
  let responseStyle: MessageClassification['responseStyle'] = 'advisory';
  switch (maxIntent) {
    case 'OBSERVATION':
    case 'SYMPTOM':
      responseStyle = 'diagnostic';
      break;
    case 'DOUBT':
      responseStyle = 'confirmation';
      break;
    case 'FOLLOW_UP':
    case 'UNCLEAR':
      responseStyle = 'monitoring';
      break;
    case 'ACTION_REQUEST':
      responseStyle = 'advisory';
      break;
  }
  
  return {
    intent: maxIntent,
    confidence,
    matchedPatterns: [...new Set(allMatched)],
    subIntent,
    isQuestion: isQuestion(message),
    isUrgent: urgencyMatches.length > 0,
    language,
    responseStyle
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE STYLE GUIDELINES
// ═══════════════════════════════════════════════════════════════════════════

export interface ResponseGuideline {
  shouldAskClarification: boolean;
  clarificationQuestion?: string;
  responseApproach: string;
  maxActions: number;
}

/**
 * Get response guidelines based on message classification
 */
export function getResponseGuidelines(
  classification: MessageClassification,
  language: string
): ResponseGuideline {
  
  switch (classification.intent) {
    case 'OBSERVATION':
      // Farmer is describing what they see - acknowledge and interpret
      return {
        shouldAskClarification: false,
        responseApproach: 'Acknowledge observation, explain what it means, provide one primary action',
        maxActions: 1
      };
      
    case 'SYMPTOM':
      // Farmer is reporting a problem - diagnose and recommend
      return {
        shouldAskClarification: classification.confidence < 0.5,
        clarificationQuestion: getClarificationQuestion('SYMPTOM', language),
        responseApproach: 'Identify possible causes, explain reasoning, provide targeted action',
        maxActions: 2
      };
      
    case 'DOUBT':
      // Farmer wants confirmation - be clear and direct
      return {
        shouldAskClarification: false,
        responseApproach: 'Provide clear yes/no with reasoning based on current field data',
        maxActions: 1
      };
      
    case 'ACTION_REQUEST':
      // Farmer wants specific advice - provide it
      return {
        shouldAskClarification: false,
        responseApproach: 'Provide specific action with timing, quantity, and reasoning',
        maxActions: 3
      };
      
    case 'FOLLOW_UP':
      // Farmer is continuing previous conversation
      return {
        shouldAskClarification: true,
        clarificationQuestion: getClarificationQuestion('FOLLOW_UP', language),
        responseApproach: 'Reference previous advice, assess current state, provide next step',
        maxActions: 2
      };
      
    case 'UNCLEAR':
    default:
      // Mixed or unclear intent
      return {
        shouldAskClarification: true,
        clarificationQuestion: getClarificationQuestion('UNCLEAR', language),
        responseApproach: 'Ask for clarification before providing advice',
        maxActions: 0
      };
  }
}

function getClarificationQuestion(intent: FarmerMessageIntent, language: string): string {
  const questions: Record<string, Record<FarmerMessageIntent, string>> = {
    mr: {
      OBSERVATION: '',
      SYMPTOM: 'हे कधीपासून दिसत आहे? किती झाडांवर आहे?',
      DOUBT: '',
      ACTION_REQUEST: '',
      FOLLOW_UP: 'मागील सल्ला केला का? काय परिणाम झाला?',
      UNCLEAR: 'कृपया तुमची समस्या थोडी विस्ताराने सांगा.'
    },
    hi: {
      OBSERVATION: '',
      SYMPTOM: 'यह कब से दिख रहा है? कितने पौधों में है?',
      DOUBT: '',
      ACTION_REQUEST: '',
      FOLLOW_UP: 'पिछली सलाह अपनाई थी? क्या नतीजा हुआ?',
      UNCLEAR: 'कृपया अपनी समस्या थोड़ा विस्तार से बताएं।'
    },
    en: {
      OBSERVATION: '',
      SYMPTOM: 'When did you first notice this? How many plants are affected?',
      DOUBT: '',
      ACTION_REQUEST: '',
      FOLLOW_UP: 'Did you follow the previous advice? What was the result?',
      UNCLEAR: 'Please describe your concern in more detail.'
    }
  };
  
  const lang = questions[language] || questions.en;
  return lang[intent] || questions.en[intent];
}

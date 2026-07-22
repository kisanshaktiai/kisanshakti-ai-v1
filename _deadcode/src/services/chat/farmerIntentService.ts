/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER INTENT SERVICE - Land-Scoped, Intent-Aware Chat Resolution
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: This module implements OFFLINE-CAPABLE, DETERMINISTIC intent
 * detection for rural farmers asking unstructured questions.
 * 
 * The 4-Stage Pipeline:
 * 1. Land-Scoped Context (MANDATORY)
 * 2. Intent Inference (Symbolic + Tolerant)
 * 3. Full Decision Graph (UNCHANGED)
 * 4. Intent-Based Action Filtering (THIS FIX)
 * 
 * NON-NEGOTIABLE RULES:
 * ❌ Do NOT let AI decide actions
 * ❌ Do NOT return unrelated advice
 * ❌ Do NOT assume farmer questions are well-structured
 * ✅ Must work offline (no cloud NLP)
 * ✅ Must be deterministic and auditable
 */

import { Action, Cause, UnifiedAdvisory, RiskLevel } from '@/decision-graph/types-only';

// ═══════════════════════════════════════════════════════════════════════════
// FARMER INTENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FarmerIntent =
  | 'WATER'
  | 'NUTRIENT'
  | 'PEST'
  | 'WEED'
  | 'DISEASE'
  | 'GENERAL'
  | 'STATUS_CHECK'
  | 'WHEN'
  | 'WHY'
  | 'HARVEST';

export interface IntentInferenceResult {
  intent: FarmerIntent;
  confidence: number;        // 0.0 - 1.0
  matchedKeywords: string[];
  isAmbiguous: boolean;      // True if multiple intents scored similarly
  secondaryIntent?: FarmerIntent; // For combined questions like "when to water"
}

export interface IntentFilteredAdvisory {
  advisory: UnifiedAdvisory;
  filteredActions: UnifiedAdvisory['actions'];
  filteredOutActions: UnifiedAdvisory['actions'];
  hasRelevantActions: boolean;
  noActionReason?: string;    // Explanation when no action needed
  noActionExplanation?: string; // Detailed reason for no action
}

export interface ChatInteractionLog {
  land_id: string;
  farmer_question: string;
  inferred_intent: FarmerIntent;
  confidence: number;
  advisory_actions_returned: string[];
  advisory_actions_filtered_out: string[];
  risk_level: string;
  timestamp: string;
  offline_execution: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTILINGUAL INTENT PATTERNS (Offline-capable keyword matching)
// ═══════════════════════════════════════════════════════════════════════════

const INTENT_PATTERNS: Record<FarmerIntent, Record<string, string[]>> = {
  WATER: {
    en: [
      'water', 'irrigation', 'irrigate', 'drip', 'sprinkler', 'when to water', 
      'how much water', 'watering', 'moisture', 'dry', 'thirsty', 'rain',
      'should i water', 'need water', 'water stress'
    ],
    hi: [
      'पानी', 'सिंचाई', 'कब पानी', 'कितना पानी', 'पानी देना', 'पानी की जरूरत', 
      'ड्रिप', 'स्प्रिंकलर', 'सूखा', 'नमी', 'बारिश', 'पानी दें', 'सिंचाई करें',
      'पानी डालना', 'पानी लगाना'
    ],
    mr: [
      'पाणी', 'सिंचन', 'कधी पाणी', 'किती पाणी', 'पाणी द्यावे', 'पाणी द्या',
      'ड्रिप', 'फवारा', 'कोरडे', 'ओलावा', 'पाऊस', 'पाणी देणे', 'सिंचन करावे'
    ],
    ta: ['நீர்', 'நீர்ப்பாசனம்', 'எப்போது நீர்', 'தண்ணீர்', 'பாசனம்'],
    te: ['నీరు', 'నీటిపారుదల', 'ఎప్పుడు నీరు', 'నీళ్ళు'],
    kn: ['ನೀರು', 'ನೀರಾವರಿ', 'ಯಾವಾಗ ನೀರು']
  },
  
  NUTRIENT: {
    en: [
      'fertilizer', 'npk', 'urea', 'dap', 'nutrient', 'manure', 'compost', 
      'deficiency', 'nitrogen', 'phosphorus', 'potassium', 'yellowing leaves',
      'feed', 'nourishment', 'organic', 'chemical', 'potash', 'zinc', 'micronutrient'
    ],
    hi: [
      'खाद', 'उर्वरक', 'यूरिया', 'डीएपी', 'पोषक', 'गोबर', 'कंपोस्ट', 'नाइट्रोजन', 
      'फास्फोरस', 'पोटाश', 'कौनसी खाद', 'कितनी खाद', 'खाद डालें', 'खाद देना',
      'पत्ते पीले', 'कमी', 'जैविक खाद', 'रासायनिक खाद'
    ],
    mr: [
      'खत', 'युरिया', 'डीएपी', 'पोषक', 'शेण', 'कंपोस्ट', 'नायट्रोजन',
      'कोणते खत', 'किती खत', 'खत द्या', 'खत देणे', 'पाने पिवळी', 'कमतरता',
      'सेंद्रिय खत', 'रासायनिक खत', 'स्फुरद', 'पालाश'
    ],
    ta: ['உரம்', 'என்பிகே', 'யூரியா', 'டிஏபி', 'ஊட்டச்சத்து'],
    te: ['ఎరువు', 'ఎన్పీకే', 'యూరియా', 'డిఏపి', 'పోషకాలు'],
    kn: ['ಗೊಬ್ಬರ', 'ಎನ್‌ಪಿಕೆ', 'ಯೂರಿಯಾ', 'ಡಿಎಪಿ', 'ಪೋಷಕಾಂಶ']
  },
  
  PEST: {
    en: [
      'pest', 'insect', 'bug', 'worm', 'caterpillar', 'spray', 'pesticide',
      'attack', 'infestation', 'bollworm', 'aphid', 'mite', 'thrips', 'borer',
      'eating leaves', 'holes in leaves', 'insects on plant', 'kill insects',
      'dead heart', 'shoot borer', 'stem borer', 'top borer'
    ],
    hi: [
      'कीट', 'कीड़े', 'कीड़ा', 'इल्ली', 'स्प्रे', 'कीटनाशक', 'दवाई', 'हमला',
      'बॉलवर्म', 'एफिड', 'माहू', 'फसल खा रहे', 'छेद', 'कीड़ा लगा', 'कीड़े मारना',
      'गभ सुख', 'शूट बोरर', 'तना छेदक', 'शीर्ष छेदक', 'मध्य पत्ती सूख'
    ],
    mr: [
      'किडे', 'किटक', 'किडा', 'अळी', 'फवारणी', 'किटकनाशक', 'औषध', 'हल्ला',
      'बोंडअळी', 'माव', 'पाने खात', 'भोके', 'किडा लागला', 'किडे मारणे',
      'मधली सुरळी', 'सुरळी वाळ', 'गाभा मेला', 'खोड पोखरणारी अळी', 'शेंडा पोखरणारी',
      'शूट बोरर', 'स्टेम बोरर', 'टॉप बोरर', 'गाभा वाळ'
    ],
    ta: ['பூச்சி', 'பூச்சிக்கொல்லி', 'தாக்குதல்', 'புழு'],
    te: ['చీడపురుగు', 'పురుగు', 'క్రిమి సంహారిణి', 'దాడి'],
    kn: ['ಕೀಟ', 'ಕೀಟನಾಶಕ', 'ಹುಳು', 'ದಾಳಿ']
  },
  
  WEED: {
    en: [
      'weed', 'weeding', 'grass', 'unwanted plants', 'herbicide', 'clear field',
      'remove grass', 'weed control', 'khurpi', 'hoe', 'weeder'
    ],
    hi: [
      'खरपतवार', 'घास', 'निराई', 'गुड़ाई', 'खरपतवारनाशक', 'घास हटाना',
      'खेत साफ', 'खुरपी', 'निंदाई', 'अवांछित पौधे'
    ],
    mr: [
      'तण', 'गवत', 'निंदणी', 'तणनाशक', 'शेत साफ', 'गवत काढणे',
      'खुरपी', 'निंदणी करणे', 'अनावश्यक झाडे'
    ],
    ta: ['களை', 'களைக்கொல்லி', 'புல்'],
    te: ['కలుపు', 'కలుపు మందు', 'గడ్డి'],
    kn: ['ಕಳೆ', 'ಕಳೆನಾಶಕ', 'ಹುಲ್ಲು']
  },
  
  DISEASE: {
    en: [
      'disease', 'fungus', 'blight', 'rust', 'wilt', 'rot', 'mold', 'fungicide',
      'spots on leaves', 'black spots', 'brown spots', 'powdery', 'downy',
      'dying', 'withering', 'plant sick', 'infection', 'yellowing', 'yellow leaves'
    ],
    hi: [
      'रोग', 'बीमारी', 'फफूंद', 'ब्लाइट', 'रस्ट', 'विल्ट', 'सड़न', 'फफूंदनाशक',
      'पत्तों पर धब्बे', 'काले धब्बे', 'भूरे धब्बे', 'पाउडरी', 'मुरझाना',
      'पौधा बीमार', 'संक्रमण', 'करपा', 'पत्ते पीले'
    ],
    mr: [
      'रोग', 'आजार', 'बुरशी', 'करपा', 'तांबेरा', 'मर', 'कुज', 'बुरशीनाशक',
      'पानांवर डाग', 'काळे डाग', 'तपकिरी डाग', 'कोमेजणे', 'झाड आजारी', 'संसर्ग',
      'पाने पिवळी', 'पिवळी पडत'
    ],
    ta: ['நோய்', 'பூஞ்சை', 'வாடல்'],
    te: ['వ్యాధి', 'శిలీంద్రం', 'వాడిపోవడం'],
    kn: ['ರೋಗ', 'ಶಿಲೀಂಧ್ರ', 'ಬಾಡುವಿಕೆ']
  },
  
  HARVEST: {
    en: [
      'harvest', 'ready to harvest', 'when to harvest', 'cutting', 'reaping',
      'mature', 'ripe', 'harvesting time', 'yield', 'pluck', 'pick'
    ],
    hi: [
      'कटाई', 'कब काटें', 'कटाई का समय', 'पका', 'तैयार', 'कब तोड़ें',
      'फसल तैयार', 'उपज', 'पकना', 'कटाई करें'
    ],
    mr: [
      'कापणी', 'कधी कापावे', 'कापणीची वेळ', 'पिकले', 'तयार', 'कधी काढावे',
      'पीक तयार', 'उत्पादन', 'पिकणे', 'काढणी'
    ],
    ta: ['அறுவடை', 'எப்போது அறுவடை', 'பக்குவம்'],
    te: ['పంట కోత', 'ఎప్పుడు కోయాలి', 'పండిన'],
    kn: ['ಕೊಯ್ಲು', 'ಯಾವಾಗ ಕೊಯ್ಯಬೇಕು', 'ಪಕ್ವ']
  },
  
  STATUS_CHECK: {
    en: [
      'how is crop', 'crop status', 'is crop okay', 'crop doing', 'crop condition',
      'plant health', 'how is my', 'is everything okay', 'check', 'status',
      'doing well', 'growing properly', 'any problem', 'any issue'
    ],
    hi: [
      'फसल कैसी है', 'फसल की स्थिति', 'पौधा कैसा', 'क्या सब ठीक', 'कोई समस्या',
      'कैसी है मेरी', 'बढ़ रही है', 'ठीक है क्या', 'स्थिति', 'हालत'
    ],
    mr: [
      'पीक कशी आहे', 'पिकाची स्थिती', 'झाड कसे', 'सगळे ठीक', 'काही समस्या',
      'माझे पीक', 'वाढत आहे', 'ठीक आहे का', 'स्थिती', 'हालत'
    ],
    ta: ['பயிர் எப்படி', 'நிலை என்ன', 'நன்றாக உள்ளதா'],
    te: ['పంట ఎలా ఉంది', 'స్థితి ఏమిటి', 'బాగుందా'],
    kn: ['ಬೆಳೆ ಹೇಗಿದೆ', 'ಸ್ಥಿತಿ ಏನು', 'ಚೆನ್ನಾಗಿದೆಯೇ']
  },
  
  WHEN: {
    en: [
      'when should', 'when to', 'what time', 'which day', 'best time',
      'right time', 'schedule', 'timing', 'after how many days'
    ],
    hi: [
      'कब', 'किस समय', 'कौन से दिन', 'सही समय', 'कब करें', 'कब देना',
      'कितने दिन बाद', 'समय', 'टाइमिंग'
    ],
    mr: [
      'कधी', 'कोणत्या वेळी', 'कोणत्या दिवशी', 'योग्य वेळ', 'कधी करावे',
      'किती दिवसांनी', 'वेळ', 'टायमिंग'
    ],
    ta: ['எப்போது', 'எந்த நேரம்', 'சரியான நேரம்'],
    te: ['ఎప్పుడు', 'ఏ సమయంలో', 'సరైన సమయం'],
    kn: ['ಯಾವಾಗ', 'ಯಾವ ಸಮಯ', 'ಸರಿಯಾದ ಸಮಯ']
  },
  
  WHY: {
    en: [
      'why', 'reason', 'cause', 'because', 'what happened', 'problem is',
      'issue is', 'why is my', 'what is wrong', 'explain'
    ],
    hi: [
      'क्यों', 'कारण', 'वजह', 'ऐसा क्यों', 'क्या हुआ', 'समस्या क्या',
      'क्या गलत', 'समझाओ', 'बताओ क्यों'
    ],
    mr: [
      'का', 'कारण', 'का होत', 'काय झाले', 'समस्या काय', 'काय चुकले',
      'समजावून सांगा', 'का सांगा'
    ],
    ta: ['ஏன்', 'காரணம்', 'என்ன நடந்தது'],
    te: ['ఎందుకు', 'కారణం', 'ఏమి జరిగింది'],
    kn: ['ಯಾಕೆ', 'ಕಾರಣ', 'ಏನಾಯಿತು']
  },
  
  GENERAL: {
    en: [
      'hello', 'hi', 'namaste', 'help', 'what can you do', 'today', 'advice',
      'suggest', 'recommend', 'what should i do', 'tell me', 'aaj', 'kya karu'
    ],
    hi: [
      'नमस्ते', 'हेलो', 'हाय', 'मदद', 'आज', 'सलाह', 'क्या करें', 'क्या करूं',
      'बताओ', 'सुझाव', 'आज क्या करना है', 'काय करू'
    ],
    mr: [
      'नमस्कार', 'हॅलो', 'मदत', 'आज', 'सल्ला', 'काय करावे', 'काय करू',
      'सांगा', 'सुचवा', 'आज काय करायचे'
    ],
    ta: ['வணக்கம்', 'ஹலோ', 'உதவி', 'இன்று', 'ஆலோசனை'],
    te: ['నమస్కారం', 'హలో', 'సహాయం', 'ఈరోజు', 'సలహా'],
    kn: ['ನಮಸ್ಕಾರ', 'ಹಲೋ', 'ಸಹಾಯ', 'ಇಂದು', 'ಸಲಹೆ']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INTENT INFERENCE ENGINE (Offline-capable, deterministic)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Infer farmer's intent from their question using symbolic keyword matching.
 * 
 * CRITICAL: This is OFFLINE-CAPABLE - no cloud NLP services.
 * Works even in rural areas with no internet.
 */
/**
 * ✅ ENHANCED 2030-READY: Infer farmer's intent with improved confidence scoring
 * 
 * IMPROVEMENTS:
 * 1. Compound intent detection ("when to water" = WHEN + WATER → WATER with high confidence)
 * 2. Higher weight for multi-word phrase matches
 * 3. Boost for exact phrase matches
 * 4. Better handling of follow-up questions
 */
export function inferFarmerIntent(
  question: string,
  language: string = 'en'
): IntentInferenceResult {
  const normalizedQuestion = question.toLowerCase().trim();
  
  // Score each intent type
  const scores: Record<FarmerIntent, { score: number; keywords: string[] }> = {
    WATER: { score: 0, keywords: [] },
    NUTRIENT: { score: 0, keywords: [] },
    PEST: { score: 0, keywords: [] },
    WEED: { score: 0, keywords: [] },
    DISEASE: { score: 0, keywords: [] },
    HARVEST: { score: 0, keywords: [] },
    STATUS_CHECK: { score: 0, keywords: [] },
    WHEN: { score: 0, keywords: [] },
    WHY: { score: 0, keywords: [] },
    GENERAL: { score: 0, keywords: [] }
  };
  
  // ✅ NEW: Compound intent patterns (these get HIGHEST priority)
  const compoundPatterns: Array<{ pattern: RegExp; primary: FarmerIntent; secondary: FarmerIntent; boost: number }> = [
    // Water timing patterns
    { pattern: /when.*(water|irrigat|पानी|सिंचाई|पाणी)/i, primary: 'WATER', secondary: 'WHEN', boost: 5 },
    { pattern: /(water|irrigat|पानी|सिंचाई|पाणी).*when/i, primary: 'WATER', secondary: 'WHEN', boost: 5 },
    { pattern: /how\s+much\s+(water|पानी|पाणी)/i, primary: 'WATER', secondary: 'WHEN', boost: 6 },
    { pattern: /(कितना|किती)\s*(पानी|पाणी)/i, primary: 'WATER', secondary: 'WHEN', boost: 6 },
    { pattern: /(कब|कधी)\s*(पानी|पाणी)/i, primary: 'WATER', secondary: 'WHEN', boost: 6 },
    
    // Fertilizer timing patterns
    { pattern: /when.*(fertiliz|खाद|खत|urea|dap)/i, primary: 'NUTRIENT', secondary: 'WHEN', boost: 5 },
    { pattern: /(fertiliz|खाद|खत|urea|dap).*when/i, primary: 'NUTRIENT', secondary: 'WHEN', boost: 5 },
    { pattern: /how\s+much\s+(fertiliz|खाद|खत)/i, primary: 'NUTRIENT', secondary: 'WHEN', boost: 6 },
    { pattern: /(कितनी|किती)\s*(खाद|खत)/i, primary: 'NUTRIENT', secondary: 'WHEN', boost: 6 },
    { pattern: /(कौनसी|कोणते)\s*(खाद|खत)/i, primary: 'NUTRIENT', secondary: 'WHEN', boost: 6 },
    
    // Pest patterns
    { pattern: /how.*(spray|pest|कीट|किड)/i, primary: 'PEST', secondary: 'WHEN', boost: 5 },
    { pattern: /(spray|pest|कीट|किड).*(when|how)/i, primary: 'PEST', secondary: 'WHEN', boost: 5 },
    
    // Harvest patterns
    { pattern: /when.*(harvest|कटाई|कापणी)/i, primary: 'HARVEST', secondary: 'WHEN', boost: 5 },
    
    // Why patterns
    { pattern: /why.*(yellow|पीला|पिवळ)/i, primary: 'DISEASE', secondary: 'WHY', boost: 5 },
    { pattern: /why.*(dry|सूख|कोरड)/i, primary: 'WATER', secondary: 'WHY', boost: 5 }
  ];
  
  // ✅ Check compound patterns first (highest priority)
  let compoundMatch: { primary: FarmerIntent; secondary: FarmerIntent } | null = null;
  for (const cp of compoundPatterns) {
    if (cp.pattern.test(normalizedQuestion)) {
      scores[cp.primary].score += cp.boost;
      scores[cp.secondary].score += 2;
      scores[cp.primary].keywords.push(`compound: ${cp.pattern.toString()}`);
      compoundMatch = { primary: cp.primary, secondary: cp.secondary };
      console.log(`🎯 [Intent] Compound match: ${cp.primary} + ${cp.secondary} (boost: ${cp.boost})`);
      break; // Use first compound match
    }
  }
  
  // Check patterns for each intent
  for (const [intent, langPatterns] of Object.entries(INTENT_PATTERNS) as [FarmerIntent, Record<string, string[]>][]) {
    // Try current language first, then fallback to English
    const patterns = langPatterns[language] || langPatterns.en || [];
    
    for (const pattern of patterns) {
      if (normalizedQuestion.includes(pattern.toLowerCase())) {
        // ✅ IMPROVED: Weight by phrase length with multiplier
        const phraseLength = pattern.split(' ').length;
        const scoreBoost = phraseLength * 1.5; // Higher weight for phrases
        scores[intent].score += scoreBoost;
        
        if (!scores[intent].keywords.includes(pattern)) {
          scores[intent].keywords.push(pattern);
        }
      }
    }
    
    // Also check English patterns for multilingual support
    if (language !== 'en' && langPatterns.en) {
      for (const pattern of langPatterns.en) {
        if (normalizedQuestion.includes(pattern.toLowerCase())) {
          const phraseLength = pattern.split(' ').length;
          scores[intent].score += phraseLength * 0.8; // Slightly less weight for English fallback
          if (!scores[intent].keywords.includes(pattern)) {
            scores[intent].keywords.push(pattern);
          }
        }
      }
    }
  }
  
  // Find the highest scoring intent
  let primaryIntent: FarmerIntent = 'GENERAL';
  let primaryScore = 0;
  let secondaryIntent: FarmerIntent | undefined;
  let secondaryScore = 0;
  
  for (const [intent, data] of Object.entries(scores) as [FarmerIntent, { score: number; keywords: string[] }][]) {
    if (data.score > primaryScore) {
      // Shift current primary to secondary
      if (primaryScore > 0) {
        secondaryIntent = primaryIntent;
        secondaryScore = primaryScore;
      }
      primaryIntent = intent;
      primaryScore = data.score;
    } else if (data.score > secondaryScore) {
      secondaryIntent = intent;
      secondaryScore = data.score;
    }
  }
  
  // ✅ IMPROVED: Better handling of WHEN/WHY as modifiers
  // If WHEN or WHY is primary and a specific topic is secondary, swap them
  if ((primaryIntent === 'WHEN' || primaryIntent === 'WHY') && secondaryIntent) {
    const topicIntents: FarmerIntent[] = ['WATER', 'NUTRIENT', 'PEST', 'WEED', 'DISEASE', 'HARVEST'];
    if (topicIntents.includes(secondaryIntent)) {
      // Keep the topic as primary, timing/reason as secondary
      const temp = primaryIntent;
      primaryIntent = secondaryIntent;
      secondaryIntent = temp;
      // ✅ Also swap scores
      const tempScore = primaryScore;
      primaryScore = secondaryScore;
      secondaryScore = tempScore;
    }
  }
  
  // ✅ IMPROVED: Better confidence calculation
  // Use logarithmic scaling for more realistic confidence
  const minConfidenceScore = 3; // Minimum score for 50% confidence
  let confidence: number;
  
  if (primaryScore >= 8) {
    confidence = 0.95; // Very high confidence
  } else if (primaryScore >= 5) {
    confidence = 0.7 + (primaryScore - 5) * 0.05; // 70-85%
  } else if (primaryScore >= minConfidenceScore) {
    confidence = 0.5 + (primaryScore - minConfidenceScore) * 0.1; // 50-70%
  } else if (primaryScore > 0) {
    confidence = 0.3 + (primaryScore / minConfidenceScore) * 0.2; // 30-50%
  } else {
    confidence = 0.1; // Fallback
  }
  
  // ✅ IMPROVED: Only reduce for truly ambiguous cases
  const isAmbiguous = secondaryScore > 0 && (primaryScore - secondaryScore) < 1.5;
  if (isAmbiguous && !compoundMatch) {
    confidence *= 0.8; // Less aggressive reduction
  }
  
  console.log(`🎯 [Intent Inference] Question: "${question.substring(0, 50)}..."`, {
    primaryIntent,
    primaryScore: Math.round(primaryScore * 10) / 10,
    confidence: Math.round(confidence * 100),
    matchedKeywords: scores[primaryIntent].keywords.slice(0, 5),
    secondaryIntent,
    isAmbiguous,
    hasCompoundMatch: !!compoundMatch
  });
  
  return {
    intent: primaryIntent,
    confidence,
    matchedKeywords: scores[primaryIntent].keywords,
    isAmbiguous,
    secondaryIntent: secondaryScore > 0 ? secondaryIntent : undefined
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CATEGORY MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_CATEGORIES: Record<FarmerIntent, Action[]> = {
  WATER: [
    Action.IRRIGATE_IMMEDIATELY,
    Action.IRRIGATE_LIGHT,
    Action.IRRIGATE_HEAVY,
    Action.EMERGENCY_IRRIGATION,
    Action.DRAIN_FIELD
  ],
  NUTRIENT: [
    Action.APPLY_NITROGEN,
    Action.APPLY_PHOSPHORUS,
    Action.APPLY_POTASSIUM,
    Action.APPLY_ZINC,
    Action.APPLY_ORGANIC_MANURE,
    Action.APPLY_MICRONUTRIENTS
  ],
  PEST: [
    Action.APPLY_INSECTICIDE,
    Action.APPLY_NEEM_OIL,
    Action.APPLY_BIO_CONTROL,
    Action.INSTALL_PHEROMONE_TRAPS,
    Action.INSTALL_TRAPS
  ],
  WEED: [
    // Weed-related actions - use monitoring as proxy
    Action.MONITOR_CLOSELY
  ],
  DISEASE: [
    Action.APPLY_FUNGICIDE,
    Action.APPLY_TRICHODERMA
  ],
  HARVEST: [
    Action.EARLY_HARVEST,
    Action.SALVAGE_HARVEST
  ],
  STATUS_CHECK: [], // Returns current status, no specific actions
  WHEN: [],         // Timing question - uses all actions
  WHY: [],          // Explanation question - uses all causes
  GENERAL: []       // All actions
};

const CAUSE_CATEGORIES: Record<FarmerIntent, string[]> = {
  WATER: ['WATER', 'MOISTURE', 'IRRIGATION', 'DROUGHT', 'DRY'],
  NUTRIENT: ['NITROGEN', 'PHOSPHORUS', 'POTASSIUM', 'NUTRIENT', 'DEFICIENCY'],
  PEST: ['PEST', 'INSECT', 'WORM', 'APHID', 'BOLLWORM', 'MITE', 'THRIPS', 'BORER'],
  WEED: ['WEED'],
  DISEASE: ['DISEASE', 'FUNGUS', 'BLAST', 'RUST', 'BLIGHT', 'WILT', 'ROT'],
  HARVEST: ['HARVEST', 'MATURE', 'READY'],
  STATUS_CHECK: ['OPTIMAL', 'STRESS', 'DEFICIENCY', 'RISK'],
  WHEN: [],
  WHY: [],
  GENERAL: []
};

// ═══════════════════════════════════════════════════════════════════════════
// INTENT-BASED ACTION FILTERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter advisory actions based on farmer's intent.
 * 
 * CRITICAL: This is the FIX for "same answer to every question" bug.
 * Different intents now get different, relevant answers.
 */
export function filterActionsByIntent(
  advisory: UnifiedAdvisory,
  intentResult: IntentInferenceResult,
  language: string = 'en'
): IntentFilteredAdvisory {
  const { intent, secondaryIntent } = intentResult;
  
  // For GENERAL, WHEN with no secondary, or low confidence, return all actions
  if (intent === 'GENERAL' || (intent === 'WHEN' && !secondaryIntent)) {
    return {
      advisory,
      filteredActions: advisory.actions,
      filteredOutActions: [],
      hasRelevantActions: advisory.actions.length > 0
    };
  }
  
  // Get relevant action categories for the intent
  const relevantActionSet = new Set(ACTION_CATEGORIES[intent] || []);
  
  // For STATUS_CHECK, return monitoring actions + current status
  if (intent === 'STATUS_CHECK') {
    const monitoringActions = advisory.actions.filter(a => 
      a.action === Action.MONITOR_CLOSELY || 
      a.action === Action.WAIT_AND_WATCH || 
      a.action === Action.CONTINUE_CURRENT
    );
    
    // If no specific monitoring actions, return top 2 priority actions as status
    const statusActions = monitoringActions.length > 0 
      ? monitoringActions 
      : advisory.actions.slice(0, 2);
    
    return {
      advisory,
      filteredActions: statusActions,
      filteredOutActions: advisory.actions.filter(a => !statusActions.includes(a)),
      hasRelevantActions: true // Always has status
    };
  }
  
  // For WHY questions, include all actions but emphasize causes
  if (intent === 'WHY') {
    return {
      advisory,
      filteredActions: advisory.actions,
      filteredOutActions: [],
      hasRelevantActions: advisory.actions.length > 0
    };
  }
  
  // Filter actions by category
  const filteredActions = advisory.actions.filter(a => relevantActionSet.has(a.action));
  const filteredOutActions = advisory.actions.filter(a => !relevantActionSet.has(a.action));
  
  // Filter causes by category
  const relevantCausePatterns = CAUSE_CATEGORIES[intent] || [];
  const relevantCauses = relevantCausePatterns.length > 0
    ? advisory.causes.filter(c => 
        relevantCausePatterns.some(pattern => c.toString().includes(pattern))
      )
    : advisory.causes;
  
  // Check if we found relevant actions
  if (filteredActions.length > 0) {
    return {
      advisory: {
        ...advisory,
        actions: filteredActions,
        causes: relevantCauses.length > 0 ? relevantCauses : advisory.causes
      },
      filteredActions,
      filteredOutActions,
      hasRelevantActions: true
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NO ACTION FOUND FOR THIS INTENT - Generate safe "no action needed" response
  // ═══════════════════════════════════════════════════════════════════════════
  
  const noActionMessages = getNoActionMessages(intent, advisory, language);
  
  return {
    advisory: {
      ...advisory,
      actions: [], // No actions for this intent
      causes: relevantCauses
    },
    filteredActions: [],
    filteredOutActions: advisory.actions, // All original actions were for other intents
    hasRelevantActions: false,
    noActionReason: noActionMessages.reason,
    noActionExplanation: noActionMessages.explanation
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFE "NO ACTION NEEDED" MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

interface NoActionMessages {
  reason: string;
  explanation: string;
}

function getNoActionMessages(
  intent: FarmerIntent,
  advisory: UnifiedAdvisory,
  language: string
): NoActionMessages {
  const messages: Record<string, Record<FarmerIntent, NoActionMessages>> = {
    en: {
      WATER: {
        reason: 'No irrigation action required at this time.',
        explanation: 'Soil moisture levels are adequate. Continue monitoring for the next 5-7 days.'
      },
      NUTRIENT: {
        reason: 'No fertilizer application needed right now.',
        explanation: 'Nutrient levels in your soil are sufficient for current crop stage.'
      },
      PEST: {
        reason: 'No pest control action required.',
        explanation: 'No significant pest pressure detected. Regular monitoring is recommended.'
      },
      WEED: {
        reason: 'No immediate weeding required.',
        explanation: 'Weed levels are manageable. Continue routine field inspection.'
      },
      DISEASE: {
        reason: 'No disease treatment needed.',
        explanation: 'No disease symptoms detected. Maintain good field hygiene.'
      },
      HARVEST: {
        reason: 'Crop is not ready for harvest yet.',
        explanation: 'Continue current practices and wait for optimal maturity.'
      },
      STATUS_CHECK: {
        reason: 'Crop is growing normally.',
        explanation: 'No immediate issues detected. Continue regular monitoring.'
      },
      WHEN: {
        reason: 'No specific timing advice available.',
        explanation: 'Current conditions are stable. Follow standard agricultural calendar.'
      },
      WHY: {
        reason: 'No specific cause identified.',
        explanation: 'Current conditions appear normal for this crop stage.'
      },
      GENERAL: {
        reason: 'No immediate action needed.',
        explanation: 'Crop is in good condition. Continue regular farming practices.'
      }
    },
    hi: {
      WATER: {
        reason: 'अभी सिंचाई की जरूरत नहीं है।',
        explanation: 'मिट्टी में नमी पर्याप्त है। अगले 5-7 दिन निगरानी जारी रखें।'
      },
      NUTRIENT: {
        reason: 'अभी खाद देने की जरूरत नहीं है।',
        explanation: 'फसल की वर्तमान अवस्था के लिए पोषक तत्व पर्याप्त हैं।'
      },
      PEST: {
        reason: 'कीट नियंत्रण की जरूरत नहीं है।',
        explanation: 'कोई कीट हमला नहीं पाया गया। नियमित निगरानी जारी रखें।'
      },
      WEED: {
        reason: 'अभी निराई की जरूरत नहीं है।',
        explanation: 'खरपतवार नियंत्रण में है। नियमित जांच जारी रखें।'
      },
      DISEASE: {
        reason: 'रोग उपचार की जरूरत नहीं है।',
        explanation: 'कोई रोग लक्षण नहीं पाया गया। खेत की साफ-सफाई बनाए रखें।'
      },
      HARVEST: {
        reason: 'फसल अभी कटाई के लिए तैयार नहीं है।',
        explanation: 'वर्तमान तरीके जारी रखें और पकने का इंतजार करें।'
      },
      STATUS_CHECK: {
        reason: 'फसल सामान्य रूप से बढ़ रही है।',
        explanation: 'कोई तत्काल समस्या नहीं। नियमित निगरानी जारी रखें।'
      },
      WHEN: {
        reason: 'अभी कोई विशेष समय सलाह नहीं।',
        explanation: 'मानक कृषि कैलेंडर का पालन करें।'
      },
      WHY: {
        reason: 'कोई विशेष कारण नहीं पाया गया।',
        explanation: 'फसल की वर्तमान स्थिति सामान्य है।'
      },
      GENERAL: {
        reason: 'अभी कोई तत्काल कार्रवाई नहीं।',
        explanation: 'फसल अच्छी स्थिति में है। नियमित खेती जारी रखें।'
      }
    },
    mr: {
      WATER: {
        reason: 'आत्ता पाण्याची गरज नाही।',
        explanation: 'मातीत पुरेसा ओलावा आहे। पुढील 5-7 दिवस निरीक्षण करा।'
      },
      NUTRIENT: {
        reason: 'आत्ता खत देण्याची गरज नाही।',
        explanation: 'पिकाच्या सध्याच्या अवस्थेसाठी पोषक तत्वे पुरेशी आहेत।'
      },
      PEST: {
        reason: 'कीड नियंत्रणाची गरज नाही।',
        explanation: 'किडीचा कोणताही हल्ला आढळला नाही। नियमित निरीक्षण सुरू ठेवा।'
      },
      WEED: {
        reason: 'आत्ता निंदणीची गरज नाही।',
        explanation: 'तण नियंत्रणात आहे। नियमित तपासणी सुरू ठेवा।'
      },
      DISEASE: {
        reason: 'रोग उपचाराची गरज नाही।',
        explanation: 'कोणतीही रोग लक्षणे आढळली नाहीत। शेताची स्वच्छता राखा।'
      },
      HARVEST: {
        reason: 'पीक अजून कापणीसाठी तयार नाही।',
        explanation: 'सध्याच्या पद्धती सुरू ठेवा आणि पिकण्याची वाट पहा।'
      },
      STATUS_CHECK: {
        reason: 'पीक सामान्यपणे वाढत आहे।',
        explanation: 'कोणतीही तात्काळ समस्या नाही। नियमित निरीक्षण सुरू ठेवा।'
      },
      WHEN: {
        reason: 'आत्ता कोणताही विशेष वेळेचा सल्ला नाही।',
        explanation: 'मानक कृषी दिनदर्शिकेचे पालन करा।'
      },
      WHY: {
        reason: 'कोणतेही विशेष कारण आढळले नाही।',
        explanation: 'पिकाची सध्याची स्थिती सामान्य आहे।'
      },
      GENERAL: {
        reason: 'आत्ता कोणतीही तात्काळ कारवाई नाही।',
        explanation: 'पीक चांगल्या स्थितीत आहे। नियमित शेती सुरू ठेवा।'
      }
    }
  };
  
  const langMessages = messages[language] || messages.en;
  return langMessages[intent] || langMessages.GENERAL;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAT INTERACTION LOGGING (For future training)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a log entry for this chat interaction.
 * This data is used for future AI training and intent analysis.
 */
export function createChatInteractionLog(
  landId: string,
  question: string,
  intentResult: IntentInferenceResult,
  filteredAdvisory: IntentFilteredAdvisory,
  isOffline: boolean = false
): ChatInteractionLog {
  return {
    land_id: landId,
    farmer_question: question,
    inferred_intent: intentResult.intent,
    confidence: intentResult.confidence,
    advisory_actions_returned: filteredAdvisory.filteredActions.map(a => a.action.toString()),
    advisory_actions_filtered_out: filteredAdvisory.filteredOutActions.map(a => a.action.toString()),
    risk_level: filteredAdvisory.advisory.risk_level.toString(),
    timestamp: new Date().toISOString(),
    offline_execution: isOffline
  };
}

/**
 * Log chat interaction to database for training data collection.
 * Non-blocking - failures are logged but don't affect user experience.
 */
export async function logChatInteraction(
  log: ChatInteractionLog,
  supabaseClient?: any
): Promise<void> {
  if (!supabaseClient) {
    console.log(`📊 [Chat Log] No supabase client - storing locally`, log);
    // Store in localStorage for later sync
    try {
      const existingLogs = JSON.parse(localStorage.getItem('chat_interaction_logs') || '[]');
      existingLogs.push(log);
      // Keep only last 100 logs locally
      if (existingLogs.length > 100) existingLogs.shift();
      localStorage.setItem('chat_interaction_logs', JSON.stringify(existingLogs));
    } catch (e) {
      console.warn('Failed to store chat log locally:', e);
    }
    return;
  }
  
  try {
    // Insert into advisory_audit_log or a dedicated chat_training_logs table
    const { error } = await supabaseClient.from('advisory_audit_log').insert({
      advisory_id: crypto.randomUUID(),
      land_id: log.land_id,
      input_snapshot: {
        farmer_question: log.farmer_question,
        inferred_intent: log.inferred_intent,
        confidence: log.confidence,
        offline_execution: log.offline_execution
      },
      actions: log.advisory_actions_returned,
      causes: [],
      risk_level: log.risk_level,
      confidence: log.confidence,
      rules_applied: [],
      engine_version: 'intent-aware-v1',
      generated_offline: log.offline_execution,
      generated_at: log.timestamp,
      reasoning_trace: [
        `Intent: ${log.inferred_intent}`,
        `Actions Returned: ${log.advisory_actions_returned.length}`,
        `Actions Filtered Out: ${log.advisory_actions_filtered_out.length}`
      ]
    });
    
    if (error) {
      console.warn(`⚠️ [Chat Log] Failed to log interaction:`, error);
    } else {
      console.log(`✅ [Chat Log] Logged interaction for training`);
    }
  } catch (e) {
    console.warn(`⚠️ [Chat Log] Exception logging interaction:`, e);
  }
}

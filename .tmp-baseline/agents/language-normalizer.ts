// STAGE 1: LANGUAGE NORMALIZER (LLM, FLEXIBLE)

export const LANGUAGE_NORMALIZER_VERSION = '1.0.0';

// TYPE DEFINITIONS

export interface NormalizedInput {
  original_text: string;
  normalized_text: string;
  detected_language: string;
  removed_elements: string[];
  word_count: number;
  has_agricultural_content: boolean;
}

// EMOTION & FILLER PATTERNS TO REMOVE

const EMOTION_PATTERNS: Record<string, string[]> = {
  mr: [
    'कृपया मदत करा', 'मदत करा', 'प्लीज', 'कृपया', 'मला सांगा',
    'माझे पीक वाचवा', 'मला मदत हवी आहे', 'खूप त्रास होतोय',
    'काय करू', 'कसं करू', 'खूप टेन्शन', 'चिंता वाटते',
    'घाबरलोय', 'भीती वाटते', 'खूप नुकसान', 'सगळं खराब',
    'ताबडतोब सांगा', 'लवकर मदत करा'
  ],
  hi: [
    'कृपया मदद करें', 'मदद करें', 'प्लीज', 'कृपया', 'मुझे बताएं',
    'मेरी फसल बचाओ', 'मुझे मदद चाहिए', 'बहुत परेशानी है',
    'क्या करूं', 'कैसे करूं', 'बहुत टेंशन', 'चिंता हो रही है',
    'डर लगता है', 'बहुत नुकसान', 'सब खराब',
    'तुरंत बताओ', 'जल्दी मदद करो'
  ],
  en: [
    'please help', 'help me', 'please', 'help',
    'save my crop', 'i need help', 'very worried',
    'what to do', 'how to do', 'very tensed', 'worried about',
    'scared', 'afraid', 'big loss', 'everything ruined',
    'urgently', 'immediately help'
  ]
};

const GREETING_PATTERNS: Record<string, string[]> = {
  mr: [
    'नमस्कार', 'नमस्ते', 'हॅलो', 'हाय', 'शुभ सकाळ', 'शुभ दुपार', 'शुभ संध्याकाळ',
    'जय हिंद', 'जय महाराष्ट्र', 'जय भवानी'
  ],
  hi: [
    'नमस्कार', 'नमस्ते', 'हैलो', 'हाय', 'शुभ प्रभात', 'शुभ दोपहर', 'शुभ संध्या',
    'जय हिंद', 'प्रणाम', 'राम राम'
  ],
  en: [
    'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
    'greetings', 'dear sir', 'dear madam'
  ]
};

const FILLER_PATTERNS: Record<string, string[]> = {
  mr: [
    'म्हणजे', 'बघा', 'अहो', 'बरं', 'हं', 'अरे',
    'आता', 'तर', 'मग', 'पण', 'आणि आणि', 'एकदम'
  ],
  hi: [
    'मतलब', 'देखो', 'अरे', 'ठीक है', 'हां', 'अच्छा',
    'अब', 'तो', 'फिर', 'लेकिन', 'और और', 'एकदम'
  ],
  en: [
    'you know', 'like', 'um', 'uh', 'well', 'so',
    'i mean', 'actually', 'basically', 'you see'
  ]
};

// AGRICULTURAL KEYWORDS (to verify content is farming related)

const AGRICULTURAL_KEYWORDS: Record<string, string[]> = {
  mr: [
    'पीक', 'शेत', 'पान', 'फवारणी', 'खत', 'किड', 'रोग', 'पाणी', 'ऊस', 'कापूस',
    'सोयाबीन', 'गहू', 'भात', 'मका', 'टोमॅटो', 'कांदा', 'बोंड', 'अळी', 'माव',
    'तांबेरा', 'करपा', 'सुरळी', 'खोड', 'मुळ', 'फळ', 'बियाणे', 'लागवड', 'कापणी',
    'पिवळे', 'काळे', 'डाग', 'वाळणे', 'सुकणे', 'कुजणे', 'मरणे'
  ],
  hi: [
    'फसल', 'खेत', 'पत्ता', 'स्प्रे', 'खाद', 'कीट', 'रोग', 'पानी', 'गन्ना', 'कपास',
    'सोयाबीन', 'गेहूं', 'धान', 'मक्का', 'टमाटर', 'प्याज', 'बॉल', 'इल्ली', 'माहू',
    'रतुआ', 'झुलसा', 'पोंगली', 'तना', 'जड़', 'फल', 'बीज', 'बुवाई', 'कटाई',
    'पीला', 'काला', 'धब्बा', 'सूखना', 'मुरझाना', 'सड़ना', 'मरना'
  ],
  en: [
    'crop', 'field', 'leaf', 'spray', 'fertilizer', 'pest', 'disease', 'water', 'sugarcane', 'cotton',
    'soybean', 'wheat', 'rice', 'maize', 'tomato', 'onion', 'boll', 'worm', 'aphid',
    'rust', 'blight', 'shoot', 'stem', 'root', 'fruit', 'seed', 'sowing', 'harvest',
    'yellow', 'black', 'spot', 'drying', 'wilting', 'rotting', 'dying'
  ]
};

// LANGUAGE DETECTION

function detectLanguageFromText(text: string): string {
  const devanagariPattern = /[\u0900-\u097F]/g;
  const devanagariMatches = text.match(devanagariPattern) || [];
  const hasDevanagari = devanagariMatches.length > 0;
  
  if (hasDevanagari) {
    // Marathi-specific characters and patterns
    const marathiSpecific = /ळ|ऱ|ॲ|ॅ/g;
    if (marathiSpecific.test(text)) {
      return 'mr';
    }
    
    // Common Marathi words
    const marathiWords = ['आहे', 'आहेत', 'होते', 'होत', 'झाले', 'झाली', 'करा', 'पाहिजे', 'नाही', 'तुम्ही', 'माझे', 'माझी', 'माझ्या'];
    for (const word of marathiWords) {
      if (text.includes(word)) {
        return 'mr';
      }
    }
    
    // Common Hindi words
    const hindiWords = ['है', 'हैं', 'था', 'थी', 'थे', 'करें', 'चाहिए', 'नहीं', 'आप', 'मेरा', 'मेरी', 'मेरे'];
    for (const word of hindiWords) {
      if (text.includes(word)) {
        return 'hi';
      }
    }
    
    // Default to Marathi for Devanagari text (most farmers in our target area)
    return 'mr';
  }
  
  // ROMANIZED REGIONAL LANGUAGE DETECTION
  const lowerText = text.toLowerCase();
  
  // Romanized Marathi markers (common words/phrases unique to Marathi)
  const romanMarathiWords = /\b(aahe|ahet|zale|zali|nahi|mala|mazya|tumhi|kara|pahije|hoye|karun|ushala|usala|kapus|pik|kidi|kida|ali|fawaarni|nindani|pivla|pivli|pivle|sukla|sukle|mela|meli|khod|paan|pane|rog|lagla|lagli|udya|aaila|ala|bagha|sangha|ya|kara|jhale|jhali|ch[ae]|ch[yi]|madhe|var|aani)\b/i;
  
  // Romanized Hindi markers (common words/phrases unique to Hindi)
  const romanHindiWords = /\b(hai|hain|tha|thi|kya|kaise|kab|kahan|mera|meri|mere|aapka|fasal|ganna|keeda|khaad|tana|patta|lagana|dena|karna|batao|bataiye|chahiye|nahi|aur|ka|ki|ke|mein|se|ko|par|raha|rahi|rahe)\b/i;
  
  // Count matches for each language
  const mrMatches = (lowerText.match(romanMarathiWords) || []).length;
  const hiMatches = (lowerText.match(romanHindiWords) || []).length;
  
  // If significant romanized markers detected, return the dominant language
  if (mrMatches > hiMatches && mrMatches >= 1) {
    return 'mr';
  }
  if (hiMatches > mrMatches && hiMatches >= 1) {
    return 'hi';
  }
  
  return 'en';
}

// TEXT NORMALIZATION

function removePatterns(text: string, patterns: string[]): { cleaned: string; removed: string[] } {
  let cleaned = text;
  const removed: string[] = [];
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (regex.test(cleaned)) {
      removed.push(pattern);
      cleaned = cleaned.replace(regex, ' ');
    }
  }
  
  return { cleaned, removed };
}

// Romanized agricultural keywords (Marathi/Hindi in Latin script)
const ROMANIZED_AGRI_KEYWORDS = [
  'us', 'oos', 'uss', 'kapus', 'kapas', 'pik', 'peek', 'shet', 'khet',
  'paan', 'pan', 'patta', 'patte', 'kidi', 'kida', 'keeda', 'keede',
  'rog', 'roga', 'pani', 'paani', 'khat', 'khaad', 'khata',
  'fawaarni', 'favarani', 'spray', 'dawaa', 'dawa',
  'pivla', 'pivli', 'pivle', 'pila', 'pili', 'pile',
  'sukla', 'sukle', 'sukha', 'mela', 'meli', 'marat',
  'ali', 'alu', 'alli', 'borer', 'khod', 'khoda', 'tana',
  'ganna', 'gannya', 'soybean', 'tur', 'gehu', 'bhaat',
  'kapni', 'kapani', 'katai', 'nindani', 'nindan',
  'dag', 'dhabbe', 'thipke', 'tambera', 'karpa',
  'valvi', 'valavi', 'dimak', 'dimaka',
  'gawat', 'tan', 'gavat', 'fasal', 'fasla'
];

function checkAgriculturalContent(text: string, language: string): boolean {
  const lowerText = text.toLowerCase();
  const keywords = AGRICULTURAL_KEYWORDS[language];
  
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  
  // Also check English keywords for non-English languages
  if (language !== 'en') {
    for (const keyword of AGRICULTURAL_KEYWORDS.en) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }
  
  // CRITICAL: Check romanized agricultural keywords for ALL languages
  // Farmers often type in Roman Marathi/Hindi regardless of detected script
  for (const keyword of ROMANIZED_AGRI_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(lowerText)) {
      return true;
    }
  }
  
  return false;
}

// MAIN NORMALIZER FUNCTION

export function normalizeLanguage(text: string): NormalizedInput {
  const originalText = text.trim();
  const detectedLanguage = detectLanguageFromText(originalText);
  
  let normalizedText = originalText;
  const allRemovedElements: string[] = [];
  
  // Remove greetings
  const greetingResult = removePatterns(normalizedText, GREETING_PATTERNS[detectedLanguage]);
  normalizedText = greetingResult.cleaned;
  allRemovedElements.push(...greetingResult.removed.map(r => `greeting:${r}`));
  
  // Also check English greetings for non-English languages
  if (detectedLanguage !== 'en') {
    const enGreetingResult = removePatterns(normalizedText, GREETING_PATTERNS.en);
    normalizedText = enGreetingResult.cleaned;
    allRemovedElements.push(...enGreetingResult.removed.map(r => `greeting:${r}`));
  }
  
  // Remove emotion patterns
  const emotionResult = removePatterns(normalizedText, EMOTION_PATTERNS[detectedLanguage]);
  normalizedText = emotionResult.cleaned;
  allRemovedElements.push(...emotionResult.removed.map(r => `emotion:${r}`));
  
  // Also check English emotion patterns
  if (detectedLanguage !== 'en') {
    const enEmotionResult = removePatterns(normalizedText, EMOTION_PATTERNS.en);
    normalizedText = enEmotionResult.cleaned;
    allRemovedElements.push(...enEmotionResult.removed.map(r => `emotion:${r}`));
  }
  
  // Remove filler patterns
  const fillerResult = removePatterns(normalizedText, FILLER_PATTERNS[detectedLanguage]);
  normalizedText = fillerResult.cleaned;
  allRemovedElements.push(...fillerResult.removed.map(r => `filler:${r}`));
  
  // Clean up whitespace
  normalizedText = normalizedText.replace(/\s+/g, ' ').trim();
  
  // Check for agricultural content
  const hasAgriculturalContent = checkAgriculturalContent(normalizedText, detectedLanguage);
  
  return {
    original_text: originalText,
    normalized_text: normalizedText,
    detected_language: detectedLanguage,
    removed_elements: allRemovedElements,
    word_count: normalizedText.split(/\s+/).filter(w => w.length > 0).length,
    has_agricultural_content: hasAgriculturalContent
  };
}

// EXPORTS

export default {
  normalizeLanguage,
  detectLanguageFromText,
  LANGUAGE_NORMALIZER_VERSION
};

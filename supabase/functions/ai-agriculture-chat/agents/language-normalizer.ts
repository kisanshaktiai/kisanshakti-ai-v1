// STAGE 1: LANGUAGE NORMALIZER (deterministic, no LLM)
// Language is NOT detected here: it is supplied by the caller
// (options.language, the canonical SSOT). Script-range based detection
// lives in index.ts::detectLanguage.

export const LANGUAGE_NORMALIZER_VERSION = '2.0.0';


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

// MAIN NORMALIZER FUNCTION

export function normalizeLanguage(text: string, language: string = 'en'): NormalizedInput {
  const originalText = text.trim();
  const detectedLanguage = language;
  
  let normalizedText = originalText;
  const allRemovedElements: string[] = [];
  
  // Remove greetings
  const greetingResult = removePatterns(normalizedText, GREETING_PATTERNS[detectedLanguage] ?? []);
  normalizedText = greetingResult.cleaned;
  allRemovedElements.push(...greetingResult.removed.map(r => `greeting:${r}`));
  
  // Also check English greetings for non-English languages
  if (detectedLanguage !== 'en') {
    const enGreetingResult = removePatterns(normalizedText, GREETING_PATTERNS.en ?? []);
    normalizedText = enGreetingResult.cleaned;
    allRemovedElements.push(...enGreetingResult.removed.map(r => `greeting:${r}`));
  }
  
  // Remove emotion patterns
  const emotionResult = removePatterns(normalizedText, EMOTION_PATTERNS[detectedLanguage] ?? []);
  normalizedText = emotionResult.cleaned;
  allRemovedElements.push(...emotionResult.removed.map(r => `emotion:${r}`));
  
  // Also check English emotion patterns
  if (detectedLanguage !== 'en') {
    const enEmotionResult = removePatterns(normalizedText, EMOTION_PATTERNS.en ?? []);
    normalizedText = enEmotionResult.cleaned;
    allRemovedElements.push(...enEmotionResult.removed.map(r => `emotion:${r}`));
  }
  
  // Remove filler patterns
  const fillerResult = removePatterns(normalizedText, FILLER_PATTERNS[detectedLanguage] ?? []);
  normalizedText = fillerResult.cleaned;
  allRemovedElements.push(...fillerResult.removed.map(r => `filler:${r}`));
  
  // Clean up whitespace
  normalizedText = normalizedText.replace(/\s+/g, ' ').trim();
  
  return {
    original_text: originalText,
    normalized_text: normalizedText,
    detected_language: detectedLanguage,
    removed_elements: allRemovedElements,
    word_count: normalizedText.split(/\s+/).filter(w => w.length > 0).length,
    has_agricultural_content: true
  };
}

// EXPORTS

export default {
  normalizeLanguage,
  LANGUAGE_NORMALIZER_VERSION
};

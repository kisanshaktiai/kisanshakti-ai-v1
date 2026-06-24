/**
 * LanguageDetector - Auto-detects language from voice input and handles code-switching
 * Supports major Indian languages and English
 */

export type SupportedLanguage = 'en' | 'hi' | 'mr' | 'pa' | 'ta' | 'te' | 'bn' | 'gu' | 'kn' | 'ml';

interface LanguagePattern {
  code: SupportedLanguage;
  patterns: RegExp[];
  commonWords: string[];
  unicodeRanges: [number, number][];
}

export interface LanguageDetectionResult {
  primaryLanguage: SupportedLanguage;
  confidence: number;
  isCodeSwitching: boolean;
  mixedLanguages?: SupportedLanguage[];
}

export class LanguageDetector {
  private languagePatterns: LanguagePattern[] = [
    {
      code: 'en',
      patterns: [/\b(the|is|are|was|were|have|has|had|will|would|can|could|should)\b/i],
      commonWords: ['the', 'is', 'are', 'and', 'or', 'but', 'in', 'on', 'at'],
      unicodeRanges: [[0x0041, 0x005A], [0x0061, 0x007A]], // A-Z, a-z
    },
    {
      code: 'hi',
      patterns: [/\b(है|हैं|था|थी|के|की|को|में|पर|से)\b/],
      commonWords: ['है', 'हैं', 'और', 'या', 'के', 'की', 'को', 'में'],
      unicodeRanges: [[0x0900, 0x097F]], // Devanagari
    },
    {
      code: 'mr',
      patterns: [/\b(आहे|होते|होती|च्या|ला|मध्ये)\b/],
      commonWords: ['आहे', 'होते', 'आणि', 'किंवा', 'च्या', 'ला'],
      unicodeRanges: [[0x0900, 0x097F]], // Devanagari (Marathi uses same script as Hindi)
    },
    {
      code: 'pa',
      patterns: [/\b(ਹੈ|ਹਨ|ਸੀ|ਦਾ|ਦੀ|ਨੂੰ|ਵਿੱਚ)\b/],
      commonWords: ['ਹੈ', 'ਹਨ', 'ਅਤੇ', 'ਜਾਂ', 'ਦਾ', 'ਦੀ', 'ਨੂੰ'],
      unicodeRanges: [[0x0A00, 0x0A7F]], // Gurmukhi
    },
    {
      code: 'ta',
      patterns: [/\b(இருக்கிறது|இருக்கிறார்கள்|இருந்தது|உள்ள|என்று)\b/],
      commonWords: ['இருக்கிறது', 'உள்ளது', 'மற்றும்', 'அல்லது', 'என்று'],
      unicodeRanges: [[0x0B80, 0x0BFF]], // Tamil
    },
    {
      code: 'te',
      patterns: [/\b(ఉంది|ఉన్నారు|ఉన్నది|యొక్క|లో)\b/],
      commonWords: ['ఉంది', 'ఉన్నారు', 'మరియు', 'లేదా', 'యొక్క'],
      unicodeRanges: [[0x0C00, 0x0C7F]], // Telugu
    },
    {
      code: 'bn',
      patterns: [/\b(আছে|আছেন|ছিল|ছিলেন|এর|কে|মধ্যে)\b/],
      commonWords: ['আছে', 'আছেন', 'এবং', 'বা', 'এর', 'কে'],
      unicodeRanges: [[0x0980, 0x09FF]], // Bengali
    },
    {
      code: 'gu',
      patterns: [/\b(છે|છો|હતો|હતી|ના|ને|માં)\b/],
      commonWords: ['છે', 'છો', 'અને', 'અથવા', 'ના', 'ને'],
      unicodeRanges: [[0x0A80, 0x0AFF]], // Gujarati
    },
    {
      code: 'kn',
      patterns: [/\b(ಇದೆ|ಇದ್ದರು|ಇತ್ತು|ನ|ಗೆ|ನಲ್ಲಿ)\b/],
      commonWords: ['ಇದೆ', 'ಇದ್ದರು', 'ಮತ್ತು', 'ಅಥವಾ', 'ನ', 'ಗೆ'],
      unicodeRanges: [[0x0C80, 0x0CFF]], // Kannada
    },
    {
      code: 'ml',
      patterns: [/\b(ആണ്|ആയിരുന്നു|ഉള്ള|യുടെ|ൽ)\b/],
      commonWords: ['ആണ്', 'ആയിരുന്നു', 'ഉം', 'അല്ലെങ്കിൽ', 'യുടെ'],
      unicodeRanges: [[0x0D00, 0x0D7F]], // Malayalam
    },
  ];

  /**
   * Detect language from text input
   */
  detectLanguage(text: string): LanguageDetectionResult {
    if (!text || text.trim().length === 0) {
      return {
        primaryLanguage: 'en',
        confidence: 0,
        isCodeSwitching: false,
      };
    }

    const detections = this.languagePatterns.map(pattern => ({
      language: pattern.code,
      score: this.calculateLanguageScore(text, pattern),
    }));

    // Sort by score
    detections.sort((a, b) => b.score - a.score);

    const primary = detections[0];
    const secondary = detections[1];

    // Check for code-switching
    const isCodeSwitching = secondary && secondary.score > 0.2 && (primary.score - secondary.score) < 0.3;

    return {
      primaryLanguage: primary.language,
      confidence: primary.score,
      isCodeSwitching: isCodeSwitching || false,
      mixedLanguages: isCodeSwitching ? [primary.language, secondary.language] : undefined,
    };
  }

  /**
   * Calculate language score for a given text and pattern
   */
  private calculateLanguageScore(text: string, pattern: LanguagePattern): number {
    let score = 0;
    const normalizedText = text.toLowerCase();

    // Check regex patterns
    for (const regex of pattern.patterns) {
      const matches = normalizedText.match(regex);
      if (matches) {
        score += matches.length * 0.3;
      }
    }

    // Check common words
    const words = normalizedText.split(/\s+/);
    const commonWordMatches = words.filter(word => 
      pattern.commonWords.some(common => word.includes(common))
    ).length;
    score += (commonWordMatches / words.length) * 0.4;

    // Check Unicode ranges (script detection)
    const scriptMatches = this.countScriptMatches(text, pattern.unicodeRanges);
    score += (scriptMatches / text.length) * 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * Count characters in specified Unicode ranges
   */
  private countScriptMatches(text: string, ranges: [number, number][]): number {
    let count = 0;
    for (const char of text) {
      const code = char.charCodeAt(0);
      for (const [start, end] of ranges) {
        if (code >= start && code <= end) {
          count++;
          break;
        }
      }
    }
    return count;
  }

  /**
   * Get language code from browser locale
   */
  getBrowserLanguage(): SupportedLanguage {
    const browserLang = navigator.language || 'en';
    const langCode = browserLang.split('-')[0].toLowerCase();
    
    const supportedCodes: SupportedLanguage[] = ['en', 'hi', 'mr', 'pa', 'ta', 'te', 'bn', 'gu', 'kn', 'ml'];
    
    if (supportedCodes.includes(langCode as SupportedLanguage)) {
      return langCode as SupportedLanguage;
    }
    
    return 'en';
  }

  /**
   * Handle code-switching by extracting segments in different languages
   */
  extractCodeSwitchedSegments(text: string): Array<{ text: string; language: SupportedLanguage }> {
    const segments: Array<{ text: string; language: SupportedLanguage }> = [];
    const words = text.split(/\s+/);
    
    let currentSegment: string[] = [];
    let currentLang: SupportedLanguage = 'en';

    for (const word of words) {
      const detection = this.detectLanguage(word);
      
      if (detection.primaryLanguage !== currentLang && currentSegment.length > 0) {
        // Language switch detected, save current segment
        segments.push({
          text: currentSegment.join(' '),
          language: currentLang,
        });
        currentSegment = [word];
        currentLang = detection.primaryLanguage;
      } else {
        currentSegment.push(word);
        if (currentSegment.length === 1) {
          currentLang = detection.primaryLanguage;
        }
      }
    }

    // Add final segment
    if (currentSegment.length > 0) {
      segments.push({
        text: currentSegment.join(' '),
        language: currentLang,
      });
    }

    return segments;
  }

  /**
   * Normalize code-switched text to primary language
   * Useful for intent matching
   */
  normalizeCodeSwitching(text: string, targetLanguage: SupportedLanguage): string {
    // For now, keep the original text as intent matching handles mixed languages
    // Future enhancement: translate segments to target language
    return text;
  }

  /**
   * Get localized idioms and phrases for better understanding
   */
  getLocalIdioms(language: SupportedLanguage): Record<string, string> {
    const idioms: Record<SupportedLanguage, Record<string, string>> = {
      en: {
        'show me': 'display',
        'take me to': 'navigate',
        'bring up': 'open',
      },
      hi: {
        'दिखाओ': 'show',
        'ले चलो': 'take to',
        'खोल दो': 'open',
      },
      mr: {
        'दाखवा': 'show',
        'घेऊन जा': 'take to',
        'उघडा': 'open',
      },
      pa: {
        'ਦਿਖਾਓ': 'show',
        'ਲੈ ਚੱਲੋ': 'take to',
        'ਖੋਲ੍ਹੋ': 'open',
      },
      ta: {
        'காட்டு': 'show',
        'அழைத்துச் செல்': 'take to',
        'திற': 'open',
      },
      te: {},
      bn: {},
      gu: {},
      kn: {},
      ml: {},
    };

    return idioms[language] || {};
  }

  /**
   * Detect if user is mixing English and local language (common in India)
   */
  isHinglish(text: string): boolean {
    const detection = this.detectLanguage(text);
    return detection.isCodeSwitching && 
           detection.mixedLanguages?.includes('en') === true &&
           detection.mixedLanguages?.includes('hi') === true;
  }
}

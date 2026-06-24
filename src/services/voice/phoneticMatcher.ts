/**
 * PhoneticMatcher - Advanced pronunciation-aware matching for Indian languages
 * Handles dialect variations, transliteration, and fuzzy phonetic matching
 * Designed for rural Indian farmers with diverse pronunciation patterns
 */

// Common phonetic variations across Hindi dialects
const PHONETIC_MAPPINGS: Record<string, string[]> = {
  // Vowel variations
  'a': ['aa', 'अ', 'आ', 'ā'],
  'e': ['i', 'ee', 'ए', 'ई', 'इ'],
  'o': ['u', 'oo', 'ओ', 'ऊ', 'उ'],
  'ai': ['ay', 'ae', 'ऐ'],
  'au': ['ow', 'ou', 'औ'],
  
  // Consonant variations common in rural dialects
  'k': ['c', 'q', 'क', 'ख'],
  'g': ['gh', 'ग', 'घ'],
  'ch': ['c', 'chh', 'च', 'छ'],
  'j': ['z', 'ज', 'झ', 'ज़'],
  't': ['th', 'ट', 'ठ', 'त', 'थ'],
  'd': ['dh', 'ड', 'ढ', 'द', 'ध'],
  'n': ['ण', 'न'],
  'p': ['ph', 'f', 'प', 'फ'],
  'b': ['bh', 'v', 'ब', 'भ', 'व'],
  'r': ['ड़', 'ढ़', 'र'],
  's': ['sh', 'ss', 'स', 'श', 'ष'],
  'h': ['ह'],
  
  // Common word-level variations in rural Hindi
  'karo': ['kro', 'krro', 'करो', 'kardo'],
  'dikhao': ['dikha', 'dikhade', 'dikhaao', 'दिखाओ', 'दिखा'],
  'jao': ['ja', 'jaao', 'jaa', 'जाओ', 'जा'],
  'kholo': ['khol', 'kholdo', 'खोलो', 'खोल'],
  'batao': ['bata', 'bataao', 'बताओ', 'बता'],
  'dedo': ['de', 'dede', 'देदो', 'दे'],
  'hato': ['hata', 'hatao', 'हटाओ', 'हटा'],
  'kya': ['kia', 'क्या', 'kyaa'],
  'hai': ['he', 'hain', 'है', 'हैं'],
  
  // Regional variations (Bhojpuri, Marwadi, etc.)
  'home': ['hom', 'होम', 'होमे'],
  'mera': ['mero', 'hamara', 'मेरा', 'मेरो', 'हमारा'],
  'meri': ['mero', 'hamari', 'मेरी', 'मेरो', 'हमारी'],
  'weather': ['mausam', 'mausm', 'mosam', 'मौसम'],
  'land': ['jameen', 'jamin', 'zameen', 'zamin', 'khait', 'khet', 'जमीन', 'खेत'],
  'save': ['bachao', 'save', 'sev', 'सेव', 'बचाओ'],
  'schedule': ['shedyul', 'kaam', 'kam', 'karya', 'शेड्यूल', 'काम'],
  'market': ['bazar', 'bazaar', 'mandi', 'बाज़ार', 'बाजार', 'मंडी'],
  'profile': ['profail', 'profil', 'khata', 'प्रोफाइल', 'खाता'],
};

// Dialect-specific command variations
const DIALECT_VARIATIONS: Record<string, Record<string, string[]>> = {
  // Bhojpuri variations
  bhojpuri: {
    'home': ['ghar', 'ghar pe jao', 'ghar dikhao'],
    'weather': ['mausam batao', 'barish hoi ki na'],
    'lands': ['khet dikha', 'khetwa dikha', 'zameen batao'],
    'save': ['save kar', 'rakh de', 'bacha le'],
    'back': ['pichhe jao', 'wapas', 'pichhe'],
  },
  // Marwadi variations
  marwadi: {
    'home': ['ghar', 'main page', 'घर'],
    'weather': ['mausam', 'hawa paani'],
    'lands': ['zameen dikha', 'khet dikha'],
    'save': ['bachao', 'rakho'],
    'back': ['pache jao', 'wapas'],
  },
  // Bundelkhandi variations
  bundelkhandi: {
    'home': ['ghar', 'घरे जाओ'],
    'weather': ['mausam', 'पानी आवे कि ना'],
    'lands': ['खेत दिखाओ', 'जमीना दिखाओ'],
  },
  // Generic rural Hindi
  rural: {
    'home': ['ghar pe jao', 'ghar dikha', 'mukhya page'],
    'weather': ['mausam kaise', 'paani giregi', 'barish hogi'],
    'lands': ['apna khet dikha', 'hamara khait', 'jamin dikha'],
    'back': ['pichhe', 'wapas jao', 'pichla page'],
    'save': ['save karo', 'bachao', 'rakh do', 'jama karo'],
    'next': ['aage', 'agla', 'aage jao', 'agla wala'],
    'cancel': ['band karo', 'mat karo', 'chod do', 'rehne do'],
  },
};

/**
 * Normalize text for comparison
 * Handles multiple scripts, removes diacritics, normalizes spacing
 */
export function normalizeForPhonetic(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Remove common punctuation
    .replace(/[।,?!.'"()]/g, '')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    // Remove common filler words
    .replace(/\b(please|kripya|कृपया|ji|जी|sir|sahab|साहब)\b/gi, '')
    .trim();
}

/**
 * Generate phonetic variants of a word
 */
export function generatePhoneticVariants(word: string): string[] {
  const variants = new Set<string>([word]);
  const normalized = normalizeForPhonetic(word);
  variants.add(normalized);

  // Add direct phonetic mappings
  for (const [key, values] of Object.entries(PHONETIC_MAPPINGS)) {
    if (normalized.includes(key)) {
      for (const variant of values) {
        variants.add(normalized.replace(new RegExp(key, 'g'), variant));
      }
    }
    for (const val of values) {
      if (normalized.includes(val)) {
        variants.add(normalized.replace(new RegExp(val, 'g'), key));
      }
    }
  }

  // Add dialect variations
  for (const dialectVariants of Object.values(DIALECT_VARIATIONS)) {
    for (const [key, values] of Object.entries(dialectVariants)) {
      if (normalized.includes(key)) {
        values.forEach(v => variants.add(v.toLowerCase()));
      }
    }
  }

  return Array.from(variants);
}

/**
 * Calculate phonetic similarity score
 * Uses multiple algorithms for robust matching
 */
export function phoneticSimilarity(input: string, pattern: string): number {
  const normalizedInput = normalizeForPhonetic(input);
  const normalizedPattern = normalizeForPhonetic(pattern);

  // Exact match
  if (normalizedInput === normalizedPattern) return 1.0;

  // Check if input contains pattern or vice versa
  if (normalizedInput.includes(normalizedPattern)) return 0.95;
  if (normalizedPattern.includes(normalizedInput)) return 0.90;

  // Generate variants and check for matches
  const inputVariants = generatePhoneticVariants(normalizedInput);
  const patternVariants = generatePhoneticVariants(normalizedPattern);

  for (const iv of inputVariants) {
    for (const pv of patternVariants) {
      if (iv === pv) return 0.92;
      if (iv.includes(pv) || pv.includes(iv)) return 0.85;
    }
  }

  // Word-level matching
  const inputWords = normalizedInput.split(' ');
  const patternWords = normalizedPattern.split(' ');

  let matchedWords = 0;
  for (const pWord of patternWords) {
    for (const iWord of inputWords) {
      if (iWord === pWord || levenshteinSimilarity(iWord, pWord) > 0.75) {
        matchedWords++;
        break;
      }
    }
  }

  const wordMatchRatio = matchedWords / Math.max(patternWords.length, 1);
  if (wordMatchRatio > 0.5) {
    return 0.6 + (wordMatchRatio * 0.3);
  }

  // Fuzzy Levenshtein similarity
  return levenshteinSimilarity(normalizedInput, normalizedPattern);
}

/**
 * Levenshtein distance based similarity
 */
function levenshteinSimilarity(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

/**
 * Soundex-like algorithm for Hindi/Devanagari
 * Maps similar sounding consonants to same code
 */
export function hindiSoundex(text: string): string {
  const normalized = normalizeForPhonetic(text);
  const soundexMap: Record<string, string> = {
    // Velars (क, ख, ग, घ, क़, ख़, ग़)
    'क': '1', 'ख': '1', 'ग': '1', 'घ': '1', 'क़': '1', 'ख़': '1', 'ग़': '1',
    'k': '1', 'c': '1', 'q': '1', 'g': '1',
    
    // Palatals (च, छ, ज, झ, ज़)
    'च': '2', 'छ': '2', 'ज': '2', 'झ': '2', 'ज़': '2',
    'j': '2', 'z': '2',
    
    // Dentals (त, थ, द, ध)
    'त': '3', 'थ': '3', 'द': '3', 'ध': '3',
    't': '3', 'd': '3',
    
    // Retroflex (ट, ठ, ड, ढ, ड़, ढ़)
    'ट': '4', 'ठ': '4', 'ड': '4', 'ढ': '4', 'ड़': '4', 'ढ़': '4',
    
    // Labials (प, फ, ब, भ, फ़)
    'प': '5', 'फ': '5', 'ब': '5', 'भ': '5', 'फ़': '5',
    'p': '5', 'f': '5', 'b': '5', 'v': '5',
    
    // Nasals (न, ण, म, ं)
    'न': '6', 'ण': '6', 'म': '6', 'ं': '6',
    'n': '6', 'm': '6',
    
    // Sibilants (स, श, ष)
    'स': '7', 'श': '7', 'ष': '7',
    's': '7',
    
    // Semivowels & h
    'र': '8', 'ल': '8', 'य': '9', 'व': '9', 'ह': '0',
    'r': '8', 'l': '8', 'y': '9', 'w': '9', 'h': '0',
  };

  let code = '';
  let lastCode = '';

  for (const char of normalized) {
    const charCode = soundexMap[char];
    if (charCode && charCode !== lastCode) {
      code += charCode;
      lastCode = charCode;
    }
  }

  return code.slice(0, 6).padEnd(6, '0');
}

/**
 * Match using soundex for phonetically similar words
 */
export function soundexMatch(input: string, pattern: string): boolean {
  return hindiSoundex(input) === hindiSoundex(pattern);
}

/**
 * Comprehensive phonetic matching with multiple strategies
 */
export function bestPhoneticMatch(
  input: string,
  patterns: string[]
): { pattern: string; score: number } | null {
  let bestMatch: { pattern: string; score: number } | null = null;

  for (const pattern of patterns) {
    const score = phoneticSimilarity(input, pattern);
    
    // Bonus for soundex match
    const soundexBonus = soundexMatch(input, pattern) ? 0.1 : 0;
    const finalScore = Math.min(1.0, score + soundexBonus);

    if (finalScore > 0.55 && (!bestMatch || finalScore > bestMatch.score)) {
      bestMatch = { pattern, score: finalScore };
    }
  }

  return bestMatch;
}

export default {
  normalizeForPhonetic,
  generatePhoneticVariants,
  phoneticSimilarity,
  hindiSoundex,
  soundexMatch,
  bestPhoneticMatch,
};

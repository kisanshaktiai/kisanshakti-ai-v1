/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STAGE 2: OBSERVATION EXTRACTOR (LLM, STRICT)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * MASTER PROMPT v3 - Stage 2
 * 
 * PURPOSE:
 * Extract ONLY what the farmer explicitly states.
 * 
 * RULES:
 * - If not explicitly stated → UNKNOWN
 * - NEVER return pest, disease, deficiency codes
 * - NEVER return canonical codes
 * - Only extract raw observations
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const OBSERVATION_EXTRACTOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS - STRICT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export type AffectedPart = 'leaf' | 'stem' | 'root' | 'whole' | 'fruit' | 'boll' | 'unknown';
export type SymptomDistribution = 'uniform' | 'patchy' | 'border' | 'spreading' | 'unknown';

export interface ObservationExtraction {
  /**
   * Raw crop name as mentioned by farmer (NOT code)
   * Example: "sugarcane", "ऊस" - raw text, NOT code
   */
  crop_mentioned?: string;
  
  /**
   * EXACT farmer words describing symptoms
   * Examples: ["मधली सुरळी वाळली", "dead heart", "पाने पिवळी"]
   */
  raw_symptom_text: string[];
  
  /**
   * Which part of plant is affected
   */
  affected_part: AffectedPart;
  
  /**
   * How symptoms are distributed
   */
  symptom_distribution: SymptomDistribution;
  
  /**
   * Severity words used by farmer
   * Examples: ["severe", "खूप", "थोडी", "very bad"]
   */
  severity_words: string[];
  
  /**
   * Time references mentioned
   * Examples: ["yesterday", "2 days ago", "काल पासून"]
   */
  time_reference?: string;
  
  /**
   * Actions farmer has already taken
   * Examples: ["sprayed", "फवारणी केली", "applied fertilizer"]
   */
  action_taken: string[];
  
  /**
   * Words indicating farmer is uncertain
   * Examples: ["maybe", "कदाचित", "I think"]
   */
  uncertainty_markers: string[];
  
  /**
   * Detected input language
   */
  detected_language: string;
  
  /**
   * Count of critical observations
   */
  observation_count: number;

  /**
   * Canonical observation codes attached by symbolic layers after raw extraction.
   * The extractor itself never invents these; orchestrator/DB mappers populate them
   * so deterministic gates can inspect the same evidence the brain will use.
   */
  extracted_observations?: string[];

  /** Optional enriched symptom payload from photo/vision or DB mappers. */
  extracted_symptoms?: Array<{
    text?: string;
    symptom_code?: string;
    confidence?: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN DICTIONARIES FOR EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

const AFFECTED_PART_PATTERNS: Record<string, AffectedPart> = {
  // Marathi
  'पान': 'leaf', 'पाने': 'leaf', 'पानावर': 'leaf', 'पानांवर': 'leaf',
  'खोड': 'stem', 'खोडावर': 'stem', 'खोडात': 'stem', 'देठ': 'stem',
  'मुळ': 'root', 'मुळावर': 'root', 'मुळात': 'root',
  'फळ': 'fruit', 'फळावर': 'fruit', 'बोंड': 'boll', 'बोंडावर': 'boll',
  'संपूर्ण': 'whole', 'पूर्ण': 'whole', 'सगळे': 'whole',
  'सुरळी': 'stem', 'कोंब': 'stem', 'शेंडा': 'stem',
  
  // Hindi
  'पत्ता': 'leaf', 'पत्ते': 'leaf', 'पत्तों': 'leaf',
  'तना': 'stem', 'तने': 'stem', 'डंठल': 'stem',
  'जड़': 'root', 'जड़ों': 'root',
  'फल': 'fruit', 'बॉल': 'boll',
  'पूरा': 'whole', 'पोंगली': 'stem',
  
  // English
  'leaf': 'leaf', 'leaves': 'leaf',
  'stem': 'stem', 'stalk': 'stem', 'shoot': 'stem',
  'root': 'root', 'roots': 'root',
  'fruit': 'fruit', 'boll': 'boll', 'bolls': 'boll',
  'whole': 'whole', 'entire': 'whole', 'all': 'whole',
  'whorl': 'stem', 'central': 'stem'
};

const DISTRIBUTION_PATTERNS: Record<string, SymptomDistribution> = {
  // Marathi
  'सगळीकडे': 'uniform', 'सर्वत्र': 'uniform', 'संपूर्ण': 'uniform',
  'ठिकठिकाणी': 'patchy', 'जागोजागी': 'patchy', 'काही ठिकाणी': 'patchy',
  'कडेने': 'border', 'किनारीला': 'border',
  'पसरत': 'spreading', 'वाढत': 'spreading',
  
  // Hindi
  'हर जगह': 'uniform', 'पूरे': 'uniform', 'सब जगह': 'uniform',
  'कहीं कहीं': 'patchy', 'जगह जगह': 'patchy',
  'किनारे': 'border',
  'फैल रहा': 'spreading', 'बढ़ रहा': 'spreading',
  
  // English
  'everywhere': 'uniform', 'all over': 'uniform', 'throughout': 'uniform',
  'patchy': 'patchy', 'scattered': 'patchy', 'some places': 'patchy', 'here and there': 'patchy',
  'border': 'border', 'edge': 'border', 'periphery': 'border',
  'spreading': 'spreading', 'increasing': 'spreading', 'expanding': 'spreading'
};

const SEVERITY_WORDS: Record<string, string[]> = {
  mr: ['खूप', 'फार', 'जास्त', 'थोडी', 'कमी', 'भयंकर', 'गंभीर', 'सौम्य', 'अत्यंत'],
  hi: ['बहुत', 'ज्यादा', 'थोड़ा', 'कम', 'भयंकर', 'गंभीर', 'हल्का', 'अत्यंत'],
  en: ['very', 'severe', 'mild', 'light', 'heavy', 'extreme', 'little', 'lot', 'bad', 'worse', 'worst']
};

const UNCERTAINTY_MARKERS: Record<string, string[]> = {
  mr: ['कदाचित', 'बहुधा', 'वाटते', 'असेल', 'असू शकते', 'माहित नाही', 'खात्री नाही'],
  hi: ['शायद', 'हो सकता', 'लगता है', 'पता नहीं', 'निश्चित नहीं'],
  en: ['maybe', 'perhaps', 'possibly', 'not sure', 'i think', 'might be', 'could be', 'seems like']
};

const TIME_PATTERNS: string[] = [
  // Marathi
  'काल', 'परवा', 'आज', '2-3 दिवस', 'आठवडा', 'महिना', 'पासून', 'दिवसांपूर्वी',
  // Hindi  
  'कल', 'परसों', 'आज', '2-3 दिन', 'हफ्ता', 'महीना', 'से', 'दिन पहले',
  // English
  'yesterday', 'today', 'last week', 'days ago', 'since', 'from', 'ago', 'recently'
];

const ACTION_PATTERNS: Record<string, string[]> = {
  mr: ['फवारणी केली', 'फवारले', 'खत दिले', 'पाणी दिले', 'औषध मारले', 'स्प्रे केला'],
  hi: ['स्प्रे किया', 'फवारनी की', 'खाद डाला', 'पानी दिया', 'दवाई डाली'],
  en: ['sprayed', 'applied', 'gave water', 'fertilized', 'irrigated', 'treated']
};

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function extractAffectedPart(text: string): AffectedPart {
  const lowerText = text.toLowerCase();
  
  for (const [pattern, part] of Object.entries(AFFECTED_PART_PATTERNS)) {
    if (lowerText.includes(pattern.toLowerCase())) {
      return part;
    }
  }
  
  return 'unknown';
}

function extractDistribution(text: string): SymptomDistribution {
  const lowerText = text.toLowerCase();
  
  for (const [pattern, dist] of Object.entries(DISTRIBUTION_PATTERNS)) {
    if (lowerText.includes(pattern.toLowerCase())) {
      return dist;
    }
  }
  
  return 'unknown';
}

function extractSeverityWords(text: string, language: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();
  
  // Check language-specific patterns (fallback to en if language not in dictionary)
  for (const word of (SEVERITY_WORDS[language] || SEVERITY_WORDS.en)) {
    if (lowerText.includes(word.toLowerCase())) {
      found.push(word);
    }
  }
  
  // Also check English patterns for non-English
  if (language !== 'en') {
    for (const word of SEVERITY_WORDS.en) {
      if (lowerText.includes(word.toLowerCase()) && !found.includes(word)) {
        found.push(word);
      }
    }
  }
  
  return found;
}

function extractUncertaintyMarkers(text: string, language: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();
  
  for (const marker of (UNCERTAINTY_MARKERS[language] || UNCERTAINTY_MARKERS.en)) {
    if (lowerText.includes(marker.toLowerCase())) {
      found.push(marker);
    }
  }
  
  // Also check English
  if (language !== 'en') {
    for (const marker of UNCERTAINTY_MARKERS.en) {
      if (lowerText.includes(marker.toLowerCase()) && !found.includes(marker)) {
        found.push(marker);
      }
    }
  }
  
  return found;
}

function extractTimeReference(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  
  for (const pattern of TIME_PATTERNS) {
    if (lowerText.includes(pattern.toLowerCase())) {
      // Try to extract surrounding context
      const index = lowerText.indexOf(pattern.toLowerCase());
      const start = Math.max(0, index - 10);
      const end = Math.min(text.length, index + pattern.length + 10);
      return text.substring(start, end).trim();
    }
  }
  
  return undefined;
}

function extractActionsTaken(text: string, language: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();
  
  for (const pattern of (ACTION_PATTERNS[language] || ACTION_PATTERNS.en)) {
    if (lowerText.includes(pattern.toLowerCase())) {
      found.push(pattern);
    }
  }
  
  // Also check English
  if (language !== 'en') {
    for (const pattern of ACTION_PATTERNS.en) {
      if (lowerText.includes(pattern.toLowerCase()) && !found.includes(pattern)) {
        found.push(pattern);
      }
    }
  }
  
  return found;
}

function extractCropMention(text: string): string | undefined {
  const cropPatterns: Record<string, string> = {
    // Marathi
    'ऊस': 'sugarcane', 'कापूस': 'cotton', 'सोयाबीन': 'soybean',
    'गहू': 'wheat', 'भात': 'rice', 'धान': 'rice', 'तांदूळ': 'rice',
    'मका': 'maize', 'टोमॅटो': 'tomato', 'कांदा': 'onion',
    'मिरची': 'chilli', 'द्राक्षे': 'grapes', 'केळी': 'banana',
    'बाजरी': 'bajra', 'ज्वारी': 'jowar',
    
    // Hindi
    'गन्ना': 'sugarcane', 'कपास': 'cotton',
    'गेहूं': 'wheat', 'मक्का': 'maize', 'टमाटर': 'tomato',
    'प्याज': 'onion', 'मिर्च': 'chilli',
    
    // English
    'sugarcane': 'sugarcane', 'cotton': 'cotton', 'soybean': 'soybean',
    'wheat': 'wheat', 'rice': 'rice', 'maize': 'maize', 'corn': 'maize',
    'tomato': 'tomato', 'onion': 'onion', 'chilli': 'chilli',
    'grapes': 'grapes', 'banana': 'banana'
  };
  
  const lowerText = text.toLowerCase();
  
  for (const [pattern, cropName] of Object.entries(cropPatterns)) {
    if (lowerText.includes(pattern.toLowerCase())) {
      return cropName;
    }
  }
  
  return undefined;
}

function extractRawSymptomText(text: string): string[] {
  const symptoms: string[] = [];
  
  // Split by sentence and clause markers
  const clauses = text.split(/[।,.;?!|]/).filter(c => c.trim().length > 3);
  
  for (const clause of clauses) {
    const trimmed = clause.trim();
    // Only include clauses that seem to describe symptoms (contain relevant words)
    if (trimmed.length > 5 && trimmed.length < 150) {
      symptoms.push(trimmed);
    }
  }
  
  // If no clauses found, use the whole text
  if (symptoms.length === 0 && text.trim().length > 0) {
    symptoms.push(text.trim());
  }
  
  return symptoms;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION
// CRITICAL FIX: Now accepts landContext as PRIMARY crop source
// ═══════════════════════════════════════════════════════════════════════════

export interface LandContextForExtraction {
  current_crop?: string;
  crop_code?: string;
  growth_stage?: string;
  days_since_sowing?: number;
}

export function extractObservations(
  normalizedText: string,
  detectedLanguage: string,
  landContext?: LandContextForExtraction
): ObservationExtraction {
  const rawSymptomText = extractRawSymptomText(normalizedText);
  
  // CRITICAL FIX (Issue #2): Use land context as PRIMARY source for crop
  // Only infer from text if land context is not available
  const cropFromLandContext = landContext?.current_crop || landContext?.crop_code;
  const cropFromText = extractCropMention(normalizedText);
  
  // Priority: LandContext > TextInference
  const finalCrop = cropFromLandContext || cropFromText;
  
  console.log(`   📋 [ObservationExtractor] Crop resolution:
     - Land context: ${cropFromLandContext || 'NOT_AVAILABLE'}
     - Text inference: ${cropFromText || 'NOT_FOUND'}
     - Final crop: ${finalCrop || 'UNKNOWN'}`);
  
  return {
    crop_mentioned: finalCrop,
    raw_symptom_text: rawSymptomText || [],
    affected_part: extractAffectedPart(normalizedText),
    symptom_distribution: extractDistribution(normalizedText),
    severity_words: extractSeverityWords(normalizedText, detectedLanguage) || [],
    time_reference: extractTimeReference(normalizedText),
    action_taken: extractActionsTaken(normalizedText, detectedLanguage) || [],
    uncertainty_markers: extractUncertaintyMarkers(normalizedText, detectedLanguage) || [],
    detected_language: detectedLanguage,
    observation_count: (rawSymptomText || []).length
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION - ENSURE NO FORBIDDEN FIELDS
// ═══════════════════════════════════════════════════════════════════════════

export function validateObservationExtraction(extraction: ObservationExtraction): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check that raw_symptom_text exists and is an array
  if (!Array.isArray(extraction.raw_symptom_text)) {
    errors.push('raw_symptom_text must be an array');
  }
  
  // Ensure no forbidden fields snuck in
  const obj = extraction as any;
  const forbiddenFields = ['pest', 'disease', 'deficiency', 'pest_code', 'disease_code', 'cause', 'diagnosis'];
  
  for (const field of forbiddenFields) {
    if (obj[field] !== undefined) {
      errors.push(`Forbidden field found: ${field}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  extractObservations,
  validateObservationExtraction,
  OBSERVATION_EXTRACTOR_VERSION
};

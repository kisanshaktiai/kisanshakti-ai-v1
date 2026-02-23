/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LANGUAGE QUALITY VALIDATOR - Post-LLM Response Validation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PART 5 of KisanShakti comprehensive fix:
 * - Gibberish detection for Marathi/Hindi
 * - Grammar structure validation
 * - Technical term consistency
 * - Contradiction detection
 * 
 * VERSION: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// TECHNICAL TERM TRANSLATIONS (FIXED - LLM should not improvise)
// ═══════════════════════════════════════════════════════════════════════════

export const FIXED_TRANSLATIONS: Record<string, { mr: string; hi: string }> = {
  // Application methods
  'FOLIAR_SPRAY': { mr: 'पर्णीय फवारणी', hi: 'पर्णीय छिड़काव' },
  'SOIL_APPLICATION': { mr: 'जमिनीत देणे', hi: 'मिट्टी में डालना' },
  'SOIL_DRENCH': { mr: 'जमिनीत ओतणे', hi: 'मिट्टी में सींचना' },
  'GRANULAR_APPLICATION': { mr: 'दाणेदार औषध देणे', hi: 'दानेदार दवा डालना' },
  'WHORL_APPLICATION': { mr: 'गाभ्यात टाकणे', hi: 'पोंगली में डालना' },
  
  // Formulations
  'GRANULES': { mr: 'दाणे', hi: 'दाने' },
  'POWDER': { mr: 'भुकटी', hi: 'पाउडर' },
  'LIQUID': { mr: 'द्रव', hi: 'तरल' },
  'SUSPENSION': { mr: 'निलंबन', hi: 'निलंबन' },
  
  // Products (keep English name, explain in local)
  'CARBOFURAN': { mr: 'कार्बोफ्युरान', hi: 'कार्बोफ्यूरान' },
  'CHLORANTRANILIPROLE': { mr: 'क्लोरॅन्ट्रानिलिप्रोल', hi: 'क्लोरैंट्रानिलिप्रोल' },
  'FIPRONIL': { mr: 'फिप्रोनिल', hi: 'फिप्रोनिल' },
  'IMIDACLOPRID': { mr: 'इमिडाक्लोप्रिड', hi: 'इमिडाक्लोप्रिड' },
  'THIAMETHOXAM': { mr: 'थायमेथॉक्सम', hi: 'थायमेथॉक्सम' },
  
  // Pest names
  'SHOOT_BORER': { mr: 'खोड किडा / शूट बोरर', hi: 'तना छेदक' },
  'STEM_BORER': { mr: 'खोड किडा', hi: 'तना छेदक' },
  'WHITEFLY': { mr: 'पांढरी माशी', hi: 'सफेद मक्खी' },
  'APHID': { mr: 'मावा', hi: 'माहूं' },
  'THRIPS': { mr: 'तुडतुडे', hi: 'थ्रिप्स' },
  
  // Timing
  'MORNING': { mr: 'सकाळी', hi: 'सुबह' },
  'EVENING': { mr: 'संध्याकाळी', hi: 'शाम को' },
  'WEEKLY': { mr: 'दर आठवड्याला', hi: 'हर हफ्ते' },
};

// ═══════════════════════════════════════════════════════════════════════════
// GIBBERISH DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const GIBBERISH_PATTERNS = {
  // Impossible word combinations in Marathi
  mr: [
    /पाऊडर.*पाऊस/i,           // powder + rain - nonsense
    /फवारणी.*पाऊस.*वाट.*पहा/i, // spray + rain + wait - contradictory
    /कापणी.*पाऊस.*वाट/i,      // harvest + rain + wait - confusing
    /(\w+)\s+\1\s+\1/i,        // Triple word repetition
    /पाऊडरा\s*सवकार/i,        // Gibberish pattern detected in logs
    /श्रावण.*कापणी/i,          // Wrong season + harvest
  ],
  
  // Impossible word combinations in Hindi
  hi: [
    /पाउडर.*बारिश/i,
    /छिड़काव.*बारिश.*इंतजार/i,
    /कटाई.*बारिश.*इंतजार/i,
    /(\w+)\s+\1\s+\1/i,
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTRADICTORY ACTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const CONTRADICTORY_PATTERNS = {
  mr: [
    // "Spray" and "wait for rain" together
    { pattern: /फवारणी\s*करा.*पाऊस.*वाट/i, reason: 'spray_and_wait_rain' },
    { pattern: /पाऊस.*वाट.*फवारणी/i, reason: 'wait_rain_and_spray' },
    // "Apply immediately" and "wait" together
    { pattern: /ताबडतोब.*थांबा|थांबा.*ताबडतोब/i, reason: 'immediate_and_wait' },
    // "Harvest" and "sowing" in same sentence
    { pattern: /कापणी.*पेरणी|पेरणी.*कापणी/i, reason: 'harvest_and_sow' },
  ],
  hi: [
    { pattern: /छिड़काव\s*करें.*बारिश.*इंतजार/i, reason: 'spray_and_wait_rain' },
    { pattern: /तुरंत.*रुकें|रुकें.*तुरंत/i, reason: 'immediate_and_wait' },
    { pattern: /कटाई.*बुवाई|बुवाई.*कटाई/i, reason: 'harvest_and_sow' },
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// GRAMMAR STRUCTURE PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

// Marathi sentences should end with verb forms
const MARATHI_SENTENCE_ENDINGS = [
  /करा\.?$/,    // do (imperative)
  /द्या\.?$/,    // give (imperative)
  /ठेवा\.?$/,    // keep
  /पहा\.?$/,    // see
  /आहे\.?$/,   // is
  /नाही\.?$/,  // not
  /होते\.?$/,  // was
  /शकता\.?$/, // can
  /असतो\.?$/, // exists
  /येईल\.?$/, // will come
];

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RESULT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface LanguageValidationResult {
  is_valid: boolean;
  issues: LanguageIssue[];
  confidence_score: number;  // 0-1
  should_regenerate: boolean;
  corrected_text?: string;
}

export interface LanguageIssue {
  type: 'GIBBERISH' | 'CONTRADICTION' | 'GRAMMAR' | 'INCONSISTENT_TERM';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  location?: string;
  suggestion?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function validateLanguageQuality(
  text: string,
  language: string
): LanguageValidationResult {
  const issues: LanguageIssue[] = [];
  let confidenceScore = 1.0;
  
  console.log(`🔤 [LanguageValidator] Validating ${language} text (${text.length} chars)...`);
  
  // Skip validation for English (less likely to have these issues)
  if (language === 'en') {
    return {
      is_valid: true,
      issues: [],
      confidence_score: 1.0,
      should_regenerate: false
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 1: Gibberish Detection
  // ═══════════════════════════════════════════════════════════════════════════
  
  const gibberishPatterns = GIBBERISH_PATTERNS[language] || [];
  for (const pattern of gibberishPatterns) {
    if (pattern.test(text)) {
      issues.push({
        type: 'GIBBERISH',
        severity: 'HIGH',
        description: `Detected potential gibberish pattern: ${pattern.source}`,
        suggestion: 'Regenerate with stricter language constraints'
      });
      confidenceScore -= 0.3;
      console.log(`   ⚠️ Gibberish detected: ${pattern.source}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 2: Contradictory Actions
  // ═══════════════════════════════════════════════════════════════════════════
  
  const contradictions = CONTRADICTORY_PATTERNS[language] || [];
  for (const { pattern, reason } of contradictions) {
    if (pattern.test(text)) {
      issues.push({
        type: 'CONTRADICTION',
        severity: 'HIGH',
        description: `Contradictory actions detected: ${reason}`,
        suggestion: 'Separate into distinct, non-contradictory instructions'
      });
      confidenceScore -= 0.25;
      console.log(`   ⚠️ Contradiction detected: ${reason}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 3: Excessive Repetition
  // ═══════════════════════════════════════════════════════════════════════════
  
  const words = text.split(/\s+/);
  const wordCounts: Record<string, number> = {};
  
  for (const word of words) {
    if (word.length > 3) {  // Only count meaningful words
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }
  
  for (const [word, count] of Object.entries(wordCounts)) {
    if (count > 5 && words.length < 200) {  // Excessive repetition
      issues.push({
        type: 'GIBBERISH',
        severity: 'MEDIUM',
        description: `Word \"${word}\" repeated ${count} times excessively`,
        suggestion: 'Reduce repetition for clarity'
      });
      confidenceScore -= 0.1;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 4: Sentence Structure (Marathi specific)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (language === 'mr') {
    const sentences = text.split(/[।\.\n]+/).filter(s => s.trim().length > 10);
    let malformedCount = 0;
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      // Check if sentence ends with valid Marathi verb form
      const hasValidEnding = MARATHI_SENTENCE_ENDINGS.some(pattern => pattern.test(trimmed));
      
      if (!hasValidEnding && !trimmed.match(/[!?]$/)) {
        malformedCount++;
      }
    }
    
    if (malformedCount > sentences.length * 0.5) {
      issues.push({
        type: 'GRAMMAR',
        severity: 'MEDIUM',
        description: `${malformedCount}/${sentences.length} sentences may have incomplete grammar`,
        suggestion: 'Ensure each sentence ends with proper verb form'
      });
      confidenceScore -= 0.15;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 5: Empty or Too Short Response
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (text.trim().length < 50) {
    issues.push({
      type: 'GRAMMAR',
      severity: 'HIGH',
      description: 'Response is too short to be helpful',
      suggestion: 'Regenerate with more detailed response'
    });
    confidenceScore -= 0.3;
  }
  
  // Determine if regeneration is needed
  const hasHighSeverityIssues = issues.some(i => i.severity === 'HIGH');
  const tooManyIssues = issues.length >= 3;
  const shouldRegenerate = hasHighSeverityIssues || tooManyIssues || confidenceScore < 0.5;
  
  console.log(`   ✅ Validation complete: ${issues.length} issues, confidence=${(confidenceScore * 100).toFixed(0)}%`);
  
  return {
    is_valid: confidenceScore >= 0.6,
    issues,
    confidence_score: Math.max(0, confidenceScore),
    should_regenerate: shouldRegenerate
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TERM REPLACEMENT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function enforceTermConsistency(
  text: string,
  language: string
): string {
  if (language === 'en') return text;
  
  let result = text;
  
  // Replace any inconsistent translations with fixed ones
  for (const [term, translations] of Object.entries(FIXED_TRANSLATIONS)) {
    const translation = translations[language];
    if (!translation) continue;
    
    // If the English term appears, replace with proper translation
    const termPattern = new RegExp(term.replace(/_/g, '[_\\s]'), 'gi');
    if (termPattern.test(result)) {
      result = result.replace(termPattern, translation);
    }
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFE FALLBACK MESSAGE
// ═══════════════════════════════════════════════════════════════════════════

export function getSafeAskMoreInfoMessage(language: string): string {
  const messages: Record<string, string> = {
    mr: '🙏 कृपया तुमच्या समस्येबद्दल अधिक माहिती द्या किंवा फोटो पाठवा. मी योग्य सल्ला देईन.',
    hi: '🙏 कृपया अपनी समस्या के बारे में अधिक जानकारी दें या फोटो भेजें। मैं सही सलाह दूंगा।',
    en: '🙏 Please provide more details about your issue or send a photo. I will give you accurate advice.'
  };
  return messages[language] || messages.en;
}

export default validateLanguageQuality;

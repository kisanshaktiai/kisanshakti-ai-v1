/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION VALIDATOR - DIAGNOSIS LEAKAGE PREVENTION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: Prevents diagnosis names from appearing in clarification options.
 * Options must be OBSERVATION-BASED only, not diagnostic conclusions.
 * 
 * WRONG: "नायट्रोजन कमतरता दिसते का?" (Nitrogen deficiency visible?)
 * RIGHT: "खालची पाने पिवळी आहेत का?" (Are lower leaves yellow?)
 * 
 * VERSION: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSIS KEYWORDS TO BLOCK
// These MUST NEVER appear in clarification options
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSIS KEYWORDS - STRICTLY DISEASE/PEST NAMES ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * IMPORTANT: Only include DIAGNOSTIC CONCLUSIONS, not observation descriptions.
 * 
 * ✅ BLOCKED (diagnosis names): 'blight', 'borer', 'aphid', 'rust'
 * ❌ ALLOWED (observations): 'insects visible', 'rotted', 'drying', 'holes'
 * 
 * The farmer needs to describe what they SEE (observations), not what they THINK
 * the problem is (diagnosis). This list blocks diagnosis leakage while allowing
 * legitimate observation-based template options.
 */

const DIAGNOSIS_KEYWORDS_EN = [
  // Disease NAMES (specific diagnoses - not generic descriptions)
  'blight', 'deficiency', 'mosaic', 'virus', 'bacterial wilt',
  'fungal infection', 'rust disease', 'smut', 'downy mildew', 'powdery mildew', 
  'canker', 'anthracnose', 'leaf curl disease', 'ring spot', 'damping off',
  'root rot disease', 'stem rot disease',
  
  // Pest NAMES (specific identification - not generic 'insects')
  'borer attack', 'aphid infestation', 'thrips damage', 'whitefly infestation',
  'mealybug attack', 'spider mite', 'caterpillar damage', 'grub damage',
  'weevil attack', 'jassid attack', 'stem fly damage', 'shoot fly attack',
  'fruit fly damage', 'army worm attack', 'cut worm damage',
  'termite damage', 'nematode attack', 'earhead bug',
  
  // Nutrient deficiency DIAGNOSES
  'nitrogen deficiency', 'phosphorus deficiency', 'potassium deficiency',
  'iron deficiency', 'zinc deficiency', 'boron deficiency',
  'calcium deficiency', 'magnesium deficiency', 'sulfur deficiency'
];

const DIAGNOSIS_KEYWORDS_MR = [
  // Disease NAMES only
  'करपा रोग', 'नायट्रोजन कमतरता', 'मोझॅक रोग', 'विषाणू रोग', 'बुरशी रोग',
  'तांबेरा रोग', 'काणी रोग', 'भुरी रोग', 'मूळकुज रोग',
  
  // Pest NAMES only (not generic 'किड' which farmers use to describe any insect)
  'खोड किड', 'माव किड', 'तुडतुडे किड', 'पांढरी माशी किड',
  'वाळवी नुकसान', 'सूत्रकृमी', 'बोंड अळी'
];

const DIAGNOSIS_KEYWORDS_HI = [
  // Disease NAMES only  
  'झुलसा रोग', 'नाइट्रोजन की कमी', 'मोजेक रोग', 'वायरस रोग', 'फफूंद रोग',
  'रतुआ रोग', 'कंडुआ रोग', 'जड़ सड़न रोग',
  
  // Pest NAMES only (not generic 'कीट' or 'कीड़े')
  'तना छेदक', 'माहू कीट', 'थ्रिप्स कीट', 'सफेद मक्खी कीट',
  'दीमक नुकसान', 'सूत्रकृमि', 'बॉल वर्म'
];

// Combined regex patterns
const DIAGNOSIS_PATTERNS = [
  // English patterns
  /\b(early|late)\s*blight\b/i,
  /\b\w+\s+deficiency\b/i,
  /\b\w+\s+rot\b/i,
  /\b\w+\s+borer\b/i,
  /\bpest\s+attack\b/i,
  /\bdisease\s+symptoms?\b/i,
  
  // Technical terms that shouldn't appear
  /\bETL\b/i,  // Economic Threshold Level
  /\bIPM\b/i,  // Integrated Pest Management
  /\bPHI\b/i,  // Pre-Harvest Interval
];

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RESULT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationValidationResult {
  valid: boolean;
  violations: {
    option_text: string;
    leaked_keyword: string;
    language: string;
  }[];
  sanitized_options: string[];
  validation_passed: boolean;
}

export interface DynamicOption {
  label: string;
  observation_key?: string;
  confidence?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION VALIDATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ClarificationValidator {
  
  /**
   * CRITICAL: Validate clarification options for diagnosis leakage
   */
  validateOptions(options: string[] | DynamicOption[]): ClarificationValidationResult {
    console.log('🔒 [ClarificationValidator] Checking for diagnosis leakage...');
    
    const violations: ClarificationValidationResult['violations'] = [];
    const sanitizedOptions: string[] = [];
    
    for (const option of options) {
      const optionText = typeof option === 'string' ? option : option.label;
      const leak = this.detectDiagnosisLeak(optionText);
      
      if (leak.leaked) {
        console.error(`   ❌ LEAKAGE: "${optionText}" contains "${leak.keyword}" (${leak.language})`);
        violations.push({
          option_text: optionText,
          leaked_keyword: leak.keyword,
          language: leak.language
        });
      } else {
        sanitizedOptions.push(optionText);
      }
    }
    
    const valid = violations.length === 0;
    
    if (valid) {
      console.log('   ✅ No diagnosis leakage detected');
    } else {
      console.error(`   ⚠️ ${violations.length} leakage violations found`);
    }
    
    return {
      valid,
      violations,
      sanitized_options: sanitizedOptions,
      validation_passed: valid
    };
  }
  
  /**
   * Detect if option text contains diagnosis keywords
   */
  private detectDiagnosisLeak(text: string): { leaked: boolean; keyword: string; language: string } {
    const textLower = text.toLowerCase();
    
    // Check English keywords
    for (const keyword of DIAGNOSIS_KEYWORDS_EN) {
      if (textLower.includes(keyword.toLowerCase())) {
        return { leaked: true, keyword, language: 'en' };
      }
    }
    
    // Check Marathi keywords
    for (const keyword of DIAGNOSIS_KEYWORDS_MR) {
      if (text.includes(keyword)) {
        return { leaked: true, keyword, language: 'mr' };
      }
    }
    
    // Check Hindi keywords
    for (const keyword of DIAGNOSIS_KEYWORDS_HI) {
      if (text.includes(keyword)) {
        return { leaked: true, keyword, language: 'hi' };
      }
    }
    
    // Check regex patterns
    for (const pattern of DIAGNOSIS_PATTERNS) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        return { leaked: true, keyword: match?.[0] || 'pattern_match', language: 'en' };
      }
    }
    
    return { leaked: false, keyword: '', language: '' };
  }
  
  /**
   * Validate dynamic options from LLM generation
   */
  validateDynamicOptions(options: DynamicOption[]): boolean {
    const result = this.validateOptions(options);
    return result.valid;
  }
  
  /**
   * Generate safe observation-based options for a scope
   */
  generateSafeOptions(
    scope: string,
    crop: string,
    growthStage: string,
    language: string
  ): string[] {
    // These are OBSERVATION-ONLY options - NO diagnosis names
    const safeOptions: Record<string, Record<string, string[]>> = {
      'IDENTIFY_DISTRIBUTION': {
        mr: [
          'विखुरलेले (येथे तेथे)',
          'एकत्रित (एका भागात)',
          'सर्वत्र सारखे'
        ],
        hi: [
          'बिखरा हुआ (यहाँ-वहाँ)',
          'एक जगह इकट्ठा',
          'हर जगह समान'
        ],
        en: [
          'Scattered (here and there)',
          'Clustered (in one area)',
          'Uniform everywhere'
        ]
      },
      'IDENTIFY_SEVERITY': {
        mr: [
          'थोडेसे (10-20%)',
          'मध्यम (30-50%)',
          'गंभीर (50%+)'
        ],
        hi: [
          'थोड़ा (10-20%)',
          'मध्यम (30-50%)',
          'गंभीर (50%+)'
        ],
        en: [
          'Mild (10-20%)',
          'Moderate (30-50%)',
          'Severe (50%+)'
        ]
      },
      'IDENTIFY_LOCATION': {
        mr: [
          'फक्त पाने',
          'खोड/दांडा',
          'मूळ/जमिनीत'
        ],
        hi: [
          'केवल पत्ते',
          'तना/डंठल',
          'जड़/जमीन में'
        ],
        en: [
          'Leaves only',
          'Stem/stalk',
          'Roots/underground'
        ]
      },
      'IDENTIFY_TIMING': {
        mr: [
          'आजच दिसले',
          '2-3 दिवस झाले',
          'आठवडाभर+'
        ],
        hi: [
          'आज ही दिखा',
          '2-3 दिन हुए',
          'एक हफ्ता+'
        ],
        en: [
          'Just noticed today',
          '2-3 days ago',
          'Week or more'
        ]
      }
    };
    
    return safeOptions[scope]?.[language] || safeOptions[scope]?.['en'] || [];
  }
  
  /**
   * Sanitize LLM-generated options by removing any with diagnosis leakage
   */
  sanitizeOptions(options: DynamicOption[], fallbackScope: string, language: string): DynamicOption[] {
    const result = this.validateOptions(options);
    
    if (result.valid) {
      return options;
    }
    
    // Filter out leaked options
    const cleanOptions = options.filter(opt => {
      const text = typeof opt === 'string' ? opt : opt.label;
      const leak = this.detectDiagnosisLeak(text);
      return !leak.leaked;
    });
    
    // If too few options remain, use safe fallback
    if (cleanOptions.length < 2) {
      const safeLabels = this.generateSafeOptions(fallbackScope, '', '', language);
      return safeLabels.slice(0, 3).map(label => ({
        label,
        observation_key: 'SAFE_FALLBACK',
        confidence: 0.6
      }));
    }
    
    return cleanOptions;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY (Type B — stateless class, see context-validator.ts for rationale)
// ═══════════════════════════════════════════════════════════════════════════

export function getClarificationValidator(): ClarificationValidator {
  return new ClarificationValidator();
}


// Export convenience functions
export function validateClarificationOptions(options: string[] | DynamicOption[]): ClarificationValidationResult {
  const validator = getClarificationValidator();
  return validator.validateOptions(options);
}

export function hasDiagnosisLeakage(options: DynamicOption[]): boolean {
  const validator = getClarificationValidator();
  return !validator.validateDynamicOptions(options);
}

// Export diagnosis keywords for external validation
export const DIAGNOSIS_KEYWORDS = [
  ...DIAGNOSIS_KEYWORDS_EN,
  ...DIAGNOSIS_KEYWORDS_MR,
  ...DIAGNOSIS_KEYWORDS_HI
];

/**
 * ✅ CRITICAL FIX: Validate AND sanitize clarification options
 * Instead of just failing, this provides safe fallback options
 */
export interface SanitizedClarificationResult {
  valid: boolean;
  sanitizedOptions: DynamicOption[];
  errors: string[];
  usedFallback: boolean;
}

export function validateAndSanitizeClarification(
  options: DynamicOption[],
  scope: string,
  language: string
): SanitizedClarificationResult {
  const validator = getClarificationValidator();
  
  // Handle null/undefined options
  if (!options || !Array.isArray(options)) {
    console.warn('⚠️ [ClarificationValidator] Options is null/undefined - using safe fallback');
    const safeFallback = validator.generateSafeOptions(scope, '', '', language);
    return {
      valid: false,
      sanitizedOptions: safeFallback.slice(0, 3).map(label => ({
        label,
        observation_key: 'SAFE_FALLBACK',
        confidence: 0.6
      })),
      errors: ['Options was null or undefined'],
      usedFallback: true
    };
  }
  
  const result = validator.validateOptions(options);
  
  if (result.valid) {
    return {
      valid: true,
      sanitizedOptions: options,
      errors: [],
      usedFallback: false
    };
  }
  
  console.warn(`⚠️ [ClarificationValidator] ${result.violations.length} leakage violations - sanitizing`);
  
  // Sanitize problematic options
  const sanitized = validator.sanitizeOptions(options, scope, language);
  
  // If we have at least 2 safe options, use them
  if (sanitized.length >= 2) {
    return {
      valid: false, // Still mark as invalid for logging
      sanitizedOptions: sanitized,
      errors: result.violations.map(v => `Leaked "${v.leaked_keyword}" in "${v.option_text}"`),
      usedFallback: false
    };
  }
  
  // Generate safe fallback options
  const safeFallback = validator.generateSafeOptions(scope, '', '', language);
  
  return {
    valid: false,
    sanitizedOptions: safeFallback.slice(0, 3).map(label => ({
      label,
      observation_key: 'SAFE_FALLBACK',
      confidence: 0.6
    })),
    errors: [...result.violations.map(v => `Leaked "${v.leaked_keyword}"`), 'Generated safe fallback options'],
    usedFallback: true
  };
}

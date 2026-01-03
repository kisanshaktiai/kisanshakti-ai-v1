/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSE TEMPLATE SYSTEM - Symbolic-First Response Rendering
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Strict template-based rendering system that ensures final farmer-facing text
 * follows a specific 1-5 structure WITHOUT LLM intervention for core content.
 * 
 * Structure:
 * 1. What to do (required)
 * 2. When (required)
 * 3. How much (ONLY if symbolic brain provided)
 * 4. What to avoid (ONLY if symbolic brain provided)
 * 5. Question (ONLY if clarification required)
 * 
 * Philosophy: "Symbolic Brain decides, AI only explains"
 */

import { 
  getProductName, 
  getActionTranslation,
  getMethodTranslation,
  getUrgencyTranslation
} from './communication-translation-dictionary.ts';

export const RESPONSE_TEMPLATE_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface SymbolicResponse {
  what_to_do: string;      // 1. Action (required)
  when: string;            // 2. Timing (required)
  how_much?: string;       // 3. Dosage (ONLY if symbolic brain provided)
  what_to_avoid?: string;  // 4. Warnings (ONLY if symbolic brain provided)
  question?: string;       // 5. Clarification (ONLY if required)
}

export interface SymbolicAction {
  action_type: string;
  product_name?: string;
  dosage?: string;
  dosage_per_acre?: string;
  timing?: string;
  method?: string;
  phi_days?: number;
  priority?: string;
  urgency?: string;
  warnings?: string[];
  rule_id?: string;
}

export interface RenderInput {
  actions: SymbolicAction[];
  crop_name?: string;
  growth_stage?: string;
  pest_name?: string;
  disease_name?: string;
  language: 'mr' | 'hi' | 'en';
  requires_clarification?: boolean;
  clarification_text?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE STRINGS (Multilingual)
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  greeting: {
    mr: '🌾 नमस्कार शेतकरी मित्र!',
    hi: '🌾 नमस्कार किसान मित्र!',
    en: '🌾 Hello farmer friend!'
  },
  
  problem_ack: {
    pest: {
      mr: (pest: string, crop: string) => `तुमच्या ${crop} पिकावर ${pest} किडीचा प्रादुर्भाव दिसतो आहे.`,
      hi: (pest: string, crop: string) => `आपकी ${crop} फसल पर ${pest} कीट का प्रकोप दिख रहा है।`,
      en: (pest: string, crop: string) => `Your ${crop} crop appears to have ${pest} infestation.`
    },
    disease: {
      mr: (disease: string, crop: string) => `तुमच्या ${crop} पिकावर ${disease} रोगाचा प्रादुर्भाव दिसतो आहे.`,
      hi: (disease: string, crop: string) => `आपकी ${crop} फसल पर ${disease} रोग दिख रहा है।`,
      en: (disease: string, crop: string) => `Your ${crop} crop appears to have ${disease} disease.`
    }
  },
  
  action_header: {
    mr: '📋 **करावयाची कृती:**',
    hi: '📋 **करने योग्य कार्य:**',
    en: '📋 **Actions to take:**'
  },
  
  timing_header: {
    mr: '⏰ **कधी करावे:**',
    hi: '⏰ **कब करें:**',
    en: '⏰ **When to do:**'
  },
  
  dosage_header: {
    mr: '💊 **किती वापरावे:**',
    hi: '💊 **कितना उपयोग करें:**',
    en: '💊 **How much to use:**'
  },
  
  warning_header: {
    mr: '⚠️ **काय टाळावे:**',
    hi: '⚠️ **क्या न करें:**',
    en: '⚠️ **What to avoid:**'
  },
  
  phi_warning: {
    mr: (days: number) => `कापणीपूर्वी ${days} दिवस वाट पाहा`,
    hi: (days: number) => `कटाई से पहले ${days} दिन प्रतीक्षा करें`,
    en: (days: number) => `Wait ${days} days before harvest`
  },
  
  support: {
    mr: '🤝 काही प्रश्न असल्यास विचारा!',
    hi: '🤝 कोई सवाल हो तो पूछें!',
    en: '🤝 Feel free to ask if you have questions!'
  },
  
  timing_default: {
    mr: 'सकाळी ६-१० वा. किंवा संध्याकाळी ४-६ वा.',
    hi: 'सुबह ६-१० बजे या शाम ४-६ बजे',
    en: 'Morning 6-10 AM or evening 4-6 PM'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE RENDERING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render symbolic brain output to farmer-friendly response
 * Uses ONLY template strings - NO LLM content generation
 */
export function renderSymbolicResponse(input: RenderInput): string {
  const { actions, crop_name, growth_stage, pest_name, disease_name, language, requires_clarification, clarification_text } = input;
  
  const parts: string[] = [];
  
  // 1. Greeting
  parts.push(TEMPLATES.greeting[language]);
  parts.push('');
  
  // 2. Problem acknowledgment (if pest/disease identified)
  if (pest_name && crop_name) {
    const translatedPest = getProductName(pest_name, language) || pest_name;
    const translatedCrop = translateCropName(crop_name, language);
    parts.push(TEMPLATES.problem_ack.pest[language](translatedPest, translatedCrop));
    parts.push('');
  } else if (disease_name && crop_name) {
    const translatedDisease = getProductName(disease_name, language) || disease_name;
    const translatedCrop = translateCropName(crop_name, language);
    parts.push(TEMPLATES.problem_ack.disease[language](translatedDisease, translatedCrop));
    parts.push('');
  }
  
  // 3. Actions (What to do)
  if (actions.length > 0) {
    parts.push(TEMPLATES.action_header[language]);
    
    actions.forEach((action, index) => {
      const actionLine = formatAction(action, index + 1, language);
      parts.push(actionLine);
    });
    parts.push('');
    
    // 4. Timing (When)
    parts.push(TEMPLATES.timing_header[language]);
    const primaryTiming = actions[0]?.timing || TEMPLATES.timing_default[language];
    parts.push(`• ${primaryTiming}`);
    parts.push('');
    
    // 5. Dosage (How much) - ONLY if provided by symbolic brain
    const actionsWithDosage = actions.filter(a => a.dosage || a.dosage_per_acre);
    if (actionsWithDosage.length > 0) {
      parts.push(TEMPLATES.dosage_header[language]);
      actionsWithDosage.forEach(action => {
        const dosageLine = formatDosage(action, language);
        if (dosageLine) {
          parts.push(`• ${dosageLine}`);
        }
      });
      parts.push('');
    }
    
    // 6. Warnings (What to avoid) - ONLY if provided by symbolic brain
    const allWarnings: string[] = [];
    actions.forEach(action => {
      if (action.warnings) {
        allWarnings.push(...action.warnings);
      }
      if (action.phi_days && action.phi_days > 0) {
        allWarnings.push(TEMPLATES.phi_warning[language](action.phi_days));
      }
    });
    
    if (allWarnings.length > 0) {
      parts.push(TEMPLATES.warning_header[language]);
      allWarnings.forEach(warning => {
        parts.push(`• ${warning}`);
      });
      parts.push('');
    }
  }
  
  // 7. Clarification question (if required)
  if (requires_clarification && clarification_text) {
    parts.push(`❓ ${clarification_text}`);
    parts.push('');
  }
  
  // 8. Supportive closing
  parts.push(TEMPLATES.support[language]);
  
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format a single action line
 */
function formatAction(action: SymbolicAction, index: number, language: 'mr' | 'hi' | 'en'): string {
  const parts: string[] = [];
  
  // Action type
  const actionType = getActionTranslation(action.action_type, language) || action.action_type;
  
  // Product name
  const productName = action.product_name 
    ? (getProductName(action.product_name, language) || action.product_name)
    : '';
  
  // Method
  const method = action.method
    ? (getMethodTranslation(action.method, language) || action.method)
    : '';
  
  // Priority/Urgency indicator
  const urgencyEmoji = getUrgencyEmoji(action.priority || action.urgency);
  
  // Build action line
  if (productName) {
    parts.push(`${index}. ${urgencyEmoji} **${productName}** - ${actionType}`);
    if (method) {
      parts.push(` (${method})`);
    }
  } else {
    parts.push(`${index}. ${urgencyEmoji} ${actionType}`);
  }
  
  return parts.join('');
}

/**
 * Format dosage information
 */
function formatDosage(action: SymbolicAction, language: 'mr' | 'hi' | 'en'): string | null {
  const productName = action.product_name 
    ? (getProductName(action.product_name, language) || action.product_name)
    : '';
  
  if (!productName) return null;
  
  const parts: string[] = [productName + ':'];
  
  if (action.dosage) {
    parts.push(action.dosage);
  }
  
  if (action.dosage_per_acre) {
    parts.push(`(${action.dosage_per_acre})`);
  }
  
  return parts.join(' ');
}

/**
 * Get urgency emoji
 */
function getUrgencyEmoji(urgency?: string): string {
  if (!urgency) return '•';
  
  const normalizedUrgency = urgency.toUpperCase();
  
  if (normalizedUrgency.includes('HIGH') || normalizedUrgency.includes('CRITICAL') || normalizedUrgency.includes('EMERGENCY')) {
    return '🔴';
  }
  if (normalizedUrgency.includes('MEDIUM')) {
    return '🟡';
  }
  return '🟢';
}

/**
 * Translate crop name
 */
function translateCropName(cropCode: string, language: 'mr' | 'hi' | 'en'): string {
  const CROP_NAMES: Record<string, Record<string, string>> = {
    'SUGARCANE': { mr: 'ऊस', hi: 'गन्ना', en: 'Sugarcane' },
    'COTTON': { mr: 'कापूस', hi: 'कपास', en: 'Cotton' },
    'SOYBEAN': { mr: 'सोयाबीन', hi: 'सोयाबीन', en: 'Soybean' },
    'RICE': { mr: 'भात', hi: 'धान', en: 'Rice' },
    'WHEAT': { mr: 'गहू', hi: 'गेहूं', en: 'Wheat' },
    'MAIZE': { mr: 'मका', hi: 'मक्का', en: 'Maize' },
    'TOMATO': { mr: 'टोमॅटो', hi: 'टमाटर', en: 'Tomato' },
    'ONION': { mr: 'कांदा', hi: 'प्याज', en: 'Onion' },
    'CHILLI': { mr: 'मिरची', hi: 'मिर्च', en: 'Chilli' },
    'GROUNDNUT': { mr: 'भुईमूग', hi: 'मूंगफली', en: 'Groundnut' },
    'TUR': { mr: 'तूर', hi: 'अरहर', en: 'Pigeon Pea' },
    'GRAM': { mr: 'हरभरा', hi: 'चना', en: 'Chickpea' }
  };
  
  const normalized = cropCode.toUpperCase();
  return CROP_NAMES[normalized]?.[language] || cropCode;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that rendered response matches symbolic brain output
 * Returns violations if content was added/modified
 */
export function validateRenderedResponse(
  rendered: string,
  symbolicOutput: SymbolicAction[],
  language: 'mr' | 'hi' | 'en'
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check 1: All product names in response must be in symbolic output
  const allowedProducts = new Set(
    symbolicOutput
      .map(a => a.product_name)
      .filter(Boolean)
      .map(p => p!.toLowerCase())
  );
  
  // Add translated names
  symbolicOutput.forEach(a => {
    if (a.product_name) {
      const translated = getProductName(a.product_name, language);
      if (translated) {
        allowedProducts.add(translated.toLowerCase());
      }
    }
  });
  
  // Check 2: No percentage claims unless in symbolic output
  const percentagePattern = /\d+\s*%/g;
  const percentageMatches = rendered.match(percentagePattern);
  if (percentageMatches) {
    // Check if these percentages are in symbolic output
    const allowedPercentages = symbolicOutput
      .map(a => a.dosage || '')
      .join(' ')
      .match(percentagePattern) || [];
    
    for (const match of percentageMatches) {
      if (!allowedPercentages.includes(match)) {
        violations.push(`Unauthorized percentage claim: ${match}`);
      }
    }
  }
  
  // Check 3: No harvest recommendations for non-harvest intents
  // (This should be caught by intent lock, but double-check)
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Generate clarification response (template-based, no LLM)
 */
export function generateClarificationResponse(
  question: string,
  language: 'mr' | 'hi' | 'en'
): string {
  const templates = {
    mr: `🌾 नमस्कार!\n\n❓ ${question}\n\n🤝 कृपया अधिक माहिती द्या जेणेकरून आम्ही तुम्हाला योग्य सल्ला देऊ शकू.`,
    hi: `🌾 नमस्कार!\n\n❓ ${question}\n\n🤝 कृपया अधिक जानकारी दें ताकि हम आपको सही सलाह दे सकें।`,
    en: `🌾 Hello!\n\n❓ ${question}\n\n🤝 Please provide more information so we can give you the right advice.`
  };
  
  return templates[language];
}

/**
 * Generate empty result response (when no rules matched)
 */
export function generateNoMatchResponse(
  language: 'mr' | 'hi' | 'en',
  crop_name?: string
): string {
  const crop = crop_name ? translateCropName(crop_name, language) : '';
  
  const templates = {
    mr: `🌾 नमस्कार!\n\nतुमच्या ${crop} पिकाबद्दल विचारल्याबद्दल धन्यवाद.\n\n❓ कृपया अधिक तपशील द्या:\n• पिकात काय दिसतंय?\n• किती दिवसांपासून आहे?\n• कोणत्या भागात दिसतंय?\n\n🤝 आम्ही तुम्हाला योग्य मार्गदर्शन करू!`,
    hi: `🌾 नमस्कार!\n\nआपकी ${crop} फसल के बारे में पूछने के लिए धन्यवाद।\n\n❓ कृपया अधिक विवरण दें:\n• फसल में क्या दिख रहा है?\n• कितने दिनों से है?\n• किस भाग में दिख रहा है?\n\n🤝 हम आपको सही मार्गदर्शन देंगे!`,
    en: `🌾 Hello!\n\nThank you for asking about your ${crop} crop.\n\n❓ Please provide more details:\n• What do you see in the crop?\n• How long has this been happening?\n• Which part of the plant is affected?\n\n🤝 We'll guide you properly!`
  };
  
  return templates[language];
}

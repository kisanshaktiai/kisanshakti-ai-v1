/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 6: SAFETY ENHANCEMENT MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Provides farmer safety warnings and resistance management validation
 * based on farmer_safety_level, resistance_group, and mode_of_action fields.
 * 
 * FEATURES:
 * 1. Safety Level Warnings - Generate appropriate PPE and safety warnings
 * 2. Resistance Rotation Check - Prevent consecutive use of same IRAC/FRAC group
 * 3. Mode of Action Validation - Ensure proper rotation for resistance management
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const SAFETY_ENHANCEMENT_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// AUDIT FIX: DB stores farmer_safety_level as TEXT (SAFE/CAUTION/EXPERT_ONLY), not integer
export type SafetyLevel = 'SAFE' | 'CAUTION' | 'EXPERT_ONLY';

export interface SafetyInput {
  rule_id: string;
  farmer_safety_level?: SafetyLevel;
  resistance_group?: string;
  mode_of_action?: string;
  active_ingredient?: string;
  bee_toxicity?: 'HIGH' | 'MODERATE' | 'LOW' | 'SAFE';
}

export interface SafetyWarning {
  level: SafetyLevel;
  icon: string;
  warning_mr: string;
  warning_hi: string;
  warning_en: string;
  ppe_required: string[];
}

export interface ResistanceCheckResult {
  rotation_allowed: boolean;
  consecutive_uses: number;
  last_used_date?: string;
  warning?: string;
  alternative_groups?: string[];
}

export interface SafetyValidationResult {
  passed: boolean;
  safety_warning?: SafetyWarning;
  resistance_check?: ResistanceCheckResult;
  combined_message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY LEVEL DEFINITIONS
// Based on WHO/FAO pesticide classification
// ═══════════════════════════════════════════════════════════════════════════

// AUDIT FIX: SafetyLevel is now TEXT from DB (SAFE/CAUTION/EXPERT_ONLY)
const SAFETY_WARNINGS: Record<SafetyLevel, SafetyWarning> = {
  'SAFE': {
    level: 'SAFE' as any,
    icon: '✅',
    warning_mr: 'सुरक्षित - विशेष काळजी आवश्यक नाही',
    warning_hi: 'सुरक्षित - विशेष सावधानी आवश्यक नहीं',
    warning_en: 'Safe - No special precautions needed',
    ppe_required: []
  },
  'CAUTION': {
    level: 'CAUTION' as any,
    icon: '⚠️',
    warning_mr: 'हातमोजे घाला. डोळ्यांपासून दूर ठेवा. फवारणीनंतर हात धुवा.',
    warning_hi: 'दस्ताने पहनें। आंखों से दूर रखें। स्प्रे के बाद हाथ धोएं।',
    warning_en: 'Wear gloves. Keep away from eyes. Wash hands after spraying.',
    ppe_required: ['gloves', 'eye_protection']
  },
  'EXPERT_ONLY': {
    level: 'EXPERT_ONLY' as any,
    icon: '🔴',
    warning_mr: '⚠️ सावधान! मास्क आणि हातमोजे अवश्य घाला. मुले आणि गर्भवती स्त्रियांना दूर ठेवा. फवारणीनंतर कपडे बदला आणि आंघोळ करा.',
    warning_hi: '⚠️ सावधान! मास्क और दस्ताने अवश्य पहनें। बच्चों और गर्भवती महिलाओं को दूर रखें। स्प्रे के बाद कपड़े बदलें और नहाएं।',
    warning_en: '⚠️ CAUTION! Must wear mask and gloves. Keep children and pregnant women away. Change clothes and bathe after spraying.',
    ppe_required: ['mask', 'gloves', 'protective_clothing', 'eye_protection']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMON IRAC/FRAC GROUPS FOR ROTATION
// ═══════════════════════════════════════════════════════════════════════════

const INSECTICIDE_GROUPS: Record<string, string[]> = {
  'IRAC_1A': ['Carbaryl', 'Methomyl'],
  'IRAC_1B': ['Chlorpyrifos', 'Quinalphos', 'Monocrotophos', 'Phorate', 'Carbofuran'],
  'IRAC_3A': ['Cypermethrin', 'Deltamethrin', 'Lambda-cyhalothrin', 'Bifenthrin'],
  'IRAC_4A': ['Imidacloprid', 'Thiamethoxam', 'Acetamiprid', 'Clothianidin'],
  'IRAC_6': ['Emamectin benzoate', 'Abamectin'],
  'IRAC_11': ['Bacillus thuringiensis (Bt)', 'NPV'],
  'IRAC_15': ['Novaluron', 'Lufenuron', 'Flufenoxuron'],
  'IRAC_18': ['Metarhizium', 'Beauveria'],
  'IRAC_28': ['Chlorantraniliprole', 'Flubendiamide', 'Cyantraniliprole']
};

const FUNGICIDE_GROUPS: Record<string, string[]> = {
  'FRAC_1': ['Carbendazim', 'Thiophanate-methyl', 'Benomyl'],
  'FRAC_3': ['Propiconazole', 'Tebuconazole', 'Hexaconazole', 'Difenconazole'],
  'FRAC_7': ['Carboxin', 'Thiram'],
  'FRAC_11': ['Azoxystrobin', 'Trifloxystrobin', 'Pyraclostrobin'],
  'FRAC_M': ['Mancozeb', 'Copper oxychloride', 'Copper hydroxide']
};

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY WARNING GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get safety warning based on farmer_safety_level
 */
export function getSafetyWarning(
  safetyLevel: SafetyLevel | undefined,
  language: string
): SafetyWarning | null {
  if (!safetyLevel || safetyLevel === 'SAFE') {
    return null; // No warning needed for SAFE level
  }
  
  return SAFETY_WARNINGS[safetyLevel] || null;
}

/**
 * Format safety warning for display
 */
export function formatSafetyWarning(
  warning: SafetyWarning,
  language: string
): string {
  const warningText = (warning as any)[`warning_${language}`] || warning.warning_en;
  
  return `${warning.icon} ${warningText}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESISTANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a resistance group has been used recently
 * Prevents consecutive use of same IRAC/FRAC group
 * 
 * @param resistanceGroup - Current rule's resistance group
 * @param recentTreatments - Array of recently used resistance groups (last 3)
 * @returns ResistanceCheckResult with rotation_allowed status
 */
export function checkResistanceRotation(
  resistanceGroup: string | undefined,
  recentTreatments: string[]
): ResistanceCheckResult {
  if (!resistanceGroup) {
    return {
      rotation_allowed: true,
      consecutive_uses: 0
    };
  }
  
  // Count consecutive uses of same group
  let consecutiveUses = 0;
  for (const recent of recentTreatments) {
    if (recent === resistanceGroup) {
      consecutiveUses++;
    } else {
      break; // Stop counting when we hit a different group
    }
  }
  
  // Block if used 2+ times consecutively
  if (consecutiveUses >= 2) {
    return {
      rotation_allowed: false,
      consecutive_uses: consecutiveUses,
      warning: `Resistance risk: ${resistanceGroup} used ${consecutiveUses} times consecutively`,
      alternative_groups: getAlternativeGroups(resistanceGroup)
    };
  }
  
  return {
    rotation_allowed: true,
    consecutive_uses: consecutiveUses
  };
}

/**
 * Get alternative resistance groups for rotation
 */
function getAlternativeGroups(currentGroup: string): string[] {
  const isInsecticide = currentGroup.startsWith('IRAC');
  const isFungicide = currentGroup.startsWith('FRAC');
  
  const groups = isInsecticide ? Object.keys(INSECTICIDE_GROUPS) :
                 isFungicide ? Object.keys(FUNGICIDE_GROUPS) : [];
  
  return groups.filter(g => g !== currentGroup).slice(0, 3);
}

/**
 * Get rotation advice for resistance management
 */
export function getRotationAdvice(
  result: ResistanceCheckResult,
  language: string
): string {
  if (result.rotation_allowed) {
    return '';
  }
  
  const alternatives = result.alternative_groups?.join(', ') || 'different group';
  
  const templates: Record<string, string> = {
    mr: `⚠️ सतत एकाच गटातील औषधे वापरू नका! प्रतिकार टाळण्यासाठी ${alternatives} गटातील औषध वापरा.`,
    hi: `⚠️ लगातार एक ही ग्रुप की दवा न लगाएं! प्रतिरोध से बचने के लिए ${alternatives} ग्रुप की दवा लगाएं।`,
    en: `⚠️ Do not use same chemical group consecutively! To prevent resistance, use ${alternatives} group.`
  };
  
  return templates[language] || templates['en'];
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate all safety and resistance constraints
 */
export function validateSafety(
  rule: SafetyInput,
  recentTreatments: string[],
  language: string
): SafetyValidationResult {
  const messages: string[] = [];
  let passed = true;
  
  // Check safety level
  const safetyWarning = getSafetyWarning(rule.farmer_safety_level, language);
  if (safetyWarning) {
    messages.push(formatSafetyWarning(safetyWarning, language));
  }
  
  // Check resistance rotation
  const resistanceCheck = checkResistanceRotation(rule.resistance_group, recentTreatments);
  if (!resistanceCheck.rotation_allowed) {
    passed = false;
    messages.push(getRotationAdvice(resistanceCheck, language));
  }
  
  // Check bee toxicity (if HIGH and not already warned)
  if (rule.bee_toxicity === 'HIGH') {
    const beeWarning: Record<string, string> = {
      mr: '🐝 मधमाश्यांसाठी धोकादायक! संध्याकाळी फवारणी करा.',
      hi: '🐝 मधुमक्खियों के लिए खतरनाक! शाम को स्प्रे करें।',
      en: '🐝 Hazardous to bees! Spray in evening only.'
    };
    messages.push(beeWarning[language] || beeWarning['en']);
  }
  
  return {
    passed,
    safety_warning: safetyWarning || undefined,
    resistance_check: resistanceCheck,
    combined_message: messages.join('\n')
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

export function logSafetyValidation(
  ruleId: string,
  result: SafetyValidationResult,
  traceId?: string
): void {
  const prefix = traceId ? `[${traceId}]` : '';
  
  if (result.passed) {
    if (result.safety_warning) {
      console.log(`${prefix} ⚠️ [Safety] Rule ${ruleId}: Level ${result.safety_warning.level} warning applies`);
    } else {
      console.log(`${prefix} ✅ [Safety] Rule ${ruleId}: No safety concerns`);
    }
  } else {
    console.warn(`${prefix} 🚫 [Safety] Rule ${ruleId} BLOCKED: ${result.combined_message}`);
  }
}

export default {
  SAFETY_ENHANCEMENT_VERSION,
  getSafetyWarning,
  formatSafetyWarning,
  checkResistanceRotation,
  getRotationAdvice,
  validateSafety,
  logSafetyValidation
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 6: SAFETY ENHANCEMENT MODULE (v2.0.0 - English-only)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * v2.0.0: Removed all hardcoded mr/hi strings.
 * Safety warnings are English-only; LLM narration layer translates at runtime.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const SAFETY_ENHANCEMENT_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

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
// SAFETY LEVEL DEFINITIONS (English-only; LLM narration translates)
// ═══════════════════════════════════════════════════════════════════════════

const SAFETY_WARNINGS: Record<SafetyLevel, SafetyWarning> = {
  'SAFE': {
    level: 'SAFE',
    icon: '✅',
    warning_en: 'Safe - No special precautions needed',
    ppe_required: []
  },
  'CAUTION': {
    level: 'CAUTION',
    icon: '⚠️',
    warning_en: 'Wear gloves. Keep away from eyes. Wash hands after spraying.',
    ppe_required: ['gloves', 'eye_protection']
  },
  'EXPERT_ONLY': {
    level: 'EXPERT_ONLY',
    icon: '🔴',
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

export function getSafetyWarning(
  safetyLevel: SafetyLevel | undefined,
  _language: string
): SafetyWarning | null {
  if (!safetyLevel || safetyLevel === 'SAFE') {
    return null;
  }
  return SAFETY_WARNINGS[safetyLevel] || null;
}

export function formatSafetyWarning(
  warning: SafetyWarning,
  _language: string
): string {
  // English-only; LLM narration layer translates at runtime
  return `${warning.icon} ${warning.warning_en}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESISTANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export function checkResistanceRotation(
  resistanceGroup: string | undefined,
  recentTreatments: string[]
): ResistanceCheckResult {
  if (!resistanceGroup) {
    return { rotation_allowed: true, consecutive_uses: 0 };
  }
  
  let consecutiveUses = 0;
  for (const recent of recentTreatments) {
    if (recent === resistanceGroup) {
      consecutiveUses++;
    } else {
      break;
    }
  }
  
  if (consecutiveUses >= 2) {
    return {
      rotation_allowed: false,
      consecutive_uses: consecutiveUses,
      warning: `Resistance risk: ${resistanceGroup} used ${consecutiveUses} times consecutively`,
      alternative_groups: getAlternativeGroups(resistanceGroup)
    };
  }
  
  return { rotation_allowed: true, consecutive_uses: consecutiveUses };
}

function getAlternativeGroups(currentGroup: string): string[] {
  const isInsecticide = currentGroup.startsWith('IRAC');
  const isFungicide = currentGroup.startsWith('FRAC');
  
  const groups = isInsecticide ? Object.keys(INSECTICIDE_GROUPS) :
                 isFungicide ? Object.keys(FUNGICIDE_GROUPS) : [];
  
  return groups.filter(g => g !== currentGroup).slice(0, 3);
}

/**
 * Get rotation advice (English-only; LLM narration translates)
 */
export function getRotationAdvice(
  result: ResistanceCheckResult,
  _language: string
): string {
  if (result.rotation_allowed) return '';
  
  const alternatives = result.alternative_groups?.join(', ') || 'different group';
  return `⚠️ Do not use same chemical group consecutively! To prevent resistance, use ${alternatives} group.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export function validateSafety(
  rule: SafetyInput,
  recentTreatments: string[],
  language: string
): SafetyValidationResult {
  const messages: string[] = [];
  let passed = true;
  
  const safetyWarning = getSafetyWarning(rule.farmer_safety_level, language);
  if (safetyWarning) {
    messages.push(formatSafetyWarning(safetyWarning, language));
  }
  
  const resistanceCheck = checkResistanceRotation(rule.resistance_group, recentTreatments);
  if (!resistanceCheck.rotation_allowed) {
    passed = false;
    messages.push(getRotationAdvice(resistanceCheck, language));
  }
  
  // Bee toxicity warning (English-only; LLM translates)
  if (rule.bee_toxicity === 'HIGH') {
    messages.push('🐝 Hazardous to bees! Spray in evening only.');
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

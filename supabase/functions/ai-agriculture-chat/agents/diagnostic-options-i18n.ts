/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC OPTIONS i18n - DB-driven translations for clarification options
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Provides consistent, language-specific diagnostic options for the 
 * clarification UI. All labels are resolved from observation_translations 
 * database table at runtime (SSOT compliant).
 * 
 * RULE: Each option carries an i18n_key and observation_key for backend parsing.
 * Labels are loaded from DB, NOT hardcoded here.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const DIAGNOSTIC_OPTIONS_VERSION = '2.0.0';

export interface DiagnosticOption {
  i18n_key: string;
  observation_key: string;
  icon: string;
  diagnostic_power: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// SUGARCANE SEEDLING STAGE OPTIONS - For terminal damage at early stage
// Labels resolved from observation_translations at runtime
// ═══════════════════════════════════════════════════════════════════════════

export const SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS: DiagnosticOption[] = [
  {
    i18n_key: 'EARLY_SHOOT_BORER',
    observation_key: 'DEAD_HEART_PRESENT',
    icon: 'alert-triangle',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'TERMITE',
    observation_key: 'TERMITE_DAMAGE',
    icon: 'bug',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'ROOT_ROT',
    observation_key: 'SETT_ROTTING',
    icon: 'leaf',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'WATERLOGGING',
    observation_key: 'WATERLOGGING_DAMAGE',
    icon: 'droplets',
    diagnostic_power: 'MEDIUM'
  },
  {
    i18n_key: 'PHOTO_UPLOAD',
    observation_key: 'PHOTO_UPLOAD',
    icon: 'camera',
    diagnostic_power: 'LOW'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC TERMINAL DAMAGE OPTIONS - For any crop with plant death
// Labels resolved from observation_translations at runtime
// ═══════════════════════════════════════════════════════════════════════════

export const GENERIC_TERMINAL_DAMAGE_OPTIONS: DiagnosticOption[] = [
  {
    i18n_key: 'DEAD_HEART',
    observation_key: 'DEAD_HEART_PRESENT',
    icon: 'alert-triangle',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'LARVAE_VISIBLE',
    observation_key: 'LARVAE_VISIBLE',
    icon: 'bug',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'TERMITE',
    observation_key: 'TERMITE_DAMAGE',
    icon: 'search',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'HONEYDEW_PRESENT',
    observation_key: 'HONEYDEW_PRESENT',
    icon: 'droplets',
    diagnostic_power: 'MEDIUM'
  },
  {
    i18n_key: 'PHOTO_UPLOAD',
    observation_key: 'PHOTO_UPLOAD',
    icon: 'camera',
    diagnostic_power: 'LOW'
  }
];

/**
 * Get diagnostic options for a specific crop, stage, and language.
 * Labels are resolved from observation_translations DB table via the loader.
 * 
 * @param supabaseClient - Supabase client for DB queries
 * @param cropCode - Crop code (e.g., 'SUGARCANE')
 * @param stage - Growth stage (e.g., 'SEEDLING')
 * @param language - Target language (e.g., 'mr', 'hi', 'en')
 */
export async function getDiagnosticOptionsForCropStage(
  supabaseClient: any,
  cropCode: string,
  stage: string,
  language: string
): Promise<Array<{ label: string; observation_key: string; i18n_key: string; diagnostic_power: string; icon: string }>> {
  const normalizedCrop = cropCode?.toUpperCase() || '';
  const normalizedStage = stage?.toUpperCase()?.replace(/[\s-]/g, '_') || '';
  const normalizedLang = (language || 'en').toLowerCase();
  
  // Select appropriate option set
  let optionSet: DiagnosticOption[];
  
  if (normalizedCrop === 'SUGARCANE' && 
      (normalizedStage === 'SEEDLING' || normalizedStage === 'GERMINATION')) {
    optionSet = SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS;
  } else {
    optionSet = GENERIC_TERMINAL_DAMAGE_OPTIONS;
  }
  
  // Collect all observation_keys to fetch labels from DB.
  // FIX (BUG B): observation_translations.observation_code is stored lowercase
  // in the DB; runtime carries UPPERCASE. Query both cases and match
  // case-insensitively so we don't fall back to the formatted-code path.
  const observationKeys = optionSet.map(opt => opt.observation_key);
  const queryCodes = Array.from(new Set([
    ...observationKeys.map(k => k.toUpperCase()),
    ...observationKeys.map(k => k.toLowerCase()),
  ]));

  // Load labels from observation_translations (SSOT)
  const labelMap = new Map<string, string>();
  try {
    const { data, error } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, display_text, description_text')
      .in('observation_code', queryCodes)
      .eq('language_code', normalizedLang);

    if (!error && data) {
      for (const row of data) {
        const code = (row.observation_code || '').toUpperCase();
        // FIX (BUG A): prefer display_text strictly; description_text only
        // when display_text is missing. Length-based promotion of
        // description_text caused Latin pathogen names to surface as chips.
        const display = (row.display_text || '').trim();
        const desc = (row.description_text || '').trim();
        const label = display || desc;
        if (label) labelMap.set(code, label);
      }
    }
  } catch (err) {
    console.warn(`⚠️ [DiagnosticOptions] Failed to load labels from DB: ${err}`);
  }
  
  // Build final options with DB-resolved labels
  return optionSet.map(opt => {
    const dbLabel = labelMap.get(opt.observation_key);
    // Fallback: use formatted code if DB label missing
    const fallbackLabel = normalizedLang === 'en'
      ? opt.observation_key.replace(/_/g, ' ').split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : opt.observation_key.replace(/_/g, ' ');
    
    return {
      label: dbLabel || fallbackLabel,
      observation_key: opt.observation_key,
      i18n_key: opt.i18n_key,
      diagnostic_power: opt.diagnostic_power,
      icon: opt.icon
    };
  });
}

/**
 * SYNC VERSION - For backward compatibility when supabaseClient not available.
 * Uses raw observation_key as label fallback. Prefer async version.
 */
export function getDiagnosticOptionsForCropStageSync(
  cropCode: string,
  stage: string,
  language: string
): Array<{ label: string; observation_key: string; i18n_key: string; diagnostic_power: string }> {
  const normalizedCrop = cropCode?.toUpperCase() || '';
  const normalizedStage = stage?.toUpperCase()?.replace(/[\s-]/g, '_') || '';
  
  let optionSet: DiagnosticOption[];
  
  if (normalizedCrop === 'SUGARCANE' && 
      (normalizedStage === 'SEEDLING' || normalizedStage === 'GERMINATION')) {
    optionSet = SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS;
  } else {
    optionSet = GENERIC_TERMINAL_DAMAGE_OPTIONS;
  }
  
  // Without DB access, use formatted code as label
  return optionSet.map(opt => ({
    label: language === 'en'
      ? opt.observation_key.replace(/_/g, ' ').split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : opt.observation_key.replace(/_/g, ' '),
    observation_key: opt.observation_key,
    i18n_key: opt.i18n_key,
    diagnostic_power: opt.diagnostic_power
  }));
}

export default {
  DIAGNOSTIC_OPTIONS_VERSION,
  getDiagnosticOptionsForCropStage,
  getDiagnosticOptionsForCropStageSync,
  SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS,
  GENERIC_TERMINAL_DAMAGE_OPTIONS
};

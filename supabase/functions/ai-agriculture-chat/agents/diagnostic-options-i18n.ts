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
  
  // Collect all observation_keys to fetch labels from DB
  const observationKeys = optionSet.map(opt => opt.observation_key);

  // CASE-INSENSITIVE LOOKUP (2026-06-17 bug fix):
  // observation_translations stores observation_code in lowercase canonical
  // form. The bundled option sets use UPPERCASE keys. Query both casings.
  const dualCaseKeys = Array.from(new Set([
    ...observationKeys,
    ...observationKeys.map(k => k.toLowerCase()),
    ...observationKeys.map(k => k.toUpperCase()),
  ]));

  // Load labels from observation_translations (SSOT)
  const labelMap = new Map<string, string>();
  try {
    const { data, error } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, display_text, description_text')
      .in('observation_code', dualCaseKeys)
      .eq('language_code', normalizedLang);

    if (!error && data) {
      for (const row of data) {
        const code = (row.observation_code || '').toUpperCase();
        // Prefer description_text (farmer-friendly) when it's substantive
        const hasGoodDescription = row.description_text && 
          row.description_text.length > 10 &&
          row.description_text.length > (row.display_text?.length || 0);
        labelMap.set(code, hasGoodDescription ? row.description_text : row.display_text);
      }
      console.log(`📖 [DiagnosticOptions] matched ${labelMap.size}/${observationKeys.length} labels (lang=${normalizedLang})`);
    }
  } catch (err) {
    console.warn(`⚠️ [DiagnosticOptions] Failed to load labels from DB: ${err}`);
  }

  // Build final options with DB-resolved labels
  return optionSet.map(opt => {
    const dbLabel = labelMap.get(opt.observation_key.toUpperCase());
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC SIGNAL DETECTOR - GAP #3 FIX
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Detect STRONG diagnostic signals that should override stage restrictions.
 * This is the "agronomist escape hatch" for cross-stage evaluation.
 * 
 * AGRONOMIC RATIONALE:
 * In India:
 * - Sugarcane at 35 DAS can behave like tillering (delayed germination)
 * - Ratoon crops break all normal stage assumptions
 * - Some pests appear earlier than typical due to weather patterns
 * 
 * When a STRONG signal is present (e.g., dead heart visible), we should
 * evaluate rules for that condition regardless of stage mismatch.
 * 
 * VERSION: 1.0.0
 */

export const DIAGNOSTIC_SIGNAL_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// STRONG DIAGNOSTIC SIGNALS
// These should ALWAYS trigger rule evaluation regardless of stage
// ═══════════════════════════════════════════════════════════════════════════

export const STRONG_DIAGNOSTIC_SIGNALS: Set<string> = new Set([
  // Borer symptoms - ALWAYS evaluate
  'DEAD_HEART', 'DEAD_HEART_PRESENT', 'DEADHEART',
  'DEAD_HEART_VISIBLE', 'SOOKHA_SUKANCHA',
  'TUNNELS_IN_STEM', 'INTERNAL_TUNNEL',
  'FRASS_VISIBLE', 'FRASS',
  
  // Termite damage - ALWAYS evaluate
  'TERMITE_MUD_TUBES', 'MUD_TUNNELS', 'MUD_TUBES',
  'TERMITE_VISIBLE', 'WHITE_ANT_VISIBLE',
  'TERMITE_DAMAGE', 'ROOT_DAMAGE_TERMITE',
  
  // Severe pest indicators - ALWAYS evaluate
  'HONEYDEW_PRESENT', 'HONEYDEW',
  'WHITE_WOOLLY_MASS', 'WOOLLY_APHID',
  'PINK_LARVAE_VISIBLE', 'PINK_LARVAE',
  'BORER_LARVAE_VISIBLE', 'LARVAE_IN_STEM',
  
  // Critical disease symptoms - ALWAYS evaluate
  'WATER_SOAKED_LESIONS', 'BACTERIAL_OOZE',
  'PLANT_DEATH', 'SUDDEN_WILT', 'PLANT_COLLAPSED',
  'ROTTED_ROOTS', 'ROOT_ROT_VISIBLE',
  
  // Severe stress indicators - ALWAYS evaluate
  'PLANT_DEATH_SUDDEN', 'CROP_DYING',
  'MASSIVE_DAMAGE', 'SEVERE_DAMAGE',
  'TOTAL_LOSS', 'FIELD_DEVASTATION'
]);

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL CATEGORY MAPPING
// ═══════════════════════════════════════════════════════════════════════════

export type SignalCategory = 
  | 'BORER' 
  | 'TERMITE' 
  | 'APHID_SCALE' 
  | 'DISEASE' 
  | 'CRITICAL_STRESS'
  | 'NONE';

const SIGNAL_CATEGORY_MAP: Record<string, SignalCategory> = {
  // Borer signals
  'DEAD_HEART': 'BORER',
  'DEAD_HEART_PRESENT': 'BORER',
  'DEADHEART': 'BORER',
  'TUNNELS_IN_STEM': 'BORER',
  'INTERNAL_TUNNEL': 'BORER',
  'FRASS_VISIBLE': 'BORER',
  'FRASS': 'BORER',
  'PINK_LARVAE_VISIBLE': 'BORER',
  'BORER_LARVAE_VISIBLE': 'BORER',
  
  // Termite signals
  'TERMITE_MUD_TUBES': 'TERMITE',
  'MUD_TUNNELS': 'TERMITE',
  'MUD_TUBES': 'TERMITE',
  'TERMITE_VISIBLE': 'TERMITE',
  'WHITE_ANT_VISIBLE': 'TERMITE',
  'TERMITE_DAMAGE': 'TERMITE',
  
  // Aphid/Scale signals
  'HONEYDEW_PRESENT': 'APHID_SCALE',
  'HONEYDEW': 'APHID_SCALE',
  'WHITE_WOOLLY_MASS': 'APHID_SCALE',
  'WOOLLY_APHID': 'APHID_SCALE',
  
  // Disease signals
  'WATER_SOAKED_LESIONS': 'DISEASE',
  'BACTERIAL_OOZE': 'DISEASE',
  'ROTTED_ROOTS': 'DISEASE',
  'ROOT_ROT_VISIBLE': 'DISEASE',
  
  // Critical stress
  'PLANT_DEATH': 'CRITICAL_STRESS',
  'SUDDEN_WILT': 'CRITICAL_STRESS',
  'PLANT_COLLAPSED': 'CRITICAL_STRESS',
  'PLANT_DEATH_SUDDEN': 'CRITICAL_STRESS',
  'CROP_DYING': 'CRITICAL_STRESS'
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE PENALTY FOR CROSS-STAGE EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

export const CROSS_STAGE_CONFIDENCE_PENALTY = 0.15; // -15% confidence

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface StrongSignalResult {
  has_strong_signal: boolean;
  signals_detected: string[];
  categories: SignalCategory[];
  should_override_stage: boolean;
  confidence_penalty: number;
  override_reason: string | null;
}

/**
 * Detect if any strong diagnostic signals are present in the observations.
 * 
 * @param observations - Array of observation keys from farmer input
 * @returns Detection result with override recommendation
 */
export function detectStrongDiagnosticSignals(
  observations: string[]
): StrongSignalResult {
  const signalsDetected: string[] = [];
  const categories = new Set<SignalCategory>();
  
  for (const obs of observations) {
    const normalized = obs.toUpperCase().replace(/[\s-]/g, '_');
    
    if (STRONG_DIAGNOSTIC_SIGNALS.has(normalized)) {
      signalsDetected.push(obs);
      const category = SIGNAL_CATEGORY_MAP[normalized] || 'CRITICAL_STRESS';
      categories.add(category);
    }
  }
  
  const hasStrongSignal = signalsDetected.length > 0;
  const categoryArray = Array.from(categories);
  
  // Generate override reason
  let overrideReason: string | null = null;
  if (hasStrongSignal) {
    overrideReason = generateOverrideReason(signalsDetected, categoryArray);
  }
  
  console.log(`🔍 [DiagnosticSignal] Strong signal detection:`);
  console.log(`   Observations checked: ${observations.length}`);
  console.log(`   Strong signals found: ${signalsDetected.length}`);
  if (hasStrongSignal) {
    console.log(`   ⚠️ STRONG SIGNAL DETECTED: ${signalsDetected.join(', ')}`);
    console.log(`   Categories: ${categoryArray.join(', ')}`);
    console.log(`   Override reason: ${overrideReason}`);
  }
  
  return {
    has_strong_signal: hasStrongSignal,
    signals_detected: signalsDetected,
    categories: categoryArray,
    should_override_stage: hasStrongSignal,
    confidence_penalty: hasStrongSignal ? CROSS_STAGE_CONFIDENCE_PENALTY : 0,
    override_reason: overrideReason
  };
}

/**
 * Generate human-readable override reason for logging/display
 */
function generateOverrideReason(
  signals: string[],
  categories: SignalCategory[]
): string {
  if (categories.includes('BORER')) {
    return 'Dead heart symptom requires immediate borer evaluation regardless of crop stage';
  }
  if (categories.includes('TERMITE')) {
    return 'Termite damage requires immediate evaluation regardless of crop stage';
  }
  if (categories.includes('APHID_SCALE')) {
    return 'Honeydew/woolly mass indicates active pest presence requiring evaluation';
  }
  if (categories.includes('DISEASE')) {
    return 'Severe disease symptoms require immediate diagnosis regardless of stage';
  }
  if (categories.includes('CRITICAL_STRESS')) {
    return 'Critical plant stress requires comprehensive evaluation';
  }
  
  return `Strong diagnostic signals (${signals.join(', ')}) require stage-override evaluation`;
}

/**
 * Check if a specific observation is a strong diagnostic signal
 */
export function isStrongDiagnosticSignal(observationKey: string): boolean {
  const normalized = observationKey.toUpperCase().replace(/[\s-]/g, '_');
  return STRONG_DIAGNOSTIC_SIGNALS.has(normalized);
}

/**
 * Get the category for a strong signal
 */
export function getSignalCategory(observationKey: string): SignalCategory {
  const normalized = observationKey.toUpperCase().replace(/[\s-]/g, '_');
  return SIGNAL_CATEGORY_MAP[normalized] || 'NONE';
}

// ═══════════════════════════════════════════════════════════════════════════
// TRILINGUAL OVERRIDE DISCLAIMER MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

export const CROSS_STAGE_DISCLAIMER: Record<string, string> = {
  mr: '⚠️ टीप: हे लक्षण सामान्यतः नंतरच्या टप्प्यात दिसते, परंतु शेतातील परिस्थितीवरून लवकर सुरुवात दिसते.',
  hi: '⚠️ नोट: यह लक्षण आमतौर पर बाद के चरण में दिखाई देता है, लेकिन क्षेत्र की स्थिति जल्दी शुरुआत का संकेत देती है।',
  en: '⚠️ Note: This symptom typically appears at a later stage, but field conditions suggest early onset.'
};

/**
 * Get disclaimer message for cross-stage diagnosis
 */
export function getCrossStageDisclaimer(language: string): string {
  return CROSS_STAGE_DISCLAIMER[language] || CROSS_STAGE_DISCLAIMER['en'];
}

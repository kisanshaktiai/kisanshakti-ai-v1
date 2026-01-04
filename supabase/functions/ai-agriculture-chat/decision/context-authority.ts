/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-8.1: CROP CONTEXT AUTHORITY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Promote crop_schedules to a Context Authority for land-specific chat.
 * Used to inform WHEN and STAGE - must NOT infer WHAT problem exists.
 * 
 * PRINCIPLES:
 * - Crop schedule = Temporal Context Authority (WHEN and STAGE)
 * - Farmer text = Observation Authority (symptoms only)
 * - Symbolic Brain = Decision Authority (diagnose/prescribe)
 * - LLM = Language Renderer ONLY (no inference)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CONTEXT_AUTHORITY_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CROP CONTEXT AUTHORITY INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CropContextAuthority - Single source of truth for crop-related context.
 * Built from crop_schedules table data.
 */
export interface CropContextAuthority {
  /** Crop name (e.g., 'Sugarcane', 'Cotton', 'Soybean') */
  crop_name: string;
  
  /** Growth stage (e.g., 'GERMINATION', 'TILLERING', 'VEGETATIVE') */
  growth_stage: string;
  
  /** Days since sowing - calculated from sowing_date */
  days_since_sowing: number;
  
  /** Sowing date from crop_schedules */
  sowing_date?: string;
  
  /** Expected harvest date */
  expected_harvest_date?: string;
  
  /** Crop variety if available */
  crop_variety?: string;
  
  /** Data source - always 'crop_schedules' for authority */
  source: 'crop_schedules';
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build CropContextAuthority from a crop_schedules row.
 * Returns null if no valid crop data exists.
 * 
 * NO logic, NO diagnosis, NO inference.
 */
export function buildCropContextAuthority(cropScheduleRow: {
  crop_name?: string;
  crop?: string;
  stage?: string;
  growth_stage?: string;
  days_since_sowing?: number;
  sowing_date?: string;
  expected_harvest_date?: string;
  crop_variety?: string;
} | null | undefined): CropContextAuthority | null {
  if (!cropScheduleRow) return null;
  
  // Get crop name - check both possible field names
  const cropName = cropScheduleRow.crop_name || cropScheduleRow.crop;
  if (!cropName) return null;
  
  // Get growth stage - check both possible field names
  const growthStage = cropScheduleRow.growth_stage || cropScheduleRow.stage || 'UNKNOWN';
  
  // Get days since sowing (may be pre-calculated or need calculation)
  let daysSinceSowing = cropScheduleRow.days_since_sowing;
  if (daysSinceSowing === undefined && cropScheduleRow.sowing_date) {
    const sowingDate = new Date(cropScheduleRow.sowing_date);
    const today = new Date();
    daysSinceSowing = Math.floor((today.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  return {
    crop_name: cropName,
    growth_stage: growthStage,
    days_since_sowing: daysSinceSowing ?? 0,
    sowing_date: cropScheduleRow.sowing_date,
    expected_harvest_date: cropScheduleRow.expected_harvest_date,
    crop_variety: cropScheduleRow.crop_variety,
    source: 'crop_schedules'
  };
}

/**
 * Build CropContextAuthority from landContext object.
 * This is an alternative entry point when crop_schedules data
 * has already been merged into landContext.
 */
export function buildCropContextFromLandContext(landContext: {
  current_crop?: string;
  growth_stage?: string;
  days_since_sowing?: number;
  sowing_date?: string;
  expected_harvest_date?: string;
  crop_variety?: string;
  crop_data_source?: string;
} | null | undefined): CropContextAuthority | null {
  if (!landContext) return null;
  if (!landContext.current_crop) return null;
  
  return {
    crop_name: landContext.current_crop,
    growth_stage: landContext.growth_stage || 'UNKNOWN',
    days_since_sowing: landContext.days_since_sowing ?? 0,
    sowing_date: landContext.sowing_date,
    expected_harvest_date: landContext.expected_harvest_date,
    crop_variety: landContext.crop_variety,
    source: 'crop_schedules' // Assume landContext is built from crop_schedules
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if crop context authority exists and is valid.
 */
export function hasCropContextAuthority(authority: CropContextAuthority | null | undefined): authority is CropContextAuthority {
  return authority !== null && 
         authority !== undefined && 
         typeof authority.crop_name === 'string' && 
         authority.crop_name.length > 0;
}

/**
 * Format crop context for stage-aware framing (no diagnosis).
 * Returns a neutral framing string for clarification.
 */
export function formatCropContextFrame(
  authority: CropContextAuthority,
  language: 'mr' | 'hi' | 'en'
): string {
  const crop = authority.crop_name;
  const stage = authority.growth_stage;
  
  // Stage translations (basic - no inference)
  const stageTranslations: Record<string, Record<'mr' | 'hi' | 'en', string>> = {
    'GERMINATION': { mr: 'उगवण', hi: 'अंकुरण', en: 'Germination' },
    'SEEDLING': { mr: 'रोपे', hi: 'अंकुर', en: 'Seedling' },
    'TILLERING': { mr: 'फुटवे', hi: 'कल्ले', en: 'Tillering' },
    'VEGETATIVE': { mr: 'वाढ', hi: 'बढ़वार', en: 'Vegetative' },
    'GRAND_GROWTH': { mr: 'मोठी वाढ', hi: 'बड़ी बढ़वार', en: 'Grand Growth' },
    'FLOWERING': { mr: 'फुलोरा', hi: 'फूल', en: 'Flowering' },
    'BOLL_FORMATION': { mr: 'बोंडे', hi: 'बॉल', en: 'Boll Formation' },
    'MATURITY': { mr: 'पक्वता', hi: 'परिपक्वता', en: 'Maturity' },
    'UNKNOWN': { mr: 'अवस्था', hi: 'अवस्था', en: 'Stage' }
  };
  
  const stageText = stageTranslations[stage]?.[language] || 
                    stageTranslations['UNKNOWN'][language];
  
  // Format: "🌾 Your {crop} ({stage} stage)"
  const templates: Record<'mr' | 'hi' | 'en', string> = {
    mr: `🌾 तुमच्या ${crop} मध्ये (${stageText} अवस्था)`,
    hi: `🌾 आपके ${crop} में (${stageText} अवस्था)`,
    en: `🌾 In your ${crop} (${stageText} stage)`
  };
  
  return templates[language];
}

export default {
  buildCropContextAuthority,
  buildCropContextFromLandContext,
  hasCropContextAuthority,
  formatCropContextFrame,
  CONTEXT_AUTHORITY_VERSION
};

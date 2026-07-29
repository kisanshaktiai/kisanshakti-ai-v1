// PHASE-8.1: CROP CONTEXT AUTHORITY

export const CONTEXT_AUTHORITY_VERSION = '1.0.0';

// CROP CONTEXT AUTHORITY INTERFACE

// CropContextAuthority - Single source of truth for crop-related context.
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

// BUILDER FUNCTION

// Build CropContextAuthority from a crop_schedules row.
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

// Build CropContextAuthority from landContext object.
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

// UTILITY FUNCTIONS

// Check if crop context authority exists and is valid.
export function hasCropContextAuthority(authority: CropContextAuthority | null | undefined): authority is CropContextAuthority {
  if (authority === null || authority === undefined) {
    return false;
  }
  // Defensive check - ensure crop_name exists and is a non-empty string
  const cropName = authority?.crop_name;
  return typeof cropName === 'string' && cropName.length > 0;
}

// Format crop context for stage-aware framing (no diagnosis).
export function formatCropContextFrame(
  authority: CropContextAuthority,
  language: string
): string {
  const crop = authority.crop_name;
  const stage = authority.growth_stage;
  
  // Stage translations (basic - no inference)
  const stageTranslations: Record<string, Record<string, string>> = {
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
                    stageTranslations[stage]?.['en'] ||
                    stageTranslations['UNKNOWN'][language] ||
                    stageTranslations['UNKNOWN']['en'];
  
  // Format: "🌾 Your {crop} ({stage} stage)"
  const templates: Record<string, string> = {
    mr: `🌾 तुमच्या ${crop} मध्ये (${stageText} अवस्था)`,
    hi: `🌾 आपके ${crop} में (${stageText} अवस्था)`,
    en: `🌾 In your ${crop} (${stageText} stage)`
  };
  
  return templates[language] || templates['en'];
}

// CONTEXT AUTHORITY RECONCILIATION (PHASE-11.1)

// Render Context - Final resolved context for response generation.
export interface RenderContext {
  crop_name?: string;
  growth_stage?: string;
  days_since_sowing?: number;
  area_acres?: number;
  soil_health?: {
    nitrogen_kg_per_ha?: number;
    phosphorus_kg_per_ha?: number;
    potassium_kg_per_ha?: number;
    ph_level?: number;
  };
  ndvi?: {
    value?: number;
    trend?: string;
  };
  /** Source of crop context resolution */
  context_source: 'dataAudit' | 'lockedCropContext' | 'canonical' | 'none';
  /** Whether authority override was applied */
  authority_override_applied: boolean;
}

// resolveFinalRenderContext - Context Authority Reconciliation
export function resolveFinalRenderContext(
  landContext: {
    current_crop?: string;
    growth_stage?: string;
    days_since_sowing?: number;
    area_acres?: number;
    soil_health?: {
      nitrogen_kg_per_ha?: number;
      phosphorus_kg_per_ha?: number;
      potassium_kg_per_ha?: number;
      ph_level?: number;
    };
    ndvi?: {
      value?: number;
      trend?: string;
    };
  } | undefined,
  lockedCropContext: CropContextAuthority | null | undefined,
  dataAudit?: {
    land?: { found?: boolean; current_crop?: string; growth_stage?: string; days_since_sowing?: number };
  }
): RenderContext {
  
  // Default result
  const result: RenderContext = {
    crop_name: undefined,
    growth_stage: undefined,
    days_since_sowing: undefined,
    area_acres: undefined,
    context_source: 'none',
    authority_override_applied: false
  };
  
  // Priority 1: Fresh dataAudit (already captured in landContext if found)
  if (dataAudit?.land?.found && landContext?.current_crop) {
    result.crop_name = landContext.current_crop;
    result.growth_stage = landContext.growth_stage;
    result.days_since_sowing = landContext.days_since_sowing;
    result.area_acres = landContext.area_acres;
    result.soil_health = landContext.soil_health;
    result.ndvi = landContext.ndvi;
    result.context_source = 'dataAudit';
    
    console.log(`   🔒 [RenderContext] Using dataAudit: ${result.crop_name} / ${result.growth_stage}`);
    return result;
  }
  
  // Priority 2: lockedCropContext authority override
  if (hasCropContextAuthority(lockedCropContext)) {
    const needsOverride = 
      !landContext?.current_crop ||
      landContext.current_crop.toUpperCase() === 'UNKNOWN' ||
      landContext.current_crop.toUpperCase() === 'DEFAULT' ||
      !landContext.growth_stage ||
      landContext.growth_stage.toUpperCase() === 'VEGETATIVE' && lockedCropContext.growth_stage !== 'VEGETATIVE';
    
    if (needsOverride) {
      console.log(`   🔒 [RenderContext] AUTHORITY OVERRIDE: canonical (${landContext?.current_crop || 'UNKNOWN'}/${landContext?.growth_stage || 'UNKNOWN'}) → lockedCropContext (${lockedCropContext.crop_name}/${lockedCropContext.growth_stage})`);
      
      result.crop_name = lockedCropContext.crop_name;
      result.growth_stage = lockedCropContext.growth_stage;
      result.days_since_sowing = lockedCropContext.days_since_sowing;
      result.context_source = 'lockedCropContext';
      result.authority_override_applied = true;
      
      // Preserve soil/ndvi from landContext if available
      result.soil_health = landContext?.soil_health;
      result.ndvi = landContext?.ndvi;
      result.area_acres = landContext?.area_acres;
      
      return result;
    }
  }
  
  // Priority 3: Use landContext as-is
  if (landContext?.current_crop) {
    result.crop_name = landContext.current_crop;
    result.growth_stage = landContext.growth_stage;
    result.days_since_sowing = landContext.days_since_sowing;
    result.area_acres = landContext.area_acres;
    result.soil_health = landContext.soil_health;
    result.ndvi = landContext.ndvi;
    result.context_source = 'canonical';
    
    console.log(`   🔒 [RenderContext] Using landContext as-is: ${result.crop_name} / ${result.growth_stage}`);
    return result;
  }
  
  // Priority 4: No context available
  console.log(`   🔒 [RenderContext] No crop context available for rendering`);
  return result;
}

export default {
  buildCropContextAuthority,
  buildCropContextFromLandContext,
  hasCropContextAuthority,
  formatCropContextFrame,
  resolveFinalRenderContext,
  CONTEXT_AUTHORITY_VERSION
};

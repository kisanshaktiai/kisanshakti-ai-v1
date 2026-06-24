/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP STAGE ADVISOR - Stage-Specific Decision Trees
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ DEPRECATION NOTICE:
 * This file contains hardcoded agronomic knowledge that should be migrated
 * to the `decision_rules` database table for SSOT compliance.
 * 
 * CURRENT STATUS: Used as STAGE_ADVISORY_FALLBACK when zero rules fire
 * from the database for stage-specific queries.
 * 
 * MIGRATION TARGET: Create `crop_stage_knowledge` DB table to replace
 * all hardcoded StageAdvice objects below.
 * 
 * Tagged: STAGE_ADVISORY_FALLBACK (documented in memory)
 * 
 * PHASE 5: Provides stage-specific agronomic advice for each crop
 * All text is English-only — LLM narration layer translates at runtime.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface StageAdvice {
  water: string;
  fertilizer: string;
  pest_watch: string[];
  disease_watch: string[];
  critical_actions: string[];
  avoid_actions: string[];
  expected_ndvi_range: { min: number; max: number };
  yield_impact_if_stressed: string;
}

export interface CropStageAdvisor {
  crop_code: string;
  stages: Record<string, StageAdvice>;
}

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT STAGE-SPECIFIC ADVISOR (ICAR Standards)
// ═══════════════════════════════════════════════════════════════════════════

const WHEAT_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'WHEAT',
  stages: {
    'GERMINATION': {
      water: 'Light irrigation if soil is dry. Avoid waterlogging.',
      fertilizer: 'Basal dose should already be applied at sowing.',
      pest_watch: ['Termite'],
      disease_watch: [],
      critical_actions: ['Ensure uniform germination', 'Check seed-soil contact'],
      avoid_actions: ['Heavy irrigation', 'Fertilizer application'],
      expected_ndvi_range: { min: 0.08, max: 0.15 },
      yield_impact_if_stressed: '10-15% reduced plant stand',
    },
    'SEEDLING': {
      water: 'Keep soil moist but not waterlogged. First irrigation may be due.',
      fertilizer: 'No fertilizer needed until CRI stage.',
      pest_watch: ['Aphid', 'Armyworm'],
      disease_watch: ['Loose smut (seed-borne)'],
      critical_actions: ['Gap filling if needed', 'Weed management'],
      avoid_actions: ['Heavy nitrogen application', 'Deep irrigation'],
      expected_ndvi_range: { min: 0.15, max: 0.30 },
      yield_impact_if_stressed: '15-20% reduced tillers',
    },
    'TILLERING': {
      water: 'CRI irrigation CRITICAL at 21-25 DAS. Plan 2nd irrigation at 40-45 DAS.',
      fertilizer: 'Apply 1/3 N as top dressing with CRI irrigation.',
      pest_watch: ['Aphid', 'Pink stem borer'],
      disease_watch: ['Yellow rust (North India)', 'Loose smut'],
      critical_actions: [
        'CRI irrigation is MOST CRITICAL - missing reduces yield 40-50%',
        'Apply 1/3 nitrogen now',
        'Scout for rust symptoms',
      ],
      avoid_actions: ['Skip CRI irrigation', 'Delay nitrogen top dressing'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: '40-50% yield loss if CRI irrigation missed',
    },
    'STEM_ELONGATION': {
      water: 'Regular irrigation every 20-25 days based on soil moisture.',
      fertilizer: 'Complete remaining nitrogen application.',
      pest_watch: ['Aphid'],
      disease_watch: ['Brown rust', 'Powdery mildew'],
      critical_actions: ['Complete N application', 'Disease scouting'],
      avoid_actions: ['Nitrogen after this stage'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: '20-30% reduced grain count',
    },
    'FLOWERING': {
      water: 'Critical irrigation during flowering. Do not stress the crop.',
      fertilizer: 'No nitrogen needed. Consider micronutrient spray.',
      pest_watch: ['Aphid peak infestation'],
      disease_watch: ['Yellow rust', 'Brown rust', 'Ear head blight'],
      critical_actions: ['Maintain irrigation schedule', 'Aphid control if ETL crossed'],
      avoid_actions: ['Water stress', 'Heavy pesticide spray during pollination'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '30-40% reduced grain setting',
    },
    'GRAIN_FILLING': {
      water: 'Light irrigation to maintain grain weight. Avoid waterlogging.',
      fertilizer: 'Foliar spray of 2% urea if yellowing seen.',
      pest_watch: ['Aphid'],
      disease_watch: ['Karnal bunt (humid areas)'],
      critical_actions: ['Maintain leaf health', 'Protect from lodging'],
      avoid_actions: ['Heavy irrigation', 'Late pesticide spray'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: '15-20% reduced grain weight',
    },
    'MATURITY': {
      water: 'Stop irrigation 10-15 days before harvest.',
      fertilizer: 'No fertilizer application.',
      pest_watch: [],
      disease_watch: [],
      critical_actions: ['Check grain moisture for harvest timing', 'Prepare for harvest'],
      avoid_actions: ['Irrigation', 'Any chemical spray'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: 'Minimal at this stage',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RICE STAGE-SPECIFIC ADVISOR
// ═══════════════════════════════════════════════════════════════════════════

const RICE_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'RICE',
  stages: {
    'GERMINATION': {
      water: 'Maintain thin layer of water in nursery. Drain for 2 days after sowing.',
      fertilizer: 'Apply nursery dose as per recommendation.',
      pest_watch: ['Stem borer egg masses'],
      disease_watch: ['Bacterial leaf blight (nursery)'],
      critical_actions: ['Maintain water level', 'Seed treatment effectiveness check'],
      avoid_actions: ['Deep flooding', 'Urea in nursery'],
      expected_ndvi_range: { min: 0.08, max: 0.18 },
      yield_impact_if_stressed: 'Seedling mortality',
    },
    'SEEDLING': {
      water: 'Maintain 2-3 cm water level. Drain before transplanting.',
      fertilizer: 'No additional fertilizer in nursery.',
      pest_watch: ['Leaf folder', 'Stem borer'],
      disease_watch: ['Blast (if nitrogen excess)'],
      critical_actions: ['Prepare for transplanting at 21-25 days'],
      avoid_actions: ['Excess nitrogen in nursery'],
      expected_ndvi_range: { min: 0.18, max: 0.35 },
      yield_impact_if_stressed: 'Weak seedlings, poor transplant survival',
    },
    'TILLERING': {
      water: 'Maintain 3-5 cm standing water. AWD (Alternate Wetting Drying) can start.',
      fertilizer: 'Apply 1/2 nitrogen as first split at 21 DAT.',
      pest_watch: ['Stem borer', 'Leaf folder', 'BPH'],
      disease_watch: ['Blast', 'Sheath blight'],
      critical_actions: [
        'First N split at 21 DAT is critical',
        'Maximum tillering determines yield potential',
        'Scout for stem borer dead hearts',
      ],
      avoid_actions: ['Water stress during tillering', 'Delayed nitrogen'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: '30-40% reduced tillers = 30-40% yield loss',
    },
    'PANICLE_INITIATION': {
      water: 'Critical - maintain 5 cm water. No water stress allowed.',
      fertilizer: 'Apply remaining 1/4 nitrogen.',
      pest_watch: ['Stem borer', 'Gall midge', 'BPH'],
      disease_watch: ['Sheath blight', 'Blast'],
      critical_actions: ['Final N split', 'Scout for BPH'],
      avoid_actions: ['Water stress', 'Skip final N'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '40-50% spikelet sterility',
    },
    'FLOWERING': {
      water: 'CRITICAL - maintain continuous flooding. No drainage.',
      fertilizer: 'No fertilizer application.',
      pest_watch: ['BPH', 'Neck blast'],
      disease_watch: ['Neck blast', 'False smut'],
      critical_actions: ['Maintain water', 'Control BPH if ETL crossed'],
      avoid_actions: ['Any water stress', 'Fungicide during anthesis'],
      expected_ndvi_range: { min: 0.60, max: 0.80 },
      yield_impact_if_stressed: '60-70% unfilled grains',
    },
    'GRAIN_FILLING': {
      water: 'Maintain 2-3 cm water. Begin drainage 10-15 days before harvest.',
      fertilizer: 'No application.',
      pest_watch: ['BPH (hopper burn)'],
      disease_watch: ['Sheath rot', 'Grain discoloration'],
      critical_actions: ['Monitor BPH population'],
      avoid_actions: ['Early drainage'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: '10-20% chaffy grains',
    },
    'MATURITY': {
      water: 'Drain field completely. Allow drying for 7-10 days.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: [],
      critical_actions: ['Check grain moisture (20-22% for harvest)', 'Plan harvest logistics'],
      avoid_actions: ['Delayed harvest (shattering losses)'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: 'Shattering if harvest delayed',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SUGARCANE STAGE-SPECIFIC ADVISOR
// ═══════════════════════════════════════════════════════════════════════════

const SUGARCANE_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'SUGARCANE',
  stages: {
    'GERMINATION': {
      water: 'Light irrigation every 7-10 days. Avoid waterlogging.',
      fertilizer: 'Basal dose of P and K should be applied at planting.',
      pest_watch: ['Termite', 'Early shoot borer egg masses'],
      disease_watch: ['Sett rot'],
      critical_actions: ['Ensure proper germination', 'Gap filling at 30 DAS'],
      avoid_actions: ['Heavy flooding', 'Nitrogen at this stage'],
      expected_ndvi_range: { min: 0.10, max: 0.25 },
      yield_impact_if_stressed: '15-20% poor stand',
    },
    'TILLERING': {
      water: 'Irrigation every 10-12 days. Critical for tiller formation.',
      fertilizer: 'Apply 1/3 nitrogen at 45 DAS with earthing up.',
      pest_watch: ['Early shoot borer (30-45 DAS)', 'Pyrilla'],
      disease_watch: ['Red rot (planting material)'],
      critical_actions: [
        'Earthing up at 45 DAS',
        '1/3 N application',
        'Scout for dead hearts (shoot borer)',
      ],
      avoid_actions: ['Water stress during tillering'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: '25-35% reduced tillers',
    },
    'GRAND_GROWTH': {
      water: 'Maximum water demand. Irrigate every 7-10 days.',
      fertilizer: 'Apply remaining 2/3 nitrogen in 2 splits at 90 and 120 DAS.',
      pest_watch: ['Internode borer', 'Top borer', 'Pyrilla', 'Woolly aphid'],
      disease_watch: ['Red rot', 'Smut'],
      critical_actions: [
        'This is the CRITICAL GROWTH PHASE',
        'Any stress here = major yield loss',
        'Complete nitrogen by 120 DAS',
        'Second earthing up at 90 DAS',
      ],
      avoid_actions: ['Water stress', 'Delayed nitrogen application'],
      expected_ndvi_range: { min: 0.55, max: 0.80 },
      yield_impact_if_stressed: '40-60% yield reduction',
    },
    'MATURITY': {
      water: 'Reduce irrigation. Stop 3-4 weeks before harvest.',
      fertilizer: 'No nitrogen after 120 DAS.',
      pest_watch: ['Top borer', 'Scale insect'],
      disease_watch: ['Smut', 'Wilt'],
      critical_actions: ['Monitor sugar accumulation', 'Plan harvest timing'],
      avoid_actions: ['Nitrogen application', 'Excess water'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: 'Reduced sugar recovery',
    },
    'RIPENING': {
      water: 'Withhold irrigation. Allow natural drying.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: [],
      critical_actions: ['Check Brix for harvest readiness', 'Coordinate with mill'],
      avoid_actions: ['Irrigation', 'Late ratoon damage'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: 'Low sugar recovery if harvested early',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// COTTON STAGE-SPECIFIC ADVISOR
// ═══════════════════════════════════════════════════════════════════════════

const COTTON_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'COTTON',
  stages: {
    'GERMINATION': {
      water: 'Light irrigation if soil is dry. Seed should germinate in 5-7 days.',
      fertilizer: 'Basal dose should be applied at sowing.',
      pest_watch: ['Cutworm', 'Termite'],
      disease_watch: [],
      critical_actions: ['Check for uniform germination'],
      avoid_actions: ['Heavy irrigation'],
      expected_ndvi_range: { min: 0.08, max: 0.18 },
      yield_impact_if_stressed: 'Poor stand establishment',
    },
    'SEEDLING': {
      water: 'Keep soil moist. Irrigate every 10-12 days.',
      fertilizer: 'No additional fertilizer yet.',
      pest_watch: ['Jassid', 'Aphid', 'Thrips'],
      disease_watch: ['Root rot', 'Bacterial blight'],
      critical_actions: ['Thinning if needed', 'First weeding'],
      avoid_actions: ['Waterlogging'],
      expected_ndvi_range: { min: 0.18, max: 0.35 },
      yield_impact_if_stressed: '15-20% plant mortality',
    },
    'VEGETATIVE': {
      water: 'Regular irrigation every 10-12 days.',
      fertilizer: 'Apply 1/2 nitrogen at 30 DAS.',
      pest_watch: ['Jassid', 'Aphid', 'Whitefly'],
      disease_watch: ['Bacterial blight', 'Grey mildew'],
      critical_actions: ['First N split', 'Inter-cultivation', 'Pest scouting'],
      avoid_actions: ['Skip nitrogen application'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: '20-25% reduced boll setting',
    },
    'SQUARING': {
      water: 'Critical irrigation phase. Do not stress.',
      fertilizer: 'Apply remaining nitrogen at squaring.',
      pest_watch: ['Bollworm (American/Pink)', 'Aphid', 'Whitefly'],
      disease_watch: ['Grey mildew'],
      critical_actions: ['Complete N application', 'Install pheromone traps'],
      avoid_actions: ['Water stress - causes square shedding'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '30-40% square shedding',
    },
    'FLOWERING': {
      water: 'Maximum water demand. Irrigate every 7-10 days.',
      fertilizer: 'Foliar micronutrients if deficiency seen.',
      pest_watch: ['Bollworm', 'Pink bollworm', 'Mealybug', 'Whitefly'],
      disease_watch: ['Leaf curl virus (via whitefly)'],
      critical_actions: ['Bollworm monitoring', 'Timely pest control'],
      avoid_actions: ['Water stress', 'Heavy insecticide during bee activity'],
      expected_ndvi_range: { min: 0.60, max: 0.80 },
      yield_impact_if_stressed: '40-50% boll shedding',
    },
    'BOLL_FORMATION': {
      water: 'Continue irrigation. Reduce frequency as bolls mature.',
      fertilizer: 'No nitrogen application.',
      pest_watch: ['Pink bollworm', 'Mealybug'],
      disease_watch: ['Boll rot'],
      critical_actions: ['Pink bollworm control', 'Maintain plant health'],
      avoid_actions: ['Late nitrogen (delays maturity)'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '20-30% boll damage',
    },
    'BOLL_OPENING': {
      water: 'Reduce irrigation. Allow bolls to open.',
      fertilizer: 'No application.',
      pest_watch: ['Pink bollworm (rosette flowers)'],
      disease_watch: [],
      critical_actions: ['Plan picking schedule', 'Reduce water'],
      avoid_actions: ['Irrigation', 'Pesticide near harvest'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: 'Fiber quality loss',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CROP ADVISOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const CROP_ADVISORS: Record<string, CropStageAdvisor> = {
  'WHEAT': WHEAT_STAGE_ADVISOR,
  'RICE': RICE_STAGE_ADVISOR,
  'SUGARCANE': SUGARCANE_STAGE_ADVISOR,
  'COTTON': COTTON_STAGE_ADVISOR,
};

// ═══════════════════════════════════════════════════════════════════════════
// STAGE ALIASES — maps `crop_stage_master.growth_stage` labels that have no
// directly-authored entry above onto the entry that already covers the same
// DAS window and agronomic content, per crop_stage_master's own
// `stage_description` text (e.g. sugarcane's "cane_formation" row is
// documented in the DB as "alias for GRAND_GROWTH"). Only mappings backed by
// an explicit DB-documented equivalence or an identical DAS window are
// included here — stages with no authored equivalent are left as genuine
// gaps (logged, not guessed).
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_ALIASES: Record<string, Record<string, string>> = {
  RICE: {
    NURSERY: 'SEEDLING', // DB: "Overlaps SEEDLING in DAS; nursery is a parent category for pre-transplant ops"
    HARVEST: 'MATURITY', // DB harvest (140-160) overlaps MATURITY (130-150); MATURITY text already covers harvest prep
  },
  WHEAT: {
    SOWING: 'GERMINATION', // DB sowing (0-7) is a subset of GERMINATION (0-10)
    CRI: 'TILLERING', // CRI irrigation guidance is authored inside the existing TILLERING entry
    CRI_STAGE: 'TILLERING', // duplicate row of CRI (same DAS window, case-alias) in crop_stage_master
    JOINTING: 'STEM_ELONGATION', // same DAS window (50-70), DB uses agronomic stage name, advisor uses growth-phase name
    HARVEST: 'MATURITY', // DB harvest (145-160) overlaps MATURITY (130-150) tail; MATURITY text covers harvest prep
  },
  COTTON: {
    BOLL_DEVELOPMENT: 'BOLL_FORMATION', // same DAS window (100-140), naming mismatch only
    MATURITY: 'BOLL_OPENING', // same DAS window (140-180); BOLL_OPENING text already covers this phase
    HARVEST: 'BOLL_OPENING',
  },
  SUGARCANE: {
    CANE_FORMATION: 'GRAND_GROWTH', // DB: "Cane elongation phase (alias for GRAND_GROWTH)"
    MATURATION: 'MATURITY', // DB: "Final maturation (alias for MATURITY)"
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get stage-specific advice for a crop
 */
export function getStageSpecificAdvice(
  cropCode: string,
  stage: string
): StageAdvice | null {
  const cropU = cropCode.toUpperCase();
  const advisor = CROP_ADVISORS[cropU];
  if (!advisor) {
    console.log(`[CROP_STAGE_ADVISOR] No advisor found for crop: ${cropCode}`);
    return null;
  }

  const stageU = stage.toUpperCase();
  const resolvedStage = advisor.stages[stageU] ? stageU : (STAGE_ALIASES[cropU]?.[stageU] ?? stageU);
  const stageAdvice = advisor.stages[resolvedStage];
  if (!stageAdvice) {
    console.log(`[CROP_STAGE_ADVISOR] No advice for stage: ${stage} in crop: ${cropCode}`);
    return null;
  }

  return stageAdvice;
}

/**
 * Get water-specific advice for current crop and stage
 */
export function getWaterAdvice(
  cropCode: string,
  stage: string,
  daysSinceSowing: number
): string {
  const advice = getStageSpecificAdvice(cropCode, stage);
  if (!advice) {
    return `Regular irrigation based on soil moisture and weather. Crop is ${daysSinceSowing} days old.`;
  }

  return advice.water;
}

/**
 * Get critical actions for current stage
 */
export function getCriticalActions(
  cropCode: string,
  stage: string
): string[] {
  const advice = getStageSpecificAdvice(cropCode, stage);
  if (!advice) {
    return ['Monitor crop regularly', 'Maintain irrigation schedule'];
  }

  return advice.critical_actions;
}

/**
 * Get pests to watch for at current stage
 */
export function getPestWatch(
  cropCode: string,
  stage: string
): string[] {
  const advice = getStageSpecificAdvice(cropCode, stage);
  if (!advice) {
    return [];
  }

  return advice.pest_watch;
}

/**
 * Check if an action should be avoided at current stage
 */
export function shouldAvoidAction(
  cropCode: string,
  stage: string,
  action: string
): { avoid: boolean; reason?: string } {
  const advice = getStageSpecificAdvice(cropCode, stage);
  if (!advice) {
    return { avoid: false };
  }

  const actionLower = action.toLowerCase();
  for (const avoidAction of advice.avoid_actions) {
    if (actionLower.includes(avoidAction.toLowerCase())) {
      return {
        avoid: true,
        reason: `${avoidAction} should be avoided during ${stage} stage`,
      };
    }
  }

  return { avoid: false };
}

/**
 * Get all available crop advisors
 */
export function getAvailableCropAdvisors(): string[] {
  return Object.keys(CROP_ADVISORS);
}

export const CROP_STAGE_ADVISOR_VERSION = '1.0.0';

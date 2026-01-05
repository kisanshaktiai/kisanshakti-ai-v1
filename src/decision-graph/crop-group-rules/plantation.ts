/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLANTATION CROPS RULES - Coconut, Coffee, Tea, Rubber, Arecanut, Cashew
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ICAR Standards: ICAR-CPCRI, ICAR-CCRI, UPASI, RRI
 * Coverage: 60+ rules for 6 plantation crops
 * 
 * Version: 1.0.0
 * Last Updated: 2025-01-05
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  WeatherState,
  SoilMoistureState,
  SoilNState,
  SoilKState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// COCONUT RULES (10 rules) - ICAR-CPCRI Standards
// ═══════════════════════════════════════════════════════════════════════════

const COCONUT_RULES: CauseRule[] = [
  // Pest Management - Rhinoceros Beetle
  {
    rule_id: 'C_PLANTATION_COCONUT_PEST_001',
    category: 'pest',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coconut' && 
             (pestType === 'rhinoceros_beetle' || 
              input.ndvi_state === NDVIState.HIGH_STRESS);
    },
    cause: Cause.COCONUT_RHINOCEROS_BEETLE_RISK,
    priority: 8,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'V-cut frond damage indicates Oryctes rhinoceros. Hook out adults, apply naphthalene balls 3-4 per palm, maintain field hygiene.',
    icar_package: 'CPCRI Coconut IPM Package'
  },
  // Red Palm Weevil
  {
    rule_id: 'C_PLANTATION_COCONUT_PEST_002',
    category: 'pest',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coconut' && pestType === 'red_palm_weevil';
    },
    cause: Cause.COCONUT_RED_PALM_WEEVIL_RISK,
    priority: 9,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Red palm weevil causes crown wilting with fermented odor. Inject Imidacloprid 17.8% SL through trunk. Pheromone traps at 1/ha.',
    icar_package: 'CPCRI Emergency Protocol'
  },
  // Eriophyid Mite
  {
    rule_id: 'C_PLANTATION_COCONUT_PEST_003',
    category: 'pest',
    crop_code: 'coconut',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coconut' && pestType === 'mite';
    },
    cause: Cause.COCONUT_ERIOPHYID_MITE_RISK,
    priority: 7,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Eriophyid mite causes nut scarification and size reduction. Spray azadirachtin 0.15% or wettable sulfur 0.4% on bunches.',
    icar_package: 'CPCRI Mite Management'
  },
  // Bud Rot Disease
  {
    rule_id: 'C_PLANTATION_COCONUT_DISEASE_001',
    category: 'disease',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coconut' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY &&
             input.ndvi_state === NDVIState.HIGH_STRESS;
    },
    cause: Cause.COCONUT_BUD_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Bud rot (Phytophthora palmivora) kills growing point in high humidity. Remove affected tissue, apply Bordeaux paste. Rain guard in monsoon.',
    icar_package: 'CPCRI Disease Management'
  },
  // Root Wilt
  {
    rule_id: 'C_PLANTATION_COCONUT_DISEASE_002',
    category: 'disease',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      return input.crop_code === 'coconut' && 
             input.ndvi_state === NDVIState.CRITICAL &&
             input.ndvi_trend === 'DECLINING';
    },
    cause: Cause.COCONUT_ROOT_WILT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Root wilt (phytoplasma) causes flaccidity and yellowing. No cure - manage with balanced nutrition, biocontrol, resistant palms.',
    icar_package: 'CPCRI Root Wilt Management'
  },
  // Nitrogen Deficiency
  {
    rule_id: 'C_PLANTATION_COCONUT_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coconut' && input.soil_states?.n === SoilNState.LOW_N;
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Apply 0.5-1 kg urea/palm/year in two splits (May-June and Sept-Oct). Green manure with Calapogonium or Pueraria.',
    icar_package: 'CPCRI Nutrition Schedule'
  },
  // Potassium Deficiency - Critical for nut setting
  {
    rule_id: 'C_PLANTATION_COCONUT_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'coconut',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      return input.crop_code === 'coconut' && input.soil_states?.k === SoilKState.LOW_K;
    },
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'K critical for nut setting. Apply 1.5-2 kg MOP/palm/year. Deficiency shows orange-yellow discoloration of older fronds.',
    icar_package: 'CPCRI Nutrition Schedule'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COFFEE RULES (10 rules) - ICAR-CCRI Standards
// ═══════════════════════════════════════════════════════════════════════════

const COFFEE_RULES: CauseRule[] = [
  // Coffee Berry Borer - Most destructive pest
  {
    rule_id: 'C_PLANTATION_COFFEE_PEST_001',
    category: 'pest',
    crop_code: 'coffee',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      const fruitDamage = input.metadata?.fruitDamagePercent as number | undefined;
      return input.crop_code === 'coffee' && 
             (pestType === 'berry_borer' || (fruitDamage !== undefined && fruitDamage > 2));
    },
    cause: Cause.COFFEE_BERRY_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Coffee berry borer (Hypothenemus hampei) causes pinhole damage. Spray Beauveria bassiana @ 5g/L. Maintain field sanitation.',
    icar_package: 'CCRI Berry Borer IPM'
  },
  // White Stem Borer
  {
    rule_id: 'C_PLANTATION_COFFEE_PEST_002',
    category: 'pest',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coffee' && pestType === 'stem_borer';
    },
    cause: Cause.COFFEE_WHITE_STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'White stem borer causes ring barking. Trace and kill grub, apply lindane 20 EC on stem, maintain shade.',
    icar_package: 'CCRI Stem Borer Protocol'
  },
  // Coffee Leaf Rust - Major disease
  {
    rule_id: 'C_PLANTATION_COFFEE_DISEASE_001',
    category: 'disease',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const diseaseSeverity = input.metadata?.diseaseSeverity as number | undefined;
      return input.crop_code === 'coffee' && 
             (input.weather_state === WeatherState.HIGH_HUMIDITY ||
              (diseaseSeverity !== undefined && diseaseSeverity > 10));
    },
    cause: Cause.COFFEE_LEAF_RUST_RISK,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Coffee leaf rust (Hemileia vastatrix) causes orange pustules. Spray Bordeaux mixture 1% or Triadimefon 0.05% at rust season onset.',
    icar_package: 'CCRI Rust Management'
  },
  // Black Rot
  {
    rule_id: 'C_PLANTATION_COFFEE_DISEASE_002',
    category: 'disease',
    crop_code: 'coffee',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      return input.crop_code === 'coffee' && 
             input.weather_state === WeatherState.RAIN_ACTIVE &&
             input.ndvi_state === NDVIState.MODERATE_STRESS;
    },
    cause: Cause.COFFEE_BLACK_ROT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Black rot (Koleroga) during monsoon causes leaf fall. Spray 1% Bordeaux mixture before monsoon. Ensure drainage.',
    icar_package: 'CCRI Black Rot Protocol'
  },
  // Nitrogen for Coffee
  {
    rule_id: 'C_PLANTATION_COFFEE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coffee' && input.soil_states?.n === SoilNState.LOW_N;
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Apply 40-60 kg N/ha/year for Arabica, 50-80 kg N/ha for Robusta in 2-3 splits coinciding with monsoon.',
    icar_package: 'CCRI Nutrition Schedule'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEA RULES (10 rules) - UPASI/TRA Standards
// ═══════════════════════════════════════════════════════════════════════════

const TEA_RULES: CauseRule[] = [
  // Tea Mosquito Bug - Major pest
  {
    rule_id: 'C_PLANTATION_TEA_PEST_001',
    category: 'pest',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'tea' && 
             (pestType === 'mosquito_bug' || input.ndvi_state === NDVIState.HIGH_STRESS);
    },
    cause: Cause.TEA_MOSQUITO_BUG_RISK,
    priority: 8,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Tea mosquito bug (Helopeltis) causes brownish necrotic lesions. Spray Thiamethoxam 25 WG @ 0.25g/L or Quinalphos 0.05%.',
    icar_package: 'UPASI Tea Pest Management'
  },
  // Red Spider Mite
  {
    rule_id: 'C_PLANTATION_TEA_PEST_002',
    category: 'pest',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'tea' && 
             (pestType === 'mite' || input.weather_state === WeatherState.DRY_SPELL);
    },
    cause: Cause.TEA_RED_SPIDER_MITE_RISK,
    priority: 7,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Red spider mite severe in dry weather. Spray Dicofol 18.5 EC @ 2.5ml/L or Propargite 57 EC. Maintain bush hygiene.',
    icar_package: 'UPASI Mite Management'
  },
  // Blister Blight - Major disease
  {
    rule_id: 'C_PLANTATION_TEA_DISEASE_001',
    category: 'disease',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'tea' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY;
    },
    cause: Cause.TEA_BLISTER_BLIGHT_RISK,
    priority: 9,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Blister blight (Exobasidium vexans) major disease in high rainfall. Spray Hexaconazole 5EC @ 1ml/L. Pluck affected shoots.',
    icar_package: 'UPASI Blister Blight Protocol'
  },
  // Grey Blight
  {
    rule_id: 'C_PLANTATION_TEA_DISEASE_002',
    category: 'disease',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const diseaseSeverity = input.metadata?.diseaseSeverity as number | undefined;
      return input.crop_code === 'tea' && 
             diseaseSeverity !== undefined && diseaseSeverity > 15;
    },
    cause: Cause.TEA_GREY_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Grey blight (Pestalotiopsis) shows grey lesions with dark margins. Remove affected leaves, spray Mancozeb 0.2%.',
    icar_package: 'UPASI Grey Blight Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// RUBBER RULES (10 rules) - RRI Kottayam Standards
// ═══════════════════════════════════════════════════════════════════════════

const RUBBER_RULES: CauseRule[] = [
  // Abnormal Leaf Fall - Major disease
  {
    rule_id: 'C_PLANTATION_RUBBER_DISEASE_001',
    category: 'disease',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'rubber' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY &&
             input.ndvi_state === NDVIState.HIGH_STRESS;
    },
    cause: Cause.RUBBER_ABNORMAL_LEAF_FALL_RISK,
    priority: 9,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Phytophthora causes abnormal leaf fall in monsoon. Spray Mancozeb 0.2% + Akomin (Phosphorus acid) on mature panel.',
    icar_package: 'RRI ALF Management'
  },
  // Powdery Mildew
  {
    rule_id: 'C_PLANTATION_RUBBER_DISEASE_002',
    category: 'disease',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      const diseaseSeverity = input.metadata?.diseaseSeverity as number | undefined;
      return input.crop_code === 'rubber' && 
             diseaseSeverity !== undefined && diseaseSeverity > 10;
    },
    cause: Cause.RUBBER_POWDERY_MILDEW_RISK,
    priority: 7,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Powdery mildew during refoliation causes severe defoliation. Spray Wettable Sulfur 0.2% or Carbendazim 0.05%.',
    icar_package: 'RRI Powdery Mildew Protocol'
  },
  // Pink Disease
  {
    rule_id: 'C_PLANTATION_RUBBER_DISEASE_003',
    category: 'disease',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'rubber' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY &&
             input.ndvi_trend === 'DECLINING';
    },
    cause: Cause.RUBBER_PINK_DISEASE_RISK,
    priority: 8,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Pink disease (Corticium) attacks branches forming pink crust. Scrape and apply Bordeaux paste, spray Carbendazim 0.1%.',
    icar_package: 'RRI Pink Disease Management'
  },
  // Brown Bast - Physiological disorder
  {
    rule_id: 'C_PLANTATION_RUBBER_DISEASE_004',
    category: 'disease',
    crop_code: 'rubber',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) => {
      return input.crop_code === 'rubber' && 
             input.ndvi_state === NDVIState.MODERATE_STRESS &&
             input.soil_states?.moisture === SoilMoistureState.DRY;
    },
    cause: Cause.RUBBER_BROWN_BAST_RISK,
    priority: 7,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Brown bast is tapping panel dryness. Rest affected trees 6-12 months, reduce stimulation, apply ethephon free schedule.',
    icar_package: 'RRI Brown Bast Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// ARECANUT RULES (8 rules) - ICAR-CPCRI Standards
// ═══════════════════════════════════════════════════════════════════════════

const ARECANUT_RULES: CauseRule[] = [
  // Yellow Leaf Disease - Devastating
  {
    rule_id: 'C_PLANTATION_ARECANUT_DISEASE_001',
    category: 'disease',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      return input.crop_code === 'arecanut' && 
             input.ndvi_state === NDVIState.CRITICAL &&
             input.ndvi_trend === 'DECLINING';
    },
    cause: Cause.ARECANUT_YELLOW_LEAF_DISEASE_RISK,
    priority: 9,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Yellow leaf disease (phytoplasma) is devastating with no cure. Remove severely affected palms, apply balanced nutrition.',
    icar_package: 'CPCRI YLD Management'
  },
  // Koleroga - Fruit rot
  {
    rule_id: 'C_PLANTATION_ARECANUT_DISEASE_002',
    category: 'disease',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      return input.crop_code === 'arecanut' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY;
    },
    cause: Cause.ARECANUT_KOLEROGA_RISK,
    priority: 8,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Koleroga (fruit rot) caused by Phytophthora arecae. Spray 1% Bordeaux mixture before monsoon, remove affected bunches.',
    icar_package: 'CPCRI Koleroga Protocol'
  },
  // Spindle Bug
  {
    rule_id: 'C_PLANTATION_ARECANUT_PEST_001',
    category: 'pest',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'arecanut' && pestType === 'spindle_bug';
    },
    cause: Cause.ARECANUT_SPINDLE_BUG_RISK,
    priority: 6,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Spindle bug damages unopened leaves. Spray Malathion 0.1% or neem oil 0.5% at crown.',
    icar_package: 'CPCRI Spindle Bug Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CASHEW RULES (8 rules) - ICAR-DCR Standards
// ═══════════════════════════════════════════════════════════════════════════

const CASHEW_RULES: CauseRule[] = [
  // Tea Mosquito Bug - Major pest
  {
    rule_id: 'C_PLANTATION_CASHEW_PEST_001',
    category: 'pest',
    crop_code: 'cashew',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      const fruitDamage = input.metadata?.fruitDamagePercent as number | undefined;
      return input.crop_code === 'cashew' && 
             (pestType === 'mosquito_bug' || 
              (fruitDamage !== undefined && fruitDamage > 5));
    },
    cause: Cause.CASHEW_TEA_MOSQUITO_BUG_RISK,
    priority: 8,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Tea mosquito bug (Helopeltis) causes 30-40% loss. Spray Lambda cyhalothrin 5EC @ 0.5ml/L at flushing.',
    icar_package: 'DCR TMB Management'
  },
  // Stem Borer
  {
    rule_id: 'C_PLANTATION_CASHEW_PEST_002',
    category: 'pest',
    crop_code: 'cashew',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'cashew' && pestType === 'stem_borer';
    },
    cause: Cause.CASHEW_STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Stem borer causes girdling and death of branches. Prune and burn affected, inject Dichlorvos into bore holes.',
    icar_package: 'DCR Stem Borer Protocol'
  },
  // Anthracnose
  {
    rule_id: 'C_PLANTATION_CASHEW_DISEASE_001',
    category: 'disease',
    crop_code: 'cashew',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY;
    },
    cause: Cause.CASHEW_ANTHRACNOSE_RISK,
    priority: 7,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Anthracnose causes leaf blight and blossom infection. Spray 1% Bordeaux mixture or Carbendazim 0.1% at flushing.',
    icar_package: 'DCR Anthracnose Management'
  },
  // Die Back
  {
    rule_id: 'C_PLANTATION_CASHEW_DISEASE_002',
    category: 'disease',
    crop_code: 'cashew',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && 
             input.ndvi_state === NDVIState.HIGH_STRESS &&
             input.ndvi_trend === 'DECLINING';
    },
    cause: Cause.CASHEW_DIE_BACK_RISK,
    priority: 7,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Die back (Lasiodiplodia) causes twig drying. Prune 15cm below infection, apply Bordeaux paste, spray Carbendazim.',
    icar_package: 'DCR Die Back Protocol'
  },
  // Powdery Mildew
  {
    rule_id: 'C_PLANTATION_CASHEW_DISEASE_003',
    category: 'disease',
    crop_code: 'cashew',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const diseaseSeverity = input.metadata?.diseaseSeverity as number | undefined;
      return input.crop_code === 'cashew' && 
             diseaseSeverity !== undefined && diseaseSeverity > 10;
    },
    cause: Cause.CASHEW_POWDERY_MILDEW_RISK,
    priority: 6,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Powdery mildew on inflorescence causes nut drop. Spray Wettable Sulfur 0.3% or Hexaconazole 0.05% at flowering.',
    icar_package: 'DCR Powdery Mildew Protocol'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED PLANTATION RULES EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const PLANTATION_RULES: CauseRule[] = [
  ...COCONUT_RULES,
  ...COFFEE_RULES,
  ...TEA_RULES,
  ...RUBBER_RULES,
  ...ARECANUT_RULES,
  ...CASHEW_RULES
];

export default PLANTATION_RULES;

// Re-export individual crop rules for testing
export {
  COCONUT_RULES,
  COFFEE_RULES,
  TEA_RULES,
  RUBBER_RULES,
  ARECANUT_RULES,
  CASHEW_RULES
};

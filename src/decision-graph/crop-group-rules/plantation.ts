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
  },
  // Leaf Eating Caterpillar
  {
    rule_id: 'C_PLANTATION_COCONUT_PEST_004',
    category: 'pest',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coconut' && pestType === 'caterpillar';
    },
    cause: Cause.COCONUT_BLACK_HEADED_CATERPILLAR_RISK,
    priority: 7,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Opisina arenosella skeletonizes leaflets. Release Goniozus nephantidis parasitoid @ 20/palm. Cut and burn affected leaflets.',
    icar_package: 'CPCRI Biocontrol Package'
  },
  // Coreid Bug / Nut Crinkler
  {
    rule_id: 'C_PLANTATION_COCONUT_PEST_005',
    category: 'pest',
    crop_code: 'coconut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coconut' && pestType === 'coreid_bug';
    },
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Paradasynus rostratus causes button shedding and nut crinkle. Spray neem oil 0.5% on bunches.',
    icar_package: 'CPCRI Nut Protection'
  },
  // Stem Bleeding Disease
  {
    rule_id: 'C_PLANTATION_COCONUT_DISEASE_003',
    category: 'disease',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) => {
      return input.crop_code === 'coconut' && 
             input.ndvi_state === NDVIState.HIGH_STRESS &&
             input.soil_states?.moisture === SoilMoistureState.WATERLOGGED;
    },
    cause: Cause.COCONUT_STEM_BLEEDING_RISK,
    priority: 8,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Thielaviopsis paradoxa causes reddish-brown exudation. Chisel affected tissue, apply coal tar + Bordeaux paste.',
    icar_package: 'CPCRI Stem Bleeding Protocol'
  },
  // Leaf Blight
  {
    rule_id: 'C_PLANTATION_COCONUT_DISEASE_004',
    category: 'disease',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'coconut' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY &&
             input.ndvi_trend === 'DECLINING';
    },
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Lasiodiplodia theobromae causes grey leaf blight in nursery and young palms. Remove affected leaves, spray Mancozeb 0.2%.',
    icar_package: 'CPCRI Nursery Management'
  },
  // Water Stress - Critical for Nut Setting
  {
    rule_id: 'C_PLANTATION_COCONUT_WATER_001',
    category: 'water',
    crop_code: 'coconut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coconut' && 
             input.soil_states?.moisture === SoilMoistureState.DRY &&
             input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Water stress causes button shedding and reduced nut setting. Irrigate 40-45 liters/palm/day in summer. Drip irrigation most efficient.',
    icar_package: 'CPCRI Water Management'
  },
  // Phosphorus Deficiency
  {
    rule_id: 'C_PLANTATION_COCONUT_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coconut' && input.soil_states?.p === 'LOW_P';
    },
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Apply 0.5 kg bone meal or rock phosphate/palm/year. Deficiency shows purplish tinge on older fronds.',
    icar_package: 'CPCRI Nutrition Schedule'
  },
  // Magnesium Deficiency - Crown Yellowing
  {
    rule_id: 'C_PLANTATION_COCONUT_NUTRIENT_004',
    category: 'nutrient',
    crop_code: 'coconut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coconut' && 
             input.ndvi_state === NDVIState.MODERATE_STRESS &&
             input.metadata?.crown_yellowing === true;
    },
    cause: Cause.MAGNESIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Mg deficiency causes orange-yellow bands on older fronds. Apply 0.5 kg MgSO4/palm/year.',
    icar_package: 'CPCRI Micronutrient Guide'
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
  },
  // Shot Hole Borer
  {
    rule_id: 'C_PLANTATION_COFFEE_PEST_003',
    category: 'pest',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coffee' && pestType === 'shot_hole_borer';
    },
    cause: Cause.COFFEE_SHOT_HOLE_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Xylosandrus compactus attacks drought-stressed plants. Maintain shade, prune affected shoots, spray Quinalphos 0.05%.',
    icar_package: 'CCRI Shot Hole Management'
  },
  // Green Scale
  {
    rule_id: 'C_PLANTATION_COFFEE_PEST_004',
    category: 'pest',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coffee' && pestType === 'scale';
    },
    cause: Cause.PEST_GENERAL_RISK,
    priority: 5,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Coccus viridis causes honeydew and sooty mold. Release Chilocorus nigritus predator. Spray neem oil 0.5%.',
    icar_package: 'CCRI Scale IPM'
  },
  // Mealybug
  {
    rule_id: 'C_PLANTATION_COFFEE_PEST_005',
    category: 'pest',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'coffee' && pestType === 'mealybug';
    },
    cause: Cause.MEALYBUG_RISK,
    priority: 6,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Planococcus citri infests berries causing premature ripening. Release Cryptolaemus montrouzieri predator.',
    icar_package: 'CCRI Mealybug Protocol'
  },
  // Root Disease - Stump Rot
  {
    rule_id: 'C_PLANTATION_COFFEE_DISEASE_003',
    category: 'disease',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'coffee' && 
             input.soil_states?.moisture === SoilMoistureState.WATERLOGGED &&
             input.ndvi_state === NDVIState.CRITICAL;
    },
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Armillaria mellea causes collar rot and root decay. Remove infected stumps, drench Copper oxychloride 0.3%.',
    icar_package: 'CCRI Root Disease Management'
  },
  // Stem Canker
  {
    rule_id: 'C_PLANTATION_COFFEE_DISEASE_004',
    category: 'disease',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coffee' && 
             input.ndvi_trend === 'DECLINING' &&
             input.weather_state === WeatherState.HIGH_HUMIDITY;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 6,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Gibberella stilboides causes girdling cankers on stems. Prune below canker, apply Bordeaux paste.',
    icar_package: 'CCRI Canker Protocol'
  },
  // Brown Eye Spot
  {
    rule_id: 'C_PLANTATION_COFFEE_DISEASE_005',
    category: 'disease',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'coffee' && 
             input.soil_states?.n === SoilNState.LOW_N &&
             input.weather_state === WeatherState.HIGH_HUMIDITY;
    },
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Cercospora coffeicola causes brown spots with light center. Apply balanced nutrition, spray Carbendazim 0.1%.',
    icar_package: 'CCRI Leaf Spot Management'
  },
  // Water Stress - Flowering
  {
    rule_id: 'C_PLANTATION_COFFEE_WATER_001',
    category: 'water',
    crop_code: 'coffee',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coffee' && 
             input.soil_states?.moisture === SoilMoistureState.DRY &&
             input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Water stress during flowering causes star flowers (no fruit set). Blossom showers critical for Arabica. Irrigate if dry spell >15 days.',
    icar_package: 'CCRI Water Management'
  },
  // Potassium for Berry Development
  {
    rule_id: 'C_PLANTATION_COFFEE_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'coffee',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'coffee' && 
             input.soil_states?.k === SoilKState.LOW_K &&
             input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'K critical for berry size and quality. Apply 50-80 kg K2O/ha/year. Deficiency shows marginal necrosis on older leaves.',
    icar_package: 'CCRI Nutrition Schedule'
  },
  // Zinc Deficiency
  {
    rule_id: 'C_PLANTATION_COFFEE_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'coffee',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'coffee' && 
             input.ndvi_state === NDVIState.MODERATE_STRESS &&
             input.metadata?.small_narrow_leaves === true;
    },
    cause: Cause.ZINC_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Zn deficiency causes small, narrow, mottled leaves. Spray ZnSO4 0.5% twice a year.',
    icar_package: 'CCRI Micronutrient Guide'
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
  },
  // Looper Caterpillar
  {
    rule_id: 'C_PLANTATION_TEA_PEST_003',
    category: 'pest',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'tea' && pestType === 'looper';
    },
    cause: Cause.TEA_LOOPER_CATERPILLAR_RISK,
    priority: 7,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Hyposidra talaca defoliates bushes. Hand-pick larvae, spray Bacillus thuringiensis @ 1g/L.',
    icar_package: 'UPASI Looper Management'
  },
  // Shot Hole Borer
  {
    rule_id: 'C_PLANTATION_TEA_PEST_004',
    category: 'pest',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'tea' && 
             pestType === 'shot_hole_borer' &&
             input.weather_state === WeatherState.DRY_SPELL;
    },
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Euwallacea fornicatus attacks drought-stressed bushes. Maintain irrigation, prune affected, paint cut ends.',
    icar_package: 'UPASI Shot Hole Protocol'
  },
  // Thrips
  {
    rule_id: 'C_PLANTATION_TEA_PEST_005',
    category: 'pest',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'tea' && 
             input.weather_state === WeatherState.DRY_SPELL &&
             input.ndvi_state === NDVIState.MODERATE_STRESS;
    },
    cause: Cause.THRIPS_RISK,
    priority: 6,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Scirtothrips bispinosus causes leaf curling and bronzing. Spray Fipronil 5SC @ 1ml/L.',
    icar_package: 'UPASI Thrips Management'
  },
  // Black Rot
  {
    rule_id: 'C_PLANTATION_TEA_DISEASE_003',
    category: 'disease',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'tea' && 
             input.weather_state === WeatherState.RAIN_ACTIVE &&
             input.ndvi_trend === 'DECLINING';
    },
    cause: Cause.TEA_BLACK_ROT_RISK,
    priority: 7,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Corticium theae causes brown rot of leaves and twigs in monsoon. Spray 1% Bordeaux mixture.',
    icar_package: 'UPASI Black Rot Protocol'
  },
  // Root Rot
  {
    rule_id: 'C_PLANTATION_TEA_DISEASE_004',
    category: 'disease',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'tea' && 
             input.soil_states?.moisture === SoilMoistureState.WATERLOGGED &&
             input.ndvi_state === NDVIState.CRITICAL;
    },
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Poria hypolateritia causes charcoal stump rot. Remove dead bushes with roots, drench Carbendazim 0.1%.',
    icar_package: 'UPASI Root Rot Management'
  },
  // Collar Canker
  {
    rule_id: 'C_PLANTATION_TEA_DISEASE_005',
    category: 'disease',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'tea' && 
             input.ndvi_state === NDVIState.HIGH_STRESS;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 6,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Phomopsis theae causes girdling canker at collar. Scrape and apply Bordeaux paste.',
    icar_package: 'UPASI Canker Management'
  },
  // Water Stress
  {
    rule_id: 'C_PLANTATION_TEA_WATER_001',
    category: 'water',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'tea' && 
             input.soil_states?.moisture === SoilMoistureState.DRY;
    },
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'Tea requires 1500-2000mm rainfall. Irrigate at 75mm pan evaporation deficit. Drip @ 8-10 liters/bush/day.',
    icar_package: 'UPASI Irrigation Guide'
  },
  // Nitrogen for Flush
  {
    rule_id: 'C_PLANTATION_TEA_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'tea' && input.soil_states?.n === SoilNState.LOW_N;
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'N critical for green leaf production. Apply 120-150 kg N/ha/year in 4-5 splits. Deficiency shows pale yellow leaves.',
    icar_package: 'UPASI Nutrition Schedule'
  },
  // Potassium Deficiency
  {
    rule_id: 'C_PLANTATION_TEA_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'tea' && input.soil_states?.k === SoilKState.LOW_K;
    },
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 6,
    scientific_source: 'UPASI-TRI',
    scientific_basis: 'K improves tea quality and drought tolerance. Apply 60-80 kg K2O/ha/year. Deficiency shows marginal scorching.',
    icar_package: 'UPASI Nutrition Schedule'
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
  },
  // Tapping Panel Dryness
  {
    rule_id: 'C_PLANTATION_RUBBER_DISEASE_005',
    category: 'disease',
    crop_code: 'rubber',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) => {
      return input.crop_code === 'rubber' && 
             input.metadata?.latex_yield_declining === true;
    },
    cause: Cause.RUBBER_BROWN_BAST_RISK,
    priority: 7,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'TPD is physiological disorder. Reduce tapping intensity, apply balanced fertilizer, rest affected trees.',
    icar_package: 'RRI TPD Management'
  },
  // Corynespora Leaf Fall
  {
    rule_id: 'C_PLANTATION_RUBBER_DISEASE_006',
    category: 'disease',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'rubber' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY &&
             input.ndvi_state === NDVIState.MODERATE_STRESS;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 7,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Corynespora cassiicola causes leaf fall in nursery and young plants. Spray Mancozeb 0.2%.',
    icar_package: 'RRI Corynespora Protocol'
  },
  // Scale Insects
  {
    rule_id: 'C_PLANTATION_RUBBER_PEST_001',
    category: 'pest',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'rubber' && pestType === 'scale';
    },
    cause: Cause.PEST_GENERAL_RISK,
    priority: 5,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Saissetia nigra causes sooty mold on leaves. Spray fish oil rosin soap 3% or neem oil 1%.',
    icar_package: 'RRI Scale Management'
  },
  // Bark Feeding Caterpillar
  {
    rule_id: 'C_PLANTATION_RUBBER_PEST_002',
    category: 'pest',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'rubber' && pestType === 'bark_caterpillar';
    },
    cause: Cause.STEM_BORER_RISK,
    priority: 6,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Aetherastis circulata feeds on bark and webbing. Remove webs manually, spray Chlorpyriphos 0.05%.',
    icar_package: 'RRI Bark Caterpillar Protocol'
  },
  // Termites
  {
    rule_id: 'C_PLANTATION_RUBBER_PEST_003',
    category: 'pest',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'rubber' && 
             input.soil_states?.moisture === SoilMoistureState.DRY;
    },
    cause: Cause.TERMITE_RISK,
    priority: 6,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Odontotermes obesus attacks young plants. Apply Chlorpyriphos 0.05% around base.',
    icar_package: 'RRI Termite Management'
  },
  // Water Stress
  {
    rule_id: 'C_PLANTATION_RUBBER_WATER_001',
    category: 'water',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'rubber' && 
             input.soil_states?.moisture === SoilMoistureState.DRY &&
             input.ndvi_state === NDVIState.MODERATE_STRESS;
    },
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 6,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Immature rubber needs irrigation during dry spell. 40-60 liters/plant/week through drip.',
    icar_package: 'RRI Irrigation Guide'
  },
  // Nitrogen for Immature Rubber
  {
    rule_id: 'C_PLANTATION_RUBBER_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'rubber' && input.soil_states?.n === SoilNState.LOW_N;
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 6,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'N promotes girth increment. Apply 10:10:4:1.5 (NPKMG) mixture as per age. 900g/tree for mature rubber.',
    icar_package: 'RRI Nutrition Schedule'
  },
  // Magnesium Deficiency
  {
    rule_id: 'C_PLANTATION_RUBBER_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'rubber',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'rubber' && 
             input.ndvi_state === NDVIState.MODERATE_STRESS &&
             input.metadata?.interveinal_chlorosis === true;
    },
    cause: Cause.MAGNESIUM_DEFICIENCY,
    priority: 6,
    scientific_source: 'RRI-Kottayam',
    scientific_basis: 'Mg deficiency causes fish-bone pattern chlorosis. Apply 100-150g MgSO4/tree/year.',
    icar_package: 'RRI Micronutrient Guide'
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
  },
  // Inflorescence Die Back
  {
    rule_id: 'C_PLANTATION_ARECANUT_DISEASE_003',
    category: 'disease',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'arecanut' && 
             input.weather_state === WeatherState.HIGH_HUMIDITY &&
             input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 7,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Colletotrichum gloeosporioides causes inflorescence die back. Spray Carbendazim 0.1% at flower emergence.',
    icar_package: 'CPCRI Inflorescence Protection'
  },
  // Bud Rot
  {
    rule_id: 'C_PLANTATION_ARECANUT_DISEASE_004',
    category: 'disease',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'arecanut' && 
             input.ndvi_state === NDVIState.CRITICAL &&
             input.weather_state === WeatherState.HIGH_HUMIDITY;
    },
    cause: Cause.ARECANUT_FRUIT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Phytophthora arecae kills growing point. Apply Bordeaux paste to crown, improve drainage.',
    icar_package: 'CPCRI Bud Rot Management'
  },
  // Root Grub
  {
    rule_id: 'C_PLANTATION_ARECANUT_PEST_002',
    category: 'pest',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'arecanut' && pestType === 'root_grub';
    },
    cause: Cause.ROOT_GRUB_RISK,
    priority: 7,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Leucopholis burmeisteri larvae feed on roots. Drench Chlorpyriphos 0.05% around base.',
    icar_package: 'CPCRI Root Grub Protocol'
  },
  // Mite
  {
    rule_id: 'C_PLANTATION_ARECANUT_PEST_003',
    category: 'pest',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'arecanut' && 
             input.weather_state === WeatherState.DRY_SPELL;
    },
    cause: Cause.MITE_RISK,
    priority: 6,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Eriophyid mite causes nut browning. Spray wettable sulfur 0.3% on bunches.',
    icar_package: 'CPCRI Mite Management'
  },
  // Water Stress
  {
    rule_id: 'C_PLANTATION_ARECANUT_WATER_001',
    category: 'water',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'arecanut' && 
             input.soil_states?.moisture === SoilMoistureState.DRY;
    },
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Arecanut sensitive to drought. Irrigate 175-200 liters/palm/week. Drip most efficient in summer.',
    icar_package: 'CPCRI Water Management'
  },
  // Nitrogen Deficiency
  {
    rule_id: 'C_PLANTATION_ARECANUT_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'arecanut' && input.soil_states?.n === SoilNState.LOW_N;
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Apply 100g N/palm/year in two splits. Deficiency shows pale fronds.',
    icar_package: 'CPCRI Nutrition Schedule'
  },
  // Potassium for Nut Quality
  {
    rule_id: 'C_PLANTATION_ARECANUT_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'arecanut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'arecanut' && input.soil_states?.k === SoilKState.LOW_K;
    },
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'K improves nut size and quality. Apply 140g K2O/palm/year.',
    icar_package: 'CPCRI Nutrition Schedule'
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
  },
  // Shoot and Blossom Blight
  {
    rule_id: 'C_PLANTATION_CASHEW_DISEASE_004',
    category: 'disease',
    crop_code: 'cashew',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && 
             input.weather_state === WeatherState.RAIN_ACTIVE &&
             input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 7,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Glomerella cingulata causes blossom blight in off-season rains. Spray 1% Bordeaux mixture at flowering.',
    icar_package: 'DCR Blossom Blight Protocol'
  },
  // Leaf Miner
  {
    rule_id: 'C_PLANTATION_CASHEW_PEST_003',
    category: 'pest',
    crop_code: 'cashew',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'cashew' && pestType === 'leaf_miner';
    },
    cause: Cause.PEST_GENERAL_RISK,
    priority: 5,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Acrocercops syngramma mines tender leaves. Spray Dimethoate 0.05% or neem oil 0.5% at flushing.',
    icar_package: 'DCR Leaf Miner Management'
  },
  // Root and Stem Borer
  {
    rule_id: 'C_PLANTATION_CASHEW_PEST_004',
    category: 'pest',
    crop_code: 'cashew',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      const pestType = input.metadata?.pestType as string | undefined;
      return input.crop_code === 'cashew' && pestType === 'root_borer';
    },
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Plocaederus ferrugineus bores collar region. Swab trunk with Carbaryl 0.2%, remove and burn affected.',
    icar_package: 'DCR Borer Protocol'
  },
  // Flower Thrips
  {
    rule_id: 'C_PLANTATION_CASHEW_PEST_005',
    category: 'pest',
    crop_code: 'cashew',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && 
             input.crop_stage === CropStage.REPRODUCTIVE &&
             input.weather_state === WeatherState.DRY_SPELL;
    },
    cause: Cause.THRIPS_RISK,
    priority: 6,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Rhipiphorothrips cruentatus damages flowers and tender shoots. Spray Imidacloprid 0.3ml/L at flowering.',
    icar_package: 'DCR Thrips Management'
  },
  // Water Stress - Flowering
  {
    rule_id: 'C_PLANTATION_CASHEW_WATER_001',
    category: 'water',
    crop_code: 'cashew',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && 
             input.soil_states?.moisture === SoilMoistureState.DRY &&
             input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Cashew is drought tolerant but irrigation during flowering improves nut set. 200 liters/tree at 15 day interval.',
    icar_package: 'DCR Water Management'
  },
  // Nitrogen Deficiency
  {
    rule_id: 'C_PLANTATION_CASHEW_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'cashew',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && input.soil_states?.n === SoilNState.LOW_N;
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Apply 500g N/tree/year for mature cashew in 2 splits (June and September).',
    icar_package: 'DCR Nutrition Schedule'
  },
  // Potassium for Nut Development
  {
    rule_id: 'C_PLANTATION_CASHEW_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'cashew',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && 
             input.soil_states?.k === SoilKState.LOW_K &&
             input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'K improves nut weight and kernel quality. Apply 250g K2O/tree/year.',
    icar_package: 'DCR Nutrition Schedule'
  },
  // Zinc Deficiency - Little Leaf
  {
    rule_id: 'C_PLANTATION_CASHEW_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'cashew',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && 
             input.ndvi_state === NDVIState.MODERATE_STRESS &&
             input.metadata?.small_leaves === true;
    },
    cause: Cause.ZINC_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'Zn deficiency causes small clustered leaves (little leaf). Spray ZnSO4 0.5% twice a year.',
    icar_package: 'DCR Micronutrient Guide'
  },
  // Boron Deficiency
  {
    rule_id: 'C_PLANTATION_CASHEW_NUTRIENT_004',
    category: 'nutrient',
    crop_code: 'cashew',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) => {
      return input.crop_code === 'cashew' && 
             input.crop_stage === CropStage.REPRODUCTIVE &&
             input.metadata?.poor_fruit_set === true;
    },
    cause: Cause.BORON_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-DCR',
    scientific_basis: 'B deficiency causes poor nut set and hollow nuts. Spray Borax 0.2% at flowering.',
    icar_package: 'DCR Micronutrient Guide'
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

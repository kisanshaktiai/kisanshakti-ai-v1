/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NUTRIENT MANAGEMENT RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P3 (Crop Stage Requirements) to P6 (Optimization)
 * Based on: ICAR Soil Test Crop Response Correlation, ICAR-IARI, FAO Guidelines
 * 
 * Scientific References:
 * - ICAR-AICRP on Soil Test Crop Response Correlation
 * - Marschner 2012 - Mineral Nutrition of Higher Plants
 * - ICAR Nutrient Deficiency Atlas
 * - Jones 2012 - Plant Nutrition Manual
 * - Fageria & Baligar 2005 - Nutrient use efficiency
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  CropStage,
  SoilNState,
  SoilPState,
  SoilKState,
  SoilPHState,
  SoilTexture,
  DecisionInput 
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SAFE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function num(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  return defaultValue;
}

function str(value: unknown, defaultValue: string = ''): string {
  if (typeof value === 'string') return value;
  return defaultValue;
}

function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

// ═══════════════════════════════════════════════════════════════════════════
// SOIL TEST INTERPRETATION THRESHOLDS (ICAR Standards)
// ═══════════════════════════════════════════════════════════════════════════

export interface SoilTestThreshold {
  nutrient: string;
  low: string;
  medium: string;
  high: string;
  unit: string;
}

export const SOIL_TEST_THRESHOLDS: SoilTestThreshold[] = [
  { nutrient: 'Nitrogen (N)', low: '<280 kg/ha', medium: '280-560 kg/ha', high: '>560 kg/ha', unit: 'kg/ha' },
  { nutrient: 'Phosphorus (P2O5)', low: '<25 kg/ha', medium: '25-50 kg/ha', high: '>50 kg/ha', unit: 'kg/ha' },
  { nutrient: 'Potassium (K2O)', low: '<280 kg/ha', medium: '280-560 kg/ha', high: '>560 kg/ha', unit: 'kg/ha' },
  { nutrient: 'Zinc (Zn)', low: '<0.6 ppm', medium: '0.6-2.0 ppm', high: '>2.0 ppm', unit: 'ppm' },
  { nutrient: 'Iron (Fe)', low: '<4.5 ppm', medium: '4.5-9.0 ppm', high: '>9.0 ppm', unit: 'ppm' },
  { nutrient: 'Boron (B)', low: '<0.5 ppm', medium: '0.5-1.0 ppm', high: '>1.0 ppm', unit: 'ppm' },
];

// ═══════════════════════════════════════════════════════════════════════════
// DEFICIENCY SYMPTOMS DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export interface DeficiencySymptom {
  nutrient: string;
  symptoms: string[];
  mobile: boolean;
  appearsIn: 'OLDER' | 'YOUNGER';
  correction: string[];
  responseTime: string;
}

export const DEFICIENCY_SYMPTOMS: DeficiencySymptom[] = [
  {
    nutrient: 'Nitrogen',
    symptoms: ['Older leaves yellow, starting from tip', 'Stunted growth, pale green color overall', 'Reduced tillering/branching'],
    mobile: true,
    appearsIn: 'OLDER',
    correction: ['Urea 50kg/ha as top dress', 'Fertigated nitrogen if drip available', 'Foliar spray: 2% urea for immediate response'],
    responseTime: '3-5 days'
  },
  {
    nutrient: 'Phosphorus',
    symptoms: ['Dark green to purplish leaves', 'Stunted growth, poor root development', 'Delayed flowering'],
    mobile: true,
    appearsIn: 'OLDER',
    correction: ['Single super phosphate 100kg/ha', 'DAP (Diammonium phosphate) 50kg/ha', 'Foliar spray: 1% DAP (3-4 sprays at weekly interval)'],
    responseTime: '10-14 days'
  },
  {
    nutrient: 'Potassium',
    symptoms: ['Marginal scorching of older leaves', 'Leaf tips and edges turn brown', 'Weak stems, lodging susceptibility'],
    mobile: true,
    appearsIn: 'OLDER',
    correction: ['Muriate of potash (MOP) 50kg/ha', 'Foliar spray: 1% KCl or 0.5% K2SO4'],
    responseTime: '7-10 days'
  },
  {
    nutrient: 'Calcium',
    symptoms: ['Young leaves distorted', 'Growing tips die back', 'Blossom end rot in tomato'],
    mobile: false,
    appearsIn: 'YOUNGER',
    correction: ['Gypsum application 500kg/ha', 'Calcium nitrate foliar 0.5%'],
    responseTime: '7-14 days'
  },
  {
    nutrient: 'Magnesium',
    symptoms: ['Interveinal chlorosis on older leaves', 'Leaf edges remain green, center yellow'],
    mobile: true,
    appearsIn: 'OLDER',
    correction: ['Magnesium sulfate (Epsom salt) 25kg/ha', 'Foliar: 0.5-1% MgSO4'],
    responseTime: '5-7 days'
  },
  {
    nutrient: 'Iron',
    symptoms: ['Interveinal chlorosis on youngest leaves', 'Severe: entire leaf pale yellow to white', 'Common in high pH soils (>7.5)'],
    mobile: false,
    appearsIn: 'YOUNGER',
    correction: ['Soil application: Iron sulfate (FeSO4) 25kg/ha', 'Foliar spray: 0.5% FeSO4 + 0.1% citric acid', 'Chelated iron (Fe-EDTA) 5kg/ha'],
    responseTime: '3-5 days foliar, 7-10 days soil'
  },
  {
    nutrient: 'Zinc',
    symptoms: ['Interveinal chlorosis on younger leaves', 'Short internodes, rosette appearance', 'White bud in maize'],
    mobile: false,
    appearsIn: 'YOUNGER',
    correction: ['Zinc sulfate (ZnSO4) 25kg/ha soil application', 'Foliar: 0.5% ZnSO4 + 0.25% lime'],
    responseTime: '2 weeks soil, 3-5 days foliar'
  },
  {
    nutrient: 'Boron',
    symptoms: ['Growing points die', 'Brittle leaves, hollow stems', 'Poor fruit/seed set'],
    mobile: false,
    appearsIn: 'YOUNGER',
    correction: ['Borax 10kg/ha (CAUTION: Narrow safe range)', 'Foliar: 0.1-0.2% borax'],
    responseTime: '7-10 days'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL NUTRIENT TIMING WINDOWS
// ═══════════════════════════════════════════════════════════════════════════

export interface NutrientTimingWindow {
  crop: string;
  stage: string;
  stageDAS: string;
  nutrients: string;
  reason: string;
  restriction?: string;
}

export const CRITICAL_TIMING_WINDOWS: NutrientTimingWindow[] = [
  // Cotton
  { crop: 'cotton', stage: 'establishment', stageDAS: '0-30 DAS', nutrients: 'P (full), N (25%), K (50%)', reason: 'Root establishment, early vigor' },
  { crop: 'cotton', stage: 'vegetative', stageDAS: '30-60 DAS', nutrients: 'N (35%), Zn, B', reason: 'Rapid vegetative growth, canopy development' },
  { crop: 'cotton', stage: 'flowering', stageDAS: '60-90 DAS', nutrients: 'N (25%), K (50%), Ca, B', reason: 'Flower initiation, boll setting', restriction: 'Avoid excess N (promotes vegetative over reproductive)' },
  { crop: 'cotton', stage: 'boll_development', stageDAS: '90-120 DAS', nutrients: 'N (15%), K, S', reason: 'Boll filling, fiber quality' },
  
  // Tomato
  { crop: 'tomato', stage: 'transplanting', stageDAS: '0 DAT', nutrients: 'P (full basal)', reason: 'Root establishment shock recovery' },
  { crop: 'tomato', stage: 'pre_flowering', stageDAS: '15-30 DAT', nutrients: 'N (40%)', reason: 'Vegetative framework' },
  { crop: 'tomato', stage: 'flowering_fruit_set', stageDAS: '30-50 DAT', nutrients: 'N (30%), K (40%), Ca, B', reason: 'Fruit set, prevent blossom end rot' },
  { crop: 'tomato', stage: 'fruit_development', stageDAS: '50-90 DAT', nutrients: 'K (60%), Ca', reason: 'Fruit sizing, quality, firmness' },
  
  // Rice
  { crop: 'rice', stage: 'transplanting', stageDAS: '0 DAT', nutrients: 'P (full), N (25%)', reason: 'Root recovery and tillering initiation' },
  { crop: 'rice', stage: 'active_tillering', stageDAS: '20-25 DAT', nutrients: 'N (35%), Zn', reason: 'Maximum tiller production' },
  { crop: 'rice', stage: 'panicle_initiation', stageDAS: '45-55 DAT', nutrients: 'N (25%), K', reason: 'Panicle development, grain number' },
  { crop: 'rice', stage: 'heading', stageDAS: '75-85 DAT', nutrients: 'N (15%), K', reason: 'Grain filling initiation' },
  
  // Wheat
  { crop: 'wheat', stage: 'basal', stageDAS: '0 DAS', nutrients: 'P (full), K (full), N (50%)', reason: 'Root development, tillering initiation' },
  { crop: 'wheat', stage: 'crown_root', stageDAS: '21-25 DAS', nutrients: 'N (25%)', reason: 'Crown root initiation, critical irrigation' },
  { crop: 'wheat', stage: 'heading', stageDAS: '85-90 DAS', nutrients: 'N (25%)', reason: 'Grain filling, protein content' },
];

// ═══════════════════════════════════════════════════════════════════════════
// NUTRIENT MANAGEMENT RULES
// ═══════════════════════════════════════════════════════════════════════════

export const NUTRIENT_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // SOIL TEST-BASED RECOMMENDATIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput): boolean => {
      const hasNoSoilTest = !input.metadata?.soilTestAvailable;
      return hasNoSoilTest && input.crop_stage === CropStage.VEGETATIVE;
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-AICRP on Soil Test Crop Response Correlation',
    scientific_basis: 'Without soil test data, use general recommendations with 20% buffer based on crop removal method.',
    icar_package: 'State-specific nutrient recommendation packages',
  },
  
  {
    rule_id: 'NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const nState = input.soil_states?.n;
      const cropStage = input.crop_stage;
      return nState === SoilNState.LOW_N && 
             (cropStage === CropStage.VEGETATIVE || cropStage === CropStage.REPRODUCTIVE);
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'Marschner 2012 - Mineral Nutrition of Higher Plants',
    scientific_basis: 'Nitrogen is critical for chlorophyll synthesis. Deficiency causes yellowing of older leaves first due to N mobility.',
    icar_package: 'ICAR-IARI General Package',
  },
  
  {
    rule_id: 'NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const nState = input.soil_states?.n;
      return nState === SoilNState.LOW_N && input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR Critical Stages',
    scientific_basis: 'N deficiency at flowering/fruiting reduces grain/fruit set by 30-50%. Critical intervention window.',
    icar_package: 'ICAR Critical Nutrient Stages',
  },
  
  {
    rule_id: 'NUTRIENT_004',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input: DecisionInput): boolean => {
      const pState = input.soil_states?.p;
      return pState === SoilPState.LOW_P;
    },
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-IISS Soil Science',
    scientific_basis: 'Phosphorus is essential for root development and energy transfer. Early deficiency stunts growth permanently.',
    icar_package: 'ICAR Phosphorus Management',
  },
  
  {
    rule_id: 'NUTRIENT_005',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const pState = input.soil_states?.p;
      return pState === SoilPState.LOW_P && input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.PHOSPHORUS_DEFICIENCY_CRITICAL,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR Critical Stages',
    scientific_basis: 'P deficiency at reproductive stage severely impacts seed/fruit development.',
    icar_package: 'ICAR Critical Nutrient Stages',
  },
  
  {
    rule_id: 'NUTRIENT_006',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const kState = input.soil_states?.k;
      return kState === SoilKState.LOW_K && 
             (input.crop_stage === CropStage.REPRODUCTIVE || input.crop_stage === CropStage.MATURITY);
    },
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR General',
    scientific_basis: 'Potassium is critical for fruit quality, disease resistance, and drought tolerance at reproductive stage.',
    icar_package: 'ICAR Potassium Management',
  },
  
  {
    rule_id: 'NUTRIENT_007',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const kState = input.soil_states?.k;
      const isCotton = str(input.crop_code).toLowerCase().includes('cotton');
      return kState === SoilKState.LOW_K && isCotton && input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR-CICR Cotton Package',
    scientific_basis: 'Cotton has very high K demand at boll development (90-120 DAS). Deficiency reduces fiber quality and boll weight.',
    icar_package: 'ICAR-CICR Cotton Nutrient Management',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // MULTIPLE NUTRIENT DEFICIENCY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'NUTRIENT_008',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const nLow = input.soil_states?.n === SoilNState.LOW_N;
      const pLow = input.soil_states?.p === SoilPState.LOW_P;
      const kLow = input.soil_states?.k === SoilKState.LOW_K;
      return (nLow && pLow) || (pLow && kLow) || (nLow && kLow) || (nLow && pLow && kLow);
    },
    cause: Cause.SEVERE_NUTRIENT_DEPLETION,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'FAO Soil Management',
    scientific_basis: 'Multiple nutrient deficiencies indicate severely depleted soil. Comprehensive fertilization required.',
    icar_package: 'ICAR Integrated Nutrient Management',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // pH-BASED NUTRIENT LOCKOUT
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'NUTRIENT_009',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const phState = input.soil_states?.ph;
      const pLow = input.soil_states?.p === SoilPState.LOW_P;
      return phState === SoilPHState.ACIDIC && pLow;
    },
    cause: Cause.NUTRIENT_LOCKOUT_ACIDIC,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'FAO Soil Guide',
    scientific_basis: 'Acidic pH < 5.5 reduces P availability (Al/Fe fixation). Lime application needed before fertilizer.',
    icar_package: 'ICAR Soil Acidity Management',
  },
  
  {
    rule_id: 'NUTRIENT_010',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const phState = input.soil_states?.ph;
      const zincLow = input.soil_states?.zinc === 'LOW_ZN';
      return phState === SoilPHState.ALKALINE && zincLow;
    },
    cause: Cause.NUTRIENT_LOCKOUT_ALKALINE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'FAO Soil Guide',
    scientific_basis: 'Alkaline pH > 7.5 reduces micronutrient (Zn, Fe, Mn) availability. Use chelated micronutrients or foliar application.',
    icar_package: 'ICAR Micronutrient Management in Alkaline Soils',
  },
  
  {
    rule_id: 'NUTRIENT_011',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const phState = input.soil_states?.ph;
      return phState === SoilPHState.ACIDIC || phState === SoilPHState.ALKALINE;
    },
    cause: Cause.SOIL_PH_CORRECTION_NEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'Brady & Weil 2016 - Nature and Properties of Soils',
    scientific_basis: 'Soil pH correction improves overall nutrient availability. Lime for acidic, gypsum/sulfur for alkaline soils.',
    icar_package: 'ICAR Soil Health Card Recommendations',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // EXCESS NITROGEN RISKS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'NUTRIENT_012',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const nState = input.soil_states?.n;
      return nState === SoilNState.HIGH_N && input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.EXCESS_NITROGEN_LODGING,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Excess nitrogen at reproductive stage promotes vegetative growth over reproductive, increases lodging risk, and delays maturity.',
    icar_package: 'ICAR Balanced Fertilization',
  },
  
  {
    rule_id: 'NUTRIENT_013',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const nState = input.soil_states?.n;
      const highHumidity = input.weather_state === 'HIGH_HUMIDITY';
      return nState === SoilNState.HIGH_N && highHumidity;
    },
    cause: Cause.EXCESS_NITROGEN_DISEASE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR Disease Management',
    scientific_basis: 'Excess nitrogen with high humidity creates ideal conditions for fungal diseases (blast, blight). Reduce N application.',
    icar_package: 'ICAR IPM Guidelines',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // MICRONUTRIENT DEFICIENCIES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'NUTRIENT_014',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const zincState = input.soil_states?.zinc;
      return zincState === 'LOW_ZN';
    },
    cause: Cause.ZINC_DEFICIENCY,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR Micronutrient Management',
    scientific_basis: 'Zinc deficiency causes interveinal chlorosis on young leaves, white bud in maize. Common in alkaline soils and rice-wheat systems.',
    icar_package: 'ICAR Zinc Application Guidelines',
  },
  
  {
    rule_id: 'NUTRIENT_015',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const symptoms = Array.isArray(input.metadata?.visualDeficiencySymptoms) ? input.metadata.visualDeficiencySymptoms as string[] : [];
      const youngLeafChlorosis = symptoms.includes('interveinal_chlorosis_young');
      const phAlkaline = input.soil_states?.ph === SoilPHState.ALKALINE;
      return youngLeafChlorosis && phAlkaline;
    },
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'Jones 2012 - Plant Nutrition Manual',
    scientific_basis: 'Interveinal chlorosis on young leaves in alkaline soils indicates Fe/Zn/Mn deficiency. Foliar micronutrient spray recommended.',
    icar_package: 'ICAR Micronutrient Atlas',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // WEATHER-DEPENDENT NUTRIENT TIMING
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'NUTRIENT_016',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const rainProbability = num(input.weather?.rain_probability);
      const fertilizerPlanned = bool(input.metadata?.nitrogenApplicationPlanned);
      return fertilizerPlanned && rainProbability > 60;
    },
    cause: Cause.RAIN_FORECAST_SPRAY_BLOCK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'FAO Fertilizer Guidelines',
    scientific_basis: 'Heavy rain (>25mm) within 24h causes nitrogen leaching loss. Delay urea application or use slow-release forms.',
    icar_package: 'ICAR Nitrogen Management',
  },
  
  {
    rule_id: 'NUTRIENT_017',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const temp = num(input.weather?.temperature);
      const fertilizerPlanned = bool(input.metadata?.nitrogenApplicationPlanned);
      return fertilizerPlanned && temp > 35;
    },
    cause: Cause.HIGH_TEMP_SPRAY_BLOCK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'FAO Fertilizer Guidelines',
    scientific_basis: 'High temperature (>35°C) increases ammonia volatilization loss from urea. Apply in evening or use neem-coated urea.',
    icar_package: 'ICAR Nitrogen Efficiency',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // ORGANIC MATTER AND SOIL HEALTH
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'NUTRIENT_018',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const organicCarbon = num(input.metadata?.soilOrganicCarbon);
      return organicCarbon > 0 && organicCarbon < 0.5;
    },
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'Lal 2016 - Soil health and carbon management',
    scientific_basis: 'Organic carbon <0.5% indicates severely depleted soil. FYM 15 tons/ha + green manuring urgently needed.',
    icar_package: 'ICAR-IISS Soil Health Management',
  },
  
  {
    rule_id: 'NUTRIENT_019',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const organicCarbon = num(input.metadata?.soilOrganicCarbon);
      const residueBurning = bool(input.metadata?.cropResidueBurning);
      return residueBurning || (organicCarbon > 0 && organicCarbon < 1.0);
    },
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR Residue Management',
    scientific_basis: 'Crop residue burning destroys organic matter and soil microbes. Incorporate residues or use Happy Seeder.',
    icar_package: 'ICAR Residue Management Guidelines',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // SOIL TEXTURE-BASED ADJUSTMENTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'NUTRIENT_020',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const soilTexture = input.metadata?.soilTexture;
      const nLow = input.soil_states?.n === SoilNState.LOW_N;
      return soilTexture === SoilTexture.SANDY && nLow;
    },
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR Soil-Based Fertilizer Recommendation',
    scientific_basis: 'Sandy soils have low nutrient retention. Apply N in more splits (4-5) with smaller doses to reduce leaching.',
    icar_package: 'ICAR Sandy Soil Management',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get deficiency symptoms for a nutrient
 */
export function getDeficiencySymptoms(nutrient: string): DeficiencySymptom | undefined {
  return DEFICIENCY_SYMPTOMS.find(d => d.nutrient.toLowerCase() === nutrient.toLowerCase());
}

/**
 * Get critical timing windows for a crop
 */
export function getCriticalTimingWindows(cropCode: string): NutrientTimingWindow[] {
  return CRITICAL_TIMING_WINDOWS.filter(w => w.crop.toLowerCase() === cropCode.toLowerCase());
}

/**
 * Determine if affected leaves indicate mobile or immobile nutrient deficiency
 */
export function diagnoseFromLeafPosition(affectedLeaves: 'OLDER' | 'YOUNGER'): DeficiencySymptom[] {
  return DEFICIENCY_SYMPTOMS.filter(d => d.appearsIn === affectedLeaves);
}

/**
 * Get fertilizer recommendation based on soil test
 */
export function getSoilTestRecommendation(
  nutrient: 'N' | 'P' | 'K',
  soilLevel: 'LOW' | 'MEDIUM' | 'HIGH',
  cropCode: string
): { dose: string; timing: string } {
  const cropDoses: Record<string, Record<string, Record<string, string>>> = {
    cotton: {
      N: { LOW: '150-180 kg/ha', MEDIUM: '120-150 kg/ha', HIGH: '90-120 kg/ha' },
      P: { LOW: '60-75 kg P2O5/ha', MEDIUM: '40-60 kg P2O5/ha', HIGH: '30-40 kg P2O5/ha' },
      K: { LOW: '60-75 kg K2O/ha', MEDIUM: '40-60 kg K2O/ha', HIGH: '30-40 kg K2O/ha' },
    },
    rice: {
      N: { LOW: '120-150 kg/ha', MEDIUM: '80-120 kg/ha', HIGH: '60-80 kg/ha' },
      P: { LOW: '50-60 kg P2O5/ha', MEDIUM: '30-50 kg P2O5/ha', HIGH: '20-30 kg P2O5/ha' },
      K: { LOW: '50-60 kg K2O/ha', MEDIUM: '30-50 kg K2O/ha', HIGH: '20-30 kg K2O/ha' },
    },
    wheat: {
      N: { LOW: '120-150 kg/ha', MEDIUM: '100-120 kg/ha', HIGH: '80-100 kg/ha' },
      P: { LOW: '60-75 kg P2O5/ha', MEDIUM: '40-60 kg P2O5/ha', HIGH: '30-40 kg P2O5/ha' },
      K: { LOW: '40-50 kg K2O/ha', MEDIUM: '25-40 kg K2O/ha', HIGH: '15-25 kg K2O/ha' },
    },
  };
  
  const timings: Record<string, string> = {
    N: 'Split: 25% basal, 35% at 30-35 DAS, 25% at flowering, 15% at grain filling',
    P: '100% basal at sowing, band placement 5cm below seed',
    K: '50% basal, 50% at flowering',
  };
  
  const cropKey = cropCode.toLowerCase();
  const dose = cropDoses[cropKey]?.[nutrient]?.[soilLevel] || 'As per soil test';
  
  return {
    dose,
    timing: timings[nutrient],
  };
}

export default NUTRIENT_RULES;

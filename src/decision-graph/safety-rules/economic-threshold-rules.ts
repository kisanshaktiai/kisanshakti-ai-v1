/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ECONOMIC THRESHOLD RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P4 (Economic)
 * Based on: ICAR-CICR, ICAR-NCIPM ETL Guidelines, Pedigo et al. 1986
 * 
 * Economic Injury Level (EIL) and Economic Threshold Level (ETL) rules
 * for pest and disease management decision-making.
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  CropStage,
  DecisionInput 
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// ECONOMIC THRESHOLD DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

export interface EconomicThreshold {
  crop: string;
  pest: string;
  stage: CropStage | string;
  threshold: number;
  unit: string;
  sampleSize: string;
  reassessInterval: number; // days
  reason?: string;
}

export interface CostBenefitRatio {
  ratio: number;
  decision: 'HIGHLY_RECOMMENDED' | 'RECOMMENDED' | 'MARGINAL_BENEFIT' | 'BREAK_EVEN' | 'NOT_ECONOMICAL';
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PEST ECONOMIC THRESHOLDS BY CROP
// ═══════════════════════════════════════════════════════════════════════════

export const PEST_ECONOMIC_THRESHOLDS: EconomicThreshold[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // COTTON PEST THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────
  { crop: 'cotton', pest: 'aphid', stage: 'vegetative', threshold: 10, unit: 'aphids/leaf', sampleSize: '10 leaves from 5 plants', reassessInterval: 3 },
  { crop: 'cotton', pest: 'aphid', stage: 'flowering', threshold: 5, unit: 'aphids/leaf', sampleSize: '15 leaves from 8 plants', reassessInterval: 2, reason: 'Higher sensitivity during reproductive phase' },
  { crop: 'cotton', pest: 'aphid', stage: 'boll_formation', threshold: 3, unit: 'aphids/leaf', sampleSize: '20 leaves from 10 plants', reassessInterval: 2, reason: 'Critical protection period for yield' },
  
  { crop: 'cotton', pest: 'bollworm', stage: 'pre_flowering', threshold: 1, unit: 'larvae/10 plants', sampleSize: 'Examine 50 plants', reassessInterval: 5 },
  { crop: 'cotton', pest: 'bollworm', stage: 'flowering', threshold: 1, unit: 'larvae/10 plants', sampleSize: 'Examine 50 plants', reassessInterval: 3, reason: 'Square damage stage' },
  { crop: 'cotton', pest: 'bollworm', stage: 'boll_formation', threshold: 2, unit: 'larvae/10 plants', sampleSize: 'Examine 50 plants', reassessInterval: 3, reason: 'Direct yield loss phase' },
  
  { crop: 'cotton', pest: 'whitefly', stage: 'vegetative', threshold: 5, unit: 'adults/leaf', sampleSize: '20 leaves randomly', reassessInterval: 5 },
  { crop: 'cotton', pest: 'whitefly', stage: 'flowering', threshold: 3, unit: 'adults/leaf', sampleSize: '20 leaves randomly', reassessInterval: 3 },
  
  { crop: 'cotton', pest: 'pink_bollworm', stage: 'boll_formation', threshold: 8, unit: 'moths/trap/week', sampleSize: '4 traps/hectare', reassessInterval: 7 },
  { crop: 'cotton', pest: 'jassid', stage: 'vegetative', threshold: 2, unit: 'nymphs/leaf', sampleSize: '30 leaves from 10 plants', reassessInterval: 7 },

  // ─────────────────────────────────────────────────────────────────────────
  // TOMATO PEST THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────
  { crop: 'tomato', pest: 'fruit_borer', stage: 'vegetative', threshold: 10, unit: '% leaf damage', sampleSize: '25 plants randomly', reassessInterval: 5, reason: 'Monitor, no spray needed' },
  { crop: 'tomato', pest: 'fruit_borer', stage: 'flowering', threshold: 5, unit: '% flower damage', sampleSize: '25 plants randomly', reassessInterval: 3, reason: 'Biological control preferred' },
  { crop: 'tomato', pest: 'fruit_borer', stage: 'fruiting', threshold: 2, unit: '% fruit damage', sampleSize: '50 fruits randomly', reassessInterval: 2, reason: 'Direct marketable yield loss - zero tolerance for export' },
  
  { crop: 'tomato', pest: 'whitefly', stage: 'vegetative', threshold: 10, unit: 'adults/plant', sampleSize: '20 plants', reassessInterval: 5 },
  { crop: 'tomato', pest: 'aphid', stage: 'all', threshold: 50, unit: 'aphids/plant', sampleSize: '20 plants', reassessInterval: 3 },
  { crop: 'tomato', pest: 'leaf_miner', stage: 'all', threshold: 5, unit: 'larvae/plant', sampleSize: '20 plants', reassessInterval: 7 },

  // ─────────────────────────────────────────────────────────────────────────
  // RICE PEST THRESHOLDS  
  // ─────────────────────────────────────────────────────────────────────────
  { crop: 'rice', pest: 'stem_borer', stage: 'vegetative', threshold: 5, unit: '% dead hearts', sampleSize: '100 hills', reassessInterval: 7 },
  { crop: 'rice', pest: 'stem_borer', stage: 'flowering', threshold: 2, unit: '% white ears', sampleSize: '100 hills', reassessInterval: 5 },
  { crop: 'rice', pest: 'brown_planthopper', stage: 'all', threshold: 10, unit: 'hoppers/hill', sampleSize: '20 hills', reassessInterval: 3 },
  { crop: 'rice', pest: 'leaf_folder', stage: 'all', threshold: 2, unit: 'damaged leaves/hill', sampleSize: '20 hills', reassessInterval: 7 },
  { crop: 'rice', pest: 'gundhi_bug', stage: 'grain_filling', threshold: 2, unit: 'bugs/hill', sampleSize: '20 hills', reassessInterval: 3 },

  // ─────────────────────────────────────────────────────────────────────────
  // WHEAT PEST THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────
  { crop: 'wheat', pest: 'aphid', stage: 'ear_emergence', threshold: 5, unit: 'aphids/ear', sampleSize: '20 ears', reassessInterval: 3 },
  { crop: 'wheat', pest: 'armyworm', stage: 'all', threshold: 4, unit: 'larvae/m²', sampleSize: '1 m² quadrat, 5 locations', reassessInterval: 3 },
  { crop: 'wheat', pest: 'termite', stage: 'vegetative', threshold: 5, unit: '% wilted plants', sampleSize: '100 plants', reassessInterval: 7 },

  // ─────────────────────────────────────────────────────────────────────────
  // CHICKPEA (GRAM) PEST THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────
  { crop: 'chickpea', pest: 'pod_borer', stage: 'flowering', threshold: 1, unit: 'larvae/plant', sampleSize: '25 plants', reassessInterval: 3, reason: 'Critical flowering stage' },
  { crop: 'chickpea', pest: 'pod_borer', stage: 'podding', threshold: 2, unit: 'larvae/plant', sampleSize: '25 plants', reassessInterval: 3 },
  { crop: 'chickpea', pest: 'cutworm', stage: 'seedling', threshold: 2, unit: '% cut plants', sampleSize: '100 plants', reassessInterval: 2 },

  // ─────────────────────────────────────────────────────────────────────────
  // SUGARCANE PEST THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────
  { crop: 'sugarcane', pest: 'early_shoot_borer', stage: 'tillering', threshold: 10, unit: '% dead hearts', sampleSize: '100 clumps', reassessInterval: 7 },
  { crop: 'sugarcane', pest: 'top_borer', stage: 'grand_growth', threshold: 5, unit: '% affected shoots', sampleSize: '100 clumps', reassessInterval: 7 },
  { crop: 'sugarcane', pest: 'internode_borer', stage: 'maturity', threshold: 10, unit: '% bored internodes', sampleSize: '50 canes', reassessInterval: 14 },
  { crop: 'sugarcane', pest: 'pyrilla', stage: 'all', threshold: 5, unit: 'adults/leaf', sampleSize: '25 leaves', reassessInterval: 7 },

  // ─────────────────────────────────────────────────────────────────────────
  // VEGETABLES GENERAL THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────
  { crop: 'cabbage', pest: 'diamondback_moth', stage: 'head_formation', threshold: 1, unit: 'larvae/plant', sampleSize: '25 plants', reassessInterval: 3 },
  { crop: 'brinjal', pest: 'shoot_borer', stage: 'all', threshold: 5, unit: '% affected shoots', sampleSize: '25 plants', reassessInterval: 5 },
  { crop: 'okra', pest: 'shoot_borer', stage: 'all', threshold: 5, unit: '% affected shoots/fruits', sampleSize: '25 plants', reassessInterval: 5 },
  { crop: 'chili', pest: 'thrips', stage: 'all', threshold: 10, unit: 'thrips/leaf', sampleSize: '25 leaves', reassessInterval: 5 },
  { crop: 'onion', pest: 'thrips', stage: 'bulb_formation', threshold: 25, unit: 'thrips/plant', sampleSize: '25 plants', reassessInterval: 3 },
];

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE SEVERITY THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

export const DISEASE_SEVERITY_THRESHOLDS = {
  // Disease Severity Index thresholds
  highValueCrops: {
    preventive: 5,   // DSI > 5%
    action: 10,      // DSI > 10%
    emergency: 25,   // DSI > 25%
  },
  fieldCrops: {
    preventive: 10,  // DSI > 10%
    action: 20,      // DSI > 20%
    emergency: 40,   // DSI > 40%
  },
  // Critical period adjustments
  criticalPeriod: {
    floweringToGrainFilling: 0.5, // 50% of normal threshold
    vegetative: 1.0,              // Standard threshold
    preHarvest: 1.5,              // 150% of normal (relaxed)
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// COST-BENEFIT ANALYSIS RULES
// ═══════════════════════════════════════════════════════════════════════════

export function calculateCostBenefitRatio(
  expectedLoss: number,
  treatmentCost: number,
  treatmentEfficacy: number
): CostBenefitRatio {
  const expectedBenefit = expectedLoss * treatmentEfficacy;
  const netBenefit = expectedBenefit - treatmentCost;
  const bcRatio = treatmentCost > 0 ? expectedBenefit / treatmentCost : 0;
  
  if (bcRatio >= 3) {
    return { ratio: bcRatio, decision: 'HIGHLY_RECOMMENDED', message: 'Strong economic justification' };
  } else if (bcRatio >= 2) {
    return { ratio: bcRatio, decision: 'RECOMMENDED', message: 'Good return on investment' };
  } else if (bcRatio >= 1.5) {
    return { ratio: bcRatio, decision: 'MARGINAL_BENEFIT', message: 'Consider cheaper alternatives' };
  } else if (bcRatio >= 1) {
    return { ratio: bcRatio, decision: 'BREAK_EVEN', message: 'Minimal benefit, evaluate carefully' };
  } else {
    return { ratio: bcRatio, decision: 'NOT_ECONOMICAL', message: 'Cost exceeds benefit - DO NOT proceed' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FARMER AFFORDABILITY THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

export const AFFORDABILITY_THRESHOLDS = {
  smallFarmer: { maxLandAcres: 2, riskTolerance: 'LOW', maxAffordableRatio: 0.10 },
  mediumFarmer: { maxLandAcres: 10, riskTolerance: 'MEDIUM', maxAffordableRatio: 0.15 },
  largeFarmer: { maxLandAcres: Infinity, riskTolerance: 'HIGH', maxAffordableRatio: 0.20 },
};

export function checkAffordability(
  treatmentCost: number,
  remainingCropValue: number,
  landSizeAcres: number
): { affordable: boolean; status: string; advice: string } {
  const affordabilityRatio = treatmentCost / remainingCropValue;
  
  let profile = AFFORDABILITY_THRESHOLDS.largeFarmer;
  if (landSizeAcres <= 2) {
    profile = AFFORDABILITY_THRESHOLDS.smallFarmer;
  } else if (landSizeAcres <= 10) {
    profile = AFFORDABILITY_THRESHOLDS.mediumFarmer;
  }
  
  if (affordabilityRatio < 0.05) {
    return { affordable: true, status: 'HIGHLY_AFFORDABLE', advice: 'Proceed with treatment' };
  } else if (affordabilityRatio < 0.10) {
    return { affordable: true, status: 'AFFORDABLE', advice: 'Treatment is viable' };
  } else if (affordabilityRatio < 0.15) {
    return { affordable: landSizeAcres > 2, status: 'MODERATE_COST', advice: 'Consider benefit carefully' };
  } else if (affordabilityRatio < 0.25) {
    return { affordable: landSizeAcres > 10, status: 'HIGH_COST', advice: 'Cheaper alternatives recommended' };
  } else {
    return { affordable: false, status: 'UNAFFORDABLE', advice: 'Block expensive option, use cheaper alternative' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ECONOMIC THRESHOLD RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ECONOMIC_THRESHOLD_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // PEST ETL EXCEEDED - COTTON
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_001',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: ['vegetative', 'flowering', 'boll_formation'],
    conditions: (input: DecisionInput) => {
      const pestDensity = input.metadata?.pestDensity || 0;
      const stage = input.crop_stage;
      const threshold = stage === 'vegetative' ? 10 : stage === 'flowering' ? 5 : 3;
      return input.metadata?.pestType === 'aphid' && pestDensity >= threshold;
    },
    cause: Cause.ECONOMIC_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4,
    scientific_source: 'ICAR-CICR, Nagpur - ETL Guidelines 2023',
    scientific_basis: 'Cotton aphid ETL varies by stage. Above threshold, economic loss exceeds treatment cost.',
    icar_package: 'Dhawan et al. 2021 - Economic thresholds for cotton pests',
  },

  {
    rule_id: 'ETL_002',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: ['flowering', 'boll_formation'],
    conditions: (input: DecisionInput) => {
      const larvaeCount = input.metadata?.larvaeCount || 0;
      return input.metadata?.pestType === 'bollworm' && larvaeCount >= 1;
    },
    cause: Cause.ECONOMIC_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4,
    scientific_source: 'ICAR-CICR Bollworm Management',
    scientific_basis: 'Bollworm at 1 larva/10 plants causes economic damage. Early intervention prevents boll damage.',
    icar_package: 'Validated across Bt and non-Bt cotton',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PEST ETL EXCEEDED - TOMATO
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_003',
    category: 'pest',
    crop_code: 'tomato',
    stage_applicable: ['fruiting'],
    conditions: (input: DecisionInput) => {
      const fruitDamage = input.metadata?.fruitDamagePercent || 0;
      return input.metadata?.pestType === 'fruit_borer' && fruitDamage >= 2;
    },
    cause: Cause.ECONOMIC_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4,
    scientific_source: 'ICAR-IIHR Vegetable Pest Management',
    scientific_basis: 'Tomato fruit borer at 2% fruit damage causes direct marketable yield loss. Zero tolerance for export grade.',
    icar_package: 'Vegetable IPM Package 2023',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE SEVERITY THRESHOLD - HIGH VALUE CROPS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_004',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const dsi = input.metadata?.diseaseSeverityIndex || 0;
      const isHighValue = ['tomato', 'capsicum', 'grape', 'pomegranate', 'strawberry'].includes(input.crop_code);
      return isHighValue && dsi >= 10;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4,
    scientific_source: 'James & Teng 1979 - Disease severity assessment',
    scientific_basis: 'High value crops need intervention at DSI >10%. Economic loss justifies treatment cost.',
    icar_package: 'ICAR Disease Assessment Keys',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE SEVERITY THRESHOLD - FIELD CROPS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_005',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const dsi = input.metadata?.diseaseSeverityIndex || 0;
      const isFieldCrop = ['cotton', 'rice', 'wheat', 'soybean', 'maize'].includes(input.crop_code);
      return isFieldCrop && dsi >= 20;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4,
    scientific_source: 'ICAR Disease Assessment Keys',
    scientific_basis: 'Field crops tolerate higher disease levels. Intervention at DSI >20% justified economically.',
    icar_package: 'ICAR Package of Practices',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TREATMENT NOT ECONOMICAL
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_006',
    category: 'economic',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const expectedLoss = input.metadata?.expectedLossValue || 0;
      const treatmentCost = input.metadata?.treatmentCost || 0;
      const efficacy = input.metadata?.treatmentEfficacy || 0.7;
      const bcResult = calculateCostBenefitRatio(expectedLoss, treatmentCost, efficacy);
      return bcResult.decision === 'NOT_ECONOMICAL';
    },
    cause: Cause.TREATMENT_NOT_ECONOMICAL,
    priority: PriorityLevel.P4,
    scientific_source: 'Pedigo et al. 1986 - Economic injury level concepts',
    scientific_basis: 'When treatment cost exceeds expected benefit, intervention is economically unjustified.',
    icar_package: 'Stern et al. 1959 - Integrated pest control concept',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TREATMENT UNAFFORDABLE FOR FARMER
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_007',
    category: 'economic',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const treatmentCost = input.metadata?.treatmentCost || 0;
      const cropValue = input.metadata?.remainingCropValue || 0;
      const landSize = input.metadata?.landSizeAcres || 1;
      const result = checkAffordability(treatmentCost, cropValue, landSize);
      return !result.affordable;
    },
    cause: Cause.TREATMENT_UNAFFORDABLE,
    priority: PriorityLevel.P4,
    scientific_source: 'ICAR Socioeconomic Guidelines',
    scientific_basis: 'Treatment affordability relative to crop value and farmer risk profile. Small farmers cannot afford high-cost interventions.',
    icar_package: 'Farmer-centric IPM approach',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BELOW THRESHOLD - MONITOR ONLY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_008',
    category: 'healthy',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const pestDensity = input.metadata?.pestDensity || 0;
      const threshold = input.metadata?.actionThreshold || 10;
      return pestDensity < threshold * 0.5; // Well below threshold
    },
    cause: Cause.BELOW_ETL_MONITOR,
    priority: PriorityLevel.P6,
    scientific_source: 'IPM Principles',
    scientific_basis: 'When pest/disease levels are well below economic threshold, continue monitoring without intervention.',
    icar_package: 'ICAR-NCIPM IPM Package 2023',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL STAGE ADJUSTMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_009',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['flowering', 'grain_filling', 'boll_formation'],
    conditions: (input: DecisionInput) => {
      const pestDensity = input.metadata?.pestDensity || 0;
      const normalThreshold = input.metadata?.actionThreshold || 10;
      const criticalThreshold = normalThreshold * 0.5; // 50% reduction during critical period
      const isCriticalStage = ['flowering', 'grain_filling', 'boll_formation'].includes(input.crop_stage);
      return isCriticalStage && pestDensity >= criticalThreshold && pestDensity < normalThreshold;
    },
    cause: Cause.CRITICAL_STAGE_THRESHOLD_ADJUSTED,
    priority: PriorityLevel.P4,
    scientific_source: 'ICAR Crop Protection Guidelines',
    scientific_basis: 'During flowering to grain filling, crop has maximum vulnerability. Reduced thresholds protect at all costs.',
    icar_package: 'Critical Period Crop Protection',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WILT DISEASE - ZERO TOLERANCE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_010',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const diseaseType = input.metadata?.diseaseType?.toLowerCase() || '';
      const affectedPlants = input.metadata?.affectedPlantsCount || 0;
      return diseaseType.includes('wilt') && affectedPlants >= 1;
    },
    cause: Cause.WILT_ZERO_TOLERANCE,
    priority: PriorityLevel.P2,
    scientific_source: 'ICAR Wilt Management Guidelines',
    scientific_basis: 'Wilt diseases are soilborne and systemic with no cure. 1 wilted plant = ACTION. Remove immediately to prevent spread.',
    icar_package: 'Fusarium/Verticillium wilt management - ICAR guidelines',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get economic threshold for specific crop-pest-stage combination
 */
export function getEconomicThreshold(
  crop: string,
  pest: string,
  stage: string
): EconomicThreshold | undefined {
  return PEST_ECONOMIC_THRESHOLDS.find(t => 
    t.crop.toLowerCase() === crop.toLowerCase() &&
    t.pest.toLowerCase() === pest.toLowerCase() &&
    (t.stage === stage || t.stage === 'all')
  );
}

/**
 * Check if pest density exceeds economic threshold
 */
export function isPestAboveThreshold(
  crop: string,
  pest: string,
  stage: string,
  density: number
): boolean {
  const threshold = getEconomicThreshold(crop, pest, stage);
  return threshold ? density >= threshold.threshold : false;
}

/**
 * Get tier-based alternatives by cost
 */
export const TREATMENT_TIERS = {
  tier1_zero_cost: {
    methods: ['Manual removal', 'Cultural practices', 'Monitoring'],
    costRange: '₹0',
    conditions: 'Always available',
  },
  tier2_low_cost: {
    methods: ['Neem extract', 'Soap water', 'Wood ash'],
    costRange: '₹50-200/acre',
    conditions: 'Local materials available',
  },
  tier3_biological: {
    methods: ['Trichogramma', 'NPV', 'Bt'],
    costRange: '₹300-1000/acre',
    conditions: 'Biopesticides available',
  },
  tier4_chemical: {
    methods: ['Selective pesticides'],
    costRange: '₹1000-3000/acre',
    conditions: 'Lower tiers insufficient AND affordable',
  },
};

export default ECONOMIC_THRESHOLD_RULES;

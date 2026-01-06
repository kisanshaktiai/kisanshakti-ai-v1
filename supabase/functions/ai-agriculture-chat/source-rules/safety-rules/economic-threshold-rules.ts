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
  // COTTON PEST THRESHOLDS
  { crop: 'cotton', pest: 'aphid', stage: CropStage.VEGETATIVE, threshold: 10, unit: 'aphids/leaf', sampleSize: '10 leaves from 5 plants', reassessInterval: 3 },
  { crop: 'cotton', pest: 'aphid', stage: CropStage.REPRODUCTIVE, threshold: 5, unit: 'aphids/leaf', sampleSize: '15 leaves from 8 plants', reassessInterval: 2, reason: 'Higher sensitivity during reproductive phase' },
  { crop: 'cotton', pest: 'bollworm', stage: CropStage.REPRODUCTIVE, threshold: 1, unit: 'larvae/10 plants', sampleSize: 'Examine 50 plants', reassessInterval: 3, reason: 'Square damage stage' },
  { crop: 'cotton', pest: 'whitefly', stage: CropStage.VEGETATIVE, threshold: 5, unit: 'adults/leaf', sampleSize: '20 leaves randomly', reassessInterval: 5 },
  { crop: 'cotton', pest: 'pink_bollworm', stage: CropStage.MATURITY, threshold: 8, unit: 'moths/trap/week', sampleSize: '4 traps/hectare', reassessInterval: 7 },
  { crop: 'cotton', pest: 'jassid', stage: CropStage.VEGETATIVE, threshold: 2, unit: 'nymphs/leaf', sampleSize: '30 leaves from 10 plants', reassessInterval: 7 },

  // TOMATO PEST THRESHOLDS
  { crop: 'tomato', pest: 'fruit_borer', stage: CropStage.VEGETATIVE, threshold: 10, unit: '% leaf damage', sampleSize: '25 plants randomly', reassessInterval: 5, reason: 'Monitor, no spray needed' },
  { crop: 'tomato', pest: 'fruit_borer', stage: CropStage.REPRODUCTIVE, threshold: 5, unit: '% flower damage', sampleSize: '25 plants randomly', reassessInterval: 3, reason: 'Biological control preferred' },
  { crop: 'tomato', pest: 'fruit_borer', stage: CropStage.MATURITY, threshold: 2, unit: '% fruit damage', sampleSize: '50 fruits randomly', reassessInterval: 2, reason: 'Direct marketable yield loss - zero tolerance for export' },
  { crop: 'tomato', pest: 'whitefly', stage: CropStage.VEGETATIVE, threshold: 10, unit: 'adults/plant', sampleSize: '20 plants', reassessInterval: 5 },

  // RICE PEST THRESHOLDS  
  { crop: 'rice', pest: 'stem_borer', stage: CropStage.VEGETATIVE, threshold: 5, unit: '% dead hearts', sampleSize: '100 hills', reassessInterval: 7 },
  { crop: 'rice', pest: 'stem_borer', stage: CropStage.REPRODUCTIVE, threshold: 2, unit: '% white ears', sampleSize: '100 hills', reassessInterval: 5 },
  { crop: 'rice', pest: 'brown_planthopper', stage: CropStage.VEGETATIVE, threshold: 10, unit: 'hoppers/hill', sampleSize: '20 hills', reassessInterval: 3 },
  { crop: 'rice', pest: 'leaf_folder', stage: CropStage.VEGETATIVE, threshold: 2, unit: 'damaged leaves/hill', sampleSize: '20 hills', reassessInterval: 7 },

  // WHEAT PEST THRESHOLDS
  { crop: 'wheat', pest: 'aphid', stage: CropStage.REPRODUCTIVE, threshold: 5, unit: 'aphids/ear', sampleSize: '20 ears', reassessInterval: 3 },
  { crop: 'wheat', pest: 'armyworm', stage: CropStage.VEGETATIVE, threshold: 4, unit: 'larvae/m²', sampleSize: '1 m² quadrat, 5 locations', reassessInterval: 3 },
  { crop: 'wheat', pest: 'termite', stage: CropStage.VEGETATIVE, threshold: 5, unit: '% wilted plants', sampleSize: '100 plants', reassessInterval: 7 },

  // CHICKPEA PEST THRESHOLDS
  { crop: 'chickpea', pest: 'pod_borer', stage: CropStage.REPRODUCTIVE, threshold: 1, unit: 'larvae/plant', sampleSize: '25 plants', reassessInterval: 3, reason: 'Critical flowering stage' },
  { crop: 'chickpea', pest: 'cutworm', stage: CropStage.GERMINATION, threshold: 2, unit: '% cut plants', sampleSize: '100 plants', reassessInterval: 2 },

  // SUGARCANE PEST THRESHOLDS
  { crop: 'sugarcane', pest: 'early_shoot_borer', stage: CropStage.VEGETATIVE, threshold: 10, unit: '% dead hearts', sampleSize: '100 clumps', reassessInterval: 7 },
  { crop: 'sugarcane', pest: 'top_borer', stage: CropStage.VEGETATIVE, threshold: 5, unit: '% affected shoots', sampleSize: '100 clumps', reassessInterval: 7 },
  { crop: 'sugarcane', pest: 'pyrilla', stage: CropStage.VEGETATIVE, threshold: 5, unit: 'adults/leaf', sampleSize: '25 leaves', reassessInterval: 7 },

  // VEGETABLES GENERAL THRESHOLDS
  { crop: 'cabbage', pest: 'diamondback_moth', stage: CropStage.VEGETATIVE, threshold: 1, unit: 'larvae/plant', sampleSize: '25 plants', reassessInterval: 3 },
  { crop: 'brinjal', pest: 'shoot_borer', stage: CropStage.VEGETATIVE, threshold: 5, unit: '% affected shoots', sampleSize: '25 plants', reassessInterval: 5 },
  { crop: 'okra', pest: 'shoot_borer', stage: CropStage.VEGETATIVE, threshold: 5, unit: '% affected shoots/fruits', sampleSize: '25 plants', reassessInterval: 5 },
  { crop: 'chili', pest: 'thrips', stage: CropStage.VEGETATIVE, threshold: 10, unit: 'thrips/leaf', sampleSize: '25 leaves', reassessInterval: 5 },
  { crop: 'onion', pest: 'thrips', stage: CropStage.VEGETATIVE, threshold: 25, unit: 'thrips/plant', sampleSize: '25 plants', reassessInterval: 3 },
];

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE SEVERITY THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

export const DISEASE_SEVERITY_THRESHOLDS = {
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
  // PEST ETL EXCEEDED - COTTON APHID
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_001',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const pestDensity = Number(input.metadata?.pestDensity) || 0;
      const stage = input.crop_stage;
      const threshold = stage === CropStage.VEGETATIVE ? 10 : 5;
      return input.metadata?.pestType === 'aphid' && pestDensity >= threshold;
    },
    cause: Cause.ECONOMIC_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-CICR, Nagpur - ETL Guidelines 2023',
    scientific_basis: 'Cotton aphid ETL varies by stage. Above threshold, economic loss exceeds treatment cost.',
    icar_package: 'Dhawan et al. 2021 - Economic thresholds for cotton pests',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PEST ETL EXCEEDED - COTTON BOLLWORM
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_002',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input: DecisionInput) => {
      const larvaeCount = Number(input.metadata?.larvaeCount) || 0;
      return input.metadata?.pestType === 'bollworm' && larvaeCount >= 1;
    },
    cause: Cause.ECONOMIC_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-CICR Bollworm Management',
    scientific_basis: 'Bollworm at 1 larva/10 plants causes economic damage. Early intervention prevents boll damage.',
    icar_package: 'Validated across Bt and non-Bt cotton',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PEST ETL EXCEEDED - TOMATO FRUIT BORER
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_003',
    category: 'pest',
    crop_code: 'tomato',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput) => {
      const fruitDamage = Number(input.metadata?.fruitDamagePercent) || 0;
      return input.metadata?.pestType === 'fruit_borer' && fruitDamage >= 2;
    },
    cause: Cause.ECONOMIC_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-IIHR Tomato IPM',
    scientific_basis: 'At 2% fruit damage, economic loss from unmarketable fruit exceeds treatment cost. Zero tolerance for export quality.',
    icar_package: 'Krishnamoorthy & Mani 1996 - Helicoverpa ETL',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE SEVERITY - HIGH VALUE CROPS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_004',
    category: 'disease',
    crop_code: 'tomato',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const severity = Number(input.metadata?.diseaseSeverity) || 0;
      return severity >= DISEASE_SEVERITY_THRESHOLDS.highValueCrops.action;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR Plant Pathology Guidelines',
    scientific_basis: 'Disease severity above 10% in high-value vegetables requires immediate fungicide intervention to prevent yield loss.',
    icar_package: 'ICAR Disease Management Packages',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RICE STEM BORER ETL
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_005',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = Number(input.metadata?.deadHeartsPercent) || 0;
      const whiteEars = Number(input.metadata?.whiteEarsPercent) || 0;
      const stage = input.crop_stage;
      
      if (stage === CropStage.VEGETATIVE) {
        return deadHearts >= 5;
      } else {
        return whiteEars >= 2;
      }
    },
    cause: Cause.ECONOMIC_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-NRRI Rice IPM',
    scientific_basis: 'Stem borer damage at 5% dead hearts or 2% white ears causes economic yield loss requiring intervention.',
    icar_package: 'ICAR Rice Package of Practices',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // COST-BENEFIT CHECK
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_006',
    category: 'economic',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const expectedLoss = Number(input.metadata?.expectedLoss) || 0;
      const treatmentCost = Number(input.metadata?.treatmentCost) || 0;
      if (expectedLoss === 0 || treatmentCost === 0) return false;
      
      const result = calculateCostBenefitRatio(expectedLoss, treatmentCost, 0.7);
      return result.decision === 'NOT_ECONOMICAL';
    },
    cause: Cause.TREATMENT_NOT_ECONOMICAL,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'Pedigo et al. 1986 - Economic Decision Levels',
    scientific_basis: 'When treatment cost exceeds expected benefit, intervention is not economically justified.',
    icar_package: 'IPM Economic Analysis Framework',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BELOW ETL - MONITOR ONLY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_007',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const pestDensity = Number(input.metadata?.pestDensity) || 0;
      const threshold = Number(input.metadata?.etlThreshold) || 10;
      return pestDensity > 0 && pestDensity < threshold * 0.5;
    },
    cause: Cause.BELOW_ETL_MONITOR,
    priority: PriorityLevel.P6_OPTIMIZATION,
    scientific_source: 'ICAR-NCIPM IPM Guidelines',
    scientific_basis: 'Pest population below 50% of ETL does not justify treatment. Continue monitoring at regular intervals.',
    icar_package: 'IPM Scouting Protocols',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WILT DISEASES - ZERO TOLERANCE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ETL_008',
    category: 'disease',
    crop_code: 'cotton',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const diseaseType = String(input.metadata?.diseaseType || '').toLowerCase();
      const isWilt = diseaseType.includes('wilt') || diseaseType.includes('fusarium');
      const severity = Number(input.metadata?.diseaseSeverity) || 0;
      return isWilt && severity >= 1;
    },
    cause: Cause.WILT_ZERO_TOLERANCE,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR-CICR Wilt Management',
    scientific_basis: 'Wilt diseases are soil-borne and spread rapidly. Even 1% incidence requires immediate action to prevent field-wide loss.',
    icar_package: 'ICAR Cotton Disease Management',
  },
];

export default ECONOMIC_THRESHOLD_RULES;

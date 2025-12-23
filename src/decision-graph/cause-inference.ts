/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAUSE INFERENCE ENGINE - Facts → Causes
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module executes cause rules against symbolic facts to infer causes.
 * All rules are deterministic, explicit, and auditable.
 * 
 * CRITICAL: NO AI calls, NO calculations, NO database queries
 * 
 * Version: 1.0.0
 */

import {
  DecisionInput,
  Cause,
  CauseRule,
  CropStage,
  CropGroup
} from './types';

// Import crop group rules
import { CEREALS_RULES } from './crop-group-rules/cereals';
import { PULSES_RULES } from './crop-group-rules/pulses';
import { OILSEEDS_RULES } from './crop-group-rules/oilseeds';
import { FIBER_RULES } from './crop-group-rules/fiber';
import SUGARCANE_RULES from './crop-group-rules/sugarcane';
import { VEGETABLES_RULES } from './crop-group-rules/vegetables';
import { FRUITS_RULES } from './crop-group-rules/fruits';
import { SPICES_RULES } from './crop-group-rules/spices';
import { FODDER_RULES } from './crop-group-rules/fodder';

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL FALLBACK RULES - Apply to all crops
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Global rules that apply across all crop groups
 * These serve as fallbacks when no crop-specific rule matches
 */
export const GLOBAL_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL / EMERGENCY RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  // G_CRIT_001: Crop failure imminent
  {
    rule_id: 'G_CRIT_001',
    category: 'critical',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [
      CropStage.VEGETATIVE,
      CropStage.REPRODUCTIVE,
      CropStage.MATURITY
    ],
    conditions: (input) =>
      input.ndvi_state === 'CRITICAL' &&
      input.ndvi_trend === 'DECLINING',
    cause: Cause.CROP_FAILURE_IMMINENT,
    priority: 10,
    scientific_source: 'FAO Emergency Response',
    scientific_basis: 'NDVI < 0.20 with declining trend indicates severe crop stress. Immediate intervention required to prevent total loss.'
  },

  // G_CRIT_002: Compound stress
  {
    rule_id: 'G_CRIT_002',
    category: 'critical',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [
      CropStage.VEGETATIVE,
      CropStage.REPRODUCTIVE
    ],
    conditions: (input) =>
      input.ndvi_state === 'HIGH_STRESS' &&
      input.soil_states.n === 'LOW_N' &&
      input.weather_state === 'HEAT_STRESS',
    cause: Cause.COMPOUND_STRESS,
    priority: 9,
    scientific_source: 'ICAR Stress Management',
    scientific_basis: 'Multiple concurrent stressors (nutrient + water + heat) cause exponential damage. Address water first, then nutrients.'
  },

  // G_CRIT_003: Uncertain critical situation
  {
    rule_id: 'G_CRIT_003',
    category: 'critical',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [
      CropStage.VEGETATIVE,
      CropStage.REPRODUCTIVE,
      CropStage.MATURITY
    ],
    conditions: (input) =>
      (input.ndvi_state === 'HIGH_STRESS' || input.ndvi_state === 'CRITICAL') &&
      input.data_confidence.ndvi < 0.5 &&
      input.data_confidence.soil < 0.5,
    cause: Cause.UNCERTAIN_CRITICAL,
    priority: 8,
    scientific_source: 'System',
    scientific_basis: 'Critical stress detected but data confidence is low. Expert consultation recommended before major interventions.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT DEFICIENCY RULES (Global)
  // ─────────────────────────────────────────────────────────────────────────

  // G_NPK_001: Nitrogen deficiency - vegetative
  {
    rule_id: 'G_NPK_001',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === 'LOW_N' &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IARI General Package',
    scientific_basis: 'Nitrogen is critical for chlorophyll synthesis during vegetative growth. Deficiency causes yellowing of older leaves.'
  },

  // G_NPK_002: Nitrogen deficiency - critical at reproductive
  {
    rule_id: 'G_NPK_002',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.n === 'LOW_N' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR Critical Stages',
    scientific_basis: 'N deficiency at flowering/fruiting reduces grain/fruit set by 30-50%.'
  },

  // G_NPK_003: Phosphorus deficiency
  {
    rule_id: 'G_NPK_003',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.p === 'LOW_P',
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IISS Soil Science',
    scientific_basis: 'Phosphorus is essential for root development and energy transfer. Early deficiency stunts growth permanently.'
  },

  // G_NPK_004: Potassium deficiency
  {
    rule_id: 'G_NPK_004',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.soil_states.k === 'LOW_K' &&
      (input.crop_stage === CropStage.REPRODUCTIVE || input.crop_stage === CropStage.MATURITY),
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR General',
    scientific_basis: 'Potassium is critical for fruit quality, disease resistance, and drought tolerance.'
  },

  // G_NPK_005: Severe nutrient depletion
  {
    rule_id: 'G_NPK_005',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.n === 'LOW_N' &&
      input.soil_states.p === 'LOW_P' &&
      input.soil_states.k === 'LOW_K',
    cause: Cause.SEVERE_NUTRIENT_DEPLETION,
    priority: 9,
    scientific_source: 'FAO Soil Management',
    scientific_basis: 'Multiple nutrient deficiencies indicate severely depleted soil. Comprehensive fertilization required.'
  },

  // G_NPK_006: Nutrient lockout - acidic soil
  {
    rule_id: 'G_NPK_006',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.ph === 'ACIDIC' &&
      (input.soil_states.p === 'LOW_P' || input.soil_states.k === 'LOW_K'),
    cause: Cause.NUTRIENT_LOCKOUT_ACIDIC,
    priority: 7,
    scientific_source: 'FAO Soil Guide',
    scientific_basis: 'Acidic pH < 6.0 reduces P and K availability. Lime application needed before fertilizer.'
  },

  // G_NPK_007: Nutrient lockout - alkaline soil
  {
    rule_id: 'G_NPK_007',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.ph === 'ALKALINE' &&
      input.soil_states.zinc === 'LOW_ZN',
    cause: Cause.NUTRIENT_LOCKOUT_ALKALINE,
    priority: 7,
    scientific_source: 'FAO Soil Guide',
    scientific_basis: 'Alkaline pH > 7.5 reduces micronutrient (Zn, Fe, Mn) availability. Gypsum application may help.'
  },

  // G_NPK_008: Excess nitrogen - lodging risk
  {
    rule_id: 'G_NPK_008',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.n === 'HIGH_N' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.EXCESS_NITROGEN_LODGING,
    priority: 6,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Excess nitrogen promotes vegetative growth over reproductive, increases lodging risk, and delays maturity.'
  },

  // G_NPK_009: Excess nitrogen - disease risk
  {
    rule_id: 'G_NPK_009',
    category: 'nutrient',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.n === 'HIGH_N' &&
      input.weather_state === 'HIGH_HUMIDITY',
    cause: Cause.EXCESS_NITROGEN_DISEASE,
    priority: 7,
    scientific_source: 'ICAR Disease Management',
    scientific_basis: 'Excess nitrogen with high humidity creates ideal conditions for fungal diseases.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WATER STRESS RULES (Global)
  // ─────────────────────────────────────────────────────────────────────────

  // G_WATER_001: Mild water stress
  {
    rule_id: 'G_WATER_001',
    category: 'water',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === 'MODERATE_STRESS' &&
      input.soil_states.moisture === 'DRY' &&
      input.weather_state !== 'RAIN_EXPECTED' &&
      input.weather_state !== 'RAIN_ACTIVE',
    cause: Cause.WATER_STRESS_MILD,
    priority: 6,
    scientific_source: 'FAO Irrigation Guide',
    scientific_basis: 'Early water stress can be reversed with timely irrigation. Monitor and irrigate if no rain expected.'
  },

  // G_WATER_002: Moderate water stress
  {
    rule_id: 'G_WATER_002',
    category: 'water',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === 'HIGH_STRESS' &&
      input.soil_states.moisture === 'DRY' &&
      input.weather_state === 'DRY_SPELL',
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'FAO Irrigation Guide',
    scientific_basis: 'High stress with dry spell indicates significant water deficit. Immediate irrigation recommended.'
  },

  // G_WATER_003: Critical water stress
  {
    rule_id: 'G_WATER_003',
    category: 'water',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.ndvi_state === 'HIGH_STRESS' || input.ndvi_state === 'CRITICAL') &&
      input.soil_states.moisture === 'DRY' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR Critical Irrigation Stages',
    scientific_basis: 'Water stress at reproductive stage causes irreversible yield loss. Emergency irrigation needed.'
  },

  // G_WATER_004: Drought stress
  {
    rule_id: 'G_WATER_004',
    category: 'water',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.ndvi_state === 'CRITICAL' &&
      input.weather_state === 'DRY_SPELL' &&
      input.ndvi_trend === 'DECLINING',
    cause: Cause.DROUGHT_STRESS,
    priority: 10,
    scientific_source: 'ICAR-CRIDA Drought Management',
    scientific_basis: 'Prolonged dry spell with declining NDVI indicates severe drought stress. Consider salvage harvest if recovery unlikely.'
  },

  // G_WATER_005: Waterlogging
  {
    rule_id: 'G_WATER_005',
    category: 'water',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === 'WATERLOGGED',
    cause: Cause.WATERLOGGING,
    priority: 8,
    scientific_source: 'FAO Drainage Guide',
    scientific_basis: 'Waterlogging causes root asphyxiation and promotes root rot. Drainage essential within 24-48 hours.'
  },

  // G_WATER_006: Severe waterlogging (after rain)
  {
    rule_id: 'G_WATER_006',
    category: 'water',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === 'WATERLOGGED' &&
      (input.weather_state === 'RAIN_ACTIVE' || input.weather_state === 'HIGH_HUMIDITY'),
    cause: Cause.WATERLOGGING_SEVERE,
    priority: 9,
    scientific_source: 'FAO Drainage Guide',
    scientific_basis: 'Active rain with waterlogged soil requires immediate drainage to prevent crop loss.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPERATURE STRESS RULES (Global)
  // ─────────────────────────────────────────────────────────────────────────

  // G_TEMP_001: Heat stress
  {
    rule_id: 'G_TEMP_001',
    category: 'temperature',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.weather_state === 'HEAT_STRESS',
    cause: Cause.HEAT_STRESS,
    priority: 7,
    scientific_source: 'FAO Heat Stress Management',
    scientific_basis: 'High temperature (>35°C) increases transpiration and water demand. Light irrigation for cooling recommended.'
  },

  // G_TEMP_002: Cold stress
  {
    rule_id: 'G_TEMP_002',
    category: 'temperature',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.weather_state === 'COLD_STRESS',
    cause: Cause.COLD_STRESS,
    priority: 7,
    scientific_source: 'FAO Cold Protection',
    scientific_basis: 'Cold stress (<10°C) slows growth and can damage sensitive crops. Cover or mulch for protection.'
  },

  // G_TEMP_003: Frost risk
  {
    rule_id: 'G_TEMP_003',
    category: 'temperature',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.weather_state === 'FROST_RISK',
    cause: Cause.FROST_DAMAGE_RISK,
    priority: 9,
    scientific_source: 'ICAR Frost Protection',
    scientific_basis: 'Frost (<4°C) can kill tender tissue. Smoke pots, sprinkler irrigation, or covers needed for protection.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RISK RULES (Global)
  // ─────────────────────────────────────────────────────────────────────────

  // G_DIS_001: General fungal disease risk
  {
    rule_id: 'G_DIS_001',
    category: 'disease',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.weather_state === 'HIGH_HUMIDITY' &&
      input.ndvi_trend === 'DECLINING',
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 6,
    scientific_source: 'ICAR IPM General',
    scientific_basis: 'High humidity (>85%) favors fungal diseases. Scout for symptoms and apply preventive fungicide.'
  },

  // G_DIS_002: Root rot risk
  {
    rule_id: 'G_DIS_002',
    category: 'disease',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.moisture === 'WATERLOGGED' &&
      input.ndvi_trend === 'DECLINING',
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR Disease Management',
    scientific_basis: 'Waterlogged conditions favor soil-borne pathogens. Improve drainage and apply Trichoderma.'
  },

  // G_DIS_003: Damping off risk
  {
    rule_id: 'G_DIS_003',
    category: 'disease',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_stage === CropStage.GERMINATION &&
      (input.weather_state === 'HIGH_HUMIDITY' || input.soil_states.moisture === 'WATERLOGGED'),
    cause: Cause.DAMPING_OFF_RISK,
    priority: 8,
    scientific_source: 'ICAR Seed Treatment',
    scientific_basis: 'Young seedlings are susceptible to damping off in wet conditions. Ensure good drainage and seed treatment.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WEED RULES (Global)
  // ─────────────────────────────────────────────────────────────────────────

  // G_WEED_001: Weed emergence window
  {
    rule_id: 'G_WEED_001',
    category: 'weed',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.days_after_sowing >= 15 && input.days_after_sowing <= 35,
    cause: Cause.WEED_EMERGENCE_WINDOW,
    priority: 6,
    scientific_source: 'ICAR Weed Management',
    scientific_basis: 'Critical weed competition period is 15-45 DAS. Timely weeding or herbicide application essential.'
  },

  // G_WEED_002: Critical weed competition
  {
    rule_id: 'G_WEED_002',
    category: 'weed',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.days_after_sowing >= 25 && input.days_after_sowing <= 45 &&
      input.ndvi_trend === 'DECLINING',
    cause: Cause.WEED_COMPETITION_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR Weed Management',
    scientific_basis: 'Declining NDVI during critical period may indicate weed competition. Immediate weeding required.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTHY / POSITIVE RULES (Global)
  // ─────────────────────────────────────────────────────────────────────────

  // G_HEALTHY_001: Optimal growth conditions
  {
    rule_id: 'G_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.ndvi_state === 'EXCELLENT' || input.ndvi_state === 'HEALTHY') &&
      (input.ndvi_trend === 'STABLE' || input.ndvi_trend === 'RISING') &&
      input.soil_states.n === 'ADEQUATE_N' &&
      input.soil_states.moisture === 'OPTIMAL',
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NASA/ICAR',
    scientific_basis: 'NDVI ≥0.50 with stable/rising trend and adequate nutrients indicates healthy photosynthetic activity.'
  },

  // G_HEALTHY_002: Recovery trend
  {
    rule_id: 'G_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === 'MODERATE_STRESS' &&
      input.ndvi_trend === 'RISING',
    cause: Cause.RECOVERY_TREND,
    priority: 4,
    scientific_source: 'ICAR Recovery Monitoring',
    scientific_basis: 'Rising NDVI trend indicates recovery from stress. Continue current practices.'
  },

  // G_HEALTHY_003: High yield potential
  {
    rule_id: 'G_HEALTHY_003',
    category: 'healthy',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === 'EXCELLENT' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.n === 'ADEQUATE_N' &&
      input.soil_states.k === 'ADEQUATE_K',
    cause: Cause.YIELD_POTENTIAL_HIGH,
    priority: 3,
    scientific_source: 'ICAR Yield Estimation',
    scientific_basis: 'Excellent NDVI at reproductive stage with adequate nutrition indicates high yield potential.'
  },

  // G_HEALTHY_004: Harvest ready
  {
    rule_id: 'G_HEALTHY_004',
    category: 'healthy',
    crop_code: 'ALL_GLOBAL',
    stage_applicable: [CropStage.MATURITY, CropStage.HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.MATURITY || input.crop_stage === CropStage.HARVEST) &&
      input.ndvi_trend === 'DECLINING' &&
      input.weather_state !== 'RAIN_EXPECTED' &&
      input.weather_state !== 'RAIN_ACTIVE',
    cause: Cause.HARVEST_READY,
    priority: 5,
    scientific_source: 'ICAR Harvest Management',
    scientific_basis: 'Declining NDVI at maturity with clear weather indicates optimal harvest window.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// RULE LOADING AND FILTERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crop group to rules mapping
 * Populated with imported rules from crop-group-rules/*.ts
 */
const CROP_GROUP_RULES: Record<CropGroup, CauseRule[]> = {
  [CropGroup.CEREALS]: CEREALS_RULES,
  [CropGroup.PULSES]: PULSES_RULES,
  [CropGroup.OILSEEDS]: OILSEEDS_RULES,
  [CropGroup.FIBER]: FIBER_RULES,
  [CropGroup.SUGARCANE]: SUGARCANE_RULES,
  [CropGroup.VEGETABLES]: VEGETABLES_RULES,
  [CropGroup.FRUITS]: FRUITS_RULES,
  [CropGroup.SPICES]: SPICES_RULES,
  [CropGroup.FODDER]: FODDER_RULES
};

/**
 * Load rules for a crop group
 * In production, this may fetch from database
 * 
 * @param cropGroup - Crop group to load rules for
 * @returns Array of CauseRules
 */
export function loadCropGroupRules(cropGroup: CropGroup): CauseRule[] {
  return CROP_GROUP_RULES[cropGroup] || [];
}

/**
 * Filter rules for a specific crop and stage
 * 
 * Priority order:
 * 1. Exact crop_code match for current stage
 * 2. ALL_<GROUP> rules for current stage
 * 3. Global fallback rules for current stage
 * 
 * @param rules - All rules to filter
 * @param cropCode - Specific crop code
 * @param stage - Current crop stage
 * @returns Filtered and sorted rules
 */
export function filterRulesForCrop(
  rules: CauseRule[],
  cropCode: string,
  stage: CropStage,
  cropVariety?: string,
  economicFilter?: 'MARGINAL' | 'SMALL' | 'MEDIUM' | 'LARGE'
): CauseRule[] {
  const normalizedCropCode = cropCode.toLowerCase();

  return rules
    .filter(rule => {
      // Check stage applicability
      if (!rule.stage_applicable.includes(stage)) {
        return false;
      }

      // Check crop code match
      const ruleCropCode = rule.crop_code.toLowerCase();
      
      // Exact match
      if (ruleCropCode !== normalizedCropCode && !ruleCropCode.startsWith('all_')) {
        return false;
      }

      // STEP 1: Skip deprecated rules
      if (rule.metadata?.deprecated) {
        return false;
      }

      // STEP 4: Variety filter
      if (rule.variety_filter && cropVariety) {
        const normalizedVariety = cropVariety.toLowerCase();
        if (rule.variety_filter.include && 
            !rule.variety_filter.include.some(v => v.toLowerCase() === normalizedVariety)) {
          return false;
        }
        if (rule.variety_filter.exclude && 
            rule.variety_filter.exclude.some(v => v.toLowerCase() === normalizedVariety)) {
          return false;
        }
      }

      // STEP 8: Economic filter - skip high-cost rules for marginal farmers
      if (economicFilter && rule.economic_tier) {
        if ((economicFilter === 'MARGINAL' || economicFilter === 'SMALL') && 
            rule.economic_tier === 'HIGH_COST') {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      // Specific crop rules first
      const aIsSpecific = a.crop_code.toLowerCase() === normalizedCropCode;
      const bIsSpecific = b.crop_code.toLowerCase() === normalizedCropCode;
      
      if (aIsSpecific && !bIsSpecific) return -1;
      if (bIsSpecific && !aIsSpecific) return 1;
      
      // Then by priority (higher priority first)
      return b.priority - a.priority;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE INFERENCE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of rule execution for audit trail
 */
export interface RuleExecutionResult {
  rule_id: string;
  matched: boolean;
  cause?: Cause;
  priority?: number;
}

/**
 * Execute all applicable rules against input and collect matching causes
 * 
 * CRITICAL: This is pure, deterministic logic
 * - No AI calls
 * - No database queries
 * - No side effects
 * - Same input ALWAYS produces same output
 * 
 * @param input - DecisionInput with all symbolic facts
 * @param additionalRules - Crop-specific rules to include
 * @returns Object with inferred causes and execution trace
 */
export function inferCauses(
  input: DecisionInput,
  additionalRules: CauseRule[] = []
): {
  causes: Cause[];
  rulesApplied: string[];
  executionTrace: RuleExecutionResult[];
} {
  const executionTrace: RuleExecutionResult[] = [];
  const matchedCauses: Map<Cause, { priority: number; rule_id: string }> = new Map();

  // Combine all applicable rules
  const allRules = [
    ...additionalRules,
    ...GLOBAL_RULES
  ];

  // Filter for current crop and stage
  const applicableRules = filterRulesForCrop(
    allRules,
    input.crop_code,
    input.crop_stage
  );

  // Execute each rule
  for (const rule of applicableRules) {
    try {
      const matched = rule.conditions(input);
      
      executionTrace.push({
        rule_id: rule.rule_id,
        matched,
        cause: matched ? rule.cause : undefined,
        priority: matched ? rule.priority : undefined
      });

      if (matched) {
        // Only keep highest priority rule for each cause
        const existing = matchedCauses.get(rule.cause);
        if (!existing || rule.priority > existing.priority) {
          matchedCauses.set(rule.cause, {
            priority: rule.priority,
            rule_id: rule.rule_id
          });
        }
      }
    } catch (error) {
      // Log error but continue processing
      console.error(`Rule ${rule.rule_id} failed:`, error);
      executionTrace.push({
        rule_id: rule.rule_id,
        matched: false
      });
    }
  }

  // Sort causes by priority (highest first)
  const sortedCauses = Array.from(matchedCauses.entries())
    .sort((a, b) => b[1].priority - a[1].priority)
    .map(([cause]) => cause);

  const rulesApplied = Array.from(matchedCauses.values())
    .map(v => v.rule_id);

  return {
    causes: sortedCauses,
    rulesApplied,
    executionTrace
  };
}

/**
 * Register crop group rules
 * Called during initialization to load crop-specific rules
 * 
 * @param cropGroup - Crop group
 * @param rules - Rules to register
 */
export function registerCropGroupRules(cropGroup: CropGroup, rules: CauseRule[]): void {
  CROP_GROUP_RULES[cropGroup] = rules;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  CROP_GROUP_RULES
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 1: PLANT DEMAND BASED DECISION LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Replaces calendar dependency with plant-signal dependency using:
 * - NDVI trend and growth rate
 * - Crop stage
 * - Soil test parameters
 * - Weather forecast
 * 
 * ICAR ALIGNMENT: Extends ICAR recommendations by adding plant physiology
 * signals. Never overrides ICAR safety rules.
 * 
 * Version: 2.0.0
 */

import { CropStage, NDVIState, NDVITrend, SoilNState } from '../types';
import {
  AdvancedCauseRule,
  AdvancedDecisionInput,
  NDVI_GROWTH_RATE_THRESHOLDS
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1 RULES: Plant Demand Based Decisions
// ═══════════════════════════════════════════════════════════════════════════

export const PLANT_DEMAND_RULES: AdvancedCauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // PD_001: NDVI stagnation despite adequate nitrogen → Root/hormone issue
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_PD_001',
    layer: 1,
    category: 'plant_demand',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const ndviGrowthRate = input.ndvi_growth_rate ?? 0;
      const expectedRate = input.ndvi_expected_growth_rate ?? NDVI_GROWTH_RATE_THRESHOLDS.NORMAL;
      const soilN = input.soil_states.n;
      
      // NDVI growing slower than expected despite adequate N
      return (
        ndviGrowthRate < expectedRate * 0.5 &&  // Less than 50% of expected
        (soilN === SoilNState.ADEQUATE_N || soilN === SoilNState.HIGH_N) &&
        input.crop_stage === CropStage.VEGETATIVE
      );
    },
    
    cause: 'NDVI_STAGNATION_ROOT_CAUSE',
    priority: 7,
    
    yield_impact_percent: { min: 10, max: 25 },
    
    scientific_source: 'FAO Plant Physiology Guide + ICAR',
    scientific_basis: 'When NDVI growth stagnates despite adequate N, the issue is typically root health, micronutrient lockout, or soil compaction - NOT nitrogen. Adding more N wastes money and may cause toxicity.',
    global_practice_ref: 'Israel Precision Agriculture, Brazil Modern Farming',
    icar_alignment: 'Extends ICAR by preventing unnecessary N application when plant signals indicate root/soil issue'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PD_002: NDVI declining + adequate soil → Root support priority
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_PD_002',
    layer: 1,
    category: 'plant_demand',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const { n, p, k } = input.soil_states;
      
      return (
        input.ndvi_trend === NDVITrend.DECLINING &&
        input.ndvi_state !== NDVIState.CRITICAL &&
        n !== SoilNState.LOW_N &&  // Soil is not deficient
        input.stress_severity !== 'severe'
      );
    },
    
    cause: 'PLANT_SIGNAL_ROOT_SUPPORT_NEEDED',
    priority: 8,
    
    yield_impact_percent: { min: 15, max: 30 },
    
    scientific_source: 'Global Plant Physiology Research',
    scientific_basis: 'Declining NDVI with adequate soil nutrients indicates root dysfunction or stress. Biostimulants (humic acid, seaweed) support root recovery better than fertilizers.',
    global_practice_ref: 'USA Regenerative Agriculture, European Organic Protocols',
    icar_alignment: 'Complements ICAR by addressing root health before nutrient application'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PD_003: Plant signal says nitrogen NOT needed despite calendar
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_PD_003',
    layer: 1,
    category: 'plant_demand',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const ndviGrowthRate = input.ndvi_growth_rate ?? 0;
      
      return (
        input.ndvi_state === NDVIState.HEALTHY ||
        input.ndvi_state === NDVIState.EXCELLENT
      ) && (
        input.ndvi_trend === NDVITrend.RISING ||
        input.ndvi_trend === NDVITrend.STABLE
      ) && (
        ndviGrowthRate >= NDVI_GROWTH_RATE_THRESHOLDS.NORMAL
      );
    },
    
    cause: 'PLANT_SIGNAL_NITROGEN_NOT_NEEDED',
    priority: 6,
    
    yield_impact_percent: { min: 0, max: 5 },
    
    scientific_source: 'Precision Agriculture Global Standards',
    scientific_basis: 'When NDVI shows excellent growth, plant is uptaking nutrients efficiently. Additional nitrogen wastes money, increases lodging risk, and pollutes groundwater.',
    global_practice_ref: 'Variable Rate Technology (VRT) Standards',
    icar_alignment: 'Adds precision to ICAR calendar-based recommendations'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PD_004: NDVI deviation detection - early warning
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_PD_004',
    layer: 1,
    category: 'plant_demand',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const deviation = input.ndvi_deviation_percent ?? 0;
      
      // NDVI is 20%+ below expected for this stage
      return (
        deviation < -20 &&
        input.ndvi_state !== NDVIState.CRITICAL
      );
    },
    
    cause: 'PLANT_SIGNAL_ROOT_SUPPORT_NEEDED',
    priority: 7,
    
    yield_impact_percent: { min: 10, max: 20 },
    
    scientific_source: 'NASA/ESA Remote Sensing + ICAR',
    scientific_basis: 'NDVI deviation from stage-expected value indicates underlying issue. Early intervention through root/soil support prevents yield loss.',
    global_practice_ref: 'Satellite-based Precision Agriculture',
    icar_alignment: 'Extends ICAR with remote sensing intelligence'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PD_005: Vegetative stage with excellent NDVI → Prepare for reproductive
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_PD_005',
    layer: 1,
    category: 'plant_demand',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const cropLifePercent = input.crop_life_percent ?? 0;
      
      // Late vegetative (40-60% of crop life)
      return (
        cropLifePercent >= 0.40 &&
        cropLifePercent <= 0.60 &&
        input.ndvi_state === NDVIState.EXCELLENT &&
        input.crop_stage === CropStage.VEGETATIVE
      );
    },
    
    cause: 'SHOOT_PRIORITY_PHASE',
    priority: 5,
    
    yield_impact_percent: { min: 5, max: 15 },
    
    scientific_source: 'Global Agronomy Best Practices',
    scientific_basis: 'Excellent vegetative growth indicates plant is ready for reproductive transition. Shift focus from vegetative to reproductive nutrition (K, micronutrients).',
    global_practice_ref: 'Brazil Soybean Production, Israel Vegetable Farming',
    icar_alignment: 'Aligns with ICAR stage-based nutrient recommendations'
  }
];

/**
 * Evaluate plant demand rules
 * Returns only rules that pass all conditions
 */
export function evaluatePlantDemandRules(
  input: AdvancedDecisionInput
): AdvancedCauseRule[] {
  return PLANT_DEMAND_RULES.filter(rule => {
    // Check stage applicability
    if (!rule.stage_applicable.includes(input.crop_stage)) {
      return false;
    }
    
    // Check crop code
    if (rule.crop_code !== 'ALL_CROPS' && rule.crop_code !== input.crop_code) {
      return false;
    }
    
    // Check conditions
    if (!rule.conditions(input)) {
      return false;
    }
    
    // Check safety gate if present
    if (rule.safety_gate && !rule.safety_gate(input)) {
      return false;
    }
    
    // Check block conditions if present
    if (rule.block_conditions) {
      for (const blockCondition of rule.block_conditions) {
        if (blockCondition(input)) {
          return false;
        }
      }
    }
    
    return true;
  });
}

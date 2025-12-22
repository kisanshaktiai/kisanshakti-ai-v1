/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 3: NITROGEN EFFICIENCY RULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Smart nitrogen gating based on:
 * - NDVI stability
 * - Rainfall forecast
 * - Soil organic carbon
 * - Application timing optimization
 * 
 * ICAR ALIGNMENT: Based on ICAR N recommendations. Extends with efficiency
 * optimization to reduce waste and maximize yield per kg N applied.
 * 
 * Version: 2.0.0
 */

import { CropStage, SoilNState, SoilOCState, NDVIState, NDVITrend, WeatherState } from '../types';
import {
  AdvancedCauseRule,
  AdvancedDecisionInput,
  RAINFALL_THRESHOLDS
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3 RULES: Nitrogen Efficiency
// ═══════════════════════════════════════════════════════════════════════════

export const NITROGEN_EFFICIENCY_RULES: AdvancedCauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // NE_001: High NDVI + heavy rainfall forecast → Delay nitrogen
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_NE_001',
    layer: 3,
    category: 'nitrogen_efficiency',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const rainfallForecast = input.rainfall_forecast_mm ?? 0;
      const forecast3day = input.weather_forecast_3day ?? [];
      
      // Check for heavy rain in forecast
      const heavyRainExpected = 
        rainfallForecast >= RAINFALL_THRESHOLDS.HEAVY ||
        forecast3day.some(w => w === WeatherState.RAIN_EXPECTED || w === WeatherState.RAIN_ACTIVE);
      
      return (
        (input.ndvi_state === NDVIState.HEALTHY || input.ndvi_state === NDVIState.EXCELLENT) &&
        heavyRainExpected
      );
    },
    
    cause: 'NITROGEN_LEACHING_RISK',
    priority: 8,
    
    yield_impact_percent: { min: 0, max: 10 },
    
    scientific_source: 'FAO N Management + ICAR Fertilizer Guide',
    scientific_basis: 'Nitrogen applied before heavy rainfall is lost through leaching (up to 40% in sandy soils). When NDVI is healthy, plant can wait 3-5 days for post-rain application.',
    global_practice_ref: 'IPNI Nitrogen Best Management Practices',
    icar_alignment: 'Extends ICAR timing recommendations with weather integration'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NE_002: High temperature + low humidity → Volatilization risk
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_NE_002',
    layer: 3,
    category: 'nitrogen_efficiency',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const tempMaxForecast = input.temp_max_forecast ?? 25;
      
      return (
        input.weather_state === WeatherState.HEAT_STRESS ||
        tempMaxForecast > 35
      ) && (
        input.soil_states.moisture === 'DRY' ||
        input.soil_states.moisture === 'OPTIMAL'
      );
    },
    
    cause: 'NITROGEN_VOLATILIZATION_RISK',
    priority: 7,
    
    yield_impact_percent: { min: 0, max: 15 },
    
    scientific_source: 'Global N Research + ICAR',
    scientific_basis: 'Urea volatilizes rapidly above 35°C, losing 30-50% of N. Apply early morning, or use neem-coated urea, or delay until cooler conditions.',
    global_practice_ref: 'India Neem-Coated Urea Program',
    icar_alignment: 'Supports ICAR neem-coated urea recommendation'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NE_003: Low soil OC → Reduced N efficiency, split application
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_NE_003',
    layer: 3,
    category: 'nitrogen_efficiency',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const soilOC = input.soil_states.organic_carbon;
      const chemicalEfficiency = input.chemical_response_efficiency ?? 0.7;
      
      return (
        soilOC === SoilOCState.LOW_OC &&
        chemicalEfficiency < 0.6
      );
    },
    
    cause: 'NITROGEN_EFFICIENCY_LOW',
    priority: 6,
    
    yield_impact_percent: { min: 5, max: 15 },
    
    scientific_source: 'ICAR Soil Health Card + Global Research',
    scientific_basis: 'Low organic carbon soils have poor N retention. Split applications (3-4 doses) improve efficiency by 30-40% compared to 2-dose application.',
    global_practice_ref: 'China 4R Nutrient Stewardship',
    icar_alignment: 'Extends ICAR split N recommendation with efficiency reasoning'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NE_004: Optimal timing window for nitrogen
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_NE_004',
    layer: 3,
    category: 'nitrogen_efficiency',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const rainfallForecast = input.rainfall_forecast_mm ?? 0;
      const tempMaxForecast = input.temp_max_forecast ?? 30;
      
      // Light rain expected (will help N absorption) + moderate temp
      return (
        rainfallForecast >= RAINFALL_THRESHOLDS.LIGHT &&
        rainfallForecast < RAINFALL_THRESHOLDS.MODERATE &&
        tempMaxForecast >= 20 && tempMaxForecast <= 32 &&
        input.soil_states.n === SoilNState.LOW_N &&
        input.ndvi_trend !== NDVITrend.DECLINING
      );
    },
    
    cause: 'NITROGEN_TIMING_OPTIMAL',
    priority: 8,
    
    yield_impact_percent: { min: 10, max: 25 },
    
    scientific_source: 'Precision Agriculture + ICAR',
    scientific_basis: 'Light rain (10-25mm) after N application maximizes uptake. Moderate temperatures optimize plant absorption. This is the ideal N application window.',
    global_practice_ref: 'USA Variable Rate Technology',
    icar_alignment: 'Precision timing within ICAR recommended windows'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NE_005: Reproductive stage → Split remaining N
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_NE_005',
    layer: 3,
    category: 'nitrogen_efficiency',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      return (
        input.crop_stage === CropStage.REPRODUCTIVE &&
        input.soil_states.n === SoilNState.LOW_N &&
        input.ndvi_state !== NDVIState.EXCELLENT
      );
    },
    
    cause: 'NITROGEN_SPLIT_REQUIRED',
    priority: 7,
    
    yield_impact_percent: { min: 5, max: 15 },
    
    scientific_source: 'ICAR Critical Stage N + Global Research',
    scientific_basis: 'N application at reproductive stage directly impacts grain/fruit protein and yield. Split into 2 doses (flowering + grain filling) for maximum efficiency.',
    global_practice_ref: 'CIMMYT Wheat Research',
    icar_alignment: 'Directly supports ICAR critical stage N application'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NE_006: NDVI stable at high level → Skip scheduled N
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_NE_006',
    layer: 3,
    category: 'nitrogen_efficiency',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      return (
        input.ndvi_state === NDVIState.EXCELLENT &&
        input.ndvi_trend === NDVITrend.STABLE &&
        (input.soil_states.n === SoilNState.ADEQUATE_N || 
         input.soil_states.n === SoilNState.HIGH_N)
      );
    },
    
    // This blocks nitrogen application - uses same cause type
    cause: 'PLANT_SIGNAL_NITROGEN_NOT_NEEDED',
    priority: 6,
    
    yield_impact_percent: { min: 0, max: 5 },
    
    scientific_source: 'Precision N Management',
    scientific_basis: 'Excellent stable NDVI indicates optimal N uptake. Additional N would be wasted (only 30-40% uptake when plant is saturated).',
    global_practice_ref: 'Sensor-Based N Management',
    icar_alignment: 'Adds precision to prevent over-application beyond ICAR recommended doses'
  }
];

/**
 * Check nitrogen application safety
 */
export function isNitrogenApplicationSafe(input: AdvancedDecisionInput): {
  safe: boolean;
  reason?: string;
  alternative?: string;
} {
  const rainfallForecast = input.rainfall_forecast_mm ?? 0;
  const tempMax = input.temp_max_forecast ?? 30;
  
  if (rainfallForecast >= RAINFALL_THRESHOLDS.HEAVY) {
    return {
      safe: false,
      reason: 'Heavy rainfall forecast - high leaching risk',
      alternative: 'Delay 3-5 days until after rain'
    };
  }
  
  if (tempMax > 38) {
    return {
      safe: false,
      reason: 'Extreme heat - high volatilization risk',
      alternative: 'Apply early morning (before 8 AM) or use neem-coated urea'
    };
  }
  
  if (input.ndvi_state === NDVIState.EXCELLENT && 
      input.soil_states.n !== SoilNState.LOW_N) {
    return {
      safe: false,
      reason: 'Plant signal indicates adequate N - risk of luxury consumption',
      alternative: 'Skip this application or reduce dose by 50%'
    };
  }
  
  return { safe: true };
}

/**
 * Evaluate nitrogen efficiency rules
 */
export function evaluateNitrogenEfficiencyRules(
  input: AdvancedDecisionInput
): AdvancedCauseRule[] {
  return NITROGEN_EFFICIENCY_RULES.filter(rule => {
    if (!rule.stage_applicable.includes(input.crop_stage)) {
      return false;
    }
    
    if (rule.crop_code !== 'ALL_CROPS' && rule.crop_code !== input.crop_code) {
      return false;
    }
    
    return rule.conditions(input);
  });
}

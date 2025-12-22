/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 4: STRESS ANTICIPATION LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PRE-STRESS protection rules using weather forecast.
 * 
 * Stress types handled:
 * - Heat stress
 * - Cold stress  
 * - Drought stress
 * - Excess rainfall / waterlogging
 * 
 * ICAR ALIGNMENT: Based on ICAR contingency planning. Extends by adding
 * proactive biostimulant recommendations BEFORE stress occurs.
 * 
 * Version: 2.0.0
 */

import { CropStage, WeatherState, NDVIState } from '../types';
import {
  AdvancedCauseRule,
  AdvancedDecisionInput,
  RAINFALL_THRESHOLDS
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4 RULES: Stress Anticipation
// ═══════════════════════════════════════════════════════════════════════════

export const STRESS_ANTICIPATION_RULES: AdvancedCauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // SA_001: Heat stress anticipated (3-5 day forecast)
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SA_001',
    layer: 4,
    category: 'stress_anticipation',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const tempMaxForecast = input.temp_max_forecast ?? 30;
      const forecast5day = input.weather_forecast_5day ?? [];
      
      // Heat coming in forecast but not yet present
      const heatComing = 
        tempMaxForecast >= 38 ||
        forecast5day.some(w => w === WeatherState.HEAT_STRESS);
      
      return (
        heatComing &&
        input.weather_state !== WeatherState.HEAT_STRESS && // Not yet stressed
        input.stress_severity !== 'severe'
      );
    },
    
    cause: 'HEAT_STRESS_ANTICIPATED',
    priority: 8,
    
    yield_impact_percent: { min: 10, max: 30 },
    
    scientific_source: 'Global Heat Stress Research + ICAR',
    scientific_basis: 'Pre-stress application of osmolytes (glycine betaine, proline) and silica increases heat tolerance by 15-25%. Applied 2-3 days BEFORE stress, not during.',
    global_practice_ref: 'Israel Desert Agriculture, USA Midwest Heat Management',
    icar_alignment: 'Extends ICAR heat stress management with proactive approach'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SA_002: Cold stress anticipated
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SA_002',
    layer: 4,
    category: 'stress_anticipation',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const tempMinForecast = input.temp_min_forecast ?? 15;
      const forecast5day = input.weather_forecast_5day ?? [];
      
      const coldComing = 
        tempMinForecast <= 8 ||
        forecast5day.some(w => w === WeatherState.COLD_STRESS || w === WeatherState.FROST_RISK);
      
      return (
        coldComing &&
        input.weather_state !== WeatherState.COLD_STRESS &&
        input.weather_state !== WeatherState.FROST_RISK
      );
    },
    
    cause: 'COLD_STRESS_ANTICIPATED',
    priority: 8,
    
    yield_impact_percent: { min: 10, max: 40 },
    
    scientific_source: 'FAO Cold Protection + ICAR',
    scientific_basis: 'Pre-cold application of potassium, seaweed extract, and anti-freeze agents increases cold tolerance. Potassium improves cell osmotic pressure, reducing ice damage.',
    global_practice_ref: 'European Frost Protection, Japan Cold Management',
    icar_alignment: 'Extends ICAR frost protection with nutrient-based resilience'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SA_003: Drought stress anticipated
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SA_003',
    layer: 4,
    category: 'stress_anticipation',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const rainfallForecast = input.rainfall_forecast_mm ?? 0;
      const forecast5day = input.weather_forecast_5day ?? [];
      
      // Dry spell coming
      const droughtComing = 
        rainfallForecast < RAINFALL_THRESHOLDS.LIGHT &&
        forecast5day.filter(w => w === WeatherState.DRY_SPELL || w === WeatherState.CLEAR).length >= 3;
      
      return (
        droughtComing &&
        input.weather_state !== WeatherState.DRY_SPELL &&
        input.ndvi_state !== NDVIState.CRITICAL
      );
    },
    
    cause: 'DROUGHT_STRESS_ANTICIPATED',
    priority: 7,
    
    yield_impact_percent: { min: 15, max: 35 },
    
    scientific_source: 'ICAR-CRIDA Drought Management + Global Research',
    scientific_basis: 'Pre-drought application of anti-transpirants, potassium, and silica reduces water loss by 20-30%. One pre-stress irrigation is more valuable than two rescue irrigations.',
    global_practice_ref: 'Israel Drip Irrigation, Australia Dryland Farming',
    icar_alignment: 'Extends ICAR-CRIDA contingency planning with proactive measures'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SA_004: Heavy rainfall / waterlogging anticipated
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SA_004',
    layer: 4,
    category: 'stress_anticipation',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const rainfallForecast = input.rainfall_forecast_mm ?? 0;
      const forecast5day = input.weather_forecast_5day ?? [];
      
      // Heavy rain coming
      const waterloggingRisk = 
        rainfallForecast >= RAINFALL_THRESHOLDS.HEAVY ||
        forecast5day.filter(w => w === WeatherState.RAIN_EXPECTED || w === WeatherState.RAIN_ACTIVE).length >= 3;
      
      return (
        waterloggingRisk &&
        input.soil_states.moisture !== 'WATERLOGGED'
      );
    },
    
    cause: 'WATERLOGGING_ANTICIPATED',
    priority: 7,
    
    yield_impact_percent: { min: 10, max: 25 },
    
    scientific_source: 'FAO Drainage + ICAR',
    scientific_basis: 'Pre-rain drainage channel clearing and ethylene inhibitor application can prevent 70% of waterlogging damage. Prepare drainage BEFORE rain, not during.',
    global_practice_ref: 'Netherlands Water Management, Bangladesh Flood-Prone Farming',
    icar_alignment: 'Extends ICAR drainage recommendations with timing optimization'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SA_005: Multiple stress factors approaching
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SA_005',
    layer: 4,
    category: 'stress_anticipation',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const forecast5day = input.weather_forecast_5day ?? [];
      
      // Count stress types in forecast
      const stressTypes = new Set<string>();
      
      for (const weather of forecast5day) {
        if (weather === WeatherState.HEAT_STRESS) stressTypes.add('heat');
        if (weather === WeatherState.COLD_STRESS) stressTypes.add('cold');
        if (weather === WeatherState.DRY_SPELL) stressTypes.add('drought');
        if (weather === WeatherState.RAIN_ACTIVE) stressTypes.add('excess_water');
        if (weather === WeatherState.HIGH_HUMIDITY) stressTypes.add('disease_pressure');
      }
      
      // Multiple stress types anticipated
      return stressTypes.size >= 2;
    },
    
    cause: 'PRE_STRESS_PROTECTION_WINDOW',
    priority: 9,
    
    yield_impact_percent: { min: 20, max: 40 },
    
    scientific_source: 'Global Stress Physiology',
    scientific_basis: 'Compound stress causes exponential damage. Broad-spectrum anti-stress biostimulants (amino acids, seaweed, humic) provide general resilience against multiple stressors.',
    global_practice_ref: 'Climate-Smart Agriculture Protocols',
    icar_alignment: 'Extends ICAR multiple stress management guidelines'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SA_006: Reproductive stage + any stress anticipated → High priority
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SA_006',
    layer: 4,
    category: 'stress_anticipation',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const forecast5day = input.weather_forecast_5day ?? [];
      
      // Any stress anticipated at reproductive stage
      const anyStress = forecast5day.some(w => 
        w === WeatherState.HEAT_STRESS ||
        w === WeatherState.COLD_STRESS ||
        w === WeatherState.DRY_SPELL ||
        w === WeatherState.HIGH_HUMIDITY
      );
      
      return (
        input.crop_stage === CropStage.REPRODUCTIVE &&
        anyStress &&
        input.ndvi_state !== NDVIState.CRITICAL
      );
    },
    
    cause: 'PRE_STRESS_PROTECTION_WINDOW',
    priority: 10,  // Highest priority - reproductive stage is critical
    
    yield_impact_percent: { min: 25, max: 50 },
    
    scientific_source: 'ICAR Critical Stages + Global Research',
    scientific_basis: 'Reproductive stage (flowering/grain filling) is most stress-sensitive. 1 day of stress can reduce yield 5-10%. Pre-stress protection at this stage has highest ROI.',
    global_practice_ref: 'CIMMYT Wheat, IRRI Rice Critical Stage Protection',
    icar_alignment: 'Directly supports ICAR critical stage protection'
  }
];

/**
 * Detect anticipated stress from forecast
 */
export function detectAnticipatedStress(input: AdvancedDecisionInput): {
  stressType: string;
  daysAway: number;
  severity: 'mild' | 'moderate' | 'severe';
}[] {
  const results: { stressType: string; daysAway: number; severity: 'mild' | 'moderate' | 'severe' }[] = [];
  const forecast = input.weather_forecast_5day ?? [];
  
  for (let i = 0; i < forecast.length; i++) {
    const weather = forecast[i];
    const daysAway = i + 1;
    
    if (weather === WeatherState.HEAT_STRESS) {
      results.push({ stressType: 'heat', daysAway, severity: 'moderate' });
    }
    if (weather === WeatherState.COLD_STRESS) {
      results.push({ stressType: 'cold', daysAway, severity: 'moderate' });
    }
    if (weather === WeatherState.FROST_RISK) {
      results.push({ stressType: 'frost', daysAway, severity: 'severe' });
    }
    if (weather === WeatherState.DRY_SPELL) {
      results.push({ stressType: 'drought', daysAway, severity: 'moderate' });
    }
  }
  
  return results;
}

/**
 * Evaluate stress anticipation rules
 */
export function evaluateStressAnticipationRules(
  input: AdvancedDecisionInput
): AdvancedCauseRule[] {
  return STRESS_ANTICIPATION_RULES.filter(rule => {
    if (!rule.stage_applicable.includes(input.crop_stage)) {
      return false;
    }
    
    if (rule.crop_code !== 'ALL_CROPS' && rule.crop_code !== input.crop_code) {
      return false;
    }
    
    return rule.conditions(input);
  });
}

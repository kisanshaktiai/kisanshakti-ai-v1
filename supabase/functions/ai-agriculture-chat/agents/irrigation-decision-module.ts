/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IRRIGATION DECISION MODULE - ICAR-Based Water Management
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Provides context-aware irrigation recommendations based on:
 * - Crop phenological stage (GDD-based)
 * - Soil moisture state
 * - Weather forecast
 * - ICAR irrigation schedules by crop
 * 
 * VERSION: 1.1.0 - Phase E: DB baselines (crop_baseline_guidelines_v2) override
 *                  hardcoded CROP_IRRIGATION_PROFILES when available.
 */

// PHASE E: DB-driven baselines from crop_baseline_guidelines_v2 (synchronous,
// reads from preloaded baseline-guidelines-cache).
import { getBaselineForCrop } from '../utils/baseline-guidelines-cache.ts';


export interface IrrigationContext {
  crop_code: string;
  growth_stage: string;
  days_after_sowing: number;
  soil_type?: string;
  soil_moisture_percent?: number;
  irrigation_type?: 'DRIP' | 'FLOOD' | 'SPRINKLER' | 'FURROW';
  last_irrigation_date?: string;
  weather_forecast?: {
    rain_probability_24h: number;
    temperature_max: number;
    humidity: number;
  };
  area_acres?: number;
}

export interface IrrigationRecommendation {
  irrigation_needed: boolean;
  urgency: 'IMMEDIATE' | 'TODAY' | 'TOMORROW' | 'WAIT_FOR_RAIN' | 'NOT_NEEDED';
  water_amount_mm: number;
  water_amount_liters_per_acre: number;
  timing: string;
  duration_hours: number;
  frequency_days: number;
  reasoning: {
    mr: string;
    hi: string;
    en: string;
  };
  next_irrigation_date: string;
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ICAR IRRIGATION SCHEDULES BY CROP AND STAGE
// ═══════════════════════════════════════════════════════════════════════════

interface CropIrrigationProfile {
  crop_code: string;
  stages: {
    stage: string;
    critical_period: boolean;
    water_requirement_mm_per_day: number;
    irrigation_interval_days: number;
    root_depth_cm: number;
  }[];
  total_water_requirement_mm: number;
  drought_sensitive_stages: string[];
}

const CROP_IRRIGATION_PROFILES: CropIrrigationProfile[] = [
  {
    crop_code: 'SUGARCANE',
    stages: [
      { stage: 'GERMINATION', critical_period: true, water_requirement_mm_per_day: 3, irrigation_interval_days: 7, root_depth_cm: 15 },
      { stage: 'TILLERING', critical_period: true, water_requirement_mm_per_day: 5, irrigation_interval_days: 10, root_depth_cm: 30 },
      { stage: 'GRAND_GROWTH', critical_period: true, water_requirement_mm_per_day: 8, irrigation_interval_days: 7, root_depth_cm: 60 },
      { stage: 'MATURITY', critical_period: false, water_requirement_mm_per_day: 3, irrigation_interval_days: 21, root_depth_cm: 90 }
    ],
    total_water_requirement_mm: 1800,
    drought_sensitive_stages: ['GERMINATION', 'TILLERING', 'GRAND_GROWTH']
  },
  {
    crop_code: 'COTTON',
    stages: [
      { stage: 'GERMINATION', critical_period: true, water_requirement_mm_per_day: 2, irrigation_interval_days: 7, root_depth_cm: 15 },
      { stage: 'VEGETATIVE', critical_period: false, water_requirement_mm_per_day: 4, irrigation_interval_days: 12, root_depth_cm: 45 },
      { stage: 'FLOWERING', critical_period: true, water_requirement_mm_per_day: 6, irrigation_interval_days: 8, root_depth_cm: 60 },
      { stage: 'BOLL_DEVELOPMENT', critical_period: true, water_requirement_mm_per_day: 5, irrigation_interval_days: 10, root_depth_cm: 90 },
      { stage: 'MATURITY', critical_period: false, water_requirement_mm_per_day: 2, irrigation_interval_days: 15, root_depth_cm: 90 }
    ],
    total_water_requirement_mm: 700,
    drought_sensitive_stages: ['FLOWERING', 'BOLL_DEVELOPMENT']
  },
  {
    crop_code: 'SOYBEAN',
    stages: [
      { stage: 'GERMINATION', critical_period: true, water_requirement_mm_per_day: 2, irrigation_interval_days: 5, root_depth_cm: 15 },
      { stage: 'VEGETATIVE', critical_period: false, water_requirement_mm_per_day: 4, irrigation_interval_days: 10, root_depth_cm: 30 },
      { stage: 'FLOWERING', critical_period: true, water_requirement_mm_per_day: 6, irrigation_interval_days: 7, root_depth_cm: 45 },
      { stage: 'POD_FILLING', critical_period: true, water_requirement_mm_per_day: 5, irrigation_interval_days: 8, root_depth_cm: 60 },
      { stage: 'MATURITY', critical_period: false, water_requirement_mm_per_day: 2, irrigation_interval_days: 12, root_depth_cm: 60 }
    ],
    total_water_requirement_mm: 450,
    drought_sensitive_stages: ['FLOWERING', 'POD_FILLING']
  },
  {
    crop_code: 'TOMATO',
    stages: [
      { stage: 'TRANSPLANTING', critical_period: true, water_requirement_mm_per_day: 3, irrigation_interval_days: 3, root_depth_cm: 15 },
      { stage: 'VEGETATIVE', critical_period: false, water_requirement_mm_per_day: 4, irrigation_interval_days: 5, root_depth_cm: 30 },
      { stage: 'FLOWERING', critical_period: true, water_requirement_mm_per_day: 6, irrigation_interval_days: 4, root_depth_cm: 45 },
      { stage: 'FRUITING', critical_period: true, water_requirement_mm_per_day: 7, irrigation_interval_days: 3, root_depth_cm: 60 },
      { stage: 'MATURITY', critical_period: false, water_requirement_mm_per_day: 4, irrigation_interval_days: 5, root_depth_cm: 60 }
    ],
    total_water_requirement_mm: 600,
    drought_sensitive_stages: ['FLOWERING', 'FRUITING']
  },
  {
    crop_code: 'ONION',
    stages: [
      { stage: 'ESTABLISHMENT', critical_period: true, water_requirement_mm_per_day: 3, irrigation_interval_days: 4, root_depth_cm: 15 },
      { stage: 'VEGETATIVE', critical_period: false, water_requirement_mm_per_day: 4, irrigation_interval_days: 7, root_depth_cm: 25 },
      { stage: 'BULBING', critical_period: true, water_requirement_mm_per_day: 6, irrigation_interval_days: 5, root_depth_cm: 35 },
      { stage: 'MATURITY', critical_period: false, water_requirement_mm_per_day: 2, irrigation_interval_days: 10, root_depth_cm: 35 }
    ],
    total_water_requirement_mm: 450,
    drought_sensitive_stages: ['BULBING']
  },
  {
    crop_code: 'RICE',
    stages: [
      { stage: 'NURSERY', critical_period: true, water_requirement_mm_per_day: 5, irrigation_interval_days: 2, root_depth_cm: 15 },
      { stage: 'TRANSPLANTING', critical_period: true, water_requirement_mm_per_day: 8, irrigation_interval_days: 1, root_depth_cm: 20 },
      { stage: 'VEGETATIVE', critical_period: false, water_requirement_mm_per_day: 7, irrigation_interval_days: 3, root_depth_cm: 30 },
      { stage: 'REPRODUCTIVE', critical_period: true, water_requirement_mm_per_day: 10, irrigation_interval_days: 2, root_depth_cm: 40 },
      { stage: 'MATURITY', critical_period: false, water_requirement_mm_per_day: 5, irrigation_interval_days: 5, root_depth_cm: 40 }
    ],
    total_water_requirement_mm: 1400,
    drought_sensitive_stages: ['TRANSPLANTING', 'REPRODUCTIVE']
  },
  {
    crop_code: 'WHEAT',
    stages: [
      { stage: 'GERMINATION', critical_period: true, water_requirement_mm_per_day: 2, irrigation_interval_days: 5, root_depth_cm: 15 },
      { stage: 'CROWN_ROOT', critical_period: true, water_requirement_mm_per_day: 3, irrigation_interval_days: 21, root_depth_cm: 30 },
      { stage: 'TILLERING', critical_period: false, water_requirement_mm_per_day: 4, irrigation_interval_days: 21, root_depth_cm: 45 },
      { stage: 'JOINTING', critical_period: true, water_requirement_mm_per_day: 5, irrigation_interval_days: 18, root_depth_cm: 60 },
      { stage: 'FLOWERING', critical_period: true, water_requirement_mm_per_day: 6, irrigation_interval_days: 15, root_depth_cm: 75 },
      { stage: 'GRAIN_FILLING', critical_period: true, water_requirement_mm_per_day: 5, irrigation_interval_days: 18, root_depth_cm: 90 }
    ],
    total_water_requirement_mm: 450,
    drought_sensitive_stages: ['CROWN_ROOT', 'JOINTING', 'FLOWERING', 'GRAIN_FILLING']
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN IRRIGATION DECISION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function calculateIrrigationRecommendation(context: IrrigationContext): IrrigationRecommendation {
  const profile = CROP_IRRIGATION_PROFILES.find(p => 
    p.crop_code.toUpperCase() === context.crop_code.toUpperCase()
  ) || CROP_IRRIGATION_PROFILES[0]; // Default to sugarcane
  
  // Find current stage requirements
  const currentStage = profile.stages.find(s => 
    s.stage.toUpperCase() === context.growth_stage?.toUpperCase()
  ) || profile.stages[Math.min(
    Math.floor(context.days_after_sowing / 30),
    profile.stages.length - 1
  )];
  
  const isCriticalStage = profile.drought_sensitive_stages.includes(currentStage.stage);
  const warnings: string[] = [];
  
  // Calculate days since last irrigation
  let daysSinceLastIrrigation = 0;
  if (context.last_irrigation_date) {
    const lastDate = new Date(context.last_irrigation_date);
    const today = new Date();
    daysSinceLastIrrigation = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  // Check rain forecast
  const rainExpected = context.weather_forecast?.rain_probability_24h 
    ? context.weather_forecast.rain_probability_24h > 60 
    : false;
  
  // Calculate soil moisture deficit
  const soilMoistureLow = context.soil_moisture_percent 
    ? context.soil_moisture_percent < 40 
    : daysSinceLastIrrigation > currentStage.irrigation_interval_days;
  
  // Determine irrigation need
  let irrigationNeeded = false;
  let urgency: IrrigationRecommendation['urgency'] = 'NOT_NEEDED';
  
  if (rainExpected && !isCriticalStage) {
    urgency = 'WAIT_FOR_RAIN';
    irrigationNeeded = false;
  } else if (soilMoistureLow && isCriticalStage) {
    urgency = 'IMMEDIATE';
    irrigationNeeded = true;
    warnings.push('Critical growth stage - do not delay irrigation');
  } else if (soilMoistureLow) {
    urgency = daysSinceLastIrrigation > currentStage.irrigation_interval_days + 2 ? 'TODAY' : 'TOMORROW';
    irrigationNeeded = true;
  } else if (daysSinceLastIrrigation >= currentStage.irrigation_interval_days - 1) {
    urgency = 'TOMORROW';
    irrigationNeeded = true;
  }
  
  // Calculate water amount
  const waterMm = currentStage.water_requirement_mm_per_day * currentStage.irrigation_interval_days;
  const waterLitersPerAcre = waterMm * 4047; // 1 acre = 4047 sq meters, 1mm = 1 liter/sq meter
  
  // Adjust for irrigation type
  let efficiency = 0.8; // Default flood efficiency
  let durationHours = 3;
  
  if (context.irrigation_type === 'DRIP') {
    efficiency = 0.9;
    durationHours = 1.5;
  } else if (context.irrigation_type === 'SPRINKLER') {
    efficiency = 0.75;
    durationHours = 2;
  } else if (context.irrigation_type === 'FURROW') {
    efficiency = 0.6;
    durationHours = 4;
  }
  
  const adjustedWater = Math.round(waterLitersPerAcre / efficiency);
  
  // Calculate next irrigation date
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + currentStage.irrigation_interval_days);
  const nextIrrigationDate = nextDate.toISOString().split('T')[0];
  
  // Temperature warning
  if (context.weather_forecast?.temperature_max && context.weather_forecast.temperature_max > 38) {
    warnings.push('High temperature - irrigate early morning (before 8 AM) or evening (after 5 PM)');
  }
  
  // Generate reasoning
  const reasoning = generateIrrigationReasoning(
    context, 
    currentStage, 
    irrigationNeeded, 
    urgency, 
    rainExpected, 
    isCriticalStage
  );
  
  return {
    irrigation_needed: irrigationNeeded,
    urgency,
    water_amount_mm: waterMm,
    water_amount_liters_per_acre: adjustedWater,
    timing: urgency === 'IMMEDIATE' ? 'Within 2 hours' : 
            urgency === 'TODAY' ? 'Before sunset today' : 
            urgency === 'TOMORROW' ? 'Tomorrow morning 6-9 AM' : 'After rain assessment',
    duration_hours: durationHours,
    frequency_days: currentStage.irrigation_interval_days,
    reasoning,
    next_irrigation_date: nextIrrigationDate,
    warnings
  };
}

function generateIrrigationReasoning(
  context: IrrigationContext,
  stage: { stage: string; critical_period: boolean; irrigation_interval_days: number },
  needed: boolean,
  urgency: IrrigationRecommendation['urgency'],
  rainExpected: boolean,
  isCritical: boolean
): { mr: string; hi: string; en: string } {
  
  if (urgency === 'WAIT_FOR_RAIN') {
    return {
      mr: `🌧️ पुढील 24 तासात पावसाची शक्यता आहे. पाऊस पडल्यानंतर जमिनीची स्थिती तपासा.`,
      hi: `🌧️ अगले 24 घंटों में बारिश की संभावना है। बारिश के बाद मिट्टी की स्थिति जांचें।`,
      en: `🌧️ Rain expected in next 24 hours. Check soil condition after rain.`
    };
  }
  
  if (!needed) {
    return {
      mr: `✅ सध्या पाणी देण्याची गरज नाही. पुढील ${stage.irrigation_interval_days} दिवसांनी तपासा.`,
      hi: `✅ अभी सिंचाई की जरूरत नहीं। ${stage.irrigation_interval_days} दिनों बाद जांचें।`,
      en: `✅ Irrigation not needed now. Check after ${stage.irrigation_interval_days} days.`
    };
  }
  
  if (urgency === 'IMMEDIATE' && isCritical) {
    return {
      mr: `⚠️ ${context.crop_code} सध्या ${stage.stage} अवस्थेत आहे - पाण्याची अत्यंत गरज! पाणी न दिल्यास उत्पादन 30-40% कमी होऊ शकते.`,
      hi: `⚠️ ${context.crop_code} अभी ${stage.stage} अवस्था में है - पानी की तुरंत जरूरत! पानी न देने पर उत्पादन 30-40% कम हो सकता है।`,
      en: `⚠️ ${context.crop_code} is in ${stage.stage} stage - critical water need! Yield may reduce 30-40% if not irrigated.`
    };
  }
  
  return {
    mr: `💧 ${context.crop_code} ला ${stage.stage} अवस्थेत पाणी द्या. दर ${stage.irrigation_interval_days} दिवसांनी सिंचाई करा.`,
    hi: `💧 ${context.crop_code} को ${stage.stage} अवस्था में पानी दें। हर ${stage.irrigation_interval_days} दिनों में सिंचाई करें।`,
    en: `💧 Irrigate ${context.crop_code} in ${stage.stage} stage. Water every ${stage.irrigation_interval_days} days.`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Generate formatted response for chat
// ═══════════════════════════════════════════════════════════════════════════

export function formatIrrigationResponse(
  recommendation: IrrigationRecommendation,
  language: string
): string {
  const r = recommendation;
  const lines: string[] = [];
  
  // Main message
  lines.push(r.reasoning[language]);
  lines.push('');
  
  if (r.irrigation_needed) {
    // English-only structured output — LLM narration layer translates at runtime
    lines.push(`📊 **Water Details:**`);
    lines.push(`• Water: ${r.water_amount_liters_per_acre.toLocaleString()} liters/acre`);
    lines.push(`• Timing: ${r.timing}`);
    lines.push(`• Duration: ${r.duration_hours} hours`);
    lines.push(`• Next irrigation: ${r.next_irrigation_date}`);
    
    if (r.warnings.length > 0) {
      lines.push('');
      lines.push('⚠️ **Warnings:**');
      r.warnings.forEach(w => lines.push(`• ${w}`));
    }
  }
  
  return lines.join('\n');
}

export default calculateIrrigationRecommendation;

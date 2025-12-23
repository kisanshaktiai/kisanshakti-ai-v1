/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP SELECTION RULES ENGINE - Rotation-Aware, Soil-Based Recommendations
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides scientifically-grounded crop selection recommendations
 * based on:
 * - Previous crop rotation (avoid same family, balance N-fixers)
 * - Soil conditions (pH, nutrients, texture, moisture)
 * - Season and climate
 * - Land size and economic viability
 * - Regional agro-climatic factors
 * 
 * Standards: ICAR, FAO, State Agricultural Universities
 */

import { 
  CropGroup, 
  SoilNState, 
  SoilPState, 
  SoilKState, 
  SoilPHState, 
  SoilMoistureState,
  SoilTexture,
  IrrigationSource
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface CropRecommendation {
  crop_code: string;
  crop_name: string;
  crop_name_mr: string;
  crop_name_hi: string;
  crop_group: CropGroup;
  suitability_score: number; // 0-100
  sowing_window: {
    start_month: number;
    end_month: number;
    optimal_days: string; // e.g., "June 15 - July 15"
  };
  expected_duration_days: number;
  estimated_yield_per_acre: string;
  estimated_cost_per_acre: number;
  estimated_revenue_per_acre: number;
  water_requirement: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  warnings: string[];
  rotation_benefit: string;
  source_rules: string[];
}

export interface CropSelectionInput {
  previous_crop?: string;
  previous_crop_group?: CropGroup;
  last_harvest_date?: Date;
  soil_n?: SoilNState;
  soil_p?: SoilPState;
  soil_k?: SoilKState;
  soil_ph?: SoilPHState;
  soil_moisture?: SoilMoistureState;
  soil_texture?: SoilTexture;
  irrigation_source?: IrrigationSource;
  land_area_acres?: number;
  current_month: number;
  state?: string;
  district?: string;
  language: string;
}

export interface CropSelectionResult {
  recommendations: CropRecommendation[];
  rotation_warnings: string[];
  soil_limitations: string[];
  confidence: number;
  rules_applied: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP DATABASE - Maharashtra/India Focus
// ═══════════════════════════════════════════════════════════════════════════

interface CropData {
  code: string;
  name: string;
  name_mr: string;
  name_hi: string;
  group: CropGroup;
  kharif: boolean;       // June-October
  rabi: boolean;         // October-March
  summer: boolean;       // March-June
  min_ph: number;
  max_ph: number;
  water_need: 'LOW' | 'MEDIUM' | 'HIGH';
  n_need: 'LOW' | 'MEDIUM' | 'HIGH';
  duration_days: number;
  yield_per_acre: string;
  cost_per_acre: number;
  revenue_per_acre: number;
  good_after: string[];  // Crops it grows well after
  avoid_after: string[]; // Crops to avoid growing after
  n_fixer: boolean;      // Legume that fixes nitrogen
}

const CROP_DATABASE: CropData[] = [
  // CEREALS
  {
    code: 'wheat',
    name: 'Wheat',
    name_mr: 'गहू',
    name_hi: 'गेहूं',
    group: CropGroup.CEREALS,
    kharif: false,
    rabi: true,
    summer: false,
    min_ph: 6.0,
    max_ph: 8.5,
    water_need: 'MEDIUM',
    n_need: 'HIGH',
    duration_days: 120,
    yield_per_acre: '15-20 क्विंटल',
    cost_per_acre: 25000,
    revenue_per_acre: 45000,
    good_after: ['soybean', 'groundnut', 'gram', 'cotton', 'maize'],
    avoid_after: ['wheat', 'rice'],
    n_fixer: false
  },
  {
    code: 'rice',
    name: 'Rice',
    name_mr: 'भात',
    name_hi: 'धान',
    group: CropGroup.CEREALS,
    kharif: true,
    rabi: false,
    summer: true,
    min_ph: 5.5,
    max_ph: 7.5,
    water_need: 'HIGH',
    n_need: 'HIGH',
    duration_days: 130,
    yield_per_acre: '18-25 क्विंटल',
    cost_per_acre: 30000,
    revenue_per_acre: 50000,
    good_after: ['gram', 'wheat', 'mustard'],
    avoid_after: ['rice'],
    n_fixer: false
  },
  {
    code: 'maize',
    name: 'Maize',
    name_mr: 'मका',
    name_hi: 'मक्का',
    group: CropGroup.CEREALS,
    kharif: true,
    rabi: true,
    summer: true,
    min_ph: 5.5,
    max_ph: 7.5,
    water_need: 'MEDIUM',
    n_need: 'HIGH',
    duration_days: 100,
    yield_per_acre: '25-35 क्विंटल',
    cost_per_acre: 20000,
    revenue_per_acre: 40000,
    good_after: ['soybean', 'groundnut', 'gram'],
    avoid_after: ['maize', 'sugarcane'],
    n_fixer: false
  },
  
  // PULSES (Nitrogen Fixers)
  {
    code: 'gram',
    name: 'Chickpea',
    name_mr: 'हरभरा',
    name_hi: 'चना',
    group: CropGroup.PULSES,
    kharif: false,
    rabi: true,
    summer: false,
    min_ph: 6.0,
    max_ph: 8.0,
    water_need: 'LOW',
    n_need: 'LOW',
    duration_days: 100,
    yield_per_acre: '8-12 क्विंटल',
    cost_per_acre: 18000,
    revenue_per_acre: 55000,
    good_after: ['cotton', 'maize', 'sorghum', 'rice'],
    avoid_after: ['gram', 'lentil'],
    n_fixer: true
  },
  {
    code: 'soybean',
    name: 'Soybean',
    name_mr: 'सोयाबीन',
    name_hi: 'सोयाबीन',
    group: CropGroup.OILSEEDS,
    kharif: true,
    rabi: false,
    summer: false,
    min_ph: 6.0,
    max_ph: 7.5,
    water_need: 'MEDIUM',
    n_need: 'LOW',
    duration_days: 95,
    yield_per_acre: '10-15 क्विंटल',
    cost_per_acre: 22000,
    revenue_per_acre: 50000,
    good_after: ['wheat', 'maize', 'cotton'],
    avoid_after: ['soybean', 'groundnut'],
    n_fixer: true
  },
  {
    code: 'groundnut',
    name: 'Groundnut',
    name_mr: 'भुईमूग',
    name_hi: 'मूंगफली',
    group: CropGroup.OILSEEDS,
    kharif: true,
    rabi: false,
    summer: true,
    min_ph: 5.5,
    max_ph: 7.0,
    water_need: 'MEDIUM',
    n_need: 'LOW',
    duration_days: 105,
    yield_per_acre: '12-18 क्विंटल',
    cost_per_acre: 25000,
    revenue_per_acre: 60000,
    good_after: ['wheat', 'maize', 'cotton', 'sorghum'],
    avoid_after: ['groundnut', 'soybean'],
    n_fixer: true
  },
  
  // FIBER
  {
    code: 'cotton',
    name: 'Cotton',
    name_mr: 'कापूस',
    name_hi: 'कपास',
    group: CropGroup.FIBER,
    kharif: true,
    rabi: false,
    summer: false,
    min_ph: 6.0,
    max_ph: 8.0,
    water_need: 'MEDIUM',
    n_need: 'HIGH',
    duration_days: 180,
    yield_per_acre: '8-12 क्विंटल',
    cost_per_acre: 35000,
    revenue_per_acre: 75000,
    good_after: ['wheat', 'gram', 'groundnut', 'soybean'],
    avoid_after: ['cotton'],
    n_fixer: false
  },
  
  // SUGARCANE
  {
    code: 'sugarcane',
    name: 'Sugarcane',
    name_mr: 'ऊस',
    name_hi: 'गन्ना',
    group: CropGroup.SUGARCANE,
    kharif: true,
    rabi: true,
    summer: false,
    min_ph: 6.0,
    max_ph: 8.0,
    water_need: 'HIGH',
    n_need: 'HIGH',
    duration_days: 330,
    yield_per_acre: '400-500 क्विंटल',
    cost_per_acre: 60000,
    revenue_per_acre: 150000,
    good_after: ['wheat', 'gram', 'groundnut'],
    avoid_after: ['sugarcane'],
    n_fixer: false
  },
  
  // VEGETABLES
  {
    code: 'onion',
    name: 'Onion',
    name_mr: 'कांदा',
    name_hi: 'प्याज',
    group: CropGroup.VEGETABLES,
    kharif: true,
    rabi: true,
    summer: true,
    min_ph: 6.0,
    max_ph: 7.5,
    water_need: 'MEDIUM',
    n_need: 'MEDIUM',
    duration_days: 120,
    yield_per_acre: '100-150 क्विंटल',
    cost_per_acre: 45000,
    revenue_per_acre: 120000,
    good_after: ['wheat', 'rice', 'maize'],
    avoid_after: ['onion', 'garlic'],
    n_fixer: false
  },
  {
    code: 'tomato',
    name: 'Tomato',
    name_mr: 'टोमॅटो',
    name_hi: 'टमाटर',
    group: CropGroup.VEGETABLES,
    kharif: true,
    rabi: true,
    summer: false,
    min_ph: 6.0,
    max_ph: 7.0,
    water_need: 'MEDIUM',
    n_need: 'MEDIUM',
    duration_days: 100,
    yield_per_acre: '150-200 क्विंटल',
    cost_per_acre: 50000,
    revenue_per_acre: 100000,
    good_after: ['wheat', 'maize', 'onion'],
    avoid_after: ['tomato', 'brinjal', 'chilli'],
    n_fixer: false
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CROP SELECTION ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get crop recommendations based on land context and previous crop
 */
export function getCropRecommendations(input: CropSelectionInput): CropSelectionResult {
  const rules_applied: string[] = [];
  const rotation_warnings: string[] = [];
  const soil_limitations: string[] = [];
  
  // Determine current season
  const season = getSeason(input.current_month);
  rules_applied.push(`SEASON_DETECTION: ${season}`);
  
  // Filter crops for current season
  let eligibleCrops = CROP_DATABASE.filter(crop => {
    if (season === 'kharif' && crop.kharif) return true;
    if (season === 'rabi' && crop.rabi) return true;
    if (season === 'summer' && crop.summer) return true;
    return false;
  });
  rules_applied.push(`SEASON_FILTER: ${eligibleCrops.length} crops eligible for ${season}`);
  
  // Score each crop
  const scoredCrops: CropRecommendation[] = eligibleCrops.map(crop => {
    let score = 50; // Base score
    const reasons: string[] = [];
    const warnings: string[] = [];
    let rotation_benefit = '';
    const crop_rules: string[] = [];
    
    // ─────────────────────────────────────────────────────────────────────────
    // ROTATION SCORING (±30 points)
    // ─────────────────────────────────────────────────────────────────────────
    if (input.previous_crop) {
      const prevCropLower = input.previous_crop.toLowerCase();
      
      // Check if this is a good rotation
      if (crop.good_after.some(c => prevCropLower.includes(c))) {
        score += 25;
        reasons.push(input.language === 'mr' 
          ? `${input.previous_crop} नंतर उत्तम` 
          : input.language === 'hi' 
            ? `${input.previous_crop} के बाद अच्छा` 
            : `Good rotation after ${input.previous_crop}`);
        rotation_benefit = input.language === 'mr' 
          ? 'चांगले पीक फेरपालट'
          : input.language === 'hi'
            ? 'अच्छी फसल चक्र'
            : 'Good crop rotation';
        crop_rules.push('ROTATION_POSITIVE');
      }
      
      // Check if this is a bad rotation
      if (crop.avoid_after.some(c => prevCropLower.includes(c))) {
        score -= 30;
        warnings.push(input.language === 'mr'
          ? `${input.previous_crop} नंतर टाळा - रोग/किडींचा धोका`
          : input.language === 'hi'
            ? `${input.previous_crop} के बाद न लगाएं - रोग/कीट का खतरा`
            : `Avoid after ${input.previous_crop} - pest/disease buildup risk`);
        rotation_warnings.push(`${crop.name}: Same family as previous crop`);
        crop_rules.push('ROTATION_NEGATIVE');
      }
      
      // N-fixer after heavy feeder bonus
      const heavyFeeders = ['sugarcane', 'cotton', 'maize', 'rice'];
      if (crop.n_fixer && heavyFeeders.some(h => prevCropLower.includes(h))) {
        score += 15;
        reasons.push(input.language === 'mr'
          ? 'नायट्रोजन स्थिर करते - जमिनीची सुधारणा'
          : input.language === 'hi'
            ? 'नाइट्रोजन स्थिर करता है - मिट्टी सुधार'
            : 'Fixes nitrogen - improves soil');
        rotation_benefit = input.language === 'mr'
          ? 'जमिनीला नायट्रोजन देते'
          : input.language === 'hi'
            ? 'मिट्टी को नाइट्रोजन देता है'
            : 'Adds nitrogen to soil';
        crop_rules.push('N_FIXER_BENEFIT');
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // SOIL pH SCORING (±15 points)
    // ─────────────────────────────────────────────────────────────────────────
    if (input.soil_ph) {
      const phValue = input.soil_ph === SoilPHState.ACIDIC ? 5.5 
                    : input.soil_ph === SoilPHState.NEUTRAL ? 7.0 
                    : 8.0;
      
      if (phValue >= crop.min_ph && phValue <= crop.max_ph) {
        score += 15;
        reasons.push(input.language === 'mr'
          ? 'मातीची pH योग्य'
          : input.language === 'hi'
            ? 'मिट्टी का pH उचित'
            : 'Soil pH suitable');
        crop_rules.push('PH_SUITABLE');
      } else {
        score -= 15;
        warnings.push(input.language === 'mr'
          ? `मातीची pH ${input.soil_ph} आहे - या पिकाला अनुकूल नाही`
          : input.language === 'hi'
            ? `मिट्टी pH ${input.soil_ph} - इस फसल के लिए उपयुक्त नहीं`
            : `Soil pH ${input.soil_ph} - not ideal for this crop`);
        soil_limitations.push(`${crop.name}: pH not ideal`);
        crop_rules.push('PH_UNSUITABLE');
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // SOIL NITROGEN SCORING (±10 points)
    // ─────────────────────────────────────────────────────────────────────────
    if (input.soil_n) {
      if (input.soil_n === SoilNState.LOW_N && crop.n_fixer) {
        score += 10;
        reasons.push(input.language === 'mr'
          ? 'कमी नायट्रोजन असलेल्या जमिनीत चांगले'
          : input.language === 'hi'
            ? 'कम नाइट्रोजन वाली मिट्टी में अच्छा'
            : 'Good for low nitrogen soil');
        crop_rules.push('LOW_N_FIXER_BENEFIT');
      } else if (input.soil_n === SoilNState.LOW_N && crop.n_need === 'HIGH') {
        score -= 10;
        warnings.push(input.language === 'mr'
          ? 'अधिक खत लागेल - नायट्रोजन कमी'
          : input.language === 'hi'
            ? 'अधिक खाद लगेगी - नाइट्रोजन कम'
            : 'Will need more fertilizer - low N');
        crop_rules.push('LOW_N_HIGH_NEED');
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // WATER AVAILABILITY SCORING (±15 points)
    // ─────────────────────────────────────────────────────────────────────────
    if (input.irrigation_source) {
      const hasGoodWater = input.irrigation_source !== IrrigationSource.RAINFED;
      
      if (!hasGoodWater && crop.water_need === 'HIGH') {
        score -= 20;
        warnings.push(input.language === 'mr'
          ? 'पाण्याची गरज जास्त - सिंचन हवे'
          : input.language === 'hi'
            ? 'पानी की ज़रूरत ज़्यादा - सिंचाई चाहिए'
            : 'High water need - irrigation required');
        crop_rules.push('WATER_LIMITATION');
      } else if (hasGoodWater && crop.water_need === 'HIGH') {
        score += 10;
        reasons.push(input.language === 'mr'
          ? 'सिंचन उपलब्ध - पाण्याची गरज पूर्ण होईल'
          : input.language === 'hi'
            ? 'सिंचाई उपलब्ध - पानी की ज़रूरत पूरी होगी'
            : 'Irrigation available - water need met');
        crop_rules.push('WATER_AVAILABLE');
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // ECONOMIC VIABILITY (Land Size) - ±10 points
    // ─────────────────────────────────────────────────────────────────────────
    if (input.land_area_acres) {
      // Large lands favor commercial crops
      if (input.land_area_acres >= 5 && ['sugarcane', 'cotton', 'soybean'].includes(crop.code)) {
        score += 10;
        reasons.push(input.language === 'mr'
          ? 'मोठ्या क्षेत्रासाठी फायदेशीर'
          : input.language === 'hi'
            ? 'बड़े क्षेत्र के लिए लाभदायक'
            : 'Profitable for large area');
        crop_rules.push('LARGE_AREA_BENEFIT');
      }
      
      // Small lands favor vegetables
      if (input.land_area_acres <= 2 && crop.group === CropGroup.VEGETABLES) {
        score += 10;
        reasons.push(input.language === 'mr'
          ? 'कमी क्षेत्रात जास्त उत्पन्न'
          : input.language === 'hi'
            ? 'कम क्षेत्र में अधिक उत्पादन'
            : 'High returns on small area');
        crop_rules.push('SMALL_AREA_BENEFIT');
      }
    }
    
    // Clamp score
    score = Math.max(0, Math.min(100, score));
    
    rules_applied.push(...crop_rules.map(r => `${crop.code.toUpperCase()}: ${r}`));
    
    return {
      crop_code: crop.code,
      crop_name: crop.name,
      crop_name_mr: crop.name_mr,
      crop_name_hi: crop.name_hi,
      crop_group: crop.group,
      suitability_score: score,
      sowing_window: getSowingWindow(crop.code, season, input.current_month),
      expected_duration_days: crop.duration_days,
      estimated_yield_per_acre: crop.yield_per_acre,
      estimated_cost_per_acre: crop.cost_per_acre,
      estimated_revenue_per_acre: crop.revenue_per_acre,
      water_requirement: crop.water_need,
      reasons,
      warnings,
      rotation_benefit,
      source_rules: crop_rules
    };
  });
  
  // Sort by score descending
  const sortedCrops = scoredCrops
    .filter(c => c.suitability_score >= 30) // Minimum threshold
    .sort((a, b) => b.suitability_score - a.suitability_score)
    .slice(0, 5); // Top 5 recommendations
  
  // Calculate overall confidence
  const avgScore = sortedCrops.length > 0 
    ? sortedCrops.reduce((sum, c) => sum + c.suitability_score, 0) / sortedCrops.length 
    : 0;
  const dataCompleteness = calculateDataCompleteness(input);
  const confidence = Math.round((avgScore * 0.6) + (dataCompleteness * 0.4));
  
  return {
    recommendations: sortedCrops,
    rotation_warnings: [...new Set(rotation_warnings)],
    soil_limitations: [...new Set(soil_limitations)],
    confidence,
    rules_applied
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getSeason(month: number): 'kharif' | 'rabi' | 'summer' {
  // Kharif: June (6) - October (10)
  // Rabi: October (10) - March (3)
  // Summer: March (3) - June (6)
  if (month >= 6 && month <= 10) return 'kharif';
  if (month >= 10 || month <= 3) return 'rabi';
  return 'summer';
}

function getSowingWindow(cropCode: string, season: string, currentMonth: number): {
  start_month: number;
  end_month: number;
  optimal_days: string;
} {
  const windows: Record<string, Record<string, { start: number; end: number; optimal: string }>> = {
    wheat: {
      rabi: { start: 10, end: 11, optimal: 'October 15 - November 15' }
    },
    rice: {
      kharif: { start: 6, end: 7, optimal: 'June 15 - July 15' }
    },
    soybean: {
      kharif: { start: 6, end: 7, optimal: 'June 15 - July 10' }
    },
    cotton: {
      kharif: { start: 5, end: 6, optimal: 'May 15 - June 30' }
    },
    gram: {
      rabi: { start: 10, end: 11, optimal: 'October 15 - November 15' }
    },
    sugarcane: {
      kharif: { start: 2, end: 3, optimal: 'February 15 - March 15' },
      rabi: { start: 10, end: 11, optimal: 'October 15 - November 15' }
    },
    onion: {
      kharif: { start: 6, end: 7, optimal: 'June 15 - July 15' },
      rabi: { start: 10, end: 11, optimal: 'October 15 - November 15' }
    },
    groundnut: {
      kharif: { start: 6, end: 7, optimal: 'June 15 - July 10' }
    },
    maize: {
      kharif: { start: 6, end: 7, optimal: 'June 15 - July 15' },
      rabi: { start: 10, end: 11, optimal: 'October 15 - November 15' }
    },
    tomato: {
      kharif: { start: 6, end: 7, optimal: 'June - July' },
      rabi: { start: 9, end: 10, optimal: 'September - October' }
    }
  };
  
  const cropWindow = windows[cropCode]?.[season] || { start: currentMonth, end: currentMonth + 1, optimal: 'Consult local advisory' };
  
  return {
    start_month: cropWindow.start,
    end_month: cropWindow.end,
    optimal_days: cropWindow.optimal
  };
}

function calculateDataCompleteness(input: CropSelectionInput): number {
  let score = 0;
  let total = 7;
  
  if (input.previous_crop) score += 1;
  if (input.soil_n) score += 1;
  if (input.soil_ph) score += 1;
  if (input.irrigation_source) score += 1;
  if (input.land_area_acres) score += 1;
  if (input.state) score += 1;
  if (input.soil_moisture) score += 1;
  
  return Math.round((score / total) * 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTED OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format crop recommendations for farmer-friendly display
 */
export function formatCropRecommendationsForFarmer(
  result: CropSelectionResult,
  language: string
): string {
  if (result.recommendations.length === 0) {
    return language === 'mr'
      ? 'या हंगामात कोणतेही पीक शिफारस करता येत नाही। कृपया स्थानिक कृषी अधिकाऱ्यांशी संपर्क साधा।'
      : language === 'hi'
        ? 'इस मौसम में कोई फसल अनुशंसित नहीं है। कृपया स्थानीय कृषि अधिकारी से संपर्क करें।'
        : 'No crops recommended for this season. Please consult local agricultural officer.';
  }
  
  const topCrop = result.recommendations[0];
  const otherCrops = result.recommendations.slice(1, 3);
  
  if (language === 'mr') {
    let message = `🌱 **शिफारस केलेले पीक: ${topCrop.crop_name_mr}**\n\n`;
    message += `📊 अनुकूलता: ${topCrop.suitability_score}%\n`;
    message += `📅 पेरणी कालावधी: ${topCrop.sowing_window.optimal_days}\n`;
    message += `⏱️ कालावधी: ${topCrop.expected_duration_days} दिवस\n`;
    message += `🌾 अपेक्षित उत्पादन: ${topCrop.estimated_yield_per_acre}\n`;
    message += `💰 अंदाजे खर्च: ₹${topCrop.estimated_cost_per_acre.toLocaleString()}/एकर\n\n`;
    
    if (topCrop.reasons.length > 0) {
      message += `✅ **का निवडावे:**\n`;
      topCrop.reasons.forEach(r => { message += `• ${r}\n`; });
      message += '\n';
    }
    
    if (topCrop.warnings.length > 0) {
      message += `⚠️ **काळजी घ्या:**\n`;
      topCrop.warnings.forEach(w => { message += `• ${w}\n`; });
      message += '\n';
    }
    
    if (otherCrops.length > 0) {
      message += `🔄 **इतर पर्याय:**\n`;
      otherCrops.forEach(c => {
        message += `• ${c.crop_name_mr} (${c.suitability_score}%)\n`;
      });
    }
    
    return message;
  }
  
  // Hindi
  if (language === 'hi') {
    let message = `🌱 **अनुशंसित फसल: ${topCrop.crop_name_hi}**\n\n`;
    message += `📊 अनुकूलता: ${topCrop.suitability_score}%\n`;
    message += `📅 बुवाई अवधि: ${topCrop.sowing_window.optimal_days}\n`;
    message += `⏱️ अवधि: ${topCrop.expected_duration_days} दिन\n`;
    message += `🌾 अपेक्षित उपज: ${topCrop.estimated_yield_per_acre}\n`;
    message += `💰 अनुमानित लागत: ₹${topCrop.estimated_cost_per_acre.toLocaleString()}/एकड़\n\n`;
    
    if (topCrop.reasons.length > 0) {
      message += `✅ **क्यों चुनें:**\n`;
      topCrop.reasons.forEach(r => { message += `• ${r}\n`; });
      message += '\n';
    }
    
    if (topCrop.warnings.length > 0) {
      message += `⚠️ **सावधानी:**\n`;
      topCrop.warnings.forEach(w => { message += `• ${w}\n`; });
      message += '\n';
    }
    
    if (otherCrops.length > 0) {
      message += `🔄 **अन्य विकल्प:**\n`;
      otherCrops.forEach(c => {
        message += `• ${c.crop_name_hi} (${c.suitability_score}%)\n`;
      });
    }
    
    return message;
  }
  
  // English
  let message = `🌱 **Recommended Crop: ${topCrop.crop_name}**\n\n`;
  message += `📊 Suitability: ${topCrop.suitability_score}%\n`;
  message += `📅 Sowing Window: ${topCrop.sowing_window.optimal_days}\n`;
  message += `⏱️ Duration: ${topCrop.expected_duration_days} days\n`;
  message += `🌾 Expected Yield: ${topCrop.estimated_yield_per_acre}\n`;
  message += `💰 Estimated Cost: ₹${topCrop.estimated_cost_per_acre.toLocaleString()}/acre\n\n`;
  
  if (topCrop.reasons.length > 0) {
    message += `✅ **Why Choose:**\n`;
    topCrop.reasons.forEach(r => { message += `• ${r}\n`; });
    message += '\n';
  }
  
  if (topCrop.warnings.length > 0) {
    message += `⚠️ **Caution:**\n`;
    topCrop.warnings.forEach(w => { message += `• ${w}\n`; });
    message += '\n';
  }
  
  if (otherCrops.length > 0) {
    message += `🔄 **Other Options:**\n`;
    otherCrops.forEach(c => {
      message += `• ${c.crop_name} (${c.suitability_score}%)\n`;
    });
  }
  
  return message;
}

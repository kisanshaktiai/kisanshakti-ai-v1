/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION GRAPH INTEGRATION - Phase 3
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module integrates the Symbolic Decision Graph with the AI Smart Schedule.
 * It provides deterministic cause inference BEFORE AI is called, ensuring:
 * 
 * 1. AI focuses on prioritization and refinement (NOT decision-making)
 * 2. All causes are traced to specific rule_ids
 * 3. Recommendations are auditable and explainable
 * 4. Offline-capable core logic (no AI dependency for basics)
 * 
 * Version: 1.0.0
 * Phase: 3 - AI Integration
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (Mirror of src/decision-graph/types.ts for Edge Function)
// ═══════════════════════════════════════════════════════════════════════════

export enum SoilNState {
  LOW_N = 'LOW_N',
  ADEQUATE_N = 'ADEQUATE_N',
  HIGH_N = 'HIGH_N'
}

export enum SoilPState {
  LOW_P = 'LOW_P',
  ADEQUATE_P = 'ADEQUATE_P',
  HIGH_P = 'HIGH_P'
}

export enum SoilKState {
  LOW_K = 'LOW_K',
  ADEQUATE_K = 'ADEQUATE_K',
  HIGH_K = 'HIGH_K'
}

export enum SoilPHState {
  ACIDIC = 'ACIDIC',
  NEUTRAL = 'NEUTRAL',
  ALKALINE = 'ALKALINE'
}

export enum SoilMoistureState {
  DRY = 'DRY',
  OPTIMAL = 'OPTIMAL',
  WATERLOGGED = 'WATERLOGGED'
}

export enum NDVIState {
  EXCELLENT = 'EXCELLENT',
  HEALTHY = 'HEALTHY',
  MODERATE_STRESS = 'MODERATE_STRESS',
  HIGH_STRESS = 'HIGH_STRESS',
  CRITICAL = 'CRITICAL'
}

export enum NDVITrend {
  RISING = 'RISING',
  STABLE = 'STABLE',
  DECLINING = 'DECLINING'
}

export enum WeatherState {
  CLEAR = 'CLEAR',
  RAIN_EXPECTED = 'RAIN_EXPECTED',
  RAIN_ACTIVE = 'RAIN_ACTIVE',
  DRY_SPELL = 'DRY_SPELL',
  HEAT_STRESS = 'HEAT_STRESS',
  COLD_STRESS = 'COLD_STRESS',
  FROST_RISK = 'FROST_RISK',
  HIGH_HUMIDITY = 'HIGH_HUMIDITY',
  STRONG_WIND = 'STRONG_WIND',
  HAILSTORM_RISK = 'HAILSTORM_RISK'
}

export enum CropStage {
  PLANNING = 'PLANNING',
  LAND_PREPARATION = 'LAND_PREPARATION',
  SOWING = 'SOWING',
  GERMINATION = 'GERMINATION',
  VEGETATIVE = 'VEGETATIVE',
  REPRODUCTIVE = 'REPRODUCTIVE',
  MATURITY = 'MATURITY',
  HARVEST = 'HARVEST',
  POST_HARVEST = 'POST_HARVEST'
}

export enum CropGroup {
  CEREALS = 'cereals',
  PULSES = 'pulses',
  OILSEEDS = 'oilseeds',
  FIBER = 'fiber',
  SUGARCANE = 'sugarcane',
  VEGETABLES = 'vegetables',
  FRUITS = 'fruits',
  SPICES = 'spices',
  FODDER = 'fodder'
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE ENUM - All possible inferred causes
// ═══════════════════════════════════════════════════════════════════════════

export enum Cause {
  // Nutrient causes
  NITROGEN_DEFICIENCY = 'NITROGEN_DEFICIENCY',
  NITROGEN_DEFICIENCY_CRITICAL = 'NITROGEN_DEFICIENCY_CRITICAL',
  PHOSPHORUS_DEFICIENCY = 'PHOSPHORUS_DEFICIENCY',
  POTASSIUM_DEFICIENCY = 'POTASSIUM_DEFICIENCY',
  SEVERE_NUTRIENT_DEPLETION = 'SEVERE_NUTRIENT_DEPLETION',
  EXCESS_NITROGEN_LODGING = 'EXCESS_NITROGEN_LODGING',
  
  // Water causes
  WATER_STRESS_MILD = 'WATER_STRESS_MILD',
  WATER_STRESS_MODERATE = 'WATER_STRESS_MODERATE',
  WATER_STRESS_CRITICAL = 'WATER_STRESS_CRITICAL',
  WATERLOGGING = 'WATERLOGGING',
  DROUGHT_STRESS = 'DROUGHT_STRESS',
  
  // Temperature causes
  HEAT_STRESS = 'HEAT_STRESS',
  COLD_STRESS = 'COLD_STRESS',
  FROST_DAMAGE_RISK = 'FROST_DAMAGE_RISK',
  
  // Disease causes
  RICE_BLAST_RISK = 'RICE_BLAST_RISK',
  WHEAT_RUST_RISK = 'WHEAT_RUST_RISK',
  LATE_BLIGHT_RISK = 'LATE_BLIGHT_RISK',
  POWDERY_MILDEW_RISK = 'POWDERY_MILDEW_RISK',
  ROOT_ROT_RISK = 'ROOT_ROT_RISK',
  
  // Pest causes
  BOLLWORM_RISK = 'BOLLWORM_RISK',
  APHID_RISK = 'APHID_RISK',
  STEM_BORER_RISK = 'STEM_BORER_RISK',
  WHITEFLY_RISK = 'WHITEFLY_RISK',
  THRIPS_RISK = 'THRIPS_RISK',
  
  // Positive causes
  OPTIMAL_GROWTH = 'OPTIMAL_GROWTH',
  YIELD_POTENTIAL_HIGH = 'YIELD_POTENTIAL_HIGH',
  HARVEST_READY = 'HARVEST_READY'
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION GRAPH INPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionGraphInput {
  crop_code: string;
  crop_group: CropGroup;
  days_after_sowing: number;
  farming_mode: 'organic_only' | 'fertilizer_pesticide' | 'organic_fertilizer';
  soil_data: {
    n: number;
    p: number;
    k: number;
    ph: number;
    moisture?: number;
  };
  ndvi_data?: {
    current: number;
    trend: 'improving' | 'declining' | 'stable';
  };
  weather_data?: {
    temperature: number;
    humidity: number;
    rainfall_forecast?: string;
    days_since_rain?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INFERRED CAUSE WITH RULE TRACING
// ═══════════════════════════════════════════════════════════════════════════

export interface InferredCause {
  cause: Cause;
  rule_id: string;
  category: 'nutrient' | 'water' | 'temperature' | 'disease' | 'pest' | 'positive';
  priority: number;  // 1-10, higher = more urgent
  confidence: number; // 0-1
  scientific_basis: string;
  recommended_action: string;
  action_urgency: 'immediate' | 'within_24h' | 'within_3days' | 'within_week';
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION GRAPH OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionGraphOutput {
  advisory_id: string;
  generated_at: string;
  crop_code: string;
  crop_stage: CropStage;
  
  // Symbolic states (for AI reference)
  symbolic_states: {
    ndvi_state: NDVIState;
    ndvi_trend: NDVITrend;
    soil_n_state: SoilNState;
    soil_p_state: SoilPState;
    soil_k_state: SoilKState;
    soil_ph_state: SoilPHState;
    soil_moisture_state: SoilMoistureState;
    weather_state: WeatherState;
  };
  
  // Inferred causes with full tracing
  inferred_causes: InferredCause[];
  
  // Risk assessment
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  overall_confidence: number;
  
  // Rule audit
  rules_evaluated: number;
  rules_triggered: string[];
  
  // AI guidance
  ai_focus_areas: string[];
  ai_constraints: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// THRESHOLDS (ICAR/FAO Standards)
// ═══════════════════════════════════════════════════════════════════════════

const NDVI_THRESHOLDS = {
  EXCELLENT: 0.65,
  HEALTHY: 0.50,
  MODERATE: 0.35,
  POOR: 0.20
};

const NPK_TARGETS: Record<string, { n: number; p: number; k: number }> = {
  wheat: { n: 120, p: 60, k: 40 },
  rice: { n: 120, p: 60, k: 60 },
  cotton: { n: 150, p: 60, k: 60 },
  sugarcane: { n: 250, p: 85, k: 85 },
  soybean: { n: 30, p: 60, k: 30 },
  maize: { n: 120, p: 60, k: 40 },
  tomato: { n: 150, p: 80, k: 80 },
  onion: { n: 110, p: 40, k: 60 },
  default: { n: 80, p: 40, k: 40 }
};

const CROP_STAGE_DAS: Record<string, { vegetative: number; reproductive: number; maturity: number }> = {
  wheat: { vegetative: 75, reproductive: 105, maturity: 130 },
  rice: { vegetative: 55, reproductive: 95, maturity: 120 },
  cotton: { vegetative: 60, reproductive: 120, maturity: 160 },
  default: { vegetative: 60, reproductive: 100, maturity: 130 }
};

// ═══════════════════════════════════════════════════════════════════════════
// FACT EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function extractNDVIState(ndviValue: number): NDVIState {
  if (ndviValue >= NDVI_THRESHOLDS.EXCELLENT) return NDVIState.EXCELLENT;
  if (ndviValue >= NDVI_THRESHOLDS.HEALTHY) return NDVIState.HEALTHY;
  if (ndviValue >= NDVI_THRESHOLDS.MODERATE) return NDVIState.MODERATE_STRESS;
  if (ndviValue >= NDVI_THRESHOLDS.POOR) return NDVIState.HIGH_STRESS;
  return NDVIState.CRITICAL;
}

function extractNDVITrend(trend: 'improving' | 'declining' | 'stable'): NDVITrend {
  if (trend === 'improving') return NDVITrend.RISING;
  if (trend === 'declining') return NDVITrend.DECLINING;
  return NDVITrend.STABLE;
}

function extractSoilNState(n: number, cropCode: string): SoilNState {
  const target = NPK_TARGETS[cropCode.toLowerCase()] || NPK_TARGETS.default;
  const ratio = n / target.n;
  if (ratio < 0.6) return SoilNState.LOW_N;
  if (ratio > 1.2) return SoilNState.HIGH_N;
  return SoilNState.ADEQUATE_N;
}

function extractSoilPState(p: number, cropCode: string): SoilPState {
  const target = NPK_TARGETS[cropCode.toLowerCase()] || NPK_TARGETS.default;
  const ratio = p / target.p;
  if (ratio < 0.6) return SoilPState.LOW_P;
  if (ratio > 1.2) return SoilPState.HIGH_P;
  return SoilPState.ADEQUATE_P;
}

function extractSoilKState(k: number, cropCode: string): SoilKState {
  const target = NPK_TARGETS[cropCode.toLowerCase()] || NPK_TARGETS.default;
  const ratio = k / target.k;
  if (ratio < 0.6) return SoilKState.LOW_K;
  if (ratio > 1.2) return SoilKState.HIGH_K;
  return SoilKState.ADEQUATE_K;
}

function extractSoilPHState(ph: number): SoilPHState {
  if (ph < 6.0) return SoilPHState.ACIDIC;
  if (ph > 7.5) return SoilPHState.ALKALINE;
  return SoilPHState.NEUTRAL;
}

function extractSoilMoistureState(moisture: number): SoilMoistureState {
  if (moisture < 30) return SoilMoistureState.DRY;
  if (moisture > 80) return SoilMoistureState.WATERLOGGED;
  return SoilMoistureState.OPTIMAL;
}

function extractWeatherState(weather: { temperature: number; humidity: number; days_since_rain?: number }): WeatherState {
  if (weather.temperature > 40) return WeatherState.HEAT_STRESS;
  if (weather.temperature < 4) return WeatherState.FROST_RISK;
  if (weather.temperature < 10) return WeatherState.COLD_STRESS;
  if (weather.humidity > 85) return WeatherState.HIGH_HUMIDITY;
  if (weather.days_since_rain && weather.days_since_rain >= 7) return WeatherState.DRY_SPELL;
  return WeatherState.CLEAR;
}

function extractCropStage(daysAfterSowing: number, cropCode: string): CropStage {
  const config = CROP_STAGE_DAS[cropCode.toLowerCase()] || CROP_STAGE_DAS.default;
  if (daysAfterSowing < 0) return CropStage.PLANNING;
  if (daysAfterSowing < 15) return CropStage.GERMINATION;
  if (daysAfterSowing < config.vegetative) return CropStage.VEGETATIVE;
  if (daysAfterSowing < config.reproductive) return CropStage.REPRODUCTIVE;
  if (daysAfterSowing < config.maturity) return CropStage.MATURITY;
  return CropStage.HARVEST;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE INFERENCE RULES
// ═══════════════════════════════════════════════════════════════════════════

interface SymbolicInput {
  crop_code: string;
  crop_group: CropGroup;
  crop_stage: CropStage;
  ndvi_state: NDVIState;
  ndvi_trend: NDVITrend;
  soil_n_state: SoilNState;
  soil_p_state: SoilPState;
  soil_k_state: SoilKState;
  soil_ph_state: SoilPHState;
  soil_moisture_state: SoilMoistureState;
  weather_state: WeatherState;
  farming_mode: string;
}

function inferCauses(input: SymbolicInput): InferredCause[] {
  const causes: InferredCause[] = [];
  
  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT DEFICIENCY RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  // N Deficiency - Vegetative
  if (input.soil_n_state === SoilNState.LOW_N && input.crop_stage === CropStage.VEGETATIVE) {
    causes.push({
      cause: Cause.NITROGEN_DEFICIENCY,
      rule_id: 'DG_NPK_N_001',
      category: 'nutrient',
      priority: 7,
      confidence: 0.85,
      scientific_basis: 'Nitrogen is critical for chlorophyll synthesis during vegetative growth. Deficiency causes yellowing of older leaves.',
      recommended_action: 'Apply nitrogen fertilizer or organic manure',
      action_urgency: 'within_3days'
    });
  }
  
  // N Deficiency - Critical at Reproductive
  if (input.soil_n_state === SoilNState.LOW_N && input.crop_stage === CropStage.REPRODUCTIVE) {
    causes.push({
      cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
      rule_id: 'DG_NPK_N_002',
      category: 'nutrient',
      priority: 9,
      confidence: 0.90,
      scientific_basis: 'N deficiency at flowering/fruiting reduces grain/fruit set by 30-50%.',
      recommended_action: 'Emergency nitrogen application via foliar spray',
      action_urgency: 'immediate'
    });
  }
  
  // P Deficiency
  if (input.soil_p_state === SoilPState.LOW_P) {
    causes.push({
      cause: Cause.PHOSPHORUS_DEFICIENCY,
      rule_id: 'DG_NPK_P_001',
      category: 'nutrient',
      priority: 7,
      confidence: 0.80,
      scientific_basis: 'Phosphorus is essential for root development and energy transfer.',
      recommended_action: 'Apply phosphorus fertilizer or rock phosphite',
      action_urgency: 'within_3days'
    });
  }
  
  // K Deficiency
  if (input.soil_k_state === SoilKState.LOW_K && 
      (input.crop_stage === CropStage.REPRODUCTIVE || input.crop_stage === CropStage.MATURITY)) {
    causes.push({
      cause: Cause.POTASSIUM_DEFICIENCY,
      rule_id: 'DG_NPK_K_001',
      category: 'nutrient',
      priority: 7,
      confidence: 0.80,
      scientific_basis: 'Potassium is critical for fruit quality, disease resistance, and drought tolerance.',
      recommended_action: 'Apply potassium fertilizer or wood ash',
      action_urgency: 'within_3days'
    });
  }
  
  // Severe Nutrient Depletion
  if (input.soil_n_state === SoilNState.LOW_N && 
      input.soil_p_state === SoilPState.LOW_P && 
      input.soil_k_state === SoilKState.LOW_K) {
    causes.push({
      cause: Cause.SEVERE_NUTRIENT_DEPLETION,
      rule_id: 'DG_NPK_ALL_001',
      category: 'nutrient',
      priority: 9,
      confidence: 0.90,
      scientific_basis: 'Multiple nutrient deficiencies indicate severely depleted soil.',
      recommended_action: 'Comprehensive soil test and balanced fertilization',
      action_urgency: 'immediate'
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // WATER STRESS RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  // Mild Water Stress
  if (input.ndvi_state === NDVIState.MODERATE_STRESS && 
      input.soil_moisture_state === SoilMoistureState.DRY &&
      input.weather_state !== WeatherState.RAIN_EXPECTED) {
    causes.push({
      cause: Cause.WATER_STRESS_MILD,
      rule_id: 'DG_WATER_001',
      category: 'water',
      priority: 6,
      confidence: 0.75,
      scientific_basis: 'Early water stress can be reversed with timely irrigation.',
      recommended_action: 'Light irrigation recommended',
      action_urgency: 'within_3days'
    });
  }
  
  // Moderate Water Stress
  if (input.ndvi_state === NDVIState.HIGH_STRESS && 
      input.soil_moisture_state === SoilMoistureState.DRY &&
      input.weather_state === WeatherState.DRY_SPELL) {
    causes.push({
      cause: Cause.WATER_STRESS_MODERATE,
      rule_id: 'DG_WATER_002',
      category: 'water',
      priority: 8,
      confidence: 0.85,
      scientific_basis: 'High stress with dry spell indicates significant water deficit.',
      recommended_action: 'Immediate irrigation recommended',
      action_urgency: 'within_24h'
    });
  }
  
  // Critical Water Stress at Reproductive
  if ((input.ndvi_state === NDVIState.HIGH_STRESS || input.ndvi_state === NDVIState.CRITICAL) &&
      input.soil_moisture_state === SoilMoistureState.DRY &&
      input.crop_stage === CropStage.REPRODUCTIVE) {
    causes.push({
      cause: Cause.WATER_STRESS_CRITICAL,
      rule_id: 'DG_WATER_003',
      category: 'water',
      priority: 10,
      confidence: 0.95,
      scientific_basis: 'Water stress at reproductive stage causes irreversible yield loss.',
      recommended_action: 'Emergency irrigation needed',
      action_urgency: 'immediate'
    });
  }
  
  // Waterlogging
  if (input.soil_moisture_state === SoilMoistureState.WATERLOGGED) {
    causes.push({
      cause: Cause.WATERLOGGING,
      rule_id: 'DG_WATER_004',
      category: 'water',
      priority: 8,
      confidence: 0.90,
      scientific_basis: 'Waterlogging causes root asphyxiation and promotes root rot.',
      recommended_action: 'Drainage essential within 24-48 hours',
      action_urgency: 'within_24h'
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEMPERATURE STRESS RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  if (input.weather_state === WeatherState.HEAT_STRESS) {
    causes.push({
      cause: Cause.HEAT_STRESS,
      rule_id: 'DG_TEMP_001',
      category: 'temperature',
      priority: 7,
      confidence: 0.85,
      scientific_basis: 'High temperature increases transpiration and water demand.',
      recommended_action: 'Light irrigation for cooling',
      action_urgency: 'within_24h'
    });
  }
  
  if (input.weather_state === WeatherState.COLD_STRESS) {
    causes.push({
      cause: Cause.COLD_STRESS,
      rule_id: 'DG_TEMP_002',
      category: 'temperature',
      priority: 7,
      confidence: 0.85,
      scientific_basis: 'Cold stress slows growth and can damage sensitive crops.',
      recommended_action: 'Cover or mulch for protection',
      action_urgency: 'within_24h'
    });
  }
  
  if (input.weather_state === WeatherState.FROST_RISK) {
    causes.push({
      cause: Cause.FROST_DAMAGE_RISK,
      rule_id: 'DG_TEMP_003',
      category: 'temperature',
      priority: 9,
      confidence: 0.90,
      scientific_basis: 'Frost can kill tender tissue. Immediate protection needed.',
      recommended_action: 'Frost protection measures',
      action_urgency: 'immediate'
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RISK RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  // Fungal disease risk (high humidity + declining NDVI)
  if (input.weather_state === WeatherState.HIGH_HUMIDITY && 
      input.ndvi_trend === NDVITrend.DECLINING) {
    causes.push({
      cause: Cause.POWDERY_MILDEW_RISK,
      rule_id: 'DG_DIS_001',
      category: 'disease',
      priority: 6,
      confidence: 0.70,
      scientific_basis: 'High humidity (>85%) favors fungal diseases.',
      recommended_action: 'Scout for symptoms and apply preventive fungicide',
      action_urgency: 'within_3days'
    });
  }
  
  // Root rot risk
  if (input.soil_moisture_state === SoilMoistureState.WATERLOGGED && 
      input.ndvi_trend === NDVITrend.DECLINING) {
    causes.push({
      cause: Cause.ROOT_ROT_RISK,
      rule_id: 'DG_DIS_002',
      category: 'disease',
      priority: 8,
      confidence: 0.80,
      scientific_basis: 'Waterlogged conditions favor soil-borne pathogens.',
      recommended_action: 'Improve drainage and apply Trichoderma',
      action_urgency: 'within_24h'
    });
  }
  
  // Crop-specific: Wheat rust risk
  if (input.crop_group === CropGroup.CEREALS && 
      input.crop_code.toLowerCase() === 'wheat' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.VEGETATIVE) {
    causes.push({
      cause: Cause.WHEAT_RUST_RISK,
      rule_id: 'DG_CEREAL_WHEAT_001',
      category: 'disease',
      priority: 8,
      confidence: 0.75,
      scientific_basis: 'High humidity at vegetative stage favors rust development.',
      recommended_action: 'Apply preventive fungicide',
      action_urgency: 'within_24h'
    });
  }
  
  // Crop-specific: Rice blast risk
  if (input.crop_group === CropGroup.CEREALS && 
      input.crop_code.toLowerCase() === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_n_state === SoilNState.HIGH_N) {
    causes.push({
      cause: Cause.RICE_BLAST_RISK,
      rule_id: 'DG_CEREAL_RICE_001',
      category: 'disease',
      priority: 8,
      confidence: 0.80,
      scientific_basis: 'High nitrogen + humidity creates ideal blast conditions.',
      recommended_action: 'Reduce nitrogen, apply Tricyclazole',
      action_urgency: 'within_24h'
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PEST RISK RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  // Aphid risk (wheat/mustard + heat)
  if ((input.crop_group === CropGroup.CEREALS || input.crop_group === CropGroup.OILSEEDS) &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.crop_stage === CropStage.REPRODUCTIVE) {
    causes.push({
      cause: Cause.APHID_RISK,
      rule_id: 'DG_PEST_001',
      category: 'pest',
      priority: 7,
      confidence: 0.70,
      scientific_basis: 'Heat stress promotes aphid multiplication.',
      recommended_action: 'Apply neem oil or approved insecticide',
      action_urgency: 'within_3days'
    });
  }
  
  // Bollworm risk (cotton)
  if (input.crop_group === CropGroup.FIBER &&
      input.crop_stage === CropStage.REPRODUCTIVE) {
    causes.push({
      cause: Cause.BOLLWORM_RISK,
      rule_id: 'DG_PEST_COTTON_001',
      category: 'pest',
      priority: 8,
      confidence: 0.75,
      scientific_basis: 'Reproductive stage is vulnerable to bollworm attack.',
      recommended_action: 'Install pheromone traps, apply Bt spray',
      action_urgency: 'within_3days'
    });
  }
  
  // Stem borer risk (rice/sugarcane)
  if ((input.crop_code.toLowerCase() === 'rice' || input.crop_code.toLowerCase() === 'sugarcane') &&
      input.crop_stage === CropStage.VEGETATIVE) {
    causes.push({
      cause: Cause.STEM_BORER_RISK,
      rule_id: 'DG_PEST_002',
      category: 'pest',
      priority: 7,
      confidence: 0.70,
      scientific_basis: 'Vegetative stage is susceptible to stem borer damage.',
      recommended_action: 'Install pheromone traps, release Trichogramma',
      action_urgency: 'within_3days'
    });
  }
  
  // Thrips risk (onion)
  if (input.crop_code.toLowerCase() === 'onion' &&
      input.weather_state === WeatherState.HEAT_STRESS) {
    causes.push({
      cause: Cause.THRIPS_RISK,
      rule_id: 'DG_PEST_VEG_001',
      category: 'pest',
      priority: 7,
      confidence: 0.75,
      scientific_basis: 'Hot dry weather favors thrips infestation.',
      recommended_action: 'Apply neem oil, install blue sticky traps',
      action_urgency: 'within_3days'
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // POSITIVE/HEALTHY RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  // Optimal growth
  if (input.ndvi_state === NDVIState.HEALTHY &&
      input.ndvi_trend !== NDVITrend.DECLINING &&
      input.soil_n_state === SoilNState.ADEQUATE_N &&
      input.soil_p_state === SoilPState.ADEQUATE_P &&
      input.soil_k_state === SoilKState.ADEQUATE_K &&
      input.soil_moisture_state === SoilMoistureState.OPTIMAL) {
    causes.push({
      cause: Cause.OPTIMAL_GROWTH,
      rule_id: 'DG_POS_001',
      category: 'positive',
      priority: 1,
      confidence: 0.85,
      scientific_basis: 'All indicators show healthy crop development.',
      recommended_action: 'Continue current management practices',
      action_urgency: 'within_week'
    });
  }
  
  // High yield potential
  if (input.ndvi_state === NDVIState.EXCELLENT &&
      input.ndvi_trend === NDVITrend.RISING &&
      input.crop_stage === CropStage.REPRODUCTIVE) {
    causes.push({
      cause: Cause.YIELD_POTENTIAL_HIGH,
      rule_id: 'DG_POS_002',
      category: 'positive',
      priority: 2,
      confidence: 0.80,
      scientific_basis: 'Excellent NDVI at reproductive stage indicates high yield potential.',
      recommended_action: 'Maintain current practices, prepare for harvest',
      action_urgency: 'within_week'
    });
  }
  
  // Harvest ready
  if (input.crop_stage === CropStage.MATURITY &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.soil_moisture_state === SoilMoistureState.DRY) {
    causes.push({
      cause: Cause.HARVEST_READY,
      rule_id: 'DG_POS_003',
      category: 'positive',
      priority: 3,
      confidence: 0.85,
      scientific_basis: 'Natural senescence indicates crop maturity.',
      recommended_action: 'Plan harvest operations',
      action_urgency: 'within_week'
    });
  }
  
  return causes;
}

// ═══════════════════════════════════════════════════════════════════════════
// RISK LEVEL CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

function calculateRiskLevel(causes: InferredCause[]): 'low' | 'medium' | 'high' | 'critical' {
  if (causes.length === 0) return 'low';
  
  const maxPriority = Math.max(...causes.map(c => c.priority));
  const negativeCauses = causes.filter(c => c.category !== 'positive');
  
  if (maxPriority >= 9 || negativeCauses.length >= 4) return 'critical';
  if (maxPriority >= 7 || negativeCauses.length >= 2) return 'high';
  if (maxPriority >= 5 || negativeCauses.length >= 1) return 'medium';
  return 'low';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the Decision Graph inference
 * 
 * This is called BEFORE AI to:
 * 1. Extract symbolic states from raw data
 * 2. Infer causes using deterministic rules
 * 3. Provide structured context for AI prioritization
 */
export function runDecisionGraphInference(input: DecisionGraphInput): DecisionGraphOutput {
  const advisoryId = `DG-${Date.now().toString(36).toUpperCase()}`;
  
  // Extract symbolic states
  const ndviState = input.ndvi_data 
    ? extractNDVIState(input.ndvi_data.current) 
    : NDVIState.HEALTHY;
  
  const ndviTrend = input.ndvi_data 
    ? extractNDVITrend(input.ndvi_data.trend) 
    : NDVITrend.STABLE;
  
  const soilNState = extractSoilNState(input.soil_data.n, input.crop_code);
  const soilPState = extractSoilPState(input.soil_data.p, input.crop_code);
  const soilKState = extractSoilKState(input.soil_data.k, input.crop_code);
  const soilPHState = extractSoilPHState(input.soil_data.ph);
  const soilMoistureState = input.soil_data.moisture 
    ? extractSoilMoistureState(input.soil_data.moisture) 
    : SoilMoistureState.OPTIMAL;
  
  const weatherState = input.weather_data 
    ? extractWeatherState(input.weather_data) 
    : WeatherState.CLEAR;
  
  const cropStage = extractCropStage(input.days_after_sowing, input.crop_code);
  
  // Build symbolic input
  const symbolicInput: SymbolicInput = {
    crop_code: input.crop_code,
    crop_group: input.crop_group,
    crop_stage: cropStage,
    ndvi_state: ndviState,
    ndvi_trend: ndviTrend,
    soil_n_state: soilNState,
    soil_p_state: soilPState,
    soil_k_state: soilKState,
    soil_ph_state: soilPHState,
    soil_moisture_state: soilMoistureState,
    weather_state: weatherState,
    farming_mode: input.farming_mode
  };
  
  // Infer causes
  const inferredCauses = inferCauses(symbolicInput);
  
  // Sort by priority (highest first)
  inferredCauses.sort((a, b) => b.priority - a.priority);
  
  // Calculate risk level
  const riskLevel = calculateRiskLevel(inferredCauses);
  
  // Calculate overall confidence
  const avgConfidence = inferredCauses.length > 0 
    ? inferredCauses.reduce((sum, c) => sum + c.confidence, 0) / inferredCauses.length 
    : 0.5;
  
  // Build AI focus areas
  const aiFocusAreas: string[] = [];
  const categories = new Set(inferredCauses.map(c => c.category));
  if (categories.has('nutrient')) aiFocusAreas.push('Prioritize fertilizer tasks based on deficiencies');
  if (categories.has('water')) aiFocusAreas.push('Adjust irrigation schedule based on stress level');
  if (categories.has('disease')) aiFocusAreas.push('Include preventive disease management');
  if (categories.has('pest')) aiFocusAreas.push('Add pest monitoring and control tasks');
  if (categories.has('temperature')) aiFocusAreas.push('Consider temperature mitigation measures');
  
  // Build AI constraints based on farming mode
  const aiConstraints: string[] = [];
  if (input.farming_mode === 'organic_only') {
    aiConstraints.push('Use ONLY organic inputs (no chemical fertilizers or pesticides)');
    aiConstraints.push('Reference organic alternatives in product_hints');
  }
  
  return {
    advisory_id: advisoryId,
    generated_at: new Date().toISOString(),
    crop_code: input.crop_code,
    crop_stage: cropStage,
    
    symbolic_states: {
      ndvi_state: ndviState,
      ndvi_trend: ndviTrend,
      soil_n_state: soilNState,
      soil_p_state: soilPState,
      soil_k_state: soilKState,
      soil_ph_state: soilPHState,
      soil_moisture_state: soilMoistureState,
      weather_state: weatherState
    },
    
    inferred_causes: inferredCauses,
    risk_level: riskLevel,
    overall_confidence: avgConfidence,
    
    rules_evaluated: 25, // Approximate number of rules checked
    rules_triggered: inferredCauses.map(c => c.rule_id),
    
    ai_focus_areas: aiFocusAreas,
    ai_constraints: aiConstraints
  };
}

/**
 * Format Decision Graph output for AI prompt injection
 */
export function formatForAIPrompt(output: DecisionGraphOutput): string {
  const lines: string[] = [];
  
  lines.push('## DECISION GRAPH ANALYSIS (Deterministic)');
  lines.push(`Advisory ID: ${output.advisory_id}`);
  lines.push(`Crop Stage: ${output.crop_stage}`);
  lines.push(`Risk Level: ${output.risk_level.toUpperCase()}`);
  lines.push(`Confidence: ${(output.overall_confidence * 100).toFixed(0)}%`);
  lines.push('');
  
  lines.push('### SYMBOLIC STATES');
  lines.push(`NDVI: ${output.symbolic_states.ndvi_state} (${output.symbolic_states.ndvi_trend})`);
  lines.push(`Soil N: ${output.symbolic_states.soil_n_state}`);
  lines.push(`Soil P: ${output.symbolic_states.soil_p_state}`);
  lines.push(`Soil K: ${output.symbolic_states.soil_k_state}`);
  lines.push(`Soil pH: ${output.symbolic_states.soil_ph_state}`);
  lines.push(`Moisture: ${output.symbolic_states.soil_moisture_state}`);
  lines.push(`Weather: ${output.symbolic_states.weather_state}`);
  lines.push('');
  
  if (output.inferred_causes.length > 0) {
    lines.push('### INFERRED CAUSES (in priority order)');
    for (const cause of output.inferred_causes) {
      const urgencyEmoji = cause.action_urgency === 'immediate' ? '🚨' : 
                          cause.action_urgency === 'within_24h' ? '⚠️' : 
                          cause.action_urgency === 'within_3days' ? '⏰' : '📋';
      lines.push(`${urgencyEmoji} [${cause.rule_id}] ${cause.cause}`);
      lines.push(`   Priority: ${cause.priority}/10 | Confidence: ${(cause.confidence * 100).toFixed(0)}%`);
      lines.push(`   Basis: ${cause.scientific_basis}`);
      lines.push(`   Action: ${cause.recommended_action} (${cause.action_urgency})`);
    }
    lines.push('');
  }
  
  if (output.ai_focus_areas.length > 0) {
    lines.push('### AI FOCUS AREAS');
    for (const area of output.ai_focus_areas) {
      lines.push(`- ${area}`);
    }
    lines.push('');
  }
  
  if (output.ai_constraints.length > 0) {
    lines.push('### AI CONSTRAINTS');
    for (const constraint of output.ai_constraints) {
      lines.push(`- ${constraint}`);
    }
    lines.push('');
  }
  
  lines.push(`Rules evaluated: ${output.rules_evaluated}`);
  lines.push(`Rules triggered: ${output.rules_triggered.length}`);
  
  return lines.join('\n');
}

/**
 * Get crop group from crop code
 */
export function getCropGroup(cropCode: string): CropGroup {
  const cropLower = cropCode.toLowerCase();
  
  // Cereals
  if (['wheat', 'rice', 'maize', 'barley', 'sorghum', 'bajra', 'ragi', 'jowar', 'oats'].includes(cropLower)) {
    return CropGroup.CEREALS;
  }
  
  // Pulses
  if (['gram', 'chickpea', 'lentil', 'moong', 'mung', 'urad', 'tur', 'arhar', 'pea'].includes(cropLower)) {
    return CropGroup.PULSES;
  }
  
  // Oilseeds
  if (['soybean', 'groundnut', 'mustard', 'sunflower', 'sesame', 'linseed', 'safflower'].includes(cropLower)) {
    return CropGroup.OILSEEDS;
  }
  
  // Fiber
  if (['cotton', 'jute', 'mesta', 'hemp'].includes(cropLower)) {
    return CropGroup.FIBER;
  }
  
  // Sugarcane
  if (['sugarcane'].includes(cropLower)) {
    return CropGroup.SUGARCANE;
  }
  
  // Vegetables
  if (['tomato', 'onion', 'potato', 'brinjal', 'okra', 'chilli', 'cabbage', 'cauliflower', 'cucumber', 'pumpkin', 'carrot', 'radish', 'spinach', 'lettuce'].includes(cropLower)) {
    return CropGroup.VEGETABLES;
  }
  
  // Fruits
  if (['mango', 'banana', 'citrus', 'orange', 'grapes', 'pomegranate', 'apple', 'papaya', 'guava', 'watermelon'].includes(cropLower)) {
    return CropGroup.FRUITS;
  }
  
  // Spices
  if (['turmeric', 'ginger', 'coriander', 'cumin', 'fennel', 'fenugreek', 'pepper', 'cardamom'].includes(cropLower)) {
    return CropGroup.SPICES;
  }
  
  // Fodder
  if (['berseem', 'lucerne', 'napier', 'fodder', 'grass'].includes(cropLower)) {
    return CropGroup.FODDER;
  }
  
  // Default to cereals
  return CropGroup.CEREALS;
}

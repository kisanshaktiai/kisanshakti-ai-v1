// ============= CANONICAL STATE BUILDER =============
// Creates a unified, deterministic state object for the Symbolic Decision Brain
// LLM understands → CanonicalState → Rules decide → LLM explains
// This is the ONLY object allowed into the Decision Brain

// ==================== CLOSED WORLD ENUMS ====================
// These are the ONLY allowed values - no free text in decision brain

export enum CropType {
  WHEAT = 'WHEAT',
  RICE = 'RICE',
  SUGARCANE = 'SUGARCANE',
  COTTON = 'COTTON',
  SOYBEAN = 'SOYBEAN',
  MAIZE = 'MAIZE',
  BAJRA = 'BAJRA',
  JOWAR = 'JOWAR',
  GROUNDNUT = 'GROUNDNUT',
  ONION = 'ONION',
  TOMATO = 'TOMATO',
  POTATO = 'POTATO',
  CHILLI = 'CHILLI',
  GRAPES = 'GRAPES',
  POMEGRANATE = 'POMEGRANATE',
  BANANA = 'BANANA',
  MANGO = 'MANGO',
  TURMERIC = 'TURMERIC',
  GINGER = 'GINGER',
  CHICKPEA = 'CHICKPEA',
  PIGEON_PEA = 'PIGEON_PEA',
  MUSTARD = 'MUSTARD',
  SUNFLOWER = 'SUNFLOWER',
  RAGI = 'RAGI',
  UNKNOWN = 'UNKNOWN'
}

export enum CropStage {
  GERMINATION = 'GERMINATION',
  SEEDLING = 'SEEDLING',
  VEGETATIVE = 'VEGETATIVE',
  TILLERING = 'TILLERING',
  GRAND_GROWTH = 'GRAND_GROWTH',
  BOOTING = 'BOOTING',
  HEADING = 'HEADING',
  FLOWERING = 'FLOWERING',
  FRUITING = 'FRUITING',
  BOLL_FORMATION = 'BOLL_FORMATION',
  BOLL_OPENING = 'BOLL_OPENING',
  GRAIN_FILLING = 'GRAIN_FILLING',
  MATURITY = 'MATURITY',
  HARVEST = 'HARVEST',
  UNKNOWN = 'UNKNOWN'
}

export enum DaysAfterSowingBucket {
  D0_7 = 'D0_7',
  D8_15 = 'D8_15',
  D16_30 = 'D16_30',
  D31_60 = 'D31_60',
  D61_90 = 'D61_90',
  D91_120 = 'D91_120',
  D121_180 = 'D121_180',
  D180_PLUS = 'D180_PLUS',
  UNKNOWN = 'UNKNOWN'
}

// Visual symptoms - ONLY what is SEEN, not interpreted
export enum VisualSymptom {
  NONE = 'NONE',
  GENERAL_YELLOWING = 'GENERAL_YELLOWING',
  INTERVEINAL_YELLOWING = 'INTERVEINAL_YELLOWING',
  LEAF_EDGE_BURN = 'LEAF_EDGE_BURN',
  LEAF_TIP_BURN = 'LEAF_TIP_BURN',
  LEAF_CURLING = 'LEAF_CURLING',
  LEAF_ROLLING = 'LEAF_ROLLING',
  CURLED_LEAVES = 'CURLED_LEAVES',
  SPOTS_CIRCULAR = 'SPOTS_CIRCULAR',
  SPOTS_IRREGULAR = 'SPOTS_IRREGULAR',
  SPOTS_ANGULAR = 'SPOTS_ANGULAR',
  SPOTS_POWDERY = 'SPOTS_POWDERY',
  ANGULAR_SPOTS = 'ANGULAR_SPOTS',
  POWDERY_COATING = 'POWDERY_COATING',
  WHITE_POWDER = 'WHITE_POWDER',
  DOWNY_GROWTH = 'DOWNY_GROWTH',
  WILTING = 'WILTING',
  STUNTED_GROWTH = 'STUNTED_GROWTH',
  PLANT_LODGING = 'PLANT_LODGING',
  STEM_BORING = 'STEM_BORING',
  STEM_DISCOLORATION = 'STEM_DISCOLORATION',
  HOLES_IN_STEM = 'HOLES_IN_STEM',
  ROOT_DAMAGE = 'ROOT_DAMAGE',
  ROOT_DISCOLORATION = 'ROOT_DISCOLORATION',
  FRUIT_DAMAGE = 'FRUIT_DAMAGE',
  BOLL_DAMAGE = 'BOLL_DAMAGE',
  ROSETTE_FLOWER = 'ROSETTE_FLOWER',
  LARGE_HOLES = 'LARGE_HOLES',
  DEAD_HEART = 'DEAD_HEART',
  WHITE_EAR = 'WHITE_EAR',
  WEBBING = 'WEBBING',
  HOLES_IN_LEAVES = 'HOLES_IN_LEAVES',
  DEFOLIATION = 'DEFOLIATION',
  SOOTY_MOLD = 'SOOTY_MOLD',
  STICKY_LEAVES = 'STICKY_LEAVES',
  HONEYDEW = 'HONEYDEW',
  YELLOW_STRIPES = 'YELLOW_STRIPES',
  PUSTULES = 'PUSTULES',
  WATER_SOAKED_LESIONS = 'WATER_SOAKED_LESIONS',
  SILVERING = 'SILVERING',
  LEAF_DISTORTION = 'LEAF_DISTORTION',
  UNKNOWN = 'UNKNOWN'
}

export enum SymptomDistribution {
  UNIFORM = 'UNIFORM',
  PATCHY = 'PATCHY',
  BORDER_ONLY = 'BORDER_ONLY',
  RANDOM = 'RANDOM',
  SPREADING = 'SPREADING',
  CLUSTERED = 'CLUSTERED',
  UNKNOWN = 'UNKNOWN'
}

export enum SeverityLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN'
}

// NDVI State - bucketed, not raw numbers
export enum NDVILevel {
  VERY_LOW = 'VERY_LOW',       // < 0.2
  LOW = 'LOW',                 // 0.2 - 0.35
  BELOW_NORMAL = 'BELOW_NORMAL', // 0.35 - 0.45
  NORMAL = 'NORMAL',           // 0.45 - 0.65
  HIGH = 'HIGH',               // 0.65 - 0.8
  VERY_HIGH = 'VERY_HIGH',     // > 0.8
  UNKNOWN = 'UNKNOWN'
}

export enum NDVITrend {
  SHARP_IMPROVING = 'SHARP_IMPROVING',  // > +0.05/week
  IMPROVING = 'IMPROVING',              // +0.02 to +0.05/week
  STABLE = 'STABLE',                    // -0.02 to +0.02/week
  DECLINING = 'DECLINING',              // -0.02 to -0.05/week
  SHARP_DECLINE = 'SHARP_DECLINE',      // < -0.05/week
  UNKNOWN = 'UNKNOWN'
}

export enum VegetationUniformity {
  UNIFORM = 'UNIFORM',                  // CV < 10%
  MODERATE_VARIATION = 'MODERATE_VARIATION', // CV 10-20%
  HIGH_VARIATION = 'HIGH_VARIATION',    // CV > 20%
  UNKNOWN = 'UNKNOWN'
}

// Soil Health State - bucketed
export enum SoilNitrogen {
  VERY_LOW = 'VERY_LOW',       // < 140 kg/ha
  LOW = 'LOW',                 // 140 - 280 kg/ha
  ADEQUATE = 'ADEQUATE',       // 280 - 560 kg/ha
  HIGH = 'HIGH',               // 560 - 700 kg/ha
  EXCESS = 'EXCESS',           // > 700 kg/ha
  UNKNOWN = 'UNKNOWN'
}

export enum SoilPhosphorus {
  VERY_LOW = 'VERY_LOW',       // < 10 kg/ha
  LOW = 'LOW',                 // 10 - 25 kg/ha
  ADEQUATE = 'ADEQUATE',       // 25 - 50 kg/ha
  HIGH = 'HIGH',               // > 50 kg/ha
  UNKNOWN = 'UNKNOWN'
}

export enum SoilPotassium {
  VERY_LOW = 'VERY_LOW',       // < 110 kg/ha
  LOW = 'LOW',                 // 110 - 280 kg/ha
  ADEQUATE = 'ADEQUATE',       // 280 - 400 kg/ha
  HIGH = 'HIGH',               // > 400 kg/ha
  UNKNOWN = 'UNKNOWN'
}

export enum SoilPH {
  STRONGLY_ACIDIC = 'STRONGLY_ACIDIC',       // < 5.0
  MODERATELY_ACIDIC = 'MODERATELY_ACIDIC',   // 5.0 - 6.0
  SLIGHTLY_ACIDIC = 'SLIGHTLY_ACIDIC',       // 6.0 - 6.5
  NEUTRAL = 'NEUTRAL',                       // 6.5 - 7.5
  SLIGHTLY_ALKALINE = 'SLIGHTLY_ALKALINE',   // 7.5 - 8.0
  MODERATELY_ALKALINE = 'MODERATELY_ALKALINE', // 8.0 - 8.5
  STRONGLY_ALKALINE = 'STRONGLY_ALKALINE',   // > 8.5
  UNKNOWN = 'UNKNOWN'
}

export enum SoilOrganicCarbon {
  VERY_LOW = 'VERY_LOW',       // < 0.25%
  LOW = 'LOW',                 // 0.25 - 0.50%
  MEDIUM = 'MEDIUM',           // 0.50 - 0.75%
  HIGH = 'HIGH',               // > 0.75%
  UNKNOWN = 'UNKNOWN'
}

// Water & Weather Stress State
export enum WaterStress {
  NONE = 'NONE',
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  WATERLOGGED = 'WATERLOGGED',
  UNKNOWN = 'UNKNOWN'
}

export enum RainfallRecent {
  NO_RAIN = 'NO_RAIN',         // 0 mm in last 7 days
  LIGHT = 'LIGHT',             // 1-10 mm
  MODERATE = 'MODERATE',       // 10-50 mm
  HEAVY = 'HEAVY',             // 50-100 mm
  EXCESSIVE = 'EXCESSIVE',     // > 100 mm
  UNKNOWN = 'UNKNOWN'
}

export enum TemperatureStress {
  NONE = 'NONE',
  COLD_STRESS = 'COLD_STRESS',           // < 10°C for warm season crops
  MILD_COLD = 'MILD_COLD',               // 10-15°C
  OPTIMAL = 'OPTIMAL',                   // 15-35°C (crop dependent)
  MILD_HEAT = 'MILD_HEAT',               // 35-40°C
  HEAT_STRESS = 'HEAT_STRESS',           // 40-45°C
  EXTREME_HEAT = 'EXTREME_HEAT',         // > 45°C
  UNKNOWN = 'UNKNOWN'
}

export enum HumidityLevel {
  VERY_LOW = 'VERY_LOW',       // < 30%
  LOW = 'LOW',                 // 30-50%
  NORMAL = 'NORMAL',           // 50-70%
  HIGH = 'HIGH',               // 70-85%
  VERY_HIGH = 'VERY_HIGH',     // > 85%
  UNKNOWN = 'UNKNOWN'
}

// Confidence & Risk State (SAFETY LAYER)
export enum DataConfidence {
  VERY_LOW = 'VERY_LOW',       // Only farmer description, no data
  LOW = 'LOW',                 // 1 data source (e.g., only NDVI)
  MEDIUM = 'MEDIUM',           // 2-3 data sources
  HIGH = 'HIGH'                // 4+ data sources with recent timestamps
}

export enum AdvisoryRiskLevel {
  SAFE = 'SAFE',
  CAUTION = 'CAUTION',
  HIGH_RISK = 'HIGH_RISK',
  DO_NOT_ADVISE = 'DO_NOT_ADVISE'
}

// Pest/Disease observation state
export enum PestPresence {
  NONE_OBSERVED = 'NONE_OBSERVED',
  BELOW_ETL = 'BELOW_ETL',
  AT_ETL = 'AT_ETL',
  ABOVE_ETL = 'ABOVE_ETL',
  OUTBREAK = 'OUTBREAK',
  UNKNOWN = 'UNKNOWN'
}

export enum DiseasePresence {
  NONE_OBSERVED = 'NONE_OBSERVED',
  EARLY_SYMPTOMS = 'EARLY_SYMPTOMS',
  ESTABLISHED = 'ESTABLISHED',
  SPREADING = 'SPREADING',
  SEVERE = 'SEVERE',
  UNKNOWN = 'UNKNOWN'
}

// ==================== CANONICAL STATE INTERFACE ====================

export interface CanonicalState {
  // Crop Context (MANDATORY)
  crop_type: CropType;
  crop_stage: CropStage;
  days_after_sowing: DaysAfterSowingBucket;
  days_after_sowing_exact?: number;
  
  // Visual Symptom State
  visual_symptom: VisualSymptom;
  secondary_symptoms: VisualSymptom[];
  symptom_distribution: SymptomDistribution;
  severity: SeverityLevel;
  affected_plant_parts: string[];
  
  // NDVI / Satellite State
  ndvi_level: NDVILevel;
  ndvi_trend: NDVITrend;
  ndvi_value?: number;
  vegetation_uniformity: VegetationUniformity;
  ndvi_data_age_hours?: number;
  
  // Soil Health State
  soil_nitrogen: SoilNitrogen;
  soil_phosphorus: SoilPhosphorus;
  soil_potassium: SoilPotassium;
  soil_ph: SoilPH;
  soil_organic_carbon: SoilOrganicCarbon;
  soil_data_age_days?: number;
  
  // Water & Weather Stress State
  water_stress: WaterStress;
  rainfall_recent: RainfallRecent;
  temperature_stress: TemperatureStress;
  humidity_level: HumidityLevel;
  weather_data_age_hours?: number;
  
  // Pest/Disease State
  pest_presence: PestPresence;
  disease_presence: DiseasePresence;
  suspected_pest?: string;
  suspected_disease?: string;
  
  // Farmer Context
  recent_fertilizer_applied: boolean;
  recent_pesticide_applied: boolean;
  irrigation_type?: string;
  farming_mode?: 'ORGANIC' | 'CONVENTIONAL' | 'INTEGRATED' | 'UNKNOWN';
  
  // Location Context
  district?: string;
  state?: string;
  agro_climatic_zone?: string;
  
  // Confidence & Safety (CRITICAL)
  data_confidence: DataConfidence;
  advisory_risk_level: AdvisoryRiskLevel;
  
  // Data Sources Present (for confidence calculation)
  data_sources: {
    farmer_description: boolean;
    ndvi_data: boolean;
    soil_test: boolean;
    weather_data: boolean;
    image_analysis: boolean;
    historical_data: boolean;
  };
  
  // Timestamps
  state_built_at: string;
  land_id?: string;
  farmer_id?: string;
}

// ==================== MAPPING FUNCTIONS ====================

export function mapDaysToSowingBucket(days: number | undefined): DaysAfterSowingBucket {
  if (days === undefined || days === null || isNaN(days)) return DaysAfterSowingBucket.UNKNOWN;
  if (days <= 7) return DaysAfterSowingBucket.D0_7;
  if (days <= 15) return DaysAfterSowingBucket.D8_15;
  if (days <= 30) return DaysAfterSowingBucket.D16_30;
  if (days <= 60) return DaysAfterSowingBucket.D31_60;
  if (days <= 90) return DaysAfterSowingBucket.D61_90;
  if (days <= 120) return DaysAfterSowingBucket.D91_120;
  if (days <= 180) return DaysAfterSowingBucket.D121_180;
  return DaysAfterSowingBucket.D180_PLUS;
}

export function mapNDVIToLevel(ndvi: number | undefined): NDVILevel {
  if (ndvi === undefined || ndvi === null || isNaN(ndvi)) return NDVILevel.UNKNOWN;
  if (ndvi < 0.2) return NDVILevel.VERY_LOW;
  if (ndvi < 0.35) return NDVILevel.LOW;
  if (ndvi < 0.45) return NDVILevel.BELOW_NORMAL;
  if (ndvi < 0.65) return NDVILevel.NORMAL;
  if (ndvi < 0.8) return NDVILevel.HIGH;
  return NDVILevel.VERY_HIGH;
}

export function mapNDVITrendToEnum(trend: number | string | undefined): NDVITrend {
  if (trend === undefined || trend === null) return NDVITrend.UNKNOWN;
  
  // If string, parse it
  if (typeof trend === 'string') {
    const lowerTrend = trend.toLowerCase();
    if (lowerTrend.includes('sharp') && lowerTrend.includes('improv')) return NDVITrend.SHARP_IMPROVING;
    if (lowerTrend.includes('improv') || lowerTrend.includes('increas')) return NDVITrend.IMPROVING;
    if (lowerTrend.includes('sharp') && lowerTrend.includes('declin')) return NDVITrend.SHARP_DECLINE;
    if (lowerTrend.includes('declin') || lowerTrend.includes('decreas')) return NDVITrend.DECLINING;
    if (lowerTrend.includes('stable') || lowerTrend.includes('steady')) return NDVITrend.STABLE;
    return NDVITrend.UNKNOWN;
  }
  
  // If number (slope per week)
  if (trend > 0.05) return NDVITrend.SHARP_IMPROVING;
  if (trend > 0.02) return NDVITrend.IMPROVING;
  if (trend > -0.02) return NDVITrend.STABLE;
  if (trend > -0.05) return NDVITrend.DECLINING;
  return NDVITrend.SHARP_DECLINE;
}

export function mapNitrogenToEnum(nKgHa: number | undefined): SoilNitrogen {
  if (nKgHa === undefined || nKgHa === null || isNaN(nKgHa)) return SoilNitrogen.UNKNOWN;
  if (nKgHa < 140) return SoilNitrogen.VERY_LOW;
  if (nKgHa < 280) return SoilNitrogen.LOW;
  if (nKgHa < 560) return SoilNitrogen.ADEQUATE;
  if (nKgHa < 700) return SoilNitrogen.HIGH;
  return SoilNitrogen.EXCESS;
}

export function mapPhosphorusToEnum(pKgHa: number | undefined): SoilPhosphorus {
  if (pKgHa === undefined || pKgHa === null || isNaN(pKgHa)) return SoilPhosphorus.UNKNOWN;
  if (pKgHa < 10) return SoilPhosphorus.VERY_LOW;
  if (pKgHa < 25) return SoilPhosphorus.LOW;
  if (pKgHa < 50) return SoilPhosphorus.ADEQUATE;
  return SoilPhosphorus.HIGH;
}

export function mapPotassiumToEnum(kKgHa: number | undefined): SoilPotassium {
  if (kKgHa === undefined || kKgHa === null || isNaN(kKgHa)) return SoilPotassium.UNKNOWN;
  if (kKgHa < 110) return SoilPotassium.VERY_LOW;
  if (kKgHa < 280) return SoilPotassium.LOW;
  if (kKgHa < 400) return SoilPotassium.ADEQUATE;
  return SoilPotassium.HIGH;
}

export function mapPHToEnum(ph: number | undefined): SoilPH {
  if (ph === undefined || ph === null || isNaN(ph)) return SoilPH.UNKNOWN;
  if (ph < 5.0) return SoilPH.STRONGLY_ACIDIC;
  if (ph < 6.0) return SoilPH.MODERATELY_ACIDIC;
  if (ph < 6.5) return SoilPH.SLIGHTLY_ACIDIC;
  if (ph < 7.5) return SoilPH.NEUTRAL;
  if (ph < 8.0) return SoilPH.SLIGHTLY_ALKALINE;
  if (ph < 8.5) return SoilPH.MODERATELY_ALKALINE;
  return SoilPH.STRONGLY_ALKALINE;
}

export function mapOrganicCarbonToEnum(oc: number | undefined): SoilOrganicCarbon {
  if (oc === undefined || oc === null || isNaN(oc)) return SoilOrganicCarbon.UNKNOWN;
  if (oc < 0.25) return SoilOrganicCarbon.VERY_LOW;
  if (oc < 0.50) return SoilOrganicCarbon.LOW;
  if (oc < 0.75) return SoilOrganicCarbon.MEDIUM;
  return SoilOrganicCarbon.HIGH;
}

export function mapRainfallToEnum(mmLast7Days: number | undefined): RainfallRecent {
  if (mmLast7Days === undefined || mmLast7Days === null || isNaN(mmLast7Days)) return RainfallRecent.UNKNOWN;
  if (mmLast7Days === 0) return RainfallRecent.NO_RAIN;
  if (mmLast7Days <= 10) return RainfallRecent.LIGHT;
  if (mmLast7Days <= 50) return RainfallRecent.MODERATE;
  if (mmLast7Days <= 100) return RainfallRecent.HEAVY;
  return RainfallRecent.EXCESSIVE;
}

export function mapTemperatureToStress(tempC: number | undefined, cropType: CropType): TemperatureStress {
  if (tempC === undefined || tempC === null || isNaN(tempC)) return TemperatureStress.UNKNOWN;
  
  // Crop-specific thresholds (simplified)
  const isWarmSeasonCrop = [CropType.RICE, CropType.SUGARCANE, CropType.COTTON, CropType.MAIZE].includes(cropType);
  
  if (isWarmSeasonCrop) {
    if (tempC < 10) return TemperatureStress.COLD_STRESS;
    if (tempC < 15) return TemperatureStress.MILD_COLD;
  } else {
    if (tempC < 5) return TemperatureStress.COLD_STRESS;
    if (tempC < 10) return TemperatureStress.MILD_COLD;
  }
  
  if (tempC <= 35) return TemperatureStress.OPTIMAL;
  if (tempC <= 40) return TemperatureStress.MILD_HEAT;
  if (tempC <= 45) return TemperatureStress.HEAT_STRESS;
  return TemperatureStress.EXTREME_HEAT;
}

export function mapHumidityToEnum(humidity: number | undefined): HumidityLevel {
  if (humidity === undefined || humidity === null || isNaN(humidity)) return HumidityLevel.UNKNOWN;
  if (humidity < 30) return HumidityLevel.VERY_LOW;
  if (humidity < 50) return HumidityLevel.LOW;
  if (humidity < 70) return HumidityLevel.NORMAL;
  if (humidity < 85) return HumidityLevel.HIGH;
  return HumidityLevel.VERY_HIGH;
}

export function mapCropNameToEnum(cropName: string | undefined): CropType {
  if (!cropName) return CropType.UNKNOWN;
  
  const normalized = cropName.toLowerCase().trim();
  
  const cropMap: Record<string, CropType> = {
    'wheat': CropType.WHEAT, 'गहू': CropType.WHEAT, 'गेहूं': CropType.WHEAT,
    'rice': CropType.RICE, 'धान': CropType.RICE, 'भात': CropType.RICE, 'तांदूळ': CropType.RICE,
    'sugarcane': CropType.SUGARCANE, 'ऊस': CropType.SUGARCANE, 'गन्ना': CropType.SUGARCANE,
    'cotton': CropType.COTTON, 'कापूस': CropType.COTTON, 'कपास': CropType.COTTON,
    'soybean': CropType.SOYBEAN, 'सोयाबीन': CropType.SOYBEAN,
    'maize': CropType.MAIZE, 'मका': CropType.MAIZE, 'मक्का': CropType.MAIZE,
    'bajra': CropType.BAJRA, 'बाजरी': CropType.BAJRA, 'बाजरा': CropType.BAJRA,
    'jowar': CropType.JOWAR, 'ज्वारी': CropType.JOWAR, 'ज्वार': CropType.JOWAR, 'sorghum': CropType.JOWAR,
    'groundnut': CropType.GROUNDNUT, 'भुईमूग': CropType.GROUNDNUT, 'मूंगफली': CropType.GROUNDNUT,
    'onion': CropType.ONION, 'कांदा': CropType.ONION, 'प्याज': CropType.ONION,
    'tomato': CropType.TOMATO, 'टोमॅटो': CropType.TOMATO, 'टमाटर': CropType.TOMATO,
    'potato': CropType.POTATO, 'बटाटा': CropType.POTATO, 'आलू': CropType.POTATO,
    'chilli': CropType.CHILLI, 'मिरची': CropType.CHILLI, 'मिर्च': CropType.CHILLI,
    'grapes': CropType.GRAPES, 'द्राक्षे': CropType.GRAPES, 'अंगूर': CropType.GRAPES,
    'pomegranate': CropType.POMEGRANATE, 'डाळिंब': CropType.POMEGRANATE, 'अनार': CropType.POMEGRANATE,
    'banana': CropType.BANANA, 'केळी': CropType.BANANA, 'केला': CropType.BANANA,
    'mango': CropType.MANGO, 'आंबा': CropType.MANGO, 'आम': CropType.MANGO,
    'turmeric': CropType.TURMERIC, 'हळद': CropType.TURMERIC, 'हल्दी': CropType.TURMERIC,
    'ginger': CropType.GINGER, 'आले': CropType.GINGER, 'अदरक': CropType.GINGER,
    'chickpea': CropType.CHICKPEA, 'हरभरा': CropType.CHICKPEA, 'चना': CropType.CHICKPEA,
    'pigeon pea': CropType.PIGEON_PEA, 'तूर': CropType.PIGEON_PEA, 'अरहर': CropType.PIGEON_PEA,
    'mustard': CropType.MUSTARD, 'मोहरी': CropType.MUSTARD, 'सरसों': CropType.MUSTARD,
    'sunflower': CropType.SUNFLOWER, 'सूर्यफूल': CropType.SUNFLOWER,
    'ragi': CropType.RAGI, 'नाचणी': CropType.RAGI, 'रागी': CropType.RAGI
  };
  
  return cropMap[normalized] || CropType.UNKNOWN;
}

export function mapStageToEnum(stage: string | undefined): CropStage {
  if (!stage) return CropStage.UNKNOWN;
  
  const normalized = stage.toLowerCase().trim();
  
  if (normalized.includes('germin') || normalized.includes('उगवण') || normalized.includes('अंकुरण')) return CropStage.GERMINATION;
  if (normalized.includes('seedling') || normalized.includes('रोप')) return CropStage.SEEDLING;
  if (normalized.includes('tiller') || normalized.includes('फुटवा') || normalized.includes('कल्ले')) return CropStage.TILLERING;
  if (normalized.includes('grand') || normalized.includes('वाढ') || normalized.includes('बढ़वार')) return CropStage.GRAND_GROWTH;
  if (normalized.includes('veget') || normalized.includes('वनस्पतिक')) return CropStage.VEGETATIVE;
  if (normalized.includes('flower') || normalized.includes('फुलोरा') || normalized.includes('फूल')) return CropStage.FLOWERING;
  if (normalized.includes('fruit') || normalized.includes('फळ') || normalized.includes('फल')) return CropStage.FRUITING;
  if (normalized.includes('matur') || normalized.includes('पक्व') || normalized.includes('पकाव')) return CropStage.MATURITY;
  if (normalized.includes('harvest') || normalized.includes('कापणी') || normalized.includes('कटाई')) return CropStage.HARVEST;
  
  return CropStage.UNKNOWN;
}

// ==================== VISUAL SYMPTOM MAPPING ====================

export function mapObservationsToSymptom(observations: string[]): { primary: VisualSymptom; secondary: VisualSymptom[] } {
  const symptomMap: Record<string, VisualSymptom> = {
    // Yellowing
    'yellowing': VisualSymptom.GENERAL_YELLOWING,
    'पिवळे': VisualSymptom.GENERAL_YELLOWING,
    'पीला': VisualSymptom.GENERAL_YELLOWING,
    'interveinal': VisualSymptom.INTERVEINAL_YELLOWING,
    'शिरा_मध्ये_पिवळे': VisualSymptom.INTERVEINAL_YELLOWING,
    
    // Burn
    'leaf_edge_burn': VisualSymptom.LEAF_EDGE_BURN,
    'tip_burn': VisualSymptom.LEAF_TIP_BURN,
    'पान_किनार_जळणे': VisualSymptom.LEAF_EDGE_BURN,
    
    // Curling/Rolling
    'curling': VisualSymptom.LEAF_CURLING,
    'rolling': VisualSymptom.LEAF_ROLLING,
    'पान_गुंडाळणे': VisualSymptom.LEAF_CURLING,
    
    // Spots
    'circular_spots': VisualSymptom.SPOTS_CIRCULAR,
    'irregular_spots': VisualSymptom.SPOTS_IRREGULAR,
    'angular_spots': VisualSymptom.SPOTS_ANGULAR,
    'spots': VisualSymptom.SPOTS_IRREGULAR,
    'डाग': VisualSymptom.SPOTS_IRREGULAR,
    
    // Fungal
    'powdery': VisualSymptom.POWDERY_COATING,
    'downy': VisualSymptom.DOWNY_GROWTH,
    'भुरी': VisualSymptom.POWDERY_COATING,
    
    // Structural
    'wilting': VisualSymptom.WILTING,
    'मुरझाना': VisualSymptom.WILTING,
    'सुकणे': VisualSymptom.WILTING,
    'stunted': VisualSymptom.STUNTED_GROWTH,
    'lodging': VisualSymptom.PLANT_LODGING,
    
    // Pest damage
    'boring': VisualSymptom.STEM_BORING,
    'dead_heart': VisualSymptom.DEAD_HEART,
    'white_ear': VisualSymptom.WHITE_EAR,
    'webbing': VisualSymptom.WEBBING,
    'holes': VisualSymptom.HOLES_IN_LEAVES,
    'defoliation': VisualSymptom.DEFOLIATION
  };
  
  const detected: VisualSymptom[] = [];
  
  for (const obs of observations) {
    const normalized = obs.toLowerCase().trim();
    for (const [key, symptom] of Object.entries(symptomMap)) {
      if (normalized.includes(key)) {
        if (!detected.includes(symptom)) {
          detected.push(symptom);
        }
      }
    }
  }
  
  if (detected.length === 0) {
    return { primary: VisualSymptom.UNKNOWN, secondary: [] };
  }
  
  return { primary: detected[0], secondary: detected.slice(1) };
}

/**
 * PHASE-10: Map a symptom string to VisualSymptom enum
 * Used when option selection provides a symptom name as string
 */
export function mapVisualSymptomToEnum(symptom: string | undefined): VisualSymptom {
  if (!symptom) return VisualSymptom.UNKNOWN;
  
  const normalized = symptom.toUpperCase().replace(/-/g, '_').replace(/\s+/g, '_');
  
  // Direct enum match
  if (normalized in VisualSymptom) {
    return VisualSymptom[normalized as keyof typeof VisualSymptom];
  }
  
  // Partial matching for common patterns
  const symptomMappings: Record<string, VisualSymptom> = {
    'YELLOWING': VisualSymptom.GENERAL_YELLOWING,
    'YELLOW': VisualSymptom.GENERAL_YELLOWING,
    'CURLED': VisualSymptom.CURLED_LEAVES,
    'CURLING': VisualSymptom.LEAF_CURLING,
    'SPOTS': VisualSymptom.SPOTS_IRREGULAR,
    'SILVERING': VisualSymptom.SILVERING,
    'WEBBING': VisualSymptom.WEBBING,
    'WILTING': VisualSymptom.WILTING,
    'HOLES': VisualSymptom.HOLES_IN_LEAVES,
    'HONEYDEW': VisualSymptom.HONEYDEW,
    'STICKY': VisualSymptom.STICKY_LEAVES,
    'EDGE_BURN': VisualSymptom.LEAF_EDGE_BURN,
    'STEM': VisualSymptom.STEM_DISCOLORATION,
    'POWDER': VisualSymptom.POWDERY_COATING
  };
  
  for (const [key, value] of Object.entries(symptomMappings)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  return VisualSymptom.UNKNOWN;
}

// ==================== MAIN STATE BUILDER ====================

export interface BuildCanonicalStateInput {
  // Land & Crop Context
  cropName?: string;
  cropStage?: string;
  daysAfterSowing?: number;
  landId?: string;
  farmerId?: string;
  district?: string;
  state?: string;
  
  // Farmer Observations
  farmerObservations?: string[];
  severity?: string;
  symptomDistribution?: string;
  
  // NDVI Data
  ndviValue?: number;
  ndviTrend?: number | string;
  ndviDataTimestamp?: string;
  
  // Soil Data
  nitrogenKgHa?: number;
  phosphorusKgHa?: number;
  potassiumKgHa?: number;
  soilPH?: number;
  organicCarbon?: number;
  soilDataTimestamp?: string;
  
  // Weather Data
  currentTempC?: number;
  humidityPercent?: number;
  rainfallLast7DaysMm?: number;
  weatherDataTimestamp?: string;
  
  // Additional Context
  recentFertilizerApplied?: boolean;
  recentPesticideApplied?: boolean;
  irrigationType?: string;
  farmingMode?: string;
  
  // Image Analysis Results
  imageAnalysisSymptoms?: string[];
  visionConfidence?: number;
}

export function buildCanonicalState(input: BuildCanonicalStateInput): CanonicalState {
  const now = new Date();
  
  // Map crop and stage
  const cropType = mapCropNameToEnum(input.cropName);
  const cropStage = mapStageToEnum(input.cropStage);
  
  // Map observations to symptoms
  const allObservations = [
    ...(input.farmerObservations || []),
    ...(input.imageAnalysisSymptoms || [])
  ];
  const { primary: visualSymptom, secondary: secondarySymptoms } = mapObservationsToSymptom(allObservations);
  
  // Calculate data ages
  const ndviAgeHours = input.ndviDataTimestamp 
    ? (now.getTime() - new Date(input.ndviDataTimestamp).getTime()) / (1000 * 60 * 60)
    : undefined;
  
  const soilAgeDays = input.soilDataTimestamp
    ? (now.getTime() - new Date(input.soilDataTimestamp).getTime()) / (1000 * 60 * 60 * 24)
    : undefined;
  
  const weatherAgeHours = input.weatherDataTimestamp
    ? (now.getTime() - new Date(input.weatherDataTimestamp).getTime()) / (1000 * 60 * 60)
    : undefined;
  
  // Track data sources
  const dataSources = {
    farmer_description: (input.farmerObservations?.length || 0) > 0,
    ndvi_data: input.ndviValue !== undefined,
    soil_test: input.nitrogenKgHa !== undefined || input.phosphorusKgHa !== undefined,
    weather_data: input.currentTempC !== undefined || input.rainfallLast7DaysMm !== undefined,
    image_analysis: (input.imageAnalysisSymptoms?.length || 0) > 0,
    historical_data: false // TODO: implement historical data check
  };
  
  // Calculate data confidence
  const dataConfidence = calculateDataConfidence(dataSources, {
    ndviAgeHours,
    soilAgeDays,
    weatherAgeHours,
    visionConfidence: input.visionConfidence
  });
  
  // Map severity
  let severity = SeverityLevel.UNKNOWN;
  if (input.severity) {
    const s = input.severity.toLowerCase();
    if (s.includes('critical') || s.includes('severe')) severity = SeverityLevel.CRITICAL;
    else if (s.includes('high')) severity = SeverityLevel.HIGH;
    else if (s.includes('moderate') || s.includes('medium')) severity = SeverityLevel.MODERATE;
    else if (s.includes('low') || s.includes('mild')) severity = SeverityLevel.LOW;
    else if (s.includes('none')) severity = SeverityLevel.NONE;
  }
  
  // Map symptom distribution
  let symptomDist = SymptomDistribution.UNKNOWN;
  if (input.symptomDistribution) {
    const d = input.symptomDistribution.toLowerCase();
    if (d.includes('uniform') || d.includes('all')) symptomDist = SymptomDistribution.UNIFORM;
    else if (d.includes('patch') || d.includes('spot')) symptomDist = SymptomDistribution.PATCHY;
    else if (d.includes('border') || d.includes('edge')) symptomDist = SymptomDistribution.BORDER_ONLY;
    else if (d.includes('random') || d.includes('scatter')) symptomDist = SymptomDistribution.RANDOM;
    else if (d.includes('spread')) symptomDist = SymptomDistribution.SPREADING;
    else if (d.includes('cluster')) symptomDist = SymptomDistribution.CLUSTERED;
  }
  
  // Determine advisory risk level
  let advisoryRisk = AdvisoryRiskLevel.SAFE;
  if (dataConfidence === DataConfidence.VERY_LOW) {
    advisoryRisk = AdvisoryRiskLevel.DO_NOT_ADVISE;
  } else if (dataConfidence === DataConfidence.LOW) {
    advisoryRisk = AdvisoryRiskLevel.HIGH_RISK;
  } else if (severity === SeverityLevel.CRITICAL) {
    advisoryRisk = AdvisoryRiskLevel.CAUTION;
  }
  
  return {
    // Crop Context
    crop_type: cropType,
    crop_stage: cropStage,
    days_after_sowing: mapDaysToSowingBucket(input.daysAfterSowing),
    days_after_sowing_exact: input.daysAfterSowing,
    
    // Visual Symptoms
    visual_symptom: visualSymptom,
    secondary_symptoms: secondarySymptoms,
    symptom_distribution: symptomDist,
    severity,
    affected_plant_parts: [],
    
    // NDVI
    ndvi_level: mapNDVIToLevel(input.ndviValue),
    ndvi_trend: mapNDVITrendToEnum(input.ndviTrend),
    ndvi_value: input.ndviValue,
    vegetation_uniformity: VegetationUniformity.UNKNOWN, // TODO: calculate from NDVI std
    ndvi_data_age_hours: ndviAgeHours,
    
    // Soil
    soil_nitrogen: mapNitrogenToEnum(input.nitrogenKgHa),
    soil_phosphorus: mapPhosphorusToEnum(input.phosphorusKgHa),
    soil_potassium: mapPotassiumToEnum(input.potassiumKgHa),
    soil_ph: mapPHToEnum(input.soilPH),
    soil_organic_carbon: mapOrganicCarbonToEnum(input.organicCarbon),
    soil_data_age_days: soilAgeDays,
    
    // Weather
    water_stress: WaterStress.UNKNOWN, // TODO: calculate from soil moisture + rainfall
    rainfall_recent: mapRainfallToEnum(input.rainfallLast7DaysMm),
    temperature_stress: mapTemperatureToStress(input.currentTempC, cropType),
    humidity_level: mapHumidityToEnum(input.humidityPercent),
    weather_data_age_hours: weatherAgeHours,
    
    // Pest/Disease
    pest_presence: PestPresence.UNKNOWN,
    disease_presence: DiseasePresence.UNKNOWN,
    
    // Farmer Context
    recent_fertilizer_applied: input.recentFertilizerApplied || false,
    recent_pesticide_applied: input.recentPesticideApplied || false,
    irrigation_type: input.irrigationType,
    farming_mode: (input.farmingMode?.toUpperCase() as any) || 'UNKNOWN',
    
    // Location
    district: input.district,
    state: input.state,
    
    // Safety
    data_confidence: dataConfidence,
    advisory_risk_level: advisoryRisk,
    data_sources: dataSources,
    
    // Meta
    state_built_at: now.toISOString(),
    land_id: input.landId,
    farmer_id: input.farmerId
  };
}

// ==================== DATA CONFIDENCE CALCULATOR ====================

export function calculateDataConfidence(
  sources: CanonicalState['data_sources'],
  ages: {
    ndviAgeHours?: number;
    soilAgeDays?: number;
    weatherAgeHours?: number;
    visionConfidence?: number;
  }
): DataConfidence {
  let score = 0;
  
  // Base score from data sources present
  if (sources.farmer_description) score += 1;
  if (sources.ndvi_data) score += 2;
  if (sources.soil_test) score += 2;
  if (sources.weather_data) score += 1;
  if (sources.image_analysis) score += 2;
  if (sources.historical_data) score += 1;
  
  // Penalties for stale data
  if (ages.ndviAgeHours !== undefined) {
    if (ages.ndviAgeHours > 168) score -= 2;  // > 7 days
    else if (ages.ndviAgeHours > 72) score -= 1; // > 3 days
  }
  
  if (ages.soilAgeDays !== undefined) {
    if (ages.soilAgeDays > 365) score -= 2;  // > 1 year
    else if (ages.soilAgeDays > 180) score -= 1; // > 6 months
  }
  
  if (ages.weatherAgeHours !== undefined) {
    if (ages.weatherAgeHours > 24) score -= 1;  // > 1 day
    else if (ages.weatherAgeHours > 6) score -= 0.5; // > 6 hours
  }
  
  // Vision confidence bonus/penalty
  if (ages.visionConfidence !== undefined) {
    if (ages.visionConfidence > 0.8) score += 1;
    else if (ages.visionConfidence < 0.5) score -= 1;
  }
  
  // Map score to confidence level
  if (score >= 6) return DataConfidence.HIGH;
  if (score >= 3) return DataConfidence.MEDIUM;
  if (score >= 1) return DataConfidence.LOW;
  return DataConfidence.VERY_LOW;
}

// ==================== PRESCRIPTION GATE ====================

export interface PrescriptionGateResult {
  allowed: boolean;
  reason: string;
  requiredData?: string[];
}

export function checkPrescriptionGate(state: CanonicalState): PrescriptionGateResult {
  // Gate 1: Data confidence must be at least MEDIUM
  if (state.data_confidence === DataConfidence.VERY_LOW) {
    return {
      allowed: false,
      reason: 'Insufficient data for prescription. Need more information.',
      requiredData: ['photo', 'soil_test', 'ndvi']
    };
  }
  
  if (state.data_confidence === DataConfidence.LOW) {
    // Allow diagnosis but not prescription
    return {
      allowed: false,
      reason: 'Can diagnose but cannot prescribe treatment with low confidence.',
      requiredData: getRequiredDataForConfidence(state)
    };
  }
  
  // Gate 2: Advisory risk level check
  if (state.advisory_risk_level === AdvisoryRiskLevel.DO_NOT_ADVISE) {
    return {
      allowed: false,
      reason: 'Safety rules prevent giving advice in this situation.',
      requiredData: []
    };
  }
  
  // Gate 3: Crop type must be known
  if (state.crop_type === CropType.UNKNOWN) {
    return {
      allowed: false,
      reason: 'Cannot prescribe without knowing the crop type.',
      requiredData: ['crop_name']
    };
  }
  
  // Gate 4: Crop stage should be known for many prescriptions
  if (state.crop_stage === CropStage.UNKNOWN) {
    // Allow some prescriptions but flag it
    return {
      allowed: true,
      reason: 'Prescription allowed but accuracy may be limited without growth stage.',
      requiredData: ['sowing_date']
    };
  }
  
  return {
    allowed: true,
    reason: 'All gates passed. Prescription allowed.',
    requiredData: []
  };
}

function getRequiredDataForConfidence(state: CanonicalState): string[] {
  const required: string[] = [];
  
  if (!state.data_sources.ndvi_data) required.push('ndvi_data');
  if (!state.data_sources.soil_test) required.push('soil_test');
  if (!state.data_sources.image_analysis) required.push('photo');
  if (!state.data_sources.weather_data) required.push('weather_data');
  
  return required;
}

// ==================== EXPORTS ====================

export const CanonicalStateBuilder = {
  build: buildCanonicalState,
  calculateConfidence: calculateDataConfidence,
  checkPrescriptionGate,
  
  // Mappers
  mapCrop: mapCropNameToEnum,
  mapStage: mapStageToEnum,
  mapDays: mapDaysToSowingBucket,
  mapNDVI: mapNDVIToLevel,
  mapNDVITrend: mapNDVITrendToEnum,
  mapNitrogen: mapNitrogenToEnum,
  mapPhosphorus: mapPhosphorusToEnum,
  mapPotassium: mapPotassiumToEnum,
  mapPH: mapPHToEnum,
  mapOC: mapOrganicCarbonToEnum,
  mapRainfall: mapRainfallToEnum,
  mapTemperature: mapTemperatureToStress,
  mapHumidity: mapHumidityToEnum,
  mapObservations: mapObservationsToSymptom
};

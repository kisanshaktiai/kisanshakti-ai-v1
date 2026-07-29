// MULTI-MODAL FUSION ENGINE - Type Definitions

// INPUT SOURCES

export interface MultiModalInput {
  session_id: string;
  timestamp: string;
  
  // From NLU Agent (Agent 1)
  text_understanding: TextUnderstanding;
  
  // From Visual Intelligence Agent (Agent 1B)
  visual_analysis?: VisualAnalysis;
  
  // From IoT Sensors (if available)
  sensor_data?: SensorData;
  
  // From Weather API
  weather_data: WeatherData;
  
  // From Satellite Imagery (if available)
  satellite_data?: SatelliteData;
  
  // From Historical Farm Records
  historical_data?: HistoricalData;
}

export interface TextUnderstanding {
  farmer_message: string;
  language: string;
  intent: string;
  entities: {
    crop_code?: string;
    pest_code?: string;
    disease_code?: string;
    symptom_codes?: string[];
    nutrient_deficiency?: string;
  };
  confidence: number;
  ambiguities: string[];
}

export interface VisualAnalysis {
  image_id: string;
  image_timestamp?: string;
  quality_score: number;
  detections: {
    pests?: Array<{ code: string; confidence: number; count: number; location?: string }>;
    diseases?: Array<{ code: string; confidence: number; severity: string; pattern?: string }>;
    symptoms?: Array<{ code: string; confidence: number; description?: string }>;
    beneficial_insects?: Array<{ code: string; count: number }>;
    crop_identified?: { code: string; confidence: number };
  };
  severity_quantification: {
    pest_density?: number;
    disease_severity_index?: number;
    affected_area_percent?: number;
    healthy_tissue_percent?: number;
  };
}

export interface SensorData {
  source: string;
  device_id?: string;
  readings: {
    soil_moisture_percent?: number;
    soil_temperature_c?: number;
    air_temperature_c?: number;
    humidity_percent?: number;
    soil_ph?: number;
    soil_ec?: number;
    light_intensity_lux?: number;
  };
  last_updated: string;
  reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  battery_level?: number;
}

export interface WeatherData {
  current: {
    temperature_c: number;
    humidity_percent: number;
    wind_speed_kmh: number;
    rainfall_last_24h_mm: number;
    rainfall_last_72h_mm?: number;
    uv_index?: number;
    cloud_cover_percent?: number;
  };
  forecast_24h: {
    rain_probability_percent: number;
    rain_amount_mm?: string;
    temperature_max_c: number;
    temperature_min_c?: number;
    wind_max_kmh: number;
    humidity_avg_percent?: number;
  };
  forecast_72h: Array<{
    date: string;
    rain_probability_percent: number;
    temperature_max_c: number;
    temperature_min_c: number;
  }>;
  data_source?: string;
  last_updated?: string;
}

export interface SatelliteData {
  source: 'SENTINEL2' | 'LANDSAT8' | 'PLANET' | 'OTHER';
  ndvi: {
    current: number;
    previous_week: number;
    previous_month?: number;
    trend: 'DECLINING' | 'STABLE' | 'IMPROVING';
    anomaly_detected?: boolean;
  };
  other_indices?: {
    ndwi?: number;  // Water index
    evi?: number;   // Enhanced vegetation
    savi?: number;  // Soil adjusted
  };
  acquisition_date: string;
  cloud_cover_percent: number;
  spatial_resolution_m?: number;
}

export interface HistoricalData {
  sowing_date: string;
  crop_code?: string;
  variety?: string;
  current_crop?: string;           // CONTEXT CONTRACT: Land's current crop
  region_code?: string;            // CONTEXT CONTRACT: District/region
  area_acres?: number;             // CONTEXT CONTRACT: Land area
  growth_stage?: string;           // CONTEXT CONTRACT: Calculated growth stage
  days_since_sowing?: number;      // CONTEXT CONTRACT: Days since sowing
  previous_issues: Array<{
    date: string;
    issue_type: string;
    issue_code?: string;
    treatment: string;
    treatment_code?: string;
    outcome: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
    notes?: string;
  }>;
  soil_test_results?: {
    date: string;
    ph: number;
    organic_carbon_percent: number;
    npk_levels: { n: number; p: number; k: number };
    micronutrients?: { [key: string]: number };
  };
  previous_crops?: Array<{ crop: string; year: number; yield_kg_per_acre?: number }>;
}

// CONFLICT DETECTION

export type ConflictType = 
  | 'TEXT_VS_VISUAL'
  | 'VISUAL_VS_SENSOR'
  | 'FARMER_VS_SATELLITE'
  | 'TEMPORAL_MISMATCH'
  | 'SEVERITY_MISMATCH'
  | 'CROP_IDENTIFICATION_MISMATCH';

export interface DetectedConflict {
  conflict_id: string;
  type: ConflictType;
  sources: string[];
  description: string;
  severity: 'MINOR' | 'MODERATE' | 'CRITICAL';
  resolution_strategy: string;
  data_points: {
    source1: { source: string; value: any };
    source2: { source: string; value: any };
  };
}

export interface ConflictDetectionResult {
  conflicts_found: DetectedConflict[];
  total_conflicts: number;
  critical_conflicts: number;
}

export interface ResolvedConflict extends DetectedConflict {
  resolved_value: any;
  resolution_method: string;
  resolution_explanation: string;
  confidence_after_resolution: number;
}

// CROSS-VALIDATION

export type AgreementLevel = 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICTING';

export interface ValidatedFact {
  fact_id: string;
  fact: string;
  category: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'CROP_STAGE' | 'SEVERITY' | 'ENVIRONMENTAL';
  value?: any;
  confidence: number;
  original_confidence: number;
  confidence_boost: number;
  supporting_sources: string[];
  contradicting_sources: string[];
  agreement_level: AgreementLevel;
  validation_method: string;
}

export interface CrossValidationResult {
  validated_facts: ValidatedFact[];
  total_facts: number;
  strong_agreement_count: number;
  average_confidence: number;
}

// GAP FILLING

export type InferenceMethod = 
  | 'DAYS_AFTER_SOWING'
  | 'NDVI_PATTERN'
  | 'WEATHER_ESTIMATION'
  | 'SYMPTOM_CORRELATION'
  | 'HISTORICAL_PATTERN'
  | 'EXPERT_RULE'
  | 'MULTI_SOURCE_INFERENCE';

export interface FilledGap {
  gap_id: string;
  gap: string;
  gap_type: 'CROP_STAGE' | 'SOIL_MOISTURE' | 'PEST_DENSITY' | 'SEVERITY' | 'ONSET_TIME' | 'OTHER';
  filled_by: string[];
  inferred_value: any;
  confidence: number;
  method: InferenceMethod;
  reasoning: string;
  requires_confirmation: boolean;
}

export interface GapFillingResult {
  gaps_filled: FilledGap[];
  gaps_remaining: string[];
  total_gaps_detected: number;
  total_gaps_filled: number;
}

// UNIFIED CONTEXT

export interface UnifiedCropContext {
  code: string;
  name_en?: string;
  name_mr?: string;
  stage: string;
  stage_code?: string;
  days_after_sowing: number;
  confidence: number;
  source: string;
}

export interface UnifiedProblemContext {
  type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'MIXED' | 'UNKNOWN';
  primary_cause: string;
  primary_cause_code?: string;
  secondary_causes?: string[];
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  severity_score?: number;
  confidence: number;
  affected_area_percent: number;
  progression_status?: 'EARLY' | 'DEVELOPING' | 'ESTABLISHED' | 'SEVERE';
}

export interface UnifiedFieldConditions {
  soil_moisture: {
    value: number | string;
    unit?: string;
    source: string;
    confidence: number;
    status: 'LOW' | 'MODERATE' | 'ADEQUATE' | 'HIGH' | 'WATERLOGGED';
  };
  soil_health: {
    status: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
    ph?: number;
    organic_carbon?: number;
    source: string;
    confidence: number;
  };
  crop_stress_level: {
    level: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
    indicators: string[];
    source: string;
    confidence: number;
  };
}

export interface UnifiedEnvironmentalContext {
  current_weather: {
    temperature_c: number;
    humidity_percent: number;
    wind_speed_kmh: number;
    conditions: string;
  };
  weather_forecast_24h: {
    rain_probability: number;
    suitable_for_spraying: boolean;
    risk_factors: string[];
  };
  season: 'KHARIF' | 'RABI' | 'SUMMER' | 'TRANSITION';
  region_code?: string;
}

export interface UnifiedTemporalContext {
  issue_onset_estimated: string;
  issue_duration_days: number;
  progression_rate: 'RAPID' | 'MODERATE' | 'SLOW' | 'UNKNOWN';
  time_criticality: 'URGENT' | 'MODERATE' | 'LOW';
}

export interface UnifiedContext {
  crop: UnifiedCropContext;
  problem: UnifiedProblemContext;
  field_conditions: UnifiedFieldConditions;
  environmental: UnifiedEnvironmentalContext;
  temporal: UnifiedTemporalContext;
  beneficial_presence?: {
    insects_present: boolean;
    types: string[];
    protection_needed: boolean;
  };
}

// DATA QUALITY ASSESSMENT

export type DataSufficiency = 'SUFFICIENT' | 'MARGINAL' | 'INSUFFICIENT';

export interface DataQualityAssessment {
  overall_quality: number;
  by_source: {
    text_quality: number;
    visual_quality: number;
    sensor_reliability: number;
    weather_confidence: number;
    satellite_freshness: number;
    historical_relevance: number;
  };
  sufficiency: DataSufficiency;
  critical_gaps: string[];
  quality_issues: string[];
  reliability_score: number;
}

// FUSION OUTPUT

export interface FusionRecommendations {
  additional_data_needed: string[];
  photo_required: boolean;
  photo_instructions?: string;
  sensor_check_needed: boolean;
  urgent_escalation: boolean;
  escalation_reason?: string;
  confidence_improvement_possible: boolean;
  suggested_questions?: string[];
}

export interface FusionSummary {
  modalities_present: string[];
  modalities_used: string[];
  overall_confidence: number;
  data_quality_score: number;
  fusion_method: string;
  processing_notes: string[];
}

export interface FusedIntelligence {
  fusion_id: string;
  timestamp: string;
  session_id: string;
  
  // Summary
  fusion_summary: FusionSummary;
  
  // Validated Facts (High Confidence)
  validated_facts: ValidatedFact[];
  
  // Detected & Resolved Conflicts
  conflicts: ResolvedConflict[];
  
  // Filled Gaps
  inferred_information: FilledGap[];
  
  // Unified Context (Ready for Diagnostic Flow)
  unified_context: UnifiedContext;
  
  // Data Quality Assessment
  data_quality: DataQualityAssessment;
  
  // Recommendations for Next Steps
  recommendations: FusionRecommendations;
  
  // Processing Metadata
  processing_metadata: {
    fusion_version: string;
    processing_time_ms: number;
    sources_processed: number;
    algorithms_applied: string[];
  };
}

// TRUST HIERARCHY

export const TRUST_HIERARCHY: { [key: string]: number } = {
  // Most trusted (objective measurements)
  'IoT_Sensor_Data': 1,
  'Visual_Photo_Analysis': 2,
  'Satellite_NDVI': 3,
  'Weather_API': 4,
  
  // Less trusted (subjective/indirect)
  'Historical_Records': 5,
  'Farmer_Text_Description': 6,
  'Estimated_Values': 7,
  'Inferred_Values': 8
};

export const MODALITY_NAMES = {
  text: 'Farmer_Text_Description',
  visual: 'Visual_Photo_Analysis',
  sensor: 'IoT_Sensor_Data',
  weather: 'Weather_API',
  satellite: 'Satellite_NDVI',
  historical: 'Historical_Records'
} as const;

// CONFIDENCE BOOST RULES

export const CONFIDENCE_BOOST_RULES = {
  // When multiple sources agree
  VISUAL_CONFIRMS_TEXT: 0.15,
  SENSOR_CONFIRMS_VISUAL: 0.10,
  SATELLITE_CONFIRMS_VISUAL: 0.05,
  HISTORICAL_PATTERN_MATCH: 0.08,
  
  // Maximum confidence caps
  MAX_CONFIDENCE: 0.98,
  MAX_BOOST_PER_SOURCE: 0.15,
  
  // Minimum thresholds
  MIN_CONFIDENCE_FOR_ACTION: 0.60,
  HIGH_CONFIDENCE_THRESHOLD: 0.80
};

// CROP STAGE INFERENCE RULES

export const CROP_STAGE_RULES: { [cropCode: string]: { [stage: string]: { minDays: number; maxDays: number } } } = {
  'COTTON': {
    'GERMINATION': { minDays: 0, maxDays: 15 },
    'SEEDLING': { minDays: 15, maxDays: 30 },
    'VEGETATIVE': { minDays: 30, maxDays: 60 },
    'SQUARING': { minDays: 60, maxDays: 75 },
    'FLOWERING': { minDays: 75, maxDays: 100 },
    'BOLL_FORMATION': { minDays: 100, maxDays: 130 },
    'BOLL_OPENING': { minDays: 130, maxDays: 160 },
    'MATURITY': { minDays: 160, maxDays: 200 }
  },
  'TOMATO': {
    'GERMINATION': { minDays: 0, maxDays: 10 },
    'SEEDLING': { minDays: 10, maxDays: 25 },
    'VEGETATIVE': { minDays: 25, maxDays: 45 },
    'FLOWERING': { minDays: 45, maxDays: 65 },
    'FRUIT_SET': { minDays: 65, maxDays: 85 },
    'FRUIT_DEVELOPMENT': { minDays: 85, maxDays: 110 },
    'MATURITY': { minDays: 110, maxDays: 140 }
  },
  'RICE': {
    'GERMINATION': { minDays: 0, maxDays: 10 },
    'SEEDLING': { minDays: 10, maxDays: 25 },
    'TILLERING': { minDays: 25, maxDays: 50 },
    'STEM_ELONGATION': { minDays: 50, maxDays: 70 },
    'PANICLE_INITIATION': { minDays: 70, maxDays: 85 },
    'FLOWERING': { minDays: 85, maxDays: 100 },
    'GRAIN_FILLING': { minDays: 100, maxDays: 120 },
    'MATURITY': { minDays: 120, maxDays: 150 }
  }
};

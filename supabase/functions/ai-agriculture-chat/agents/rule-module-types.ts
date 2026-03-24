/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE MODULE MAPPING TYPES - INTEGRATION WITH DECISION GRAPH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Types for mapping NLU output to TypeScript rule modules in:
 * - src/decision-graph/safety-rules/
 * - src/decision-graph/advanced-layers/
 * - src/decision-graph/crop-group-rules/
 */

// ═══════════════════════════════════════════════════════════════════════════
// PRIORITY LEVELS (Matching decision-graph/types.ts)
// ═══════════════════════════════════════════════════════════════════════════

export type RulePriority = 
  | 'P0_EMERGENCY'      // Emergency Override - Banned chemicals, Poisoning risk
  | 'P1_REGULATORY'     // Regulatory Compliance - MRL violations, Legal restrictions
  | 'P2_WEATHER_SAFETY' // Weather & Environmental Safety
  | 'P3_CROP_STAGE'     // Crop Stage Requirements
  | 'P4_ECONOMIC'       // Economic Threshold
  | 'P5_IPM'            // IPM Preference
  | 'P6_OPTIMIZATION';  // Optimization - Best timing

// ═══════════════════════════════════════════════════════════════════════════
// RULE MODULE REFERENCE
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleModuleReference {
  /** Category folder: 'safety-rules', 'advanced-layers', 'crop-group-rules' */
  category: RuleCategory;
  /** Specific module file name (without .ts) */
  moduleFile: string;
  /** Full import path for dynamic loading */
  importPath: string;
  /** Priority level for execution order */
  priority: RulePriority;
  /** Whether this module is required or optional */
  required: boolean;
  /** Reason for including this module */
  reason?: string;
}

export type RuleCategory = 
  | 'safety-rules'
  | 'advanced-layers'
  | 'crop-group-rules'
  | 'intelligence';

// ═══════════════════════════════════════════════════════════════════════════
// AVAILABLE SAFETY RULE MODULES (from src/decision-graph/safety-rules/)
// ═══════════════════════════════════════════════════════════════════════════

export type SafetyRuleModule = 
  | 'chemical-safety-rules'      // P0/P1 - Banned/restricted chemicals
  | 'emergency-rules'            // P0 - Outbreak detection, weather crises
  | 'phi-withdrawal-rules'       // P1 - Pre-harvest intervals, MRL compliance
  | 'weather-action-rules'       // P2 - Rain/temp/wind restrictions
  | 'harvest-quality-rules'      // P3 - Maturity indicators, harvest timing
  | 'regional-seasonal-rules'    // P3 - Kharif/Rabi adaptations
  | 'economic-threshold-rules'   // P4 - ETL/EIL by crop-pest-stage
  | 'ipm-rules'                  // P5 - 6-level IPM ladder
  | 'resistance-management-rules'// P5 - IRAC/FRAC MOA rotation
  | 'nutrient-rules'             // P3/P4 - Soil test, deficiency diagnosis
  | 'water-rules'                // P2/P3 - Irrigation scheduling
  | 'disease-management-rules';  // P3/P4 - Bacterial/fungal, DSI thresholds

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED LAYER MODULES (from src/decision-graph/advanced-layers/)
// ═══════════════════════════════════════════════════════════════════════════

export type AdvancedLayerModule = 
  | 'layer1-plant-demand'
  | 'layer2-root-dominance'
  | 'layer3-nitrogen-efficiency';

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED NLU OUTPUT WITH RULE MAPPING
// ═══════════════════════════════════════════════════════════════════════════

export interface NLUOutputWithRuleMapping {
  // Language & Intent
  language: string;
  intent: NLUIntent;
  
  // Rule Module Identifiers - Maps to .ts files
  requiredRuleModules: RuleModuleReference[];
  
  // Extracted Information for rule evaluation
  entities: ExtractedEntities;
  
  // Field Context Requirements
  contextNeeded: ContextRequirements;
  
  // Confidence & Clarity
  understanding_confidence: number;
  clarity_score: number;
  ambiguities: string[];
  
  // Clarification Questions (if needed)
  clarification_needed: boolean;
  questions: ClarificationQuestionWithType[];
  
  // Safety Flags
  safety_alerts: SafetyAlerts;
}

export type NLUIntent = 
  | 'PEST_PROBLEM'
  | 'DISEASE_PROBLEM'
  | 'NUTRIENT_ISSUE'
  | 'WATER_ISSUE'
  | 'WEATHER_QUERY'
  | 'MARKET_QUERY'
  | 'GENERAL_QUERY'
  | 'EMERGENCY';

export interface ExtractedEntities {
  crop_code?: CropCode;
  crop_variety?: string;
  crop_stage?: CropStageCode;
  pest_code?: PestCode;
  disease_code?: DiseaseCode;
  symptom_codes?: string[];
  severity?: SeverityLevel;
  affected_area_percent?: number;
  duration_days?: number;
  chemical_mentioned?: string;
  treatment_history?: TreatmentHistory;
}

export type CropCode = 
  | 'COTTON' 
  | 'SOYBEAN' 
  | 'RICE' 
  | 'WHEAT' 
  | 'TOMATO' 
  | 'ONION'
  | 'SUGARCANE'
  | 'GROUNDNUT'
  | 'MAIZE'
  | 'CHILLI'
  | string;

export type CropStageCode = 
  | 'GERMINATION'
  | 'SEEDLING'
  | 'VEGETATIVE'
  | 'FLOWERING'
  | 'REPRODUCTIVE'
  | 'MATURITY'
  | 'HARVEST';

export type PestCode = 
  | 'APHID'
  | 'BOLLWORM'
  | 'WHITEFLY'
  | 'FRUIT_BORER'
  | 'PINK_BOLLWORM'
  | 'JASSID'
  | 'THRIPS'
  | 'MEALYBUG'
  | 'RED_SPIDER_MITE'
  | string;

export type DiseaseCode = 
  | 'WILT'
  | 'BLIGHT'
  | 'POWDERY_MILDEW'
  | 'DOWNY_MILDEW'
  | 'LEAF_CURL'
  | 'RUST'
  | 'ROOT_ROT'
  | 'ANTHRACNOSE'
  | string;

export type SeverityLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface TreatmentHistory {
  last_spray_days_ago?: number;
  chemical_used?: string;
  chemical_group?: string;
}

export interface ContextRequirements {
  crop_stage_required: boolean;
  weather_data_required: boolean;
  soil_data_required: boolean;
  photo_required: boolean;
  ndvi_data_helpful: boolean;
  market_data_helpful: boolean;
}

export interface ClarificationQuestionWithType {
  question_id: string;
  /** @deprecated Use question_text_en — LLM translates at runtime */
  question_text_mr: string;
  /** @deprecated Use question_text_en — LLM translates at runtime */
  question_text_hi: string;
  question_text_en: string;
  question_type: QuestionType;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  expected_answer_type: AnswerType;
  options?: QuestionOptionWithLabels[];
  affects_rule_selection: boolean;
  target_entity?: string;
}

export type QuestionType = 
  | 'CROP_ID'
  | 'SYMPTOM_DETAIL'
  | 'SEVERITY'
  | 'TIMING'
  | 'QUANTITY'
  | 'PEST_DENSITY'
  | 'AFFECTED_AREA'
  | 'CROP_STAGE'
  | 'TREATMENT_HISTORY';

export type AnswerType = 'TEXT' | 'NUMBER' | 'CHOICE' | 'YES_NO' | 'PERCENTAGE';

export interface QuestionOptionWithLabels {
  value: string;
  label_mr: string;
  label_hi: string;
  label_en: string;
}

export interface SafetyAlerts {
  emergency_detected: boolean;
  emergency_type?: EmergencyType;
  banned_substance_mentioned: boolean;
  banned_substance_code?: string;
  dangerous_practice_mentioned: boolean;
  dangerous_practice_details?: string;
  immediate_expert_needed: boolean;
  escalation_reason?: string;
}

export type EmergencyType = 
  | 'MASS_PEST_OUTBREAK'
  | 'SEVERE_DISEASE'
  | 'CHEMICAL_POISONING'
  | 'CROP_FAILURE_IMMINENT'
  | 'WEATHER_EMERGENCY';

// ═══════════════════════════════════════════════════════════════════════════
// RULE EVALUATION CONTEXT (Input to Rule Modules)
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleEvaluationContext {
  // From NLU
  crop_code: string;
  crop_stage?: CropStageCode;
  pest_code?: string;
  disease_code?: string;
  infestation_level?: number; // 0-100%
  severity?: SeverityLevel;
  
  // From Supabase/Context
  land_id?: string;
  farmer_id?: string;
  days_after_sowing?: number;
  land_size_acres?: number;
  
  // From Weather API
  weather_state?: string;
  rain_forecast_hours?: number;
  temperature_celsius?: number;
  humidity_percent?: number;
  wind_speed_kmh?: number;
  
  // From Soil Data (CRITICAL: Land-specific soil test data)
  soil_type?: string;
  soil_ph?: number;
  soil_organic_carbon?: number;
  soil_nitrogen_state?: string;    // 'LOW' | 'ADEQUATE' | 'HIGH'
  soil_phosphorus_state?: string;  // 'LOW' | 'ADEQUATE' | 'HIGH'
  soil_potassium_state?: string;   // 'LOW' | 'ADEQUATE' | 'HIGH'
  soil_moisture_percent?: number;
  
  // From NDVI (CRITICAL: Satellite vegetation data)
  ndvi_value?: number;
  ndvi_state?: string;  // 'EXCELLENT' | 'HEALTHY' | 'MODERATE_STRESS' | 'HIGH_STRESS' | 'CRITICAL'
  ndvi_trend?: string;  // 'RISING' | 'STABLE' | 'DECLINING'
  
  // Treatment History
  last_chemical_used?: string;
  chemical_group?: string;
  days_since_last_spray?: number;
  spray_count_this_season?: number;
  
  // Additional metadata
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE EVALUATION RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleEvaluationResult {
  blocked: boolean;
  blockingRule?: BlockingRuleInfo;
  recommendations: RuleRecommendation[];
  warnings: RuleWarning[];
  requirements: RuleRequirement[];
  ipm_level_suggested?: number;
  economic_threshold_exceeded?: boolean;
  safety_compliance: SafetyComplianceStatus;
}

export interface BlockingRuleInfo {
  rule_id: string;
  priority: RulePriority;
  reason: string;
  alternatives?: string[];
}

export interface RuleRecommendation {
  rule_id: string;
  priority: RulePriority;
  recommendation_type: 'CULTURAL' | 'BIOLOGICAL' | 'BOTANICAL' | 'CHEMICAL' | 'INTEGRATED';
  /** @deprecated Use recommendation_text_en — LLM translates at runtime */
  recommendation_text_mr: string;
  /** @deprecated Use recommendation_text_en — LLM translates at runtime */
  recommendation_text_hi: string;
  recommendation_text_en: string;
  products?: RecommendedProduct[];
  timing?: string;
  cost_estimate?: string;
  efficacy_estimate?: string;
}

export interface RecommendedProduct {
  product_name: string;
  dosage: string;
  application_method: string;
  precautions?: string[];
}

export interface RuleWarning {
  rule_id: string;
  warning_type: 'WEATHER' | 'TIMING' | 'RESISTANCE' | 'SAFETY' | 'ECONOMIC';
  /** @deprecated Use warning_text_en — LLM translates at runtime */
  warning_text_mr: string;
  /** @deprecated Use warning_text_en — LLM translates at runtime */
  warning_text_hi: string;
  warning_text_en: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RuleRequirement {
  rule_id: string;
  requirement_type: 'PHI' | 'PPE' | 'TIMING' | 'WAITING_PERIOD' | 'CERTIFICATION';
  /** @deprecated Use requirement_text_en — LLM translates at runtime */
  requirement_text_mr: string;
  /** @deprecated Use requirement_text_en — LLM translates at runtime */
  requirement_text_hi: string;
  requirement_text_en: string;
  is_mandatory: boolean;
}

export interface SafetyComplianceStatus {
  chemical_safety_passed: boolean;
  phi_compliance_checked: boolean;
  weather_safety_passed: boolean;
  overall_safe_to_proceed: boolean;
  pending_checks: string[];
}

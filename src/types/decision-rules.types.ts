/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION RULES TYPE DEFINITIONS - v2.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Complete TypeScript type definitions for the agricultural decision rules system.
 * Based on the Technical & Agronomic Audit Report (January 2026).
 * 
 * @see memory: database/decision-rules-production-schema-v4
 * @see memory: database/scientific-rule-schema-v2
 */

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUP ENUM - 13 Official Groups
// ═══════════════════════════════════════════════════════════════════════════

export enum CanonicalGroup {
  CROP_IDENTITY = "01_crop_identity",
  GROWTH_STAGE = "02_growth_stage",
  PEST = "03_pest",
  DISEASE = "04_disease",
  NUTRITION = "05_nutrition",
  WEED = "06_weed",
  CLARIFICATION = "07_clarification",
  STRESS = "08_stress",
  WEATHER = "09_weather",
  IRRIGATION = "10_irrigation",
  SAFETY = "11_safety",
  MONITORING = "12_monitoring",
  TREATMENT = "13_treatment"
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP STAGE ENUM - Standardized Growth Stages (lowercase)
// ═══════════════════════════════════════════════════════════════════════════

export enum CropStage {
  GERMINATION = "germination",
  SEEDLING = "seedling",
  TILLERING = "tillering",
  VEGETATIVE = "vegetative",
  GRAND_GROWTH = "grand_growth",
  SQUARING = "squaring",
  BOLL_DEVELOPMENT = "boll_development",
  FLOWERING = "flowering",
  PANICLE = "panicle",
  MATURITY = "maturity",
  HARVEST = "harvest",
  POST_HARVEST = "post_harvest",
  ALL = "all"
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION TYPE ENUM - 8 Standard Types
// ═══════════════════════════════════════════════════════════════════════════

export enum ActionType {
  TREATMENT = "treatment",
  URGENT_TREATMENT = "urgent_treatment",
  PREVENTION = "prevention",
  ADVISORY = "advisory",
  SAFETY_GATE = "safety_gate",
  MONITORING = "monitoring",
  CLARIFICATION = "clarification",
  DIAGNOSIS = "diagnosis"
}

// ═══════════════════════════════════════════════════════════════════════════
// BEE TOXICITY ENUM
// ═══════════════════════════════════════════════════════════════════════════

export enum BeeToxicity {
  HIGH = "HIGH",
  MODERATE = "MODERATE",
  LOW = "LOW",
  SAFE = "SAFE"
}

// ═══════════════════════════════════════════════════════════════════════════
// ADDITIONAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IPMLevel = 1 | 2 | 3 | 4;
export type AquaticToxicity = "HIGH" | "MODERATE" | "LOW" | "SAFE";
export type VerificationStatus = "VERIFIED" | "PENDING" | "CONDITIONAL";
export type LeafPosition = "lower_leaves" | "upper_leaves" | "young_leaves" | "all";

// ═══════════════════════════════════════════════════════════════════════════
// CONDITIONS JSON INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface SoilConditions {
  waterlogged?: boolean;
  ph?: "high" | "low" | "neutral";
  salinity?: "high" | "moderate" | "low";
  moisture?: "dry" | "optimal" | "wet" | "saturated";
  type?: string;
}

export interface WeatherConditions {
  humidity?: string;
  temperature?: string;
  rainfall?: string;
  wind?: string;
  cloud_cover?: string;
}

export interface ETLCondition {
  threshold: number | string;
  unit: string;
}

export interface ConditionsJson {
  // Observation-based triggers
  observations?: string[];
  pest_signs?: string[];
  disease_symptoms?: string[];
  visual_symptoms?: string[];
  nutrient_symptoms?: string[];
  
  // Environmental conditions
  leaf_position?: LeafPosition;
  soil_conditions?: SoilConditions;
  weather?: WeatherConditions;
  crop_stage?: string[];
  
  // ETL thresholds
  etl?: ETLCondition;
  
  // Keyword matching (legacy support)
  trigger_keywords?: string[];
  
  // Context flags
  context?: string;
  severity?: "mild" | "moderate" | "severe";
  spread_pattern?: "localized" | "scattered" | "widespread";
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE DECISION RULE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionRule {
  // ─────────────────────────────────────────────────────────────────────────
  // CORE IDENTIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  rule_id: string;
  crop_code: string;
  crop_group: string;
  category: string;
  canonical_group: string;
  
  // ─────────────────────────────────────────────────────────────────────────
  // APPLICABILITY
  // ─────────────────────────────────────────────────────────────────────────
  stage_applicable: string[];
  conditions_json: ConditionsJson;
  condition_code?: string;
  cause: string;
  
  // ─────────────────────────────────────────────────────────────────────────
  // PRIORITIZATION
  // ─────────────────────────────────────────────────────────────────────────
  priority: number;
  confidence_score?: number;
  risk_level?: RiskLevel;
  
  // ─────────────────────────────────────────────────────────────────────────
  // ETL & SAFETY
  // ─────────────────────────────────────────────────────────────────────────
  etl_threshold?: string;
  etl_unit?: string;
  phi_days?: number;
  ipm_level?: IPMLevel;
  bee_toxicity?: BeeToxicity | string;
  aquatic_toxicity?: AquaticToxicity;
  reentry_interval_hours?: number;
  
  // ─────────────────────────────────────────────────────────────────────────
  // TREATMENT DETAILS
  // ─────────────────────────────────────────────────────────────────────────
  active_ingredient?: string;
  chemical_class?: string;
  mode_of_action?: string;
  resistance_group?: string;
  organic_alternative?: string;
  application_method?: string;
  dosage_per_acre?: string;
  water_volume_per_acre?: string;
  
  // ─────────────────────────────────────────────────────────────────────────
  // WEATHER CONDITIONS
  // ─────────────────────────────────────────────────────────────────────────
  weather_dependency?: Record<string, unknown>;
  min_temperature_c?: number;
  max_temperature_c?: number;
  max_wind_speed_kmh?: number;
  rain_delay_hours?: number;
  
  // ─────────────────────────────────────────────────────────────────────────
  // SCIENTIFIC BACKING
  // ─────────────────────────────────────────────────────────────────────────
  scientific_source: string;
  scientific_basis?: string;
  icar_package_ref?: string;
  university_source?: string;
  research_paper_ref?: string;
  
  // ─────────────────────────────────────────────────────────────────────────
  // APPROVAL & VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  expert_approved?: boolean;
  approved_by?: string;
  approval_date?: string;
  field_validated?: boolean;
  validation_trials?: number;
  verification_status?: VerificationStatus;
  
  // ─────────────────────────────────────────────────────────────────────────
  // MULTILINGUAL RESPONSES
  // ─────────────────────────────────────────────────────────────────────────
  response_mr: string;
  response_hi: string;
  response_en: string;
  
  // ─────────────────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────────────────
  action_type: string;
  alternatives?: string[];
  trigger_keywords?: string[];
  is_active: boolean;
  version?: string;
  created_at?: string;
  updated_at?: string;
  supersedes_rule_id?: string;
  deprecated_at?: string;
  deprecation_reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE FILE METADATA INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleFileMetadata {
  crop: string;
  crop_code: string;
  category: string;
  canonical_group: string;
  version: string;
  scientific_source: string;
  last_updated: string;
  total_rules: number;
  description?: string;
}

export interface RuleFile {
  metadata: RuleFileMetadata;
  rules: DecisionRule[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export const CANONICAL_GROUP_NAMES: Record<CanonicalGroup, string> = {
  [CanonicalGroup.CROP_IDENTITY]: "Crop Identity",
  [CanonicalGroup.GROWTH_STAGE]: "Growth Stage",
  [CanonicalGroup.PEST]: "Pest Management",
  [CanonicalGroup.DISEASE]: "Disease Management",
  [CanonicalGroup.NUTRITION]: "Nutrition",
  [CanonicalGroup.WEED]: "Weed Management",
  [CanonicalGroup.CLARIFICATION]: "Clarification",
  [CanonicalGroup.STRESS]: "Stress Management",
  [CanonicalGroup.WEATHER]: "Weather Advisory",
  [CanonicalGroup.IRRIGATION]: "Irrigation",
  [CanonicalGroup.SAFETY]: "Safety",
  [CanonicalGroup.MONITORING]: "Monitoring",
  [CanonicalGroup.TREATMENT]: "Treatment"
};

export const VALID_STAGES = [
  'germination', 'seedling', 'tillering', 'vegetative',
  'grand_growth', 'squaring', 'boll_development', 'flowering',
  'panicle', 'maturity', 'harvest', 'post_harvest', 'all'
] as const;

export const VALID_ACTION_TYPES = [
  'treatment', 'urgent_treatment', 'prevention', 'advisory',
  'safety_gate', 'monitoring', 'clarification', 'diagnosis'
] as const;

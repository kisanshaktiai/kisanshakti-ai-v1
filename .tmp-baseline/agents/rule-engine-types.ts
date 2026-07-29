// RULE ENGINE EXECUTOR - TYPE DEFINITIONS v3.0

import type { 
  DiagnosticHypothesis,
  CauseType 
} from './hypothesis-types.ts';
import type { 
  RuleModuleReference, 
  RulePriority,
  CropCode,
  CropStageCode,
  SeverityLevel 
} from './rule-module-types.ts';

// RULE EXECUTION INPUT

export interface RuleExecutionInput {
  session_id: string;
  farmer_id?: string;
  land_id?: string;
  
  /** Supabase client for DB-driven product lookups */
  supabaseClient?: any;
  
  /** Confirmed hypotheses from Diagnostic Flow Controller */
  confirmed_hypotheses: DiagnosticHypothesis[];
  
  /** Required rule modules from NLU Agent */
  rule_modules_required: RuleModuleReference[];
  
  /** Farmer context */
  farmer_context: FarmerContext;
  
  /** Field conditions */
  field_conditions: FieldConditions;
  
  /** Environmental context */
  environmental_context: EnvironmentalContext;
  
  /** Pest/disease state */
  pest_disease_state: PestDiseaseState;
  
  /** Farmer constraints */
  farmer_constraints: FarmerConstraints;
}

export interface FarmerContext {
  crop_code: CropCode;
  crop_variety?: string;
  crop_stage: CropStageCode;
  days_after_sowing: number;
  land_size_acres: number;
  farming_mode: FarmingMode;
  certification?: 'ORGANIC' | 'GAP' | 'INDIAGAP' | 'NONE';
  export_market?: boolean;
}

export type FarmingMode = 'ORGANIC' | 'CONVENTIONAL' | 'IPM' | 'MIXED';

export interface FieldConditions {
  soil_type: SoilType;
  soil_moisture_percent?: number;
  soil_ph?: number;
  soil_nitrogen_state?: 'LOW' | 'ADEQUATE' | 'HIGH';
  ndvi?: number;
  ndvi_state?: 'EXCELLENT' | 'HEALTHY' | 'MODERATE_STRESS' | 'HIGH_STRESS' | 'CRITICAL';
  last_irrigation_date?: string;
  last_fertilizer_date?: string;
}

export type SoilType = 'SANDY' | 'SANDY_LOAM' | 'LOAMY' | 'CLAY_LOAM' | 'CLAY' | 'BLACK_COTTON' | 'RED' | 'LATERITE';

export interface EnvironmentalContext {
  current_weather: CurrentWeather;
  weather_forecast_24h: WeatherForecast;
  weather_forecast_48h?: WeatherForecast;
  season: 'KHARIF' | 'RABI' | 'SUMMER' | 'PERENNIAL';
  region_code: string;
  state_code?: string;
  district_code?: string;
  agro_climatic_zone?: string;
}

export interface CurrentWeather {
  temperature_c: number;
  humidity_percent: number;
  wind_speed_kmh: number;
  weather_condition?: string;
  uv_index?: number;
}

export interface WeatherForecast {
  rain_probability_percent: number;
  rain_amount_mm?: number;
  temperature_max_c: number;
  temperature_min_c?: number;
  humidity_max_percent?: number;
  wind_speed_max_kmh?: number;
}

export interface PestDiseaseState {
  pest_code?: string;
  pest_name_local?: string;
  disease_code?: string;
  disease_name_local?: string;
  infestation_density?: number;
  affected_area_percent: number;
  severity: SeverityLevel;
  damage_symptoms?: string[];
  first_observed_days_ago?: number;
  spread_rate?: 'SLOW' | 'MODERATE' | 'RAPID';
}

export interface FarmerConstraints {
  budget_available_inr: number;
  previous_treatments: Treatment[];
  equipment_available?: EquipmentType[];
  labor_available?: boolean;
  urgency_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  time_available_for_action?: 'IMMEDIATE' | 'TODAY' | 'THIS_WEEK';
}

export interface Treatment {
  treatment_date: string;
  chemical_name?: string;
  chemical_group?: string;
  dosage?: string;
  outcome?: 'EFFECTIVE' | 'PARTIAL' | 'INEFFECTIVE' | 'UNKNOWN';
}

export type EquipmentType = 'KNAPSACK_SPRAYER' | 'POWER_SPRAYER' | 'BOOM_SPRAYER' | 'DRONE' | 'MANUAL_ONLY';

// DECISION OUTPUT

export interface DecisionOutput {
  decision_id: string;
  timestamp: string;
  session_id: string;
  status: DecisionStatus;
  
  /** Primary decision */
  primary_decision: PrimaryDecision;
  
  /** Secondary/supporting actions */
  secondary_actions: SecondaryAction[];
  
  /** Blocked actions (what NOT to do) */
  blocked_actions: BlockedAction[];
  
  /** Economic assessment */
  economic_assessment: EconomicAssessment;
  
  /** Scientific justification */
  scientific_justification: ScientificJustification[];
  
  /** Rules applied */
  rules_applied: AppliedRule[];
  
  /** Contingency planning */
  contingency_planning: ContingencyPlan;
  
  /** Follow-up schedule */
  follow_up_schedule: FollowUpSchedule;
  
  /** Audit trail */
  audit_trail: AuditTrail;
  
  /** Confidence metrics */
  confidence_metrics: ConfidenceMetrics;
  
  /** Farmer-facing messages (trilingual) */
  farmer_messages?: FarmerMessages;
  
  /** Layered rule result from LayeredRuleEvaluator (for primary_decision recovery) */
  layered_rule_result?: {
    primary_decision?: {
      rule_id: string;
      action_type: string;
      priority: number;
      confidence_score: number;
      action_text?: string;
      reason_text?: string;
      knowledge_text?: string;
      i18n_key?: string;
      response_mr?: string;
      response_hi?: string;
      response_en?: string;
    };
    matched_responses?: Array<{
      rule_id: string;
      cause: string;
      action_type: string;
      priority?: number;
      confidence_score?: number;
      action_text?: string;
      reason_text?: string;
      knowledge_text?: string;
      i18n_key?: string;
      response_mr?: string;
      response_hi?: string;
      response_en?: string;
    }>;
    rules_matched?: number;
    rules_applied?: string[];
  };
  
  /** Matched responses for fallback recovery */
  matched_responses?: Array<{
    rule_id: string;
    cause: string;
    action_type: string;
    priority?: number;
    action_text?: string;
    reason_text?: string;
    knowledge_text?: string;
    i18n_key?: string;
    response_mr?: string;
    response_hi?: string;
    response_en?: string;
  }>;
  
  // ── Backward-compatible fields consumed by validators/narration ──
  /** Overall confidence shorthand */
  confidence?: number;
  /** Legacy alias for economic_assessment */
  economic_analysis?: EconomicAssessment;
  /** Legacy alias for contingency_planning */
  contingency_plan?: ContingencyPlan;
  /** Alternative decisions from conflict resolution */
  alternative_decisions?: PrimaryDecision[];
  /** Blocking rule details (set when status === 'BLOCKED') */
  blocking_rule?: {
    rule_id: string;
    reason: string;
    i18n_key?: string;
    alternatives?: string[];
  };
}

// RuleExecutionInput is defined once at the top of this file (line 26)
// with supabaseClient included. No duplicate needed.

export type DecisionStatus = 
  | 'SUCCESS'
  | 'BLOCKED'
  | 'WEATHER_DELAYED'
  | 'NOT_VIABLE'
  | 'ESCALATED'
  | 'FALLBACK_MODE'
  // Step 1 — GraphTruth-compliant sentinel: the symbolic brain reached the
  | 'NEEDS_MORE_EVIDENCE';

export interface PrimaryDecision {
  action_type: ActionType;
  specific_action: string;
  
  target: {
    pest_code?: string;
    disease_code?: string;
    nutrient_deficiency?: string;
  };
  
  urgency: UrgencyLevel;
  
  timing: ActionTiming;
  
  application_details: ApplicationDetails;
  
  expected_outcomes: ExpectedOutcomes;
  
  ipm_level?: number;
}

export type ActionType = 
  | 'SPRAY_BIOPESTICIDE'
  | 'SPRAY_BOTANICAL'
  | 'SPRAY_CHEMICAL'
  | 'CULTURAL_PRACTICE'
  | 'MECHANICAL_CONTROL'
  | 'BIOLOGICAL_RELEASE'
  | 'FERTILIZER_APPLICATION'
  | 'IRRIGATION'
  | 'HARVEST'
  | 'NO_ACTION'
  | 'MONITOR_ONLY'
  | 'ESCALATE_TO_EXPERT'
  | 'NO_INTERVENTION_REQUIRED'; // GAP #1: Positive terminal diagnosis - this is a SUCCESS state

export type UrgencyLevel = 'IMMEDIATE' | 'WITHIN_24H' | 'WITHIN_48H' | 'WITHIN_WEEK' | 'NON_URGENT';

export interface ActionTiming {
  recommended_start: string;
  recommended_end: string;
  best_time_of_day?: 'EARLY_MORNING' | 'MORNING' | 'EVENING' | 'ANY';
  weather_dependency: boolean;
  weather_requirements?: string;
  reason: string;
  reason_mr?: string;
  reason_hi?: string;
}

export interface ApplicationDetails {
  product_name: string;
  product_name_local?: string;
  product_type: ProductType;
  active_ingredient?: string;
  concentration: string;
  quantity_per_acre: string;
  total_quantity: string;
  water_requirement: string;
  application_method: ApplicationMethod;
  coverage_instructions: string;
  coverage_instructions_mr?: string;
  coverage_instructions_hi?: string;
  
  repeat_application?: RepeatApplication;
  
  precautions?: string[];
  precautions_mr?: string[];
  precautions_hi?: string[];
  
  ppe_required?: string[];
  
  waiting_period_days?: number;
  phi_days?: number;
}

export type ProductType = 'BIOLOGICAL' | 'BOTANICAL' | 'CHEMICAL' | 'ORGANIC' | 'FERTILIZER' | 'GROWTH_REGULATOR';

export type ApplicationMethod = 
  | 'FOLIAR_SPRAY'
  | 'SOIL_DRENCH'
  | 'SEED_TREATMENT'
  | 'BASAL_APPLICATION'
  | 'TOP_DRESSING'
  | 'FERTIGATION'
  | 'HAND_PICKING'
  | 'TRAP_INSTALLATION'
  | 'RELEASE';

export interface RepeatApplication {
  needed: boolean;
  interval_days?: number;
  max_applications_season?: number;
  current_application_number?: number;
}

export interface ExpectedOutcomes {
  efficacy_percent: number;
  time_to_visible_effect_days: string;
  success_indicators: string[];
  success_indicators_mr?: string[];
  success_indicators_hi?: string[];
}

export interface SecondaryAction {
  action: string;
  action_mr?: string;
  action_hi?: string;
  reason: string;
  reason_mr?: string;
  reason_hi?: string;
  timing: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface BlockedAction {
  action: string;
  blocked_by_rule: string;
  priority: string;
  reason: string;
  reason_mr?: string;
  reason_hi?: string;
  regulation_reference?: string;
  alternatives: string[];
}

// ECONOMIC ASSESSMENT

export interface EconomicAssessment {
  treatment_cost_inr: number;
  treatment_cost_per_acre_inr: number;
  expected_loss_without_treatment_inr: number;
  expected_loss_prevented_inr: number;
  net_benefit_inr: number;
  benefit_cost_ratio: number;
  roi_percent: number;
  
  affordability: AffordabilityAssessment;
  
  viability_decision: 'VIABLE' | 'MARGINAL' | 'NOT_VIABLE';
  recommendation: 'STRONGLY_RECOMMENDED' | 'RECOMMENDED' | 'CONDITIONAL' | 'EXPLORE_ALTERNATIVES' | 'NOT_RECOMMENDED';
  
  breakdown?: {
    product_cost_inr: number;
    labor_cost_inr: number;
    equipment_cost_inr: number;
  };
}

export interface AffordabilityAssessment {
  ratio: number;
  assessment: 'AFFORDABLE' | 'MODERATE' | 'HIGH_COST' | 'UNAFFORDABLE';
  farmer_can_afford: boolean;
  budget_remaining_after_treatment_inr?: number;
}

// SCIENTIFIC JUSTIFICATION

export interface ScientificJustification {
  decision: string;
  rule_id: string;
  rationale: string;
  rationale_mr?: string;
  rationale_hi?: string;
  research_basis: string;
  icar_package?: string;
  ipm_level?: number;
  resistance_risk: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
  environmental_impact: 'MINIMAL' | 'LOW' | 'MODERATE' | 'HIGH';
  pollinator_safety?: 'SAFE' | 'CAUTION' | 'AVOID_DURING_FLOWERING';
}

export interface AppliedRule {
  rule_id: string;
  rule_file: string;
  priority: string;
  result: 'BLOCK' | 'WARN' | 'RECOMMEND' | 'REQUIRE' | 'ALLOW';
  confidence: number;
  execution_time_ms?: number;
}

// CONTINGENCY & FOLLOW-UP

export interface ContingencyPlan {
  if_no_improvement: {
    check_after_days: number;
    next_action: string;
    next_action_mr?: string;
    next_action_hi?: string;
    escalation_product?: string;
  };
  
  if_weather_delays: {
    alternative: string;
    alternative_mr?: string;
    alternative_hi?: string;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    max_delay_days: number;
  };
  
  if_beneficial_insects_present?: {
    condition: string;
    modified_action: string;
  };
  
  if_resistance_suspected?: {
    alternative_product: string;
    alternative_group: string;
  };
}

export interface FollowUpSchedule {
  day_1?: FollowUpCheck;
  day_3?: FollowUpCheck;
  day_7?: FollowUpCheck;
  day_14?: FollowUpCheck;
  day_21?: FollowUpCheck;
}

export interface FollowUpCheck {
  check: string;
  check_mr?: string;
  check_hi?: string;
  method: string;
  success_criteria: string;
  success_criteria_mr?: string;
  success_criteria_hi?: string;
  decision_if_unsuccessful?: string;
}

// AUDIT TRAIL

export interface AuditTrail {
  input_hash: string;
  rules_loaded: string[];
  rules_executed: number;
  rules_matched: number;
  rules_version: string;
  execution_time_ms: number;
  determinism_verified: boolean;
  explainability_score: number;
  engine_version: string;
}

export interface ConfidenceMetrics {
  rule_execution_confidence: number;
  input_data_quality: number;
  weather_forecast_confidence: number;
  hypothesis_confidence: number;
  overall_decision_confidence: number;
  uncertainty_factors?: string[];
}

export interface FarmerMessages {
  summary_mr: string;
  summary_hi: string;
  summary_en: string;
  detailed_mr?: string;
  detailed_hi?: string;
  detailed_en?: string;
}

// INTERNAL PROCESSING TYPES

export interface DecisionsByPriority {
  P0_emergency: RuleResult[];
  P1_regulatory: RuleResult[];
  P2_weather_safety: RuleResult[];
  P3_crop_stage: RuleResult[];
  P4_economic: RuleResult[];
  P5_ipm: RuleResult[];
  P6_optimization: RuleResult[];
}

export interface RuleResult {
  rule_id: string;
  priority: RulePriority;
  action: 'BLOCK' | 'DELAY' | 'WARN' | 'RECOMMEND' | 'REQUIRE' | 'ALLOW';
  cause: string;
  reason: string;
  reason_mr?: string;
  reason_hi?: string;
  alternatives?: string[];
  next_safe_window?: string;
  recommendation?: RecommendationDetails;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface RecommendationDetails {
  product_name: string;
  product_type: ProductType;
  dosage: string;
  application_method: string;
  cost_per_acre_inr?: number;
  efficacy_percent?: number;
  ipm_level?: number;
  benefit_cost_ratio?: number;
}

// CROP ECONOMICS DATA

export interface CropEconomicsData {
  crop_code: string;
  expected_yield_quintals_per_acre: number;
  msp_per_quintal_inr: number;
  market_price_per_quintal_inr: number;
  production_cost_per_acre_inr: number;
}

export const CROP_ECONOMICS: Record<string, CropEconomicsData> = {
  'COTTON': {
    crop_code: 'COTTON',
    expected_yield_quintals_per_acre: 8,
    msp_per_quintal_inr: 6620,
    market_price_per_quintal_inr: 7000,
    production_cost_per_acre_inr: 25000
  },
  'SOYBEAN': {
    crop_code: 'SOYBEAN',
    expected_yield_quintals_per_acre: 6,
    msp_per_quintal_inr: 4600,
    market_price_per_quintal_inr: 4800,
    production_cost_per_acre_inr: 18000
  },
  'RICE': {
    crop_code: 'RICE',
    expected_yield_quintals_per_acre: 18,
    msp_per_quintal_inr: 2203,
    market_price_per_quintal_inr: 2400,
    production_cost_per_acre_inr: 22000
  },
  'WHEAT': {
    crop_code: 'WHEAT',
    expected_yield_quintals_per_acre: 12,
    msp_per_quintal_inr: 2275,
    market_price_per_quintal_inr: 2500,
    production_cost_per_acre_inr: 16000
  },
  'TOMATO': {
    crop_code: 'TOMATO',
    expected_yield_quintals_per_acre: 100,
    msp_per_quintal_inr: 800,
    market_price_per_quintal_inr: 1500,
    production_cost_per_acre_inr: 45000
  },
  'ONION': {
    crop_code: 'ONION',
    expected_yield_quintals_per_acre: 80,
    msp_per_quintal_inr: 900,
    market_price_per_quintal_inr: 1200,
    production_cost_per_acre_inr: 35000
  },
  'CHILLI': {
    crop_code: 'CHILLI',
    expected_yield_quintals_per_acre: 25,
    msp_per_quintal_inr: 8000,
    market_price_per_quintal_inr: 9000,
    production_cost_per_acre_inr: 40000
  },
  'SUGARCANE': {
    crop_code: 'SUGARCANE',
    expected_yield_quintals_per_acre: 300,
    msp_per_quintal_inr: 315,
    market_price_per_quintal_inr: 340,
    production_cost_per_acre_inr: 50000
  }
};

// LOSS PERCENTAGE BY SEVERITY

export const SEVERITY_LOSS_PERCENTAGE: Record<SeverityLevel, number> = {
  'LOW': 0.15,      // 15% yield loss if untreated
  'MODERATE': 0.40, // 40% yield loss
  'HIGH': 0.60,     // 60% yield loss
  'CRITICAL': 0.85  // 85% yield loss
};

// ENGINE CONSTANTS

export const RULE_ENGINE_VERSION = '3.0.0';

export const ECONOMIC_THRESHOLDS = {
  MIN_BENEFIT_COST_RATIO_VIABLE: 1.5,
  MIN_BENEFIT_COST_RATIO_MARGINAL: 1.0,
  MAX_AFFORDABLE_RATIO: 0.30,
  MODERATE_AFFORDABLE_RATIO: 0.15,
  STRONGLY_RECOMMENDED_BCR: 2.0
};

export const CONFIDENCE_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.85,
  MEDIUM_CONFIDENCE: 0.70,
  LOW_CONFIDENCE: 0.50,
  MIN_ACCEPTABLE: 0.40
};

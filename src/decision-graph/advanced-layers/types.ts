/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADVANCED DECISION LAYERS - TYPE EXTENSIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Extended types for modern global agronomy, plant physiology, and PGR logic.
 * These EXTEND existing types - they do NOT replace them.
 * 
 * Version: 2.0.0
 * Standards: ICAR (baseline) + Global Modern Practices
 */

import { 
  DecisionInput, 
  Cause, 
  CauseRule, 
  CropStage, 
  NDVIState, 
  NDVITrend,
  SoilOCState,
  WeatherState 
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED CAUSE SYMBOLS (Extend existing Cause enum)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extended causes for advanced decision layers
 * These are string literals to avoid modifying the core enum
 */
export type AdvancedCause = 
  // Layer 1: Plant Demand
  | 'ROOT_PRIORITY_PHASE'
  | 'SHOOT_PRIORITY_PHASE'
  | 'PLANT_SIGNAL_NITROGEN_NOT_NEEDED'
  | 'PLANT_SIGNAL_ROOT_SUPPORT_NEEDED'
  | 'NDVI_STAGNATION_ROOT_CAUSE'
  
  // Layer 2: Root Dominance
  | 'EARLY_ROOT_DEVELOPMENT'
  | 'ROOT_PHOSPHORUS_CRITICAL'
  | 'ROOT_CALCIUM_NEEDED'
  | 'ROOT_BIOSTIMULANT_WINDOW'
  
  // Layer 3: Nitrogen Efficiency
  | 'NITROGEN_LEACHING_RISK'
  | 'NITROGEN_VOLATILIZATION_RISK'
  | 'NITROGEN_EFFICIENCY_LOW'
  | 'NITROGEN_TIMING_OPTIMAL'
  | 'NITROGEN_SPLIT_REQUIRED'
  
  // Layer 4: Stress Anticipation
  | 'HEAT_STRESS_ANTICIPATED'
  | 'COLD_STRESS_ANTICIPATED'
  | 'DROUGHT_STRESS_ANTICIPATED'
  | 'WATERLOGGING_ANTICIPATED'
  | 'PRE_STRESS_PROTECTION_WINDOW'
  
  // Layer 5: Soil Microbiology
  | 'MICROBIOLOGY_PRIORITY'
  | 'PSB_RECOMMENDED'
  | 'KMB_RECOMMENDED'
  | 'MYCORRHIZA_BENEFICIAL'
  | 'TRICHODERMA_PRIORITY'
  | 'ZINC_SOLUBILIZER_NEEDED'
  
  // Layer 6: PGR Governance
  | 'AUXIN_SAFE_WINDOW'
  | 'CYTOKININ_SAFE_WINDOW'
  | 'GIBBERELLIN_SAFE_WINDOW'
  | 'PGR_BLOCKED_STRESS'
  | 'PGR_BLOCKED_NUTRITION'
  | 'ETHYLENE_SUPPRESSION_NEEDED';

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED ACTION SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════

export type AdvancedAction =
  // Root Support Actions
  | 'APPLY_HUMIC_ACID'
  | 'APPLY_SEAWEED_EXTRACT'
  | 'APPLY_CALCIUM'
  | 'APPLY_ROOT_BIOSTIMULANT'
  
  // Microbiology Actions
  | 'APPLY_PSB'           // Phosphate Solubilizing Bacteria
  | 'APPLY_KMB'           // Potash Mobilizing Bacteria
  | 'APPLY_ZINC_SOLUBILIZER'
  | 'APPLY_MYCORRHIZA'
  
  // Nitrogen Efficiency Actions
  | 'DELAY_NITROGEN'
  | 'SPLIT_NITROGEN'
  | 'USE_SLOW_RELEASE_N'
  | 'FOLIAR_N_SPRAY'
  
  // Stress Anticipation Actions
  | 'APPLY_ANTI_STRESS_BIOSTIMULANT'
  | 'APPLY_OSMOLYTE_SPRAY'
  | 'APPLY_SILICA'
  | 'APPLY_PROLINE'
  
  // PGR Actions (Strictly Controlled)
  | 'APPLY_AUXIN'
  | 'APPLY_CYTOKININ'
  | 'APPLY_GIBBERELLIN'
  | 'APPLY_ETHYLENE_INHIBITOR'
  | 'BLOCK_PGR';

// ═══════════════════════════════════════════════════════════════════════════
// EXTENDED INPUT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extended decision input with advanced parameters
 * Adds plant physiology and yield optimization fields
 */
export interface AdvancedDecisionInput extends DecisionInput {
  // ─────────────────────────────────────────────────────────────────────────
  // NDVI ANALYTICS (Plant Signal Dependency)
  // ─────────────────────────────────────────────────────────────────────────
  ndvi_growth_rate?: number;          // Daily growth rate (actual)
  ndvi_expected_growth_rate?: number; // Expected growth rate for stage
  ndvi_7day_trend?: NDVITrend;        // Longer term trend
  ndvi_deviation_percent?: number;    // Deviation from expected
  
  // ─────────────────────────────────────────────────────────────────────────
  // CROP LIFE PHASE (Root vs Shoot Priority)
  // ─────────────────────────────────────────────────────────────────────────
  crop_life_percent?: number;         // % of total crop life elapsed
  crop_total_days?: number;           // Total crop duration
  
  // ─────────────────────────────────────────────────────────────────────────
  // WEATHER FORECAST (Stress Anticipation)
  // ─────────────────────────────────────────────────────────────────────────
  weather_forecast_5day?: WeatherState[];
  rainfall_forecast_mm?: number;       // Next 3-5 days
  temp_max_forecast?: number;
  temp_min_forecast?: number;
  
  // ─────────────────────────────────────────────────────────────────────────
  // SOIL BIOLOGY STATUS
  // ─────────────────────────────────────────────────────────────────────────
  chemical_response_efficiency?: number; // 0-1: How well chemicals work
  biological_activity_score?: number;    // 0-1: Soil biological health
  
  // ─────────────────────────────────────────────────────────────────────────
  // CURRENT STRESS STATE
  // ─────────────────────────────────────────────────────────────────────────
  active_stress?: string[];           // Currently active stress types
  stress_severity?: 'none' | 'mild' | 'moderate' | 'severe';
  
  // ─────────────────────────────────────────────────────────────────────────
  // NUTRITION VALIDATION (For PGR Governance)
  // ─────────────────────────────────────────────────────────────────────────
  nutrition_status?: 'deficient' | 'adequate' | 'optimal';
  recent_fertilizer_days?: number;    // Days since last fertilizer
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED RULE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rule category extended for advanced layers
 */
export type AdvancedRuleCategory = 
  | 'plant_demand'       // Layer 1
  | 'root_dominance'     // Layer 2  
  | 'nitrogen_efficiency' // Layer 3
  | 'stress_anticipation' // Layer 4
  | 'soil_microbiology'  // Layer 5
  | 'pgr_governance';    // Layer 6

/**
 * Advanced rule with extended metadata
 */
export interface AdvancedCauseRule {
  rule_id: string;
  layer: 1 | 2 | 3 | 4 | 5 | 6;
  category: AdvancedRuleCategory;
  crop_code: string | 'ALL_CROPS';
  stage_applicable: CropStage[];
  
  /**
   * Condition function using advanced input
   */
  conditions: (input: AdvancedDecisionInput) => boolean;
  
  /**
   * Safety gate - must return true for rule to fire
   * Used to enforce ICAR baseline constraints
   */
  safety_gate?: (input: AdvancedDecisionInput) => boolean;
  
  /**
   * Block conditions - if any return true, rule is blocked
   */
  block_conditions?: ((input: AdvancedDecisionInput) => boolean)[];
  
  cause: AdvancedCause;
  priority: number;
  
  // Yield impact
  yield_impact_percent?: {
    min: number;
    max: number;
  };
  
  // Scientific backing
  scientific_source: string;
  scientific_basis: string;
  global_practice_ref?: string;  // International best practice reference
  icar_alignment: string;        // How this aligns with ICAR (mandatory)
}

// ═══════════════════════════════════════════════════════════════════════════
// PGR GOVERNANCE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Plant Growth Regulator types
 */
export enum PGRType {
  AUXIN = 'AUXIN',
  CYTOKININ = 'CYTOKININ',
  GIBBERELLIN = 'GIBBERELLIN',
  ETHYLENE_INHIBITOR = 'ETHYLENE_INHIBITOR',
  ABSCISIC_ACID = 'ABSCISIC_ACID'
}

/**
 * PGR safety status
 */
export interface PGRSafetyStatus {
  pgr_type: PGRType;
  is_safe: boolean;
  blocked_reason?: string;
  required_conditions: string[];
  crop_stages_allowed: CropStage[];
  stress_blocking: boolean;
  nutrition_requirement: 'deficient' | 'adequate' | 'optimal';
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Root dominance phase threshold (% of crop life)
 * First 25-30% of crop life prioritizes root development
 */
export const ROOT_DOMINANCE_THRESHOLD = 0.30; // 30% of crop life

/**
 * Soil organic carbon thresholds for microbiology priority
 */
export const SOIL_OC_THRESHOLDS = {
  LOW: 0.5,      // Below this, microbiology is priority
  MEDIUM: 0.75,
  HIGH: 1.0
} as const;

/**
 * Chemical response efficiency threshold
 * Below this, prefer biological solutions
 */
export const CHEMICAL_EFFICIENCY_THRESHOLD = 0.6;

/**
 * NDVI growth rate thresholds
 */
export const NDVI_GROWTH_RATE_THRESHOLDS = {
  STAGNANT: 0.0005,  // Below this is stagnant
  SLOW: 0.001,
  NORMAL: 0.002,
  VIGOROUS: 0.003
} as const;

/**
 * Rainfall thresholds for nitrogen decisions (mm in next 3 days)
 */
export const RAINFALL_THRESHOLDS = {
  LIGHT: 10,
  MODERATE: 25,
  HEAVY: 50   // Delay nitrogen above this
} as const;

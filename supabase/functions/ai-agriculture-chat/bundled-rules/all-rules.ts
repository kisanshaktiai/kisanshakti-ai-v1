/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED RULES - LIGHTWEIGHT STUB (v1.0.0-stub)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This is a lightweight stub to prevent bundle timeout.
 * Rules are loaded from canonical files at runtime.
 * 
 * ARCHITECTURE: Database-first loading with canonical fallback.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface BundledRule {
  rule_id: string;
  // Stage-1 migration sidecars (additive; populated by loader from generated
  // columns + version_hash trigger). Optional so legacy fixtures still type-check.
  rule_id_lc?: string;
  version_hash?: string;
  updated_at?: string;
  category: string;
  crop_code: string;
  crop_group?: string;
  canonical_group?: string;
  stage_applicable: string[];
  conditionCode: string;
  conditions_json?: Record<string, unknown>;
  cause: string;
  priority: number;
  confidence_score?: number;
  scientific_source: string;
  scientific_basis: string;
  icar_package?: string;
  icar_package_ref?: string;
  cause_confidence?: number;
  // REMOVED: trigger_keywords - column was DROPPED per SSOT architecture
  // trigger_keywords now lives INSIDE conditions_json: conditions_json.trigger_keywords
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: New Response Contract Fields
  // ═══════════════════════════════════════════════════════════════════════════
  action_text?: string;      // What to do
  reason_text?: string;      // Why (cause, risk, logic)
  knowledge_text?: string;   // Agronomic / scientific basis
  i18n_key?: string;         // Centralized i18n key for translations
  
  // FIX 34: response_mr/hi/en REMOVED — columns dropped from DB per SSOT architecture
  
  alternatives?: string[];
  // Standard 8 action types per Jan 2026 Audit
  // PHASE 3: Strict 5-type enum aligned with database canonical values
  action_type?: 'RECOMMEND' | 'MONITOR' | 'BLOCK' | 'NO_ACTION_REQUIRED' | 'URGENT_ACTION';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Graph Control Fields
  // ═══════════════════════════════════════════════════════════════════════════
  blocks_rule_ids?: string[];      // Rules this rule blocks from firing
  prerequisite_rule_ids?: string[]; // Rules that must fire before this one
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Temporal Constraint Fields
  // ═══════════════════════════════════════════════════════════════════════════
  crop_age_days_min?: number;      // Minimum crop age for rule applicability
  crop_age_days_max?: number;      // Maximum crop age for rule applicability
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: ETL Safety Gate Fields
  // ═══════════════════════════════════════════════════════════════════════════
  etl_applicable?: boolean;        // Whether ETL checking applies to this rule
  etl_value_min?: number;          // Minimum threshold for pest count
  etl_value_max?: number;          // Maximum threshold (spray required above this)
  
  // Safety fields
  phi_days?: number;
  bee_toxicity?: 'HIGH' | 'MODERATE' | 'LOW' | 'SAFE';
  ipm_level?: 1 | 2 | 3 | 4 | 5;
  etl_threshold?: string;          // Legacy text-based threshold (deprecated)
  active_ingredient?: string;
  organic_alternative?: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6: Safety Enhancement Fields
  // ═══════════════════════════════════════════════════════════════════════════
  farmer_safety_level?: 'SAFE' | 'CAUTION' | 'EXPERT_ONLY'; // DB stores TEXT, not integer
  resistance_group?: string;       // Resistance management group (e.g., IRAC Group 1B)
  mode_of_action?: string;         // Chemical mode of action for rotation
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVATION LAYER: Pre-filter fields from decision_rules table
  // ═══════════════════════════════════════════════════════════════════════════
  required_observation_category?: string[] | null;  // PEST, DISEASE, NUTRIENT, etc.
  required_plant_part?: string[] | null;            // STEM, LEAF, ROOT, WHOLE, etc.
  
  is_active?: boolean;
}

export interface BundleMetadata {
  totalRules: number;
  generatedAt: string;
  version: string;
  rulesByCategory: Record<string, number>;
  rulesByCropGroup: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// STUB DATA - Rules loaded at runtime from canonical files
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_GROUP_RULES: Record<string, BundledRule[]> = {};
export const SAFETY_RULES: BundledRule[] = [];
export const ADVANCED_RULES: BundledRule[] = [];
export const INTELLIGENCE_RULES: BundledRule[] = [];

export const BUNDLE_METADATA: BundleMetadata = {
  totalRules: 0,
  generatedAt: new Date().toISOString(),
  version: '1.0.0-stub',
  rulesByCategory: {},
  rulesByCropGroup: {}
};

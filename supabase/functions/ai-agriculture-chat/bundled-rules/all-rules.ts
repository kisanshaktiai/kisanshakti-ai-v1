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
  trigger_keywords?: string[];
  response_mr?: string;
  response_hi?: string;
  response_en?: string;
  alternatives?: string[];
  // Standard 8 action types per Jan 2026 Audit
  action_type?: 'treatment' | 'urgent_treatment' | 'prevention' | 'advisory' | 
                'safety_gate' | 'monitoring' | 'clarification' | 'diagnosis';
  // Safety fields
  phi_days?: number;
  bee_toxicity?: 'HIGH' | 'MODERATE' | 'LOW' | 'SAFE';
  ipm_level?: 1 | 2 | 3 | 4;
  etl_threshold?: string;
  active_ingredient?: string;
  organic_alternative?: string;
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

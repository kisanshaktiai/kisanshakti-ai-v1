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
  stage_applicable: string[];
  conditionCode: string;
  cause: string;
  priority: number;
  scientific_source: string;
  scientific_basis: string;
  icar_package?: string;
  cause_confidence?: number;
  trigger_keywords?: string[];
  response_mr?: string;
  response_hi?: string;
  response_en?: string;
  alternatives?: string[];
  action_type?: 'BLOCK' | 'WARN' | 'RECOMMEND' | 'DELAY' | 'MONITOR';
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED AGRICULTURAL RULES - SERVER-SIDE ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * IMPORTANT: This file provides rule data for the edge function.
 * Rules are loaded from embedded data (bundled at build time).
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
  economic_tier?: string;
  estimated_cost_inr?: number;
}

export interface BundleMetadata {
  totalRules: number;
  generatedAt: string;
  version: string;
  rulesByCategory: Record<string, number>;
  rulesByCropGroup: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLED RULES DATA - Placeholder until bundle-rules is run
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_GROUP_RULES: Record<string, BundledRule[]> = {};
export const SAFETY_RULES: BundledRule[] = [];
export const ADVANCED_RULES: BundledRule[] = [];
export const INTELLIGENCE_RULES: BundledRule[] = [];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getAllCropGroupRules(): BundledRule[] {
  return Object.values(CROP_GROUP_RULES).flat();
}

export function getAllSafetyRules(): BundledRule[] {
  return SAFETY_RULES;
}

export function getAllRules(): BundledRule[] {
  return [
    ...getAllCropGroupRules(),
    ...SAFETY_RULES,
    ...ADVANCED_RULES,
    ...INTELLIGENCE_RULES,
  ];
}

export function getRuleCount(): number {
  return getAllRules().length;
}

export const BUNDLE_METADATA: BundleMetadata = {
  totalRules: 0,
  generatedAt: new Date().toISOString(),
  version: "0.0.0-placeholder",
  rulesByCategory: {},
  rulesByCropGroup: {},
};

// Log bundle status
console.warn('[BundledRules] ⚠️ Using placeholder bundle - run "npm run bundle-rules" to generate actual rules');

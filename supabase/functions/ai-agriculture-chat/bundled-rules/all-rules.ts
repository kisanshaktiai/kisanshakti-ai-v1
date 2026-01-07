/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED AGRICULTURAL RULES - LIGHTWEIGHT STUB
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This is a minimal stub that provides type definitions and empty structures.
 * Actual rules are loaded from the database at runtime to keep bundle size small.
 * 
 * For local development, run: npm run bundle-rules
 * Rules are stored in the database and fetched via the rule loader.
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
  metadata?: {
    version?: string;
    author?: string;
    knowledge_layer?: string;
  };
  variety_filter?: {
    include?: string[];
    exclude?: string[];
  };
}

export interface BundleMetadata {
  totalRules: number;
  generatedAt: string;
  version: string;
  rulesByCategory: Record<string, number>;
  rulesByCropGroup: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY RULE STRUCTURES (Runtime loaded from database)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crop group rules - empty at compile time, populated at runtime
 * Categories: cereals, pulses, vegetables, fiber, oilseeds, fruits, spices, 
 * fodder, plantation, sugarcane, micronutrients, post_harvest, organic_farming, soil_management
 */
export const CROP_GROUP_RULES: Record<string, BundledRule[]> = {};

/**
 * Safety rules - empty at compile time, populated at runtime
 * Categories: chemical_safety, emergency, phi_withdrawal, economic_threshold, 
 * ipm, crop_specific_ipm, resistance_management, harvest_quality, nutrient, 
 * water, weather_action, regional_seasonal, disease_management, soil_ph_interaction
 */
export const SAFETY_RULES: Record<string, BundledRule[]> = {};

/**
 * Advanced rules - empty at compile time
 */
export const ADVANCED_RULES: BundledRule[] = [];

/**
 * Intelligence rules - empty at compile time
 */
export const INTELLIGENCE_RULES: BundledRule[] = [];

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLE METADATA
// ═══════════════════════════════════════════════════════════════════════════

export const BUNDLE_METADATA: BundleMetadata = {
  totalRules: 0,
  generatedAt: new Date().toISOString(),
  version: "1.0.0-stub",
  rulesByCategory: {},
  rulesByCropGroup: {}
};

export const BUNDLE_CHECKSUM = "stub-checksum";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all crop group rules as a flat array
 */
export function getAllCropGroupRules(): BundledRule[] {
  const allRules: BundledRule[] = [];
  for (const rules of Object.values(CROP_GROUP_RULES)) {
    allRules.push(...rules);
  }
  return allRules;
}

/**
 * Get all safety rules as a flat array
 */
export function getAllSafetyRules(): BundledRule[] {
  const allRules: BundledRule[] = [];
  for (const rules of Object.values(SAFETY_RULES)) {
    allRules.push(...rules);
  }
  return allRules;
}

/**
 * Get all rules as a flat array
 * Returns empty array in stub mode - rules loaded from database at runtime
 */
export function getAllRules(): BundledRule[] {
  const allRules: BundledRule[] = [];
  
  // Collect crop group rules
  for (const rules of Object.values(CROP_GROUP_RULES)) {
    allRules.push(...rules);
  }
  
  // Collect safety rules
  for (const rules of Object.values(SAFETY_RULES)) {
    allRules.push(...rules);
  }
  
  // Add advanced and intelligence rules
  allRules.push(...ADVANCED_RULES);
  allRules.push(...INTELLIGENCE_RULES);
  
  return allRules;
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string): BundledRule[] {
  const allRules = getAllRules();
  return allRules.filter(rule => rule.category === category);
}

/**
 * Get rules by crop code
 */
export function getRulesByCrop(cropCode: string): BundledRule[] {
  const allRules = getAllRules();
  return allRules.filter(rule => 
    rule.crop_code === cropCode || 
    rule.crop_code.startsWith('ALL_')
  );
}

/**
 * Validate bundle integrity
 * Always returns true for stub - actual validation happens at runtime
 */
export function validateBundle(): boolean {
  return true;
}

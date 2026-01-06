/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED AGRICULTURAL RULES - RUNTIME LOADER FOR EDGE FUNCTION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file loads rules at runtime in the Deno Edge Function environment.
 * It serializes condition functions from the source rule files.
 * 
 * SECURITY: This file runs SERVER-SIDE ONLY in Supabase Edge Functions.
 * The raw rules and condition logic are NEVER exposed to the frontend.
 * 
 * Total expected rules: 2000+
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
// RULE SERIALIZATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialize a condition function to a string that can be reconstructed
 * Converts enum references to string literals for Deno compatibility
 */
function serializeCondition(fn: unknown): string {
  if (typeof fn !== 'function') return '() => false';
  
  let fnString = fn.toString();
  
  // Replace enum values with string literals
  const enumReplacements: [RegExp, string][] = [
    // Soil states
    [/SoilNState\.(\w+)/g, "'$1'"],
    [/SoilPState\.(\w+)/g, "'$1'"],
    [/SoilKState\.(\w+)/g, "'$1'"],
    [/SoilPHState\.(\w+)/g, "'$1'"],
    [/SoilMoistureState\.(\w+)/g, "'$1'"],
    [/SoilZincState\.(\w+)/g, "'$1'"],
    [/SoilOCState\.(\w+)/g, "'$1'"],
    [/SoilTexture\.(\w+)/g, "'$1'"],
    
    // NDVI states
    [/NDVIState\.(\w+)/g, "'$1'"],
    [/NDVITrend\.(\w+)/g, "'$1'"],
    
    // Weather states
    [/WeatherState\.(\w+)/g, "'$1'"],
    
    // Crop stages
    [/CropStage\.(\w+)/g, "'$1'"],
    [/WheatSubStage\.(\w+)/g, "'$1'"],
    [/RiceSubStage\.(\w+)/g, "'$1'"],
    [/CottonSubStage\.(\w+)/g, "'$1'"],
    [/SugarcaneSubStage\.(\w+)/g, "'$1'"],
    
    // Other enums
    [/Cause\.(\w+)/g, "'$1'"],
    [/Action\.(\w+)/g, "'$1'"],
    [/PriorityLevel\.(\w+)/g, "'$1'"],
    [/IPMLevel\.(\w+)/g, "'$1'"],
    [/CropGroup\.(\w+)/g, "'$1'"],
  ];
  
  for (const [pattern, replacement] of enumReplacements) {
    fnString = fnString.replace(pattern, replacement);
  }
  
  // Add optional chaining for nested properties
  fnString = fnString.replace(/input\.soil_states\./g, 'input.soil_states?.');
  fnString = fnString.replace(/input\.weather_forecast\./g, 'input.weather_forecast?.');
  fnString = fnString.replace(/input\.ndvi_analytics\./g, 'input.ndvi_analytics?.');
  
  return fnString;
}

/**
 * Convert a raw rule to a bundled rule with serialized condition
 */
function bundleRule(rule: Record<string, unknown>): BundledRule {
  const stageApplicable = (rule.stage_applicable as unknown[]) || [];
  
  return {
    rule_id: String(rule.rule_id || ''),
    category: String(rule.category || ''),
    crop_code: String(rule.crop_code || ''),
    stage_applicable: stageApplicable.map(s => String(s)),
    conditionCode: serializeCondition(rule.conditions),
    cause: String(rule.cause || ''),
    priority: Number(rule.priority) || 0,
    scientific_source: String(rule.scientific_source || ''),
    scientific_basis: String(rule.scientific_basis || ''),
    icar_package: rule.icar_package ? String(rule.icar_package) : undefined,
    cause_confidence: rule.cause_confidence ? Number(rule.cause_confidence) : undefined,
    economic_tier: rule.economic_tier ? String(rule.economic_tier) : undefined,
    estimated_cost_inr: rule.estimated_cost_inr ? Number(rule.estimated_cost_inr) : undefined,
    metadata: rule.metadata as BundledRule['metadata'],
    variety_filter: rule.variety_filter as BundledRule['variety_filter'],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EMBEDDED RULES DATA - Loaded from universal rules in edge function
// ═══════════════════════════════════════════════════════════════════════════

// Import universal rules that are already in the edge function
import { 
  UNIVERSAL_INSECT_OBSERVATION_RULES,
  UNIVERSAL_DIAGNOSIS_RULES,
  UNIVERSAL_NUTRIENT_RULES,
  UNIVERSAL_WATER_STRESS_RULES,
  UNIVERSAL_PRESCRIPTION_RULES,
  UNIVERSAL_SAFETY_RULES,
  UNIVERSAL_EXCLUSION_RULES,
  ALL_UNIVERSAL_RULES
} from '../rules/universal-observation-rules.ts';

import {
  WHEAT_IPM_OBSERVATION_RULES,
  WHEAT_IPM_DIAGNOSIS_RULES,
  WHEAT_IPM_PRESCRIPTION_RULES,
  WHEAT_IPM_SAFETY_RULES,
  ALL_WHEAT_IPM_RULES
} from '../rules/wheat-ipm-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CONVERT EDGE FUNCTION RULES TO BUNDLED FORMAT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert Rule (edge function format) to BundledRule format
 */
function convertEdgeRule(rule: { 
  id: string; 
  category: number; 
  priority: number; 
  when: Record<string, unknown>; 
  then: Record<string, unknown>;
  scientific_basis?: string;
  active: boolean;
}): BundledRule {
  // Build a condition function from the 'when' object
  const conditions = rule.when;
  let conditionParts: string[] = [];
  
  if (conditions.visual_symptom) {
    const symptoms = conditions.visual_symptom as string[];
    conditionParts.push(`(${symptoms.map(s => `input.visual_symptoms?.includes('${s}')`).join(' || ')})`);
  }
  if (conditions.crop_stage) {
    const stages = conditions.crop_stage as string[];
    conditionParts.push(`(${stages.map(s => `input.crop_stage === '${s}'`).join(' || ')})`);
  }
  if (conditions.severity) {
    const severities = conditions.severity as string[];
    conditionParts.push(`(${severities.map(s => `input.severity === '${s}'`).join(' || ')})`);
  }
  if (conditions.soil_nitrogen) {
    const levels = conditions.soil_nitrogen as string[];
    conditionParts.push(`(${levels.map(l => `input.soil_states?.n === '${l}'`).join(' || ')})`);
  }
  if (conditions.water_stress) {
    const levels = conditions.water_stress as string[];
    conditionParts.push(`(${levels.map(l => `input.water_stress === '${l}'`).join(' || ')})`);
  }
  
  const conditionCode = conditionParts.length > 0 
    ? `(input) => ${conditionParts.join(' && ')}`
    : '(input) => true';
  
  const categoryMap: Record<number, string> = {
    1: 'observation',
    2: 'diagnosis', 
    3: 'exclusion',
    4: 'safety',
    5: 'prescription',
    6: 'warning'
  };
  
  // Extract cause from 'then' assertions
  const assertions = rule.then;
  const cause = String(
    assertions.possible_cause || 
    assertions.observation ||
    assertions.action_type ||
    assertions.warning_type ||
    'UNKNOWN'
  );
  
  return {
    rule_id: rule.id,
    category: categoryMap[rule.category] || 'unknown',
    crop_code: '*', // Universal rules apply to all crops
    stage_applicable: (conditions.crop_stage as string[]) || [],
    conditionCode,
    cause,
    priority: rule.priority,
    scientific_source: 'Edge Function Rules',
    scientific_basis: rule.scientific_basis || '',
  };
}

// Convert all edge function rules to bundled format
const CONVERTED_UNIVERSAL_RULES: BundledRule[] = ALL_UNIVERSAL_RULES
  .filter(r => r.active)
  .map(convertEdgeRule);

const CONVERTED_WHEAT_RULES: BundledRule[] = ALL_WHEAT_IPM_RULES
  .filter(r => r.active)
  .map(r => ({
    ...convertEdgeRule(r),
    crop_code: 'wheat'
  }));

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLED RULES DATA EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_GROUP_RULES: Record<string, BundledRule[]> = {
  cereals: [...CONVERTED_WHEAT_RULES],
  pulses: [],
  vegetables: [],
  fiber: [],
  oilseeds: [],
  fruits: [],
  spices: [],
  fodder: [],
  plantation: [],
  sugarcane: [],
  micronutrients: [],
  post_harvest: [],
  universal: [...CONVERTED_UNIVERSAL_RULES],
};

export const SAFETY_RULES: Record<string, BundledRule[]> = {
  chemical_safety: [],
  emergency: [],
  phi_withdrawal: [],
  economic_threshold: [],
  ipm: [],
  crop_specific_ipm: [],
  resistance_management: [],
  harvest_quality: [],
  nutrient: [],
  water: [],
  weather_action: [],
  regional_seasonal: [],
  disease_management: [],
  soil_ph_interaction: [],
};

export const ADVANCED_RULES: BundledRule[] = [];

export const INTELLIGENCE_RULES: BundledRule[] = [];

// Calculate totals
const allCropGroupRules = Object.values(CROP_GROUP_RULES).flat();
const allSafetyRules = Object.values(SAFETY_RULES).flat();
const totalRules = allCropGroupRules.length + allSafetyRules.length + ADVANCED_RULES.length + INTELLIGENCE_RULES.length;

// Calculate category breakdown
const rulesByCategory: Record<string, number> = {};
for (const rule of [...allCropGroupRules, ...allSafetyRules, ...ADVANCED_RULES, ...INTELLIGENCE_RULES]) {
  rulesByCategory[rule.category] = (rulesByCategory[rule.category] || 0) + 1;
}

// Calculate crop group breakdown
const rulesByCropGroup: Record<string, number> = {};
for (const [group, rules] of Object.entries(CROP_GROUP_RULES)) {
  rulesByCropGroup[group] = rules.length;
}

export const BUNDLE_METADATA: BundleMetadata = {
  totalRules,
  generatedAt: new Date().toISOString(),
  version: '1.0.0',
  rulesByCategory,
  rulesByCropGroup,
};

// Log on load
console.log(`[BundledRules] ✓ Loaded ${totalRules} rules from edge function rule sources`);
console.log(`[BundledRules]   - Universal: ${CONVERTED_UNIVERSAL_RULES.length}`);
console.log(`[BundledRules]   - Wheat IPM: ${CONVERTED_WHEAT_RULES.length}`);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getAllCropGroupRules(): BundledRule[] {
  return Object.values(CROP_GROUP_RULES).flat();
}

export function getAllSafetyRules(): BundledRule[] {
  return Object.values(SAFETY_RULES).flat();
}

export function getAllRules(): BundledRule[] {
  return [
    ...getAllCropGroupRules(),
    ...getAllSafetyRules(),
    ...ADVANCED_RULES,
    ...INTELLIGENCE_RULES,
  ];
}

export function getRuleCount(): number {
  return BUNDLE_METADATA.totalRules;
}

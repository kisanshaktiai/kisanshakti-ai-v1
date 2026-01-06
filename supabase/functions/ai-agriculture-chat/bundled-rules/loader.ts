/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED RULES LOADER - Load 2000+ Rules into Edge Function
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module loads the bundled rules and reconstructs their condition
 * functions for evaluation in the Deno Edge Function environment.
 * 
 * Key Features:
 * 1. Lazy loading with in-memory caching
 * 2. Safe function reconstruction (no eval)
 * 3. Fallback to bundled data if loading fails
 */

import {
  CROP_GROUP_RULES,
  SAFETY_RULES,
  ADVANCED_RULES,
  INTELLIGENCE_RULES,
  BUNDLE_METADATA,
  type BundledRule,
  getAllCropGroupRules,
  getAllSafetyRules,
  getAllRules as getAllBundledRules,
} from './all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionInput {
  crop_code: string;
  crop_group?: string;
  crop_stage?: string;
  days_after_sowing?: number;
  ndvi_state?: string;
  ndvi_trend?: string;
  weather_state?: string;
  soil_states?: {
    n?: string;
    p?: string;
    k?: string;
    moisture?: string;
    ph?: string;
    zn?: string;
    oc?: string;
  };
  weather_forecast?: {
    rain_probability?: number;
    max_temp?: number;
    min_temp?: number;
  };
  ndvi_analytics?: {
    current?: number;
    trend?: string;
  };
  [key: string]: unknown;
}

export interface ExecutableRule extends BundledRule {
  conditions: (input: DecisionInput) => boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCTION RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

// Cache for reconstructed functions
const functionCache = new Map<string, (input: DecisionInput) => boolean>();

/**
 * Safely reconstruct a condition function from its serialized string
 * Uses Function constructor which is safer than eval()
 */
function reconstructCondition(conditionCode: string, ruleId: string): (input: DecisionInput) => boolean {
  // Check cache first
  if (functionCache.has(ruleId)) {
    return functionCache.get(ruleId)!;
  }
  
  try {
    // Parse the arrow function format: (input) => condition
    const match = conditionCode.match(/^\s*\(?\s*(\w+)\s*\)?\s*=>\s*(.+)$/s);
    if (!match) {
      console.warn(`[RuleLoader] Invalid condition format for ${ruleId}: ${conditionCode.substring(0, 100)}`);
      return () => false;
    }
    
    const [, param, body] = match;
    const cleanBody = body.trim();
    
    // Create the function using Function constructor
    // This is safer than eval as it creates a new function scope
    let fn: (input: DecisionInput) => boolean;
    
    if (cleanBody.startsWith('{')) {
      // Function body with explicit return
      fn = new Function(param, cleanBody) as (input: DecisionInput) => boolean;
    } else {
      // Expression body - add return statement
      fn = new Function(param, `return ${cleanBody}`) as (input: DecisionInput) => boolean;
    }
    
    // Wrap in error boundary
    const safeFn = (input: DecisionInput): boolean => {
      try {
        return fn(input);
      } catch (error) {
        console.warn(`[RuleLoader] Error evaluating ${ruleId}:`, error);
        return false;
      }
    };
    
    // Cache the function
    functionCache.set(ruleId, safeFn);
    
    return safeFn;
  } catch (error) {
    console.error(`[RuleLoader] Failed to reconstruct ${ruleId}:`, error);
    return () => false;
  }
}

/**
 * Convert a BundledRule to an ExecutableRule with a working condition function
 */
function makeExecutable(rule: BundledRule): ExecutableRule {
  return {
    ...rule,
    conditions: reconstructCondition(rule.conditionCode, rule.rule_id),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE LOADING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Cache for loaded rules
let allRulesCache: ExecutableRule[] | null = null;
let cropGroupRulesCache: Map<string, ExecutableRule[]> | null = null;
let safetyRulesCache: ExecutableRule[] | null = null;

/**
 * Load all rules from a specific crop group
 * @param cropGroup - The crop group to load (e.g., 'cereals', 'pulses')
 */
export function loadCropGroupRules(cropGroup: string): ExecutableRule[] {
  const normalizedGroup = cropGroup.toLowerCase();
  
  // Initialize cache if needed
  if (!cropGroupRulesCache) {
    cropGroupRulesCache = new Map();
  }
  
  // Check cache
  if (cropGroupRulesCache.has(normalizedGroup)) {
    return cropGroupRulesCache.get(normalizedGroup)!;
  }
  
  // Load from bundled data
  const bundledRules = CROP_GROUP_RULES[normalizedGroup] || [];
  const executableRules = bundledRules.map(makeExecutable);
  
  // Cache and return
  cropGroupRulesCache.set(normalizedGroup, executableRules);
  console.log(`[RuleLoader] Loaded ${executableRules.length} rules for crop group: ${normalizedGroup}`);
  
  return executableRules;
}

/**
 * Load all safety rules
 */
export function loadSafetyRules(): ExecutableRule[] {
  if (safetyRulesCache) {
    return safetyRulesCache;
  }
  
  const allSafetyBundled = getAllSafetyRules();
  safetyRulesCache = allSafetyBundled.map(makeExecutable);
  
  console.log(`[RuleLoader] Loaded ${safetyRulesCache.length} safety rules`);
  
  return safetyRulesCache;
}

/**
 * Load advanced rules (PGR, fertigation, biological)
 */
export function loadAdvancedRules(): ExecutableRule[] {
  return ADVANCED_RULES.map(makeExecutable);
}

/**
 * Load intelligence rules (variety recommendations, etc.)
 */
export function loadIntelligenceRules(): ExecutableRule[] {
  return INTELLIGENCE_RULES.map(makeExecutable);
}

/**
 * Load ALL rules from the bundle
 */
export function loadAllRules(): ExecutableRule[] {
  if (allRulesCache) {
    return allRulesCache;
  }
  
  const allBundled = getAllBundledRules();
  allRulesCache = allBundled.map(makeExecutable);
  
  console.log(`[RuleLoader] Loaded ${allRulesCache.length} total rules`);
  
  return allRulesCache;
}

/**
 * Load rules for a specific crop code
 * @param cropCode - The specific crop code (e.g., 'wheat', 'cotton')
 */
export function loadRulesForCrop(cropCode: string): ExecutableRule[] {
  const normalizedCrop = cropCode.toLowerCase();
  const allRules = loadAllRules();
  
  return allRules.filter(rule => 
    rule.crop_code === normalizedCrop || 
    rule.crop_code === '*' ||
    rule.crop_code.startsWith('ALL_')
  );
}

/**
 * Load rules by category
 * @param category - The rule category (e.g., 'water', 'nutrient', 'pest')
 */
export function loadRulesByCategory(category: string): ExecutableRule[] {
  const allRules = loadAllRules();
  return allRules.filter(rule => rule.category === category);
}

// ═══════════════════════════════════════════════════════════════════════════
// METADATA & STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get total rule count
 */
export function getRuleCount(): number {
  return BUNDLE_METADATA.totalRules;
}

/**
 * Get rule counts by category
 */
export function getRuleCountByCategory(): Record<string, number> {
  return BUNDLE_METADATA.rulesByCategory;
}

/**
 * Get rule counts by crop group
 */
export function getRuleCountByCropGroup(): Record<string, number> {
  return BUNDLE_METADATA.rulesByCropGroup;
}

/**
 * Get bundle metadata
 */
export function getBundleMetadata() {
  return BUNDLE_METADATA;
}

/**
 * Clear all caches (useful for testing)
 */
export function clearCaches(): void {
  allRulesCache = null;
  cropGroupRulesCache = null;
  safetyRulesCache = null;
  functionCache.clear();
  console.log('[RuleLoader] Caches cleared');
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE EVALUATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate rules against an input and return matching rules
 */
export function evaluateRules(
  rules: ExecutableRule[],
  input: DecisionInput
): ExecutableRule[] {
  const matchingRules: ExecutableRule[] = [];
  
  for (const rule of rules) {
    try {
      // Check stage applicability
      if (rule.stage_applicable.length > 0 && input.crop_stage) {
        if (!rule.stage_applicable.includes(input.crop_stage)) {
          continue;
        }
      }
      
      // Check crop code match
      if (rule.crop_code !== '*' && !rule.crop_code.startsWith('ALL_')) {
        if (rule.crop_code !== input.crop_code) {
          continue;
        }
      }
      
      // Evaluate condition function
      if (rule.conditions(input)) {
        matchingRules.push(rule);
      }
    } catch (error) {
      console.warn(`[RuleLoader] Error evaluating rule ${rule.rule_id}:`, error);
    }
  }
  
  // Sort by priority (descending - higher priority first)
  return matchingRules.sort((a, b) => b.priority - a.priority);
}

/**
 * Quick evaluation for a specific cause
 */
export function findRulesForCause(cause: string): ExecutableRule[] {
  const allRules = loadAllRules();
  return allRules.filter(rule => rule.cause === cause);
}

// Re-export types
export type { BundledRule, ExecutableRule };

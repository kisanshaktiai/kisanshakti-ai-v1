/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURE RULE LOADER - Database-First Strategy (v1.0.0-stub)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Loads rules from database at runtime to prevent bundle timeout.
 * Uses in-memory caching for performance.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { type BundledRule, type BundleMetadata, BUNDLE_METADATA } from './all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionInput {
  crop_code?: string;
  crop_stage?: string;
  user_query?: string;
  observations?: string[];
  weather?: { temp?: number; humidity?: number; rain_mm?: number };
  soil?: { ph?: number; organic_carbon?: number };
  // CanonicalState properties for observation-based rules
  visual_symptoms?: string[];
  soil_nitrogen?: string;
  soil_phosphorus?: string;
  soil_potassium?: string;
  ndvi_level?: string;
  ndvi_trend?: string;
  water_stress?: string;
  severity?: string;
  [key: string]: unknown;
}

export interface ExecutableRule extends BundledRule {
  conditions: (input: DecisionInput) => boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════════════════

let cachedRules: ExecutableRule[] | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL = 3600000; // 1 hour

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE LOADING
// ═══════════════════════════════════════════════════════════════════════════

async function loadRulesFromDatabase(): Promise<BundledRule[]> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn('⚠️ [RuleLoader] Missing Supabase credentials - returning empty rules');
      return [];
    }
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    const { data, error } = await supabase
      .from('decision_rules')
      .select('*')
      .eq('is_active', true)
      .limit(3000);
    
    if (error) {
      console.error('❌ [RuleLoader] Database error:', error.message);
      return [];
    }
    
    console.log(`✅ [RuleLoader] Loaded ${data?.length || 0} rules from database`);
    return (data || []).map(row => ({
      rule_id: row.rule_id,
      category: row.category,
      crop_code: row.crop_code,
      crop_group: row.crop_group,
      canonical_group: row.canonical_group,
      stage_applicable: row.stage_applicable || [],
      conditionCode: row.condition_code || '() => true',
      conditions_json: row.conditions_json,
      cause: row.cause,
      priority: row.priority || 50,
      confidence_score: row.confidence_score,
      scientific_source: row.scientific_source || '',
      scientific_basis: row.scientific_basis || '',
      icar_package_ref: row.icar_package_ref,
      trigger_keywords: row.trigger_keywords || [],
      response_mr: row.response_mr,
      response_hi: row.response_hi,
      response_en: row.response_en,
      alternatives: row.alternatives || [],
      action_type: row.action_type || 'advisory',
      phi_days: row.phi_days,
      bee_toxicity: row.bee_toxicity,
      ipm_level: row.ipm_level,
      etl_threshold: row.etl_threshold,
      active_ingredient: row.active_ingredient,
      organic_alternative: row.organic_alternative,
      is_active: row.is_active
    }));
  } catch (e) {
    console.error('❌ [RuleLoader] Failed to load rules:', e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

const BLOCKED_PATTERNS = [
  /eval\s*\(/i, /Function\s*\(/i, /import\s*\(/i, /require\s*\(/i,
  /fetch\s*\(/i, /XMLHttpRequest/i, /WebSocket/i, /process\./i,
  /Deno\./i, /globalThis/i, /__proto__/i, /constructor\s*\[/i
];

function reconstructCondition(code: string): ((input: DecisionInput) => boolean) {
  if (!code || typeof code !== 'string') {
    return () => false;
  }
  
  // Security check
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      console.warn(`⚠️ Blocked unsafe condition pattern: ${pattern}`);
      return () => false;
    }
  }
  
  try {
    const fn = new Function('input', `
      "use strict";
      try {
        const condition = ${code};
        return typeof condition === 'function' ? condition(input) : Boolean(condition);
      } catch { return false; }
    `);
    return fn as (input: DecisionInput) => boolean;
  } catch {
    return () => false;
  }
}

/**
 * CRITICAL FIX: Evaluate conditions_json from database
 * Supports compound conditions (all/any) and atomic conditions
 */
export function evaluateConditionsJson(
  conditions: any,
  input: DecisionInput
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true; // No conditions = always match
  }
  
  // Handle 'all' compound condition
  if (conditions.all && Array.isArray(conditions.all)) {
    return conditions.all.every((c: any) => evaluateConditionsJson(c, input));
  }
  
  // Handle 'any' compound condition
  if (conditions.any && Array.isArray(conditions.any)) {
    return conditions.any.some((c: any) => evaluateConditionsJson(c, input));
  }
  
  // Evaluate atomic condition
  if (conditions.fact && conditions.operator) {
    const factValue = input[conditions.fact as keyof DecisionInput];
    if (factValue === undefined || factValue === null) return false;
    
    const op = conditions.operator.toLowerCase();
    const val = conditions.value;
    
    switch (op) {
      case 'equal':
      case 'equals':
        return String(factValue).toLowerCase() === String(val).toLowerCase();
      case 'contains':
        return String(factValue).toLowerCase().includes(String(val).toLowerCase());
      case 'in':
        return Array.isArray(val) && val.some((v: any) => 
          String(v).toLowerCase() === String(factValue).toLowerCase()
        );
      case 'between':
        return Array.isArray(val) && val.length === 2 && 
               Number(factValue) >= val[0] && Number(factValue) <= val[1];
      case 'lessthan':
        return Number(factValue) < Number(val);
      case 'greaterthan':
        return Number(factValue) > Number(val);
      default:
        return false;
    }
  }
  
  return false;
}

function makeExecutable(rule: BundledRule): ExecutableRule {
  return {
    ...rule,
    conditions: (input: DecisionInput) => {
      // CRITICAL FIX: First try conditions_json, then fallback to conditionCode
      if (rule.conditions_json && Object.keys(rule.conditions_json).length > 0) {
        return evaluateConditionsJson(rule.conditions_json, input);
      }
      // Fallback to legacy conditionCode
      return reconstructCondition(rule.conditionCode)(input);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export async function loadAllRules(): Promise<ExecutableRule[]> {
  const now = Date.now();
  
  if (cachedRules && now < cacheExpiry) {
    return cachedRules;
  }
  
  const bundled = await loadRulesFromDatabase();
  cachedRules = bundled.map(makeExecutable);
  cacheExpiry = now + CACHE_TTL;
  
  console.log(`✅ [RuleLoader] Cached ${cachedRules.length} executable rules`);
  return cachedRules;
}

export function loadCropGroupRules(cropGroup: string): ExecutableRule[] {
  const normalizedGroup = cropGroup?.toLowerCase() || '';
  return cachedRules?.filter(r => r.crop_code?.toLowerCase() === normalizedGroup) || [];
}

export function loadSafetyRules(): ExecutableRule[] {
  return cachedRules?.filter(r => r.category === 'risk_safety') || [];
}

export function loadAdvancedRules(): ExecutableRule[] {
  return cachedRules?.filter(r => ['fertilizer', 'irrigation'].includes(r.category)) || [];
}

export function loadIntelligenceRules(): ExecutableRule[] {
  return cachedRules?.filter(r => r.category === 'crop_identity') || [];
}

export function loadRulesForCrop(cropCode: string): ExecutableRule[] {
  const normalizedCrop = cropCode?.toLowerCase() || '';
  return cachedRules?.filter(r => {
    const ruleCrop = r.crop_code?.toLowerCase() || '';
    return ruleCrop === normalizedCrop || ruleCrop === 'all' || ruleCrop === '*' || ruleCrop === 'universal';
  }) || [];
}

export function loadRulesByCategory(category: string): ExecutableRule[] {
  return cachedRules?.filter(r => r.category === category) || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateRules(rules: ExecutableRule[], input: DecisionInput): ExecutableRule[] {
  const matched: ExecutableRule[] = [];
  
  for (const rule of rules) {
    try {
      if (rule.conditions(input)) {
        matched.push(rule);
      }
    } catch {
      // Skip rule on error
    }
  }
  
  return matched.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export function findRulesForCause(cause: string): ExecutableRule[] {
  return cachedRules?.filter(r => r.cause === cause) || [];
}

export function getRuleIdsForInput(input: DecisionInput): string[] {
  const matched = evaluateRules(cachedRules || [], input);
  return matched.map(r => r.rule_id);
}

// ═══════════════════════════════════════════════════════════════════════════
// METADATA
// ═══════════════════════════════════════════════════════════════════════════

export function getRuleCount(): number {
  return cachedRules?.length || 0;
}

export function getRuleCountByCategory(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rule of cachedRules || []) {
    counts[rule.category] = (counts[rule.category] || 0) + 1;
  }
  return counts;
}

export function getRuleCountByCropGroup(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rule of cachedRules || []) {
    counts[rule.crop_code] = (counts[rule.crop_code] || 0) + 1;
  }
  return counts;
}

export function getBundleMetadata(): BundleMetadata {
  return {
    ...BUNDLE_METADATA,
    totalRules: getRuleCount(),
    rulesByCategory: getRuleCountByCategory(),
    rulesByCropGroup: getRuleCountByCropGroup()
  };
}

export function getBundleVersion(): string {
  return '1.0.0-db';
}

export function clearCaches(): void {
  cachedRules = null;
  cacheExpiry = 0;
  console.log('🧹 [RuleLoader] Caches cleared');
}

// Re-export types
export type { BundledRule, ExecutableRule };

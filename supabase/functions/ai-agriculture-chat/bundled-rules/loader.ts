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
    return (data || []).map(row => {
      // SSOT: trigger_keywords column was DROPPED - conditions_json is sole source
      const conditionsJson = row.conditions_json || {};
      
      // ═══════════════════════════════════════════════════════════════════════
      // ON-THE-FLY NORMALIZATION (Alternative to migrations)
      // ═══════════════════════════════════════════════════════════════════════
      
      // Normalize action_type to standard enums
      const normalizeActionType = (action: string | null): string => {
        const mapping: Record<string, string> = {
          'RECOMMEND': 'treatment',
          'MONITOR': 'monitoring',
          'BLOCK': 'safety_gate',
          'NO_ACTION_REQUIRED': 'advisory',
          'URGENT_ACTION': 'urgent_treatment',
          'APPLY_TREATMENT': 'treatment',
          'recommend': 'treatment',
          'monitor': 'monitoring',
          'block': 'safety_gate',
        };
        const normalized = action ? mapping[action] || action.toLowerCase() : 'advisory';
        const validTypes = ['treatment', 'urgent_treatment', 'prevention', 'advisory', 
                           'safety_gate', 'monitoring', 'clarification', 'diagnosis'];
        return validTypes.includes(normalized) ? normalized : 'advisory';
      };
      
      // Normalize canonical_group to 13-group system
      const normalizeCanonicalGroup = (group: string | null): string => {
        if (!group) return '12_monitoring';
        const g = group.toLowerCase();
        
        // Handle SC_PEST_*, CT_PEST_* patterns
        if (g.startsWith('sc_pest_') || g.startsWith('ct_pest_')) return '03_pest';
        if (g.startsWith('sc_disease_') || g.startsWith('ct_disease_')) return '04_disease';
        if (g.startsWith('sc_nutrient_') || g.startsWith('ct_nutrient_')) return '05_nutrition';
        if (g.startsWith('sc_stress_') || g.startsWith('ct_stress_')) return '08_stress';
        if (g.startsWith('sc_irrigation_') || g.startsWith('ct_irrigation_')) return '10_irrigation';
        if (g.startsWith('sc_safety_') || g.startsWith('ct_safety_')) return '11_safety';
        if (g.startsWith('sc_weather_') || g.startsWith('ct_weather_')) return '09_weather';
        
        // Direct mapping for short names
        const mapping: Record<string, string> = {
          'pest': '03_pest',
          'disease': '04_disease',
          'nutrition': '05_nutrition',
          'nutrient': '05_nutrition',
          'weed': '06_weed',
          'clarification': '07_clarification',
          'stress': '08_stress',
          'weather': '09_weather',
          'weather_alert': '09_weather',
          'irrigation': '10_irrigation',
          'safety': '11_safety',
          'monitoring': '12_monitoring',
          'treatment': '13_treatment',
          'identity': '01_crop_identity',
          'crop_identity': '01_crop_identity',
          'growth_stage': '02_growth_stage',
        };
        
        return mapping[g] || (g.match(/^\d{2}_/) ? g : '12_monitoring');
      };
      
      // Normalize stage_applicable to lowercase
      const normalizeStages = (stages: string[] | null): string[] => {
        if (!stages || !Array.isArray(stages)) return ['all'];
        const stageMapping: Record<string, string> = {
          'PLANTING': 'germination',
          'RATOON': 'post_harvest',
          'CANE_FORMATION': 'grand_growth',
          'EARLY_GROWTH': 'seedling',
          'RATOON_INIT': 'post_harvest',
        };
        return stages.map(s => {
          const upper = s.toUpperCase();
          return stageMapping[upper] || s.toLowerCase();
        });
      };
      
      // Normalize observable_characteristics to array
      const normalizeObservableChars = (chars: unknown): string[] | null => {
        if (!chars) return null;
        if (Array.isArray(chars)) return chars.map(c => String(c).toUpperCase());
        if (typeof chars === 'object') {
          return Object.keys(chars).map(k => k.toUpperCase());
        }
        return null;
      };
      
      // Normalize bee_toxicity
      const normalizeBeeToxicity = (val: string | null): string | null => {
        if (!val) return null;
        const upper = val.toUpperCase();
        if (['HIGH', 'MODERATE', 'LOW', 'SAFE'].includes(upper)) return upper;
        if (upper === 'NONE') return 'SAFE';
        return null;
      };
      
      return {
        rule_id: row.rule_id,
        category: row.category?.toLowerCase() || 'advisory',
        crop_code: row.crop_code?.toLowerCase() || 'universal',
        crop_group: row.crop_group?.toLowerCase() || 'universal',
        canonical_group: normalizeCanonicalGroup(row.canonical_group),
        stage_applicable: normalizeStages(row.stage_applicable),
        conditionCode: row.condition_code || '() => true',
        conditions_json: conditionsJson,
        cause: row.cause,
        priority: row.priority || 50,
        confidence_score: row.confidence_score,
        scientific_source: row.scientific_source || '',
        scientific_basis: row.scientific_basis || '',
        icar_package_ref: row.icar_package_ref,
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 5: New Response Contract Fields (language-independent)
        // ═══════════════════════════════════════════════════════════════════════
        action_text: row.action_text || null, // May be null, handle in UI
        reason_text: row.reason_text || null,
        knowledge_text: row.knowledge_text || null,
        i18n_key: row.i18n_key,
        decision_trace_template: row.decision_trace_template,
        
        // Normalized observable_characteristics (array only)
        observable_characteristics: normalizeObservableChars(row.observable_characteristics),
        
        alternatives: row.alternatives || [],
        action_type: normalizeActionType(row.action_type),
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 1: Graph Control Fields
        // ═══════════════════════════════════════════════════════════════════════
        blocks_rule_ids: row.blocks_rule_ids || [],
        prerequisite_rule_ids: row.prerequisite_rule_ids || [],
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 2: Temporal Constraint Fields
        // ═══════════════════════════════════════════════════════════════════════
        crop_age_days_min: row.crop_age_days_min,
        crop_age_days_max: row.crop_age_days_max,
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 3: ETL Safety Gate Fields
        // ═══════════════════════════════════════════════════════════════════════
        etl_applicable: row.etl_applicable,
        etl_value_min: row.etl_value_min,
        etl_value_max: row.etl_value_max,
        
        // Safety fields (normalized)
        phi_days: row.phi_days,
        bee_toxicity: normalizeBeeToxicity(row.bee_toxicity),
        ipm_level: row.ipm_level,
        etl_threshold: row.etl_threshold,
        active_ingredient: row.active_ingredient,
        organic_alternative: row.organic_alternative,
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 6: Safety Enhancement Fields
        // ═══════════════════════════════════════════════════════════════════════
        farmer_safety_level: row.farmer_safety_level,
        resistance_group: row.resistance_group,
        mode_of_action: row.mode_of_action,
        
        is_active: row.is_active
      };
    });
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
 * Supports compound conditions (all/any), atomic conditions, AND simple object format
 * 
 * DATABASE FORMAT: {crop_stage: [...], observations: [...], trigger_keywords: [...]}
 * COMPOUND FORMAT: {all: [...], any: [...]}
 * ATOMIC FORMAT: {fact: 'X', operator: 'Y', value: 'Z'}
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
  
  // Evaluate atomic condition (fact/operator/value format)
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Handle SIMPLE OBJECT FORMAT from database
  // This is the actual format used: {crop_stage: [...], observations: [...], trigger_keywords: [...]}
  // ═══════════════════════════════════════════════════════════════════════════
  
  let allMatch = true;
  let hasAnyCondition = false;
  
  // Check crop_stage match
  if (conditions.crop_stage && Array.isArray(conditions.crop_stage) && conditions.crop_stage.length > 0) {
    hasAnyCondition = true;
    const inputStage = input.crop_stage?.toUpperCase() || '';
    const stageMatch = conditions.crop_stage.some((s: string) => {
      const normalizedS = s.toUpperCase();
      return normalizedS === inputStage || 
             normalizedS === '*' || 
             normalizedS === 'ALL' ||
             normalizedS === 'ANY' ||
             inputStage.includes(normalizedS);
    });
    if (!stageMatch && inputStage) {
      allMatch = false;
    }
  }
  
  // Check observations match (if input has visual_symptoms)
  if (conditions.observations && Array.isArray(conditions.observations) && conditions.observations.length > 0) {
    hasAnyCondition = true;
    const inputSymptoms = input.visual_symptoms || [];
    const inputSymptom = (input as any).primary_symptom || '';
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Expand observation aliases for better matching
    // Maps high-level observation codes to their symptoms
    // ═══════════════════════════════════════════════════════════════════════════
    const observationAliases: Record<string, string[]> = {
      'NUTRIENT_DEFICIENCY': ['leaf_yellowing', 'chlorosis', 'stunted_growth', 'purple_leaves', 'interveinal_chlorosis', 'nutrient_check'],
      'NUTRIENT_CHECK': ['nutrient_deficiency', 'leaf_yellowing', 'chlorosis', 'stunted_growth', 'fertilizer'],
      'STUNTED_GROWTH': ['stunted', 'slow_growth', 'poor_growth', 'stunted_plants'],
      'LEAF_YELLOWING': ['yellowing', 'yellow_leaves', 'chlorosis', 'general_yellowing'],
      'WATER_STRESS': ['wilting', 'drought', 'dry', 'moisture_stress'],
      'PEST_DAMAGE': ['insect_present', 'holes_in_leaves', 'damaged_leaves', 'chewed_leaves']
    };
    
    // Build expanded symptom list
    const expandedSymptoms: string[] = [...inputSymptoms.map(s => s.toLowerCase())];
    if (inputSymptom) {
      expandedSymptoms.push(inputSymptom.toLowerCase());
    }
    // Add aliases for each input symptom
    for (const sym of inputSymptoms) {
      const symUpper = sym.toUpperCase().replace(/[\s-]/g, '_');
      if (observationAliases[symUpper]) {
        expandedSymptoms.push(...observationAliases[symUpper]);
      }
    }
    
    // Match if ANY observation in conditions matches ANY symptom (including aliases)
    if (expandedSymptoms.length > 0) {
      const obsMatch = conditions.observations.some((obs: string) => {
        const obsLower = obs.toLowerCase().replace(/[\s-]/g, '_');
        const obsNorm = obs.toUpperCase().replace(/[\s-]/g, '_');
        
        // Direct match
        if (expandedSymptoms.some((sym: string) => {
          const symNorm = sym.replace(/[\s-]/g, '_');
          return symNorm.includes(obsLower) || obsLower.includes(symNorm);
        })) {
          return true;
        }
        
        // Check if any input symptom is an alias of the rule observation
        if (observationAliases[obsNorm]) {
          return expandedSymptoms.some((sym: string) => 
            observationAliases[obsNorm].some(alias => sym.includes(alias) || alias.includes(sym))
          );
        }
        
        return false;
      });
      if (!obsMatch) {
        allMatch = false;
      }
    }
  }
  
  // Check trigger_keywords in user_query - KEYWORD MATCH OVERRIDES OTHER FAILURES
  if (conditions.trigger_keywords && Array.isArray(conditions.trigger_keywords) && conditions.trigger_keywords.length > 0) {
    hasAnyCondition = true;
    const queryLower = (input.user_query || '').toLowerCase();
    
    if (queryLower) {
      const keywordMatch = conditions.trigger_keywords.some((kw: string) => {
        const kwLower = kw.toLowerCase();
        return queryLower.includes(kwLower);
      });
      
      if (keywordMatch) {
        // CRITICAL: Keyword match overrides other condition failures!
        return true;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Handle UNKNOWN KEYS in conditions_json
  // Instead of rejecting on unknown keys, gracefully skip complex/contextual
  // conditions we can't evaluate, and match boolean/string observation flags
  // against user symptoms/query
  // ═══════════════════════════════════════════════════════════════════════════
  const RECOGNIZED_KEYS = new Set([
    'crop_stage', 'stage', 'growth_stage', 'observations', 'symptom', 'primary_symptom',
    'trigger_keywords', 'all', 'any', 'fact', 'operator', 'value',
    'crop_code', 'crop_type'
  ]);
  
  const conditionKeys = Object.keys(conditions);
  const inputSymptom = ((input as any).primary_symptom || '').toUpperCase().replace(/[\s-]/g, '_');
  const inputQuery = ((input as any).user_query || (input as any).query || '').toUpperCase();
  
  // Handle stage aliases (stage, growth_stage -> crop_stage)
  const stageAlias = conditions.stage || conditions.growth_stage;
  if (stageAlias && !conditions.crop_stage) {
    const stageArr = Array.isArray(stageAlias) ? stageAlias : [stageAlias];
    const inputStage = (input.crop_stage || '').toUpperCase();
    hasAnyCondition = true;
    const stageMatch = stageArr.some((s: any) => {
      const upper = String(s).toUpperCase();
      return upper === inputStage || upper === '*' || upper === 'ALL';
    });
    if (!stageMatch && inputStage) allMatch = false;
  }
  
  // Handle symptom alias -> observations
  const symptomAlias = conditions.symptom || conditions.primary_symptom;
  if (symptomAlias && !conditions.observations) {
    const symArr = Array.isArray(symptomAlias) ? symptomAlias : [symptomAlias];
    hasAnyCondition = true;
    const symMatch = symArr.some((s: any) => {
      const upper = String(s).toUpperCase().replace(/[\s-]/g, '_');
      return inputSymptom.includes(upper) || upper.includes(inputSymptom) || inputQuery.includes(upper);
    });
    if (!symMatch) allMatch = false;
  }
  
  // Process remaining unknown keys
  // Fix 2: Track skipped (unevaluable) conditions to prevent false matches
  let skippedObjectConditions = 0;
  let evaluatedUnknownConditions = 0;
  
  for (const key of conditionKeys) {
    if (RECOGNIZED_KEYS.has(key)) continue;
    
    const condValue = conditions[key];
    
    // Track complex object/array conditions as unevaluable instead of silently skipping
    if (condValue !== null && typeof condValue === 'object') {
      skippedObjectConditions++;
      continue;
    }
    
    // Boolean observation flags: {dead_heart: true, black_whip_like_structure: true}
    if (condValue === true || condValue === 'true') {
      hasAnyCondition = true;
      evaluatedUnknownConditions++;
      const keySymbol = key.toUpperCase().replace(/[\s-]/g, '_');
      if (!(inputSymptom === keySymbol || inputSymptom.includes(keySymbol) || 
            keySymbol.includes(inputSymptom) || inputQuery.includes(keySymbol))) {
        allMatch = false;
      }
      continue;
    }
    
    // String value conditions: {pest: "termite", disease: "smut"}
    if (typeof condValue === 'string') {
      evaluatedUnknownConditions++;
      // Try numeric comparator first
      const inputValue = (input as any)[key];
      const numericInput = typeof inputValue === 'number' ? inputValue : parseFloat(String(inputValue));
      
      if (!isNaN(numericInput) && inputValue !== undefined) {
        const ltMatch = condValue.match(/^<\s*(\d+\.?\d*)$/);
        const gteMatch = condValue.match(/^>=\s*(\d+\.?\d*)$/);
        if (ltMatch && !(numericInput < parseFloat(ltMatch[1]))) { allMatch = false; hasAnyCondition = true; continue; }
        if (gteMatch && !(numericInput >= parseFloat(gteMatch[1]))) { allMatch = false; hasAnyCondition = true; continue; }
        hasAnyCondition = true;
        continue;
      }
      
      // Match string value against symptom/query
      hasAnyCondition = true;
      const valUpper = condValue.toUpperCase().replace(/[\s-]/g, '_');
      if (!(inputSymptom.includes(valUpper) || valUpper.includes(inputSymptom) || inputQuery.includes(valUpper))) {
        allMatch = false;
      }
      continue;
    }
    
    // false booleans, numbers - skip gracefully
    if (condValue === false || condValue === 'false' || typeof condValue === 'number') {
      continue;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Fix 2: FAIL-CLOSED for rules with ONLY unevaluable conditions
  // If ALL non-recognized conditions were complex objects (soil thresholds, 
  // weather maps, ETL objects) and NO conditions were actually evaluated,
  // the rule should NOT match — we lack the data to validate it.
  // ═══════════════════════════════════════════════════════════════════════════
  if (skippedObjectConditions > 0 && evaluatedUnknownConditions === 0 && !hasAnyCondition) {
    return false; // Cannot evaluate = do not match
  }
  
  // If no specific conditions were defined (truly empty object), match by default
  if (!hasAnyCondition && conditionKeys.length === 0) {
    return true;
  }
  
  // If we had conditions but none matched, fail
  if (!hasAnyCondition) {
    return false;
  }
  
  return allMatch;
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

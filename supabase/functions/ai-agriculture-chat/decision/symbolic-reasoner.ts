/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMBOLIC REASONER - FACT-TO-RULE EVALUATION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL COMPONENT: This module implements the core symbolic reasoning engine
 * that maps CanonicalState + AuthoritativeLandState to SymbolicFact objects
 * and evaluates conditions_json from the decision_rules table.
 * 
 * PHILOSOPHY:
 * - Rules are SUPREME, AI only explains
 * - All decisions come from deterministic rule evaluation
 * - LLM is strictly prohibited from inventing treatments
 * 
 * VERSION: 1.0.0 - Initial Production Release
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { CanonicalState } from '../agents/canonical-state-builder.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface SymbolicFact {
  // Core context (from database - NEVER ask farmer)
  crop: string;
  crop_code: string;
  dos: number;
  growth_stage: string;
  land_area_acres: number;
  
  // Symptom facts (from observations)
  primary_symptom: string;
  affected_part: string;
  distribution: string;
  severity: string;
  progression: string;
  
  // Bug 2 Fix: All observations array for multi-observation matching
  all_observations: string[];
  // Improvement 1: Pest evidence flag for category exclusion
  has_pest_evidence: boolean;
  
  // Environmental facts
  ndvi: number | null;
  ndvi_trend: string;
  ndvi_status: string;
  temperature: number | null;
  humidity: number | null;
  recent_rain: boolean;
  soil_moisture_estimated: string;
  
  // Soil facts
  soil_n: number | null;
  soil_n_status: string;
  soil_p: number | null;
  soil_p_status: string;
  soil_k: number | null;
  soil_k_status: string;
  soil_ph: number | null;
  
  // Derived facts
  stress_level: string;
  critical_stage: boolean;
  data_completeness: number;
  risk_level: string;
  
  // Farmer action facts
  user_query: string;
  recent_treatments: string[];
}

export interface RuleCondition {
  all?: RuleCondition[];
  any?: RuleCondition[];
  fact?: string;
  operator?: 'equal' | 'equals' | 'contains' | 'between' | 'lessThan' | 'greaterThan' | 'in' | 'matches' | 'notEqual';
  value?: any;
}

/**
 * FiredRule - LANGUAGE-INDEPENDENT symbolic output
 * NOTE: response_mr/hi/en were DROPPED per SSOT architecture.
 * All narration is LLM-generated from action_text + i18n_key.
 */
export interface FiredRule {
  rule_id: string;
  rule_name: string;
  category: string;
  confidence: number;
  priority: number;
  cause: string;
  actions: {
    action_type: string;
    // SSOT response fields (language-independent)
    action_text?: string;
    reason_text?: string;
    knowledge_text?: string;
    i18n_key?: string;
    decision_trace_template?: string;
    // Product metadata (symbolic, not language)
    product_reference?: string;
    phi_days?: number;
    bee_toxicity?: string;
    ipm_level?: number;
    active_ingredient?: string;
    organic_alternative?: string;
  };
  reasoning: string;
  conditions_matched: string[];
}

export interface Hypothesis {
  cause_id: string;
  cause_name: string;
  confidence: number;
  evidence: string[];
  supporting_rules: string[];
}

/**
 * InferenceResult - LANGUAGE-INDEPENDENT symbolic output
 * NOTE: response_mr/hi/en were DROPPED per SSOT architecture.
 */
export interface InferenceResult {
  diagnosis: Hypothesis | null;
  alternative_diagnoses: Hypothesis[];
  recommendations: FiredRule[];
  confidence: number;
  reasoning: string[];
  rules_fired: number;
  rules_evaluated: number;
  // SSOT: matched_responses now use action_text + i18n_key (NO response_mr/hi/en)
  matched_responses: {
    rule_id: string;
    cause: string;
    action_type: string;
    priority?: number;
    action_text?: string;
    reason_text?: string;
    knowledge_text?: string;
    i18n_key?: string;
    decision_trace_template?: string;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE CACHE - In-memory per crop_code with 5-minute TTL
// Prevents 300-500 rule DB loads per request at 1M+ scale
// ═══════════════════════════════════════════════════════════════════════════

interface CachedRules {
  rules: any[];
  expiresAt: number;
}

const ruleCache = new Map<string, CachedRules>();
const RULE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedRules(cacheKey: string): any[] | null {
  const entry = ruleCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ruleCache.delete(cacheKey);
    return null;
  }
  return entry.rules;
}

function setCachedRules(cacheKey: string, rules: any[]): void {
  // Cap cache size to prevent unbounded memory growth
  if (ruleCache.size > 50) {
    // Evict oldest entries
    const now = Date.now();
    for (const [key, val] of ruleCache) {
      if (now > val.expiresAt) ruleCache.delete(key);
    }
    // If still too large, evict first entry
    if (ruleCache.size > 50) {
      const firstKey = ruleCache.keys().next().value;
      if (firstKey) ruleCache.delete(firstKey);
    }
  }
  ruleCache.set(cacheKey, { rules, expiresAt: Date.now() + RULE_CACHE_TTL_MS });
}

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC REASONER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class SymbolicReasoner {
  private supabase: any;
  
  /**
   * GAP #1 FIX: Accept external Supabase client to prevent connection exhaustion.
   * Falls back to creating a new client only if none provided.
   */
  constructor(supabaseClient?: any) {
    this.supabase = supabaseClient || createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }
  
  /**
   * CRITICAL: Execute symbolic rules against facts
   * This is the core decision engine - NO LLM involvement
   * 
   * PHASE-17 FIX (Issue #4): Added fuzzy/partial matching support
   */
  async executeRules(
    facts: SymbolicFact,
    landState: AuthoritativeLandState | null,
    options?: {
      allowFuzzyMatch?: boolean;
      minFuzzyScore?: number;
      urgencyOverride?: boolean;
    }
  ): Promise<InferenceResult> {
    console.log('🔬 [SymbolicReasoner] Starting rule execution...');
    console.log(`   Crop: ${facts.crop}, Stage: ${facts.growth_stage}, DOS: ${facts.dos}`);
    console.log(`   Symptom: ${facts.primary_symptom}, Severity: ${facts.severity}`);
    console.log(`   Options: fuzzy=${options?.allowFuzzyMatch}, minScore=${options?.minFuzzyScore}, urgent=${options?.urgencyOverride}`);
    
    const startTime = Date.now();
    const firedRules: FiredRule[] = [];
    const hypotheses = new Map<string, Hypothesis>();
    const matchedResponses: InferenceResult['matched_responses'] = [];
    let rulesEvaluated = 0;
    
    // PHASE-17: Default to fuzzy matching if urgency override is set
    const allowFuzzy = options?.allowFuzzyMatch ?? options?.urgencyOverride ?? false;
    const minFuzzyScore = options?.minFuzzyScore ?? 0.5;
    
    try {
      // 1. Load relevant rules from decision_rules table
      const rules = await this.loadRulesForContext(facts);
      console.log(`   📦 Loaded ${rules.length} candidate rules`);
      
      // 2. Evaluate each rule against facts - PURELY SYMBOLIC (NO keyword/language matching)
      for (const rule of rules) {
        rulesEvaluated++;
        
        // Bug 1 Fix: Category-based exclusion - skip nutrition rules when pest evidence exists
        if (facts.has_pest_evidence && rule.category?.toLowerCase() === 'nutrition') {
          console.log(`   🚫 [PestExclusion] Skipping nutrition rule ${rule.rule_id} - pest evidence present`);
          continue;
        }
        
        // SSOT: Evaluate conditions_json ONLY - no keyword fallback
        // trigger_keywords column was DROPPED per SSOT architecture
        const conditionsJson = rule.conditions_json || {};
        const match = this.evaluateConditionsJson(conditionsJson, facts);
        
        // PHASE-17 FIX: Try fuzzy matching if exact match fails
        let partialMatch: { matches: boolean; confidence: number; missing: string[] } | null = null;
        if (!match.matches && allowFuzzy) {
          partialMatch = this.evaluatePartialMatch(conditionsJson, facts, minFuzzyScore);
        }
        
        // SSOT: Only conditions_json or partial matching - NO keyword matching
        const matches = match.matches || (partialMatch?.matches ?? false);
        const matchConfidence = Math.max(
          match.confidence, 
          partialMatch?.confidence ?? 0
        );
        
        if (matches) {
          const matchType = match.matches ? 'EXACT' : 'PARTIAL';
          console.log(`   ✅ Rule fired: ${rule.rule_id} (conf: ${(matchConfidence * 100).toFixed(0)}%, type: ${matchType})`);
          
          // SSOT: FiredRule uses language-independent fields ONLY
          // response_mr/hi/en columns were DROPPED per SSOT architecture
          const firedRule: FiredRule = {
            rule_id: rule.rule_id,
            rule_name: rule.cause || rule.rule_id,
            category: rule.category,
            confidence: rule.confidence_score || matchConfidence,
            priority: rule.priority || 50,
            cause: rule.cause || 'UNKNOWN',
            actions: {
              action_type: rule.action_type || 'advisory',
              // SSOT: Language-independent response fields
              action_text: rule.action_text,
              reason_text: rule.reason_text,
              knowledge_text: rule.knowledge_text,
              i18n_key: rule.i18n_key,
              decision_trace_template: rule.decision_trace_template,
              // Product metadata
              product_reference: rule.rule_id,
              phi_days: rule.phi_days,
              bee_toxicity: rule.bee_toxicity,
              ipm_level: rule.ipm_level,
              active_ingredient: rule.active_ingredient,
              organic_alternative: rule.organic_alternative
            },
            reasoning: this.generateRuleExplanation(rule, facts, match),
            conditions_matched: match.matched_conditions || ['conditions_json_match']
          };
          
          firedRules.push(firedRule);
          
          // SSOT: Collect responses using action_text + i18n_key (NOT response_mr/hi/en)
          if (rule.action_type || rule.action_text || rule.i18n_key) {
            matchedResponses.push({
              rule_id: rule.rule_id,
              cause: rule.cause || 'UNKNOWN',
              action_type: rule.action_type || 'advisory',
              priority: rule.priority,
              action_text: rule.action_text,
              reason_text: rule.reason_text,
              knowledge_text: rule.knowledge_text,
              i18n_key: rule.i18n_key,
              decision_trace_template: rule.decision_trace_template
            });
          }
          
          // Update hypotheses
          this.updateHypotheses(hypotheses, rule, matchConfidence);
        }
      }
      
      console.log(`   🎯 Total rules fired: ${firedRules.length}/${rulesEvaluated}`);
      
      // 3. Rank hypotheses
      const rankedHypotheses = this.rankHypotheses(hypotheses, facts);
      
    // 4. Sort recommendations by CATEGORY PRIORITY then rule priority (Bug 4 Fix)
      const CATEGORY_PRIORITY: Record<string, number> = {
        pest: 1, disease: 2, ipm: 2, water_stress: 3, stress: 3, irrigation: 3, nutrition: 4, general: 5
      };
      firedRules.sort((a, b) => {
        const catA = CATEGORY_PRIORITY[a.category?.toLowerCase()] || 3;
        const catB = CATEGORY_PRIORITY[b.category?.toLowerCase()] || 3;
        if (catA !== catB) return catA - catB; // Lower = higher priority
        return b.priority - a.priority;
      });
      
      // 5. Calculate final confidence
      const finalConfidence = this.calculateFinalConfidence(rankedHypotheses, firedRules, facts);
      
      const processingTime = Date.now() - startTime;
      console.log(`   ✅ Inference complete in ${processingTime}ms`);
      
      return {
        diagnosis: rankedHypotheses[0] || null,
        alternative_diagnoses: rankedHypotheses.slice(1, 3),
        recommendations: firedRules,
        confidence: finalConfidence,
        reasoning: firedRules.map(r => r.reasoning),
        rules_fired: firedRules.length,
        rules_evaluated: rulesEvaluated,
        matched_responses: matchedResponses
      };
      
    } catch (error) {
      console.error('❌ [SymbolicReasoner] Execution error:', error);
      return {
        diagnosis: null,
        alternative_diagnoses: [],
        recommendations: [],
        confidence: 0,
        reasoning: [`Error: ${error.message}`],
        rules_fired: 0,
        rules_evaluated: rulesEvaluated,
        matched_responses: []
      };
    }
  }
  
  /**
   * PHASE-17 FIX (Issue #4): Evaluate partial/fuzzy match
   * Returns true if enough conditions are met (above minScore threshold)
   */
  private evaluatePartialMatch(
    conditions: RuleCondition,
    facts: SymbolicFact,
    minScore: number
  ): { matches: boolean; confidence: number; missing: string[] } {
    // Handle empty conditions
    if (!conditions || Object.keys(conditions).length === 0) {
      return { matches: false, confidence: 0, missing: [] };
    }
    
    // Handle 'all' compound conditions - count how many match
    if (conditions.all && Array.isArray(conditions.all)) {
      let totalConditions = conditions.all.length;
      let metConditions = 0;
      const missing: string[] = [];
      
      for (const c of conditions.all) {
        const result = this.evaluateConditionsJson(c, facts);
        if (result.matches) {
          metConditions++;
        } else if (c.fact) {
          missing.push(c.fact);
        }
      }
      
      const partialScore = totalConditions > 0 ? metConditions / totalConditions : 0;
      
      return {
        matches: partialScore >= minScore,
        confidence: partialScore,
        missing
      };
    }
    
    // Handle 'any' compound conditions - at least one match is enough
    if (conditions.any && Array.isArray(conditions.any)) {
      for (const c of conditions.any) {
        const result = this.evaluateConditionsJson(c, facts);
        if (result.matches) {
          return { matches: true, confidence: result.confidence, missing: [] };
        }
      }
      return { matches: false, confidence: 0, missing: [] };
    }
    
    return { matches: false, confidence: 0, missing: [] };
  }
  
  /**
   * Load rules matching the context from database.
   * PHASE 3 FIX: Uses in-memory cache with 5-minute TTL per crop_code
   * to eliminate 200-500ms DB hits on every request.
   */
   private async loadRulesForContext(facts: SymbolicFact): Promise<any[]> {
    const cropCode = facts.crop_code?.toLowerCase() || '';
    const stage = facts.growth_stage?.toLowerCase() || '';
    
    // ═══════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Use crop code variants to match DB short codes
    // DB uses SC, CTN, ALL - not sugarcane, cotton, etc.
    // ═══════════════════════════════════════════════════════════════════════
    const CROP_TO_DB: Record<string, string> = {
      'sugarcane': 'SC', 'cotton': 'CTN', 'soybean': 'SOY',
      'rice': 'RICE', 'paddy': 'RICE', 'wheat': 'WHT',
      'maize': 'MZ', 'corn': 'MZ', 'tomato': 'TOM',
      'onion': 'ONI', 'chilli': 'CHI', 'groundnut': 'GN',
      'banana': 'BAN', 'grape': 'GRP', 'pomegranate': 'POM',
    };
    const dbCode = CROP_TO_DB[cropCode] || cropCode.toUpperCase();
    const variants = new Set([cropCode, cropCode.toUpperCase(), dbCode, 'ALL', 'all', '*', 'universal']);
    const cacheKey = `rules_${dbCode}`;
    
    // Check cache first
    const cached = getCachedRules(cacheKey);
    if (cached) {
      console.log(`   ♻️ [Cache HIT] ${cached.length} rules for crop=${dbCode}`);
      return this.filterByStage(cached, stage);
    }
    
    console.log(`   🔄 [Cache MISS] Loading rules for crop=${dbCode} (variants: ${[...variants].join(',')}) from DB`);
    const variantArr = [...variants];
    const orFilter = variantArr.map(v => `crop_code.eq.${v}`).join(',');
    const { data, error } = await this.supabase
      .from('decision_rules')
      .select('*')
      .eq('is_active', true)
      .or(orFilter)
      .order('priority', { ascending: false })
      .limit(500);
    
    if (error) {
      console.error('❌ Failed to load rules:', error);
      return [];
    }
    
    const allRules = data || [];
    // Cache the full crop rule set (before stage filtering)
    setCachedRules(cacheKey, allRules);
    console.log(`   💾 [Cache SET] ${allRules.length} rules cached for crop=${cropCode} (TTL=5min)`);
    
    return this.filterByStage(allRules, stage);
  }
  
  /**
   * Filter rules by growth stage
   */
  private filterByStage(rules: any[], stage: string): any[] {
    return rules.filter(rule => {
      const stageApplicable = rule.stage_applicable || [];
      if (stageApplicable.length === 0) return true;
      return stageApplicable.some((s: string) => 
        s.toLowerCase() === stage || s === '*' || s === 'all'
      );
    });
  }
  
  /**
   * CRITICAL: Evaluate conditions_json against facts.
   * 
   * BUG #1 FIX: Now handles BOTH formats:
   * 1. Flat DB format (actual): {observations: [...], crop_stage: [...], ndvi_trend, soil_moisture_low, ...}
   * 2. Recursive format (future): {all: [...], any: [...], fact: "...", operator: "..."}
   */
  evaluateConditionsJson(
    conditions: RuleCondition,
    facts: SymbolicFact
  ): { matches: boolean; confidence: number; reason: string; matched_conditions: string[] } {
    const matchedConditions: string[] = [];
    
    // Handle empty conditions (always match with low confidence)
    if (!conditions || Object.keys(conditions).length === 0) {
      return { matches: true, confidence: 0.5, reason: 'No conditions (default)', matched_conditions: [] };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PATH A: Recursive all/any/fact/operator format (future-proof)
    // ═══════════════════════════════════════════════════════════════════════
    if (conditions.all && Array.isArray(conditions.all)) {
      const results = conditions.all.map(c => this.evaluateConditionsJson(c, facts));
      const allMatch = results.every(r => r.matches);
      const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
      results.forEach(r => matchedConditions.push(...r.matched_conditions));
      return {
        matches: allMatch,
        confidence: allMatch ? avgConfidence : 0,
        reason: allMatch ? 'All conditions met' : 'Some conditions failed',
        matched_conditions: matchedConditions
      };
    }
    
    if (conditions.any && Array.isArray(conditions.any)) {
      const results = conditions.any.map(c => this.evaluateConditionsJson(c, facts));
      const anyMatch = results.some(r => r.matches);
      const maxConfidence = Math.max(...results.map(r => r.confidence), 0);
      results.filter(r => r.matches).forEach(r => matchedConditions.push(...r.matched_conditions));
      return {
        matches: anyMatch,
        confidence: anyMatch ? maxConfidence : 0,
        reason: anyMatch ? 'At least one condition met' : 'No conditions met',
        matched_conditions: matchedConditions
      };
    }
    
    if (conditions.fact && conditions.operator) {
      const factValue = this.getFactValue(facts, conditions.fact);
      if (factValue === undefined || factValue === null) {
        return { matches: false, confidence: 0, reason: `Fact '${conditions.fact}' not available`, matched_conditions: [] };
      }
      const matches = this.evaluateOperator(factValue, conditions.operator, conditions.value);
      if (matches) matchedConditions.push(`${conditions.fact} ${conditions.operator} ${conditions.value}`);
      return {
        matches,
        confidence: matches ? 1.0 : 0,
        reason: matches ? `${conditions.fact} ${conditions.operator} ${conditions.value}` : `${conditions.fact} condition failed`,
        matched_conditions: matchedConditions
      };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PATH B: Flat DB format (actual production format)
    // Handles 200+ condition keys from decision_rules.conditions_json
    // ═══════════════════════════════════════════════════════════════════════
    const cond = conditions as any;
    let totalConditions = 0;
    let metConditions = 0;
    
    // Build a combined symptom/observation set for matching
    const factSymptom = (facts.primary_symptom || '').toUpperCase().replace(/[\s-]/g, '_');
    const factQuery = (facts.user_query || '').toUpperCase();
    const factStageUpper = (facts.growth_stage || '').toUpperCase();
    // Bug 2 Fix: Use all_observations for comprehensive matching
    const allObsUpper = (facts.all_observations || []).map(o => o.toUpperCase().replace(/[\s-]/g, '_'));
    
    // ═══════════════════════════════════════════════════════════════════════
    // STAGE KEYS: crop_stage, stage, growth_stage (aliases)
    // ═══════════════════════════════════════════════════════════════════════
    const stageValue = cond.crop_stage || cond.stage || cond.growth_stage;
    if (stageValue) {
      totalConditions++;
      const stages = Array.isArray(stageValue) ? stageValue : [stageValue];
      const stageMatch = stages.some((s: string) => {
        const upper = String(s).toUpperCase();
        return upper === factStageUpper || upper === '*' || upper === 'ALL';
      });
      if (stageMatch) {
        metConditions++;
        matchedConditions.push('crop_stage');
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // OBSERVATION KEYS: observations, symptom, primary_symptom (aliases)
    // ═══════════════════════════════════════════════════════════════════════
    const obsValue = cond.observations || cond.symptom || cond.primary_symptom;
    if (obsValue) {
      totalConditions++;
      const obsList = Array.isArray(obsValue) ? obsValue : [obsValue];
      if (obsList.length > 0) {
        // Bug 2 Fix: Match against ALL observations, not just primary_symptom
        const obsMatch = obsList.some((obs: string) => {
          const upperObs = String(obs).toUpperCase().replace(/[\s-]/g, '_');
          return factSymptom.includes(upperObs) || upperObs.includes(factSymptom) ||
                 factQuery.includes(upperObs) ||
                 allObsUpper.some(ao => ao.includes(upperObs) || upperObs.includes(ao));
        });
        if (obsMatch) {
          metConditions++;
          matchedConditions.push('observations');
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // NDVI KEYS
    // ═══════════════════════════════════════════════════════════════════════
    if (cond.ndvi_level) {
      totalConditions++;
      if (facts.ndvi_status && cond.ndvi_level.toUpperCase() === facts.ndvi_status.toUpperCase()) {
        metConditions++;
        matchedConditions.push('ndvi_level');
      }
    }
    if (cond.ndvi_trend && typeof cond.ndvi_trend === 'string') {
      totalConditions++;
      if (facts.ndvi_trend && cond.ndvi_trend.toUpperCase() === facts.ndvi_trend.toUpperCase()) {
        metConditions++;
        matchedConditions.push('ndvi_trend');
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // SEVERITY
    // ═══════════════════════════════════════════════════════════════════════
    if (cond.severity && typeof cond.severity === 'string') {
      totalConditions++;
      if (facts.severity && cond.severity.toUpperCase() === facts.severity.toUpperCase()) {
        metConditions++;
        matchedConditions.push('severity');
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // KNOWN BOOLEAN/THRESHOLD FLAGS (mapped to SymbolicFact)
    // ═══════════════════════════════════════════════════════════════════════
    const BOOLEAN_FLAG_MAP: Record<string, (f: SymbolicFact) => boolean> = {
      'soil_moisture_low': (f) => f.soil_moisture_estimated === 'DRY',
      'soil_moisture_high': (f) => f.soil_moisture_estimated === 'WET',
      'recent_rain': (f) => f.recent_rain === true,
      'critical_stage': (f) => f.critical_stage === true,
      'high_humidity': (f) => (f.humidity ?? 0) > 80,
      'high_temperature': (f) => (f.temperature ?? 0) > 38,
      'low_temperature': (f) => (f.temperature ?? 0) < 15,
    };
    
    for (const [flagKey, evaluator] of Object.entries(BOOLEAN_FLAG_MAP)) {
      if (cond[flagKey] !== undefined) {
        totalConditions++;
        const expected = cond[flagKey] === true || cond[flagKey] === 'true';
        const actual = evaluator(facts);
        if (expected === actual) {
          metConditions++;
          matchedConditions.push(flagKey);
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // BOOLEAN OBSERVATION FLAGS: keys like black_whip_like_structure, dead_heart,
    // leaf_rolling, pest_present, etc. - matched against primary_symptom
    // These are the 200+ domain-specific keys in conditions_json
    // ═══════════════════════════════════════════════════════════════════════
    const SKIP_KEYS = new Set([
      'crop_stage', 'stage', 'growth_stage', 'observations', 'symptom', 'primary_symptom',
      'ndvi_level', 'ndvi_trend', 'severity', 'trigger_keywords',
      'all', 'any', 'fact', 'operator', 'value',
      'crop_code', 'crop_type', // Already filtered at query level
      ...Object.keys(BOOLEAN_FLAG_MAP),
    ]);
    
    for (const key of Object.keys(cond)) {
      if (SKIP_KEYS.has(key)) continue;
      
      const val = cond[key];
      
      // Skip complex object/array conditions we can't evaluate (etl thresholds, etc.)
      // These are contextual constraints we don't have data for - DON'T reject the rule
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        continue; // Gracefully skip, don't count as failed condition
      }
      if (Array.isArray(val)) {
        continue; // Skip unknown array conditions gracefully
      }
      
      // Boolean flags: {dead_heart: true, black_whip_like_structure: true}
      // Match if the key (as uppercase symbol) matches the primary symptom OR any observation
      if (val === true || val === 'true') {
        totalConditions++;
        const keySymbol = key.toUpperCase().replace(/[\s-]/g, '_');
        if (factSymptom === keySymbol || factSymptom.includes(keySymbol) || 
            keySymbol.includes(factSymptom) || factQuery.includes(keySymbol) ||
            allObsUpper.some(ao => ao === keySymbol || ao.includes(keySymbol) || keySymbol.includes(ao))) {
          metConditions++;
          matchedConditions.push(key);
        }
        continue;
      }
      
      // String value conditions: {pest: "termite", disease: "smut"}
      // Bug 3 Fix: Check if string looks like a numeric threshold first
      if (typeof val === 'string') {
        const thresholdMatch = val.match(/^([<>]=?|==?)\s*(-?\d+\.?\d*)$/);
        if (thresholdMatch) {
          // This is a numeric threshold like "<0.6", ">5.0", ">=3"
          totalConditions++;
          const operator = thresholdMatch[1];
          const threshold = parseFloat(thresholdMatch[2]);
          const factVal = this.getNumericFactForConditionKey(key, facts);
          if (factVal !== null) {
            const passes = this.evaluateThreshold(factVal, operator, threshold);
            if (passes) {
              metConditions++;
              matchedConditions.push(`${key}${val}`);
            }
          }
          // If factVal is null, we don't have the data - condition not met but counted
          continue;
        }
        
        // Regular string matching
        totalConditions++;
        const valUpper = val.toUpperCase().replace(/[\s-]/g, '_');
        if (factSymptom.includes(valUpper) || valUpper.includes(factSymptom) ||
            factQuery.includes(valUpper) ||
            allObsUpper.some(ao => ao.includes(valUpper) || valUpper.includes(ao))) {
          metConditions++;
          matchedConditions.push(key);
        }
        continue;
      }
      
      // false boolean: {etl_exceeded: false, no_match: false}
      if (val === false || val === 'false') {
        // These are negative conditions - skip gracefully, don't penalize
        continue;
      }
      
      // Bug 3 Fix: Evaluate numeric conditions against fact values
      if (typeof val === 'number') {
        totalConditions++;
        const factVal = this.getNumericFactForConditionKey(key, facts);
        if (factVal !== null) {
          // For plain numeric values, check equality (within tolerance)
          if (Math.abs(factVal - val) < 0.01) {
            metConditions++;
            matchedConditions.push(`${key}=${val}`);
          }
        }
        continue;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // SCORING
    // ═══════════════════════════════════════════════════════════════════════
    if (totalConditions === 0) {
      const keys = Object.keys(cond).filter(k => k !== 'trigger_keywords' && !SKIP_KEYS.has(k));
      if (keys.length === 0) {
        return { matches: true, confidence: 0.5, reason: 'No symbolic conditions', matched_conditions: [] };
      }
      // Bug 1 Fix: If conditions existed but were ALL skipped (numeric/object), 
      // do NOT match with 0.4 confidence - this causes false positives
      return { matches: false, confidence: 0, reason: 'All conditions were non-evaluable (numeric/object) - no match', matched_conditions: [] };
    }
    
    const score = metConditions / totalConditions;
    const matches = score >= 0.5; // At least half conditions must match
    
    return {
      matches,
      confidence: matches ? 0.6 + (score * 0.35) : 0,
      reason: matches
        ? `Flat conditions matched: ${metConditions}/${totalConditions} (${matchedConditions.join(', ')})`
        : `Flat conditions failed: ${metConditions}/${totalConditions}`,
      matched_conditions: matchedConditions
    };
  }
  
  /**
   * Get fact value from facts object with normalization
   */
  private getFactValue(facts: SymbolicFact, factName: string): any {
    // Normalize fact name to handle different formats
    const normalizedName = factName.toLowerCase().replace(/[_-]/g, '');
    
    // Direct mapping
    const mapping: Record<string, keyof SymbolicFact> = {
      'crop': 'crop',
      'cropcode': 'crop_code',
      'crop_code': 'crop_code',
      'croptype': 'crop',
      'crop_type': 'crop',
      'stage': 'growth_stage',
      'growthstage': 'growth_stage',
      'growth_stage': 'growth_stage',
      'cropstage': 'growth_stage',
      'crop_stage': 'growth_stage',
      'dos': 'dos',
      'dayssinceowing': 'dos',
      'days_since_sowing': 'dos',
      'symptom': 'primary_symptom',
      'primarysymptom': 'primary_symptom',
      'primary_symptom': 'primary_symptom',
      'visualsymptom': 'primary_symptom',
      'visual_symptom': 'primary_symptom',
      'affectedpart': 'affected_part',
      'affected_part': 'affected_part',
      'severity': 'severity',
      'distribution': 'distribution',
      'ndvi': 'ndvi',
      'ndvivalue': 'ndvi',
      'ndvi_value': 'ndvi',
      'ndvilevel': 'ndvi_status',
      'ndvi_level': 'ndvi_status',
      'ndvitrend': 'ndvi_trend',
      'ndvi_trend': 'ndvi_trend',
      'soilnitrogen': 'soil_n_status',
      'soil_nitrogen': 'soil_n_status',
      'soilphosphorus': 'soil_p_status',
      'soil_phosphorus': 'soil_p_status',
      'soilpotassium': 'soil_k_status',
      'soil_potassium': 'soil_k_status',
      'waterstress': 'stress_level',
      'water_stress': 'stress_level',
      'stresslevel': 'stress_level',
      'stress_level': 'stress_level',
      'userquery': 'user_query',
      'user_query': 'user_query'
    };
    
    const key = mapping[factName.toLowerCase()] || mapping[normalizedName];
    if (key && key in facts) {
      return (facts as any)[key];
    }
    
    // Try direct access
    if (factName in facts) {
      return (facts as any)[factName];
    }
    
    return undefined;
  }
  
  /**
   * Evaluate comparison operator
   */
  private evaluateOperator(factValue: any, operator: string, conditionValue: any): boolean {
    const op = operator.toLowerCase();
    
    switch (op) {
      case 'equal':
      case 'equals':
        return String(factValue).toLowerCase() === String(conditionValue).toLowerCase();
      
      case 'notequal':
      case 'not_equal':
        return String(factValue).toLowerCase() !== String(conditionValue).toLowerCase();
      
      case 'contains':
        if (Array.isArray(factValue)) {
          return factValue.some(v => 
            String(v).toLowerCase().includes(String(conditionValue).toLowerCase())
          );
        }
        return String(factValue).toLowerCase().includes(String(conditionValue).toLowerCase());
      
      case 'in':
        if (Array.isArray(conditionValue)) {
          return conditionValue.some(cv => 
            String(cv).toLowerCase() === String(factValue).toLowerCase()
          );
        }
        return false;
      
      case 'between':
        if (Array.isArray(conditionValue) && conditionValue.length === 2) {
          const numValue = Number(factValue);
          return numValue >= conditionValue[0] && numValue <= conditionValue[1];
        }
        return false;
      
      case 'lessthan':
      case 'less_than':
        return Number(factValue) < Number(conditionValue);
      
      case 'greaterthan':
      case 'greater_than':
        return Number(factValue) > Number(conditionValue);
      
      case 'matches':
        try {
          const regex = new RegExp(conditionValue, 'i');
          return regex.test(String(factValue));
        } catch {
          return false;
        }
      
      default:
        console.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }
  
  /**
   * @deprecated REMOVED per SSOT architecture.
   * Keyword matching is language-dependent and violates symbolic purity.
   * All matching now uses conditions_json only.
   * 
   * This stub remains to prevent TypeScript errors during transition.
   */
  private checkKeywordMatch(
    _keywords: string[],
    _userQuery: string
  ): { matches: boolean; confidence: number; matched_keyword: string | null } {
    console.warn('⚠️ [SymbolicReasoner] checkKeywordMatch is DEPRECATED - use conditions_json only');
    return { matches: false, confidence: 0, matched_keyword: null };
  }
  
  /**
   * Bug 3 Fix: Map condition keys to numeric fact values
   */
  private getNumericFactForConditionKey(key: string, facts: SymbolicFact): number | null {
    const CONDITION_TO_FACT: Record<string, () => number | null> = {
      'soil_zn_ppm': () => null, // Not tracked in SymbolicFact yet
      'soil_ph': () => facts.soil_ph,
      'soil_n': () => facts.soil_n,
      'soil_p': () => facts.soil_p,
      'soil_k': () => facts.soil_k,
      'ndvi': () => facts.ndvi,
      'ndvi_value': () => facts.ndvi,
      'temperature': () => facts.temperature,
      'humidity': () => facts.humidity,
      'dos': () => facts.dos,
      'days_after_sowing': () => facts.dos,
      'land_area_acres': () => facts.land_area_acres,
    };
    const getter = CONDITION_TO_FACT[key.toLowerCase()];
    return getter ? getter() : null;
  }
  
  /**
   * Bug 3 Fix: Evaluate numeric threshold comparison
   */
  private evaluateThreshold(factValue: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '<': return factValue < threshold;
      case '<=': return factValue <= threshold;
      case '>': return factValue > threshold;
      case '>=': return factValue >= threshold;
      case '=': case '==': return Math.abs(factValue - threshold) < 0.01;
      default: return false;
    }
  }
  
  /**
   * Generate human-readable explanation for rule firing
   */
  private generateRuleExplanation(rule: any, facts: SymbolicFact, match: any): string {
    const parts: string[] = [];
    
    parts.push(`Rule ${rule.rule_id} matched`);
    
    if (match.matched_conditions && match.matched_conditions.length > 0) {
      parts.push(`because: ${match.matched_conditions.slice(0, 3).join(', ')}`);
    }
    
    if (rule.scientific_basis) {
      parts.push(`(${rule.scientific_basis})`);
    }
    
    return parts.join(' ');
  }
  
  /**
   * Update hypotheses map with new rule match
   */
  private updateHypotheses(
    hypotheses: Map<string, Hypothesis>,
    rule: any,
    confidence: number
  ): void {
    const causeId = rule.cause || rule.rule_id;
    
    if (hypotheses.has(causeId)) {
      const existing = hypotheses.get(causeId)!;
      // Boost confidence with additional evidence
      existing.confidence = Math.min(0.98, existing.confidence + (confidence * 0.2));
      existing.supporting_rules.push(rule.rule_id);
    } else {
      hypotheses.set(causeId, {
        cause_id: causeId,
        cause_name: rule.cause || rule.rule_id,
        confidence: confidence * (rule.confidence_score || 0.7),
        evidence: [rule.scientific_basis || 'rule match'],
        supporting_rules: [rule.rule_id]
      });
    }
  }
  
  /**
   * Rank hypotheses by confidence and supporting evidence
   */
  private rankHypotheses(
    hypotheses: Map<string, Hypothesis>,
    facts: SymbolicFact
  ): Hypothesis[] {
    const ranked = Array.from(hypotheses.values());
    
    // Sort by confidence, then by number of supporting rules
    ranked.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.1) {
        return b.confidence - a.confidence;
      }
      return b.supporting_rules.length - a.supporting_rules.length;
    });
    
    return ranked;
  }
  
  /**
   * Calculate final confidence based on all factors
   */
  private calculateFinalConfidence(
    hypotheses: Hypothesis[],
    firedRules: FiredRule[],
    facts: SymbolicFact
  ): number {
    if (hypotheses.length === 0 && firedRules.length === 0) {
      return 0.3; // Low confidence when nothing matched
    }
    
    let confidence = 0.5; // Base confidence
    
    // Boost from matching rules
    if (firedRules.length > 0) {
      confidence += Math.min(0.3, firedRules.length * 0.05);
    }
    
    // Boost from top hypothesis
    if (hypotheses.length > 0) {
      confidence = Math.max(confidence, hypotheses[0].confidence);
    }
    
    // Data completeness boost
    confidence += (facts.data_completeness / 100) * 0.1;
    
    // Cap at 95%
    return Math.min(0.95, confidence);
  }
  
  /**
   * Map observations and authoritative state to SymbolicFact
   */
  static mapToSymbolicFact(
    canonicalState: CanonicalState,
    landState: AuthoritativeLandState | null,
    userQuery: string
  ): SymbolicFact {
    // Calculate data completeness
    let dataPoints = 0;
    let availablePoints = 0;
    
    if (landState?.crop.current_crop) { dataPoints++; availablePoints++; } else { availablePoints++; }
    if (landState?.ndvi.latest_value !== null) { dataPoints++; availablePoints++; } else { availablePoints++; }
    if (landState?.soil.nitrogen_kg_per_ha !== null) { dataPoints++; availablePoints++; } else { availablePoints++; }
    if (landState?.weather.temperature !== null) { dataPoints++; availablePoints++; } else { availablePoints++; }
    
    const dataCompleteness = availablePoints > 0 ? (dataPoints / availablePoints) * 100 : 0;
    
    // Calculate NDVI status
    const ndviValue = landState?.ndvi.latest_value;
    let ndviStatus = 'UNKNOWN';
    if (ndviValue !== null && ndviValue !== undefined) {
      if (ndviValue >= 0.6) ndviStatus = 'HEALTHY';
      else if (ndviValue >= 0.4) ndviStatus = 'MODERATE';
      else if (ndviValue >= 0.25) ndviStatus = 'LOW';
      else ndviStatus = 'CRITICAL';
    }
    
    // Calculate soil nutrient status
    const getNutrientStatus = (value: number | null, lowThreshold: number, highThreshold: number): string => {
      if (value === null) return 'UNKNOWN';
      if (value < lowThreshold) return 'LOW';
      if (value > highThreshold) return 'HIGH';
      return 'ADEQUATE';
    };
    
    // Calculate stress level
    let stressLevel = 'UNKNOWN';
    if (ndviValue !== null && ndviValue !== undefined) {
      if (ndviValue < 0.3) stressLevel = 'SEVERE';
      else if (ndviValue < 0.4) stressLevel = 'MODERATE';
      else if (ndviValue < 0.5) stressLevel = 'MILD';
      else stressLevel = 'NONE';
    }
    
    // Determine if critical stage
    const dos = landState?.crop.days_since_sowing || 0;
    const stage = landState?.crop.growth_stage?.toUpperCase() || canonicalState.crop_stage || '';
    const criticalStage = ['GERMINATION', 'FLOWERING', 'GRAIN_FILLING'].includes(stage);
    
    // Calculate risk level
    let riskLevel = 'MEDIUM';
    if (stressLevel === 'SEVERE' || canonicalState.severity === 'CRITICAL') {
      riskLevel = 'HIGH';
    } else if (stressLevel === 'NONE' && canonicalState.severity === 'MILD') {
      riskLevel = 'LOW';
    }
    
    return {
      // Core context
      crop: landState?.crop.current_crop || canonicalState.crop_type || 'UNKNOWN',
      crop_code: landState?.crop.crop_code || canonicalState.crop_type?.toLowerCase() || '',
      dos: dos,
      growth_stage: stage,
      land_area_acres: landState?.area_acres || 0,
      
      // Symptom facts
      primary_symptom: canonicalState.visual_symptom || 'UNKNOWN',
      affected_part: canonicalState.affected_part || 'unknown',
      distribution: canonicalState.distribution || 'unknown',
      severity: canonicalState.severity || 'unknown',
      progression: 'unknown',
      
      // Bug 2 Fix: Initialize empty - will be populated by FactExtractor
      all_observations: [],
      has_pest_evidence: false,
      
      // Environmental facts
      ndvi: ndviValue,
      ndvi_trend: landState?.ndvi.trend?.toUpperCase() || 'UNKNOWN',
      ndvi_status: ndviStatus,
      temperature: landState?.weather.temperature,
      humidity: landState?.weather.humidity,
      recent_rain: (landState?.weather.rainfall_last_24h || 0) > 5,
      soil_moisture_estimated: (landState?.weather.rainfall_last_24h || 0) > 10 ? 'WET' : 
                               (landState?.weather.rainfall_last_24h || 0) > 0 ? 'MOIST' : 'DRY',
      
      // Soil facts
      soil_n: landState?.soil.nitrogen_kg_per_ha,
      soil_n_status: getNutrientStatus(landState?.soil.nitrogen_kg_per_ha || null, 200, 400),
      soil_p: landState?.soil.phosphorus_kg_per_ha,
      soil_p_status: getNutrientStatus(landState?.soil.phosphorus_kg_per_ha || null, 10, 25),
      soil_k: landState?.soil.potassium_kg_per_ha,
      soil_k_status: getNutrientStatus(landState?.soil.potassium_kg_per_ha || null, 120, 280),
      soil_ph: landState?.soil.ph,
      
      // Derived facts
      stress_level: stressLevel,
      critical_stage: criticalStage,
      data_completeness: dataCompleteness,
      risk_level: riskLevel,
      
      // Farmer action facts
      user_query: userQuery,
      recent_treatments: []
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let reasonerInstance: SymbolicReasoner | null = null;

/**
 * GAP #1 FIX: Accept optional Supabase client for connection reuse.
 */
export function getSymbolicReasoner(supabaseClient?: any): SymbolicReasoner {
  if (!reasonerInstance) {
    reasonerInstance = new SymbolicReasoner(supabaseClient);
  }
  return reasonerInstance;
}

// Export convenience function with urgency support
export async function executeSymbolicReasoning(
  canonicalState: CanonicalState,
  landState: AuthoritativeLandState | null,
  userQuery: string,
  options?: {
    allowFuzzyMatch?: boolean;
    minFuzzyScore?: number;
    urgencyOverride?: boolean;
  }
): Promise<InferenceResult> {
  const facts = SymbolicReasoner.mapToSymbolicFact(canonicalState, landState, userQuery);
  const reasoner = getSymbolicReasoner();
  return reasoner.executeRules(facts, landState, options);
}

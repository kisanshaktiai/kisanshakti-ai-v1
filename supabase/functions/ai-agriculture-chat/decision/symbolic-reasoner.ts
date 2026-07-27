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
 * CHANGE LOG (newest first)
 *   2026-07-27 00:00 UTC — FIX F1: corrected inverted canonical_group_mapping
 *     join (engine_group, not biological_group) + [ONTOLOGY_JOIN_ZERO] drift
 *     probe. FIX F4-A: normalize observation codes via canonicalObsCode before
 *     the observation_master .in() lookup.
 *
 * VERSION: 1.0.0 - Initial Production Release
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { CanonicalState } from '../agents/canonical-state-builder.ts';
import { canonicalObsCode, canonicalStageKey } from '../utils/canonical-code.ts';


// ═══════════════════════════════════════════════════════════════════════════
// NUTRITION CONFLICT ARBITRATION
// ═══════════════════════════════════════════════════════════════════════════
import {
  passesZincSpecificityGate,
  passesMicronutrientSpecificityGate,
  checkWaterStressDominance,
  checkMacronutrientDominance,
  auditNutritionRuleSpecificity,
  type DominanceBlockResult,
} from './nutrition-conflict-arbitrator.ts';

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
  
  // Soil facts — macronutrients
  soil_n: number | null;
  soil_n_status: string;
  soil_p: number | null;
  soil_p_status: string;
  soil_k: number | null;
  soil_k_status: string;
  soil_ph: number | null;
  
  // Soil facts — micronutrients (populated when soil test data available)
  soil_zn_ppm: number | null;
  soil_fe_ppm: number | null;
  soil_mn_ppm: number | null;
  soil_mg_cmol: number | null;
  soil_s_ppm: number | null;
  soil_b_ppm: number | null;
  
  // Derived facts
  stress_level: string;
  critical_stage: boolean;
  data_completeness: number;
  risk_level: string;
  
  // Farmer action facts
  user_query: string;
  recent_treatments: string[];

  // PHASE C — Morphology reconciliation evidence (optional; null when phenology
  // or observed morphology is unavailable). Never drives a decision by itself;
  // used to nudge confidence and hint at stage shift.
  morphology_evidence?: {
    overall_status: 'CONSISTENT' | 'MILD_DEVIATION' | 'MAJOR_DEVIATION' | 'INSUFFICIENT_DATA';
    stage_shift_hint: 'AHEAD' | 'BEHIND' | null;
    confidence_delta: number;
    ndvi_status: 'BELOW' | 'IN_RANGE' | 'ABOVE' | 'UNKNOWN';
    height_status: 'BELOW' | 'IN_RANGE' | 'ABOVE' | 'UNKNOWN';
    leaf_status: 'BELOW' | 'IN_RANGE' | 'ABOVE' | 'UNKNOWN';
  } | null;
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
// OBSERVATION METADATA CACHE - For ontology bridge + pre-filtering
// Caches observation_master metadata with canonical_group_mapping join
// ═══════════════════════════════════════════════════════════════════════════

interface ObservationMetadata {
  observation_code: string;
  observation_category: string | null;
  affected_plant_part: string | null;
  canonical_group: string | null;
  is_diagnostic: boolean;
  observation_type: string | null;       // PRIMARY, SECONDARY, GENERIC
  symptom_type: string | null;           // e.g., VISUAL, GROWTH, DAMAGE
  symptom_pattern: string | null;        // e.g., UNIFORM, PATCHY, RING
  severity_level: string | null;         // e.g., MILD, MODERATE, SEVERE
  discriminator_score: number;           // 0-100, how uniquely diagnostic
  frequency_score: number;               // 0-100, how common in field
  clarity_score: number;                 // 0-100, how easy to observe
  engine_groups: { engine_group: string; confidence: number }[];
}

interface CachedObsMetadata {
  data: Map<string, ObservationMetadata>;
  expiresAt: number;
}

const obsMetadataCache = new Map<string, CachedObsMetadata>();

function getCachedObsMetadata(cacheKey: string): Map<string, ObservationMetadata> | null {
  const entry = obsMetadataCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    obsMetadataCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setCachedObsMetadata(cacheKey: string, data: Map<string, ObservationMetadata>): void {
  if (obsMetadataCache.size > 30) {
    const now = Date.now();
    for (const [key, val] of obsMetadataCache) {
      if (now > val.expiresAt) obsMetadataCache.delete(key);
    }
  }
  obsMetadataCache.set(cacheKey, { data, expiresAt: Date.now() + RULE_CACHE_TTL_MS });
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
        
        // ═══════════════════════════════════════════════════════════════════════
        // FIX 1: NDVI/ABIOTIC STRESS RULE GUARD
        // Skip abiotic rules when biotic (pest/disease) evidence exists
        // ═══════════════════════════════════════════════════════════════════════
        const ruleCategory = rule.category?.toLowerCase() || '';
        const isAbioticRule = ['water_stress', 'irrigation', 'stress', 'ndvi'].includes(ruleCategory);
        
        if (isAbioticRule && facts.has_pest_evidence) {
          console.log(`   🚫 [BioticGuard] Skipping abiotic rule ${rule.rule_id} (category=${ruleCategory}) - pest evidence present`);
          continue;
        }
        
        // Check if biotic observations exist in all_observations
        const BIOTIC_OBS_KEYS = ['BORE_HOLES', 'DEAD_HEART', 'INSECT_PRESENCE', 'FRASS', 'WEBBING', 
          'STEM_BORING_MARKS', 'LEAF_CHEWING', 'DEAD_HEART_PRESENT', 'INSECT_PRESENCE_CONFIRMED',
          'FRASS_VISIBLE', 'WEBBING_PRESENT', 'BORER_SUSPECTED'];
        const hasBioticObs = (facts.all_observations || []).some(obs => 
          BIOTIC_OBS_KEYS.some(key => obs.includes(key))
        );
        
        if (isAbioticRule && hasBioticObs) {
          console.log(`   🚫 [BioticGuard] Skipping abiotic rule ${rule.rule_id} - biotic observations detected in all_observations`);
          continue;
        }
        
        // Block NDVI-only rules unless intent explicitly indicates stress/irrigation
        const conditionsStr = JSON.stringify(rule.conditions_json || {}).toLowerCase();
        const isNdviOnlyRule = (conditionsStr.includes('ndvi_level') || conditionsStr.includes('ndvi_trend')) && 
                               !conditionsStr.includes('primary_symptom') && !conditionsStr.includes('observation');
        const stressIntents = ['WATER_STRESS_SIGNAL', 'IRRIGATION_QUERY', 'IRRIGATION_SCHEDULING'];
        const currentIntent = facts.user_query?.match(/\[INTENT:([^\]]+)\]/)?.[1] || '';
        
        if (isNdviOnlyRule && !stressIntents.includes(currentIntent)) {
          console.log(`   🚫 [NDVIGuard] Skipping NDVI-only rule ${rule.rule_id} - intent ${currentIntent || 'NONE'} is not stress/irrigation`);
          continue;
        }
        
        // Bug 1 Fix: Category-based exclusion - skip nutrition rules when pest evidence exists
        if (facts.has_pest_evidence && ruleCategory === 'nutrition') {
          console.log(`   🚫 [PestExclusion] Skipping nutrition rule ${rule.rule_id} - pest evidence present`);
          continue;
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // NUTRITION CONFLICT ARBITRATION: Water stress & macro dominance gates
        // ═══════════════════════════════════════════════════════════════════════
        // ruleCategory already declared above
        const isNutritionRule = ruleCategory.includes('nutrition') || ruleCategory.includes('deficiency');
        
        if (isNutritionRule) {
          // Water stress dominance: blocks ALL urgent nutrient treatments
          const waterBlock = checkWaterStressDominance(
            facts.all_observations || [],
            rule.action_type || '',
            rule.category || ''
          );
          if (waterBlock.blocked) {
            console.log(`   🚫 [WaterStressDominance] ${rule.rule_id} blocked: ${waterBlock.reason}`);
            continue;
          }
          
          // Macronutrient dominance: N confirmed blocks micro urgent without soil evidence
          const macroBlock = checkMacronutrientDominance(
            facts.all_observations || [],
            rule.rule_id,
            rule.cause || '',
            { soil_zn_deficient: facts.soil_n_status === 'DEFICIENT' ? undefined : undefined }
          );
          if (macroBlock.blocked) {
            console.log(`   🚫 [MacroDominance] ${rule.rule_id} blocked: ${macroBlock.reason}`);
            continue;
          }
          
          // Zinc specificity gate: requires zinc-specific marker or soil evidence
          const zincGate = passesZincSpecificityGate(
            rule.rule_id,
            [],
            { all_observations: facts.all_observations }
          );
          if (!zincGate.passes) {
            console.log(`   🚫 [ZincGate] ${rule.rule_id} blocked: ${zincGate.reason}`);
            continue;
          }
          
          // Micronutrient specificity gate: blocks Fe/Mn/S rules without specific evidence
          const microGate = passesMicronutrientSpecificityGate(
            rule.rule_id,
            [],
            { all_observations: facts.all_observations }
          );
          if (!microGate.passes) {
            console.log(`   🚫 [MicronutrientGate] ${rule.rule_id} blocked: ${microGate.reason}`);
            continue;
          }
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
        let matchConfidence = Math.max(
          match.confidence, 
          partialMatch?.confidence ?? 0
        );
        
        // ═══════════════════════════════════════════════════════════════════════
        // DIAGNOSTIC CONFIDENCE BOOST (graduated by discriminator_score)
        // Uses observation_master.discriminator_score (0-100) + observation_type
        // PRIMARY obs with high discriminator → up to 1.5x boost
        // ═══════════════════════════════════════════════════════════════════════
        if (matches) {
          const obsMeta = (this as any)._currentObsMetadata as Map<string, ObservationMetadata> | undefined;
          if (obsMeta && obsMeta.size > 0) {
            let maxBoost = 1.0;
            for (const obs of (facts.all_observations || [])) {
              const meta = obsMeta.get(obs);
              if (!meta) continue;
              const disc = meta.discriminator_score ?? 50;
              // Graduated boost: disc=100 → 1.5x, disc=75 → 1.4x, disc=50 → 1.25x, disc=25 → 1.1x
              let boost = 1.0 + (disc / 200); // Maps 0-100 → 1.0-1.5
              // PRIMARY observations get extra 0.05 boost
              if (meta.observation_type === 'PRIMARY') boost += 0.05;
              // is_diagnostic legacy flag also boosts
              if (meta.is_diagnostic) boost = Math.max(boost, 1.4);
              maxBoost = Math.max(maxBoost, boost);
            }
            if (maxBoost > 1.0) {
              matchConfidence = Math.min(1.0, matchConfidence * maxBoost);
              console.log(`   🔬 [DiagBoost] discriminator_score boost ${maxBoost.toFixed(2)}x → confidence ${(matchConfidence * 100).toFixed(0)}%`);
            }
          }
        }
        
        if (matches) {
          const matchType = match.matches ? 'EXACT' : 'PARTIAL';
          console.log(`   ✅ Rule fired: ${rule.rule_id} (conf: ${(matchConfidence * 100).toFixed(0)}%, type: ${matchType})`);
          
          // SSOT: FiredRule uses language-independent fields ONLY
          // response_mr/hi/en columns were DROPPED per SSOT architecture
          const firedRule: FiredRule = {
            rule_id: rule.rule_id,
            rule_name: rule.cause || rule.rule_id,
            category: rule.category,
            confidence: (() => {
              const cs = rule.confidence_score;
              if (cs != null && cs > 1) {
                console.error(`[symbolic-reasoner] confidence_score out of range: ${cs} for rule ${rule.rule_id}. Expected 0–1 float. DB migration may not have run.`);
              }
              return cs || matchConfidence;
            })(),
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
      
    // 4. Sort by AUTHORITY HIERARCHY: SAFETY > BIOTIC > ABIOTIC > WEATHER > NDVI
      const CATEGORY_PRIORITY: Record<string, number> = {
        safety: 0, pest: 1, disease: 2, ipm: 2, nutrition: 4, deficiency: 4,
        water_stress: 5, stress: 5, irrigation: 5, weather: 6, ndvi: 7, general: 8
      };
      firedRules.sort((a, b) => {
        const catA = CATEGORY_PRIORITY[a.category?.toLowerCase()] || 3;
        const catB = CATEGORY_PRIORITY[b.category?.toLowerCase()] || 3;
        if (catA !== catB) return catA - catB; // Lower = higher priority
        // P2-1: data_authority_rank DESC (higher rank = higher authority)
        const rankA = (a as any).data_authority_rank ?? 50;
        const rankB = (b as any).data_authority_rank ?? 50;
        if (rankA !== rankB) return rankB - rankA;
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
    // UNIFIED: Use crop-code-normalizer instead of inline CROP_TO_DB map
    // ═══════════════════════════════════════════════════════════════════════
    const { normalizeCropCode: normCrop, getCropCodeVariants: getVariants } = await import('../utils/crop-code-normalizer.ts');
    const dbCode = normCrop(cropCode);
    const variants = new Set(getVariants(cropCode));
    const cacheKey = `rules_${dbCode}`;
    
    // Check cache first
    const cached = getCachedRules(cacheKey);
    if (cached) {
      console.log(`   ♻️ [Cache HIT] ${cached.length} rules for crop=${dbCode}`);
      const stageFiltered = this.filterByStage(cached, stage);
      // Apply observation layer filtering
      return await this.applyObservationLayerFilter(stageFiltered, facts);
    }
    
    console.log(`   🔄 [Cache MISS] Loading rules for crop=${dbCode} (variants: ${[...variants].join(',')}) from DB`);
    const variantArr = [...variants];
    const orFilter = variantArr.map(v => `crop_code.eq.${v}`).join(',');
    // P2-4: Filter deprecated rules + order by authority rank then priority
    const { data, error } = await this.supabase
      .from('decision_rules')
      .select('*')
      .eq('is_active', true)
      .or(orFilter)
      .is('deprecated_at', null)
      .order('data_authority_rank', { ascending: false })
      .order('priority', { ascending: false })
      .limit(500);
    
    if (error) {
      console.error('❌ Failed to load rules:', error);
      return [];
    }
    
    const allRules = data || [];
    // Cache the full crop rule set (before stage filtering)
    setCachedRules(cacheKey, allRules);
    console.log(`   💾 [Cache SET] ${allRules.length} rules cached for crop=${dbCode} (TTL=5min)`);
    
    const stageFiltered = this.filterByStage(allRules, stage);
    // Apply observation layer filtering
    return await this.applyObservationLayerFilter(stageFiltered, facts);
  }
  
  /**
   * OBSERVATION LAYER: Load observation metadata from observation_master + canonical_group_mapping
   * Caches results with same TTL as rule cache.
   */
  private async loadObservationMetadata(observationCodes: string[]): Promise<Map<string, ObservationMetadata>> {
    if (!observationCodes || observationCodes.length === 0) {
      return new Map();
    }
    
    // FIX F4-A (2026-07-26): observation_master.observation_code is 100%
    // lower_snake in the DB. Upstream may pass UPPER_SNAKE codes from
    // extractor/ledger. Normalize at the boundary so the .in() lookup
    // actually matches. Deduplicate after normalization.
    const normalizedCodes = Array.from(
      new Set(
        (observationCodes || [])
          .map((c) => canonicalObsCode(c))
          .filter((c): c is string => !!c && c.length > 0),
      ),
    );
    if (normalizedCodes.length === 0) return new Map();
    
    const cacheKey = `obs_meta_${normalizedCodes.sort().join(',')}`;
    const cached = getCachedObsMetadata(cacheKey);
    if (cached) {
      console.log(`   ♻️ [ObsMeta Cache HIT] ${cached.size} observations`);
      return cached;
    }
    
    try {
      // Query observation_master for metadata
      const { data: obsData, error: obsError } = await this.supabase
        .from('observation_master')
        .select('observation_code, observation_category, affected_plant_part, canonical_group, is_diagnostic, observation_type, symptom_type, symptom_pattern, severity_level, discriminator_score, frequency_score, clarity_score')
        .in('observation_code', normalizedCodes);
      
      if (obsError) {
        console.error('❌ [ObsMeta] Failed to load observation metadata:', obsError.message);
        return new Map();
      }
      
      // Query canonical_group_mapping for ontology ENRICHMENT (not identity).
      const bioGroups = [...new Set((obsData || []).map((o: any) => o.canonical_group).filter(Boolean))];
      let mappingData: any[] = [];
      
      if (bioGroups.length > 0) {
        // 2026-07-27 — DB-VERIFIED CORRECTION of FIX F1 (2026-07-26).
        // `observation_master.canonical_group` values ARE engine groups
        // ('01_physiology', '03_pest', '04_disease', '06_abiotic', ...) and
        // `canonical_group_mapping.engine_group` holds the SAME strings, so
        // the F1 join was tautological: it could only ever re-derive the value
        // already present on the observation row. When the read returned zero
        // rows (privileges / cache), `engine_groups` collapsed to [] and the
        // ObsFilter logged `EngineGroups: []` — a false alarm, since the tier
        // widening matches on `canonical_group`, never on `engine_group`.
        //
        // New contract: canonical_group IS the engine group (identity, always
        // present). canonical_group_mapping only ENRICHES it with the
        // biological label. Missing mapping rows are informational.
        const { data: mapData, error: mapError } = await this.supabase
          .from('canonical_group_mapping')
          .select('biological_group, engine_group, confidence')
          .in('engine_group', bioGroups);
        
        if (mapError) {
          console.warn(`[ObsMeta] canonical_group_mapping fetch error: ${mapError.message}`);
        } else if (mapData) {
          mappingData = mapData;
          if (mapData.length === 0) {
            console.log(
              `[ONTOLOGY_ENRICHMENT_EMPTY] no canonical_group_mapping rows for engine_groups=[${bioGroups.join(',')}] ` +
              `— engine groups still resolved from observation_master.canonical_group (identity). Non-blocking.`,
            );
          }
        }
      }
      
      // Build metadata map
      const result = new Map<string, ObservationMetadata>();
      for (const obs of (obsData || [])) {
        // Identity edge (always non-empty when canonical_group is set). The
        // mapping table adds no additional engine group — only the biological
        // label — so it never widens this list.
        const engineGroups: Array<{ engine_group: string; confidence: number }> = [];
        if (obs.canonical_group) {
          engineGroups.push({ engine_group: obs.canonical_group, confidence: 1 });
        }



        
        result.set(obs.observation_code, {
          observation_code: obs.observation_code,
          observation_category: obs.observation_category,
          affected_plant_part: obs.affected_plant_part,
          canonical_group: obs.canonical_group,
          is_diagnostic: obs.is_diagnostic === true,
          observation_type: obs.observation_type || 'GENERIC',
          symptom_type: obs.symptom_type || null,
          symptom_pattern: obs.symptom_pattern || null,
          severity_level: obs.severity_level || null,
          discriminator_score: obs.discriminator_score ?? 50,
          frequency_score: obs.frequency_score ?? 50,
          clarity_score: obs.clarity_score ?? 50,
          engine_groups: engineGroups
        });
      }
      
      console.log(`   📋 [ObsMeta] Loaded ${result.size} observation metadata entries, ${mappingData.length} ontology mappings`);
      setCachedObsMetadata(cacheKey, result);
      return result;
      
    } catch (e) {
      console.error('❌ [ObsMeta] Exception:', e);
      return new Map();
    }
  }
  
  /**
   * OBSERVATION LAYER: Apply category + plant-part pre-filtering to candidate rules
   * Uses ontology bridge (canonical_group_mapping) for narrowing.
   * Implements WHOLE wildcard logic per SQL architecture.
   */
  private async applyObservationLayerFilter(rules: any[], facts: SymbolicFact): Promise<any[]> {
    const rawObservations = facts.all_observations || [];
    if (rawObservations.length === 0) {
      console.log(`   ⏭️ [ObsFilter] No observations - skipping pre-filter`);
      return rules;
    }

    // ─── OBSERVATION BRIDGE ───────────────────────────────────────────────
    // Generic extractor codes (POOR_GERMINATION) must be bridged to the
    // crop's canonical observation_master vocabulary before metadata lookup.
    //
    // 2026-07-27 GUARD: the alias pass previously rewrote EVERY code, so a
    // code that already exists in `observation_master` could be replaced by an
    // unrelated alias target (`STUNTED_GROWTH → obs_rice_patchy_emergence` in
    // production). Now that this filter receives the unified graph observation
    // stream, those codes are already canonical and MUST pass through
    // untouched. Alias resolution applies ONLY to codes absent from
    // observation_master.
    const cropForBridge = String(facts.crop_code || facts.crop || '').toLowerCase().trim();
    let observations: string[] = [...rawObservations];
    try {
      const { bridgeCodes } = await import('./concept-bridge.ts');
      const bridged = bridgeCodes(cropForBridge, rawObservations as string[]);
      if (bridged && bridged.length > 0) observations = bridged;

      const canonCodes = Array.from(
        new Set(observations.map((o) => canonicalObsCode(o)).filter(Boolean)),
      );

      // Which of these already exist in observation_master? Those are frozen.
      const { data: masterRows } = await this.supabase
        .from('observation_master')
        .select('observation_code')
        .in('observation_code', canonCodes);
      const inMaster = new Set(
        (Array.isArray(masterRows) ? masterRows : []).map((r: any) =>
          canonicalObsCode(r?.observation_code),
        ),
      );

      const unresolved = canonCodes.filter((c) => !inMaster.has(c));
      if (unresolved.length > 0) {
        const { data: aliasRows } = await this.supabase
          .from('observation_aliases')
          .select('alias_code, canonical_code')
          .in('alias_code', unresolved);
        if (Array.isArray(aliasRows) && aliasRows.length > 0) {
          const aliasMap = new Map<string, string>();
          for (const row of aliasRows as any[]) {
            if (row?.alias_code && row?.canonical_code) {
              aliasMap.set(canonicalObsCode(row.alias_code), String(row.canonical_code));
            }
          }
          observations = observations.map((o) => {
            const c = canonicalObsCode(o);
            if (inMaster.has(c)) return o; // already canonical — never rewrite
            return aliasMap.get(c) ?? o;
          });
        }
      }

      const changed =
        observations.length !== rawObservations.length ||
        observations.some((v, i) => v !== rawObservations[i]);
      if (changed) {
        console.log(
          `   🧩 [OBSERVATION_BRIDGE] crop=${cropForBridge} raw=[${rawObservations.join(',')}] → bridged=[${observations.join(',')}] ` +
            `(master_frozen=${inMaster.size} alias_resolved=${unresolved.length})`,
        );
      }
    } catch (e) {
      console.warn(`   ⚠️ [OBSERVATION_BRIDGE] Bridge failed, using raw codes: ${(e as Error).message}`);
    }


    const obsMeta = await this.loadObservationMetadata(observations);
    if (obsMeta.size === 0) {
      console.log(`   ⏭️ [ObsFilter] No observation metadata found for [${observations.join(',')}] - skipping pre-filter`);
      return rules;
    }
    
    // Store metadata for later use in confidence boosting
    (this as any)._currentObsMetadata = obsMeta;
    
    // Collect observation categories and plant parts
    const obsCategories = new Set<string>();
    const obsPlantParts = new Set<string>();
    const obsEngineGroups = new Set<string>();
    
    for (const [, meta] of obsMeta) {
      if (meta.observation_category) obsCategories.add(meta.observation_category);
      if (meta.affected_plant_part) obsPlantParts.add(meta.affected_plant_part);
      for (const eg of meta.engine_groups) {
        obsEngineGroups.add(eg.engine_group);
      }
    }
    
    console.log(`   🔬 [ObsFilter] Categories: [${[...obsCategories].join(',')}], Parts: [${[...obsPlantParts].join(',')}], EngineGroups: [${[...obsEngineGroups].join(',')}]`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // P3: TIERED RULE-FILTER WIDENING — never collapse candidates to zero.
    // Tier 0 = category + plant_part (strictest)
    // Tier 1 = drop required_plant_part
    // Tier 2 = drop required_observation_category
    // Tier 3 = widen by canonical_group
    // Tier 4 = widen by crop_code
    // Tier 5 = universal scope (all input rules)
    // Returns the WIDEST NON-EMPTY tier. Purely structural — no agronomy.
    // ═══════════════════════════════════════════════════════════════════════
    const obsCanonicalGroups = new Set<string>();
    for (const [, meta] of obsMeta) {
      const cg = (meta as any)?.canonical_group;
      if (cg) obsCanonicalGroups.add(String(cg).toUpperCase());
    }

    const matchCat = (rule: any): boolean => {
      const reqCat = rule.required_observation_category;
      if (!reqCat || !Array.isArray(reqCat) || reqCat.length === 0) return true;
      return reqCat.some((cat: string) => obsCategories.has(cat));
    };
    const matchPart = (rule: any): boolean => {
      const reqPart = rule.required_plant_part;
      if (!reqPart || !Array.isArray(reqPart) || reqPart.length === 0) return true;
      return (
        obsPlantParts.has('WHOLE') ||
        reqPart.includes('WHOLE') ||
        reqPart.some((part: string) => obsPlantParts.has(part))
      );
    };
    const matchGroup = (rule: any): boolean => {
      const cg = rule.canonical_group;
      if (!cg) return true;
      if (obsCanonicalGroups.size === 0) return true;
      return obsCanonicalGroups.has(String(cg).toUpperCase());
    };

    const beforeCount = rules.length;
    const tiers: Array<{ tier: number; label: string; fn: (r: any) => boolean }> = [
      { tier: 0, label: 'CATEGORY+PART', fn: (r) => matchCat(r) && matchPart(r) },
      { tier: 1, label: 'CATEGORY_ONLY', fn: (r) => matchCat(r) },
      { tier: 2, label: 'PART_ONLY', fn: (r) => matchPart(r) },
      { tier: 3, label: 'CANONICAL_GROUP', fn: (r) => matchGroup(r) },
      { tier: 4, label: 'CROP_SCOPE', fn: () => true },
    ];

    let filtered: any[] = [];
    let appliedTier = 0;
    for (const t of tiers) {
      filtered = rules.filter(t.fn);
      appliedTier = t.tier;
      if (filtered.length > 0) {
        if (t.tier > 0) {
          console.warn(
            `   🔓 [RULE_FILTER_WIDEN] tier=${t.tier} label=${t.label} pre=${beforeCount} post=${filtered.length}`,
          );
        }
        break;
      }
      if (beforeCount > 0) {
        console.warn(`   🔓 [RULE_FILTER_WIDEN] tier=${t.tier} label=${t.label} pre=${beforeCount} post=0 → widening`);
      } else {
        break;
      }
    }
    // Tier 5: universal scope — never return empty when candidates existed.
    if (filtered.length === 0 && beforeCount > 0) {
      filtered = rules;
      appliedTier = 5;
      console.warn(`   🔓 [RULE_FILTER_WIDEN] tier=5 label=UNIVERSAL pre=${beforeCount} post=${filtered.length}`);
    }

    const removedCount = beforeCount - filtered.length;
    if (removedCount > 0) {
      console.log(
        `   🎯 [ObsFilter] Filtered ${removedCount} rules by category/plant-part (${beforeCount} → ${filtered.length}) tier=${appliedTier}`,
      );
    }
    
    // Candidate explosion warning
    if (filtered.length > 25) {
      console.warn(`   ⚠️ [RULE_EXPLOSION] ${filtered.length} candidate rules for ${observations.length} observations - consider tighter required_observation_category/required_plant_part constraints`);
    }
    
    return filtered;
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
    
    // Build a combined symptom/observation set for matching.
    // 2026-07-26 (audit F3): every side of an observation comparison is folded
    // through the canonical-code SSOT (`utils/canonical-code.ts`) so DB
    // lower_snake_case codes and runtime-uppercased symbols cannot mismatch.
    const factSymptom = canonicalObsCode(facts.primary_symptom);
    const factQuery = canonicalObsCode(facts.user_query);
    const factStageCanon = canonicalStageKey(facts.growth_stage);
    const allObsCanon = (facts.all_observations || []).map(o => canonicalObsCode(o)).filter(Boolean);

    
    // ═══════════════════════════════════════════════════════════════════════
    // STAGE KEYS: crop_stage, stage, growth_stage (aliases)
    // ═══════════════════════════════════════════════════════════════════════
    const stageValue = cond.crop_stage || cond.stage || cond.growth_stage;
    if (stageValue) {
      totalConditions++;
      const stages = Array.isArray(stageValue) ? stageValue : [stageValue];
      const stageMatch = stages.some((s: string) => {
        const canon = canonicalStageKey(s);
        return canon === factStageCanon || canon === '*' || canon === 'all';
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
        // P1-3 Fix: Exact token match instead of substring containment
        const obsMatch = obsList.some((obs: string) => {
          const canonObs = canonicalObsCode(obs);
          // Exact match OR token-boundary match (not substring containment)
          const exactMatch = (s: string) => !!s && s === canonObs;
          const tokenMatch = (s: string) => {
            // P3 Fix: Require ALL tokens of the shorter code to match
            // Prevents yellowing_older_leaves matching yellowing_young_leaves
            const obsTokens = canonObs.split('_').filter(t => t.length > 1);
            const sTokens = s.split('_').filter(t => t.length > 1);
            if (obsTokens.length === 0 || sTokens.length === 0) return s === canonObs;
            const shorter = obsTokens.length <= sTokens.length ? obsTokens : sTokens;
            const longer = obsTokens.length <= sTokens.length ? sTokens : obsTokens;
            const allShorterMatch = shorter.every(t => longer.includes(t));
            return allShorterMatch && shorter.length >= 2;
          };
          return exactMatch(factSymptom) || tokenMatch(factSymptom) ||
                 exactMatch(factQuery) || tokenMatch(factQuery) ||
                 allObsCanon.some(ao => exactMatch(ao) || tokenMatch(ao));
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
      // ═══════════════════════════════════════════════════════════════════
      // P1 Fix: ROI metadata keys — NOT matching conditions, just metadata
      // Must be skipped to prevent inflating totalConditions
      // ═══════════════════════════════════════════════════════════════════
      'roi_basis', 'roi_modifier', 'roi_by_region',
      'roi_estimate', 'cost_benefit', 'economic_note',
    ]);
    
    // Extended keys that need special handling (not just skip)
    const CONTEXTUAL_KEYS = new Set([
      'soil_test', 'context', 'stress', 'duration_days', 'irrigation_system',
      'weather', 'temperature_c', 'roi_basis', 'roi_modifier', 'roi_by_region',
      'lodging_risk', 'leaf_n_status', 'no_visible_deficiency',
      'ndvi_improving', 'symptoms_mild', 'no_pest_visible',
      'uneven_growth', 'high_water_bills', 'water_deficit_visible',
      'normal_growth', 'salesman_recommendation',
    ]);
    
    for (const key of Object.keys(cond)) {
      if (SKIP_KEYS.has(key)) continue;
      
      // Handle contextual/expanded keys with soft evaluation
      if (CONTEXTUAL_KEYS.has(key)) {
        const ctxVal = cond[key];
        // Boolean contextual flags (no_pest_visible, symptoms_mild, normal_growth, etc.)
        if (ctxVal === true || ctxVal === 'true') {
          // Negative assertions (no_*, normal_*) - soft pass, can't disprove without data
          if (key.startsWith('no_') || key.startsWith('normal_')) {
            continue; // Don't penalize
          }
          // Positive assertions - check against observations
          totalConditions++;
          const keySymbol = canonicalObsCode(key);
          if (factSymptom === keySymbol || allObsCanon.some(ao => ao === keySymbol || ao.includes(keySymbol))) {
            metConditions++;
            matchedConditions.push(key);
          }
          continue;
        }
        // String contextual values (context, stress, irrigation_system)
        if (typeof ctxVal === 'string') {
          // Soft constraints - match against query if possible
          if (['roi_basis', 'roi_modifier', 'context', 'stress', 'irrigation_system'].includes(key)) {
            continue; // Soft - don't penalize without context data
          }
          totalConditions++;
          const valUpper = canonicalObsCode(ctxVal);
          if (factQuery.includes(valUpper) || allObsCanon.some(ao => ao.includes(valUpper))) {
            metConditions++;
            matchedConditions.push(key);
          }
          continue;
        }
        // Objects/numbers in contextual keys - count in denominator
        totalConditions++;
        continue;
      }
      
      const val = cond[key];
      
      // FAIL-CLOSED: Object/array conditions count as required but unmet
      // Cannot evaluate without structured data → drags down score
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        totalConditions++;
        continue;
      }
      if (Array.isArray(val)) {
        totalConditions++;
        continue;
      }
      
      // Boolean flags: {dead_heart: true, black_whip_like_structure: true}
      // Match if the key (as uppercase symbol) matches the primary symptom OR any observation
      if (val === true || val === 'true') {
        totalConditions++;
        const keySymbol = canonicalObsCode(key);
        if (factSymptom === keySymbol || factSymptom.includes(keySymbol) || 
            keySymbol.includes(factSymptom) || factQuery.includes(keySymbol) ||
            allObsCanon.some(ao => ao === keySymbol || ao.includes(keySymbol) || keySymbol.includes(ao))) {
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
        const valUpper = canonicalObsCode(val);
        if (factSymptom.includes(valUpper) || valUpper.includes(factSymptom) ||
            factQuery.includes(valUpper) ||
            allObsCanon.some(ao => ao.includes(valUpper) || valUpper.includes(ao))) {
          metConditions++;
          matchedConditions.push(key);
        }
        continue;
      }
      
      // false boolean: {etl_exceeded: false, no_match: false}
      if (val === false || val === 'false') {
        // Negative assertion: count and verify not contradicted
        totalConditions++;
        const keySymbol = canonicalObsCode(key);
        const contradicted = allObsCanon.some(ao => ao === keySymbol || ao.includes(keySymbol));
        if (!contradicted) metConditions++;
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
    const matches = score >= 0.6; // P3 Fix: Raised from 0.5 — at least 60% conditions must match
    
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
      // Macronutrients
      'soil_ph': () => facts.soil_ph,
      'soil_n': () => facts.soil_n,
      'soil_p': () => facts.soil_p,
      'soil_k': () => facts.soil_k,
      // P2 Fix: Micronutrient soil data mappings (populated when available)
      'soil_zn_ppm': () => facts.soil_zn_ppm,
      'soil_zn': () => facts.soil_zn_ppm,
      'soil_fe_ppm': () => facts.soil_fe_ppm,
      'soil_fe': () => facts.soil_fe_ppm,
      'soil_mn_ppm': () => facts.soil_mn_ppm,
      'soil_mn': () => facts.soil_mn_ppm,
      'soil_mg_cmol': () => facts.soil_mg_cmol,
      'soil_mg': () => facts.soil_mg_cmol,
      'soil_s_ppm': () => facts.soil_s_ppm,
      'soil_s': () => facts.soil_s_ppm,
      'soil_b_ppm': () => facts.soil_b_ppm,
      'soil_b': () => facts.soil_b_ppm,
      'boron_application_kg_ha': () => facts.soil_b_ppm, // Approximate mapping
      // Environmental
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
        confidence: (() => {
          const cs = rule.confidence_score || 0.7;
          if (cs > 1) {
            console.error(`[symbolic-reasoner] confidence_score out of range: ${cs} for rule ${rule.rule_id}. Expected 0–1 float. DB migration may not have run.`);
          }
          return confidence * cs;
        })(),
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
      
      // Micronutrient soil facts (null until soil test data schema is extended)
      soil_zn_ppm: (landState?.soil as any)?.zinc_ppm ?? null,
      soil_fe_ppm: (landState?.soil as any)?.iron_ppm ?? null,
      soil_mn_ppm: (landState?.soil as any)?.manganese_ppm ?? null,
      soil_mg_cmol: (landState?.soil as any)?.magnesium_cmol ?? null,
      soil_s_ppm: (landState?.soil as any)?.sulphur_ppm ?? null,
      soil_b_ppm: (landState?.soil as any)?.boron_ppm ?? null,
      
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
  // P3 Fix: Always pass fresh client per request to prevent stale connections
  // in edge functions where the Supabase client changes per request
  if (!reasonerInstance) {
    reasonerInstance = new SymbolicReasoner(supabaseClient);
  } else if (supabaseClient) {
    // Update the client on existing instance to prevent stale connections
    (reasonerInstance as any).supabase = supabaseClient;
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

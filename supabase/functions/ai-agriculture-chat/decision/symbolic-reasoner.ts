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
// SYMBOLIC REASONER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class SymbolicReasoner {
  private supabase: any;
  
  constructor() {
    this.supabase = createClient(
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
      
      // 4. Sort recommendations by priority
      firedRules.sort((a, b) => b.priority - a.priority);
      
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
   * Load rules matching the context from database
   */
  private async loadRulesForContext(facts: SymbolicFact): Promise<any[]> {
    const cropCode = facts.crop_code?.toLowerCase() || '';
    const stage = facts.growth_stage?.toLowerCase() || '';
    
    const { data, error } = await this.supabase
      .from('decision_rules')
      .select('*')
      .eq('is_active', true)
      .or(`crop_code.eq.${cropCode},crop_code.eq.all,crop_code.eq.*,crop_code.eq.universal`)
      .order('priority', { ascending: false })
      .limit(500);
    
    if (error) {
      console.error('❌ Failed to load rules:', error);
      return [];
    }
    
    // Filter by stage if specified
    const filtered = (data || []).filter(rule => {
      const stageApplicable = rule.stage_applicable || [];
      if (stageApplicable.length === 0) return true;
      return stageApplicable.some((s: string) => 
        s.toLowerCase() === stage || s === '*' || s === 'all'
      );
    });
    
    return filtered;
  }
  
  /**
   * CRITICAL: Evaluate conditions_json recursively
   * Supports compound conditions (all/any) and atomic conditions
   */
  evaluateConditionsJson(
    conditions: RuleCondition,
    facts: SymbolicFact
  ): { matches: boolean; confidence: number; reason: string; matched_conditions: string[] } {
    const matchedConditions: string[] = [];
    
    // Handle empty conditions (always match)
    if (!conditions || Object.keys(conditions).length === 0) {
      return { matches: true, confidence: 0.5, reason: 'No conditions (default)', matched_conditions: [] };
    }
    
    // Handle 'all' compound condition
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
    
    // Handle 'any' compound condition
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
    
    // Evaluate atomic condition
    if (conditions.fact && conditions.operator) {
      const factValue = this.getFactValue(facts, conditions.fact);
      
      if (factValue === undefined || factValue === null) {
        return {
          matches: false,
          confidence: 0,
          reason: `Fact '${conditions.fact}' not available`,
          matched_conditions: []
        };
      }
      
      const matches = this.evaluateOperator(factValue, conditions.operator, conditions.value);
      
      if (matches) {
        matchedConditions.push(`${conditions.fact} ${conditions.operator} ${conditions.value}`);
      }
      
      return {
        matches,
        confidence: matches ? 1.0 : 0,
        reason: matches 
          ? `${conditions.fact} ${conditions.operator} ${conditions.value}` 
          : `${conditions.fact} condition failed`,
        matched_conditions: matchedConditions
      };
    }
    
    // Default: no recognized condition format
    return { matches: false, confidence: 0, reason: 'Unknown condition format', matched_conditions: [] };
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
    // SSOT: No keyword matching in symbolic brain
    // trigger_keywords column was DROPPED per SSOT architecture
    console.warn('⚠️ [SymbolicReasoner] checkKeywordMatch is DEPRECATED - use conditions_json only');
    return { matches: false, confidence: 0, matched_keyword: null };
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

export function getSymbolicReasoner(): SymbolicReasoner {
  if (!reasonerInstance) {
    reasonerInstance = new SymbolicReasoner();
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

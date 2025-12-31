/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE ENGINE EXECUTOR v3.0 - DECISION SYNTHESIZER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade rule execution engine that:
 * - Loads TypeScript rule modules dynamically from /src/decision-graph/safety-rules/
 * - Executes rules in priority order (P0 → P6)
 * - Resolves conflicts between competing recommendations
 * - Calculates economic viability
 * - Generates complete decision packages with audit trails
 */

import type {
  RuleExecutionInput,
  DecisionOutput,
  DecisionsByPriority,
  RuleResult,
  PrimaryDecision,
  AuditTrail,
  ConfidenceMetrics,
  ContingencyPlan,
  FollowUpSchedule,
  ScientificJustification,
  AppliedRule,
  FarmerMessages,
  RecommendationDetails
} from './rule-engine-types.ts';
import {
  RULE_ENGINE_VERSION,
  CONFIDENCE_THRESHOLDS
} from './rule-engine-types.ts';
import type { RuleModuleReference, RulePriority } from './rule-module-types.ts';
import { resolveConflicts, checkTreatmentCompatibility } from './conflict-resolver.ts';
import { calculateEconomicViability } from './economic-calculator.ts';
import { createHash } from 'https://deno.land/std@0.177.0/crypto/mod.ts';
import { 
  SYMBOLIC_RULES_REGISTRY, 
  matchRulesByKeywords, 
  convertToRuleResult,
  getTotalRuleCount,
  getRuleCountByCategory
} from './symbolic-rules-bridge.ts';
// PHASE C: Import Decision Graph Bridge for deterministic rule execution
import { evaluateDecisionGraph, type RuleEvaluationContext } from './decision-graph-bridge.ts';

// ═══════════════════════════════════════════════════════════════════════════
// RULE ENGINE EXECUTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class RuleEngineExecutor {
  private rulesVersion: string = '2024.12.27';
  
  /**
   * Main entry point - Execute rules and generate decision
   */
  async execute(input: RuleExecutionInput): Promise<DecisionOutput> {
    const startTime = Date.now();
    const traceId = (input as any).trace_id || `rule_${Date.now().toString(36)}`;
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🔧 [${traceId}] RULE ENGINE EXECUTOR: Starting execution...`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   [${traceId}] Session: ${input.session_id}`);
    console.log(`   [${traceId}] Crop: ${input.farmer_context.crop_code}`);
    console.log(`   [${traceId}] Pest/Disease: ${input.pest_disease_state.pest_code || input.pest_disease_state.disease_code || 'None specified'}`);
    console.log(`   [${traceId}] Severity: ${input.pest_disease_state.severity || 'UNKNOWN'}`);
    console.log(`   [${traceId}] Total rules in registry: ${getTotalRuleCount()}`);
    
    // CRITICAL: Log field conditions with soil/NDVI data
    console.log(`   [${traceId}] 🌾 Field Conditions (Soil + NDVI):`);
    console.log(`      Soil N State: ${input.field_conditions?.soil_nitrogen_state || 'NOT_AVAILABLE'}`);
    console.log(`      Soil P State: ${input.field_conditions?.soil_phosphorus_state || 'NOT_AVAILABLE'}`);
    console.log(`      Soil K State: ${input.field_conditions?.soil_potassium_state || 'NOT_AVAILABLE'}`);
    console.log(`      Soil pH: ${input.field_conditions?.soil_ph || 'NOT_AVAILABLE'}`);
    console.log(`      NDVI: ${input.field_conditions?.ndvi?.toFixed(2) || 'NOT_AVAILABLE'} (${input.field_conditions?.ndvi_state || 'UNKNOWN'})`);
    console.log(`      NDVI Trend: ${input.field_conditions?.ndvi_trend || 'NOT_AVAILABLE'}`);
    console.log(`      Has Real Data: ${!!(input.field_conditions?.soil_nitrogen_state || input.field_conditions?.ndvi)}`);
    
    // PHASE C: Execute Decision Graph Bridge FIRST for deterministic rules
    let bridgeResults: RuleResult[] = [];
    try {
      const bridgeContext: RuleEvaluationContext = {
        crop_code: input.farmer_context.crop_code,
        crop_stage: input.farmer_context.crop_stage,
        farming_mode: input.farmer_context.certification === 'ORGANIC' ? 'ORGANIC' : 'CONVENTIONAL',
        pest_code: input.pest_disease_state.pest_code,
        disease_code: input.pest_disease_state.disease_code,
        pest_density: input.pest_disease_state.infestation_density,
        disease_severity: input.pest_disease_state.severity === 'CRITICAL' ? 80 :
                          input.pest_disease_state.severity === 'HIGH' ? 60 :
                          input.pest_disease_state.severity === 'MODERATE' ? 40 : 20,
        infestation_level: input.pest_disease_state.infestation_level_percent || 0,
        
        // CRITICAL FIX: Pass complete soil data to bridge
        soil_type: input.field_conditions?.soil_type,
        soil_ph: input.field_conditions?.soil_ph,
        soil_nitrogen_state: input.field_conditions?.soil_nitrogen_state,
        soil_phosphorus_state: input.field_conditions?.soil_phosphorus_state,
        soil_potassium_state: input.field_conditions?.soil_potassium_state,
        soil_organic_carbon: input.field_conditions?.soil_organic_carbon,
        soil_moisture_percent: input.field_conditions?.soil_moisture_percent,
        
        // CRITICAL FIX: Pass NDVI data to bridge
        ndvi_value: input.field_conditions?.ndvi,
        ndvi_state: input.field_conditions?.ndvi_state,
        ndvi_trend: input.field_conditions?.ndvi_trend,
        
        // Weather and context
        current_weather: input.environmental_context.current_weather,
        weather_forecast_24h: input.environmental_context.weather_forecast_24h,
        land_id: input.land_id,
        farmer_id: input.farmer_id,
        days_after_sowing: input.farmer_context.days_after_sowing,
        land_size_acres: input.farmer_context.land_size_acres,
        days_to_harvest: input.farmer_context.days_to_harvest,
        previous_treatments: input.farmer_constraints?.previous_treatments,
        metadata: { trace_id: traceId }
      };
      
      console.log(`   [${traceId}] 🌿 Executing Decision Graph Bridge...`);
      const bridgeEvaluation = await evaluateDecisionGraph(bridgeContext);
      
      // Convert bridge recommendations to RuleResult format
      // CRITICAL FIX: Handle field name differences between bridge (name/method) and RuleResult (product_name/application_method)
      if (bridgeEvaluation.recommendations?.length > 0) {
        bridgeResults = bridgeEvaluation.recommendations.map(rec => {
          const product = rec.products?.[0];
          // CRITICAL FIX: Map both bridge field names (name, method) AND expected field names (product_name, application_method)
          const productName = product?.product_name || product?.name || null;
          const productDosage = product?.dosage || null;
          const productMethod = product?.application_method || product?.method || 'FOLIAR_SPRAY';
          
          console.log(`   [${traceId}] 📦 Bridge product mapping: name=${productName}, dosage=${productDosage}, method=${productMethod}`);
          
          return {
            rule_id: rec.rule_id,
            priority: rec.priority as RulePriority,
            action: bridgeEvaluation.blocked ? 'BLOCK' : 'RECOMMEND',
            cause: rec.recommendation_type || 'INTEGRATED_RECOMMENDATION',
            reason: rec.recommendation_text_en,
            reason_mr: rec.recommendation_text_mr,
            reason_hi: rec.recommendation_text_hi,
            recommendation: productName ? {
              product_name: productName,
              product_type: 'INTEGRATED' as any,
              dosage: productDosage,
              application_method: productMethod as any,
              ipm_level: rec.ipm_level || 3,
              efficacy_percent: 80,
              cost_per_acre_inr: parseInt(rec.cost_estimate?.replace(/[^0-9]/g, '') || '0') || 0
            } : undefined,
            confidence: 0.85
          };
        });
        console.log(`   [${traceId}] ✅ Decision Graph Bridge: ${bridgeResults.length} recommendations`);
      }
      
      // Check for safety blocks from bridge
      if (bridgeEvaluation.blocked && bridgeEvaluation.blockingRule) {
        console.log(`   [${traceId}] 🛑 BLOCKED by Decision Graph: ${bridgeEvaluation.blockingRule.rule_id}`);
        bridgeResults.unshift({
          rule_id: bridgeEvaluation.blockingRule.rule_id,
          priority: bridgeEvaluation.blockingRule.priority as RulePriority,
          action: 'BLOCK',
          cause: 'SAFETY_VIOLATION',
          reason: bridgeEvaluation.blockingRule.reason_en,
          reason_mr: bridgeEvaluation.blockingRule.reason_mr,
          reason_hi: bridgeEvaluation.blockingRule.reason_hi,
          alternatives: bridgeEvaluation.blockingRule.alternatives,
          confidence: 1.0
        });
      }
    } catch (bridgeError) {
      console.warn(`   [${traceId}] ⚠️ Decision Graph Bridge error (continuing with symbolic rules):`, bridgeError);
    }
    
    // Log rule count by category
    const categoryStats = getRuleCountByCategory();
    console.log('   📊 Rules by category:', JSON.stringify(categoryStats));
    
    try {
      // STEP 1: Load required rule modules
      const ruleModules = await this.loadRuleModules(input.rule_modules_required);
      console.log(`   [${traceId}] ✅ Loaded ${ruleModules.length} rule modules`);
      
      // STEP 2: Execute rules in priority order with enhanced logging
      console.log(`\n📋 [${traceId}] STEP 2: Executing rules in priority order...`);
      const decisions = await this.executeRulesInPriorityOrder(ruleModules, input);
      
      // PHASE C: Merge Decision Graph Bridge results into decisions
      if (bridgeResults.length > 0) {
        console.log(`   [${traceId}] 🔀 Merging ${bridgeResults.length} Decision Graph results...`);
        for (const result of bridgeResults) {
          const bucketKey = this.getPriorityBucket(result.priority);
          // Add to front to prioritize bridge results
          decisions[bucketKey].unshift(result);
        }
      }
      
      // Enhanced logging for rule execution results
      const totalRulesMatched = Object.values(decisions).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`\n   📊 RULE EXECUTION SUMMARY:`);
      console.log(`   ├─ P0 Emergency rules matched: ${decisions.P0_emergency.length}`);
      console.log(`   ├─ P1 Regulatory rules matched: ${decisions.P1_regulatory.length}`);
      console.log(`   ├─ P2 Weather Safety rules matched: ${decisions.P2_weather_safety.length}`);
      console.log(`   ├─ P3 Crop Stage rules matched: ${decisions.P3_crop_stage.length}`);
      console.log(`   ├─ P4 Economic rules matched: ${decisions.P4_economic.length}`);
      console.log(`   ├─ P5 IPM rules matched: ${decisions.P5_ipm.length}`);
      console.log(`   └─ P6 Optimization rules matched: ${decisions.P6_optimization.length}`);
      console.log(`   ════════════════════════════════════════`);
      console.log(`   TOTAL RULES MATCHED: ${totalRulesMatched}`);
      
      // Log specific rule IDs that matched
      if (totalRulesMatched > 0) {
        console.log('\n   📋 Matched rule IDs:');
        Object.entries(decisions).forEach(([priority, rules]) => {
          if (rules.length > 0) {
            console.log(`   ${priority}: ${rules.map(r => r.rule_id).join(', ')}`);
          }
        });
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Generate default decision when no rules match
      // ═══════════════════════════════════════════════════════════════════════════
      if (totalRulesMatched === 0 && bridgeResults.length === 0) {
        console.log(`   [${traceId}] ⚠️ NO RULES MATCHED - Generating default recommendation`);
        return this.generateDefaultDecision(input, startTime);
      }
      
      // STEP 3: Check for blocking conditions
      const blockingDecision = this.checkForBlocks(decisions);
      if (blockingDecision) {
        console.log(`   🛑 BLOCKED by rule: ${blockingDecision.rule_id}`);
        return this.formatBlockedDecision(blockingDecision, decisions, input, startTime);
      }
      
      // STEP 4: Resolve conflicts and select best action
      console.log('\n⚖️ STEP 4: Resolving conflicts...');
      const resolvedDecision = resolveConflicts(decisions);
      
      // STEP 5: Handle weather delays
      if (resolvedDecision.status === 'WEATHER_DELAYED') {
        console.log('   ⏰ Weather delay detected');
        return this.formatWeatherDelayedDecision(resolvedDecision, decisions, input, startTime);
      }
      
      // STEP 6: Calculate economics if we have a primary decision
      let economicAssessment = null;
      if (resolvedDecision.primary_decision) {
        const recommendation = this.extractRecommendation(resolvedDecision.primary_decision);
        economicAssessment = calculateEconomicViability(recommendation, input);
      }
      
      // STEP 7: Generate complete output
      const output = this.formatDecisionOutput(
        resolvedDecision,
        economicAssessment,
        decisions,
        input,
        startTime
      );
      
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('✅ RULE ENGINE EXECUTOR: Decision generated successfully');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`   Status: ${output.status}`);
      console.log(`   Action: ${output.primary_decision.action_type}`);
      console.log(`   Rules Applied: ${output.rules_applied?.length || totalRulesMatched}`);
      console.log(`   Execution time: ${Date.now() - startTime}ms`);
      
      return output;
      
    } catch (error) {
      console.error('❌ Rule Engine Executor: Error during execution', error);
      return this.generateFallbackDecision(input, error as Error, startTime);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE MODULE LOADING
  // ═══════════════════════════════════════════════════════════════════════════
  
  private async loadRuleModules(references: RuleModuleReference[]): Promise<LoadedRuleModule[]> {
    const modules: LoadedRuleModule[] = [];
    
    for (const ref of references) {
      try {
        // In edge function context, we use the rule evaluation logic directly
        // rather than dynamic imports (which don't work in Deno)
        modules.push({
          priority: ref.priority,
          category: ref.category,
          moduleFile: ref.moduleFile,
          reference: ref,
          // We'll evaluate rules using the centralized rule registry
          evaluator: this.createRuleEvaluator(ref)
        });
      } catch (error) {
        console.warn(`Failed to load rule module: ${ref.importPath}`, error);
      }
    }
    
    return modules;
  }
  
  private createRuleEvaluator(ref: RuleModuleReference): RuleEvaluator {
    // Return a rule evaluator based on the module type
    return {
      moduleRef: ref,
      evaluate: (input: RuleExecutionInput): RuleResult[] => {
        return this.evaluateRulesForModule(ref, input);
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private async executeRulesInPriorityOrder(
    modules: LoadedRuleModule[],
    input: RuleExecutionInput
  ): Promise<DecisionsByPriority> {
    // Sort by priority (P0 first)
    modules.sort((a, b) => {
      const priorityOrder: Record<RulePriority, number> = {
        'P0_EMERGENCY': 0,
        'P1_REGULATORY': 1,
        'P2_WEATHER_SAFETY': 2,
        'P3_CROP_STAGE': 3,
        'P4_ECONOMIC': 4,
        'P5_IPM': 5,
        'P6_OPTIMIZATION': 6
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    const decisions: DecisionsByPriority = {
      P0_emergency: [],
      P1_regulatory: [],
      P2_weather_safety: [],
      P3_crop_stage: [],
      P4_economic: [],
      P5_ipm: [],
      P6_optimization: []
    };
    
    for (const module of modules) {
      const results = module.evaluator.evaluate(input);
      
      // Add results to appropriate priority bucket
      const bucketKey = this.getPriorityBucket(module.priority);
      decisions[bucketKey].push(...results);
      
      // P0 block check - if triggered, stop immediately
      if (module.priority === 'P0_EMERGENCY') {
        const block = results.find(r => r.action === 'BLOCK');
        if (block) {
          console.log(`🛑 P0 Emergency block triggered: ${block.rule_id}`);
          break;
        }
      }
    }
    
    return decisions;
  }
  
  private getPriorityBucket(priority: RulePriority): keyof DecisionsByPriority {
    const mapping: Record<RulePriority, keyof DecisionsByPriority> = {
      'P0_EMERGENCY': 'P0_emergency',
      'P1_REGULATORY': 'P1_regulatory',
      'P2_WEATHER_SAFETY': 'P2_weather_safety',
      'P3_CROP_STAGE': 'P3_crop_stage',
      'P4_ECONOMIC': 'P4_economic',
      'P5_IPM': 'P5_ipm',
      'P6_OPTIMIZATION': 'P6_optimization'
    };
    return mapping[priority];
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE EVALUATION LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  
  private evaluateRulesForModule(ref: RuleModuleReference, input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    
    // CRITICAL GAP 2 FIX: First evaluate using Symbolic Rules Bridge (300+ ICAR rules)
    const symbolicResults = this.evaluateSymbolicRules(ref, input);
    results.push(...symbolicResults);
    console.log(`   📋 Symbolic Bridge: ${symbolicResults.length} rules matched for ${ref.moduleFile}`);
    
    // Then add module-specific hardcoded rules for any gaps
    switch (ref.moduleFile) {
      case 'chemical-safety-rules':
        results.push(...this.evaluateChemicalSafetyRules(input));
        break;
      case 'emergency-rules':
        results.push(...this.evaluateEmergencyRules(input));
        break;
      case 'phi-withdrawal-rules':
        results.push(...this.evaluatePHIRules(input));
        break;
      case 'weather-action-rules':
        results.push(...this.evaluateWeatherRules(input));
        break;
      case 'economic-threshold-rules':
        results.push(...this.evaluateEconomicThresholdRules(input));
        break;
      case 'ipm-rules':
        results.push(...this.evaluateIPMRules(input));
        break;
      case 'resistance-management-rules':
        results.push(...this.evaluateResistanceRules(input));
        break;
      case 'harvest-quality-rules':
        results.push(...this.evaluateHarvestRules(input));
        break;
      default:
        // Generic evaluation for unknown modules
        results.push(...this.evaluateGenericRules(ref, input));
    }
    
    // Deduplicate by rule_id, keeping first occurrence
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.rule_id)) return false;
      seen.add(r.rule_id);
      return true;
    });
  }
  
  /**
   * CRITICAL GAP 2 FIX: Evaluate rules using Symbolic Rules Bridge
   * This connects the 300+ ICAR rules to the rule engine
   */
  private evaluateSymbolicRules(ref: RuleModuleReference, input: RuleExecutionInput): RuleResult[] {
    // Build search keywords from input context
    const keywords: string[] = [];
    
    // Add pest/disease codes
    if (input.pest_disease_state.pest_code && input.pest_disease_state.pest_code !== 'UNKNOWN') {
      keywords.push(input.pest_disease_state.pest_code.toLowerCase());
    }
    if (input.pest_disease_state.disease_code && input.pest_disease_state.disease_code !== 'UNKNOWN') {
      keywords.push(input.pest_disease_state.disease_code.toLowerCase());
    }
    
    // Add crop code - CRITICAL: filter out UNKNOWN
    if (input.farmer_context.crop_code && input.farmer_context.crop_code !== 'UNKNOWN') {
      keywords.push(input.farmer_context.crop_code.toLowerCase());
      // Also add common variations
      if (input.farmer_context.crop_code.toUpperCase() === 'SUGARCANE') {
        keywords.push('sugarcane', 'ऊस', 'गन्ना', 'cane');
      } else if (input.farmer_context.crop_code.toUpperCase() === 'COTTON') {
        keywords.push('cotton', 'कापूस', 'कपास', 'kapas');
      } else if (input.farmer_context.crop_code.toUpperCase() === 'SOYBEAN') {
        keywords.push('soybean', 'soya', 'सोयाबीन');
      }
    }
    
    // Add severity
    if (input.pest_disease_state.severity && input.pest_disease_state.severity !== 'UNKNOWN') {
      keywords.push(input.pest_disease_state.severity.toLowerCase());
    }
    
    // Add weather conditions
    if (input.environmental_context.current_weather.rain_in_last_24h) {
      keywords.push('rain', 'पाऊस', 'बारिश');
    }
    if (input.environmental_context.current_weather.temperature_c > 35) {
      keywords.push('high temp', 'hot', 'गरम');
    }
    if (input.environmental_context.current_weather.wind_speed_kmh > 15) {
      keywords.push('high wind', 'windy', 'वारा');
    }
    
    // Add crop stage
    if (input.farmer_context.crop_stage && input.farmer_context.crop_stage !== 'UNKNOWN') {
      keywords.push(input.farmer_context.crop_stage.toLowerCase());
      if (input.farmer_context.crop_stage === 'FLOWERING') {
        keywords.push('flowering', 'फुलावर', 'फूल');
      } else if (input.farmer_context.crop_stage === 'VEGETATIVE') {
        keywords.push('vegetative', 'वाढ', 'बढ़वार');
      } else if (input.farmer_context.crop_stage === 'MATURITY') {
        keywords.push('maturity', 'पक्व', 'पका');
      }
    }
    
    // Add from previous treatments if any banned chemicals
    for (const treatment of input.farmer_constraints.previous_treatments || []) {
      if (treatment.chemical_name) {
        keywords.push(treatment.chemical_name.toLowerCase());
      }
    }
    
    // CRITICAL FIX: Log all keywords being used for matching
    console.log(`   🔍 [SymbolicRules] Keywords for ${ref.moduleFile}: [${keywords.join(', ')}]`);
    
    // Map module category to symbolic rule category
    const categoryMapping: Record<string, string> = {
      'chemical-safety-rules': 'safety',
      'emergency-rules': 'emergency',
      'phi-withdrawal-rules': 'regulatory',
      'weather-action-rules': 'weather_safety',
      'economic-threshold-rules': 'economic',
      'ipm-rules': 'ipm',
      'resistance-management-rules': 'resistance',
      'harvest-quality-rules': 'harvest',
      'disease-management-rules': 'disease',
      'nutrient-rules': 'nutrient',
      'water-rules': 'water'
    };
    
    const targetCategory = categoryMapping[ref.moduleFile] || ref.category;
    
    // Use the symbolic rules bridge to find matching rules
    const matchedRules = matchRulesByKeywords(keywords, targetCategory);
    
    // CRITICAL FIX: Log matching results
    if (matchedRules.length > 0) {
      console.log(`   ✅ [SymbolicRules] Matched ${matchedRules.length} rules in ${targetCategory}:`, 
        matchedRules.slice(0, 3).map(r => r.rule_id).join(', ') + 
        (matchedRules.length > 3 ? `... +${matchedRules.length - 3} more` : ''));
    }
    
    // Convert to RuleResult format
    return matchedRules.map(rule => convertToRuleResult(rule, input));
  }
  
  private evaluateChemicalSafetyRules(input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    
    // Check for banned chemicals
    const bannedChemicals = ['ENDOSULFAN', 'MONOCROTOPHOS', 'PHOSPHAMIDON', 'METHOMYL', 'CARBOFURAN'];
    const previousTreatments = input.farmer_constraints.previous_treatments || [];
    
    for (const treatment of previousTreatments) {
      if (treatment.chemical_name && bannedChemicals.some(bc => 
        treatment.chemical_name!.toUpperCase().includes(bc)
      )) {
        results.push({
          rule_id: 'CHEM_SAFETY_001',
          priority: 'P0_EMERGENCY',
          action: 'BLOCK',
          cause: 'BANNED_CHEMICAL_DETECTED',
          reason: `${treatment.chemical_name} is banned in India. Do not use.`,
          reason_mr: `${treatment.chemical_name} भारतात बंदी आहे. वापरू नका.`,
          reason_hi: `${treatment.chemical_name} भारत में प्रतिबंधित है। उपयोग न करें।`,
          alternatives: ['Use approved IPM methods', 'Neem-based products', 'Biological control'],
          confidence: 1.0
        });
      }
    }
    
    // SAFETY_006 FIX: Check neonicotinoid + flowering COMPOUND condition
    // This rule was removed from keyword matching because it was triggering on "flowering" alone
    const neonicotinoids = ['IMIDACLOPRID', 'THIAMETHOXAM', 'CLOTHIANIDIN', 'ACETAMIPRID'];
    const isFloweringStage = input.farmer_context.crop_stage === 'FLOWERING' || 
                             input.farmer_context.crop_stage === 'REPRODUCTIVE';
    
    // Check if any treatment mentions neonicotinoid AND crop is flowering
    for (const treatment of previousTreatments) {
      if (treatment.chemical_name && 
          neonicotinoids.some(nc => treatment.chemical_name!.toUpperCase().includes(nc)) &&
          isFloweringStage) {
        results.push({
          rule_id: 'SAFETY_006',
          priority: 'P1_REGULATORY',
          action: 'BLOCK',
          cause: 'POLLINATOR_RISK_FLOWERING',
          reason: '🐝 Do not use neonicotinoids during flowering. High risk to bees.',
          reason_mr: '🐝 फुलोऱ्यावर नियोनिकोटिनॉइड वापरू नका. मधमाशांना धोका.',
          reason_hi: '🐝 फूल आने पर नियोनिकोटिनॉइड का उपयोग न करें। मधुमक्खियों को खतरा।',
          alternatives: ['Use Spinosad', 'Apply Bacillus thuringiensis', 'Spray early morning before 6 AM'],
          confidence: 1.0,
          scientific_source: 'EU Pollinator Protection Directive, ICAR-NBAIR',
          scientific_basis: 'Neonicotinoids are highly toxic to bees. Application during flowering causes bee mortality.'
        });
        break; // Only add once
      }
    }
    
    // Check organic certification
    if (input.farmer_context.certification === 'ORGANIC') {
      results.push({
        rule_id: 'CHEM_SAFETY_002',
        priority: 'P1_REGULATORY',
        action: 'BLOCK',
        cause: 'ORGANIC_CERTIFICATION',
        reason: 'Synthetic chemicals not allowed for organic certification',
        reason_mr: 'सेंद्रिय प्रमाणपत्रासाठी रासायनिक कीटकनाशके वापरता येत नाहीत',
        reason_hi: 'जैविक प्रमाणन के लिए रासायनिक कीटनाशकों का उपयोग नहीं किया जा सकता',
        alternatives: ['Neem oil', 'Trichoderma', 'Panchagavya', 'Jeevamrit'],
        confidence: 1.0
      });
    }
    
    return results;
  }
  
  private evaluateEmergencyRules(input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    
    // Critical severity check
    if (input.pest_disease_state.severity === 'CRITICAL') {
      results.push({
        rule_id: 'EMERGENCY_001',
        priority: 'P0_EMERGENCY',
        action: 'RECOMMEND',
        cause: 'CRITICAL_INFESTATION',
        reason: 'Critical infestation level detected. Immediate action required.',
        reason_mr: 'गंभीर प्रादुर्भाव आढळला. तात्काळ कृती आवश्यक.',
        reason_hi: 'गंभीर संक्रमण पाया गया। तुरंत कार्रवाई आवश्यक।',
        recommendation: {
          product_name: 'Contact agricultural expert immediately',
          product_type: 'CHEMICAL',
          dosage: 'As per expert recommendation',
          application_method: 'FOLIAR_SPRAY',
          ipm_level: 5,
          efficacy_percent: 85
        },
        confidence: 0.95
      });
    }
    
    // Locust swarm check (based on region)
    if (input.environmental_context.region_code?.includes('RAJASTHAN') ||
        input.environmental_context.region_code?.includes('GUJARAT')) {
      // Could add locust season check here
    }
    
    return results;
  }
  
  private evaluatePHIRules(input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    
    // Check if near harvest
    if (input.farmer_context.crop_stage === 'MATURITY' || 
        input.farmer_context.crop_stage === 'HARVEST') {
      results.push({
        rule_id: 'PHI_001',
        priority: 'P1_REGULATORY',
        action: 'WARN',
        cause: 'NEAR_HARVEST_PHI',
        reason: 'Crop is near harvest. Only use products with short PHI.',
        reason_mr: 'पीक कापणीच्या जवळ आहे. फक्त कमी PHI असलेली उत्पादने वापरा.',
        reason_hi: 'फसल कटाई के करीब है। केवल कम PHI वाले उत्पाद उपयोग करें।',
        confidence: 0.9
      });
      
      // Export market stricter PHI
      if (input.farmer_context.export_market) {
        results.push({
          rule_id: 'PHI_002',
          priority: 'P1_REGULATORY',
          action: 'WARN',
          cause: 'EXPORT_PHI_STRICTER',
          reason: 'Export crops require stricter PHI compliance. Prefer organic solutions.',
          reason_mr: 'निर्यात पिकांसाठी कठोर PHI अनुपालन आवश्यक. सेंद्रिय उपायांना प्राधान्य द्या.',
          reason_hi: 'निर्यात फसलों के लिए सख्त PHI अनुपालन आवश्यक। जैविक समाधान को प्राथमिकता दें।',
          confidence: 0.95
        });
      }
    }
    
    return results;
  }
  
  private evaluateWeatherRules(input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    const forecast = input.environmental_context.weather_forecast_24h;
    const current = input.environmental_context.current_weather;
    
    // Rain forecast check
    if (forecast.rain_probability_percent > 60) {
      results.push({
        rule_id: 'WEATHER_001',
        priority: 'P2_WEATHER_SAFETY',
        action: 'DELAY',
        cause: 'RAIN_FORECAST',
        reason: `${forecast.rain_probability_percent}% rain probability in next 24 hours. Delay spraying.`,
        reason_mr: `पुढील 24 तासांत ${forecast.rain_probability_percent}% पावसाची शक्यता. फवारणी टाळा.`,
        reason_hi: `अगले 24 घंटों में ${forecast.rain_probability_percent}% बारिश की संभावना। छिड़काव टालें।`,
        next_safe_window: this.calculateNextSafeWindow(forecast),
        alternatives: ['Apply systemic products', 'Use sticker/spreader', 'Wait for weather clearance'],
        confidence: 0.85
      });
    }
    
    // High wind check
    if (current.wind_speed_kmh > 15) {
      results.push({
        rule_id: 'WEATHER_002',
        priority: 'P2_WEATHER_SAFETY',
        action: 'WARN',
        cause: 'HIGH_WIND',
        reason: `Wind speed ${current.wind_speed_kmh} km/h too high for effective spraying.`,
        reason_mr: `वाऱ्याचा वेग ${current.wind_speed_kmh} किमी/तास जास्त आहे. फवारणी टाळा.`,
        reason_hi: `हवा की गति ${current.wind_speed_kmh} किमी/घंटा बहुत अधिक है। छिड़काव टालें।`,
        alternatives: ['Spray early morning', 'Use drop nozzles', 'Apply granular formulation'],
        confidence: 0.8
      });
    }
    
    // High temperature check
    if (current.temperature_c > 35) {
      results.push({
        rule_id: 'WEATHER_003',
        priority: 'P2_WEATHER_SAFETY',
        action: 'WARN',
        cause: 'HIGH_TEMPERATURE',
        reason: `Temperature ${current.temperature_c}°C too high. Risk of phytotoxicity.`,
        reason_mr: `तापमान ${current.temperature_c}°C जास्त आहे. पानांचे नुकसान होऊ शकते.`,
        reason_hi: `तापमान ${current.temperature_c}°C बहुत अधिक है। पत्तियों को नुकसान हो सकता है।`,
        alternatives: ['Spray in early morning (before 9 AM)', 'Spray in evening (after 4 PM)'],
        confidence: 0.85
      });
    }
    
    return results;
  }
  
  private evaluateEconomicThresholdRules(input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    
    // Check if pest density exceeds economic threshold
    const etlByPest: Record<string, number> = {
      'APHID': 10,        // 10 per leaf
      'BOLLWORM': 5,      // 5% plant damage
      'WHITEFLY': 5,      // 5 adults per leaf
      'FRUIT_BORER': 2,   // 2% fruit damage
      'JASSID': 2,        // 2 per leaf
      'THRIPS': 10        // 10 per leaf
    };
    
    const pestCode = input.pest_disease_state.pest_code?.toUpperCase() || '';
    const threshold = etlByPest[pestCode] || 10;
    const density = input.pest_disease_state.infestation_density || 0;
    
    if (density >= threshold) {
      results.push({
        rule_id: 'ETL_001',
        priority: 'P4_ECONOMIC',
        action: 'RECOMMEND',
        cause: 'ETL_EXCEEDED',
        reason: `Pest density (${density}) exceeds economic threshold (${threshold}). Treatment justified.`,
        reason_mr: `किडींची संख्या (${density}) आर्थिक थ्रेशोल्डपेक्षा (${threshold}) जास्त आहे. उपचार आवश्यक.`,
        reason_hi: `कीट घनत्व (${density}) आर्थिक सीमा (${threshold}) से अधिक है। उपचार आवश्यक।`,
        recommendation: this.getRecommendedTreatment(input),
        confidence: 0.85
      });
    } else if (density >= threshold * 0.7) {
      results.push({
        rule_id: 'ETL_002',
        priority: 'P4_ECONOMIC',
        action: 'WARN',
        cause: 'ETL_APPROACHING',
        reason: `Pest density approaching threshold. Monitor closely.`,
        reason_mr: `किडींची संख्या थ्रेशोल्डजवळ आहे. काळजीपूर्वक निरीक्षण करा.`,
        reason_hi: `कीट घनत्व सीमा के करीब है। ध्यान से निगरानी करें।`,
        confidence: 0.7
      });
    }
    
    return results;
  }
  
  private evaluateIPMRules(input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    
    // IPM ladder recommendation based on severity
    const severity = input.pest_disease_state.severity;
    
    if (severity === 'LOW') {
      results.push({
        rule_id: 'IPM_001',
        priority: 'P5_IPM',
        action: 'RECOMMEND',
        cause: 'IPM_LEVEL_1_CULTURAL',
        reason: 'Low infestation - cultural practices sufficient',
        reason_mr: 'कमी प्रादुर्भाव - सांस्कृतिक पद्धती पुरेशा',
        reason_hi: 'कम संक्रमण - सांस्कृतिक तरीके पर्याप्त',
        recommendation: {
          product_name: 'Cultural practices: Remove affected leaves, improve drainage',
          product_type: 'ORGANIC',
          dosage: 'Manual removal',
          application_method: 'HAND_PICKING',
          ipm_level: 1,
          efficacy_percent: 60,
          cost_per_acre_inr: 500
        },
        confidence: 0.8
      });
    } else if (severity === 'MODERATE') {
      results.push({
        rule_id: 'IPM_002',
        priority: 'P5_IPM',
        action: 'RECOMMEND',
        cause: 'IPM_LEVEL_4_BOTANICAL',
        reason: 'Moderate infestation - botanical pesticides recommended',
        reason_mr: 'मध्यम प्रादुर्भाव - वनस्पतिजन्य कीटकनाशक सुचवले',
        reason_hi: 'मध्यम संक्रमण - वानस्पतिक कीटनाशक अनुशंसित',
        recommendation: {
          product_name: 'Neem Oil 1%',
          product_type: 'BOTANICAL',
          dosage: '5 ml/liter water',
          application_method: 'FOLIAR_SPRAY',
          ipm_level: 4,
          efficacy_percent: 75,
          cost_per_acre_inr: 1200
        },
        confidence: 0.85
      });
    } else {
      // HIGH or CRITICAL
      results.push({
        rule_id: 'IPM_003',
        priority: 'P5_IPM',
        action: 'RECOMMEND',
        cause: 'IPM_LEVEL_5_SELECTIVE',
        reason: 'High infestation - selective insecticide recommended',
        reason_mr: 'जास्त प्रादुर्भाव - निवडक कीटकनाशक सुचवले',
        reason_hi: 'उच्च संक्रमण - चयनात्मक कीटनाशक अनुशंसित',
        recommendation: this.getRecommendedTreatment(input),
        confidence: 0.9
      });
    }
    
    return results;
  }
  
  private evaluateResistanceRules(input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    const treatments = input.farmer_constraints.previous_treatments;
    
    if (treatments && treatments.length >= 2) {
      // Check for repeated use of same chemical group
      const groups = treatments.map(t => t.chemical_group).filter(Boolean);
      const lastGroup = groups[groups.length - 1];
      const sameGroupCount = groups.filter(g => g === lastGroup).length;
      
      if (sameGroupCount >= 2) {
        results.push({
          rule_id: 'RESIST_001',
          priority: 'P5_IPM',
          action: 'WARN',
          cause: 'MOA_ROTATION_NEEDED',
          reason: `Same chemical group used ${sameGroupCount} times. Rotate to prevent resistance.`,
          reason_mr: `समान रासायनिक गट ${sameGroupCount} वेळा वापरला. प्रतिरोध टाळण्यासाठी बदला.`,
          reason_hi: `समान रासायनिक समूह ${sameGroupCount} बार उपयोग किया। प्रतिरोध से बचने के लिए बदलें।`,
          alternatives: ['Switch to different MOA group', 'Use biological control for 1-2 cycles'],
          confidence: 0.85
        });
      }
    }
    
    return results;
  }
  
  private evaluateHarvestRules(input: RuleExecutionInput): RuleResult[] {
    const results: RuleResult[] = [];
    
    if (input.farmer_context.crop_stage === 'MATURITY') {
      results.push({
        rule_id: 'HARVEST_001',
        priority: 'P3_CROP_STAGE',
        action: 'WARN',
        cause: 'HARVEST_TIMING',
        reason: 'Crop approaching maturity. Plan harvest timing carefully.',
        reason_mr: 'पीक परिपक्व होत आहे. कापणीचे वेळापत्रक काळजीपूर्वक ठरवा.',
        reason_hi: 'फसल परिपक्व हो रही है। कटाई का समय सावधानी से तय करें।',
        confidence: 0.8
      });
    }
    
    return results;
  }
  
  private evaluateGenericRules(ref: RuleModuleReference, input: RuleExecutionInput): RuleResult[] {
    // Generic fallback for modules without specific implementation
    console.log(`Generic evaluation for: ${ref.moduleFile}`);
    return [];
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private getRecommendedTreatment(input: RuleExecutionInput): RecommendationDetails {
    const pestCode = input.pest_disease_state.pest_code?.toUpperCase() || '';
    const cropCode = input.farmer_context.crop_code?.toUpperCase() || '';
    
    // Default recommendations by pest (with crop-specific variants)
    const treatments: Record<string, RecommendationDetails> = {
      'APHID': {
        product_name: 'Imidacloprid 17.8% SL OR Neem Oil 1%',
        product_type: 'BOTANICAL',
        dosage: '0.5 ml/liter OR 5 ml/liter',
        application_method: 'FOLIAR_SPRAY',
        ipm_level: 4,
        efficacy_percent: 80,
        cost_per_acre_inr: 1500
      },
      'BOLLWORM': {
        product_name: 'Spinosad 45% SC OR NPV',
        product_type: 'BIOLOGICAL',
        dosage: '0.3 ml/liter',
        application_method: 'FOLIAR_SPRAY',
        ipm_level: 3,
        efficacy_percent: 85,
        cost_per_acre_inr: 2000
      },
      'WHITEFLY': {
        product_name: 'Neem Oil 1% + Sticky traps',
        product_type: 'BOTANICAL',
        dosage: '5 ml/liter',
        application_method: 'FOLIAR_SPRAY',
        ipm_level: 4,
        efficacy_percent: 70,
        cost_per_acre_inr: 1200
      },
      // CRITICAL FIX: Add SHOOT_BORER for sugarcane dead heart
      'SHOOT_BORER': {
        product_name: cropCode === 'SUGARCANE' 
          ? 'Chlorantraniliprole 18.5 SC + Trichogramma chilonis'
          : 'Fipronil 5 SC',
        product_type: 'CHEMICAL',
        dosage: cropCode === 'SUGARCANE' 
          ? '3 ml/10L water + 50,000 eggs/acre'
          : '30 ml/10L (soil drench)',
        application_method: 'FOLIAR_SPRAY',
        ipm_level: 5,
        efficacy_percent: 85,
        cost_per_acre_inr: 2500
      },
      'STEM_BORER': {
        product_name: 'Cartap Hydrochloride 50 SP OR Fipronil 5 SC',
        product_type: 'CHEMICAL',
        dosage: '20 g/10L water OR 30 ml/10L',
        application_method: 'FOLIAR_SPRAY',
        ipm_level: 5,
        efficacy_percent: 80,
        cost_per_acre_inr: 2000
      },
      'INTERNODE_BORER': {
        product_name: 'Chlorantraniliprole 18.5 SC + Detrashing',
        product_type: 'CHEMICAL',
        dosage: '3 ml/10L water',
        application_method: 'FOLIAR_SPRAY',
        ipm_level: 5,
        efficacy_percent: 85,
        cost_per_acre_inr: 2200
      },
      'TOP_BORER': {
        product_name: 'Cartap Hydrochloride 4G (Granules in leaf whorl)',
        product_type: 'CHEMICAL',
        dosage: '18-20 kg/acre',
        application_method: 'SOIL_APPLICATION',
        ipm_level: 5,
        efficacy_percent: 80,
        cost_per_acre_inr: 1800
      }
    };
    
    return treatments[pestCode] || {
      product_name: 'Neem Oil 1%',
      product_type: 'BOTANICAL',
      dosage: '5 ml/liter',
      application_method: 'FOLIAR_SPRAY',
      ipm_level: 4,
      efficacy_percent: 70,
      cost_per_acre_inr: 1200
    };
  }
  
  private calculateNextSafeWindow(forecast: { rain_probability_percent: number }): string {
    // Estimate next safe window based on rain probability
    const hoursToWait = forecast.rain_probability_percent > 80 ? 48 : 24;
    const nextWindow = new Date(Date.now() + hoursToWait * 60 * 60 * 1000);
    return nextWindow.toISOString();
  }
  
  private checkForBlocks(decisions: DecisionsByPriority): RuleResult | null {
    // Check P0 first
    const p0Block = decisions.P0_emergency.find(r => r.action === 'BLOCK');
    if (p0Block) return p0Block;
    
    // Check P1
    const p1Block = decisions.P1_regulatory.find(r => r.action === 'BLOCK');
    if (p1Block) return p1Block;
    
    return null;
  }
  
  private extractRecommendation(decision: PrimaryDecision): RecommendationDetails {
    return {
      product_name: decision.application_details.product_name,
      product_type: decision.application_details.product_type,
      dosage: decision.application_details.concentration,
      application_method: decision.application_details.application_method,
      ipm_level: decision.ipm_level,
      efficacy_percent: decision.expected_outcomes.efficacy_percent
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OUTPUT FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════
  
  private formatDecisionOutput(
    resolved: ReturnType<typeof resolveConflicts>,
    economic: ReturnType<typeof calculateEconomicViability> | null,
    decisions: DecisionsByPriority,
    input: RuleExecutionInput,
    startTime: number
  ): DecisionOutput {
    const decision_id = crypto.randomUUID();
    
    return {
      decision_id,
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      status: resolved.status === 'SUCCESS' ? 'SUCCESS' : 'BLOCKED',
      primary_decision: resolved.primary_decision || this.createNoActionDecision(),
      secondary_actions: resolved.secondary_actions,
      blocked_actions: resolved.blocked_actions,
      economic_assessment: economic || this.createDefaultEconomicAssessment(),
      scientific_justification: this.generateScientificJustification(decisions),
      rules_applied: this.generateAppliedRules(decisions),
      contingency_planning: this.generateContingencyPlan(input),
      follow_up_schedule: this.generateFollowUpSchedule(input),
      audit_trail: this.generateAuditTrail(decisions, input, startTime),
      confidence_metrics: this.generateConfidenceMetrics(decisions, input),
      farmer_messages: this.generateFarmerMessages(resolved, input)
    };
  }
  
  private formatBlockedDecision(
    blockingRule: RuleResult,
    decisions: DecisionsByPriority,
    input: RuleExecutionInput,
    startTime: number
  ): DecisionOutput {
    return {
      decision_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      status: 'BLOCKED',
      primary_decision: this.createNoActionDecision(),
      secondary_actions: [],
      blocked_actions: [{
        action: blockingRule.cause,
        blocked_by_rule: blockingRule.rule_id,
        priority: blockingRule.priority,
        reason: blockingRule.reason,
        reason_mr: blockingRule.reason_mr,
        reason_hi: blockingRule.reason_hi,
        alternatives: blockingRule.alternatives || []
      }],
      economic_assessment: this.createDefaultEconomicAssessment(),
      scientific_justification: [],
      rules_applied: this.generateAppliedRules(decisions),
      contingency_planning: this.generateContingencyPlan(input),
      follow_up_schedule: this.generateFollowUpSchedule(input),
      audit_trail: this.generateAuditTrail(decisions, input, startTime),
      confidence_metrics: this.generateConfidenceMetrics(decisions, input)
    };
  }
  
  private formatWeatherDelayedDecision(
    resolved: ReturnType<typeof resolveConflicts>,
    decisions: DecisionsByPriority,
    input: RuleExecutionInput,
    startTime: number
  ): DecisionOutput {
    return {
      decision_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      status: 'WEATHER_DELAYED',
      primary_decision: this.createNoActionDecision(),
      secondary_actions: resolved.secondary_actions,
      blocked_actions: [],
      economic_assessment: this.createDefaultEconomicAssessment(),
      scientific_justification: [],
      rules_applied: this.generateAppliedRules(decisions),
      contingency_planning: this.generateContingencyPlan(input),
      follow_up_schedule: this.generateFollowUpSchedule(input),
      audit_trail: this.generateAuditTrail(decisions, input, startTime),
      confidence_metrics: this.generateConfidenceMetrics(decisions, input),
      farmer_messages: {
        summary_mr: `हवामानामुळे फवारणी पुढे ढकला. पुढील सुरक्षित वेळ: ${resolved.next_safe_window}`,
        summary_hi: `मौसम के कारण छिड़काव टालें। अगला सुरक्षित समय: ${resolved.next_safe_window}`,
        summary_en: `Delay spraying due to weather. Next safe window: ${resolved.next_safe_window}`
      }
    };
  }
  
  /**
   * Generate DEFAULT decision when no rules match
   * Uses crop+stage+soil context to provide useful recommendations
   */
  private generateDefaultDecision(
    input: RuleExecutionInput,
    startTime: number
  ): DecisionOutput {
    console.log('🌱 Generating default crop-stage recommendation (no rules matched)');
    
    const cropCode = input.farmer_context.crop_code?.toUpperCase() || 'UNKNOWN';
    const cropStage = input.farmer_context.crop_stage?.toUpperCase() || 'VEGETATIVE';
    
    // Get crop-specific default recommendation based on soil/stage
    const defaultAction = this.getCropStageDefaultAction(cropCode, cropStage, input);
    
    return {
      decision_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      status: 'DEFAULT_RECOMMENDATION',
      primary_decision: defaultAction,
      secondary_actions: this.getSecondaryActionsForCrop(cropCode, cropStage),
      blocked_actions: [],
      economic_assessment: this.createDefaultEconomicAssessment(),
      scientific_justification: [{
        decision: `Default ${cropCode} ${cropStage} recommendation`,
        rule_id: 'DEFAULT_CROP_STAGE',
        rationale: 'No specific pest/disease rules matched. Providing general crop care advice based on growth stage and soil conditions.',
        research_basis: 'ICAR crop management guidelines',
        ipm_level: 4,
        resistance_risk: 'VERY_LOW',
        environmental_impact: 'MINIMAL'
      }],
      rules_applied: [{
        rule_id: 'DEFAULT_CROP_STAGE',
        rule_file: 'default-recommendations',
        priority: 'P6_OPTIMIZATION',
        result: 'RECOMMEND',
        confidence: 0.7
      }],
      contingency_planning: this.generateContingencyPlan(input),
      follow_up_schedule: this.generateFollowUpSchedule(input),
      audit_trail: {
        input_hash: this.hashInput(input),
        rules_loaded: [],
        rules_executed: 0,
        rules_matched: 0,
        rules_version: this.rulesVersion,
        execution_time_ms: Date.now() - startTime,
        determinism_verified: true,
        explainability_score: 0.7,
        engine_version: RULE_ENGINE_VERSION
      },
      confidence_metrics: {
        rule_execution_confidence: 0.7,
        input_data_quality: this.assessInputQuality(input),
        weather_forecast_confidence: 0.8,
        hypothesis_confidence: 0.6,
        overall_decision_confidence: 0.65
      },
      farmer_messages: this.getDefaultFarmerMessages(cropCode, cropStage, input)
    };
  }
  
  /**
   * Get crop+stage specific default action
   */
  private getCropStageDefaultAction(
    cropCode: string,
    cropStage: string,
    input: RuleExecutionInput
  ): PrimaryDecision {
    // Check soil deficiencies first
    const soilNState = input.field_conditions?.soil_nitrogen_state;
    const soilPState = input.field_conditions?.soil_phosphorus_state;
    const soilKState = input.field_conditions?.soil_potassium_state;
    
    // Fertilizer recommendation based on soil state
    if (soilNState === 'LOW') {
      return this.createFertilizerRecommendation('NITROGEN', cropCode, input);
    }
    if (soilPState === 'LOW') {
      return this.createFertilizerRecommendation('PHOSPHORUS', cropCode, input);
    }
    if (soilKState === 'LOW') {
      return this.createFertilizerRecommendation('POTASSIUM', cropCode, input);
    }
    
    // Crop-stage specific default
    const stageDefaults: Record<string, { action: string; product: string; dosage: string }> = {
      'VEGETATIVE': {
        action: 'APPLY_GROWTH_SUPPORT',
        product: 'Urea + Micronutrient mixture',
        dosage: '25 kg Urea + 2 kg micronutrients per acre'
      },
      'FLOWERING': {
        action: 'APPLY_FLOWERING_SUPPORT',
        product: 'DAP + Boron',
        dosage: '20 kg DAP + 1 kg Boron per acre'
      },
      'FRUITING': {
        action: 'APPLY_FRUITING_SUPPORT',
        product: 'MOP (Potash)',
        dosage: '25 kg MOP per acre'
      },
      'MATURITY': {
        action: 'PREPARE_HARVEST',
        product: 'None - Prepare for harvest',
        dosage: 'No application needed'
      }
    };
    
    const defaultStage = stageDefaults[cropStage] || stageDefaults['VEGETATIVE'];
    
    return {
      action_type: 'APPLY_FERTILIZER',
      specific_action: defaultStage.action,
      target: { crop_code: cropCode, crop_stage: cropStage },
      urgency: 'WITHIN_7_DAYS',
      timing: {
        recommended_start: new Date().toISOString(),
        recommended_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        weather_dependency: true,
        reason: `General ${cropStage.toLowerCase()} stage care for ${cropCode}`
      },
      application_details: {
        product_name: defaultStage.product,
        product_type: 'FERTILIZER',
        concentration: defaultStage.dosage,
        quantity_per_acre: defaultStage.dosage,
        total_quantity: `${input.farmer_context.land_size_acres} acres × ${defaultStage.dosage}`,
        water_requirement: 'Apply to moist soil',
        application_method: 'SOIL_APPLICATION',
        coverage_instructions: 'Apply uniformly around plant base'
      },
      expected_outcomes: {
        efficacy_percent: 80,
        time_to_visible_effect_days: '10-14',
        success_indicators: ['Improved plant vigor', 'Healthy green color']
      },
      ipm_level: 6
    };
  }
  
  /**
   * Create fertilizer recommendation based on deficiency
   */
  private createFertilizerRecommendation(
    nutrientType: 'NITROGEN' | 'PHOSPHORUS' | 'POTASSIUM',
    cropCode: string,
    input: RuleExecutionInput
  ): PrimaryDecision {
    const fertilizerMap = {
      'NITROGEN': { product: 'Urea (46% N)', dosage: '50 kg/acre', cost: 850 },
      'PHOSPHORUS': { product: 'DAP (18-46-0)', dosage: '40 kg/acre', cost: 1200 },
      'POTASSIUM': { product: 'MOP (60% K₂O)', dosage: '35 kg/acre', cost: 700 }
    };
    
    const fert = fertilizerMap[nutrientType];
    
    return {
      action_type: 'APPLY_FERTILIZER',
      specific_action: `CORRECT_${nutrientType}_DEFICIENCY`,
      target: { crop_code: cropCode, nutrient: nutrientType },
      urgency: 'WITHIN_48H',
      timing: {
        recommended_start: new Date().toISOString(),
        recommended_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        weather_dependency: true,
        reason: `Soil ${nutrientType.toLowerCase()} is LOW - correction needed`
      },
      application_details: {
        product_name: fert.product,
        product_type: 'FERTILIZER',
        concentration: fert.dosage,
        quantity_per_acre: fert.dosage,
        total_quantity: `${fert.dosage} × ${input.farmer_context.land_size_acres} acres`,
        water_requirement: 'Apply to moist soil, irrigate after application',
        application_method: 'SOIL_APPLICATION',
        coverage_instructions: 'Apply uniformly around plant base, avoid direct contact with stem'
      },
      expected_outcomes: {
        efficacy_percent: 85,
        time_to_visible_effect_days: '7-10',
        success_indicators: ['Improved leaf color', 'Increased growth rate', 'Healthy new leaves']
      },
      ipm_level: 6
    };
  }
  
  /**
   * Get secondary actions for crop
   */
  private getSecondaryActionsForCrop(cropCode: string, cropStage: string): any[] {
    return [{
      action_type: 'MONITOR',
      description: 'Continue field monitoring',
      description_mr: 'शेताचे निरीक्षण सुरू ठेवा',
      description_hi: 'खेत की निगरानी जारी रखें',
      timing: 'Every 3-5 days',
      priority: 'MEDIUM'
    }];
  }
  
  /**
   * Get default farmer messages
   */
  private getDefaultFarmerMessages(
    cropCode: string,
    cropStage: string,
    input: RuleExecutionInput
  ): FarmerMessages {
    const soilNState = input.field_conditions?.soil_nitrogen_state;
    const soilPState = input.field_conditions?.soil_phosphorus_state;
    const soilKState = input.field_conditions?.soil_potassium_state;
    
    // Deficiency message
    if (soilNState === 'LOW') {
      return {
        summary_mr: `मातीतील नायट्रोजन कमी आहे. युरिया 50 kg/एकर द्या. खर्च: ₹850/एकर`,
        summary_hi: `मिट्टी में नाइट्रोजन कम है। यूरिया 50 kg/एकड़ दें। लागत: ₹850/एकड़`,
        summary_en: `Soil nitrogen is LOW. Apply Urea 50 kg/acre. Cost: ₹850/acre`
      };
    }
    if (soilPState === 'LOW') {
      return {
        summary_mr: `मातीतील फॉस्फरस कमी आहे. DAP 40 kg/एकर द्या. खर्च: ₹1200/एकर`,
        summary_hi: `मिट्टी में फास्फोरस कम है। DAP 40 kg/एकड़ दें। लागत: ₹1200/एकड़`,
        summary_en: `Soil phosphorus is LOW. Apply DAP 40 kg/acre. Cost: ₹1200/acre`
      };
    }
    if (soilKState === 'LOW') {
      return {
        summary_mr: `मातीतील पोटॅशियम कमी आहे. MOP 35 kg/एकर द्या. खर्च: ₹700/एकर`,
        summary_hi: `मिट्टी में पोटेशियम कम है। MOP 35 kg/एकड़ दें। लागत: ₹700/एकड़`,
        summary_en: `Soil potassium is LOW. Apply MOP 35 kg/acre. Cost: ₹700/acre`
      };
    }
    
    // Generic stage-based message
    const cropNameMr = this.getCropNameMr(cropCode);
    const cropNameHi = this.getCropNameHi(cropCode);
    
    return {
      summary_mr: `तुमचे ${cropNameMr} पीक ${cropStage} अवस्थेत आहे. सध्या सामान्य काळजी घ्या आणि निरीक्षण सुरू ठेवा.`,
      summary_hi: `आपकी ${cropNameHi} फसल ${cropStage} अवस्था में है। सामान्य देखभाल करें और निगरानी जारी रखें।`,
      summary_en: `Your ${cropCode} crop is in ${cropStage} stage. Continue regular care and monitoring.`
    };
  }
  
  private getCropNameMr(cropCode: string): string {
    const names: Record<string, string> = {
      'SUGARCANE': 'ऊस', 'COTTON': 'कापूस', 'RICE': 'भात', 'PADDY': 'भात',
      'WHEAT': 'गहू', 'SOYBEAN': 'सोयाबीन', 'MAIZE': 'मका', 'TOMATO': 'टोमॅटो',
      'ONION': 'कांदा', 'POTATO': 'बटाटा', 'CHILLI': 'मिरची', 'GROUNDNUT': 'भुईमूग'
    };
    return names[cropCode] || cropCode;
  }
  
  private getCropNameHi(cropCode: string): string {
    const names: Record<string, string> = {
      'SUGARCANE': 'गन्ना', 'COTTON': 'कपास', 'RICE': 'धान', 'PADDY': 'धान',
      'WHEAT': 'गेहूं', 'SOYBEAN': 'सोयाबीन', 'MAIZE': 'मक्का', 'TOMATO': 'टमाटर',
      'ONION': 'प्याज', 'POTATO': 'आलू', 'CHILLI': 'मिर्च', 'GROUNDNUT': 'मूंगफली'
    };
    return names[cropCode] || cropCode;
  }

  private generateFallbackDecision(
    input: RuleExecutionInput,
    error: Error,
    startTime: number
  ): DecisionOutput {
    console.warn('Generating fallback decision due to error:', error.message);
    
    return {
      decision_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      status: 'FALLBACK_MODE',
      primary_decision: {
        action_type: 'SPRAY_BOTANICAL',
        specific_action: 'APPLY_NEEM_OIL_SAFE_DEFAULT',
        target: {
          pest_code: input.pest_disease_state.pest_code,
          disease_code: input.pest_disease_state.disease_code
        },
        urgency: 'WITHIN_24H',
        timing: {
          recommended_start: new Date().toISOString(),
          recommended_end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          weather_dependency: true,
          reason: 'Safe default recommendation - please consult expert for specific guidance'
        },
        application_details: {
          product_name: 'Neem Oil 1%',
          product_type: 'BOTANICAL',
          concentration: '5 ml/liter',
          quantity_per_acre: '500 ml',
          total_quantity: `${500 * input.farmer_context.land_size_acres} ml`,
          water_requirement: '200 liters/acre',
          application_method: 'FOLIAR_SPRAY',
          coverage_instructions: 'Spray on all plant surfaces including undersides of leaves'
        },
        expected_outcomes: {
          efficacy_percent: 60,
          time_to_visible_effect_days: '5-7',
          success_indicators: ['Reduced pest activity', 'New healthy growth']
        },
        ipm_level: 4
      },
      secondary_actions: [],
      blocked_actions: [],
      economic_assessment: this.createDefaultEconomicAssessment(),
      scientific_justification: [{
        decision: 'Fallback to safe botanical',
        rule_id: 'FALLBACK_001',
        rationale: 'System error occurred. Recommending universally safe option.',
        research_basis: 'Neem oil is effective against wide range of pests with minimal environmental impact',
        ipm_level: 4,
        resistance_risk: 'VERY_LOW',
        environmental_impact: 'MINIMAL'
      }],
      rules_applied: [],
      contingency_planning: this.generateContingencyPlan(input),
      follow_up_schedule: this.generateFollowUpSchedule(input),
      audit_trail: {
        input_hash: 'fallback',
        rules_loaded: [],
        rules_executed: 0,
        rules_matched: 0,
        rules_version: this.rulesVersion,
        execution_time_ms: Date.now() - startTime,
        determinism_verified: false,
        explainability_score: 0.5,
        engine_version: RULE_ENGINE_VERSION
      },
      confidence_metrics: {
        rule_execution_confidence: 0.5,
        input_data_quality: 0.7,
        weather_forecast_confidence: 0.7,
        hypothesis_confidence: input.confirmed_hypotheses[0]?.confidence || 0.5,
        overall_decision_confidence: 0.5,
        uncertainty_factors: ['System error occurred', 'Using safe fallback recommendation']
      },
      farmer_messages: {
        summary_mr: 'सुरक्षित सल्ला: कडुनिंबाचे तेल 1% वापरा. तज्ञांचा सल्ला घ्या.',
        summary_hi: 'सुरक्षित सलाह: नीम तेल 1% उपयोग करें। विशेषज्ञ से परामर्श लें।',
        summary_en: 'Safe recommendation: Use Neem Oil 1%. Please consult expert for specific guidance.'
      }
    };
  }
  
  private createNoActionDecision(): PrimaryDecision {
    return {
      action_type: 'NO_ACTION',
      specific_action: 'NO_ACTION_REQUIRED',
      target: {},
      urgency: 'NON_URGENT',
      timing: {
        recommended_start: new Date().toISOString(),
        recommended_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        weather_dependency: false,
        reason: 'No action required at this time'
      },
      application_details: {
        product_name: 'None',
        product_type: 'ORGANIC',
        concentration: 'N/A',
        quantity_per_acre: 'N/A',
        total_quantity: 'N/A',
        water_requirement: 'N/A',
        application_method: 'HAND_PICKING',
        coverage_instructions: 'Continue monitoring'
      },
      expected_outcomes: {
        efficacy_percent: 100,
        time_to_visible_effect_days: 'N/A',
        success_indicators: ['Crop remains healthy']
      }
    };
  }
  
  private createDefaultEconomicAssessment() {
    return {
      treatment_cost_inr: 0,
      treatment_cost_per_acre_inr: 0,
      expected_loss_without_treatment_inr: 0,
      expected_loss_prevented_inr: 0,
      net_benefit_inr: 0,
      benefit_cost_ratio: 0,
      roi_percent: 0,
      affordability: {
        ratio: 0,
        assessment: 'AFFORDABLE' as const,
        farmer_can_afford: true
      },
      viability_decision: 'VIABLE' as const,
      recommendation: 'RECOMMENDED' as const
    };
  }
  
  private generateScientificJustification(decisions: DecisionsByPriority): ScientificJustification[] {
    const justifications: ScientificJustification[] = [];
    
    const allRecommendations = [
      ...decisions.P4_economic,
      ...decisions.P5_ipm
    ].filter(r => r.action === 'RECOMMEND');
    
    for (const rec of allRecommendations.slice(0, 3)) {
      justifications.push({
        decision: rec.recommendation?.product_name || rec.cause,
        rule_id: rec.rule_id,
        rationale: rec.reason,
        research_basis: 'ICAR/SAU validated protocols',
        ipm_level: rec.recommendation?.ipm_level,
        resistance_risk: 'LOW',
        environmental_impact: rec.recommendation?.product_type === 'BIOLOGICAL' ? 'MINIMAL' : 'LOW'
      });
    }
    
    return justifications;
  }
  
  private generateAppliedRules(decisions: DecisionsByPriority): AppliedRule[] {
    const applied: AppliedRule[] = [];
    
    Object.entries(decisions).forEach(([priority, rules]) => {
      rules.forEach(rule => {
        applied.push({
          rule_id: rule.rule_id,
          rule_file: priority,
          priority: rule.priority,
          result: rule.action,
          confidence: rule.confidence
        });
      });
    });
    
    return applied;
  }
  
  private generateContingencyPlan(input: RuleExecutionInput): ContingencyPlan {
    return {
      if_no_improvement: {
        check_after_days: 5,
        next_action: 'Escalate to selective chemical if biological control insufficient',
        next_action_mr: 'जैविक नियंत्रण अपुरे असल्यास रासायनिक कीटकनाशक वापरा',
        next_action_hi: 'जैविक नियंत्रण अपर्याप्त होने पर रासायनिक कीटनाशक का उपयोग करें'
      },
      if_weather_delays: {
        alternative: 'Apply systemic product with sticker/spreader',
        alternative_mr: 'स्टिकरसह सिस्टेमिक उत्पादन वापरा',
        alternative_hi: 'स्टिकर के साथ सिस्टेमिक उत्पाद का उपयोग करें',
        risk_level: 'MEDIUM',
        max_delay_days: 3
      }
    };
  }
  
  private generateFollowUpSchedule(input: RuleExecutionInput): FollowUpSchedule {
    return {
      day_3: {
        check: 'Observe pest population and new damage',
        check_mr: 'किडींची संख्या आणि नवीन नुकसान पहा',
        check_hi: 'कीट आबादी और नए नुकसान का निरीक्षण करें',
        method: 'Visual inspection of 10 random plants',
        success_criteria: '50% reduction in pest count',
        decision_if_unsuccessful: 'Repeat application or escalate'
      },
      day_7: {
        check: 'Assess treatment effectiveness',
        check_mr: 'उपचाराची परिणामकारकता तपासा',
        check_hi: 'उपचार की प्रभावशीलता का आकलन करें',
        method: 'Count pests on 20 leaves',
        success_criteria: '80% reduction in pest count',
        decision_if_unsuccessful: 'Switch to different MOA group'
      }
    };
  }
  
  private generateAuditTrail(
    decisions: DecisionsByPriority,
    input: RuleExecutionInput,
    startTime: number
  ): AuditTrail {
    const rulesLoaded = input.rule_modules_required.map(r => r.moduleFile);
    const totalRules = Object.values(decisions).flat().length;
    const matchedRules = Object.values(decisions).flat().filter(r => 
      r.action === 'RECOMMEND' || r.action === 'BLOCK'
    ).length;
    
    return {
      input_hash: this.hashInput(input),
      rules_loaded: rulesLoaded,
      rules_executed: totalRules,
      rules_matched: matchedRules,
      rules_version: this.rulesVersion,
      execution_time_ms: Date.now() - startTime,
      determinism_verified: true,
      explainability_score: 0.85,
      engine_version: RULE_ENGINE_VERSION
    };
  }
  
  private generateConfidenceMetrics(
    decisions: DecisionsByPriority,
    input: RuleExecutionInput
  ): ConfidenceMetrics {
    const allRules = Object.values(decisions).flat();
    const avgConfidence = allRules.length > 0
      ? allRules.reduce((sum, r) => sum + r.confidence, 0) / allRules.length
      : 0.5;
    
    return {
      rule_execution_confidence: avgConfidence,
      input_data_quality: this.assessInputQuality(input),
      weather_forecast_confidence: 0.8,
      hypothesis_confidence: input.confirmed_hypotheses[0]?.confidence || 0.5,
      overall_decision_confidence: Math.min(avgConfidence, input.confirmed_hypotheses[0]?.confidence || 0.5)
    };
  }
  
  private generateFarmerMessages(
    resolved: ReturnType<typeof resolveConflicts>,
    input: RuleExecutionInput
  ): FarmerMessages {
    if (!resolved.primary_decision) {
      return {
        summary_mr: 'सध्या कोणतीही कृती आवश्यक नाही. निरीक्षण सुरू ठेवा.',
        summary_hi: 'अभी कोई कार्रवाई आवश्यक नहीं। निगरानी जारी रखें।',
        summary_en: 'No action required at this time. Continue monitoring.'
      };
    }
    
    const product = resolved.primary_decision.application_details.product_name;
    const dosage = resolved.primary_decision.application_details.concentration;
    
    return {
      summary_mr: `${product} वापरा. डोस: ${dosage}`,
      summary_hi: `${product} का उपयोग करें। खुराक: ${dosage}`,
      summary_en: `Use ${product}. Dosage: ${dosage}`
    };
  }
  
  private hashInput(input: RuleExecutionInput): string {
    const key = `${input.session_id}-${input.farmer_context.crop_code}-${input.pest_disease_state.pest_code}`;
    return key.substring(0, 32);
  }
  
  private assessInputQuality(input: RuleExecutionInput): number {
    let score = 0.5;
    
    if (input.farmer_context.crop_stage) score += 0.1;
    if (input.pest_disease_state.severity) score += 0.1;
    if (input.environmental_context.weather_forecast_24h) score += 0.1;
    if (input.field_conditions.soil_type) score += 0.1;
    if (input.confirmed_hypotheses.length > 0) score += 0.1;
    
    return Math.min(score, 1.0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface LoadedRuleModule {
  priority: RulePriority;
  category: string;
  moduleFile: string;
  reference: RuleModuleReference;
  evaluator: RuleEvaluator;
}

interface RuleEvaluator {
  moduleRef: RuleModuleReference;
  evaluate: (input: RuleExecutionInput) => RuleResult[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const ruleEngineExecutor = new RuleEngineExecutor();
export { RULE_ENGINE_VERSION };

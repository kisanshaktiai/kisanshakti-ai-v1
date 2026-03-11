/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE MODULE RESOLVER - MAPS NLU OUTPUT TO DECISION GRAPH MODULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Determines which TypeScript rule modules from src/decision-graph/
 * should be loaded and evaluated based on NLU output.
 */

import {
  RuleModuleReference,
  RulePriority,
  NLUIntent,
  ExtractedEntities,
  SafetyRuleModule,
  NLUOutputWithRuleMapping,
  ClarificationQuestionWithType,
  SafetyAlerts,
  ContextRequirements,
} from './rule-module-types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CORE RULE MODULE RESOLVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolves which rule modules should be loaded based on NLU output
 * Always loads safety-critical modules (P0-P2) first
 */
export function resolveRuleModules(
  intent: NLUIntent,
  entities: ExtractedEntities,
  safetyAlerts: SafetyAlerts
): RuleModuleReference[] {
  const modules: RuleModuleReference[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════
  // P0 - EMERGENCY RULES (Always load first)
  // ═══════════════════════════════════════════════════════════════════════
  modules.push({
    category: 'safety-rules',
    moduleFile: 'emergency-rules',
    importPath: '@/decision-graph/safety-rules/emergency-rules',
    priority: 'P0_EMERGENCY',
    required: true,
    reason: 'Emergency detection and override - always required'
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // P1 - REGULATORY COMPLIANCE (Always load)
  // ═══════════════════════════════════════════════════════════════════════
  modules.push({
    category: 'safety-rules',
    moduleFile: 'chemical-safety-rules',
    importPath: '@/decision-graph/safety-rules/chemical-safety-rules',
    priority: 'P1_REGULATORY',
    required: true,
    reason: 'Banned substances and chemical safety - always required'
  });
  
  modules.push({
    category: 'safety-rules',
    moduleFile: 'phi-withdrawal-rules',
    importPath: '@/decision-graph/safety-rules/phi-withdrawal-rules',
    priority: 'P1_REGULATORY',
    required: true,
    reason: 'Pre-harvest interval compliance - always required'
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // P2 - WEATHER & ENVIRONMENTAL SAFETY (Always load)
  // ═══════════════════════════════════════════════════════════════════════
  modules.push({
    category: 'safety-rules',
    moduleFile: 'weather-action-rules',
    importPath: '@/decision-graph/safety-rules/weather-action-rules',
    priority: 'P2_WEATHER_SAFETY',
    required: true,
    reason: 'Weather restrictions for spray timing'
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // P3 - CROP STAGE & REGIONAL RULES (Context-dependent)
  // ═══════════════════════════════════════════════════════════════════════
  if (entities.crop_code) {
    modules.push({
      category: 'safety-rules',
      moduleFile: 'harvest-quality-rules',
      importPath: '@/decision-graph/safety-rules/harvest-quality-rules',
      priority: 'P3_CROP_STAGE',
      required: entities.crop_stage === 'MATURITY' || entities.crop_stage === 'HARVEST',
      reason: 'Harvest timing and quality requirements'
    });
  }
  
  modules.push({
    category: 'safety-rules',
    moduleFile: 'regional-seasonal-rules',
    importPath: '@/decision-graph/safety-rules/regional-seasonal-rules',
    priority: 'P3_CROP_STAGE',
    required: false,
    reason: 'Regional and seasonal adaptations'
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // INTENT-SPECIFIC RULES
  // ═══════════════════════════════════════════════════════════════════════
  
  if (intent === 'PEST_PROBLEM' || intent === 'EMERGENCY') {
    // P4 - Economic Threshold Rules
    modules.push({
      category: 'safety-rules',
      moduleFile: 'economic-threshold-rules',
      importPath: '@/decision-graph/safety-rules/economic-threshold-rules',
      priority: 'P4_ECONOMIC',
      required: true,
      reason: 'Pest economic threshold determination'
    });
    
    // P5 - IPM Rules
    modules.push({
      category: 'safety-rules',
      moduleFile: 'ipm-rules',
      importPath: '@/decision-graph/safety-rules/ipm-rules',
      priority: 'P5_IPM',
      required: true,
      reason: 'IPM ladder and biological control preferences'
    });
    
    // P5 - Resistance Management
    modules.push({
      category: 'safety-rules',
      moduleFile: 'resistance-management-rules',
      importPath: '@/decision-graph/safety-rules/resistance-management-rules',
      priority: 'P5_IPM',
      required: entities.treatment_history !== undefined,
      reason: 'Insecticide rotation and resistance prevention'
    });
  }
  
  if (intent === 'DISEASE_PROBLEM') {
    // Disease-specific rules
    modules.push({
      category: 'safety-rules',
      moduleFile: 'disease-management-rules',
      importPath: '@/decision-graph/safety-rules/disease-management-rules',
      priority: 'P4_ECONOMIC',
      required: true,
      reason: 'Disease severity index and fungicide recommendations'
    });
    
    // Resistance management for fungicides
    modules.push({
      category: 'safety-rules',
      moduleFile: 'resistance-management-rules',
      importPath: '@/decision-graph/safety-rules/resistance-management-rules',
      priority: 'P5_IPM',
      required: true,
      reason: 'Fungicide rotation and FRAC group management'
    });
  }
  
  if (intent === 'NUTRIENT_ISSUE') {
    // Nutrient management rules
    modules.push({
      category: 'safety-rules',
      moduleFile: 'nutrient-rules',
      importPath: '@/decision-graph/safety-rules/nutrient-rules',
      priority: 'P4_ECONOMIC',
      required: true,
      reason: 'Nutrient deficiency diagnosis and fertilizer recommendations'
    });
    
    // Advanced nitrogen efficiency layer
    modules.push({
      category: 'advanced-layers',
      moduleFile: 'layer3-nitrogen-efficiency',
      importPath: '@/decision-graph/advanced-layers/layer3-nitrogen-efficiency',
      priority: 'P6_OPTIMIZATION',
      required: false,
      reason: 'Advanced nitrogen use efficiency optimization'
    });
    
    // Plant demand layer
    modules.push({
      category: 'advanced-layers',
      moduleFile: 'layer1-plant-demand',
      importPath: '@/decision-graph/advanced-layers/layer1-plant-demand',
      priority: 'P6_OPTIMIZATION',
      required: false,
      reason: 'Crop-specific nutrient demand calculations'
    });
  }
  
  if (intent === 'WATER_ISSUE') {
    // Water management rules
    modules.push({
      category: 'safety-rules',
      moduleFile: 'water-rules',
      importPath: '@/decision-graph/safety-rules/water-rules',
      priority: 'P3_CROP_STAGE',
      required: true,
      reason: 'Irrigation scheduling and water management'
    });
    
    // Root dominance layer for water uptake
    modules.push({
      category: 'advanced-layers',
      moduleFile: 'layer2-root-dominance',
      importPath: '@/decision-graph/advanced-layers/layer2-root-dominance',
      priority: 'P6_OPTIMIZATION',
      required: false,
      reason: 'Root zone water availability analysis'
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // SAFETY ALERT OVERRIDES
  // ═══════════════════════════════════════════════════════════════════════
  
  if (safetyAlerts.banned_substance_mentioned) {
    // Ensure chemical safety is marked as highest priority
    const chemIndex = modules.findIndex(m => m.moduleFile === 'chemical-safety-rules');
    if (chemIndex !== -1) {
      modules[chemIndex].priority = 'P0_EMERGENCY';
      modules[chemIndex].reason = 'Banned substance mentioned - immediate intervention';
    }
  }
  
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
  
  // Remove duplicates (keep first occurrence which has higher priority)
  const seen = new Set<string>();
  return modules.filter(m => {
    if (seen.has(m.moduleFile)) return false;
    seen.add(m.moduleFile);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT REQUIREMENTS DETERMINATION
// ═══════════════════════════════════════════════════════════════════════════

export function determineContextRequirements(
  intent: NLUIntent,
  entities: ExtractedEntities,
  modules: RuleModuleReference[]
): ContextRequirements {
  const hasWeatherRules = modules.some(m => m.moduleFile === 'weather-action-rules');
  const hasNutrientRules = modules.some(m => m.moduleFile === 'nutrient-rules');
  const hasPestRules = modules.some(m => 
    m.moduleFile === 'economic-threshold-rules' || 
    m.moduleFile === 'ipm-rules'
  );
  
  return {
    crop_stage_required: 
      intent === 'PEST_PROBLEM' || 
      intent === 'DISEASE_PROBLEM' || 
      intent === 'NUTRIENT_ISSUE' ||
      !entities.crop_stage,
    weather_data_required: hasWeatherRules || intent === 'WEATHER_QUERY',
    soil_data_required: hasNutrientRules,
    photo_required: 
      (intent === 'PEST_PROBLEM' || intent === 'DISEASE_PROBLEM') &&
      (!entities.pest_code && !entities.disease_code),
    ndvi_data_helpful: 
      intent === 'NUTRIENT_ISSUE' || 
      intent === 'WATER_ISSUE',
    market_data_helpful: intent === 'MARKET_QUERY'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION QUESTION GENERATOR FOR RULE REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════

export function generateRuleRequiredQuestions(
  intent: NLUIntent,
  entities: ExtractedEntities,
  modules: RuleModuleReference[]
): ClarificationQuestionWithType[] {
  const questions: ClarificationQuestionWithType[] = [];
  
  // Crop identification required for most rules
  if (!entities.crop_code) {
    questions.push({
      question_id: 'Q_CROP_CODE',
      question_text_mr: '', // @deprecated — LLM translates at runtime
      question_text_hi: '', // @deprecated — LLM translates at runtime
      question_text_en: 'Which crop are you growing?',
      question_type: 'CROP_ID',
      priority: 'HIGH',
      expected_answer_type: 'CHOICE',
      options: [
        { value: 'COTTON', label_mr: '', label_hi: '', label_en: 'Cotton' },
        { value: 'SOYBEAN', label_mr: '', label_hi: '', label_en: 'Soybean' },
        { value: 'RICE', label_mr: '', label_hi: '', label_en: 'Rice' },
        { value: 'WHEAT', label_mr: '', label_hi: '', label_en: 'Wheat' },
        { value: 'TOMATO', label_mr: '', label_hi: '', label_en: 'Tomato' }
      ],
      affects_rule_selection: true,
      target_entity: 'crop_code'
    });
  }
  
  // Pest density needed for economic threshold rules
  if (intent === 'PEST_PROBLEM' && entities.pest_code && !entities.affected_area_percent) {
    questions.push({
      question_id: 'Q_PEST_DENSITY',
      question_text_mr: '', // @deprecated — LLM translates at runtime
      question_text_hi: '', // @deprecated — LLM translates at runtime
      question_text_en: 'How many pests per leaf?',
      question_type: 'PEST_DENSITY',
      priority: 'HIGH',
      expected_answer_type: 'CHOICE',
      options: [
        { value: '5', label_mr: '', label_hi: '', label_en: 'Few (up to 5)' },
        { value: '15', label_mr: '', label_hi: '', label_en: 'Moderate (5-15)' },
        { value: '25', label_mr: '', label_hi: '', label_en: 'Many (15-25)' },
        { value: '50', label_mr: '', label_hi: '', label_en: 'Very many (25+)' }
      ],
      affects_rule_selection: true,
      target_entity: 'pest_density'
    });
  }
  
  // Crop stage needed for threshold and timing
  if (!entities.crop_stage && (intent === 'PEST_PROBLEM' || intent === 'DISEASE_PROBLEM')) {
    questions.push({
      question_id: 'Q_CROP_STAGE',
      question_text_mr: '', // @deprecated — LLM translates at runtime
      question_text_hi: '', // @deprecated — LLM translates at runtime
      question_text_en: 'What is the current stage of your crop?',
      question_type: 'CROP_STAGE',
      priority: 'HIGH',
      expected_answer_type: 'CHOICE',
      options: [
        { value: 'SEEDLING', label_mr: '', label_hi: '', label_en: 'Seedling' },
        { value: 'VEGETATIVE', label_mr: '', label_hi: '', label_en: 'Vegetative' },
        { value: 'FLOWERING', label_mr: '', label_hi: '', label_en: 'Flowering' },
        { value: 'MATURITY', label_mr: '', label_hi: '', label_en: 'Maturity' }
      ],
      affects_rule_selection: true,
      target_entity: 'crop_stage'
    });
  }
  
  // Affected area for severity assessment
  if ((intent === 'PEST_PROBLEM' || intent === 'DISEASE_PROBLEM') && !entities.affected_area_percent) {
    questions.push({
      question_id: 'Q_AFFECTED_AREA',
      question_text_mr: '', // @deprecated — LLM translates at runtime
      question_text_hi: '', // @deprecated — LLM translates at runtime
      question_text_en: 'What percentage of field is affected?',
      question_type: 'AFFECTED_AREA',
      priority: 'MEDIUM',
      expected_answer_type: 'CHOICE',
      options: [
        { value: '10', label_mr: '', label_hi: '', label_en: 'Up to 10%' },
        { value: '30', label_mr: '', label_hi: '', label_en: '10-30%' },
        { value: '50', label_mr: '', label_hi: '', label_en: '30-50%' },
        { value: '75', label_mr: '', label_hi: '', label_en: 'More than 50%' }
      ],
      affects_rule_selection: true,
      target_entity: 'affected_area_percent'
    });
  }
  
  // Treatment history for resistance management
  if (modules.some(m => m.moduleFile === 'resistance-management-rules') && !entities.treatment_history) {
    questions.push({
      question_id: 'Q_LAST_SPRAY',
      question_text_mr: '', // @deprecated — LLM translates at runtime
      question_text_hi: '', // @deprecated — LLM translates at runtime
      question_text_en: 'When was the last spray done?',
      question_type: 'TREATMENT_HISTORY',
      priority: 'MEDIUM',
      expected_answer_type: 'CHOICE',
      options: [
        { value: '0', label_mr: '', label_hi: '', label_en: 'No spray done' },
        { value: '7', label_mr: '', label_hi: '', label_en: '1 week ago' },
        { value: '14', label_mr: '', label_hi: '', label_en: '2 weeks ago' },
        { value: '30', label_mr: '', label_hi: '', label_en: '1 month ago' }
      ],
      affects_rule_selection: true,
      target_entity: 'last_spray_days'
    });
  }
  
  return questions;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD COMPLETE NLU OUTPUT WITH RULE MAPPING
// ═══════════════════════════════════════════════════════════════════════════

export function buildNLUOutputWithRuleMapping(
  language: string,
  intent: NLUIntent,
  entities: ExtractedEntities,
  safetyAlerts: SafetyAlerts,
  clarityScore: number,
  ambiguities: string[]
): NLUOutputWithRuleMapping {
  // Resolve which rule modules to load
  const modules = resolveRuleModules(intent, entities, safetyAlerts);
  
  // Determine what context is needed
  const contextNeeded = determineContextRequirements(intent, entities, modules);
  
  // Generate clarification questions
  const questions = generateRuleRequiredQuestions(intent, entities, modules);
  
  // Calculate understanding confidence
  const understanding_confidence = calculateConfidence(entities, intent, clarityScore);
  
  return {
    language,
    intent,
    requiredRuleModules: modules,
    entities,
    contextNeeded,
    understanding_confidence,
    clarity_score: clarityScore,
    ambiguities,
    clarification_needed: questions.length > 0,
    questions,
    safety_alerts: safetyAlerts
  };
}

function calculateConfidence(
  entities: ExtractedEntities,
  intent: NLUIntent,
  clarityScore: number
): number {
  let confidence = 0.4; // Base confidence
  
  // Add confidence for identified entities
  if (entities.crop_code) confidence += 0.15;
  if (entities.crop_stage) confidence += 0.1;
  if (entities.pest_code || entities.disease_code) confidence += 0.15;
  if (entities.severity) confidence += 0.1;
  if (entities.affected_area_percent !== undefined) confidence += 0.1;
  
  // Adjust by clarity score
  confidence = confidence * (0.5 + clarityScore * 0.5);
  
  return Math.min(0.95, confidence);
}

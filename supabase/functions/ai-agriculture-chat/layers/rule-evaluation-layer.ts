// RULE EVALUATION LAYER - Layer 3 in 5-Layer Symbolic Brain Architecture

import { SymbolicReasoner, type SymbolicFact, type InferenceResult } from '../decision/symbolic-reasoner.ts';
import { FactExtractor } from '../decision/fact-extractor.ts';
import type { AuthoritativeLandState } from '../decision/authoritative-state-loader.ts';
import type { UnderstandingOutput } from '../llm-understanding-layer.ts';
import type { CanonicalState } from '../agents/canonical-state-builder.ts';

// CANONICAL-TO-RULE NORMALIZATION ADAPTER

// Normalize CanonicalState enum value to rule-compatible lowercase snake_case string
export function normalizeEnumForRuleMatch(enumValue: string | undefined | null): string {
  if (!enumValue || enumValue === 'UNKNOWN') return '';
  
  // Convert ENUM_VALUE to lowercase snake_case: GRAND_GROWTH → grand_growth
  return enumValue.toLowerCase().replace(/-/g, '_');
}

// Check if a rule's crop_code matches the canonical state crop
export function cropMatchesRule(canonicalCrop: string, ruleCropCode: string | null | undefined): boolean {
  // Wildcard rules match everything
  if (!ruleCropCode || ruleCropCode === 'all' || ruleCropCode === '*' || ruleCropCode === 'universal') {
    return true;
  }
  
  const normalizedCanonical = normalizeEnumForRuleMatch(canonicalCrop);
  const normalizedRule = (ruleCropCode || '').toLowerCase().trim();
  
  return normalizedCanonical === normalizedRule;
}

// Check if a rule's stage_applicable array includes the canonical state stage
export function stageMatchesRule(
  canonicalStage: string, 
  ruleStageApplicable: string[] | null | undefined
): boolean {
  // No stage restriction or empty array = matches all stages
  if (!ruleStageApplicable || ruleStageApplicable.length === 0) {
    return true;
  }
  
  const normalizedCanonical = normalizeEnumForRuleMatch(canonicalStage);
  
  // Check for wildcard entries
  const hasWildcard = ruleStageApplicable.some(s => 
    s === 'all' || s === '*' || s.toLowerCase() === 'all'
  );
  if (hasWildcard) return true;
  
  // Check for exact match (normalized)
  return ruleStageApplicable.some(s => {
    const normalizedRuleStage = (s || '').toLowerCase().replace(/-/g, '_').trim();
    return normalizedRuleStage === normalizedCanonical;
  });
}

// Normalize a CanonicalState for rule evaluation
export function createNormalizedContextForRules(canonicalState: CanonicalState): {
  crop_code: string;
  growth_stage: string;
  days_after_sowing: string;
  severity: string;
  visual_symptom: string;
  ndvi_level: string;
  soil_nitrogen: string;
  soil_phosphorus: string;
  soil_potassium: string;
} {
  return {
    crop_code: normalizeEnumForRuleMatch(canonicalState.crop_type),
    growth_stage: normalizeEnumForRuleMatch(canonicalState.crop_stage),
    days_after_sowing: normalizeEnumForRuleMatch(canonicalState.days_after_sowing),
    severity: normalizeEnumForRuleMatch(canonicalState.severity),
    visual_symptom: normalizeEnumForRuleMatch(canonicalState.visual_symptom),
    ndvi_level: normalizeEnumForRuleMatch(canonicalState.ndvi_level),
    soil_nitrogen: normalizeEnumForRuleMatch(canonicalState.soil_nitrogen),
    soil_phosphorus: normalizeEnumForRuleMatch(canonicalState.soil_phosphorus),
    soil_potassium: normalizeEnumForRuleMatch(canonicalState.soil_potassium),
  };
}

// INPUT/OUTPUT TYPES

export interface RuleEvaluationInput {
  // From Layer 2: LLM Understanding
  understanding: UnderstandingOutput | null;
  
  // Land state from authoritative sources
  land_state: AuthoritativeLandState | null;
  
  // Canonical state (optional, for backward compatibility)
  canonical_state?: CanonicalState;
  
  // User query for keyword matching
  user_query: string;
  
  // Optional: Override fuzzy matching behavior
  options?: {
    allowFuzzyMatch?: boolean;
    minFuzzyScore?: number;
    urgencyOverride?: boolean;
  };
}

export interface Recommendation {
  rule_id: string;
  cause: string;
  action_type: string;
  priority: number;
  confidence: number;
  response: {
    mr?: string;
    hi?: string;
    en?: string;
  };
  product_details?: {
    product_reference?: string;
    phi_days?: number;
    bee_toxicity?: string;
    ipm_level?: number;
    active_ingredient?: string;
    organic_alternative?: string;
  };
  reasoning: string;
}

export interface RuleEvaluationOutput {
  decision_id: string;
  
  // Primary diagnosis (if any)
  diagnosis: {
    cause_id: string;
    cause_name: string;
    confidence: number;
    evidence: string[];
  } | null;
  
  // Alternative diagnoses
  alternative_diagnoses: Array<{
    cause_id: string;
    cause_name: string;
    confidence: number;
  }>;
  
  // Rules that fired
  rules_fired: string[];
  
  // Recommendations from rules
  recommendations: Recommendation[];
  
  // Matched responses for LLM formatting
  // FIX 34: Removed dropped response_mr/hi/en — use action_text/reason_text/knowledge_text
  matched_responses: Array<{
    rule_id: string;
    cause: string;
    action_text?: string;
    reason_text?: string;
    knowledge_text?: string;
    i18n_key?: string;
    action_type?: string;
    priority?: number;
    confidence_score?: number;
  }>;
  
  // Overall confidence
  confidence: number;
  
  // Processing metadata
  metadata: {
    rules_evaluated: number;
    rules_fired: number;
    processing_time_ms: number;
    fuzzy_matching_used: boolean;
  };
}

// MAIN EVALUATION FUNCTION

// Evaluate rules against understanding and land state.
export async function evaluateRules(input: RuleEvaluationInput): Promise<RuleEvaluationOutput> {
  const startTime = Date.now();
  console.log('⚙️ [RuleEvaluationLayer] Starting rule evaluation...');
  
  // 1. Build facts from understanding + land state
  const factExtractor = new FactExtractor();
  const facts = buildFactsFromInput(input, factExtractor);
  
  console.log(`   📊 Facts built: crop=${facts.crop}, stage=${facts.growth_stage}, symptom=${facts.primary_symptom}`);
  
  // 2. Determine fuzzy matching options
  const fuzzyOptions = {
    // FIX-B4a (P1, 2026-08-09): fuzzy matching is now explicit opt-in only.
    // Previously low understanding-confidence (<0.7) auto-enabled fuzzy rule
    // matching — loosening evidence requirements exactly when the farmer was
    // LEAST understood. Correct behaviour for low understanding confidence is
    // clarification, not looser matching. ROLLBACK: restore `?? ((input.
    // understanding?.confidence ?? 0) < 0.7)`.
    allowFuzzyMatch: input.options?.allowFuzzyMatch ?? false,
    minFuzzyScore: input.options?.minFuzzyScore ?? 0.5,
    urgencyOverride: input.options?.urgencyOverride ?? 
                     (input.understanding?.urgency === 'EMERGENCY' ||
                      input.understanding?.urgency === 'HIGH')
  };
  
  console.log(`   🔧 Fuzzy matching: ${fuzzyOptions.allowFuzzyMatch}, urgency override: ${fuzzyOptions.urgencyOverride}`);
  
  // 3. Execute symbolic rules (existing code - no changes to reasoner)
  const reasoner = new SymbolicReasoner();
  const inference = await reasoner.executeRules(facts, input.land_state, fuzzyOptions);
  
  console.log(`   ✅ Inference complete: ${inference.rules_fired} rules fired, confidence: ${(inference.confidence * 100).toFixed(0)}%`);
  
  // 4. Map to output format
  const processingTime = Date.now() - startTime;
  
  return {
    decision_id: `decision_${Date.now()}`,
    
    diagnosis: inference.diagnosis ? {
      cause_id: inference.diagnosis.cause_id,
      cause_name: inference.diagnosis.cause_name,
      confidence: inference.diagnosis.confidence,
      evidence: inference.diagnosis.evidence
    } : null,
    
    alternative_diagnoses: inference.alternative_diagnoses.map(d => ({
      cause_id: d.cause_id,
      cause_name: d.cause_name,
      confidence: d.confidence
    })),
    
    rules_fired: inference.recommendations.map(r => r.rule_id),
    
    recommendations: inference.recommendations.map(mapToRecommendation),
    
    matched_responses: inference.matched_responses || [],
    
    confidence: inference.confidence,
    
    metadata: {
      rules_evaluated: inference.rules_evaluated,
      rules_fired: inference.rules_fired,
      processing_time_ms: processingTime,
      fuzzy_matching_used: fuzzyOptions.allowFuzzyMatch || fuzzyOptions.urgencyOverride
    }
  };
}

// HELPER FUNCTIONS

// Build SymbolicFact from understanding and land state
function buildFactsFromInput(
  input: RuleEvaluationInput, 
  extractor: FactExtractor
): SymbolicFact {
  // CANONICAL-TO-RULE NORMALIZATION: Apply normalization for rule matching
  
  // If we have a canonical state, use the extractor with normalized values
  if (input.canonical_state && input.land_state) {
    // Create normalized context for rule matching
    const normalizedContext = createNormalizedContextForRules(input.canonical_state);
    
    console.log(`   📐 [RuleNormalization] Canonical→Rule normalization:
      crop_type: ${input.canonical_state.crop_type} → crop_code: ${normalizedContext.crop_code}
      crop_stage: ${input.canonical_state.crop_stage} → growth_stage: ${normalizedContext.growth_stage}
      severity: ${input.canonical_state.severity} → ${normalizedContext.severity}`);
    
    return extractor.extractFacts(
      buildObservationFromUnderstanding(input.understanding),
      input.canonical_state,
      input.land_state,
      input.user_query
    );
  }
  
  // Otherwise build facts from understanding with normalization
  const understanding = input.understanding;
  const landState = input.land_state;
  
  // Extract primary symptom from observations
  const symptomObs = understanding?.observations?.find(o => o.category === 'SYMPTOM');
  const primarySymptom = symptomObs?.key || 'UNKNOWN';
  
  // Extract distribution from observations
  const distributionObs = understanding?.observations?.find(o => o.key.includes('PATCHY') || o.key.includes('UNIFORM'));
  const distribution = distributionObs?.key.includes('PATCHY') ? 'PATCHY' : 
                       distributionObs?.key.includes('UNIFORM') ? 'UNIFORM' : 'unknown';
  
  // Extract severity from observations
  const severityObs = understanding?.observations?.find(o => o.category === 'SEVERITY');
  const severity = severityObs?.key.replace('SEVERITY_', '').toLowerCase() || 'unknown';
  
  // NORMALIZATION: Convert enum values to lowercase snake_case for rule matching
  const rawCrop = landState?.crop.current_crop || understanding?.crop?.code || 'UNKNOWN';
  const rawStage = landState?.crop.growth_stage || 'UNKNOWN';
  
  // Normalize for rule matching (lowercase snake_case)
  const normalizedCropCode = normalizeEnumForRuleMatch(rawCrop);
  const normalizedStage = normalizeEnumForRuleMatch(rawStage);
  
  console.log(`   📐 [RuleNormalization] Facts normalization:
      raw_crop: ${rawCrop} → crop_code: ${normalizedCropCode}
      raw_stage: ${rawStage} → growth_stage: ${normalizedStage}`);

  // Build fact object with normalized values for rule matching
  const facts: SymbolicFact = {
    // Core context - NORMALIZED for rule matching
    crop: rawCrop,  // Keep original for display
    crop_code: normalizedCropCode,  // Normalized for rule matching
    dos: landState?.crop.days_since_sowing || 0,
    growth_stage: normalizedStage,  // Normalized for rule matching
    land_area_acres: landState?.area_acres || 0,
    
    // Symptom facts
    primary_symptom: primarySymptom,
    affected_part: understanding?.observations?.find(o => o.category === 'LOCATION')?.key || 'unknown',
    distribution: distribution,
    severity: severity,
    progression: 'unknown',
    
    // Environmental facts
    ndvi: landState?.ndvi.latest_value ?? null,
    ndvi_trend: landState?.ndvi.trend?.toUpperCase() || 'UNKNOWN',
    ndvi_status: calculateNDVIStatus(landState?.ndvi.latest_value),
    temperature: landState?.weather.temperature ?? null,
    humidity: landState?.weather.humidity ?? null,
    recent_rain: (landState?.weather.rainfall_last_24h || 0) > 5,
    soil_moisture_estimated: estimateSoilMoisture(landState?.weather.rainfall_last_24h || 0),
    
    // Soil facts
    soil_n: landState?.soil.nitrogen_kg_per_ha ?? null,
    soil_n_status: getNutrientStatus(landState?.soil.nitrogen_kg_per_ha, 200, 400),
    soil_p: landState?.soil.phosphorus_kg_per_ha ?? null,
    soil_p_status: getNutrientStatus(landState?.soil.phosphorus_kg_per_ha, 10, 25),
    soil_k: landState?.soil.potassium_kg_per_ha ?? null,
    soil_k_status: getNutrientStatus(landState?.soil.potassium_kg_per_ha, 120, 280),
    soil_ph: landState?.soil.ph ?? null,
    
    // Derived facts
    stress_level: calculateStressLevel(landState?.ndvi.latest_value),
    critical_stage: isCriticalStage(landState?.crop.growth_stage),
    data_completeness: calculateDataCompleteness(landState, understanding),
    risk_level: 'MEDIUM',
    
    // User input
    user_query: input.user_query,
    recent_treatments: []
  };
  
  return facts;
}

// Build observation object from understanding
function buildObservationFromUnderstanding(understanding: UnderstandingOutput | null): any {
  if (!understanding) return {};
  
  return {
    symptoms: understanding.observations
      ?.filter(o => o.category === 'SYMPTOM')
      .map(o => o.key) || [],
    affected_part: understanding.observations
      ?.find(o => o.category === 'LOCATION')?.key,
    severity: understanding.observations
      ?.find(o => o.category === 'SEVERITY')?.key?.replace('SEVERITY_', ''),
    timing: understanding.observations
      ?.find(o => o.category === 'TIMING')?.key
  };
}

// Map FiredRule to Recommendation
function mapToRecommendation(rule: any): Recommendation {
  return {
    rule_id: rule.rule_id,
    cause: rule.cause || 'UNKNOWN',
    action_type: rule.actions?.action_type || 'advisory',
    priority: rule.priority || 50,
    confidence: rule.confidence || 0.5,
    response: {
      mr: rule.actions?.action_text || rule.actions?.reason_text || '',
      hi: rule.actions?.action_text || rule.actions?.reason_text || '',
      en: rule.actions?.action_text || rule.actions?.reason_text || ''
    },
    product_details: {
      product_reference: rule.actions?.product_reference,
      phi_days: rule.actions?.phi_days,
      bee_toxicity: rule.actions?.bee_toxicity,
      ipm_level: rule.actions?.ipm_level,
      active_ingredient: rule.actions?.active_ingredient,
      organic_alternative: rule.actions?.organic_alternative
    },
    reasoning: rule.reasoning || ''
  };
}

// UTILITY FUNCTIONS

function calculateNDVIStatus(ndvi: number | null | undefined): string {
  if (ndvi === null || ndvi === undefined) return 'UNKNOWN';
  if (ndvi >= 0.6) return 'HEALTHY';
  if (ndvi >= 0.4) return 'MODERATE';
  if (ndvi >= 0.25) return 'LOW';
  return 'CRITICAL';
}

function estimateSoilMoisture(rainfall: number): string {
  if (rainfall > 20) return 'WET';
  if (rainfall > 5) return 'MOIST';
  return 'DRY';
}

function getNutrientStatus(value: number | null | undefined, low: number, high: number): string {
  if (value === null || value === undefined) return 'UNKNOWN';
  if (value < low) return 'LOW';
  if (value > high) return 'HIGH';
  return 'ADEQUATE';
}

function calculateStressLevel(ndvi: number | null | undefined): string {
  if (ndvi === null || ndvi === undefined) return 'UNKNOWN';
  if (ndvi < 0.3) return 'SEVERE';
  if (ndvi < 0.4) return 'MODERATE';
  if (ndvi < 0.5) return 'MILD';
  return 'NONE';
}

function isCriticalStage(stage: string | null | undefined): boolean {
  const criticalStages = ['GERMINATION', 'FLOWERING', 'GRAIN_FILLING', 'TILLERING'];
  return criticalStages.includes(stage?.toUpperCase() || '');
}

function calculateDataCompleteness(
  landState: AuthoritativeLandState | null, 
  understanding: UnderstandingOutput | null
): number {
  let points = 0;
  let total = 0;
  
  // Check land data
  if (landState?.crop.current_crop) { points++; } total++;
  if (landState?.crop.days_since_sowing) { points++; } total++;
  if (landState?.ndvi.latest_value) { points++; } total++;
  if (landState?.soil.nitrogen_kg_per_ha) { points++; } total++;
  if (landState?.weather.temperature) { points++; } total++;
  
  // Check understanding data
  if (understanding?.crop?.code) { points++; } total++;
  if ((understanding?.observations?.length || 0) > 0) { points++; } total++;
  
  return total > 0 ? (points / total) * 100 : 0;
}

// CONVENIENCE EXPORTS

export {
  type SymbolicFact,
  type InferenceResult
};

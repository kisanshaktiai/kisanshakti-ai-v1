/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADVISORY BUILDER - Build UnifiedAdvisory Output
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Assembles the final UnifiedAdvisory object from all engine outputs.
 * This is the single source of truth for farmer-facing recommendations.
 * 
 * Version: 1.0.0
 */

import {
  DecisionInput,
  Cause,
  PrioritizedAction,
  RiskLevel,
  UnifiedAdvisory,
  ENGINE_VERSION
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// ADVISORY ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate unique advisory ID
 * Format: ADV-{timestamp}-{random}
 */
export function generateAdvisoryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ADV-${timestamp}-${random}`.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// REASONING TRACE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build human-readable reasoning trace
 * Explains why each cause was inferred and action recommended
 */
export function buildReasoningTrace(
  input: DecisionInput,
  causes: Cause[],
  actions: PrioritizedAction[],
  rulesApplied: string[]
): string[] {
  const trace: string[] = [];

  // Add input context
  trace.push(`Analyzed ${input.crop_code} at ${input.crop_stage} stage (${input.days_after_sowing} DAS)`);
  trace.push(`NDVI state: ${input.ndvi_state}, Trend: ${input.ndvi_trend}`);
  trace.push(`Weather: ${input.weather_state}, Soil moisture: ${input.soil_states.moisture}`);
  trace.push(`Farming mode: ${input.farming_mode}`);

  // Add cause inferences
  if (causes.length > 0) {
    trace.push(`--- Inferred Causes ---`);
    for (const cause of causes) {
      const formattedCause = cause.replace(/_/g, ' ').toLowerCase();
      trace.push(`• ${formattedCause}`);
    }
  }

  // Add action recommendations
  if (actions.length > 0) {
    trace.push(`--- Recommended Actions ---`);
    for (const action of actions) {
      const formattedAction = action.action.replace(/_/g, ' ').toLowerCase();
      trace.push(`• ${formattedAction} (priority: ${action.priority}, rule: ${action.rule_id})`);
    }
  }

  // Add rules applied count
  trace.push(`--- Processing ---`);
  trace.push(`${rulesApplied.length} rules evaluated`);

  return trace;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY KEY SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Select appropriate summary i18n key based on risk level and causes
 */
export function selectSummaryKey(
  riskLevel: RiskLevel,
  causes: Cause[],
  actionCount: number
): string {
  // Critical situations
  if (riskLevel === RiskLevel.CRITICAL) {
    if (causes.includes(Cause.CROP_FAILURE_IMMINENT)) {
      return 'advisory.summary.crop_failure_imminent';
    }
    if (causes.includes(Cause.DROUGHT_STRESS)) {
      return 'advisory.summary.drought_critical';
    }
    if (causes.includes(Cause.COMPOUND_STRESS)) {
      return 'advisory.summary.compound_stress';
    }
    return 'advisory.summary.critical_action_required';
  }

  // High risk situations
  if (riskLevel === RiskLevel.HIGH) {
    if (causes.includes(Cause.WATER_STRESS_CRITICAL)) {
      return 'advisory.summary.water_stress_high';
    }
    if (causes.some(c => c.includes('DISEASE'))) {
      return 'advisory.summary.disease_risk_high';
    }
    if (causes.some(c => c.includes('PEST'))) {
      return 'advisory.summary.pest_risk_high';
    }
    return 'advisory.summary.urgent_attention_needed';
  }

  // Medium risk situations
  if (riskLevel === RiskLevel.MEDIUM) {
    if (causes.some(c => c.includes('DEFICIENCY'))) {
      return 'advisory.summary.nutrient_attention';
    }
    if (causes.includes(Cause.WEED_COMPETITION_CRITICAL)) {
      return 'advisory.summary.weed_competition';
    }
    return 'advisory.summary.monitoring_recommended';
  }

  // Low risk / healthy situations
  if (causes.includes(Cause.OPTIMAL_GROWTH)) {
    return 'advisory.summary.optimal_growth';
  }
  if (causes.includes(Cause.YIELD_POTENTIAL_HIGH)) {
    return 'advisory.summary.high_yield_potential';
  }
  if (causes.includes(Cause.HARVEST_READY)) {
    return 'advisory.summary.harvest_ready';
  }

  // Default
  if (actionCount === 0) {
    return 'advisory.summary.no_action_needed';
  }
  return 'advisory.summary.continue_monitoring';
}

// ═══════════════════════════════════════════════════════════════════════════
// SCIENTIFIC SOURCES COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Collect unique scientific sources from actions
 */
export function collectScientificSources(actions: PrioritizedAction[]): string[] {
  const sources = new Set<string>();
  
  for (const action of actions) {
    if (action.scientific_source) {
      sources.add(action.scientific_source);
    }
  }

  return Array.from(sources);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIMARY CONCERN IDENTIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Identify the primary concern to address
 * Based on cause priority and severity
 */
export function identifyPrimaryConcern(
  causes: Cause[],
  actions: PrioritizedAction[]
): Cause | undefined {
  if (causes.length === 0) {
    return undefined;
  }

  // Priority order for primary concern
  const priorityOrder: Cause[] = [
    // Critical causes first
    Cause.CROP_FAILURE_IMMINENT,
    Cause.TOTAL_CROP_LOSS_RISK,
    Cause.DROUGHT_STRESS,
    Cause.COMPOUND_STRESS,
    Cause.WATER_STRESS_CRITICAL,
    Cause.MULTIPLE_STRESSOR_EMERGENCY,
    
    // High priority causes
    Cause.TERMINAL_HEAT_WHEAT,
    Cause.SPIKELET_STERILITY_RICE,
    Cause.FROST_DAMAGE_RISK,
    Cause.BOLLWORM_RISK,
    Cause.RICE_BLAST_RISK,
    
    // Water stress
    Cause.WATER_STRESS_MODERATE,
    Cause.WATER_STRESS_WHEAT_CRI,
    Cause.WATERLOGGING_SEVERE,
    
    // Nutrient issues
    Cause.NITROGEN_DEFICIENCY_CRITICAL,
    Cause.SEVERE_NUTRIENT_DEPLETION,
    Cause.NITROGEN_DEFICIENCY,
    Cause.PHOSPHORUS_DEFICIENCY,
    Cause.POTASSIUM_DEFICIENCY
  ];

  // Find first cause that matches priority order
  for (const priorityCause of priorityOrder) {
    if (causes.includes(priorityCause)) {
      return priorityCause;
    }
  }

  // If no priority cause found, return highest priority action's cause
  if (actions.length > 0) {
    return actions[0].reason;
  }

  // Default to first cause
  return causes[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVISORY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export interface AdvisoryBuilderInput {
  advisory_id: string;
  input: DecisionInput;
  causes: Cause[];
  actions: PrioritizedAction[];
  confidence: number;
  riskLevel: RiskLevel;
  rules_applied: string[];
  conflicts_resolved: string[];
  execution_time_ms?: number;
}

/**
 * Build the final UnifiedAdvisory object
 * 
 * This is the single source of truth output that:
 * - UI renders
 * - AI Chat reads
 * - Voice assistant uses
 * - Audit log stores
 * 
 * @param builderInput - All components for building advisory
 * @returns Complete UnifiedAdvisory object
 */
export function buildAdvisory(builderInput: AdvisoryBuilderInput): UnifiedAdvisory {
  const {
    advisory_id,
    input,
    causes,
    actions,
    confidence,
    riskLevel,
    rules_applied,
    conflicts_resolved
  } = builderInput;

  // Build reasoning trace
  const reasoning_trace = buildReasoningTrace(
    input,
    causes,
    actions,
    rules_applied
  );

  // Select summary key
  const summary_key = selectSummaryKey(riskLevel, causes, actions.length);

  // Collect scientific sources
  const scientific_sources = collectScientificSources(actions);

  // Identify primary concern
  const primary_concern = identifyPrimaryConcern(causes, actions);

  return {
    // Identity
    advisory_id,
    generated_at: new Date().toISOString(),
    engine_version: ENGINE_VERSION,

    // Input snapshot (for audit)
    facts: {
      soil_states: input.soil_states,
      ndvi_state: input.ndvi_state,
      ndvi_trend: input.ndvi_trend,
      weather_state: input.weather_state,
      crop_stage: input.crop_stage,
      crop_code: input.crop_code,
      days_after_sowing: input.days_after_sowing,
      farming_mode: input.farming_mode
    },

    // Inferred causes
    causes,

    // Resolved actions
    actions,

    // Risk assessment
    risk_level: riskLevel,
    confidence,

    // Explainability
    reasoning_trace,
    rules_applied,
    conflicts_resolved,

    // Farmer-facing
    summary_key,
    action_count: actions.length,
    primary_concern,

    // Trust signals
    scientific_sources,

    // Field feedback (pending by default)
    feedback_status: 'pending'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVISORY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate advisory structure
 * Ensures all required fields are present
 */
export function validateAdvisory(advisory: UnifiedAdvisory): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required fields
  if (!advisory.advisory_id) errors.push('Missing advisory_id');
  if (!advisory.generated_at) errors.push('Missing generated_at');
  if (!advisory.engine_version) errors.push('Missing engine_version');
  if (!advisory.facts) errors.push('Missing facts');
  if (!Array.isArray(advisory.causes)) errors.push('Invalid causes');
  if (!Array.isArray(advisory.actions)) errors.push('Invalid actions');
  if (!advisory.risk_level) errors.push('Missing risk_level');
  if (typeof advisory.confidence !== 'number') errors.push('Invalid confidence');
  if (!advisory.summary_key) errors.push('Missing summary_key');

  // Validate actions
  for (let i = 0; i < advisory.actions.length; i++) {
    const action = advisory.actions[i];
    if (!action.action) errors.push(`Action ${i}: Missing action`);
    if (typeof action.priority !== 'number') errors.push(`Action ${i}: Invalid priority`);
    if (!action.rule_id) errors.push(`Action ${i}: Missing rule_id`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  ENGINE_VERSION
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRICULTURE DECISION BRAIN - Main Entry Point
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This is the main orchestrator for the Symbolic Decision Graph Engine.
 * It coordinates all modules to produce the UnifiedAdvisory output.
 * 
 * CRITICAL GUARANTEES:
 * - 100% deterministic - same input ALWAYS produces same output
 * - Zero AI calls - all reasoning is rule-based
 * - Complete audit trail - every decision is traceable
 * - Offline-capable - works without network
 * 
 * Version: 1.0.0
 */

import { 
  DecisionInput, 
  UnifiedAdvisory, 
  CauseRule,
  CropGroup,
  ENGINE_VERSION
} from './types';
import { buildDecisionInput } from './fact-extractor';
import { inferCauses, loadCropGroupRules, registerCropGroupRules, GLOBAL_RULES } from './cause-inference';
import { mapCausesToActions } from './decision-mapper';
import { resolveConflicts } from './conflict-resolver';
import { calculateConfidenceAndRisk } from './confidence-engine';
import { buildAdvisory, generateAdvisoryId, validateAdvisory } from './advisory-builder';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the complete Decision Graph
 * 
 * This is the ONLY function that external systems should call.
 * It produces a UnifiedAdvisory object that is the single source of truth.
 * 
 * EXECUTION FLOW:
 * 1. Load crop-group rules
 * 2. Filter rules for specific crop and stage
 * 3. Infer causes from symbolic facts
 * 4. Map causes to actions
 * 5. Resolve action conflicts
 * 6. Calculate confidence and risk
 * 7. Build unified advisory
 * 8. Validate and return
 * 
 * @param input - DecisionInput with all symbolic facts
 * @returns UnifiedAdvisory - The single source of truth output
 */
export async function runDecisionGraph(input: DecisionInput): Promise<UnifiedAdvisory> {
  const startTime = Date.now();
  const advisory_id = generateAdvisoryId();

  try {
    // Step 1: Load crop-group specific rules
    const cropGroupRules = loadCropGroupRules(input.crop_group);
    
    // Step 2: Combine with global rules
    const allRules = [...cropGroupRules, ...GLOBAL_RULES];

    // Step 3: Infer causes from symbolic facts
    const { causes, rulesApplied, executionTrace } = inferCauses(input, allRules);

    // Step 4: Map causes to actions
    const rawActions = mapCausesToActions(causes, input.farming_mode);

    // Step 5: Resolve conflicts
    const { 
      actions: resolvedActions, 
      conflictsResolved,
      rulesApplied: conflictRules 
    } = resolveConflicts(rawActions, input);

    // Step 6: Calculate confidence and risk
    const { confidence, riskLevel } = calculateConfidenceAndRisk(input, causes);

    // Step 7: Build unified advisory
    const advisory = buildAdvisory({
      advisory_id,
      input,
      causes,
      actions: resolvedActions,
      confidence,
      riskLevel,
      rules_applied: [...rulesApplied, ...conflictRules],
      conflicts_resolved: conflictsResolved,
      execution_time_ms: Date.now() - startTime
    });

    // Step 8: Validate
    const validation = validateAdvisory(advisory);
    if (!validation.valid) {
      console.warn('Advisory validation warnings:', validation.errors);
    }

    return advisory;

  } catch (error) {
    // On error, return a minimal advisory with error info
    console.error('Decision Graph error:', error);
    
    return buildAdvisory({
      advisory_id,
      input,
      causes: [],
      actions: [],
      confidence: 0,
      riskLevel: 'MEDIUM' as any,
      rules_applied: [],
      conflicts_resolved: [],
      execution_time_ms: Date.now() - startTime
    });
  }
}

/**
 * Synchronous version for offline execution
 * Uses only locally cached rules
 */
export function runDecisionGraphSync(input: DecisionInput): UnifiedAdvisory {
  const startTime = Date.now();
  const advisory_id = generateAdvisoryId();

  // Step 1: Load crop-group specific rules (sync - from cache)
  const cropGroupRules = loadCropGroupRules(input.crop_group);
  
  // Step 2: Combine with global rules
  const allRules = [...cropGroupRules, ...GLOBAL_RULES];

  // Step 3: Infer causes
  const { causes, rulesApplied } = inferCauses(input, allRules);

  // Step 4: Map to actions
  const rawActions = mapCausesToActions(causes, input.farming_mode);

  // Step 5: Resolve conflicts
  const { 
    actions: resolvedActions, 
    conflictsResolved,
    rulesApplied: conflictRules 
  } = resolveConflicts(rawActions, input);

  // Step 6: Calculate confidence and risk
  const { confidence, riskLevel } = calculateConfidenceAndRisk(input, causes);

  // Step 7: Build advisory
  return buildAdvisory({
    advisory_id,
    input,
    causes,
    actions: resolvedActions,
    confidence,
    riskLevel,
    rules_applied: [...rulesApplied, ...conflictRules],
    conflicts_resolved: conflictsResolved,
    execution_time_ms: Date.now() - startTime
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the Decision Graph with crop-group rules
 * Call this at app startup to load all rules
 * 
 * @param rules - Map of crop group to rules
 */
export function initializeDecisionGraph(
  rules: Map<CropGroup, CauseRule[]>
): void {
  for (const [group, groupRules] of rules) {
    registerCropGroupRules(group, groupRules);
  }
  console.log(`Decision Graph initialized with ${rules.size} crop groups`);
}

/**
 * Get engine info
 */
export function getEngineInfo(): {
  version: string;
  loadedGroups: CropGroup[];
  globalRulesCount: number;
} {
  return {
    version: ENGINE_VERSION,
    loadedGroups: Object.values(CropGroup),
    globalRulesCount: GLOBAL_RULES.length
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

// Types
export * from './types';

// Fact Extractor
export { 
  buildDecisionInput,
  extractNDVIState,
  extractNDVITrend,
  extractSoilStates,
  extractWeatherState,
  extractCropStage,
  getCropGroup,
  calculateDataConfidence
} from './fact-extractor';

// Cause Inference
export { 
  inferCauses,
  loadCropGroupRules,
  registerCropGroupRules,
  GLOBAL_RULES 
} from './cause-inference';

// Decision Mapper
export { 
  mapCausesToActions,
  isOrganicCompatible,
  getActionDescription,
  ACTION_MAPPINGS 
} from './decision-mapper';

// Conflict Resolver
export { 
  resolveConflicts,
  getFilteredActionExplanation,
  CONFLICT_RULES 
} from './conflict-resolver';

// Confidence Engine
export { 
  calculateOverallConfidence,
  calculateRiskLevel,
  calculateConfidenceAndRisk,
  getRiskDescription 
} from './confidence-engine';

// Advisory Builder
export { 
  buildAdvisory,
  generateAdvisoryId,
  validateAdvisory,
  selectSummaryKey 
} from './advisory-builder';

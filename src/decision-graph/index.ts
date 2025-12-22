/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRICULTURE DECISION BRAIN - Main Orchestrator
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This is the main orchestrator for the Symbolic Decision Graph Engine.
 * It coordinates all modules to produce the UnifiedAdvisory output.
 * 
 * CRITICAL GUARANTEES:
 * - 100% deterministic - same input ALWAYS produces same output
 * - Zero AI calls - all reasoning is rule-based
 * - Complete audit trail - every decision is logged
 * - Offline-capable - works without network
 * - Regional adaptation - adjusts for agro-climatic zones
 * 
 * EXECUTION FLOW:
 * 1. Load crop-group rules from registry
 * 2. Filter rules for specific crop and stage
 * 3. Infer causes from symbolic facts
 * 4. Map causes to actions
 * 5. Apply regional modifiers
 * 6. Resolve conflicts
 * 7. Calculate confidence and risk
 * 8. Build unified advisory
 * 9. Log for audit
 * 
 * Version: 1.0.0
 */

import { 
  DecisionInput, 
  UnifiedAdvisory, 
  CauseRule,
  CropGroup,
  CropStage,
  RiskLevel,
  ENGINE_VERSION
} from './types';
import { buildDecisionInput } from './fact-extractor';
import { 
  inferCauses, 
  loadCropGroupRules, 
  registerCropGroupRules, 
  filterRulesForCrop,
  GLOBAL_RULES 
} from './cause-inference';
import { mapCausesToActions } from './decision-mapper';
import { resolveConflicts } from './conflict-resolver';
import { calculateConfidenceAndRisk } from './confidence-engine';
import { buildAdvisory, generateAdvisoryId, validateAdvisory } from './advisory-builder';
import { applyRegionalModifiers, RegionalModificationResult } from './regional-adapter';
import { logDecision, logDecisionSync, getRecentLogs, getExecutionStats } from './audit-logger';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT - ASYNC VERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the complete Decision Graph (Async)
 * 
 * This is the PRIMARY function that external systems should call.
 * It produces a UnifiedAdvisory object that is the single source of truth.
 * 
 * @param input - DecisionInput with all symbolic facts
 * @returns UnifiedAdvisory - The single source of truth output
 */
export async function runDecisionGraph(input: DecisionInput): Promise<UnifiedAdvisory> {
  const startTime = Date.now();
  const advisory_id = generateAdvisoryId();
  let regionalModifications: string[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Load crop-group specific rules
    // ─────────────────────────────────────────────────────────────────────────
    const cropGroupRules = loadCropGroupRules(input.crop_group);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Filter rules for this specific crop and stage
    // Priority: Specific crop rules > Group-wide rules > Global rules
    // ─────────────────────────────────────────────────────────────────────────
    const filteredGroupRules = filterRulesForCrop(
      cropGroupRules, 
      input.crop_code, 
      input.crop_stage
    );
    const filteredGlobalRules = filterRulesForCrop(
      GLOBAL_RULES,
      input.crop_code,
      input.crop_stage
    );
    const applicableRules = [...filteredGroupRules, ...filteredGlobalRules];

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Infer causes from symbolic facts
    // Execute all matching rules deterministically
    // ─────────────────────────────────────────────────────────────────────────
    const { causes, rulesApplied, executionTrace } = inferCauses(input, applicableRules);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Map causes to actions
    // Respects farming_mode constraints (organic/conventional)
    // ─────────────────────────────────────────────────────────────────────────
    const rawActions = mapCausesToActions(causes, input.farming_mode);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Apply regional modifiers
    // Adjusts priorities based on agro-climatic zone
    // ─────────────────────────────────────────────────────────────────────────
    const regionalResult: RegionalModificationResult = applyRegionalModifiers(
      rawActions, 
      input
    );
    const regionalActions = regionalResult.actions;
    regionalModifications = regionalResult.modifications_applied;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Resolve conflicts
    // Handles weather constraints, mutual exclusions, priority caps
    // ─────────────────────────────────────────────────────────────────────────
    const { 
      actions: resolvedActions, 
      conflictsResolved,
      rulesApplied: conflictRules 
    } = resolveConflicts(regionalActions, input);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Calculate confidence and risk
    // Based on data quality and cause severity
    // ─────────────────────────────────────────────────────────────────────────
    const { confidence, riskLevel } = calculateConfidenceAndRisk(input, causes);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Build unified advisory
    // Single source of truth for all consumers
    // ─────────────────────────────────────────────────────────────────────────
    const executionTimeMs = Date.now() - startTime;
    const advisory = buildAdvisory({
      advisory_id,
      input,
      causes,
      actions: resolvedActions,
      confidence,
      riskLevel,
      rules_applied: [...rulesApplied, ...conflictRules],
      conflicts_resolved: conflictsResolved,
      execution_time_ms: executionTimeMs
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 9: Validate advisory
    // ─────────────────────────────────────────────────────────────────────────
    const validation = validateAdvisory(advisory);
    if (!validation.valid) {
      console.warn('[DecisionGraph] Advisory validation warnings:', validation.errors);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 10: Log for audit (async, non-blocking)
    // Every decision MUST be logged
    // ─────────────────────────────────────────────────────────────────────────
    logDecision(advisory, executionTimeMs, input, regionalModifications).catch(err => {
      console.error('[DecisionGraph] Failed to log decision:', err);
    });

    return advisory;

  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────
    // Error handling: Return minimal advisory with error info
    // Never throw - always return a usable (if limited) advisory
    // ─────────────────────────────────────────────────────────────────────────
    console.error('[DecisionGraph] Execution error:', error);
    
    const errorAdvisory = buildAdvisory({
      advisory_id,
      input,
      causes: [],
      actions: [],
      confidence: 0,
      riskLevel: RiskLevel.MEDIUM,
      rules_applied: [],
      conflicts_resolved: [],
      execution_time_ms: Date.now() - startTime
    });

    // Log the error case too
    logDecision(errorAdvisory, Date.now() - startTime, input, []).catch(() => {});

    return errorAdvisory;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNCHRONOUS VERSION - For Offline Execution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the Decision Graph synchronously
 * 
 * Use this version for:
 * - Offline execution with cached rules
 * - Service workers
 * - Synchronous contexts
 * 
 * @param input - DecisionInput with all symbolic facts
 * @returns UnifiedAdvisory - The single source of truth output
 */
export function runDecisionGraphSync(input: DecisionInput): UnifiedAdvisory {
  const startTime = Date.now();
  const advisory_id = generateAdvisoryId();
  let regionalModifications: string[] = [];

  try {
    // Step 1: Load crop-group specific rules (sync - from cache)
    const cropGroupRules = loadCropGroupRules(input.crop_group);
    
    // Step 2: Filter rules for this specific crop and stage
    const filteredGroupRules = filterRulesForCrop(
      cropGroupRules, 
      input.crop_code, 
      input.crop_stage
    );
    const filteredGlobalRules = filterRulesForCrop(
      GLOBAL_RULES,
      input.crop_code,
      input.crop_stage
    );
    const applicableRules = [...filteredGroupRules, ...filteredGlobalRules];

    // Step 3: Infer causes
    const { causes, rulesApplied } = inferCauses(input, applicableRules);

    // Step 4: Map to actions
    const rawActions = mapCausesToActions(causes, input.farming_mode);

    // Step 5: Apply regional modifiers
    const regionalResult = applyRegionalModifiers(rawActions, input);
    const regionalActions = regionalResult.actions;
    regionalModifications = regionalResult.modifications_applied;

    // Step 6: Resolve conflicts
    const { 
      actions: resolvedActions, 
      conflictsResolved,
      rulesApplied: conflictRules 
    } = resolveConflicts(regionalActions, input);

    // Step 7: Calculate confidence and risk
    const { confidence, riskLevel } = calculateConfidenceAndRisk(input, causes);

    // Step 8: Build advisory
    const executionTimeMs = Date.now() - startTime;
    const advisory = buildAdvisory({
      advisory_id,
      input,
      causes,
      actions: resolvedActions,
      confidence,
      riskLevel,
      rules_applied: [...rulesApplied, ...conflictRules],
      conflicts_resolved: conflictsResolved,
      execution_time_ms: executionTimeMs
    });

    // Step 9: Log synchronously (non-blocking buffer)
    logDecisionSync(advisory, executionTimeMs, input, regionalModifications);

    return advisory;

  } catch (error) {
    console.error('[DecisionGraph] Sync execution error:', error);
    
    const errorAdvisory = buildAdvisory({
      advisory_id,
      input,
      causes: [],
      actions: [],
      confidence: 0,
      riskLevel: RiskLevel.MEDIUM,
      rules_applied: [],
      conflicts_resolved: [],
      execution_time_ms: Date.now() - startTime
    });

    logDecisionSync(errorAdvisory, Date.now() - startTime, input, []);

    return errorAdvisory;
  }
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
  console.log(`[DecisionGraph] Initialized with ${rules.size} crop groups, ${ENGINE_VERSION}`);
}

/**
 * Get engine info and statistics
 */
export function getEngineInfo(): {
  version: string;
  loadedGroups: CropGroup[];
  globalRulesCount: number;
  executionStats: ReturnType<typeof getExecutionStats>;
  recentLogs: number;
} {
  return {
    version: ENGINE_VERSION,
    loadedGroups: Object.values(CropGroup),
    globalRulesCount: GLOBAL_RULES.length,
    executionStats: getExecutionStats(),
    recentLogs: getRecentLogs().length
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
  filterRulesForCrop,
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

// Regional Adapter
export {
  applyRegionalModifiers,
  determineZone,
  getOptimalSprayWindow,
  getZoneSpecificNotes,
  AgroClimaticZone,
  ZONE_CHARACTERISTICS,
  STATE_TO_ZONE
} from './regional-adapter';

// Audit Logger
export {
  logDecision,
  logDecisionSync,
  getRecentLogs,
  getLogByAdvisoryId,
  getLogsForLand,
  getExecutionStats,
  getCauseFrequency,
  getActionFrequency,
  exportLogsAsJson,
  exportLogsAsCsv,
  forceFlush as flushAuditLogs
} from './audit-logger';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-8: CLARIFICATION SCOPE RESOLVER (COMPLETE REWRITE)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Determine what to ask next using ObservationKeys ONLY.
 * No language strings, no text pattern matching, no diagnosis.
 * 
 * PHASE-8.1 UPDATE:
 * - Block crop clarification when CropContextAuthority exists
 * - Support hasCropContext flag to skip IDENTIFY_CROP scope
 * 
 * RULES:
 * - Input: Set<ObservationKey> + turn count + hasCropContext
 * - Output: ClarificationScope (deterministic)
 * - NEVER inspect raw text
 * - NEVER use pest/disease catalogs
 * - Max 3 clarification turns enforced
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  ObservationKey,
  isDimensionSatisfied,
  getNextMissingDimension,
  countSatisfiedDimensions,
  type ObservationKeySet
} from '../decision/observation-ontology.ts';

import { ClarificationScope } from './clarification-renderer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT CANONICAL CONTEXT CONTRACT (SINGLE SOURCE OF TRUTH)
// v6.0: Now uses CanonicalContext directly, not PreservedCanonicalContext
// ═══════════════════════════════════════════════════════════════════════════
import {
  type CanonicalContext,
  hasDiagnosticContext,
  hasTerminalDamage,
  getDetectedTerminalDamage,
  logCanonicalContextAudit,
  TERMINAL_DAMAGE_INDICATORS as CANONICAL_TERMINAL_INDICATORS,
  HIGH_SEVERITY_INDICATORS as CANONICAL_SEVERITY_INDICATORS
} from '../decision/canonical-context-contract.ts';

export const CLARIFICATION_SCOPE_RESOLVER_VERSION = '6.0.0'; // v6: Use CanonicalContext directly

// Re-export ClarificationScope for convenience
export { ClarificationScope };

// Re-export CanonicalContext types for consumers
export type { CanonicalContext };

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION PLAN (OUTPUT)
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationPlan {
  scope: ClarificationScope;
  target_keys: ObservationKey[];
  turn_count: number;
  should_stop: boolean;
  reason: string;
  priority: number;
}

export interface ClarificationState {
  turn_count: number;
  previous_scopes: ClarificationScope[];
  observation_keys_before: string[];
  observation_keys_after: string[];
  /** PHASE-9.1: Lock pending options to detect when farmer is in clarification flow */
  pending_options_count?: number;
  /** PHASE-9.1: Lock crop context during clarification to prevent loss */
  locked_crop_context?: {
    crop_name: string;
    growth_stage: string;
    days_since_sowing: number;
  };
  /** PHASE-12: Track "Not Sure" responses */
  not_sure_count?: number;
  /** PHASE-12: Track consecutive "Not Sure" on same topic */
  consecutive_not_sure?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maximum clarification turns before hard stop
 */
export const MAX_CLARIFICATION_TURNS = 3;

/**
 * Minimum dimensions required before allowing rule engine
 */
export const MIN_DIMENSIONS_FOR_DIAGNOSIS = 2; // crop + affected_part minimum

/**
 * Priority order for clarification scopes (lower = higher priority)
 * 
 * PHASE-11 UPDATE: Insect behavior/plant response BEFORE distribution
 * When farmer reports insect presence, distribution is biologically premature.
 * Correct agronomic sequence: behavior → plant response → distribution (if needed)
 */
const SCOPE_PRIORITY: Record<ClarificationScope, number> = {
  [ClarificationScope.IDENTIFY_CROP]: 1,
  // INTENT_DRIVEN (v3.1) wins over generic clarification when intent classifier
  // has already resolved a high-confidence non-generic intent. It runs after
  // crop identification but before any generic symptom-bucket questions.
  [ClarificationScope.INTENT_DRIVEN]: 1.2,
  // ═══════════════════════════════════════════════════════════════════════════
  // DIAGNOSTIC_CONFIRMATION has high priority after crop + intent-driven
  // ═══════════════════════════════════════════════════════════════════════════
  [ClarificationScope.DIAGNOSTIC_CONFIRMATION]: 1.5,
  [ClarificationScope.IDENTIFY_LOCATION]: 2,
  [ClarificationScope.IDENTIFY_INSECT_BEHAVIOR]: 2.5,
  [ClarificationScope.IDENTIFY_PLANT_RESPONSE]: 2.6,
  [ClarificationScope.IDENTIFY_DISTRIBUTION]: 3,
  [ClarificationScope.IDENTIFY_SEVERITY]: 4,
  [ClarificationScope.IDENTIFY_TIMING]: 5,
  [ClarificationScope.IDENTIFY_INSECT_TYPE]: 5.5,
  [ClarificationScope.REFINE_OBSERVATION]: 6,
  [ClarificationScope.PHOTO_ONLY]: 7,
  [ClarificationScope.STOP_ESCALATE]: 8
};

// ═══════════════════════════════════════════════════════════════════════════
// INTENT-DRIVEN GATING (v3.1)
// ═══════════════════════════════════════════════════════════════════════════
// Intents that are TOO GENERIC to drive a specific DB clarification. For these
// the resolver MUST keep using the legacy observation-key clarification flow.
const INTENT_DRIVEN_BLACKLIST = new Set<string>([
  'GENERAL_CROP_INFO',
  'UNKNOWN_OBSERVATION',
  'UNKNOWN',
  'GREETING',
  'CHITCHAT'
]);

// Minimum classifier confidence required to switch to INTENT_DRIVEN clarification.
const INTENT_DRIVEN_MIN_CONFIDENCE = 0.6;

export interface IntentClarificationContext {
  intent_code?: string | null;
  intent_confidence?: number | null;
}

export function shouldUseIntentDriven(ctx?: IntentClarificationContext | null): boolean {
  if (!ctx?.intent_code) return false;
  const code = String(ctx.intent_code).toUpperCase();
  if (INTENT_DRIVEN_BLACKLIST.has(code)) return false;
  const conf = typeof ctx.intent_confidence === 'number' ? ctx.intent_confidence : 0;
  return conf >= INTENT_DRIVEN_MIN_CONFIDENCE;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RESOLUTION FUNCTION (PHASE-8 CORE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve clarification plan based on ObservationKeys ONLY.
 * This is DETERMINISTIC - same keys + turn count = same output.
 * 
 * PHASE-8.1: Added hasCropContext parameter to skip crop clarification
 * when CropContextAuthority exists from crop_schedules.
 * 
 * PHASE-11 UPDATE: Insect-First Clarification (Agronomically Correct)
 * When INSECT_PRESENT is detected:
 * - FIRST ask about behavior (flying/crawling) and plant response
 * - DEFER distribution questions until damage is confirmed or density is high
 * - This follows real agronomic reasoning: insect visibility ≠ infestation
 * 
 * PRIORITY ORDER:
 * 1. Crop identification (SKIPPED if hasCropContext=true)
 * 2. Affected part (location)
 * 2.5. Insect behavior (if insect present) - PHASE-11
 * 2.6. Plant response (if insect present) - PHASE-11
 * 3. Distribution (DEFERRED if insect-only without damage)
 * 4. Severity
 * 5. Timing
 * 6. Observation refinement
 * 7. Photo only
 * 8. Stop / escalate
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRESERVED CANONICAL CONTEXT (DEPRECATED - USE CanonicalContext)
 * ═══════════════════════════════════════════════════════════════════════════
 * @deprecated Use CanonicalContext from canonical-context-contract.ts instead.
 * This interface is kept ONLY for backward compatibility during migration.
 * All new code should use CanonicalContext directly.
 */
export interface PreservedCanonicalContext {
  crop_code: string;
  crop_name: string;
  growth_stage: string;
  days_since_sowing: number | null;
  ndvi_value: number | null;
  ndvi_trend: string | null;
  is_locked: true;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC CONFIRMATION AUTHORITY (PREEMPTIVE SCOPE)
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC_CONFIRMATION is a PREEMPTIVE AUTHORITY, not an optional strategy.
 * It MUST be selected BEFORE any symptom-coverage or IDENTIFY_LOCATION logic.
 * 
 * When this authority is active:
 * - IDENTIFY_LOCATION is PERMANENTLY BLOCKED
 * - Generic clarification scopes are FORBIDDEN
 * - Only rule-driven diagnostic options are allowed
 * - Photo option is MANDATORY (replaces NONE_OF_THE_ABOVE)
 */
export interface DiagnosticConfirmationAuthority {
  is_active: boolean;
  activated_by: string[]; // Terminal/severity indicators that triggered activation
  blocked_scopes: ClarificationScope[]; // Scopes that are permanently blocked
  clarification_source: 'DECISION_RULES'; // Options must come from rules
}

/**
 * Check if DIAGNOSTIC_CONFIRMATION should be the preemptive authority.
 * This check runs BEFORE any other clarification logic.
 * 
 * v6.0: Simplified to use CanonicalContext directly.
 */
export function checkDiagnosticConfirmationAuthority(
  observedKeys: Set<ObservationKey>,
  hasCropContext: boolean,
  canonicalContext: CanonicalContext | null
): DiagnosticConfirmationAuthority {
  // ═══════════════════════════════════════════════════════════════════════════
  // USE CANONICAL CONTRACT FOR TERMINAL DAMAGE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════
  const observedKeysArray = Array.from(observedKeys);
  const terminalDamageDetected = hasTerminalDamage(observedKeysArray);
  const detectedIndicators = getDetectedTerminalDamage(observedKeysArray);
  
  // DIAGNOSTIC_CONFIRMATION is active if: crop+stage known AND any terminal/severity indicator
  const isActive = hasCropContext && terminalDamageDetected;
  
  if (isActive) {
    // Log using canonical contract format
    logCanonicalContextAudit(
      canonicalContext,
      'DIAGNOSTIC_CONFIRMATION',
      'DECISION_RULES'
    );
    
    console.log(`   🔬 [PREEMPTIVE AUTHORITY] DIAGNOSTIC_CONFIRMATION activated:`);
    console.log(`      Triggered by: ${detectedIndicators.slice(0, 3).join(', ')}${detectedIndicators.length > 3 ? '...' : ''}`);
    console.log(`      IDENTIFY_LOCATION: PERMANENTLY BLOCKED`);
  }
  
  return {
    is_active: isActive,
    activated_by: detectedIndicators,
    blocked_scopes: isActive ? [
      ClarificationScope.IDENTIFY_LOCATION,
      ClarificationScope.IDENTIFY_CROP,
      ClarificationScope.IDENTIFY_DISTRIBUTION,
      ClarificationScope.IDENTIFY_SEVERITY,
      ClarificationScope.IDENTIFY_TIMING
    ] : [],
    clarification_source: 'DECISION_RULES'
  };
}

/**
 * Resolve clarification plan based on ObservationKeys ONLY.
 * This is DETERMINISTIC - same keys + turn count = same output.
 * 
 * v6.0: Simplified signature - uses CanonicalContext directly.
 * The context is IMMUTABLE and was built in orchestrator Phase-1.
 * 
 * PREEMPTIVE AUTHORITY: DIAGNOSTIC_CONFIRMATION is checked FIRST.
 */
export function resolveClarificationPlan(
  observedKeys: Set<ObservationKey>,
  turnCount: number,
  previousScopes: ClarificationScope[] = [],
  hasCropContext: boolean = false,
  canonicalContext: CanonicalContext | null = null,  // v6.0: Single immutable context
  intentContext: IntentClarificationContext | null = null  // v3.1: resolved intent (intent_code + confidence)
): ClarificationPlan {
  // ═══════════════════════════════════════════════════════════════════════════
  // HARD STOP: Maximum clarification turns reached
  // ═══════════════════════════════════════════════════════════════════════════
  if (turnCount >= MAX_CLARIFICATION_TURNS) {
    return {
      scope: ClarificationScope.STOP_ESCALATE,
      target_keys: [],
      turn_count: turnCount,
      should_stop: true,
      reason: `Maximum clarification turns (${MAX_CLARIFICATION_TURNS}) reached`,
      priority: SCOPE_PRIORITY[ClarificationScope.STOP_ESCALATE]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // v6.0: CONTEXT VALIDATION (Simpler - just check if context exists)
  // No fail-fast needed here since context is built once in Phase-1
  // ═══════════════════════════════════════════════════════════════════════════
  const hasContext = canonicalContext !== null && hasDiagnosticContext(canonicalContext);
  
  if (hasContext && canonicalContext) {
    console.log(`   ✅ [INVARIANT] CanonicalContext validated (Phase-1 locked):`);
    console.log(`      Crop=${canonicalContext.crop_code}, Stage=${canonicalContext.growth_stage}`);
    console.log(`      DAS=${canonicalContext.days_since_sowing}, NDVI=${canonicalContext.ndvi.value}`);
    console.log(`      ContextPreserved=true, phase1_locked=true`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PREEMPTIVE AUTHORITY CHECK: DIAGNOSTIC_CONFIRMATION
  // This MUST run BEFORE any other clarification logic
  // ═══════════════════════════════════════════════════════════════════════════
  const diagnosticAuthority = checkDiagnosticConfirmationAuthority(
    observedKeys,
    hasCropContext || hasContext,
    canonicalContext
  );
  
  if (diagnosticAuthority.is_active) {
    console.log(`\n   🔬 [PREEMPTIVE AUTHORITY] DIAGNOSTIC_CONFIRMATION`);
    console.log(`      Scope=DIAGNOSTIC_CONFIRMATION`);
    console.log(`      ClarificationAuthority=DECISION_RULES`);
    console.log(`      ContextPreserved=true`);
    console.log(`      Activated by: ${diagnosticAuthority.activated_by.join(', ')}`);
    console.log(`      Blocked scopes: ${diagnosticAuthority.blocked_scopes.join(', ')}`);
    
    // Log preserved context
    if (canonicalContext) {
      console.log(`      Crop=${canonicalContext.crop_code} (LOCKED)`);
      console.log(`      Stage=${canonicalContext.growth_stage} (LOCKED)`);
      console.log(`      DAS=${canonicalContext.days_since_sowing} (LOCKED)`);
    }
    
    console.log(`   🚫 [INVARIANT] IDENTIFY_LOCATION permanently BLOCKED`);
    console.log(`      Reason: Terminal/whole-plant damage makes location question invalid`);
    console.log(`      All generic clarification scopes: BLOCKED`);
    
    return {
      scope: ClarificationScope.DIAGNOSTIC_CONFIRMATION,
      target_keys: [
        ObservationKey.DEAD_HEART_PRESENT,
        ObservationKey.LARVAE_PRESENT,
        ObservationKey.MUD_TUBES_PRESENT,
        ObservationKey.HONEYDEW_PRESENT,
        ObservationKey.TUNNELS_IN_SOIL,
        ObservationKey.FRASS_VISIBLE,
        ObservationKey.STEM_BORING_MARKS,
        ObservationKey.ROOT_DAMAGE_VISIBLE
      ],
      turn_count: turnCount,
      should_stop: false,
      reason: `PREEMPTIVE AUTHORITY: DIAGNOSTIC_CONFIRMATION activated [${diagnosticAuthority.activated_by.slice(0, 2).join(',')}] - Scope=DIAGNOSTIC_CONFIRMATION, Source=DECISION_RULES, ContextPreserved=true`,
      priority: SCOPE_PRIORITY[ClarificationScope.DIAGNOSTIC_CONFIRMATION]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 1: Crop Unknown
  // PHASE-8.1: SKIP if hasCropContext (CropContextAuthority exists)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!hasCropContext && 
      observedKeys.has(ObservationKey.CROP_UNKNOWN) && 
      !observedKeys.has(ObservationKey.CROP_IDENTIFIED)) {
    return {
      scope: ClarificationScope.IDENTIFY_CROP,
      target_keys: [ObservationKey.CROP_IDENTIFIED],
      turn_count: turnCount,
      should_stop: false,
      reason: 'Crop not identified',
      priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_CROP]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NOTE: DIAGNOSTIC_CONFIRMATION is now handled by checkDiagnosticConfirmationAuthority()
  // which runs BEFORE this function in the resolveClarificationPlan() call.
  // The preemptive authority check ensures DIAGNOSTIC_CONFIRMATION is selected
  // BEFORE any symptom-coverage or generic clarification logic.
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Define terminal damage indicators for use in IDENTIFY_LOCATION blocking
  const TERMINAL_DAMAGE_INDICATORS = [
    ObservationKey.SEEDLING_DIED,
    ObservationKey.AFFECTED_PART_WHOLE,
    ObservationKey.ESTABLISHMENT_FAILURE,
    ObservationKey.PATCHY_DAMAGE,
    ObservationKey.GAPS_IN_FIELD,
    ObservationKey.PLANT_DEATH,
    ObservationKey.CROP_FAILURE,
    ObservationKey.DEAD_SEEDLINGS,
    ObservationKey.PLANT_DRYING,
    ObservationKey.WILTING_SEVERE
  ];
  
  const SEVERITY_HIGH_INDICATORS = [
    ObservationKey.SEVERITY_HIGH,
    ObservationKey.ENTIRE_FIELD_AFFECTED,
    ObservationKey.SEVERITY_CRITICAL,
    ObservationKey.AFFECTED_PERCENTAGE_HIGH
  ];
  
  const hasTerminalDamage = TERMINAL_DAMAGE_INDICATORS.some(k => observedKeys.has(k));
  const hasHighSeverity = SEVERITY_HIGH_INDICATORS.some(k => observedKeys.has(k));
  const hasWholePartAffected = observedKeys.has(ObservationKey.AFFECTED_PART_WHOLE);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 2: Affected Part Unknown
  // ═══════════════════════════════════════════════════════════════════════════
  // P0 INVARIANT 2: IDENTIFY_LOCATION is ILLEGAL if:
  // - hasCropContext=true OR
  // - AFFECTED_PART_WHOLE is set (whole plant damage = skip location question)
  // ═══════════════════════════════════════════════════════════════════════════
  if (observedKeys.has(ObservationKey.AFFECTED_PART_UNKNOWN)) {
    // Check if any specific part is identified
    const hasSpecificPart = [
      ObservationKey.AFFECTED_PART_LEAF,
      ObservationKey.AFFECTED_PART_STEM,
      ObservationKey.AFFECTED_PART_ROOT,
      ObservationKey.AFFECTED_PART_FRUIT,
      ObservationKey.AFFECTED_PART_WHOLE,
      ObservationKey.AFFECTED_PART_FLOWER,
      ObservationKey.AFFECTED_PART_BOLL
    ].some(k => observedKeys.has(k));
    
    if (!hasSpecificPart) {
      // ═══════════════════════════════════════════════════════════════════════════
      // HARD INVARIANT: Block IDENTIFY_LOCATION when context is known
      // Agronomist Rule: If crop/stage are known, NEVER ask generic location questions
      // Instead, use DIAGNOSTIC_CONFIRMATION for cause identification
      // ═══════════════════════════════════════════════════════════════════════════
      if (hasCropContext) {
        console.log(`   🚫 [INVARIANT] IDENTIFY_LOCATION blocked - hasCropContext=true`);
        console.log(`      Scope=REFINE_OBSERVATION or DIAGNOSTIC_CONFIRMATION (context preserved)`);
        
        // If we have ANY damage indicators, use DIAGNOSTIC_CONFIRMATION
        // This catches cases where terminal damage wasn't detected in main check
        if (hasTerminalDamage || hasHighSeverity || hasWholePartAffected) {
          console.log(`   🔬 [REDIRECT] Using DIAGNOSTIC_CONFIRMATION (damage indicators present)`);
          return {
            scope: ClarificationScope.DIAGNOSTIC_CONFIRMATION,
            target_keys: [
              ObservationKey.DEAD_HEART_PRESENT,
              ObservationKey.LARVAE_PRESENT,
              ObservationKey.MUD_TUBES_PRESENT,
              ObservationKey.FRASS_VISIBLE
            ],
            turn_count: turnCount,
            should_stop: false,
            reason: 'BLOCKED: IDENTIFY_LOCATION illegal with hasCropContext=true + damage, using DIAGNOSTIC_CONFIRMATION',
            priority: SCOPE_PRIORITY[ClarificationScope.DIAGNOSTIC_CONFIRMATION]
          };
        }
        
        // For cases without terminal damage, use REFINE_OBSERVATION
        // This still prevents generic "leaf/stem/root" questions
        console.log(`   🔄 [REDIRECT] Using REFINE_OBSERVATION (no terminal damage)`);
        return {
          scope: ClarificationScope.REFINE_OBSERVATION,
          target_keys: [ObservationKey.SYMPTOM_UNKNOWN],
          turn_count: turnCount,
          should_stop: false,
          reason: 'BLOCKED: IDENTIFY_LOCATION illegal with hasCropContext=true, using REFINE_OBSERVATION',
          priority: SCOPE_PRIORITY[ClarificationScope.REFINE_OBSERVATION]
        };
      }
      
      return {
        scope: ClarificationScope.IDENTIFY_LOCATION,
        target_keys: [
          ObservationKey.AFFECTED_PART_LEAF,
          ObservationKey.AFFECTED_PART_STEM,
          ObservationKey.AFFECTED_PART_ROOT,
          ObservationKey.AFFECTED_PART_FRUIT
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Affected plant part not identified',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_LOCATION]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-11: INSECT-FIRST CLARIFICATION (Priority 2.5 & 2.6)
  // ═══════════════════════════════════════════════════════════════════════════
  // When farmer reports insect presence (SMALL_INSECTS_VISIBLE, INSECT_PRESENT),
  // ask about behavior and plant response BEFORE field distribution.
  // 
  // Agronomic Principle:
  // - Insect visibility ≠ infestation
  // - Insect visibility ≠ field-level problem
  // - Field distribution is biologically premature at this stage
  // ═══════════════════════════════════════════════════════════════════════════
  
  const hasInsectPresence = observedKeys.has(ObservationKey.INSECT_PRESENT);
  
  if (hasInsectPresence) {
    // PRIORITY 2.5: Insect Behavior Unknown
    // Ask flying vs crawling FIRST - this is agronomically valid
    const hasInsectBehavior = [
      ObservationKey.INSECT_BEHAVIOR_FLYING,
      ObservationKey.INSECT_BEHAVIOR_CRAWLING,
      ObservationKey.INSECT_BEHAVIOR_UNKNOWN
    ].some(k => observedKeys.has(k));
    
    if (!hasInsectBehavior && turnCount < 2) {
      return {
        scope: ClarificationScope.IDENTIFY_INSECT_BEHAVIOR,
        target_keys: [
          ObservationKey.INSECT_BEHAVIOR_FLYING,
          ObservationKey.INSECT_BEHAVIOR_CRAWLING
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Insect behavior not identified - first-order clarification for insect presence',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_INSECT_BEHAVIOR]
      };
    }
    
    // PRIORITY 2.6: Plant Response Unknown
    // After behavior, ask about visible plant damage indicators
    const hasPlantResponse = [
      ObservationKey.PLANT_RESPONSE_CURLING,
      ObservationKey.PLANT_RESPONSE_YELLOWING,
      ObservationKey.PLANT_RESPONSE_STICKY,
      ObservationKey.PLANT_RESPONSE_HOLES,
      ObservationKey.PLANT_RESPONSE_NONE,
      ObservationKey.PLANT_RESPONSE_UNKNOWN,
      // Also check cross-mapped symptoms that indicate plant response
      ObservationKey.SYMPTOM_CURLING,
      ObservationKey.SYMPTOM_YELLOWING,
      ObservationKey.SYMPTOM_STICKY,
      ObservationKey.SYMPTOM_HOLES
    ].some(k => observedKeys.has(k));
    
    if (!hasPlantResponse && turnCount < 2) {
      return {
        scope: ClarificationScope.IDENTIFY_PLANT_RESPONSE,
        target_keys: [
          ObservationKey.PLANT_RESPONSE_CURLING,
          ObservationKey.PLANT_RESPONSE_YELLOWING,
          ObservationKey.PLANT_RESPONSE_STICKY,
          ObservationKey.PLANT_RESPONSE_HOLES,
          ObservationKey.PLANT_RESPONSE_NONE
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Plant response to insects not identified - agronomically valid before distribution',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_PLANT_RESPONSE]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 3: Distribution Unknown
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-11: Distribution is DEFERRED for insect-only observations.
  // Only ask about field distribution if:
  // - Plant damage is confirmed (curling, yellowing, holes, etc.)
  // - OR high insect density is confirmed
  // - OR insect behavior/response has been answered
  // ═══════════════════════════════════════════════════════════════════════════
  if (observedKeys.has(ObservationKey.DISTRIBUTION_UNKNOWN)) {
    const hasDistribution = [
      ObservationKey.DISTRIBUTION_UNIFORM,
      ObservationKey.DISTRIBUTION_PATCHY,
      ObservationKey.DISTRIBUTION_EDGE,
      ObservationKey.DISTRIBUTION_CENTER,
      ObservationKey.DISTRIBUTION_SPREADING
    ].some(k => observedKeys.has(k));
    
    // Check if distribution question should be deferred (insect-only without damage)
    const hasPlantDamageConfirmed = [
      ObservationKey.PLANT_RESPONSE_CURLING,
      ObservationKey.PLANT_RESPONSE_YELLOWING,
      ObservationKey.PLANT_RESPONSE_STICKY,
      ObservationKey.PLANT_RESPONSE_HOLES,
      ObservationKey.SYMPTOM_CURLING,
      ObservationKey.SYMPTOM_YELLOWING,
      ObservationKey.SYMPTOM_STICKY,
      ObservationKey.SYMPTOM_HOLES,
      ObservationKey.SYMPTOM_SPOTS,
      ObservationKey.SYMPTOM_BROWNING,
      ObservationKey.SYMPTOM_DRYING
    ].some(k => observedKeys.has(k));
    
    const hasHighInsectDensity = observedKeys.has(ObservationKey.INSECT_DENSITY_MANY);
    
    const hasInsectBehaviorAnswered = [
      ObservationKey.INSECT_BEHAVIOR_FLYING,
      ObservationKey.INSECT_BEHAVIOR_CRAWLING,
      ObservationKey.INSECT_BEHAVIOR_UNKNOWN
    ].some(k => observedKeys.has(k));
    
    const hasPlantResponseAnswered = [
      ObservationKey.PLANT_RESPONSE_CURLING,
      ObservationKey.PLANT_RESPONSE_YELLOWING,
      ObservationKey.PLANT_RESPONSE_STICKY,
      ObservationKey.PLANT_RESPONSE_HOLES,
      ObservationKey.PLANT_RESPONSE_NONE,
      ObservationKey.PLANT_RESPONSE_UNKNOWN
    ].some(k => observedKeys.has(k));
    
    // Allow distribution question only if:
    // - No insect presence (non-insect problem) OR
    // - Plant damage is confirmed OR
    // - High density confirmed OR
    // - Both behavior and response have been answered
    const canAskDistribution = 
      !hasInsectPresence || 
      hasPlantDamageConfirmed || 
      hasHighInsectDensity ||
      (hasInsectBehaviorAnswered && hasPlantResponseAnswered);
    
    if (!hasDistribution && turnCount < 2 && canAskDistribution) {
      return {
        scope: ClarificationScope.IDENTIFY_DISTRIBUTION,
        target_keys: [
          ObservationKey.DISTRIBUTION_UNIFORM,
          ObservationKey.DISTRIBUTION_PATCHY,
          ObservationKey.DISTRIBUTION_EDGE,
          ObservationKey.DISTRIBUTION_CENTER
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: hasInsectPresence 
          ? 'Plant damage confirmed - now asking about field distribution' 
          : 'Symptom distribution not identified',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_DISTRIBUTION]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 4: Severity Unknown (only if turn count allows)
  // ═══════════════════════════════════════════════════════════════════════════
  if (observedKeys.has(ObservationKey.SEVERITY_UNKNOWN) && turnCount < 2) {
    const hasSeverity = [
      ObservationKey.SEVERITY_LOW,
      ObservationKey.SEVERITY_MEDIUM,
      ObservationKey.SEVERITY_HIGH
    ].some(k => observedKeys.has(k));
    
    if (!hasSeverity) {
      return {
        scope: ClarificationScope.IDENTIFY_SEVERITY,
        target_keys: [
          ObservationKey.SEVERITY_LOW,
          ObservationKey.SEVERITY_MEDIUM,
          ObservationKey.SEVERITY_HIGH
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Severity level not identified',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_SEVERITY]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 5: Timing Unknown (only if critical fields covered)
  // ═══════════════════════════════════════════════════════════════════════════
  if (observedKeys.has(ObservationKey.TIMING_UNKNOWN) && 
      turnCount < 2 &&
      observedKeys.has(ObservationKey.CROP_IDENTIFIED)) {
    const hasTiming = [
      ObservationKey.TIMING_RECENT,
      ObservationKey.TIMING_WEEK,
      ObservationKey.TIMING_LONG
    ].some(k => observedKeys.has(k));
    
    if (!hasTiming) {
      return {
        scope: ClarificationScope.IDENTIFY_TIMING,
        target_keys: [
          ObservationKey.TIMING_RECENT,
          ObservationKey.TIMING_WEEK,
          ObservationKey.TIMING_LONG
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Problem timing not identified',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_TIMING]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 6: Observation Refinement (no specific phenomena detected)
  // ═══════════════════════════════════════════════════════════════════════════
  const hasPhenomena = [
    ObservationKey.INSECT_PRESENT,
    ObservationKey.SYMPTOM_COLOR_CHANGE,
    ObservationKey.SYMPTOM_YELLOWING,
    ObservationKey.SYMPTOM_BROWNING,
    ObservationKey.SYMPTOM_DRYING,
    ObservationKey.SYMPTOM_SPOTS,
    ObservationKey.SYMPTOM_HOLES,
    ObservationKey.SYMPTOM_WILTING,
    ObservationKey.SYMPTOM_CURLING,
    ObservationKey.SYMPTOM_STUNTING,
    ObservationKey.SYMPTOM_ROTTING
  ].some(k => observedKeys.has(k));
  
  if (!hasPhenomena && turnCount < MAX_CLARIFICATION_TURNS) {
    return {
      scope: ClarificationScope.REFINE_OBSERVATION,
      target_keys: [
        ObservationKey.SYMPTOM_COLOR_CHANGE,
        ObservationKey.SYMPTOM_HOLES,
        ObservationKey.SYMPTOM_DRYING,
        ObservationKey.INSECT_PRESENT
      ],
      turn_count: turnCount,
      should_stop: false,
      reason: 'No specific symptoms detected',
      priority: SCOPE_PRIORITY[ClarificationScope.REFINE_OBSERVATION]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 7: Photo Only (if still insufficient after refinement)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!observedKeys.has(ObservationKey.PHOTO_PROVIDED) && 
      turnCount === MAX_CLARIFICATION_TURNS - 1) {
    return {
      scope: ClarificationScope.PHOTO_ONLY,
      target_keys: [ObservationKey.PHOTO_PROVIDED],
      turn_count: turnCount,
      should_stop: false,
      reason: 'Requesting photo for visual diagnosis',
      priority: SCOPE_PRIORITY[ClarificationScope.PHOTO_ONLY]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEFAULT: Stop and let rule engine handle with available info
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    scope: ClarificationScope.STOP_ESCALATE,
    target_keys: [],
    turn_count: turnCount,
    should_stop: true,
    reason: 'Sufficient information available or max turns reached',
    priority: SCOPE_PRIORITY[ClarificationScope.STOP_ESCALATE]
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if clarification is needed based on observation keys.
 */
export function needsClarification(observedKeys: Set<ObservationKey>): boolean {
  // Must have crop identified
  if (!observedKeys.has(ObservationKey.CROP_IDENTIFIED) && 
      observedKeys.has(ObservationKey.CROP_UNKNOWN)) {
    return true;
  }
  
  // Must have affected part
  const hasAffectedPart = [
    ObservationKey.AFFECTED_PART_LEAF,
    ObservationKey.AFFECTED_PART_STEM,
    ObservationKey.AFFECTED_PART_ROOT,
    ObservationKey.AFFECTED_PART_FRUIT,
    ObservationKey.AFFECTED_PART_WHOLE
  ].some(k => observedKeys.has(k));
  
  if (!hasAffectedPart && observedKeys.has(ObservationKey.AFFECTED_PART_UNKNOWN)) {
    return true;
  }
  
  // Count satisfied dimensions
  const satisfiedCount = countSatisfiedDimensions(observedKeys);
  
  return satisfiedCount < MIN_DIMENSIONS_FOR_DIAGNOSIS;
}

/**
 * Check if sufficient information is available to proceed to diagnosis.
 */
export function hasSufficientInformation(observedKeys: Set<ObservationKey>): boolean {
  // Must have crop
  if (!observedKeys.has(ObservationKey.CROP_IDENTIFIED)) {
    return false;
  }
  
  // Must have at least one specific affected part OR symptom phenomenon
  const hasAffectedPart = [
    ObservationKey.AFFECTED_PART_LEAF,
    ObservationKey.AFFECTED_PART_STEM,
    ObservationKey.AFFECTED_PART_ROOT,
    ObservationKey.AFFECTED_PART_FRUIT,
    ObservationKey.AFFECTED_PART_WHOLE,
    ObservationKey.AFFECTED_PART_BOLL
  ].some(k => observedKeys.has(k));
  
  const hasPhenomena = [
    ObservationKey.INSECT_PRESENT,
    ObservationKey.SYMPTOM_COLOR_CHANGE,
    ObservationKey.SYMPTOM_YELLOWING,
    ObservationKey.SYMPTOM_BROWNING,
    ObservationKey.SYMPTOM_DRYING,
    ObservationKey.SYMPTOM_SPOTS,
    ObservationKey.SYMPTOM_HOLES,
    ObservationKey.SYMPTOM_WILTING,
    ObservationKey.SYMPTOM_CURLING
  ].some(k => observedKeys.has(k));
  
  return hasAffectedPart || hasPhenomena;
}

/**
 * Initialize a new clarification state for a session.
 */
export function initializeClarificationState(): ClarificationState {
  return {
    turn_count: 0,
    previous_scopes: [],
    observation_keys_before: [],
    observation_keys_after: []
  };
}

/**
 * Update clarification state after a clarification turn.
 */
export function updateClarificationState(
  state: ClarificationState,
  scope: ClarificationScope,
  keysBefore: Set<ObservationKey>,
  keysAfter: Set<ObservationKey>
): ClarificationState {
  return {
    turn_count: state.turn_count + 1,
    previous_scopes: [...state.previous_scopes, scope],
    observation_keys_before: Array.from(keysBefore),
    observation_keys_after: Array.from(keysAfter)
  };
}

/**
 * PHASE-12: Handle "Not Sure" responses with limits
 * 
 * Limit Definition:
 * - Maximum 2 consecutive "Not sure" responses on the same clarification topic
 * - Maximum 3 total "Not sure" responses across the entire diagnostic session
 * 
 * After Limit Reached, redirect to:
 * - Image upload request
 * - Guided field observation
 * - Expert escalation
 * - General guidance mode
 */
export function handleNotSureResponse(
  state: ClarificationState,
  currentScope: ClarificationScope
): {
  shouldContinue: boolean;
  redirectAction: 'CONTINUE' | 'PHOTO_REQUEST' | 'EXPERT_ESCALATION' | 'GENERAL_GUIDANCE';
  updatedState: ClarificationState;
  message?: {
    mr: string;
    hi: string;
    en: string;
  };
} {
  const MAX_CONSECUTIVE_NOT_SURE = 2;
  const MAX_TOTAL_NOT_SURE = 3;
  
  // Update counts
  const newTotalNotSure = (state.not_sure_count || 0) + 1;
  const lastScope = state.previous_scopes[state.previous_scopes.length - 1];
  const isConsecutiveSameTopic = lastScope === currentScope;
  const newConsecutiveNotSure = isConsecutiveSameTopic 
    ? (state.consecutive_not_sure || 0) + 1 
    : 1;
  
  const updatedState: ClarificationState = {
    ...state,
    not_sure_count: newTotalNotSure,
    consecutive_not_sure: newConsecutiveNotSure
  };
  
  // Check limits
  if (newConsecutiveNotSure >= MAX_CONSECUTIVE_NOT_SURE) {
    return {
      shouldContinue: false,
      redirectAction: 'PHOTO_REQUEST',
      updatedState,
      message: {
        mr: 'तुम्ही पिकाचा फोटो पाठवू शकता का? किंवा सामान्य काळजी उपाय पहायचे आहेत?',
        hi: 'क्या आप फसल की फोटो भेज सकते हैं? या सामान्य देखभाल उपाय देखना चाहते हैं?',
        en: 'Can you send a photo of the crop? Or would you like to see general care measures?'
      }
    };
  }
  
  if (newTotalNotSure >= MAX_TOTAL_NOT_SURE) {
    return {
      shouldContinue: false,
      redirectAction: 'GENERAL_GUIDANCE',
      updatedState,
      message: {
        mr: `तुमच्या उपलब्ध माहितीच्या आधारे मी सामान्य सल्ला देऊ शकतो.\n\nकृपया लक्षात ठेवा: ही विशिष्ट उपचार योजना नाही. नेमके निदान करण्यासाठी फोटो पाठवा किंवा तज्ञाशी संपर्क साधा.`,
        hi: `उपलब्ध जानकारी के आधार पर मैं सामान्य सलाह दे सकता हूं.\n\nकृपया ध्यान दें: यह विशिष्ट उपचार योजना नहीं है। सटीक निदान के लिए फोटो भेजें या विशेषज्ञ से संपर्क करें।`,
        en: `Based on available information, I can provide general advice.\n\nPlease note: This is not a specific treatment plan. For accurate diagnosis, send a photo or contact an expert.`
      }
    };
  }
  
  // Can continue with next question
  return {
    shouldContinue: true,
    redirectAction: 'CONTINUE',
    updatedState
  };
}

/**
 * PHASE-12: Detect if a farmer response is a "Not Sure" answer
 */
export function isNotSureResponse(text: string): boolean {
  const notSurePatterns = [
    // Marathi
    'माहित नाही', 'कळत नाही', 'समजत नाही', 'नक्की नाही', 'कल्पना नाही',
    // Hindi  
    'पता नहीं', 'नहीं पता', 'मालूम नहीं', 'समझ नहीं', 'निश्चित नहीं',
    // English
    'not sure', 'don\'t know', 'do not know', 'unsure', 'can\'t say', 'cannot say', 'no idea'
  ];
  
  const lowerText = text.toLowerCase();
  return notSurePatterns.some(pattern => lowerText.includes(pattern.toLowerCase()));
}

export default {
  ClarificationScope,
  resolveClarificationPlan,
  needsClarification,
  hasSufficientInformation,
  initializeClarificationState,
  updateClarificationState,
  handleNotSureResponse,
  isNotSureResponse,
  MAX_CLARIFICATION_TURNS,
  MIN_DIMENSIONS_FOR_DIAGNOSIS,
  CLARIFICATION_SCOPE_RESOLVER_VERSION
};

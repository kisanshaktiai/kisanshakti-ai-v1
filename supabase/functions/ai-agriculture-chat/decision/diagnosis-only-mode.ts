/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSIS-ONLY MODE (v3.0.0) - RULE-GRANTED AUTHORITY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SENIOR AGRONOMIST PRINCIPLE:
 * "When crops die, we diagnose causes — we do not ask permission from NLU."
 * 
 * ARCHITECTURAL CHANGE (v3.0):
 * Authority is now derived SOLELY from ObservationKeys + crop + stage.
 * NLU is treated as an OBSERVATION EXTRACTOR only — it NEVER decides if
 * a "problem exists" or gates diagnosis eligibility.
 * 
 * HARD INVARIANT:
 * If any terminal damage ObservationKey is present (SEEDLING_DIED, PLANT_DIED,
 * AFFECTED_PART_WHOLE, or PATCHY_DAMAGE + SEVERITY_HIGH), then:
 * 
 * - Diagnosis authority is AUTOMATICALLY granted to CROP domain
 * - NLU fields (hasPestOrDisease, intent, confidence) are IGNORED
 * - authority = NONE is IMPOSSIBLE when terminal damage exists
 * - Diagnosis-Only Mode activates BEFORE authority resolution
 * - Clarification is PERMANENTLY SKIPPED
 * 
 * ACTIVATION SEQUENCE (runs BEFORE authority-resolver.ts):
 * 1. Detect terminal damage from ObservationKeys (not NLU)
 * 2. If detected → FORCE CROP authority (even with limited context)
 * 3. SKIP clarification entirely
 * 4. Run hypothesis-first rule evaluation immediately
 * 5. Present diagnosis directly from decision_rules
 * 
 * NLU GATING PERMANENTLY DISABLED FOR:
 * - hasProblem checks
 * - hasPestOrDisease checks
 * - intent classification
 * - confidence thresholds
 * 
 * LOGS MUST SHOW:
 * Mode=DIAGNOSIS_ONLY
 * Authority=CROP
 * Trigger=TERMINAL_DAMAGE_OBSERVATION
 * NLU_ROLE=OBSERVATION_ONLY
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { CanonicalContext } from './canonical-context-contract.ts';
import { 
  TERMINAL_DAMAGE_INDICATORS, 
  HIGH_SEVERITY_INDICATORS,
  hasTerminalDamage,
  getDetectedTerminalDamage 
} from './canonical-context-contract.ts';

import {
  DecisionAuthority,
  AuthorityStatus,
  ResponseMode,
  type AuthorityDecision
} from './authority-types.ts';

import {
  AuthoredObservationSet,
  ObservationAuthority,
  TERMINAL_CODES_BLOCKED_FROM_INJECTION
} from '../utils/observation-authority.ts';

export const DIAGNOSIS_ONLY_MODE_VERSION = '4.0.0'; // v4: Crop damage triggers diagnosis mode

// ═══════════════════════════════════════════════════════════════════════════
// EXTENDED TERMINAL/CROP DAMAGE DETECTION (v4.0 - Crop Damage = Diagnosis Mode)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extended terminal damage indicators - any of these FORCE CROP authority.
 * These are ObservationKeys that represent terminal/severe plant damage.
 */
export const TERMINAL_DAMAGE_OBSERVATION_KEYS = new Set([
  // Direct terminal damage
  'SEEDLING_DIED',
  'PLANT_DIED',
  'PLANT_DEATH',      // Canonical key from fact-extractor
  'SEEDLING_DEATH',   // CrossCropSymptomKey v4.1
  'DEAD_SEEDLINGS',
  'CROP_FAILURE',
  'ESTABLISHMENT_FAILURE',
  // NOTE: GERMINATION_FAILURE intentionally REMOVED from terminal set.
  //       It is a diagnostic ENTRY observation (start of diagnosis),
  //       not a terminal verdict. See DIAGNOSTIC_ENTRY_OBSERVATION_KEYS below.

  // Whole-plant/severe damage
  'AFFECTED_PART_WHOLE',
  'ENTIRE_PLANT_AFFECTED',
  'WILTING_SEVERE',
  'PLANT_DRYING',
  'COMPLETE_DRYING',

  // Terminal patterns
  'PATCHY_DAMAGE',
  'GAPS_IN_FIELD',
  'DEAD_PATCHES',

  // Borer terminal symptoms
  'DEAD_HEART',
  'DEAD_HEART_VISIBLE',
  'STEM_BORED',
  'STEM_TUNNELING',

  // Root/base terminal damage
  'ROOT_DAMAGE',
  'ROOT_DECAY',
  'BASE_ROT',
  'COLLAR_ROT',
  'TERMITE_DAMAGE',
  'MUD_TUBES_VISIBLE'
]);

/**
 * DIAGNOSTIC ENTRY OBSERVATIONS — these are the START of diagnosis,
 * not terminal verdicts. The farmer reports "crop hasn't emerged" and
 * the symbolic brain must compete causes (seed rot, waterlogging,
 * soil crust, deep sowing, termite, bird damage, poor seed viability).
 * MUST NOT be treated as a final terminal-damage diagnosis.
 */
export const DIAGNOSTIC_ENTRY_OBSERVATION_KEYS = new Set([
  'GERMINATION_FAILURE',
  'NO_EMERGENCE',
  'OBS_RICE_NO_EMERGENCE',
  'DELAYED_GERMINATION',
  'POOR_GERMINATION',
  'POOR_GERMINATION_PERCENT',
  'UNEVEN_EMERGENCE',
  'OBS_RICE_PATCHY_EMERGENCE',
  'GERMINATION_CONCERN',
  'SEED_NOT_GERMINATED'
]);

/**
 * Helper: returns true if the observation code is a diagnostic-entry
 * observation that must trigger the symbolic brain (not terminal lane).
 */
export function isDiagnosticEntryObservation(code: string | undefined | null): boolean {
  if (!code) return false;
  return DIAGNOSTIC_ENTRY_OBSERVATION_KEYS.has(String(code).toUpperCase());
}


/**
 * v4.0: CROP DAMAGE OBSERVATION KEYS - Sufficient grounds for DIAGNOSIS mode.
 * These are NON-TERMINAL but still require diagnostic investigation.
 * Diagnosis is activated when these are present, even without pest/disease codes.
 */
export const CROP_DAMAGE_OBSERVATION_KEYS = new Set([
  // Growth/vigor issues
  'PATCHY_GROWTH',
  'OVERALL_WEAK',       // ← CRITICAL FIX: Cross-crop symptom for plant weakness/death
  'STUNTED_GROWTH',
  'POOR_GERMINATION',
  'UNEVEN_EMERGENCE',
  'REDUCED_TILLERS',
  'LOW_VIGOR',
  // v4.1.0: Added cross-crop symptom keys
  'AFFECTED_PATCHES',   // Cross-crop symptom for patchy damage
  'PLANT_DEATH',        // Cross-crop symptom for plant death
  'SEEDLING_DEATH',     // Cross-crop symptom for seedling death
  
  // Affected patches
  'AFFECTED_PATCHES',
  'SCATTERED_DAMAGE',
  'RANDOM_PATCHES',
  'EDGE_DAMAGE',
  'CENTER_DAMAGE',
  
  // Color/visual changes
  'GENERAL_YELLOWING',
  'LEAF_YELLOWING',
  'INTERVEINAL_YELLOWING',
  'LEAF_TIP_BURN',
  'LEAF_EDGE_BURN',
  'PALE_LEAVES',
  'PURPLE_COLORATION',
  
  // Structural damage
  'WILTING',
  'DROOPING',
  'CURLED_LEAVES',
  'ROLLED_LEAVES',
  'LEAF_HOLES',
  'HOLES_IN_LEAVES',
  'CHEWED_LEAVES',
  
  // Spots and lesions
  'SPOTS_IRREGULAR',
  'SPOTS_CIRCULAR',
  'BROWN_SPOTS',
  'WHITE_PATCHES',
  'BLACK_SPOTS',
  'LESIONS',
  
  // Stem/stalk issues
  'STEM_DISCOLORATION',
  'LODGING',
  'STEM_WEAKNESS',
  
  // Root zone indicators (visible at surface)
  'PLANT_FALLING_OVER',
  'EASY_TO_PULL',
  
  // Insect evidence (triggers diagnosis without pest_code)
  'SMALL_INSECTS_VISIBLE',
  'FLYING_INSECTS_VISIBLE',
  'CRAWLING_INSECTS_VISIBLE',
  'JUMPING_INSECTS_VISIBLE',
  'WEBBING_VISIBLE',
  'HONEYDEW',
  'SOOTY_MOLD',
  'FRASS_VISIBLE',
  'EGG_MASSES',
  
  // Disease evidence (triggers diagnosis without disease_code)
  'POWDERY_COATING',
  'FUZZY_GROWTH',
  'WATER_SOAKED_LESIONS',
  'RUST_PUSTULES'
]);

/**
 * Severity modifiers that combine with damage observations to trigger diagnostic mode.
 */
export const SEVERITY_ESCALATORS = new Set([
  'SEVERITY_HIGH',
  'SEVERITY_CRITICAL',
  'SEVERITY_MEDIUM',
  'ENTIRE_FIELD_AFFECTED',
  'AFFECTED_PERCENTAGE_HIGH',
  'WIDESPREAD_DAMAGE',
  'RAPID_SPREAD',
  'INCREASING',
  'GETTING_WORSE'
]);

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosisResult {
  cause: string;
  cause_name_mr: string;
  cause_name_hi: string;
  cause_name_en: string;
  confidence: number;
  canonical_group: string;
  rule_id: string;
  evidence_points: string[];
  action_type: 'TREAT' | 'WAIT' | 'MONITOR' | 'ESCALATE';
  action_guidance_mr: string;
  action_guidance_hi: string;
  action_guidance_en: string;
  treatment_summary?: {
    product_name?: string;
    dosage?: string;
    timing?: string;
  };
}

export interface DiagnosisOnlyOutput {
  mode: 'DIAGNOSIS_ONLY';
  clarification_status: 'SKIPPED';
  source: 'DECISION_RULES';
  context_status: 'LOCKED';
  
  // v2.0: Authority enforcement
  authority: 'CROP';
  authority_source: 'TERMINAL_DAMAGE_OBSERVATION';
  nlu_gating: 'DISABLED';
  
  // Top diagnoses (ranked by confidence)
  diagnoses: DiagnosisResult[];
  
  // Confidence summary
  top_confidence: number;
  confidence_sufficient_for_treatment: boolean;
  treatment_threshold: number;
  
  // Optional photo prompt (confirmation, not question)
  photo_confirmation: {
    available: boolean;
    prompt_mr: string;
    prompt_hi: string;
    prompt_en: string;
  };
  
  // Context preserved
  crop_code: string;
  growth_stage: string;
  terminal_damage_detected: string[];
  
  // Audit trail
  trace_id: string;
  timestamp: number;
}

export interface DiagnosisOnlyInput {
  canonicalContext: CanonicalContext;
  observations: Set<string> | string[];
  matched_rules: MatchedRule[];
  language: string;
  trace_id?: string;
}

export interface MatchedRule {
  rule_id: string;
  cause: string;
  canonical_group: string;
  confidence: number;
  priority: number;
  response_mr?: string;
  response_hi?: string;
  response_en?: string;
  actions?: any[];
  evidence_matched?: string[];
}

/**
 * Terminal Damage Detection Result - v2.0
 * Includes authority enforcement data for upstream use.
 */
export interface TerminalDamageDetectionResult {
  detected: boolean;
  terminal_damage: string[];
  severity_escalators: string[];
  
  // v2.0: Authority enforcement
  enforced_authority: DecisionAuthority.CROP | null;
  nlu_gating_disabled: boolean;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// v4.0: CROP DAMAGE DETECTION RESULT
// Extended to support non-terminal crop damage that requires diagnosis
// ═══════════════════════════════════════════════════════════════════════════

export interface CropDamageDetectionResult {
  detected: boolean;
  damage_type: 'TERMINAL' | 'SIGNIFICANT' | 'MINOR' | 'NONE';
  damage_observations: string[];
  severity_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  severity_indicators: string[];
  requires_diagnosis: boolean;
  diagnosis_mode: 'DIAGNOSIS_ONLY' | 'DIAGNOSIS_WITH_CLARIFICATION' | 'STANDARD';
  enforced_authority: DecisionAuthority.CROP | null;
  nlu_gating_disabled: boolean;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// v4.0: CROP DAMAGE DETECTION (EXPANDED - Runs BEFORE authority resolution)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect crop damage from observations.
 * This runs BEFORE authority resolution to enforce CROP authority.
 * 
 * v4.0 CHANGE: Crop damage observations (not just terminal damage) are now
 * sufficient to trigger DIAGNOSIS mode. Pest/disease codes are NOT required.
 * 
 * HARD AGRONOMIC INVARIANT:
 * If canonical ObservationKeys OR CrossCropSymptoms indicate crop damage
 * (e.g., PATCHY_GROWTH, AFFECTED_PATCHES, OVERALL_WEAK, SEEDLING_DIED)
 * with severity ≥ MEDIUM, the system MUST activate the DIAGNOSIS category.
 * 
 * NLU GATING IS COMPLETELY BYPASSED for:
 * - hasPestOrDisease checks
 * - intent classification
 * - confidence thresholds
 * 
 * Authority is derived from OBSERVATIONS, not NLU.
 */
export function detectCropDamageForDiagnosis(
  observations: Set<string> | string[],
  crossCropSymptoms?: string[]
): CropDamageDetectionResult {
  const obsSet = observations instanceof Set ? observations : new Set(observations);
  
  // Also check crossCropSymptoms if provided
  if (crossCropSymptoms) {
    crossCropSymptoms.forEach(sym => obsSet.add(sym));
  }
  
  const detectedTerminal: string[] = [];
  const detectedCropDamage: string[] = [];
  const detectedSeverity: string[] = [];
  
  // Check direct terminal damage indicators (highest priority)
  TERMINAL_DAMAGE_OBSERVATION_KEYS.forEach(key => {
    if (obsSet.has(key)) {
      detectedTerminal.push(key);
    }
  });
  
  // Check crop damage indicators (triggers diagnosis without pest/disease)
  CROP_DAMAGE_OBSERVATION_KEYS.forEach(key => {
    if (obsSet.has(key)) {
      detectedCropDamage.push(key);
    }
  });
  
  // Check severity escalators
  SEVERITY_ESCALATORS.forEach(key => {
    if (obsSet.has(key)) {
      detectedSeverity.push(key);
    }
  });
  
  // Determine severity level
  let severityLevel: CropDamageDetectionResult['severity_level'] = 'UNKNOWN';
  if (obsSet.has('SEVERITY_CRITICAL') || detectedTerminal.length >= 2) {
    severityLevel = 'CRITICAL';
  } else if (obsSet.has('SEVERITY_HIGH') || detectedTerminal.length > 0) {
    severityLevel = 'HIGH';
  } else if (obsSet.has('SEVERITY_MEDIUM') || detectedCropDamage.length >= 2) {
    severityLevel = 'MEDIUM';
  } else if (detectedCropDamage.length > 0) {
    severityLevel = 'LOW';
  }
  
  // Determine damage type
  const hasTerminalDamage = detectedTerminal.length > 0;
  const hasSignificantDamage = detectedCropDamage.length >= 2 || (detectedCropDamage.length > 0 && detectedSeverity.length > 0);
  const hasMinorDamage = detectedCropDamage.length > 0;
  
  // HARD INVARIANT: Crop damage with severity >= MEDIUM triggers DIAGNOSIS mode
  const requiresDiagnosis = hasTerminalDamage || 
    (hasSignificantDamage && ['CRITICAL', 'HIGH', 'MEDIUM'].includes(severityLevel)) ||
    (hasMinorDamage && ['CRITICAL', 'HIGH'].includes(severityLevel));
  
  // Combine all damage observations
  const allDamageObservations = [...new Set([...detectedTerminal, ...detectedCropDamage])];
  
  if (hasTerminalDamage) {
    // Terminal damage: DIAGNOSIS_ONLY mode (skip clarification)
    console.log(`\n🔬 [CropDamageDetector v4.0] TERMINAL DAMAGE detected`);
    console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
    console.log(`   Authority=CROP`);
    console.log(`   Mode=DIAGNOSIS`);
    console.log(`   Stage=${severityLevel}`);
    console.log(`   RulesExecuted=DIAGNOSIS`);
    console.log(`   NLU_GATING=DISABLED`);
    console.log(`   Terminal indicators: ${detectedTerminal.join(', ')}`);
    console.log(`   Severity: ${severityLevel}`);
    
    return {
      detected: true,
      damage_type: 'TERMINAL',
      damage_observations: allDamageObservations,
      severity_level: severityLevel,
      severity_indicators: detectedSeverity,
      requires_diagnosis: true,
      diagnosis_mode: 'DIAGNOSIS_ONLY',
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: true,
      reason: 'TERMINAL_CROP_DAMAGE_DETECTED'
    };
  }
  
  if (requiresDiagnosis) {
    // Significant damage: Diagnosis mode with optional clarification for confirmation
    console.log(`\n🌾 [CropDamageDetector v4.0] SIGNIFICANT CROP DAMAGE detected`);
    console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
    console.log(`   Authority=CROP`);
    console.log(`   Mode=DIAGNOSIS`);
    console.log(`   Severity=${severityLevel}`);
    console.log(`   RulesExecuted=DIAGNOSIS`);
    console.log(`   NLU_GATING=DISABLED`);
    console.log(`   Damage indicators: ${detectedCropDamage.slice(0, 5).join(', ')}`);
    console.log(`   Severity modifiers: ${detectedSeverity.join(', ') || 'NONE'}`);
    
    return {
      detected: true,
      damage_type: 'SIGNIFICANT',
      damage_observations: allDamageObservations,
      severity_level: severityLevel,
      severity_indicators: detectedSeverity,
      requires_diagnosis: true,
      diagnosis_mode: 'DIAGNOSIS_WITH_CLARIFICATION',
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: true,
      reason: 'SIGNIFICANT_CROP_DAMAGE_DETECTED'
    };
  }
  
  if (hasMinorDamage) {
    // Minor damage: Still triggers diagnosis but with lower priority
    console.log(`\n🌱 [CropDamageDetector v4.0] Minor crop damage detected`);
    console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
    console.log(`   Authority=CROP`);
    console.log(`   Mode=DIAGNOSIS`);
    console.log(`   Severity=${severityLevel}`);
    console.log(`   Damage indicators: ${detectedCropDamage.join(', ')}`);
    
    return {
      detected: true,
      damage_type: 'MINOR',
      damage_observations: allDamageObservations,
      severity_level: severityLevel,
      severity_indicators: detectedSeverity,
      requires_diagnosis: true, // v4.0: ALL crop damage triggers diagnosis
      diagnosis_mode: 'DIAGNOSIS_WITH_CLARIFICATION',
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: false, // Minor damage can still use NLU for context
      reason: 'MINOR_CROP_DAMAGE_DETECTED'
    };
  }
  
  return {
    detected: false,
    damage_type: 'NONE',
    damage_observations: [],
    severity_level: 'UNKNOWN',
    severity_indicators: [],
    requires_diagnosis: false,
    diagnosis_mode: 'STANDARD',
    enforced_authority: null,
    nlu_gating_disabled: false,
    reason: 'NO_CROP_DAMAGE_DETECTED'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// v5.0: AUTHORITY-AWARE CROP DAMAGE DETECTION
// Only checks CONFIRMED + EXTRACTED observations for terminal indicators.
// Inferred/Synthetic codes are IGNORED for terminal gate decisions.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect crop damage using ONLY farmer-confirmed or directly extracted evidence.
 * 
 * This is the CORRECT entry point for terminal damage detection.
 * It filters the AuthoredObservationSet to only CONFIRMED + EXTRACTED
 * authority levels before checking for terminal indicators.
 * 
 * INFERRED codes (alias expansion) and SYNTHETIC codes (cross-crop injection)
 * are EXCLUDED from terminal gate evaluation.
 */
export function detectCropDamageWithAuthority(
  authoredObservations: AuthoredObservationSet,
  crossCropSymptoms?: string[]
): CropDamageDetectionResult {
  // FIX 5 (v6.1): Promote INFERRED emergency codes to terminal gate
  // Rationale: When LLM correctly identifies DEAD_HEART_PRESENT or STEM_BORING_MARKS
  // from farmer's description, these are agronomically valid emergency indicators
  // even if tagged INFERRED rather than EXTRACTED.
  const EMERGENCY_PROMOTION_CODES = new Set([
    'DEAD_HEART_PRESENT', 'STEM_BORING_MARKS', 'BORER_DAMAGE', 'BORE_HOLES_AT_BASE',
    'FRASS_VISIBLE', 'LARVAE_PRESENT', 'PLANT_DEATH_PATCHES', 'WILTING_SEVERE',
    'STEM_ROT_PRESENT', 'CROWN_ROT', 'SEVERITY_HIGH', 'MUD_TUBES'
  ]);
  
  // Get CONFIRMED + EXTRACTED codes for terminal gate
  const terminalGateCodes = authoredObservations.getCodesForTerminalGate();
  
  // Also get INFERRED codes that are emergency-level and promote them
  const allCodes = authoredObservations.toFlatSet();
  const confirmedSet = new Set(terminalGateCodes);
  const promotedCodes: string[] = [];
  
  for (const code of allCodes) {
    if (!confirmedSet.has(code) && EMERGENCY_PROMOTION_CODES.has(code)) {
      promotedCodes.push(code);
    }
  }
  
  // Merge: terminal gate codes + promoted emergency INFERRED codes
  const enhancedTerminalCodes = [...terminalGateCodes, ...promotedCodes];
  
  console.log(`\n🔬 [CropDamageDetector v5.1 AUTHORITY-AWARE + EMERGENCY PROMOTION]`);
  console.log(`   Total observations: ${authoredObservations.size}`);
  console.log(`   Terminal gate codes (CONFIRMED+EXTRACTED): ${terminalGateCodes.length}`);
  console.log(`   Emergency INFERRED promoted: ${promotedCodes.length} [${promotedCodes.join(', ')}]`);
  console.log(`   Enhanced terminal codes: ${enhancedTerminalCodes.length}`);
  console.log(`   Authority breakdown: ${authoredObservations.toSummary()}`);
  
  // NOTE: Cross-crop symptoms are SYNTHETIC and must not trigger terminal mode.
  const terminalGateSet = new Set(enhancedTerminalCodes);
  
  // Run the detection on enhanced codes (CONFIRMED + EXTRACTED + emergency INFERRED)
  const result = detectCropDamageForDiagnosis(terminalGateSet);
  
  // Log the authority-filtered result
  if (result.detected) {
    console.log(`   ✅ [AUTHORITY-FILTERED+PROMOTED] Damage detected: ${result.damage_type}`);
    console.log(`   Triggering observations: ${result.damage_observations.join(', ')}`);
    if (promotedCodes.length > 0) {
      console.log(`   🚨 [EMERGENCY_PROMOTION] ${promotedCodes.length} INFERRED codes promoted for damage detection`);
    }
  } else {
    // Check if unfiltered set WOULD have triggered (for logging only)
    const unfilteredResult = detectCropDamageForDiagnosis(
      authoredObservations.toFlatSet(),
      crossCropSymptoms
    );
    if (unfilteredResult.detected) {
      console.log(`   🛡️ [AUTHORITY-GUARD] Terminal gate BLOCKED even after emergency promotion`);
      console.log(`   Unfiltered would have triggered: ${unfilteredResult.damage_type}`);
      console.log(`   Blocked codes (non-emergency INFERRED/SYNTHETIC): ${
        unfilteredResult.damage_observations
          .filter(code => !terminalGateSet.has(code))
          .join(', ')
      }`);
    } else {
      console.log(`   ℹ️ No crop damage detected at any authority level`);
    }
  }
  
  return result;
}

/**
 * BACKWARD COMPATIBILITY: Wrapper for existing terminal damage detection.
 * Calls the new detectCropDamageForDiagnosis and maps to old format.
 */
export function detectTerminalDamageForAuthority(
  observations: Set<string> | string[]
): TerminalDamageDetectionResult {
  const cropDamageResult = detectCropDamageForDiagnosis(observations);
  
  // Map to old format for backward compatibility
  if (cropDamageResult.damage_type === 'TERMINAL' || cropDamageResult.damage_type === 'SIGNIFICANT') {
    return {
      detected: true,
      terminal_damage: cropDamageResult.damage_observations,
      severity_escalators: cropDamageResult.severity_indicators,
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: cropDamageResult.nlu_gating_disabled,
      reason: cropDamageResult.reason
    };
  }
  
  // Minor damage in v4.0 also triggers diagnosis mode
  if (cropDamageResult.damage_type === 'MINOR' && cropDamageResult.requires_diagnosis) {
    return {
      detected: true,
      terminal_damage: cropDamageResult.damage_observations,
      severity_escalators: cropDamageResult.severity_indicators,
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: false,
      reason: cropDamageResult.reason
    };
  }
  
  return {
    detected: false,
    terminal_damage: [],
    severity_escalators: [],
    enforced_authority: null,
    nlu_gating_disabled: false,
    reason: 'NO_TERMINAL_DAMAGE'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// v2.0: ENFORCED AUTHORITY DECISION (Overrides authority-resolver.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an enforced CROP authority decision for terminal damage.
 * This OVERRIDES the normal authority-resolver.ts output.
 * 
 * HARD INVARIANT: When terminal damage is detected, authority = CROP.
 */
export function createEnforcedCropAuthority(
  terminalDamage: string[],
  observations: Set<string> | string[]
): AuthorityDecision {
  const obsSet = observations instanceof Set ? observations : new Set(observations);
  
  console.log(`\n🚨 [EnforcedAuthority] CROP authority ENFORCED by terminal damage`);
  console.log(`   Terminal damage: ${terminalDamage.join(', ')}`);
  console.log(`   NLU gating: DISABLED`);
  console.log(`   Authority-resolver: BYPASSED`);
  
  return {
    authority: DecisionAuthority.CROP,
    authority_status: AuthorityStatus.CONFIRMED,
    blocked_domains: [],
    allowed_domains: [
      DecisionAuthority.CROP,
      DecisionAuthority.SAFETY
    ],
    reason: `Terminal damage detected (${terminalDamage.join(', ')}) - CROP authority ENFORCED`,
    treatments_allowed: true,
    response_mode: ResponseMode.TREATMENT,
    resolver_version: `DIAGNOSIS_ONLY_MODE_v${DIAGNOSIS_ONLY_MODE_VERSION}`,
    resolved_at: new Date().toISOString()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// v3.0: HARD ASSERTION (INVARIANT ENFORCEMENT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HARD ASSERTION: If terminal damage is detected, authority MUST be CROP.
 * 
 * This is a non-negotiable runtime assertion that enforces the architectural
 * invariant: terminal damage observations ALWAYS grant CROP authority.
 * 
 * @throws Error if invariant is violated
 */
export function assertTerminalDamageAuthority(
  terminalDamageDetected: boolean,
  authority: DecisionAuthority
): void {
  if (terminalDamageDetected && authority !== DecisionAuthority.CROP) {
    const errorMsg = `INVARIANT VIOLATION: Terminal crop damage must grant diagnostic authority. ` +
      `Terminal damage detected but authority is ${authority}, not CROP. ` +
      `When terminal damage is present, authority MUST be CROP. ` +
      `This indicates a bug in the authority resolution flow.`;
    
    console.error(`\n🚨🚨🚨 [INVARIANT VIOLATION] ${errorMsg}`);
    console.error(`   Mode=DIAGNOSIS_ONLY`);
    console.error(`   Expected: Authority=CROP`);
    console.error(`   Actual: Authority=${authority}`);
    console.error(`   Trigger=TERMINAL_DAMAGE_OBSERVATION`);
    console.error(`   NLU_ROLE=OBSERVATION_ONLY`);
    console.error(`   Action: THROWING FATAL ERROR`);
    
    throw new Error(errorMsg);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v3.0: PRE-AUTHORITY GATE (RESOLVE FROM OBSERVATIONS, NOT NLU)
// This is the SINGLE ENTRY POINT for observation-derived authority
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result from pre-authority gate resolution.
 * This replaces NLU-based authority gating.
 */
export interface PreAuthorityGateResult {
  /** Resolved authority from observations */
  authority: DecisionAuthority;
  /** Whether NLU gating was bypassed */
  nlu_bypassed: boolean;
  /** Trigger type */
  trigger: 'TERMINAL_DAMAGE' | 'STANDARD';
  /** Terminal damage indicators detected */
  terminal_indicators: string[];
  /** The full enforced authority decision (if terminal damage) */
  enforced_decision: AuthorityDecision | null;
}

/**
 * resolveDiagnosticAuthorityFromObservations
 * 
 * PRE-AUTHORITY GATE: Resolves authority from ObservationKeys BEFORE
 * authority-resolver.ts runs. This is the sole trigger for diagnosis authority.
 * 
 * NLU intent, hasPestOrDisease, and confidence are COMPLETELY IGNORED.
 * Authority is derived from:
 * - ObservationKeys (terminal damage indicators)
 * - Crop context
 * - Growth stage
 * 
 * HARD INVARIANT: If terminal damage exists, authority = CROP.
 * 
 * @param observations - Set of ObservationKeys from all sources
 * @param existingAuthority - Optional existing authority (will be overridden if terminal damage)
 */
export function resolveDiagnosticAuthorityFromObservations(
  observations: Set<string> | string[],
  existingAuthority?: AuthorityDecision
): PreAuthorityGateResult {
  // 1. Detect terminal damage from ObservationKeys (NOT NLU)
  const terminalResult = detectTerminalDamageForAuthority(observations);
  
  // 2. HARD INVARIANT: Terminal damage = CROP authority
  if (terminalResult.detected) {
    console.log(`\n🚨 [PRE-AUTHORITY GATE] Terminal damage detected from ObservationKeys`);
    console.log(`   Mode=DIAGNOSIS_ONLY`);
    console.log(`   Authority=CROP`);
    console.log(`   Trigger=TERMINAL_DAMAGE_OBSERVATION`);
    console.log(`   NLU_ROLE=OBSERVATION_ONLY`);
    console.log(`   Terminal indicators: ${terminalResult.terminal_damage.join(', ')}`);
    
    const enforcedDecision = createEnforcedCropAuthority(
      terminalResult.terminal_damage,
      observations
    );
    
    return {
      authority: DecisionAuthority.CROP,
      nlu_bypassed: true,
      trigger: 'TERMINAL_DAMAGE',
      terminal_indicators: terminalResult.terminal_damage,
      enforced_decision: enforcedDecision
    };
  }
  
  // 3. Fall back to existing authority (if provided) or NONE
  return {
    authority: existingAuthority?.authority || DecisionAuthority.NONE,
    nlu_bypassed: false,
    trigger: 'STANDARD',
    terminal_indicators: [],
    enforced_decision: null
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVATION CHECK: Should we use Diagnosis-Only Mode? (v2.0 - Observation-First)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if Diagnosis-Only Mode should be activated.
 * 
 * v2.0 CHANGES:
 * - Runs BEFORE authority resolution
 * - Detects terminal damage from ObservationKeys, NOT NLU
 * - NLU fields (hasPestOrDisease, intent, confidence) are IGNORED
 * - Authority is ENFORCED from observations
 * 
 * ACTIVATION CRITERIA:
 * 1. Terminal damage detected from ObservationKeys
 * 2. Canonical context is locked (crop + stage known)
 * 
 * Note: matchedRulesCount is no longer required for activation.
 * Terminal damage detection itself grants diagnostic authority.
 */
export function shouldActivateDiagnosisOnlyMode(
  canonicalContext: CanonicalContext | null,
  observations: Set<string> | string[],
  matchedRulesCount: number = 1 // Kept for backward compatibility, but no longer blocking
): { 
  activate: boolean; 
  reason: string; 
  terminal_damage: string[];
  enforced_authority: DecisionAuthority | null;
  nlu_gating_disabled: boolean;
} {
  // v2.0: First detect terminal damage from observations
  const terminalResult = detectTerminalDamageForAuthority(observations);
  const obsSet = observations instanceof Set ? observations : new Set(observations);
  const explicitTerminalDamage = terminalResult.terminal_damage.filter((code) =>
    TERMINAL_DAMAGE_OBSERVATION_KEYS.has(code) && code !== 'ESTABLISHMENT_FAILURE'
  );
  const establishmentClarificationOnly = terminalResult.detected &&
    explicitTerminalDamage.length === 0 &&
    (obsSet.has('POOR_GERMINATION') || obsSet.has('POOR_GERMINATION_PERCENT') ||
      obsSet.has('SEED_NOT_GERMINATED') || obsSet.has('PATCHY_EMERGENCE'));

  if (establishmentClarificationOnly) {
    console.log(`\n🌱 [DiagnosisOnlyMode] Establishment symptom needs clarification, not terminal bypass`);
    console.log(`   Observations: ${terminalResult.terminal_damage.join(', ')}`);
    console.log(`   Clarification: REQUIRED before decision rules`);
    return {
      activate: false,
      reason: 'ESTABLISHMENT_SYMPTOM_REQUIRES_CLARIFICATION',
      terminal_damage: terminalResult.terminal_damage,
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: false
    };
  }
  
  // If no terminal damage, mode is not activated
  if (!terminalResult.detected) {
    return { 
      activate: false, 
      reason: 'NO_TERMINAL_DAMAGE',
      terminal_damage: [],
      enforced_authority: null,
      nlu_gating_disabled: false
    };
  }
  
  // Terminal damage detected - check if context is sufficient
  // Note: Even without context, we still detect terminal damage for logging
  // But full activation requires crop/stage
  
  if (!canonicalContext || !canonicalContext.is_locked) {
    console.log(`\n⚠️ [DiagnosisOnlyMode] Terminal damage detected but context not locked`);
    console.log(`   Terminal damage: ${terminalResult.terminal_damage.join(', ')}`);
    console.log(`   Recommendation: Proceed with limited context, still enforce CROP authority`);
    
    // v2.0: Even without full context, terminal damage grants CROP authority
    return { 
      activate: true, // Activate anyway - terminal damage takes precedence
      reason: 'TERMINAL_DAMAGE_DETECTED_LIMITED_CONTEXT',
      terminal_damage: terminalResult.terminal_damage,
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: true
    };
  }
  
  // Check if crop/stage are known (preferred but not mandatory in v2.0)
  if (canonicalContext.crop_code === 'UNKNOWN' || canonicalContext.growth_stage === 'UNKNOWN') {
    console.log(`\n⚠️ [DiagnosisOnlyMode] Terminal damage detected but crop/stage unknown`);
    console.log(`   Crop: ${canonicalContext.crop_code}, Stage: ${canonicalContext.growth_stage}`);
    console.log(`   Proceeding with generic rules, CROP authority still enforced`);
    
    return { 
      activate: true, // v2.0: Activate anyway
      reason: 'TERMINAL_DAMAGE_DETECTED_GENERIC_CONTEXT',
      terminal_damage: terminalResult.terminal_damage,
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: true
    };
  }
  
  // All criteria met - ACTIVATE DIAGNOSIS-ONLY MODE with full context
  console.log(`\n🔬 [DiagnosisOnlyMode] ACTIVATED with full context`);
  console.log(`   Mode=DIAGNOSIS_ONLY`);
  console.log(`   Authority=CROP (ENFORCED)`);
  console.log(`   NLU_GATING=DISABLED`);
  console.log(`   Source=DECISION_RULES`);
  console.log(`   Crop/Stage=${canonicalContext.crop_code}/${canonicalContext.growth_stage} (LOCKED)`);
  console.log(`   Terminal damage: ${terminalResult.terminal_damage.join(', ')}`);
  console.log(`   Clarification: PERMANENTLY SKIPPED`);
  
  return { 
    activate: true, 
    reason: 'TERMINAL_DAMAGE_WITH_FULL_CONTEXT',
    terminal_damage: terminalResult.terminal_damage,
    enforced_authority: DecisionAuthority.CROP,
    nlu_gating_disabled: true
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT FIX: CAUSE_TRANSLATIONS removed - hardcoded dict violated SSOT
// Use translateCause() from i18n/translation-loader.ts for DB-driven translations
// ═══════════════════════════════════════════════════════════════════════════
import { translateCause as dbTranslateCause } from '../i18n/translation-loader.ts';

// Thin wrapper that returns {mr, hi, en} object from DB-driven translateCause
function getCauseTranslation(causeKey: string): { mr: string; hi: string; en: string } {
  return {
    mr: dbTranslateCause(causeKey, 'mr'),
    hi: dbTranslateCause(causeKey, 'hi'),
    en: dbTranslateCause(causeKey, 'en'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION GUIDANCE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_TEMPLATES: Record<string, { mr: string; hi: string; en: string }> = {
  'TREAT': {
    mr: '⚡ तातडीने उपचार करा',
    hi: '⚡ तुरंत उपचार करें',
    en: '⚡ Treat immediately'
  },
  'WAIT': {
    mr: '⏳ निरीक्षण करा, 2-3 दिवस थांबा',
    hi: '⏳ निगरानी करें, 2-3 दिन रुकें',
    en: '⏳ Monitor, wait 2-3 days'
  },
  'MONITOR': {
    mr: '👁️ निरीक्षण सुरू ठेवा',
    hi: '👁️ निगरानी जारी रखें',
    en: '👁️ Continue monitoring'
  },
  'ESCALATE': {
    mr: '🚨 तज्ञांशी संपर्क करा',
    hi: '🚨 विशेषज्ञ से संपर्क करें',
    en: '🚨 Contact expert'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAGNOSIS GENERATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate Diagnosis-Only Mode output.
 * 
 * This function:
 * 1. Takes matched rules from symbolic engine
 * 2. Ranks them by confidence
 * 3. Returns top 1-3 diagnoses with agronomist-style explanations
 * 4. Includes optional photo confirmation prompt
 */
export function generateDiagnosisOnlyOutput(
  input: DiagnosisOnlyInput
): DiagnosisOnlyOutput {
  const { canonicalContext, observations, matched_rules, language, trace_id } = input;
  const traceId = trace_id || `diag_${Date.now()}`;
  
  console.log(`\n🔬 [DiagnosisOnlyMode] Generating direct diagnoses...`);
  console.log(`   Mode=DIAGNOSIS_ONLY`);
  console.log(`   Clarification=SKIPPED`);
  console.log(`   Source=DECISION_RULES`);
  console.log(`   Crop/Stage=${canonicalContext.crop_code}/${canonicalContext.growth_stage} (LOCKED)`);
  
  // Get terminal damage detected
  const terminalDamage = getDetectedTerminalDamage(observations);
  
  // Sort rules by priority first, then confidence (descending)
  const sortedRules = [...matched_rules].sort((a, b) => {
    // Priority takes precedence (lower number = higher priority)
    const priorityDiff = (a.priority || 99) - (b.priority || 99);
    if (priorityDiff !== 0) return priorityDiff;
    // Then by confidence
    return b.confidence - a.confidence;
  });
  
  // Take top 3 diagnoses
  const topRules = sortedRules.slice(0, 3);
  
  // v4.0: If no rules matched, emit UNKNOWN diagnosis rule explicitly
  let diagnoses: DiagnosisResult[] = [];
  
  if (topRules.length === 0) {
    console.log(`   ⚠️ [UNKNOWN_DIAGNOSIS] No high-confidence rules matched`);
    console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
    console.log(`   Authority=CROP`);
    console.log(`   Mode=DIAGNOSIS`);
    console.log(`   RulesExecuted=DIAGNOSIS`);
    console.log(`   Result=UNKNOWN_DIAGNOSIS_EMITTED`);
    
    // Emit explicit UNKNOWN diagnosis instead of suppressing output
    diagnoses = [createUnknownDiagnosis(terminalDamage, canonicalContext, language)];
  } else {
    // Convert matched rules to diagnosis results
    diagnoses = topRules.map(rule => {
      const causeKey = rule.cause.toUpperCase().replace(/\s+/g, '_');
      // AUDIT FIX: Use DB-driven translation instead of hardcoded dict
      const translations = getCauseTranslation(causeKey);
      
      // Determine action type based on confidence and severity
      let actionType: 'TREAT' | 'WAIT' | 'MONITOR' | 'ESCALATE' = 'MONITOR';
      if (rule.confidence >= 0.70) {
        actionType = 'TREAT';
      } else if (rule.confidence >= 0.50) {
        actionType = 'WAIT';
      } else if (rule.confidence < 0.30) {
        actionType = 'ESCALATE';
      }
      
      const actionTemplates = ACTION_TEMPLATES[actionType];
      
      // Build evidence points
      const evidence: string[] = [];
      if (rule.evidence_matched && rule.evidence_matched.length > 0) {
        evidence.push(...rule.evidence_matched);
      }
      if (terminalDamage.length > 0) {
        evidence.push(`Terminal damage: ${terminalDamage.join(', ')}`);
      }
      
      // Extract treatment summary if available
      let treatmentSummary: DiagnosisResult['treatment_summary'] = undefined;
      if (rule.actions && rule.actions.length > 0) {
        const primaryAction = rule.actions[0];
        treatmentSummary = {
          product_name: primaryAction.product_name || primaryAction.application_details?.product_name,
          dosage: primaryAction.dosage || primaryAction.application_details?.dosage,
          timing: primaryAction.timing || primaryAction.application_details?.timing
        };
      }
      
      return {
        cause: rule.cause,
        cause_name_mr: translations.mr,
        cause_name_hi: translations.hi,
        cause_name_en: translations.en,
        confidence: rule.confidence,
        canonical_group: rule.canonical_group,
        rule_id: rule.rule_id,
        evidence_points: evidence,
        action_type: actionType,
        action_guidance_mr: actionTemplates.mr,
        action_guidance_hi: actionTemplates.hi,
        action_guidance_en: actionTemplates.en,
        treatment_summary: treatmentSummary
      };
    });
  }
  
  // Calculate overall confidence
  const topConfidence = diagnoses.length > 0 ? diagnoses[0].confidence : 0;
  const treatmentThreshold = 0.65;
  const confidenceSufficient = topConfidence >= treatmentThreshold;
  
  // Photo confirmation prompt - more prominent when diagnosis is uncertain
  const photoConfirmation = {
    available: true,
    prompt_mr: topConfidence < 0.5 
      ? '📷 निदान अनिश्चित आहे. कृपया प्रभावित रोपाचा स्पष्ट फोटो पाठवा.'
      : '📷 अधिक अचूकतेसाठी, प्रभावित रोपाचा फोटो अपलोड करा.',
    prompt_hi: topConfidence < 0.5
      ? '📷 निदान अनिश्चित है। कृपया प्रभावित पौधे की स्पष्ट फोटो भेजें।'
      : '📷 अधिक सटीकता के लिए, प्रभावित पौधे की फोटो अपलोड करें.',
    prompt_en: topConfidence < 0.5
      ? '📷 Diagnosis is uncertain. Please send a clear photo of the affected plant.'
      : '📷 For more accuracy, upload a photo of the affected plant.'
  };
  
  console.log(`   Top diagnosis: ${diagnoses[0]?.cause || 'UNKNOWN'} (confidence=${(topConfidence * 100).toFixed(0)}%)`);
  console.log(`   Treatment threshold: ${treatmentThreshold}, sufficient: ${confidenceSufficient}`);
  console.log(`   Total diagnoses: ${diagnoses.length}`);
  console.log(`   Authority=CROP (ENFORCED)`);
  console.log(`   NLU_GATING=DISABLED`);
  
  return {
    mode: 'DIAGNOSIS_ONLY',
    clarification_status: 'SKIPPED',
    source: 'DECISION_RULES',
    context_status: 'LOCKED',
    
    // v4.0: Authority enforcement fields
    authority: 'CROP',
    authority_source: 'TERMINAL_DAMAGE_OBSERVATION',
    nlu_gating: 'DISABLED',
    
    diagnoses,
    top_confidence: topConfidence,
    confidence_sufficient_for_treatment: confidenceSufficient,
    treatment_threshold: treatmentThreshold,
    photo_confirmation: photoConfirmation,
    crop_code: canonicalContext.crop_code,
    growth_stage: canonicalContext.growth_stage,
    terminal_damage_detected: terminalDamage,
    trace_id: traceId,
    timestamp: Date.now()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// v4.0: UNKNOWN DIAGNOSIS CREATION
// When no high-confidence rules match, emit explicit UNKNOWN diagnosis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an explicit UNKNOWN diagnosis when no rules match.
 * This ensures the system never silently suppresses output when crop damage is present.
 */
function createUnknownDiagnosis(
  terminalDamage: string[],
  canonicalContext: CanonicalContext,
  language: string
): DiagnosisResult {
  const unknownTranslations = {
    en: 'Unknown cause - investigation required'
  };
  
  const unknownGuidance = {
    en: '📷 Please send a clear photo of the affected plant for accurate diagnosis. Meanwhile, check water management and ventilation.'
  };
  
  return {
    cause: 'UNKNOWN',
    cause_name_mr: unknownTranslations.mr,
    cause_name_hi: unknownTranslations.hi,
    cause_name_en: unknownTranslations.en,
    confidence: 0.25, // Low confidence for unknown
    canonical_group: 'UNKNOWN',
    rule_id: 'UNKNOWN_DIAGNOSIS_RULE',
    evidence_points: [
      `Observed damage: ${terminalDamage.length > 0 ? terminalDamage.join(', ') : 'Crop damage reported'}`,
      `Crop: ${canonicalContext.crop_code}`,
      `Stage: ${canonicalContext.growth_stage}`,
      'No specific pattern matched existing rules'
    ],
    action_type: 'ESCALATE',
    action_guidance_mr: unknownGuidance.mr,
    action_guidance_hi: unknownGuidance.hi,
    action_guidance_en: unknownGuidance.en,
    treatment_summary: undefined
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT DIAGNOSIS FOR LLM (Render-Only Input)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format diagnosis output for LLM rendering.
 * 
 * The LLM must ONLY:
 * - Translate and format these diagnoses
 * - Add empathetic language
 * - NEVER add its own diagnoses
 * - NEVER ask questions
 * - NEVER modify confidence or treatment
 */
export function formatDiagnosisForLLM(
  output: DiagnosisOnlyOutput,
  language: string
): string {
  const diagnoses = output.diagnoses;
  
  if (diagnoses.length === 0) {
    return '⚠️ Diagnosis not possible. Please send a photo of the affected plant.';
  }
  
  // Build structured output for LLM — English canonical, LLM translates at runtime
  const parts: string[] = [];
  
  parts.push('🔬 **Diagnosis Report**\n');
  
  // Each diagnosis — use dynamic property lookup for DB fields
  diagnoses.forEach((diag, idx) => {
    const causeName = (diag as any)[`cause_name_${language}`] || diag.cause_name_en;
    const actionGuidance = (diag as any)[`action_guidance_${language}`] || diag.action_guidance_en;
    
    const confidenceLabel = diag.confidence >= 0.70 ? '🟢 High' 
                          : diag.confidence >= 0.50 ? '🟡 Medium' 
                          : '🔴 Low';
    
    if (diagnoses.length === 1) {
      parts.push(`**Probable Cause:** ${causeName}`);
    } else {
      parts.push(`**${idx + 1}. ${causeName}** (Confidence: ${(diag.confidence * 100).toFixed(0)}%)`);
    }
    
    parts.push(`   ${actionGuidance}`);
    
    if (diag.treatment_summary?.product_name) {
      parts.push(`   💊 Treatment: ${diag.treatment_summary.product_name}`);
      if (diag.treatment_summary.dosage) {
        parts.push(`   📏 Dosage: ${diag.treatment_summary.dosage}`);
      }
    }
    
    parts.push('');
  });
  
  // Photo prompt
  parts.push(output.photo_confirmation[`prompt_${language}`] || output.photo_confirmation.prompt_en);
  
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function logDiagnosisOnlyActivation(
  activated: boolean,
  reason: string,
  terminalDamage: string[],
  cropCode: string,
  growthStage: string,
  enforcedAuthority?: DecisionAuthority | null,
  nluGatingDisabled?: boolean
): void {
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`🔬 [DIAGNOSIS-ONLY MODE CHECK] v${DIAGNOSIS_ONLY_MODE_VERSION}`);
  console.log(`   Mode=${activated ? 'DIAGNOSIS_ONLY' : 'STANDARD'}`);
  console.log(`   Authority=${enforcedAuthority || (activated ? 'CROP' : 'PENDING')}`);
  console.log(`   NLU_GATING=${nluGatingDisabled === true ? 'DISABLED' : 'ENABLED'}`);
  console.log(`   Clarification=${activated ? 'SKIPPED' : 'ALLOWED'}`);
  console.log(`   Source=DECISION_RULES`);
  console.log(`   Crop/Stage=${cropCode}/${growthStage} (LOCKED)`);
  console.log(`   Terminal Damage=${terminalDamage.length > 0 ? terminalDamage.join(', ') : 'NONE'}`);
  console.log(`   Activation Reason=${reason}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSIS-ONLY MODE (v2.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SENIOR AGRONOMIST PRINCIPLE:
 * "When crops die, we diagnose causes — we do not ask permission from NLU."
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
 * 2. If detected + crop/stage known → FORCE CROP authority
 * 3. SKIP clarification entirely
 * 4. Run hypothesis-first rule evaluation immediately
 * 5. Present diagnosis directly from decision_rules
 * 
 * NLU GATING PERMANENTLY DISABLED FOR:
 * - hasPestOrDisease checks
 * - intent classification
 * - confidence thresholds
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

export const DIAGNOSIS_ONLY_MODE_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// EXTENDED TERMINAL DAMAGE DETECTION (v2.0 - Observation-Derived Authority)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extended terminal damage indicators - any of these FORCE CROP authority.
 * These are ObservationKeys that represent terminal/severe plant damage.
 */
export const TERMINAL_DAMAGE_OBSERVATION_KEYS = new Set([
  // Direct terminal damage
  'SEEDLING_DIED',
  'PLANT_DIED',
  'PLANT_DEATH',
  'DEAD_SEEDLINGS',
  'CROP_FAILURE',
  'ESTABLISHMENT_FAILURE',
  
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
 * Severity modifiers that combine with PATCHY_DAMAGE to trigger terminal mode.
 */
export const SEVERITY_ESCALATORS = new Set([
  'SEVERITY_HIGH',
  'SEVERITY_CRITICAL',
  'ENTIRE_FIELD_AFFECTED',
  'AFFECTED_PERCENTAGE_HIGH',
  'WIDESPREAD_DAMAGE',
  'RAPID_SPREAD'
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
  language: 'mr' | 'hi' | 'en';
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
// v2.0: TERMINAL DAMAGE DETECTION (RUNS BEFORE AUTHORITY RESOLUTION)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect terminal damage from observations.
 * This runs BEFORE authority resolution to enforce CROP authority.
 * 
 * NLU GATING IS COMPLETELY BYPASSED for:
 * - hasPestOrDisease checks
 * - intent classification
 * - confidence thresholds
 * 
 * Authority is derived from OBSERVATIONS, not NLU.
 */
export function detectTerminalDamageForAuthority(
  observations: Set<string> | string[]
): TerminalDamageDetectionResult {
  const obsSet = observations instanceof Set ? observations : new Set(observations);
  
  const detectedTerminal: string[] = [];
  const detectedSeverity: string[] = [];
  
  // Check direct terminal damage indicators
  TERMINAL_DAMAGE_OBSERVATION_KEYS.forEach(key => {
    if (obsSet.has(key)) {
      detectedTerminal.push(key);
    }
  });
  
  // Check severity escalators
  SEVERITY_ESCALATORS.forEach(key => {
    if (obsSet.has(key)) {
      detectedSeverity.push(key);
    }
  });
  
  // Terminal damage detected via direct indicators
  const hasDirectTerminal = detectedTerminal.length > 0;
  
  // Terminal damage via PATCHY_DAMAGE + HIGH SEVERITY combination
  const hasPatchyWithSeverity = 
    obsSet.has('PATCHY_DAMAGE') && detectedSeverity.length > 0;
  
  const terminalDetected = hasDirectTerminal || hasPatchyWithSeverity;
  
  if (terminalDetected) {
    console.log(`\n🔬 [TerminalDamageDetector] Terminal damage DETECTED from ObservationKeys`);
    console.log(`   Mode=DIAGNOSIS_ONLY`);
    console.log(`   Authority=CROP (ENFORCED)`);
    console.log(`   NLU_GATING=DISABLED`);
    console.log(`   Terminal indicators: ${detectedTerminal.join(', ')}`);
    if (hasPatchyWithSeverity) {
      console.log(`   Severity escalators: PATCHY_DAMAGE + ${detectedSeverity.join(', ')}`);
    }
    console.log(`   Source=OBSERVATION_KEYS`);
    
    return {
      detected: true,
      terminal_damage: detectedTerminal,
      severity_escalators: detectedSeverity,
      enforced_authority: DecisionAuthority.CROP,
      nlu_gating_disabled: true,
      reason: 'TERMINAL_DAMAGE_OBSERVATION_DETECTED'
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
// v2.0: HARD ASSERTION (INVARIANT ENFORCEMENT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HARD ASSERTION: If terminal damage is detected, authority MUST be CROP.
 * 
 * @throws Error if invariant is violated
 */
export function assertTerminalDamageAuthority(
  terminalDamageDetected: boolean,
  authority: DecisionAuthority
): void {
  if (terminalDamageDetected && authority !== DecisionAuthority.CROP) {
    const errorMsg = `INVARIANT VIOLATION: Terminal damage detected but authority is ${authority}, not CROP. ` +
      `When terminal damage is present, authority MUST be CROP. This indicates a bug in the authority resolution flow.`;
    
    console.error(`\n🚨🚨🚨 [INVARIANT VIOLATION] ${errorMsg}`);
    console.error(`   Expected: authority = CROP`);
    console.error(`   Actual: authority = ${authority}`);
    console.error(`   Action: THROWING FATAL ERROR`);
    
    throw new Error(errorMsg);
  }
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
// CAUSE NAME TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const CAUSE_TRANSLATIONS: Record<string, { mr: string; hi: string; en: string }> = {
  'SHOOT_BORER': { mr: 'खोड किडा (अंकुर बेधक)', hi: 'तना छेदक', en: 'Shoot Borer' },
  'STEM_BORER': { mr: 'खोड किडा', hi: 'तना छेदक', en: 'Stem Borer' },
  'EARLY_SHOOT_BORER': { mr: 'सुरुवातीचा खोड किडा', hi: 'प्रारंभिक तना छेदक', en: 'Early Shoot Borer' },
  'TERMITE': { mr: 'वाळवी', hi: 'दीमक', en: 'Termite' },
  'TERMITE_ATTACK': { mr: 'वाळवी हल्ला', hi: 'दीमक का हमला', en: 'Termite Attack' },
  'ROOT_ROT': { mr: 'मूळ कुज', hi: 'जड़ सड़न', en: 'Root Rot' },
  'SETT_ROT': { mr: 'बेणे कुज', hi: 'बीज सड़न', en: 'Sett Rot' },
  'WATER_STRESS': { mr: 'पाण्याचा ताण', hi: 'पानी की कमी', en: 'Water Stress' },
  'WATERLOGGING': { mr: 'पाणी साचणे', hi: 'जलभराव', en: 'Waterlogging' },
  'POOR_SEED_QUALITY': { mr: 'खराब बियाणे', hi: 'खराब बीज गुणवत्ता', en: 'Poor Seed Quality' },
  'NUTRIENT_DEFICIENCY': { mr: 'पोषक तत्वांची कमतरता', hi: 'पोषक तत्वों की कमी', en: 'Nutrient Deficiency' },
  'WHITEFLY': { mr: 'पांढरी माशी', hi: 'सफेद मक्खी', en: 'Whitefly' },
  'APHID': { mr: 'मावा', hi: 'माहूं', en: 'Aphid' },
  'PYRILLA': { mr: 'पायरिला', hi: 'पायरिला', en: 'Pyrilla' },
  'RED_ROT': { mr: 'तांबेरा रोग', hi: 'लाल सड़न', en: 'Red Rot' },
  'WILT': { mr: 'मर रोग', hi: 'उकठा', en: 'Wilt' },
  'SMUT': { mr: 'काणी रोग', hi: 'कंडुआ', en: 'Smut' },
};

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
  
  // Sort rules by confidence (descending)
  const sortedRules = [...matched_rules].sort((a, b) => b.confidence - a.confidence);
  
  // Take top 3 diagnoses
  const topRules = sortedRules.slice(0, 3);
  
  // Convert to diagnosis results
  const diagnoses: DiagnosisResult[] = topRules.map(rule => {
    const causeKey = rule.cause.toUpperCase().replace(/\s+/g, '_');
    const translations = CAUSE_TRANSLATIONS[causeKey] || {
      mr: rule.cause,
      hi: rule.cause,
      en: rule.cause
    };
    
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
  
  // Calculate overall confidence
  const topConfidence = diagnoses.length > 0 ? diagnoses[0].confidence : 0;
  const treatmentThreshold = 0.65;
  const confidenceSufficient = topConfidence >= treatmentThreshold;
  
  // Photo confirmation prompt (optional, not a question)
  const photoConfirmation = {
    available: true,
    prompt_mr: '📷 अधिक अचूकतेसाठी, प्रभावित रोपाचा फोटो अपलोड करा.',
    prompt_hi: '📷 अधिक सटीकता के लिए, प्रभावित पौधे की फोटो अपलोड करें.',
    prompt_en: '📷 For more accuracy, upload a photo of the affected plant.'
  };
  
  console.log(`   Top diagnosis: ${diagnoses[0]?.cause || 'NONE'} (confidence=${(topConfidence * 100).toFixed(0)}%)`);
  console.log(`   Treatment threshold: ${treatmentThreshold}, sufficient: ${confidenceSufficient}`);
  console.log(`   Total diagnoses: ${diagnoses.length}`);
  console.log(`   Authority=CROP (ENFORCED)`);
  console.log(`   NLU_GATING=DISABLED`);
  
  return {
    mode: 'DIAGNOSIS_ONLY',
    clarification_status: 'SKIPPED',
    source: 'DECISION_RULES',
    context_status: 'LOCKED',
    
    // v2.0: Authority enforcement fields
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
  language: 'mr' | 'hi' | 'en'
): string {
  const diagnoses = output.diagnoses;
  
  if (diagnoses.length === 0) {
    return language === 'mr' 
      ? '⚠️ निदान करणे शक्य झाले नाही. कृपया प्रभावित रोपाचा फोटो पाठवा.'
      : language === 'hi'
      ? '⚠️ निदान संभव नहीं हो सका। कृपया प्रभावित पौधे की फोटो भेजें।'
      : '⚠️ Diagnosis not possible. Please send a photo of the affected plant.';
  }
  
  // Build structured output for LLM
  const parts: string[] = [];
  
  // Header
  if (language === 'mr') {
    parts.push('🔬 **निदान अहवाल**\n');
  } else if (language === 'hi') {
    parts.push('🔬 **निदान रिपोर्ट**\n');
  } else {
    parts.push('🔬 **Diagnosis Report**\n');
  }
  
  // Each diagnosis
  diagnoses.forEach((diag, idx) => {
    const causeName = language === 'mr' ? diag.cause_name_mr 
                    : language === 'hi' ? diag.cause_name_hi 
                    : diag.cause_name_en;
    
    const actionGuidance = language === 'mr' ? diag.action_guidance_mr
                         : language === 'hi' ? diag.action_guidance_hi
                         : diag.action_guidance_en;
    
    const confidenceLabel = diag.confidence >= 0.70 ? '🟢 उच्च' 
                          : diag.confidence >= 0.50 ? '🟡 मध्यम' 
                          : '🔴 कमी';
    
    if (diagnoses.length === 1) {
      parts.push(`**संभाव्य कारण:** ${causeName}`);
    } else {
      parts.push(`**${idx + 1}. ${causeName}** (विश्वास: ${(diag.confidence * 100).toFixed(0)}%)`);
    }
    
    parts.push(`   ${actionGuidance}`);
    
    if (diag.treatment_summary?.product_name) {
      parts.push(`   💊 उपचार: ${diag.treatment_summary.product_name}`);
      if (diag.treatment_summary.dosage) {
        parts.push(`   📏 प्रमाण: ${diag.treatment_summary.dosage}`);
      }
    }
    
    parts.push('');
  });
  
  // Photo prompt (optional confirmation)
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

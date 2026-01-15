/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSIS-ONLY MODE (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SENIOR AGRONOMIST PRINCIPLE:
 * "When I see terminal damage with known crop context, I state my diagnosis 
 * confidently. I don't ask the farmer to reconfirm what they already told me."
 * 
 * ACTIVATION CRITERIA:
 * 1. Canonical context is LOCKED (crop + stage known)
 * 2. Terminal damage indicators present (SEEDLING_DIED, PLANT_DIED, etc.)
 * 3. Sufficient observations for rule evaluation
 * 
 * BEHAVIOR:
 * 1. SKIP all clarification logic entirely
 * 2. SKIP IDENTIFY_LOCATION, IDENTIFY_PART, and generic scopes
 * 3. IMMEDIATELY execute symbolic rule engine
 * 4. Present top 1-3 diagnoses ranked by confidence
 * 5. Offer photo ONLY as optional confirmation (not a question)
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

export const DIAGNOSIS_ONLY_MODE_VERSION = '1.0.0';

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

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVATION CHECK: Should we use Diagnosis-Only Mode?
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if Diagnosis-Only Mode should be activated.
 * 
 * ACTIVATION CRITERIA:
 * 1. Canonical context is locked (crop + stage known)
 * 2. Terminal damage indicators present
 * 3. At least 1 rule matched (evidence exists)
 */
export function shouldActivateDiagnosisOnlyMode(
  canonicalContext: CanonicalContext | null,
  observations: Set<string> | string[],
  matchedRulesCount: number
): { activate: boolean; reason: string; terminal_damage: string[] } {
  // Check 1: Context must be locked
  if (!canonicalContext || !canonicalContext.is_locked) {
    return { 
      activate: false, 
      reason: 'CONTEXT_NOT_LOCKED', 
      terminal_damage: [] 
    };
  }
  
  // Check 2: Crop and stage must be known
  if (canonicalContext.crop_code === 'UNKNOWN' || canonicalContext.growth_stage === 'UNKNOWN') {
    return { 
      activate: false, 
      reason: 'CROP_STAGE_UNKNOWN', 
      terminal_damage: [] 
    };
  }
  
  // Check 3: Terminal damage must be detected
  const terminalDamage = getDetectedTerminalDamage(observations);
  if (terminalDamage.length === 0) {
    return { 
      activate: false, 
      reason: 'NO_TERMINAL_DAMAGE', 
      terminal_damage: [] 
    };
  }
  
  // Check 4: At least one rule must have matched
  if (matchedRulesCount === 0) {
    return { 
      activate: false, 
      reason: 'NO_RULES_MATCHED', 
      terminal_damage: terminalDamage 
    };
  }
  
  // All criteria met - ACTIVATE DIAGNOSIS-ONLY MODE
  console.log(`\n🔬 [DiagnosisOnlyMode] ACTIVATED`);
  console.log(`   Terminal damage: ${terminalDamage.join(', ')}`);
  console.log(`   Crop: ${canonicalContext.crop_code}, Stage: ${canonicalContext.growth_stage}`);
  console.log(`   Rules matched: ${matchedRulesCount}`);
  console.log(`   Clarification: SKIPPED`);
  
  return { 
    activate: true, 
    reason: 'TERMINAL_DAMAGE_WITH_CONTEXT', 
    terminal_damage: terminalDamage 
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
  
  return {
    mode: 'DIAGNOSIS_ONLY',
    clarification_status: 'SKIPPED',
    source: 'DECISION_RULES',
    context_status: 'LOCKED',
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
  growthStage: string
): void {
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`🔬 [DIAGNOSIS-ONLY MODE CHECK]`);
  console.log(`   Mode=${activated ? 'DIAGNOSIS_ONLY' : 'STANDARD'}`);
  console.log(`   Clarification=${activated ? 'SKIPPED' : 'ALLOWED'}`);
  console.log(`   Source=DECISION_RULES`);
  console.log(`   Crop/Stage=${cropCode}/${growthStage} (LOCKED)`);
  console.log(`   Terminal Damage=${terminalDamage.length > 0 ? terminalDamage.join(', ') : 'NONE'}`);
  console.log(`   Activation Reason=${reason}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);
}

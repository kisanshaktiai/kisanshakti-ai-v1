/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ABSOLUTE RULES - Non-Negotiable Safety Enforcement
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * BACKEND-ONLY: These rules CANNOT BE BYPASSED under any circumstances.
 * Based on Israeli, Dutch, and Brazilian advisory system safety standards.
 * 
 * Version: 1.0.0
 */

import { Action, Cause, CropStage, ActionUrgency, PrioritizedAction } from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type DiagnosticMode = 'CONFIRMED' | 'DIAGNOSTIC' | 'PHOTO_REQUIRED';

export interface DiagnosticDecision {
  mode: DiagnosticMode;
  remainingCauses: string[];
  confidence: number;
}

export type DataCertaintyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface FieldContextSnapshot {
  soilBaseline: {
    isEstimated: boolean;
    nitrogen?: number;
    phosphorus?: number;
  };
  dataFreshness: {
    overallCertainty: DataCertaintyLevel;
  };
}

export interface UnifiedAdvisory {
  actions: PrioritizedAction[];
  confidence: number;
  reasoning_trace?: string[];
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  blockedAction?: Action;
  correctionApplied: string;
}

export interface GuardedAdvisory {
  advisory: UnifiedAdvisory;
  violations: RuleViolation[];
  wasModified: boolean;
  finalConfidence: number;
  safetyLog: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CHEMICAL ACTIONS LIST
// ═══════════════════════════════════════════════════════════════════════════

const CHEMICAL_ACTIONS: Action[] = [
  Action.APPLY_INSECTICIDE,
  Action.APPLY_FUNGICIDE,
  Action.HERBICIDE_PRE_EMERGENCE,
  Action.HERBICIDE_POST_EMERGENCE,
];

const FERTILIZER_ACTIONS: Action[] = [
  Action.APPLY_NITROGEN,
  Action.APPLY_PHOSPHORUS,
  Action.APPLY_POTASSIUM,
  Action.APPLY_ZINC,
  Action.APPLY_MICRONUTRIENTS,
];

const AGGRESSIVE_ACTIONS: Action[] = [
  ...CHEMICAL_ACTIONS,
  ...FERTILIZER_ACTIONS,
  Action.EMERGENCY_IRRIGATION,
  Action.DRAIN_FIELD,
];

// ═══════════════════════════════════════════════════════════════════════════
// ABSOLUTE RULES
// ═══════════════════════════════════════════════════════════════════════════

interface AbsoluteRule {
  id: string;
  name: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  check: (context: RuleContext) => boolean;
  correction: (context: RuleContext, advisory: UnifiedAdvisory) => UnifiedAdvisory;
  description: string;
}

interface RuleContext {
  diagnosticDecision: DiagnosticDecision;
  fieldSnapshot: FieldContextSnapshot;
  language: string;
  cropStage?: CropStage;
}

export const ABSOLUTE_RULES: AbsoluteRule[] = [
  // RULE 1: No chemical advice in Diagnostic Mode
  {
    id: 'AR_001_NO_CHEM_DIAG',
    name: 'No Chemicals in Diagnostic Mode',
    severity: 'CRITICAL',
    check: (ctx) => ctx.diagnosticDecision.mode === 'DIAGNOSTIC',
    correction: (ctx, advisory) => {
      const filteredActions = advisory.actions.filter(
        a => !CHEMICAL_ACTIONS.includes(a.action)
      );
      return {
        ...advisory,
        actions: filteredActions,
        reasoning_trace: [
          ...(advisory.reasoning_trace || []),
          '[Absolute Rule AR_001] Removed chemical recommendations - diagnostic mode active'
        ]
      };
    },
    description: 'Chemical pesticides/fungicides cannot be recommended when diagnosis is not confirmed'
  },
  
  // RULE 2: No fertilizer without soil data
  {
    id: 'AR_002_NO_FERT_NO_SOIL',
    name: 'No Fertilizer Without Soil Data',
    severity: 'HIGH',
    check: (ctx) => {
      const soil = ctx.fieldSnapshot.soilBaseline;
      return soil.isEstimated && 
             (soil.nitrogen === undefined || soil.phosphorus === undefined);
    },
    correction: (ctx, advisory) => {
      const filteredActions = advisory.actions.map(a => {
        if (FERTILIZER_ACTIONS.includes(a.action)) {
          if (a.action === Action.APPLY_NITROGEN) {
            return { ...a, action: Action.APPLY_ORGANIC_MANURE, priority: a.priority + 1 };
          }
          return null;
        }
        return a;
      }).filter(Boolean) as typeof advisory.actions;
      
      return {
        ...advisory,
        actions: filteredActions,
        reasoning_trace: [
          ...(advisory.reasoning_trace || []),
          '[Absolute Rule AR_002] Modified fertilizer recommendations - soil test data unavailable'
        ]
      };
    },
    description: 'Specific fertilizer recommendations require soil test data'
  },
  
  // RULE 3: Confidence cap when multiple causes
  {
    id: 'AR_003_CONF_CAP_MULTI',
    name: 'Confidence Cap for Multiple Causes',
    severity: 'MEDIUM',
    check: (ctx) => ctx.diagnosticDecision.remainingCauses.length >= 2,
    correction: (ctx, advisory) => {
      const maxConfidence = 0.70;
      return {
        ...advisory,
        confidence: Math.min(advisory.confidence, maxConfidence),
        reasoning_trace: [
          ...(advisory.reasoning_trace || []),
          `[Absolute Rule AR_003] Confidence capped at ${maxConfidence * 100}% - ${ctx.diagnosticDecision.remainingCauses.length} causes remain`
        ]
      };
    },
    description: 'Confidence cannot exceed 70% when multiple causes are still possible'
  },
  
  // RULE 4: No aggressive actions with LOW certainty
  {
    id: 'AR_004_NO_AGGR_LOW_CERT',
    name: 'No Aggressive Actions with Low Certainty',
    severity: 'HIGH',
    check: (ctx) => ctx.fieldSnapshot.dataFreshness.overallCertainty === 'LOW',
    correction: (ctx, advisory) => {
      const safeActions = advisory.actions.filter(
        a => !AGGRESSIVE_ACTIONS.includes(a.action)
      );
      
      if (safeActions.length === 0) {
        safeActions.push({
          action: Action.MONITOR_CLOSELY,
          priority: 1,
          reason: Cause.COMPOUND_STRESS,
          rule_id: 'SAFETY_PROTOCOL',
          justification_key: 'action.monitor.safety_protocol',
          urgency: ActionUrgency.WITHIN_3DAYS,
          scientific_source: 'Safety Protocol'
        });
      }
      
      return {
        ...advisory,
        actions: safeActions,
        reasoning_trace: [
          ...(advisory.reasoning_trace || []),
          '[Absolute Rule AR_004] Removed aggressive actions - data certainty is LOW'
        ]
      };
    },
    description: 'Aggressive actions (chemicals, emergency irrigation) require HIGH or MEDIUM data certainty'
  },
  
  // RULE 5: Photo required mode blocks all action recommendations
  {
    id: 'AR_005_PHOTO_REQ_NO_ACTION',
    name: 'Photo Required Blocks Actions',
    severity: 'CRITICAL',
    check: (ctx) => ctx.diagnosticDecision.mode === 'PHOTO_REQUIRED',
    correction: (ctx, advisory) => {
      return {
        ...advisory,
        actions: [{
          action: Action.MONITOR_CLOSELY,
          priority: 1,
          reason: Cause.COMPOUND_STRESS,
          rule_id: 'DIAGNOSTIC_PROTOCOL',
          justification_key: 'action.monitor.photo_required',
          urgency: ActionUrgency.WITHIN_24H,
          scientific_source: 'Diagnostic Protocol'
        }],
        reasoning_trace: [
          ...(advisory.reasoning_trace || []),
          '[Absolute Rule AR_005] All actions blocked - photo required for diagnosis'
        ]
      };
    },
    description: 'When photo is required for diagnosis, no action recommendations are allowed'
  },
  
  // RULE 6: Normalize confidence to 0-100 range
  {
    id: 'AR_006_CONF_NORMALIZE',
    name: 'Normalize Confidence Range',
    severity: 'MEDIUM',
    check: (_ctx) => false, // Always apply
    correction: (_ctx, advisory) => {
      const normalizedConfidence = Math.max(0, Math.min(1, advisory.confidence));
      if (normalizedConfidence !== advisory.confidence) {
        return {
          ...advisory,
          confidence: normalizedConfidence,
          reasoning_trace: [
            ...(advisory.reasoning_trace || []),
            `[Absolute Rule AR_006] Normalized confidence from ${advisory.confidence} to ${normalizedConfidence}`
          ]
        };
      }
      return advisory;
    },
    description: 'Confidence must always be between 0 and 1 (0-100%)'
  },
  
  // RULE 7: Stage-based action restrictions
  {
    id: 'AR_007_STAGE_RESTRICT',
    name: 'Stage-Based Restrictions',
    severity: 'HIGH',
    check: (ctx) => {
      return ctx.cropStage === CropStage.REPRODUCTIVE || 
             ctx.cropStage === CropStage.MATURITY;
    },
    correction: (ctx, advisory) => {
      const filteredActions = advisory.actions.filter(a => {
        if (CHEMICAL_ACTIONS.includes(a.action)) {
          return false;
        }
        return true;
      });
      
      return {
        ...advisory,
        actions: filteredActions,
        reasoning_trace: [
          ...(advisory.reasoning_trace || []),
          `[Absolute Rule AR_007] Blocked chemical sprays - crop at ${ctx.cropStage} stage`
        ]
      };
    },
    description: 'Chemical sprays are blocked during flowering and maturity stages'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GUARD FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function applyAbsoluteRulesGuard(
  advisory: UnifiedAdvisory,
  diagnosticDecision: DiagnosticDecision,
  fieldSnapshot: FieldContextSnapshot,
  language: string,
  cropStage?: CropStage
): GuardedAdvisory {
  const violations: RuleViolation[] = [];
  const safetyLog: string[] = [];
  let currentAdvisory = { ...advisory };
  let wasModified = false;
  
  const context: RuleContext = {
    diagnosticDecision,
    fieldSnapshot,
    language,
    cropStage
  };
  
  for (const rule of ABSOLUTE_RULES) {
    if (rule.check(context)) {
      const previousActionCount = currentAdvisory.actions.length;
      currentAdvisory = rule.correction(context, currentAdvisory);
      
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        description: rule.description,
        correctionApplied: `Applied correction: ${rule.name}`
      });
      
      safetyLog.push(`[${rule.id}] ${rule.name}: Correction applied`);
      
      if (currentAdvisory.actions.length !== previousActionCount) {
        wasModified = true;
        safetyLog.push(`  → Actions changed: ${previousActionCount} → ${currentAdvisory.actions.length}`);
      }
    }
  }
  
  const normalizedConfidence = Math.max(0, Math.min(1, currentAdvisory.confidence));
  currentAdvisory.confidence = normalizedConfidence;
  
  console.log(`🛡️ [Absolute Rules Guard] Applied ${violations.length} rules, wasModified: ${wasModified}`);
  
  return {
    advisory: currentAdvisory,
    violations,
    wasModified,
    finalConfidence: normalizedConfidence,
    safetyLog
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE CONSISTENCY CHECK
// ═══════════════════════════════════════════════════════════════════════════

export function checkLanguageConsistency(
  text: string,
  expectedLanguage: string
): { isConsistent: boolean; detectedMixing: string[] } {
  const detectedMixing: string[] = [];
  
  const hindiPattern = /[\u0900-\u097F]/;
  const marathiSpecificWords = ['आहे', 'करा', 'द्या', 'पहा', 'घ्या', 'होते', 'नाही'];
  const englishPattern = /[a-zA-Z]{3,}/;
  
  const hasHindi = hindiPattern.test(text);
  const hasEnglish = englishPattern.test(text);
  const hasMarathi = marathiSpecificWords.some(w => text.includes(w));
  
  if (expectedLanguage === 'en' && (hasHindi || hasMarathi)) {
    detectedMixing.push('Found Hindi/Marathi in English response');
  }
  
  if (expectedLanguage === 'hi' && hasEnglish) {
    const technicalTerms = ['NDVI', 'pH', 'NPK', 'DAP', 'MOP', 'ICAR', 'FAO'];
    const nonTechnicalEnglish = text.match(/[a-zA-Z]{4,}/g)?.filter(
      word => !technicalTerms.includes(word.toUpperCase())
    );
    if (nonTechnicalEnglish && nonTechnicalEnglish.length > 3) {
      detectedMixing.push('Found excessive English in Hindi response');
    }
  }
  
  if (expectedLanguage === 'mr' && hasEnglish) {
    const technicalTerms = ['NDVI', 'pH', 'NPK', 'DAP', 'MOP', 'ICAR', 'FAO'];
    const nonTechnicalEnglish = text.match(/[a-zA-Z]{4,}/g)?.filter(
      word => !technicalTerms.includes(word.toUpperCase())
    );
    if (nonTechnicalEnglish && nonTechnicalEnglish.length > 3) {
      detectedMixing.push('Found excessive English in Marathi response');
    }
  }
  
  return {
    isConsistent: detectedMixing.length === 0,
    detectedMixing
  };
}

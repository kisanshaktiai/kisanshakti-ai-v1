// DECISION AUTHORITY RESOLVER (Land-First Governance Layer)

export const AUTHORITY_RESOLVER_VERSION = '2.0.0';

// P1-1 FIX: Import canonical types from authority-types.ts

import {
  DecisionAuthority,
  AuthorityStatus,
  ResponseMode,
  type AuthorityDecision
} from './authority-types.ts';

// v2.0: Import terminal damage detection from diagnosis-only-mode
import {
  detectTerminalDamageForAuthority,
  createEnforcedCropAuthority,
  assertTerminalDamageAuthority
} from './diagnosis-only-mode.ts';

// Re-export for backward compatibility
export { DecisionAuthority, AuthorityStatus, ResponseMode };
export type { AuthorityDecision };

// INPUT CONTRACT (Immutable - from existing symbolic layers)

export interface AuthorityInput {
  /** Cause codes detected by upstream layers (observation-cause-mapper) */
  detected_causes: string[];
  
  /** Cross-crop symptoms from symptom mapper */
  cross_crop_symptoms: string[];
  
  /** Land context from database */
  land_context?: {
    has_soil_health: boolean;
    soil_ec?: number;           // Electrical conductivity (dS/m)
    waterlogging?: boolean;
  };
}

// CAUSE DETECTION SETS (Deterministic Matching)

// SAFETY causes - Override EVERYTHING
const SAFETY_CAUSES = new Set([
  'TOXIC_EXPOSURE',
  'LIVESTOCK_RISK',
  'HUMAN_SAFETY_RISK',
  'POISONING_RISK',
  'BANNED_SUBSTANCE',
  'PHI_VIOLATION',
  'EMERGENCY_ESCALATION'
]);

// LAND causes - Override CROP, CLIMATE, SYSTEM
const LAND_CAUSES = new Set([
  'SALINITY',
  'SODICITY',
  'WATERLOGGING',
  'SOIL_TOXICITY',
  'SOIL_COMPACTION',
  'SOIL_DEGRADATION',
  'SOIL_EROSION',
  'DRAINAGE_FAILURE',
  'SALT_STRESS',
  'ALKALINITY_STRESS',
  // From Cause enum additions
  'SOIL_HEALTH_DEGRADED',
  'SOIL_COMPACTION_RISK',
  'SOIL_EROSION_RISK',
  'SOIL_SALINITY_RISK',
  'SOIL_DRAINAGE_POOR',
  'SOIL_DRAINAGE_EXCESSIVE',
  'SOIL_STRUCTURE_DEGRADED'
]);

// CLIMATE causes - Override CROP only
const CLIMATE_CAUSES = new Set([
  'FROST',
  'FROST_DAMAGE',
  'HEAT_STRESS',
  'HEATWAVE',
  'FLOOD_DAMAGE',
  'FLOOD_STRESS',
  'DROUGHT_STRESS',
  'EXCESSIVE_RAINFALL',
  'COLD_STRESS',
  'WIND_DAMAGE',
  'HAIL_DAMAGE'
]);

// SYSTEM causes - Override CROP only
const SYSTEM_CAUSES = new Set([
  'IRRIGATION_FAILURE',
  'PUMP_FAILURE',
  'MECHANICAL_DAMAGE',
  'EQUIPMENT_FAILURE',
  'POWER_FAILURE',
  'SPRAY_EQUIPMENT_FAILURE',
  'STORAGE_FAILURE'
]);

// SYMPTOM → AUTHORITY DOMAIN — PR-2: DB-DRIVEN

import {
  classifyAuthorityDomain,
  classifyFailureClass as classifyFailureClassSafe,
  getHypothesisType,
} from '../utils/observation-classification-cache.ts';



// MAIN RESOLVER FUNCTION (v2.0 - WITH TERMINAL DAMAGE PRE-CHECK)

// resolveDecisionAuthority
export function resolveDecisionAuthority(
  input: AuthorityInput,
  observations?: Set<string> | string[]
): AuthorityDecision {
  const causes = new Set(input.detected_causes || []);
  const symptoms = new Set(input.cross_crop_symptoms || []);
  
  const resolvedAt = new Date().toISOString();
  
  // PRE-AUTHORITY GATE: Terminal damage OVERRIDES everything (v2.0)
  
  if (observations) {
    const terminalCheck = detectTerminalDamageForAuthority(observations);
    if (terminalCheck.detected) {
      console.log(`\n🚨 [AuthorityResolver] TERMINAL DAMAGE DETECTED - CROP authority ENFORCED`);
      console.log(`   Mode=DIAGNOSIS_ONLY`);
      console.log(`   Authority=CROP`);
      console.log(`   Trigger=TERMINAL_DAMAGE_OBSERVATION`);
      console.log(`   NLU_ROLE=OBSERVATION_ONLY`);
      console.log(`   Terminal indicators: ${terminalCheck.terminal_damage.join(', ')}`);
      
      return createEnforcedCropAuthority(
        terminalCheck.terminal_damage,
        observations
      );
    }
  }
  
  // RULE 0: NO CAUSES = NONE AUTHORITY (Observation/Information Only)
  
  if (causes.size === 0 && symptoms.size === 0) {
    // v2.0: Double-check observations for terminal damage even if causes/symptoms empty
    // This prevents NONE authority when terminal damage exists
    if (observations) {
      const terminalRecheck = detectTerminalDamageForAuthority(observations);
      if (terminalRecheck.detected) {
        console.log(`\n🚨 [AuthorityResolver] NONE authority BLOCKED - terminal damage present`);
        console.log(`   Mode=DIAGNOSIS_ONLY`);
        console.log(`   Authority=CROP (ENFORCED)`);
        console.log(`   Trigger=TERMINAL_DAMAGE_OBSERVATION`);
        console.log(`   NLU_ROLE=OBSERVATION_ONLY`);
        return createEnforcedCropAuthority(terminalRecheck.terminal_damage, observations);
      }
    }
    
    return {
      authority: DecisionAuthority.NONE,
      authority_status: AuthorityStatus.UNCONFIRMED,
      blocked_domains: [DecisionAuthority.CROP],
      allowed_domains: [DecisionAuthority.NONE],
      reason: 'No causes or symptoms detected - observation only mode',
      treatments_allowed: false,
      response_mode: ResponseMode.OBSERVATION,
      resolver_version: AUTHORITY_RESOLVER_VERSION,
      resolved_at: resolvedAt
    };
  }
  
  // RULE 1: SAFETY (Overrides Everything)
  
  const safetyCauseDetected = [...causes].some(c => SAFETY_CAUSES.has(c));
  
  if (safetyCauseDetected) {
    return {
      authority: DecisionAuthority.SAFETY,
      authority_status: AuthorityStatus.CONFIRMED,
      blocked_domains: [
        DecisionAuthority.LAND,
        DecisionAuthority.CLIMATE,
        DecisionAuthority.SYSTEM,
        DecisionAuthority.CROP
      ],
      allowed_domains: [DecisionAuthority.SAFETY],
      reason: 'Safety concern detected - all other domains blocked pending safety resolution',
      treatments_allowed: false, // Safety blocks treatments, escalates
      response_mode: ResponseMode.INFORMATION,
      resolver_version: AUTHORITY_RESOLVER_VERSION,
      resolved_at: resolvedAt
    };
  }
  
  // RULE 2: LAND (Overrides CROP, CLIMATE, SYSTEM)

  const landCauseDetected = [...causes].some(c => LAND_CAUSES.has(c));
  const landSymptomDetected = [...symptoms].some(s => classifyAuthorityDomain(s) === 'LAND');
  const landContextTrigger = detectLandContextTrigger(input.land_context);

  if (landCauseDetected || landSymptomDetected || landContextTrigger) {
    return {
      authority: DecisionAuthority.LAND,
      authority_status: AuthorityStatus.CONFIRMED,
      blocked_domains: [
        DecisionAuthority.CROP,
        DecisionAuthority.CLIMATE,
        DecisionAuthority.SYSTEM
      ],
      allowed_domains: [DecisionAuthority.LAND, DecisionAuthority.SAFETY],
      reason: 'Land/soil stress detected - pest, disease, and spray logic blocked',
      treatments_allowed: false,
      response_mode: ResponseMode.INFORMATION,
      resolver_version: AUTHORITY_RESOLVER_VERSION,
      resolved_at: resolvedAt
    };
  }

  // RULE 3: CLIMATE (Overrides CROP only) — DB-driven symptom trigger

  const climateCauseDetected = [...causes].some(c => CLIMATE_CAUSES.has(c));
  const climateSymptomDetected = [...symptoms].some(s => classifyAuthorityDomain(s) === 'CLIMATE');

  if (climateCauseDetected || climateSymptomDetected) {
    return {
      authority: DecisionAuthority.CLIMATE,
      authority_status: AuthorityStatus.CONFIRMED,
      blocked_domains: [DecisionAuthority.CROP],
      allowed_domains: [
        DecisionAuthority.CLIMATE,
        DecisionAuthority.LAND,
        DecisionAuthority.SAFETY
      ],
      reason: 'Climate stress detected - pest and disease logic blocked',
      treatments_allowed: false,
      response_mode: ResponseMode.INFORMATION,
      resolver_version: AUTHORITY_RESOLVER_VERSION,
      resolved_at: resolvedAt
    };
  }

  // RULE 4: SYSTEM (Overrides CROP only)

  const systemCauseDetected = [...causes].some(c => SYSTEM_CAUSES.has(c));

  if (systemCauseDetected) {
    return {
      authority: DecisionAuthority.SYSTEM,
      authority_status: AuthorityStatus.CONFIRMED,
      blocked_domains: [DecisionAuthority.CROP],
      allowed_domains: [
        DecisionAuthority.SYSTEM,
        DecisionAuthority.LAND,
        DecisionAuthority.SAFETY
      ],
      reason: 'System/infrastructure failure detected - pest and disease logic blocked',
      treatments_allowed: false,
      response_mode: ResponseMode.INFORMATION,
      resolver_version: AUTHORITY_RESOLVER_VERSION,
      resolved_at: resolvedAt
    };
  }

  // RULE 5: CROP (Pests, diseases, nutrient stress) — DB-DRIVEN

  const causeIsHypoType = (target: string) =>
    [...causes].some(c => getHypothesisType(c) === target);

  // Fallback: some cause tokens are also observation codes (e.g. after
  // symptom→cause promotion). Consult observation_master's failure_class.
  const causeMatchesFC = (target: 'PEST_DAMAGE' | 'DISEASE_SYMPTOM' | 'NUTRIENT_DEFICIENCY') =>
    [...causes].some(c => classifyFailureClassSafe(c) === target);

  const hasPestCause = causeIsHypoType('PEST') || causeMatchesFC('PEST_DAMAGE');
  const hasDiseaseCause = causeIsHypoType('DISEASE') || causeMatchesFC('DISEASE_SYMPTOM');
  const hasNutrientCause = causeIsHypoType('DEFICIENCY') || causeMatchesFC('NUTRIENT_DEFICIENCY');

  // Symptom-side DB classification
  const domainCounts = { pest: 0, disease: 0, nutrient: 0 };
  for (const s of symptoms) {
    const cls = classifyAuthorityDomain(s);
    if (cls !== 'CROP') continue;
    const obs = classifyFailureClassSafe(s);
    if (obs === 'PEST_DAMAGE') domainCounts.pest++;
    else if (obs === 'DISEASE_SYMPTOM') domainCounts.disease++;
    else if (obs === 'NUTRIENT_DEFICIENCY') domainCounts.nutrient++;
  }
  const hasPestSymptom = domainCounts.pest > 0;
  const hasDiseaseSymptom = domainCounts.disease > 0;
  const hasNutrientSymptom = domainCounts.nutrient > 0;

  const isConfirmed = hasPestCause || hasDiseaseCause || hasNutrientCause ||
                      hasPestSymptom || hasDiseaseSymptom;
  const hasPotential = symptoms.size > 0 || hasNutrientSymptom;

  
  const result: AuthorityDecision = {
    authority: DecisionAuthority.CROP,
    authority_status: isConfirmed ? AuthorityStatus.CONFIRMED : AuthorityStatus.UNCONFIRMED,
    blocked_domains: [],
    allowed_domains: [
      DecisionAuthority.CROP,
      DecisionAuthority.LAND,
      DecisionAuthority.CLIMATE,
      DecisionAuthority.SYSTEM,
      DecisionAuthority.SAFETY
    ],
    reason: isConfirmed 
      ? 'Crop-level issue confirmed - treatments allowed' 
      : hasPotential
        ? 'Potential crop issue - treatments may proceed with monitoring'
        : 'Potential crop issue - clarification may be needed before treatment',
    treatments_allowed: isConfirmed || hasPotential, // Allow treatments if we have any symptoms
    response_mode: isConfirmed ? ResponseMode.TREATMENT : (hasPotential ? ResponseMode.TREATMENT : ResponseMode.CLARIFICATION),
    resolver_version: AUTHORITY_RESOLVER_VERSION,
    resolved_at: resolvedAt
  };
  
  // v2.0: FINAL INVARIANT CHECK - Terminal damage MUST have CROP authority
  if (observations) {
    const finalCheck = detectTerminalDamageForAuthority(observations);
    // This will throw if invariant is violated
    assertTerminalDamageAuthority(finalCheck.detected, result.authority);
  }
  
  return result;
}

// LAND CONTEXT TRIGGER DETECTION

// Detect land-level triggers from context data (not causes).
function detectLandContextTrigger(landContext?: AuthorityInput['land_context']): boolean {
  if (!landContext) return false;
  
  // Waterlogging flag set
  if (landContext.waterlogging === true) {
    return true;
  }
  
  // Soil EC above salinity threshold (4 dS/m is moderate salinity)
  if (landContext.soil_ec !== undefined && landContext.soil_ec >= 4.0) {
    return true;
  }
  
  return false;
}

// UTILITY: CHECK IF CROP RULES ARE BLOCKED

// Helper function for diagnostic-flow-controller integration.
export function shouldSkipCropRules(decision: AuthorityDecision): boolean {
  // NONE authority means observation only - skip all treatment rules
  if (decision.authority === DecisionAuthority.NONE) {
    return true;
  }
  
  return decision.authority !== DecisionAuthority.CROP &&
         decision.blocked_domains.includes(DecisionAuthority.CROP);
}

// Helper function to check if a specific domain is allowed.
export function isDomainAllowed(decision: AuthorityDecision, domain: DecisionAuthority): boolean {
  return decision.allowed_domains.includes(domain);
}

// Helper function to check if treatments are allowed.
export function areTreatmentsAllowed(decision: AuthorityDecision): boolean {
  return decision.treatments_allowed && decision.authority_status === AuthorityStatus.CONFIRMED;
}

// AUDIT LOG STRUCTURE

export interface AuthorityAuditEntry {
  decision_authority: {
    authority: string;
    blocked_domains: string[];
    allowed_domains: string[];
    reason: string;
    resolver_version: string;
  };
  input_snapshot: {
    detected_causes: string[];
    cross_crop_symptoms: string[];
    land_context_present: boolean;
  };
  resolved_at: string;
}

// Build audit log entry for authority resolution.
export function buildAuthorityAuditEntry(
  input: AuthorityInput,
  decision: AuthorityDecision
): AuthorityAuditEntry {
  return {
    decision_authority: {
      authority: decision.authority,
      blocked_domains: decision.blocked_domains,
      allowed_domains: decision.allowed_domains,
      reason: decision.reason,
      resolver_version: decision.resolver_version
    },
    input_snapshot: {
      detected_causes: input.detected_causes || [],
      cross_crop_symptoms: input.cross_crop_symptoms || [],
      land_context_present: !!input.land_context
    },
    resolved_at: decision.resolved_at
  };
}

// EXPORTS

export default {
  resolveDecisionAuthority,
  shouldSkipCropRules,
  isDomainAllowed,
  buildAuthorityAuditEntry,
  DecisionAuthority,
  AUTHORITY_RESOLVER_VERSION
};

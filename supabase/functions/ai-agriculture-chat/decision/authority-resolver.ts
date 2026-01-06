/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION AUTHORITY RESOLVER (Land-First Governance Layer)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Determines the single authoritative decision domain BEFORE any diagnostic
 * rules are evaluated. This is a HARD authority system, not probabilistic.
 * 
 * DESIGN LAWS:
 * - This layer is GOVERNANCE, not intelligence
 * - It does NOT infer causes
 * - It does NOT score, rank, or predict
 * - It does NOT use LLM reasoning
 * - It ONLY enforces legal authority to decide
 * - Authority is BINARY and DETERMINISTIC
 * 
 * Authority ≠ Confidence
 * Authority ≠ Probability  
 * Authority = Legal Right to Decide
 * 
 * PRECEDENCE (Strict Order):
 * 1. SAFETY - Overrides everything
 * 2. LAND - Overrides CROP, CLIMATE, SYSTEM
 * 3. CLIMATE - Overrides CROP only
 * 4. SYSTEM - Overrides CROP only
 * 5. CROP - Default (pests, diseases, nutrients)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const AUTHORITY_RESOLVER_VERSION = '1.2.0';

// ═══════════════════════════════════════════════════════════════════════════
// P1-1 FIX: Import canonical types from authority-types.ts
// All authority-related types are now centralized
// ═══════════════════════════════════════════════════════════════════════════

import {
  DecisionAuthority,
  AuthorityStatus,
  ResponseMode,
  type AuthorityDecision
} from './authority-types.ts';

// Re-export for backward compatibility
export { DecisionAuthority, AuthorityStatus, ResponseMode };
export type { AuthorityDecision };

// ═══════════════════════════════════════════════════════════════════════════
// INPUT CONTRACT (Immutable - from existing symbolic layers)
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE DETECTION SETS (Deterministic Matching)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SAFETY causes - Override EVERYTHING
 * If any of these are present, ONLY safety logic may proceed.
 */
const SAFETY_CAUSES = new Set([
  'TOXIC_EXPOSURE',
  'LIVESTOCK_RISK',
  'HUMAN_SAFETY_RISK',
  'POISONING_RISK',
  'BANNED_SUBSTANCE',
  'PHI_VIOLATION',
  'EMERGENCY_ESCALATION'
]);

/**
 * LAND causes - Override CROP, CLIMATE, SYSTEM
 * Soil and land-level issues invalidate pest/disease logic.
 */
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

/**
 * CLIMATE causes - Override CROP only
 * Weather events take precedence over pest/disease logic.
 */
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

/**
 * SYSTEM causes - Override CROP only
 * Infrastructure failures take precedence over pest/disease logic.
 */
const SYSTEM_CAUSES = new Set([
  'IRRIGATION_FAILURE',
  'PUMP_FAILURE',
  'MECHANICAL_DAMAGE',
  'EQUIPMENT_FAILURE',
  'POWER_FAILURE',
  'SPRAY_EQUIPMENT_FAILURE',
  'STORAGE_FAILURE'
]);

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM-BASED TRIGGERS (For cases where cause mapping hasn't run yet)
// ═══════════════════════════════════════════════════════════════════════════

const LAND_SYMPTOMS = new Set([
  'SALT_CRUST_VISIBLE',
  'WHITE_DEPOSIT_SOIL',
  'STANDING_WATER',
  'WATERLOGGED_SOIL',
  'CRACKED_SOIL',
  'HARDPAN_VISIBLE',
  'SOIL_CRUST'
]);

const CLIMATE_SYMPTOMS = new Set([
  'FROST_BURN',
  'LEAF_SCORCH_HEAT',
  'WILTING_WIDESPREAD',
  'FLOOD_SUBMERSION',
  'HAIL_MARKS'
]);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RESOLVER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * resolveDecisionAuthority
 * 
 * Determines which domain has the LEGAL RIGHT to make decisions.
 * This is pure symbolic logic with strict precedence rules.
 * 
 * @param input - AuthorityInput from upstream symbolic layers
 * @returns AuthorityDecision with explicit blocked/allowed domains
 */
export function resolveDecisionAuthority(input: AuthorityInput): AuthorityDecision {
  const causes = new Set(input.detected_causes || []);
  const symptoms = new Set(input.cross_crop_symptoms || []);
  
  const resolvedAt = new Date().toISOString();
  
  // ═══════════════════════════════════════════════════════════════════════
  // RULE 0: NO CAUSES = NONE AUTHORITY (Observation/Information Only)
  // ═══════════════════════════════════════════════════════════════════════
  
  if (causes.size === 0 && symptoms.size === 0) {
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
  
  // ═══════════════════════════════════════════════════════════════════════
  // RULE 1: SAFETY (Overrides Everything)
  // ═══════════════════════════════════════════════════════════════════════
  
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
  
  // ═══════════════════════════════════════════════════════════════════════
  // RULE 2: LAND (Overrides CROP, CLIMATE, SYSTEM)
  // ═══════════════════════════════════════════════════════════════════════
  
  const landCauseDetected = [...causes].some(c => LAND_CAUSES.has(c));
  const landSymptomDetected = [...symptoms].some(s => LAND_SYMPTOMS.has(s));
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
      treatments_allowed: false, // Land issues don't get spray treatments
      response_mode: ResponseMode.INFORMATION,
      resolver_version: AUTHORITY_RESOLVER_VERSION,
      resolved_at: resolvedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // RULE 3: CLIMATE (Overrides CROP only)
  // ═══════════════════════════════════════════════════════════════════════
  
  const climateCauseDetected = [...causes].some(c => CLIMATE_CAUSES.has(c));
  const climateSymptomDetected = [...symptoms].some(s => CLIMATE_SYMPTOMS.has(s));
  
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
      treatments_allowed: false, // Climate issues don't get spray treatments
      response_mode: ResponseMode.INFORMATION,
      resolver_version: AUTHORITY_RESOLVER_VERSION,
      resolved_at: resolvedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // RULE 4: SYSTEM (Overrides CROP only)
  // ═══════════════════════════════════════════════════════════════════════
  
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
      treatments_allowed: false, // System issues don't get spray treatments
      response_mode: ResponseMode.INFORMATION,
      resolver_version: AUTHORITY_RESOLVER_VERSION,
      resolved_at: resolvedAt
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // RULE 5: CROP (Pests, diseases, nutrient stress)
  // Check if confirmed or just potential
  // ═══════════════════════════════════════════════════════════════════════
  
  const hasPestCause = [...causes].some(c => c.includes('PEST') || c.includes('BORER') || c.includes('APHID') || c.includes('WHITEFLY'));
  const hasDiseaseCause = [...causes].some(c => c.includes('DISEASE') || c.includes('RUST') || c.includes('BLIGHT') || c.includes('WILT'));
  const hasNutrientCause = [...causes].some(c => c.includes('NUTRIENT') || c.includes('DEFICIENCY') || c.includes('NITROGEN') || c.includes('PHOSPHORUS'));
  
  const isConfirmed = hasPestCause || hasDiseaseCause || hasNutrientCause;
  
  return {
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
      : 'Potential crop issue - clarification may be needed before treatment',
    treatments_allowed: isConfirmed,
    response_mode: isConfirmed ? ResponseMode.TREATMENT : ResponseMode.CLARIFICATION,
    resolver_version: AUTHORITY_RESOLVER_VERSION,
    resolved_at: resolvedAt
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAND CONTEXT TRIGGER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect land-level triggers from context data (not causes).
 * This catches cases where structured data indicates land issues
 * before cause mapping has run.
 */
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

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: CHECK IF CROP RULES ARE BLOCKED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper function for diagnostic-flow-controller integration.
 * Returns true if crop-level rules (pest/disease/nutrient) should be skipped.
 */
export function shouldSkipCropRules(decision: AuthorityDecision): boolean {
  // NONE authority means observation only - skip all treatment rules
  if (decision.authority === DecisionAuthority.NONE) {
    return true;
  }
  
  return decision.authority !== DecisionAuthority.CROP &&
         decision.blocked_domains.includes(DecisionAuthority.CROP);
}

/**
 * Helper function to check if a specific domain is allowed.
 */
export function isDomainAllowed(decision: AuthorityDecision, domain: DecisionAuthority): boolean {
  return decision.allowed_domains.includes(domain);
}

/**
 * Helper function to check if treatments are allowed.
 */
export function areTreatmentsAllowed(decision: AuthorityDecision): boolean {
  return decision.treatments_allowed && decision.authority_status === AuthorityStatus.CONFIRMED;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

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

/**
 * Build audit log entry for authority resolution.
 */
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

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  resolveDecisionAuthority,
  shouldSkipCropRules,
  isDomainAllowed,
  buildAuthorityAuditEntry,
  DecisionAuthority,
  AUTHORITY_RESOLVER_VERSION
};

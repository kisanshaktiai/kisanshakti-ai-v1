/**
 * CHANGE LOG
 * 2026-07-29 10:55 UTC — FIX C1-b: isEarly/isVegetativeStageFromDB accept cultivationMethod and forward it to getStageRow.
 * ═══════════════════════════════════════════════════════════════════════════
 * FAILURE CLASS DETECTOR - CANONICAL SYMBOL VERSION
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG
 *   2026-07-11 UTC — v4-P4: `getFailureClassFallbackOptions` no longer
 *     returns per-class hardcoded observation lists (STUNTED_GROWTH / WILTING
 *     / LEAF_CURLING / etc.). Symptom generation is DB territory. Empty [] is
 *     returned; callers must fall through to WAITING_FOR_OBSERVATION.
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Determine primary failure class before generating clarification options.
 * Uses ONLY canonical ObservationKeys - NO hardcoded language strings.
 * 
 * REFACTORED: Phase-1 SSOT Compliance
 * - Removed all hardcoded Marathi/Hindi/English keyword arrays
 * - Now operates exclusively on pre-extracted canonical symbols
 * - Language-agnostic logic for production readiness
 * 
 * FAILURE CLASSES:
 * - ESTABLISHMENT_FAILURE: Plant death, gaps, poor emergence
 * - VEGETATIVE_STRESS: Growth issues during vegetative stage
 * - PEST_DAMAGE: Visible insect/pest activity
 * - DISEASE_SYMPTOM: Fungal, bacterial, viral symptoms
 * - NUTRIENT_DEFICIENCY: Nutrient-related visual symptoms
 * 
 * RULES:
 * 1. Derive failure class from canonical observations only
 * 2. No language-dependent logic - pure canonical symbol matching
 * 3. Used to scope clarification domain
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const FAILURE_CLASS_VERSION = '2.0.0'; // SSOT-compliant version

// TYPE DEFINITIONS

export type FailureClass = 
  | 'ESTABLISHMENT_FAILURE'
  | 'VEGETATIVE_STRESS'
  | 'PEST_DAMAGE'
  | 'DISEASE_SYMPTOM'
  | 'NUTRIENT_DEFICIENCY'
  | 'WEED_COMPETITION'
  | 'UNKNOWN';

// SSOT-COMPLIANT INPUT
export interface FailureClassInput {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  /** Canonical observation codes from LLM/induction extraction */
  observations: string[];
  /** Pre-extracted symptoms from language induction layer */
  symptoms: string[];
  symptom_scope: 'WHOLE_PLANT' | 'PART' | 'UNKNOWN';
  /** Intent code from intent classifier */
  detected_intent: string;
}

export interface FailureClassResult {
  primary_class: FailureClass;
  confidence: number;
  matched_observations: string[];
  reasoning: string;
  stage_compatible: boolean;
  derived_from: 'STAGE' | 'OBSERVATIONS' | 'SYMPTOMS' | 'INTENT' | 'DEFAULT';
}

export interface FailureClassAuditLog {
  trace_id: string;
  timestamp: number;
  input: FailureClassInput;
  result: FailureClassResult;
  clarification_domain: string;
  fallback_used: boolean;
  fallback_reason: string | null;
}

// PR-2 REFACTOR — All hardcoded ObservationKey Sets DELETED.

import {
  classifyFailureClass,
  classifyObservation,
  observationAppliesToStage,
  type FailureClassEnum,
} from '../utils/observation-classification-cache.ts';
import { getStageByDAS, getStageRow } from '../utils/stage-knowledge-cache.ts';

// DB-driven "early stage" check. A stage is early iff the DB row has
const EARLY_STAGE_DAS_CEILING = 30;
const VEGETATIVE_STAGE_DAS_CEILING = 90;

function isEarlyStageFromDB(crop: string, stage: string, das: number | null, cultivationMethod?: string | null): boolean {
  if (das !== null && das !== undefined) return das <= EARLY_STAGE_DAS_CEILING;
  if (!crop || !stage) return false;
  const row = getStageRow(crop, stage, cultivationMethod);
  if (!row) return false;
  const dasMax = typeof row.das_max === 'number' ? row.das_max : null;
  return dasMax !== null && dasMax <= EARLY_STAGE_DAS_CEILING;
}

function isVegetativeStageFromDB(crop: string, stage: string, das: number | null, cultivationMethod?: string | null): boolean {
  if (das !== null && das !== undefined) {
    return das > EARLY_STAGE_DAS_CEILING && das <= VEGETATIVE_STAGE_DAS_CEILING;
  }
  if (!crop || !stage) return false;
  const row = getStageRow(crop, stage, cultivationMethod);
  if (!row) return false;
  const dasMin = typeof row.das_min === 'number' ? row.das_min : null;
  const dasMax = typeof row.das_max === 'number' ? row.das_max : null;
  return (
    dasMin !== null &&
    dasMax !== null &&
    dasMin > EARLY_STAGE_DAS_CEILING &&
    dasMax <= VEGETATIVE_STAGE_DAS_CEILING
  );
}

/** Bucket observations by DB-derived failure class. */
function bucketObservationsByClass(observations: string[]): Map<FailureClassEnum, string[]> {
  const buckets = new Map<FailureClassEnum, string[]>();
  let miss = 0;
  for (const raw of observations) {
    if (!raw) continue;
    const fc = classifyFailureClass(raw);
    if (fc === 'UNKNOWN' && !classifyObservation(raw)) {
      miss++;
      continue;
    }
    const arr = buckets.get(fc) ?? [];
    arr.push(raw.toUpperCase());
    buckets.set(fc, arr);
  }
  if (miss > 0) {
    console.warn(`[OBS_CLASSIFICATION_MISS] failure-class-detector unresolved_tokens=${miss}`);
  }
  return buckets;
}

// CORE DETECTION FUNCTION — PR-2 DB-DRIVEN

const CLASS_CONFIDENCE_BASE: Record<FailureClass, number> = {
  ESTABLISHMENT_FAILURE: 0.85,
  WEED_COMPETITION: 0.82,
  PEST_DAMAGE: 0.80,
  DISEASE_SYMPTOM: 0.78,
  NUTRIENT_DEFICIENCY: 0.75,
  VEGETATIVE_STRESS: 0.70,
  UNKNOWN: 0.40,
};

const CLASS_CONFIDENCE_STEP: Record<FailureClass, number> = {
  ESTABLISHMENT_FAILURE: 0.05,
  WEED_COMPETITION: 0.04,
  PEST_DAMAGE: 0.04,
  DISEASE_SYMPTOM: 0.04,
  NUTRIENT_DEFICIENCY: 0.04,
  VEGETATIVE_STRESS: 0.05,
  UNKNOWN: 0.0,
};

// Priority when multiple classes match — mirrors the legacy STEP ordering
// (Establishment > Weed > Pest > Disease > Nutrient > Stress).
const CLASS_PRIORITY: FailureClass[] = [
  'ESTABLISHMENT_FAILURE',
  'WEED_COMPETITION',
  'PEST_DAMAGE',
  'DISEASE_SYMPTOM',
  'NUTRIENT_DEFICIENCY',
  'VEGETATIVE_STRESS',
];

// Detect primary failure class from canonical observations — DB-driven.
export function detectPrimaryFailureClass(input: FailureClassInput): FailureClassResult {
  const { crop_code, growth_stage, days_since_sowing, observations, symptoms, symptom_scope } = input;

  const safeObservations = Array.isArray(observations) ? observations : [];
  const safeSymptoms = Array.isArray(symptoms) ? symptoms : [];
  const safeScope: FailureClassInput['symptom_scope'] = symptom_scope || 'UNKNOWN';
  const normalizedStage = (growth_stage || 'UNKNOWN').toUpperCase();

  const allObservations = [...safeObservations, ...safeSymptoms];

  console.log(`🔍 [FailureClass v${FAILURE_CLASS_VERSION}] Detecting for ${crop_code}/${normalizedStage}, DAS: ${days_since_sowing}`);
  console.log(`   Observations: [${allObservations.slice(0, 5).join(', ')}${allObservations.length > 5 ? '...' : ''}]`);

  const buckets = bucketObservationsByClass(allObservations);

  const isEarlyStage = isEarlyStageFromDB(crop_code, growth_stage, days_since_sowing);
  const isVegetativeStage = isVegetativeStageFromDB(crop_code, growth_stage, days_since_sowing);
  const isWholePlant = safeScope === 'WHOLE_PLANT';

  // STEP 1 — ESTABLISHMENT priority when early + (matches OR whole-plant)
  const establishmentMatches = buckets.get('ESTABLISHMENT_FAILURE') ?? [];
  if (isEarlyStage && (establishmentMatches.length > 0 || isWholePlant)) {
    const conf = CLASS_CONFIDENCE_BASE.ESTABLISHMENT_FAILURE +
      establishmentMatches.length * CLASS_CONFIDENCE_STEP.ESTABLISHMENT_FAILURE;
    console.log(`   ✅ ESTABLISHMENT_FAILURE (early stage + ${establishmentMatches.length} obs)`);
    return {
      primary_class: 'ESTABLISHMENT_FAILURE',
      confidence: Math.min(conf, 0.98),
      matched_observations: establishmentMatches,
      reasoning: `Early stage (${normalizedStage}, DAS: ${days_since_sowing}) with establishment observations`,
      stage_compatible: true,
      derived_from: establishmentMatches.length > 0 ? 'OBSERVATIONS' : 'STAGE',
    };
  }

  // STEP 2..5 — walk the DB-driven buckets by priority
  for (const fc of CLASS_PRIORITY) {
    if (fc === 'ESTABLISHMENT_FAILURE') continue; // handled above
    const matches = buckets.get(fc) ?? [];
    if (matches.length === 0) continue;
    const conf = CLASS_CONFIDENCE_BASE[fc] + matches.length * CLASS_CONFIDENCE_STEP[fc];
    console.log(`   ✅ ${fc} (${matches.length} obs)`);
    return {
      primary_class: fc,
      confidence: Math.min(conf, 0.98),
      matched_observations: matches,
      reasoning: `${fc} observations detected: ${matches.slice(0, 3).join(', ')}`,
      stage_compatible: true,
      derived_from: 'OBSERVATIONS',
    };
  }

  // STEP 6 — Vegetative stage fallback (no observation matches)
  if (isVegetativeStage) {
    console.log(`   ✅ VEGETATIVE_STRESS (DB-derived vegetative stage, no obs match)`);
    return {
      primary_class: 'VEGETATIVE_STRESS',
      confidence: CLASS_CONFIDENCE_BASE.VEGETATIVE_STRESS,
      matched_observations: [],
      reasoning: `Vegetative stage (${normalizedStage}) with no specific observations`,
      stage_compatible: true,
      derived_from: 'STAGE',
    };
  }

  console.log(`   ⚠️ Could not determine specific failure class - using UNKNOWN`);
  return {
    primary_class: 'UNKNOWN',
    confidence: CLASS_CONFIDENCE_BASE.UNKNOWN,
    matched_observations: [],
    reasoning: 'No DB-classified failure indicators found',
    stage_compatible: true,
    derived_from: 'DEFAULT',
  };
}


// CLARIFICATION DOMAIN MAPPING

export interface ClarificationDomain {
  name: string;
  allowed_symptom_scopes: ('WHOLE_PLANT' | 'STEM' | 'LEAF' | 'ROOT' | 'FRUIT')[];
  canonical_groups: string[];
  excluded_observations: string[];
}

const CLARIFICATION_DOMAINS: Record<FailureClass, ClarificationDomain> = {
  ESTABLISHMENT_FAILURE: {
    name: 'ESTABLISHMENT',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'ROOT', 'STEM'],
    canonical_groups: ['establishment', 'germination', 'root'],
    excluded_observations: ['LEAF_CURL', 'FRUIT_DROP']
  },
  VEGETATIVE_STRESS: {
    name: 'VEGETATIVE',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF', 'STEM'],
    canonical_groups: ['stress', 'vegetative', 'growth'],
    excluded_observations: ['FLOWER_DROP', 'FRUIT_ROT']
  },
  PEST_DAMAGE: {
    name: 'PEST',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF', 'STEM', 'ROOT', 'FRUIT'],
    canonical_groups: ['pest', 'insect', 'damage'],
    excluded_observations: []
  },
  DISEASE_SYMPTOM: {
    name: 'DISEASE',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF', 'STEM', 'ROOT', 'FRUIT'],
    canonical_groups: ['disease', 'fungal', 'bacterial', 'viral'],
    excluded_observations: []
  },
  NUTRIENT_DEFICIENCY: {
    name: 'NUTRIENT',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF'],
    canonical_groups: ['nutrient', 'deficiency'],
    excluded_observations: ['INSECT_HOLES', 'PEST_FRASS']
  },
  WEED_COMPETITION: {
    name: 'WEED',
    allowed_symptom_scopes: ['WHOLE_PLANT'],
    canonical_groups: ['weed', '06_weed'],
    excluded_observations: ['DEAD_HEART', 'INSECT_VISIBLE']
  },
  UNKNOWN: {
    name: 'GENERAL',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF', 'STEM', 'ROOT', 'FRUIT'],
    canonical_groups: ['general'],
    excluded_observations: []
  }
};

// Get clarification domain for a failure class
export function getClarificationDomain(failureClass: FailureClass): ClarificationDomain {
  return CLARIFICATION_DOMAINS[failureClass] || CLARIFICATION_DOMAINS.UNKNOWN;
}

// Get failure class confidence thresholds
export function getFailureClassThresholds(): Record<FailureClass, number> {
  return {
    ESTABLISHMENT_FAILURE: 0.80,
    WEED_COMPETITION: 0.78,
    PEST_DAMAGE: 0.75,
    DISEASE_SYMPTOM: 0.70,
    NUTRIENT_DEFICIENCY: 0.65,
    VEGETATIVE_STRESS: 0.60,
    UNKNOWN: 0.40
  };
}

// STAGE COMPATIBILITY CHECK - CANONICAL VERSION

// Check if an observation is stage-compatible — DB-driven.
export function isObservationStageCompatible(
  observationKey: string,
  stage: string,
  crop?: string
): boolean {
  if (!observationKey || !stage) return true;

  // (1) DB-declared applies_to_stages
  if (!observationAppliesToStage(observationKey, stage)) return false;

  // (2) Establishment-class ↔ early stage window
  const classification = classifyObservation(observationKey);
  if (!classification) return true; // unknown → don't block

  if (classification.failure_class === 'ESTABLISHMENT_FAILURE') {
    const early = isEarlyStageFromDB(crop ?? '', stage, null);
    if (!early) return false;
  }
  return true;
}


// FALLBACK OPTIONS FOR CLARIFICATION — DB-ONLY (v4-P4)

export interface FallbackOption {
  observation_key: string;
  label: string;
  category: string;
}

// PATCH v4-P4 — Hardcoded per-failure-class observation lists have been
export function getFailureClassFallbackOptions(
  failureClass: FailureClass,
  _language: string = 'en'
): FallbackOption[] {
  void failureClass;
  return [];
}


// AUDIT LOGGING

export function createFailureClassAudit(
  traceId: string,
  input: FailureClassInput,
  result: FailureClassResult
): FailureClassAuditLog {
  return {
    trace_id: traceId,
    timestamp: Date.now(),
    input,
    result,
    clarification_domain: getClarificationDomain(result.primary_class).name,
    fallback_used: result.derived_from === 'DEFAULT',
    fallback_reason: result.derived_from === 'DEFAULT' 
      ? 'No canonical observations matched any failure class'
      : null
  };
}

// Log failure class detection for debugging and audit purposes.
export function logFailureClassDetection(
  traceId: string,
  input: FailureClassInput,
  result: FailureClassResult,
  domainName: string,
  fallbackUsed: boolean,
  fallbackReason: string | null
): void {
  console.log(`📊 [FailureClass ${traceId}] Detection complete:`);
  console.log(`   Primary: ${result.primary_class} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
  console.log(`   Domain: ${domainName}`);
  console.log(`   Matched observations: ${result.matched_observations.join(', ') || 'none'}`);
  console.log(`   Derived from: ${result.derived_from}`);
  
  if (fallbackUsed) {
    console.warn(`   ⚠️ Fallback used: ${fallbackReason || 'unknown reason'}`);
  }
}

// EXPORTS

export default {
  detectPrimaryFailureClass,
  getClarificationDomain,
  getFailureClassThresholds,
  createFailureClassAudit,
  isObservationStageCompatible,
  getFailureClassFallbackOptions,
  logFailureClassDetection,
  FAILURE_CLASS_VERSION
};

/**
 * CHANGE LOG
 * 2026-07-29 10:55 UTC — FIX C1-b: calculateStageRelevance forwards cultivationMethod to calculateStageRelevanceScore.
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG
 * 2026-07-11 UTC — v4-P2: generic dotted-path predicate resolver.
 *   `evaluatePartialConditionMatch` now honours `conditions_json.canonical`,
 *   a DB-authored map of `path → predicate` (eq/in/gt/gte/lt/lte/present/ne).
 *   Paths walk the frozen `canonical_context` (soil.moisture_status,
 *   weather.rainfall_after_sowing_mm, biological_state.biological_constraints,
 *   crop_schedule.transplant_date, etc.). No agronomy in TS.
 * 2026-07-11 UTC — Additive: HypothesisEvaluationInput accepts optional
 *   `canonical_context` (frozen CanonicalContext v2.1.0). Forwarded verbatim
 *   from runGraphRuntime; DB rule predicates that reference field-twin fields
 *   (soil moisture, weather forecast, transplant_date, irrigation_type,
 *   biological_state) can now resolve. No agronomic logic change.
 * 2026-07-09 19:38 UTC — Type-shape repair only. Existing i18n metadata fields
 * are declared and observable-characteristic normalization is explicitly typed.
 * ═══════════════════════════════════════════════════════════════════════════
 * HYPOTHESIS-FIRST CLARIFICATION EVALUATOR (v1.2.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Pre-evaluate symbolic rules to build candidate hypothesis set BEFORE
 * generating clarification options. This ensures clarifications are
 * sourced strictly from stage-scoped symbolic rule hypotheses.
 * 
 * CONSTRAINTS:
 * - Do not change symbolic rule definitions
 * - Do not add new database tables or schemas
 * - Do not introduce new AI reasoning or LLM diagnosis
 * - Do not alter treatment logic or confidence thresholds
 * - Use only existing rule metadata (conditions_json, observable_characteristics)
 * 
 * STEP 1: Load rules filtered by crop_code, stage_applicable, canonical_group
 * STEP 2: Filter by temporal constraints (crop_age_days_min/max)
 * STEP 3: Evaluate using partial condition matching only
 * STEP 4: Produce max 4 candidate hypotheses ranked by relevance
 * 
 * PHASE-17 UPDATE: Added temporal constraint filtering
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Supabase client is passed via input, no import needed

export const HYPOTHESIS_EVALUATOR_VERSION = '1.2.0'; // Added temporal constraint filtering

// PHASE-17: TEMPORAL CONSTRAINT VALIDATOR IMPORT
import {
  validateCropAge,
  filterRulesByAge,
  logTemporalValidation,
  logTemporalFilteringSummary,
  type TemporalValidationInput
} from './temporal-constraint-validator.ts';
import { assertFarmerObservable } from '../runtime/farmer-observable-gate.ts';

// TYPE DEFINITIONS

// Step 3 — Hypothesis contract tightening.
import type { GraphTruth } from '../runtime/graph-truth.ts';
import { assertGraphTruthIntegrity } from '../runtime/graph-truth.ts';

export interface HypothesisEvaluationInput {
  // Frozen GraphTruth for the turn. When present it OVERRIDES every mutable
  graph_truth?: GraphTruth | null;

  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  ndvi_level?: string;  // LOW, MEDIUM, HIGH
  ndvi_trend?: string;  // IMPROVING, STABLE, DECLINING
  weather?: {
    temp?: number;
    humidity?: number;
    rain_mm?: number;
  };
  known_observations: string[];
  user_query: string;
  supabaseClient: any;
  trace_id?: string;
  // Phase F — variety-aware resistance modulation. Optional; when present,
  // candidate scores get a bounded resistance multiplier from `variety_resistance`.
  variety_id?: string | null;
  // v2.1.0 — optional frozen CanonicalContext. Forwarded by runGraphRuntime
  // so downstream predicates can read the field-twin. No agronomic logic here.
  canonical_context?: unknown;
}


export type VarietyResistanceLevel = 'HR' | 'R' | 'MR' | 'MS' | 'S';

export interface CandidateHypothesisResistance {
  level: VarietyResistanceLevel;
  match_kind: 'observation_code' | 'threat_type' | 'threat_name';
  matched_value: string;
  multiplier: number;              // bounded [0.6, 1.15]
  source: 'variety_resistance';
  variety_id: string;
}

export interface CandidateHypothesis {
  rule_id: string;
  cause: string;
  canonical_group: string;
  priority: number;
  stage_relevance_score: number;
  partial_match_score: number;
  total_score: number;
  observable_characteristics: ObservableCharacteristic[];
  differentiating_questions: any[];
  matched_conditions: string[];
  conditions_json: any;
  /** Phase F — resistance adjustment applied to total_score, if any. */
  resistance?: CandidateHypothesisResistance;
}

export interface ObservableCharacteristic {
  id: string;
  observation_key: string;
  label_en?: string;
  label_hi?: string;
  label_mr?: string;
  confidence_boost?: number;
  is_visual?: boolean;
  diagnostic_power?: 'HIGH' | 'MEDIUM' | 'LOW'; // GAP #2: Evidence-weighted boost
}

export interface HypothesisEvaluationOutput {
  candidates: CandidateHypothesis[];
  total_rules_evaluated: number;
  rules_after_temporal_filter?: number;  // PHASE-17: Count after temporal filtering
  stage_locked: string;
  evaluation_method: 'PARTIAL_MATCH';
  timestamp: number;
  trace_id: string;
}

// (Phase 1 DB-SSOT) HYPOTHESIS_CANONICAL_GROUPS removed — the hardcoded list

// PHASE F — VARIETY RESISTANCE MODULATION

const RESISTANCE_MULTIPLIER: Record<VarietyResistanceLevel, number> = {
  HR: 0.60,   // highly resistant → strong down-rank
  R:  0.75,
  MR: 0.90,
  MS: 1.05,
  S:  1.15,   // susceptible → mild up-rank
};

interface VarietyResistanceRow {
  threat_type: string | null;
  observation_code: string | null;
  canonical_observation_code: string | null;
  threat_name: string | null;
  resistance_level: string | null;
}

function normalizeKey(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

async function loadVarietyResistance(
  supabaseClient: any,
  varietyId: string | null | undefined
): Promise<VarietyResistanceRow[]> {
  if (!varietyId) return [];
  try {
    const { data, error } = await supabaseClient
      .from('variety_resistance')
      .select('threat_type, observation_code, canonical_observation_code, threat_name, resistance_level')
      .eq('variety_id', varietyId);
    if (error) {
      console.warn(`   ⚠️ [VarietyResistance] load failed: ${error.message}`);
      return [];
    }
    return (data as VarietyResistanceRow[]) || [];
  } catch (e) {
    console.warn(`   ⚠️ [VarietyResistance] exception: ${(e as Error).message}`);
    return [];
  }
}

function findResistanceForCandidate(
  candidate: CandidateHypothesis,
  rows: VarietyResistanceRow[],
  varietyId: string
): CandidateHypothesisResistance | null {
  if (!rows.length) return null;

  const obsKeys = new Set(
    candidate.observable_characteristics
      .map(c => normalizeKey(c.observation_key))
      .filter(Boolean)
  );
  const canonicalGroup = normalizeKey(candidate.canonical_group);
  const causeNorm = normalizeKey(candidate.cause);

  // 1. Match by observation_code / canonical_observation_code (strongest signal)
  for (const row of rows) {
    const codes = [row.observation_code, row.canonical_observation_code]
      .map(normalizeKey)
      .filter(Boolean);
    for (const code of codes) {
      if (obsKeys.has(code)) {
        const lvl = normalizeKey(row.resistance_level) as VarietyResistanceLevel;
        if (RESISTANCE_MULTIPLIER[lvl] !== undefined) {
          return {
            level: lvl,
            match_kind: 'observation_code',
            matched_value: code,
            multiplier: RESISTANCE_MULTIPLIER[lvl],
            source: 'variety_resistance',
            variety_id: varietyId,
          };
        }
      }
    }
  }

  // 2. Fallback: match by threat_type against canonical_group
  for (const row of rows) {
    const tt = normalizeKey(row.threat_type);
    if (tt && (tt === canonicalGroup || canonicalGroup.includes(tt) || tt.includes(canonicalGroup))) {
      const lvl = normalizeKey(row.resistance_level) as VarietyResistanceLevel;
      if (RESISTANCE_MULTIPLIER[lvl] !== undefined) {
        return {
          level: lvl,
          match_kind: 'threat_type',
          matched_value: tt,
          multiplier: RESISTANCE_MULTIPLIER[lvl],
          source: 'variety_resistance',
          variety_id: varietyId,
        };
      }
    }
  }

  // 3. Last resort: threat_name substring in cause (curated names, e.g. "SHOOT_BORER")
  for (const row of rows) {
    const tn = normalizeKey(row.threat_name);
    if (tn && tn.length >= 4 && causeNorm.includes(tn)) {
      const lvl = normalizeKey(row.resistance_level) as VarietyResistanceLevel;
      if (RESISTANCE_MULTIPLIER[lvl] !== undefined) {
        return {
          level: lvl,
          match_kind: 'threat_name',
          matched_value: tn,
          multiplier: RESISTANCE_MULTIPLIER[lvl],
          source: 'variety_resistance',
          variety_id: varietyId,
        };
      }
    }
  }

  return null;
}



// STAGE COMPATIBILITY PATTERNS

// Import centralized stage normalizer
import { 
  normalizeStageForDB, 
  getStageCategory, 
  calculateStageRelevanceScore,
  getStageQueryVariants,
  type StageCategory 
} from '../utils/stage-normalizer.ts';

// CAUSE NORMALIZATION FOR DEDUPLICATION

function normalizeCauseForDedup(cause: string): string {
  if (!cause) return 'unknown';
  
  let normalized = cause
    // Remove parenthetical scientific names: "(Chilo infuscatellus)"
    .replace(/\([^)]*\)/g, '')
    // Remove common suffixes
    .replace(/infestation/gi, '')
    .replace(/attack/gi, '')
    .replace(/damage/gi, '')
    .replace(/suspect/gi, '')
    .replace(/_suspect$/gi, '')
    // Remove stage-specific suffixes: "_tillering", "_germination", "_seedling"
    .replace(/_?(germination|tillering|seedling|grand_growth|maturity|establishment|vegetative)$/gi, '')
    // Normalize whitespace and separators
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  
  // Apply pattern-based normalization for known variations
  const patterns: [RegExp, string][] = [
    // PEST patterns (existing)
    [/early\s*shoot\s*borer/i, 'early shoot borer'],
    [/shoot\s*borer/i, 'shoot borer'],
    [/stem\s*borer/i, 'stem borer'],
    [/top\s*borer/i, 'top borer'],
    [/internode\s*borer/i, 'internode borer'],
    [/root\s*borer/i, 'root borer'],
    [/white\s*grub/i, 'white grub'],
    [/root\s*grub/i, 'root grub'],
    [/termite/i, 'termite'],
    [/aphid/i, 'aphid'],
    [/whitefly/i, 'whitefly'],
    [/thrips/i, 'thrips'],
    [/mealybug/i, 'mealybug'],
    [/red\s*rot/i, 'red rot'],
    [/smut/i, 'smut'],
    [/wilt/i, 'wilt'],
    [/rust/i, 'rust'],
    
    // FORENSIC AUDIT FIX v8.0: NUTRIENT dedup patterns
    [/nitrogen/i, 'nitrogen deficiency'],
    [/phosphorus|phospho/i, 'phosphorus deficiency'],
    [/potassium|potash/i, 'potassium deficiency'],
    [/micronutrient/i, 'micronutrient deficiency'],
    [/iron\s*(deficiency|chlorosis)?/i, 'iron deficiency'],
    [/zinc\s*(deficiency)?/i, 'zinc deficiency'],
    [/boron\s*(deficiency)?/i, 'boron deficiency'],
    [/manganese\s*(deficiency)?/i, 'manganese deficiency'],
    [/sulphur|sulfur/i, 'sulphur deficiency'],
    [/nutrient\s*deficiency/i, 'nutrient deficiency'],
    // REMOVED: Over-broad yellowing|chlorosis pattern that collapsed ALL nutrient
    
    // DISEASE dedup patterns
    [/leaf\s*spot/i, 'leaf spot'],
    [/blight/i, 'blight'],
    [/mosaic/i, 'mosaic virus'],
    [/grassy\s*shoot/i, 'grassy shoot'],
    [/pokkah\s*boeng/i, 'pokkah boeng'],
  ];
  
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(normalized)) {
      return replacement;
    }
  }
  
  return normalized;
}

// PARTIAL CONDITION MATCHING

// PATCH v4-P2 — Generic dotted-path getter for canonical_context predicates.
export function resolvePath(root: unknown, path: string): unknown {
  if (root === null || root === undefined || typeof path !== 'string' || path.length === 0) {
    return undefined;
  }
  const parts = path.split('.').filter((p) => p.length > 0);
  let cur: any = root;
  for (const seg of parts) {
    if (cur === null || cur === undefined) return undefined;
    const idx = /^\d+$/.test(seg) ? Number(seg) : seg;
    cur = cur[idx as any];
  }
  return cur;
}

// PATCH v4-P2 — Compare a resolved value against a predicate literal.
export function comparePredicate(actual: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) return actual === expected;
  if (typeof expected !== 'object') {
    if (typeof actual === 'string' && typeof expected === 'string') {
      return actual.toLowerCase() === expected.toLowerCase();
    }
    return actual === expected;
  }
  const e = expected as Record<string, unknown>;
  if ('present' in e) return (actual !== undefined && actual !== null) === !!e.present;
  if ('eq' in e) return comparePredicate(actual, e.eq);
  if ('ne' in e) return !comparePredicate(actual, e.ne);
  if ('in' in e && Array.isArray(e.in)) return e.in.some((v) => comparePredicate(actual, v));
  const n = typeof actual === 'number' ? actual : Number(actual);
  if (Number.isFinite(n)) {
    if ('gt'  in e && !(n >  Number(e.gt)))  return false;
    if ('gte' in e && !(n >= Number(e.gte))) return false;
    if ('lt'  in e && !(n <  Number(e.lt)))  return false;
    if ('lte' in e && !(n <= Number(e.lte))) return false;
    return true;
  }
  return false;
}

function evaluatePartialConditionMatch(
  conditionsJson: any,
  input: HypothesisEvaluationInput
): { score: number; matchedConditions: string[] } {
  if (!conditionsJson || Object.keys(conditionsJson).length === 0) {
    return { score: 0.3, matchedConditions: [] }; // Base score for no conditions
  }
  
  const matchedConditions: string[] = [];
  let totalConditions = 0;
  let matchedCount = 0;
  
  // Check crop_stage match
  if (conditionsJson.crop_stage && Array.isArray(conditionsJson.crop_stage)) {
    totalConditions++;
    const stageMatch = conditionsJson.crop_stage.some((s: string) => {
      const normalized = s.toUpperCase();
      return normalized === input.growth_stage.toUpperCase() ||
             normalized === '*' || normalized === 'ALL' ||
             input.growth_stage.toUpperCase().includes(normalized);
    });
    if (stageMatch) {
      matchedCount++;
      matchedConditions.push('crop_stage');
    }
  }
  
  // Check observations match
  if (conditionsJson.observations && Array.isArray(conditionsJson.observations)) {
    totalConditions++;
    const obsMatch = conditionsJson.observations.some((obs: string) => {
      const obsLower = obs.toLowerCase();
      return input.known_observations.some(known => 
        known.toLowerCase().includes(obsLower) || obsLower.includes(known.toLowerCase())
      );
    });
    if (obsMatch) {
      matchedCount++;
      matchedConditions.push('observations');
    }
  }
  
  // SSOT: trigger_keywords column was DROPPED per architecture audit
  // No keyword matching - conditions_json.observations is the sole source
  
  // Check NDVI conditions if available
  if (conditionsJson.ndvi_level && input.ndvi_level) {
    totalConditions++;
    if (conditionsJson.ndvi_level.toLowerCase() === input.ndvi_level.toLowerCase()) {
      matchedCount++;
      matchedConditions.push('ndvi_level');
    }
  }

  // ─── PATCH v4-P2 — canonical_context.* dotted-path predicates ─────────
  const canonicalPreds = conditionsJson.canonical && typeof conditionsJson.canonical === 'object'
    ? (conditionsJson.canonical as Record<string, unknown>)
    : null;
  if (canonicalPreds && input.canonical_context) {
    for (const [path, expected] of Object.entries(canonicalPreds)) {
      totalConditions++;
      const actual = resolvePath(input.canonical_context, path);
      if (comparePredicate(actual, expected)) {
        matchedCount++;
        matchedConditions.push(`canonical:${path}`);
      }
    }
  }

  // Calculate score (0-1)
  const score = totalConditions > 0 ? matchedCount / (totalConditions + 1) : 0.3;
  
  return { score: Math.min(1, score), matchedConditions };
}

// STAGE RELEVANCE SCORING

function calculateStageRelevance(
  stageApplicable: string[] | null,
  currentStage: string,
  crop?: string | null,
  cultivationMethod?: string | null,
): number {
  // Delegate to centralized normalizer (DB stage graph authority).
  // FIX C1-b: lane forwarded; omitted → request-scoped lane (ALS).
  return calculateStageRelevanceScore(stageApplicable, currentStage, crop, cultivationMethod);
}

// EXTRACT OBSERVABLE CHARACTERISTICS

// P0 FIX: Observable Characteristics Array Normalizer
function extractObservableCharacteristics(raw: any, obsMetadata?: Map<string, any>): ObservableCharacteristic[] {
  if (!raw) return [];
  
  // CRITICAL FIX: Handle edge cases where observable_characteristics is {} or invalid
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    // It's an object - check if it has valid keys
    const keys = Object.keys(raw);
    if (keys.length === 0) {
      console.log('   [ExtractObs] Skipping empty object {}');
      return [];
    }
    
    // CASE 1: Object with observation_key field → treat as single item
    if (raw.observation_key) {
      raw = [raw];
    }
    // CASE 2: Legacy format {symptom_name: true, another_symptom: true}
    else if (keys.some(k => typeof raw[k] === 'boolean')) {
      console.log(`   [ExtractObs] Converting legacy boolean object format with ${keys.length} keys: ${keys.slice(0, 5).join(', ')}`);
      // Convert {dead_heart: true, stem_hollow: true} → ["DEAD_HEART", "STEM_HOLLOW"]
      raw = keys
        .filter(k => raw[k] === true)
        .map(k => k.toUpperCase().replace(/[\s-]/g, '_'))
        .filter(k => k.length <= 30); // Reject overly long synthetic keys from boolean conversion
      console.log(`   [ExtractObs] Converted to array: [${raw.slice(0, 3).join(', ')}${raw.length > 3 ? '...' : ''}]`);
    }
    // CASE 2.5: Object with nested 'symptoms' array: {symptoms: ["INTERVEINAL_CHLOROSIS", "LEAF_YELLOWING"]}
    else if (Array.isArray(raw.symptoms)) {
      console.log(`   [ExtractObs] Extracting from nested {symptoms: [...]} with ${raw.symptoms.length} items`);
      raw = raw.symptoms.map((s: any) => typeof s === 'string' ? s.toUpperCase().replace(/[\s-]/g, '_') : s);
    }
    // CASE 2.6: Object with nested 'observations' array: {observations: [...]}
    else if (Array.isArray(raw.observations)) {
      console.log(`   [ExtractObs] Extracting from nested {observations: [...]} with ${raw.observations.length} items`);
      raw = raw.observations.map((s: any) => typeof s === 'string' ? s.toUpperCase().replace(/[\s-]/g, '_') : s);
    }
    // CASE 3: Unknown object structure, skip
    else {
      console.log('   [ExtractObs] Skipping unknown object structure:', keys.slice(0, 3));
      return [];
    }
  }
  
  const charArray = Array.isArray(raw) ? raw : [raw];
  
  // P0 FIX: Diagnostic power registry for evidence-weighted confidence boosts
  // Moved inline to avoid circular deps, aligned with diagnostic-weight-registry.ts
  const getDiagnosticPower = (key: string): 'HIGH' | 'MEDIUM' | 'LOW' => {
    const normalized = key.toUpperCase().replace(/[\s-]/g, '_');
    
    // PRIORITY 1: Use observation_master columns from database
    if (obsMetadata && obsMetadata.size > 0) {
      const meta = obsMetadata.get(normalized) || obsMetadata.get(key);
      if (meta) {
        // Use discriminator_score (0-100) from observation_master
        const discScore = meta.discriminator_score ?? 50;
        if (discScore >= 75 || meta.is_diagnostic === true || meta.observation_type === 'PRIMARY') return 'HIGH';
        if (discScore >= 40 || meta.observation_type === 'SECONDARY') return 'MEDIUM';
        return 'LOW';
      }
    }
    
    // FALLBACK: Hardcoded pathognomonic indicators
    const HIGH_POWER = [
      'DEAD_HEART', 'DEADHEART', 'DEAD_HEART_PRESENT',
      'TUNNELS_IN_STEM', 'TUNNELING', 'BORE_HOLE',
      'FRASS', 'FRASS_VISIBLE', 'FRASS_NEAR_BASE',
      'MUD_TUNNELS', 'TERMITE_MUD_TUBES', 'MUD_GALLERIES',
      'HONEYDEW', 'SOOTY_MOLD',
      'PINK_LARVAE', 'LARVAE_PRESENT', 'LARVAE_VISIBLE',
      'WHITE_POWDER', 'WOOLLY_MASS', 'COTTONY_MASS'
    ];
    const LOW_POWER = [
      'YELLOWING', 'LEAF_YELLOWING', 'GENERAL_YELLOWING',
      'WILTING', 'LEAF_WILTING', 'PLANT_WILTING',
      'STUNTED', 'STUNTED_GROWTH', 'POOR_GROWTH',
      'DRYING', 'LEAF_DRYING', 'TIP_DRYING',
      'BROWNING', 'LEAF_BROWNING', 'EDGE_BROWNING',
      'GAPS', 'PATCHY_DAMAGE', 'GAPS_IN_FIELD'
    ];
    if (HIGH_POWER.some(p => normalized.includes(p))) return 'HIGH';
    if (LOW_POWER.some(p => normalized.includes(p))) return 'LOW';
    return 'MEDIUM';
  };
  
  // P0 FIX: Evidence-weighted confidence boosts (GAP #2)
  const getBoostForPower = (power: 'HIGH' | 'MEDIUM' | 'LOW'): number => {
    if (power === 'HIGH') return 0.25;  // +25% for pathognomonic symptoms
    if (power === 'MEDIUM') return 0.12; // +12% for suggestive symptoms
    return 0.05; // +5% for non-specific symptoms
  };
  
  // P0 FIX: Normalize string keys to canonical ObservationKey format
  const normalizeToObservationKey = (str: string): string => {
    // Convert snake_case, kebab-case, or spaces to UPPER_SNAKE_CASE
    return str.toUpperCase().replace(/[\s-]/g, '_');
  };
  
  return charArray.map((char: any, idx: number): ObservableCharacteristic | null => {
    // P0 FIX: Handle string keys (new array format from migration)
    if (typeof char === 'string') {
      const normalizedKey = normalizeToObservationKey(char);
      const power = getDiagnosticPower(normalizedKey);
      return {
        id: normalizedKey,
        observation_key: normalizedKey,
        label_en: char.replace(/_/g, ' ').toLowerCase(),
        is_visual: true,
        diagnostic_power: power,
        confidence_boost: getBoostForPower(power)
      };
    }
    
    // Handle object with observation_key
    if (char && typeof char === 'object' && char.observation_key) {
      const normalizedKey = normalizeToObservationKey(char.observation_key);
      const power = getDiagnosticPower(normalizedKey);
      return {
        id: char.id || normalizedKey || `obs_${idx}`,
        observation_key: normalizedKey,
        label_en: char.label_en || char.label || char.observation_key.replace(/_/g, ' ').toLowerCase(),
        label_hi: char.label_hi,
        label_mr: char.label_mr,
        diagnostic_power: power,
        confidence_boost: getBoostForPower(power),
        is_visual: char.is_visual !== false
      };
    }
    
    // Skip invalid entries
    return null;
  }).filter((c): c is ObservableCharacteristic => c !== null && !!c.observation_key);
}

// MAIN HYPOTHESIS EVALUATION FUNCTION

// Pre-evaluate symbolic rules to build candidate hypothesis set.
// CROP CODE NORMALIZER - Maps between full names and DB short codes
function getCropCodeVariantsForDB(cropCode: string): string[] {
  if (!cropCode) return ['all', 'ALL'];
  
  const normalized = cropCode.toUpperCase().trim();
  
  // Mapping from full names to DB short codes
  const DB_CROP_MAP: Record<string, string> = {
    'SUGARCANE': 'SC',
    'COTTON': 'CTN',
    'SOYBEAN': 'SOY',
    'RICE': 'RICE',
    'PADDY': 'RICE',
    'WHEAT': 'WHT',
    'MAIZE': 'MZ',
    'CORN': 'MZ',
    'TOMATO': 'TOM',
    'ONION': 'ONI',
    'CHILLI': 'CHI',
    'GROUNDNUT': 'GN',
    'BANANA': 'BAN',
    'GRAPE': 'GRP',
    'POMEGRANATE': 'POM',
    // Pass-through for short codes
    'SC': 'SC',
    'CTN': 'CTN',
    'SOY': 'SOY',
    'MZ': 'MZ',
    'WHT': 'WHT',
  };
  
  // Reverse mapping
  const REVERSE_MAP: Record<string, string> = {
    'SC': 'SUGARCANE',
    'CTN': 'COTTON',
    'SOY': 'SOYBEAN',
    'MZ': 'MAIZE',
    'WHT': 'WHEAT',
  };
  
  const dbCode = DB_CROP_MAP[normalized] || normalized;
  const fullCode = REVERSE_MAP[normalized] || REVERSE_MAP[dbCode] || normalized;
  
  // Return all possible variants for flexible matching
  const variants = new Set<string>([
    normalized.toLowerCase(),
    dbCode.toLowerCase(),
    fullCode.toLowerCase(),
    'all'
  ]);
  
  return Array.from(variants);
}

export async function evaluateCandidateHypotheses(
  input: HypothesisEvaluationInput
): Promise<HypothesisEvaluationOutput> {
  const traceId = input.trace_id || `hyp_${Date.now()}`;

  // Step 3 — HYPOTHESIS CONTRACT: GraphTruth is the sole authority.
  const gt = input.graph_truth ?? null;
  if (gt) {
    assertGraphTruthIntegrity(gt, 'EVALUATE_CANDIDATE_HYPOTHESES');

    const drift: string[] = [];
    if (gt.crop_code && input.crop_code && gt.crop_code.toLowerCase() !== input.crop_code.toLowerCase()) {
      drift.push(`crop_code(pipe=${input.crop_code} graph=${gt.crop_code})`);
    }
    if (gt.biological_stage && input.growth_stage && gt.biological_stage.toLowerCase() !== input.growth_stage.toLowerCase()) {
      drift.push(`stage(pipe=${input.growth_stage} graph=${gt.biological_stage})`);
    }
    if (gt.DAS != null && input.days_since_sowing != null && gt.DAS !== input.days_since_sowing) {
      drift.push(`das(pipe=${input.days_since_sowing} graph=${gt.DAS})`);
    }
    const pipeObs = [...(input.known_observations || [])].sort().join(',');
    const graphObs = [...gt.canonical_observations].sort().join(',');
    if (pipeObs !== graphObs) drift.push(`obs(pipe=[${pipeObs}] graph=[${graphObs}])`);
    if (gt.variety_id && input.variety_id && gt.variety_id !== input.variety_id) {
      drift.push(`variety(pipe=${input.variety_id} graph=${gt.variety_id})`);
    }
    if (drift.length) {
      console.warn(`[HYPOTHESIS_CONTRACT] site=EVALUATE trace=${traceId} drift=${drift.join(' ')} — using GraphTruth`);
    }

    // OVERRIDE — GraphTruth wins for the five authoritative fields.
    input = {
      ...input,
      crop_code:        (gt.crop_code ?? input.crop_code) as string,
      growth_stage:     (gt.biological_stage ?? input.growth_stage) as string,
      days_since_sowing: (gt.DAS ?? input.days_since_sowing) as number | null,
      known_observations: [...gt.canonical_observations],
      variety_id:       (gt.variety_id ?? input.variety_id ?? null),
    };
  } else {
    console.warn(`[HYPOTHESIS_CONTRACT] site=EVALUATE trace=${traceId} legacy_path — no graph_truth supplied by caller`);
  }

  const { crop_code, growth_stage, supabaseClient } = input;

  console.log(`🎯 [HypothesisEval v1.3] Pre-evaluating rules for ${crop_code}/${growth_stage}`);
  console.log(`   Known observations: ${input.known_observations.join(', ') || 'none'}`);
  console.log(`   NDVI: ${input.ndvi_level || 'unknown'} (${input.ndvi_trend || 'unknown'})`);
  console.log(`   DAS: ${input.days_since_sowing ?? 'unknown'}`);
  console.log(`   Authority: ${gt ? `GRAPH_TRUTH(hash=${gt.hash})` : 'LEGACY_PIPE'}`);


  
  try {
    // STEP 1: NORMALIZE CROP CODE AND STAGE FOR DB QUERY
    
    const cropVariants = getCropCodeVariantsForDB(crop_code);
    const stageVariants = getStageQueryVariants(growth_stage, crop_code);
    const dbStage = normalizeStageForDB(growth_stage);
    
    console.log(`   [HypothesisEval] Crop variants for query: [${cropVariants.join(', ')}]`);
    console.log(`   [HypothesisEval] Stage variants for query: [${stageVariants.slice(0, 5).join(', ')}...]`);
    console.log(`   [HypothesisEval] DB stage normalized: ${growth_stage} → ${dbStage}`);
    
    // STEP 1.5: BUILD DYNAMIC QUERY WITH CROP AND STAGE FILTERING
    
    // Build crop filter: match any of the crop variants
    const cropFilter = cropVariants.map(v => `crop_code.ilike.${v}`).join(',');
    
    // Query with both crop AND stage filtering for better precision
    const PAGE_SIZE = 1000;
    const rulesRaw: any[] = [];
    let error: any = null;
    for (let page = 0; page < 20; page++) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error: pageError } = await supabaseClient
        .from('decision_rules')
        .select(`
          rule_id,
          cause,
          canonical_group,
          category,
          action_type,
          priority,
          stage_applicable,
          conditions_json,
          observable_characteristics,
          differentiating_questions,
          action_text,
          crop_age_days_min,
          crop_age_days_max,
          required_observation_category,
          required_plant_part
        `)
        .eq('is_active', true)
        .or(cropFilter)
        .range(from, to);
      if (pageError) { error = pageError; break; }
      const batch = Array.isArray(data) ? data : [];
      rulesRaw.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    
    if (error) {
      console.error(`   ❌ [HypothesisEval] Database error:`, error);
      return {
        candidates: [],
        total_rules_evaluated: 0,
        stage_locked: growth_stage,
        evaluation_method: 'PARTIAL_MATCH',
        timestamp: Date.now(),
        trace_id: traceId
      };
    }
    
    if (!rulesRaw || rulesRaw.length === 0) {
      console.log(`   ⚠️ [HypothesisEval] No rules found for crop variants: [${cropVariants.join(', ')}]`);
      return {
        candidates: [],
        total_rules_evaluated: 0,
        stage_locked: growth_stage,
        evaluation_method: 'PARTIAL_MATCH',
        timestamp: Date.now(),
        trace_id: traceId
      };
    }
    
    console.log(`   📦 [HypothesisEval] Loaded ${rulesRaw.length} candidate rules from database`);
    console.log(`   📊 [Debug] First 3 rule crop_codes: ${rulesRaw.slice(0, 3).map((r: any) => r.cause).join(', ')}`);
    
    // STEP 1.6: FILTER BY STAGE_APPLICABLE (in-code filtering)
    const stageFilteredRules = rulesRaw.filter((rule: any) => {
      const stageApplicable = rule.stage_applicable;
      
      // No stage restriction = applies to all stages
      if (!stageApplicable || !Array.isArray(stageApplicable) || stageApplicable.length === 0) {
        return true;
      }
      
      // Check if any stage variant matches
      const stageApplicableLower = stageApplicable.map((s: string) => s.toLowerCase());
      return stageVariants.some(variant => 
        stageApplicableLower.includes(variant.toLowerCase()) ||
        stageApplicableLower.includes('all') ||
        stageApplicableLower.includes('*')
      );
    });
    
    console.log(`   🎯 [StageFilter] After stage filtering: ${stageFilteredRules.length}/${rulesRaw.length} rules`);
    
    // Graduated stage proximity fallback (never allow SEEDLING rules for DAS > 60)
    let rulesToEvaluate = stageFilteredRules;
    
    if (stageFilteredRules.length === 0) {
      console.log(`   ⚠️ [HypothesisEval] No rules match stage: ${growth_stage} — trying adjacent stages`);
      
      const STAGE_ORDER = ['SEEDLING', 'GERMINATION', 'TILLERING', 'GRAND_GROWTH', 'MATURITY', 'RIPENING', 'HARVEST'];
      const currentIdx = STAGE_ORDER.indexOf(growth_stage.toUpperCase());
      
      if (currentIdx >= 0) {
        // Get adjacent stages (±1 in phenology order)
        const adjacentStages = new Set<string>();
        if (currentIdx > 0) adjacentStages.add(STAGE_ORDER[currentIdx - 1]);
        if (currentIdx < STAGE_ORDER.length - 1) adjacentStages.add(STAGE_ORDER[currentIdx + 1]);
        
        const adjacentFiltered = rulesRaw.filter((rule: any) => {
          const sa = rule.stage_applicable;
          if (!sa || !Array.isArray(sa) || sa.length === 0) return true;
          return sa.some((s: string) => adjacentStages.has(s.toUpperCase()) || s === 'ALL' || s === '*');
        });
        
        if (adjacentFiltered.length > 0) {
          rulesToEvaluate = adjacentFiltered;
          console.log(`   🔄 [StageFallback] Using ${adjacentFiltered.length} adjacent-stage rules`);
        }
      }
      
      // Final fallback: use all rules BUT exclude early-stage rules for mature crops
      if (rulesToEvaluate.length === 0) {
        const das = input.days_since_sowing || 0;
        rulesToEvaluate = rulesRaw.filter((rule: any) => {
          if (das > 60) {
            const sa = rule.stage_applicable;
            if (Array.isArray(sa) && sa.some((s: string) => ['SEEDLING', 'GERMINATION'].includes(s.toUpperCase())) && sa.length <= 2) {
              return false; // Exclude SEEDLING-only rules for mature crops
            }
          }
          return true;
        });
        console.log(`   ⚠️ [StageFallback] Final fallback: ${rulesToEvaluate.length} rules (excluded early-stage for DAS ${das})`);
      }
    }
    
    // STEP 1.7: OBSERVATION LAYER PRE-FILTER (category + plant-part)
    let obsMetadataMap = new Map<string, any>();
    
    if (input.known_observations.length > 0) {
      try {
        // Load observation metadata
        const { data: obsMetaData } = await supabaseClient
          .from('observation_master')
          .select('observation_code, observation_category, affected_plant_part, canonical_group, is_diagnostic, observation_type, symptom_type, symptom_pattern, severity_level, discriminator_score, frequency_score, clarity_score')
          .in('observation_code', input.known_observations);
        
        if (obsMetaData && obsMetaData.length > 0) {
          for (const obs of obsMetaData) {
            obsMetadataMap.set(obs.observation_code, obs);
          }
          
          const obsCategories = new Set(obsMetaData.map((o: any) => o.observation_category).filter(Boolean));
          const obsPlantParts = new Set(obsMetaData.map((o: any) => o.affected_plant_part).filter(Boolean));
          
          console.log(`   🔬 [HypObsFilter] Categories: [${[...obsCategories].join(',')}], Parts: [${[...obsPlantParts].join(',')}]`);
          
          // P3: TIERED RULE-FILTER WIDENING — never collapse to zero.
          const obsCanonicalGroups = new Set<string>(
            obsMetaData.map((o: any) => o.canonical_group).filter(Boolean).map((g: string) => String(g).toUpperCase()),
          );

          const matchCat = (rule: any): boolean => {
            const reqCat = rule.required_observation_category;
            if (!reqCat || !Array.isArray(reqCat) || reqCat.length === 0) return true;
            return reqCat.some((cat: string) => obsCategories.has(cat));
          };
          const matchPart = (rule: any): boolean => {
            const reqPart = rule.required_plant_part;
            if (!reqPart || !Array.isArray(reqPart) || reqPart.length === 0) return true;
            return (
              obsPlantParts.has('WHOLE') ||
              reqPart.includes('WHOLE') ||
              reqPart.some((part: string) => obsPlantParts.has(part))
            );
          };
          const matchGroup = (rule: any): boolean => {
            const cg = rule.canonical_group;
            if (!cg || obsCanonicalGroups.size === 0) return true;
            return obsCanonicalGroups.has(String(cg).toUpperCase());
          };

          const beforeCount = rulesToEvaluate.length;
          const preWidenRules = rulesToEvaluate;
          const tiers: Array<{ tier: number; label: string; fn: (r: any) => boolean }> = [
            { tier: 0, label: 'CATEGORY+PART', fn: (r) => matchCat(r) && matchPart(r) },
            { tier: 1, label: 'CATEGORY_ONLY', fn: (r) => matchCat(r) },
            { tier: 2, label: 'PART_ONLY', fn: (r) => matchPart(r) },
            { tier: 3, label: 'CANONICAL_GROUP', fn: (r) => matchGroup(r) },
            { tier: 4, label: 'CROP_SCOPE', fn: () => true },
          ];

          let widened: any[] = [];
          let appliedTier = 0;
          for (const t of tiers) {
            widened = preWidenRules.filter(t.fn);
            appliedTier = t.tier;
            if (widened.length > 0) {
              if (t.tier > 0) {
                console.warn(`   🔓 [RULE_FILTER_WIDEN] tier=${t.tier} label=${t.label} pre=${beforeCount} post=${widened.length}`);
              }
              break;
            }
            if (beforeCount === 0) break;
            console.warn(`   🔓 [RULE_FILTER_WIDEN] tier=${t.tier} label=${t.label} pre=${beforeCount} post=0 → widening`);
          }
          if (widened.length === 0 && beforeCount > 0) {
            widened = preWidenRules;
            appliedTier = 5;
            console.warn(`   🔓 [RULE_FILTER_WIDEN] tier=5 label=UNIVERSAL pre=${beforeCount} post=${widened.length}`);
          }
          rulesToEvaluate = widened;
          
          const removedCount = beforeCount - rulesToEvaluate.length;
          if (removedCount > 0) {
            console.log(`   🎯 [HypObsFilter] Filtered ${removedCount} rules by category/plant-part (${beforeCount} → ${rulesToEvaluate.length}) tier=${appliedTier}`);
          }

        }
      } catch (obsErr) {
        console.warn(`   ⚠️ [HypObsFilter] Failed to load observation metadata:`, obsErr);
      }
    }
    
    // Candidate explosion warning
    if (rulesToEvaluate.length > 25) {
      console.warn(`   ⚠️ [RULE_EXPLOSION] ${rulesToEvaluate.length} candidate rules for ${input.known_observations.length} observations`);
    }
    
    // STEP 2: PHASE-17 - Filter by temporal constraints (crop_age_days_min/max)
    
    const temporalFilterInput = rulesToEvaluate.map((r: any) => ({
      rule_id: r.rule_id,
      crop_age_days_min: r.crop_age_days_min,
      crop_age_days_max: r.crop_age_days_max,
      // Preserve all original fields
      ...r
    }));
    
    const { valid: rules, filtered: temporallyFiltered, reasons: temporalReasons } = filterRulesByAge(
      temporalFilterInput,
      input.days_since_sowing
    );
    
    if (temporallyFiltered.length > 0) {
      console.log(`   ⏰ [TemporalFilter] Filtered ${temporallyFiltered.length} rules by crop age (DAS: ${input.days_since_sowing})`);
      // Log first 3 filtered rules for debugging
      temporallyFiltered.slice(0, 3).forEach((r: any) => {
        const reason = temporalReasons.get(r.rule_id) || 'unknown';
        console.log(`      - ${r.rule_id}: ${reason}`);
      });
    }
    
    logTemporalFilteringSummary(rules.length, temporallyFiltered.length, input.days_since_sowing, traceId);
    
    // CRITICAL: Use fallback rules if temporal filter removed everything
    const finalRulesToEvaluate = rules.length > 0 ? rules : rulesToEvaluate;
    
    if (rules.length === 0 && rulesToEvaluate.length > 0) {
      console.log(`   ⚠️ [HypothesisEval] All rules filtered by DAS - falling back to ${rulesToEvaluate.length} stage-filtered rules`);
    }
    
    // STEP 3: Evaluate using partial condition matching
    
    const scoredCandidates: CandidateHypothesis[] = [];
    
    // GAP #3: Detect strong diagnostic signals for cross-stage override
    const STRONG_SIGNALS = new Set([
      'DEAD_HEART', 'DEAD_HEART_PRESENT', 'DEADHEART', 'TUNNELS_IN_STEM',
      'TERMITE_MUD_TUBES', 'MUD_TUNNELS', 'HONEYDEW_PRESENT', 'HONEYDEW',
      'PINK_LARVAE_VISIBLE', 'PLANT_DEATH', 'SUDDEN_WILT'
    ]);
    
    const hasStrongSignal = input.known_observations.some(obs => 
      STRONG_SIGNALS.has(obs.toUpperCase().replace(/[\s-]/g, '_'))
    );
    
    if (hasStrongSignal) {
      console.log(`   ⚠️ [HypothesisEval] STRONG SIGNAL DETECTED - will allow cross-stage evaluation`);
    }
    
    console.log(`   🔄 [HypothesisEval] Evaluating ${finalRulesToEvaluate.length} rules for candidates...`);
    
    for (const rule of finalRulesToEvaluate) {
      // Calculate stage relevance
      let stageRelevance = calculateStageRelevance(rule.stage_applicable, growth_stage, crop_code);
      
      // GAP #3: Allow cross-stage evaluation if strong signal present
      const shouldSkipByStage = stageRelevance < 0.2;
      let crossStageOverride = false;
      
      if (shouldSkipByStage && hasStrongSignal) {
        // Override stage restriction for strong diagnostic signals
        stageRelevance = 0.4; // Allow through with reduced score
        crossStageOverride = true;
        console.log(`   ⚠️ [StageOverride] Allowing ${rule.rule_id} despite stage mismatch (strong signal)`);
      } else if (shouldSkipByStage) {
        continue; // Normal skip for low relevance
      }
      
      // Calculate partial condition match
      const { score: partialScore, matchedConditions } = evaluatePartialConditionMatch(
        rule.conditions_json,
        input
      );
      
      // Extract observable characteristics
      const observableChars = extractObservableCharacteristics(rule.observable_characteristics, obsMetadataMap);
      
      // CLARIFICATION ONTOLOGY CONTRACT:
      const effectiveObsChars = observableChars;
      if (effectiveObsChars.length === 0) {
        console.log(`   ℹ️ Rule ${rule.rule_id}: no farmer-observable characteristics — kept as internal candidate (no UI options will be derived from it)`);
      }
      
      // Calculate total score
      const priorityScore = (rule.priority || 50) / 100;
      const totalScore = (stageRelevance * 0.4) + (partialScore * 0.4) + (priorityScore * 0.2);
      
      scoredCandidates.push({
        rule_id: rule.rule_id,
        cause: rule.cause || 'unknown',
        canonical_group: rule.canonical_group || rule.category || 'general',
        priority: rule.priority || 50,
        stage_relevance_score: stageRelevance,
        partial_match_score: partialScore,
        total_score: totalScore,
        observable_characteristics: effectiveObsChars,
        differentiating_questions: rule.differentiating_questions || [],
        matched_conditions: matchedConditions,
        conditions_json: rule.conditions_json || {}
      });
    }
    
    // PHASE F — VARIETY RESISTANCE MODULATION
    if (input.variety_id) {
      const resistanceRows = await loadVarietyResistance(supabaseClient, input.variety_id);
      if (resistanceRows.length > 0) {
        let adjustedCount = 0;
        for (const cand of scoredCandidates) {
          const hit = findResistanceForCandidate(cand, resistanceRows, input.variety_id);
          if (hit) {
            const before = cand.total_score;
            cand.total_score = Math.max(0, Math.min(1, before * hit.multiplier));
            cand.resistance = hit;
            adjustedCount++;
            console.log(`   🧬 [Resistance] ${cand.cause.slice(0, 40)} lvl=${hit.level} ×${hit.multiplier} (${before.toFixed(3)} → ${cand.total_score.toFixed(3)}) via ${hit.match_kind}=${hit.matched_value}`);
          }
        }
        if (adjustedCount === 0) {
          console.log(`   🧬 [Resistance] variety ${input.variety_id}: ${resistanceRows.length} rows loaded, 0 candidates matched`);
        }
      } else {
        console.log(`   🧬 [Resistance] variety ${input.variety_id}: no curated rows`);
      }
    }
    
    // STEP 3: DEDUPLICATE by normalized cause + Rank and return top 4 candidates
    
    // Sort by score first (post-resistance)
    scoredCandidates.sort((a, b) => b.total_score - a.total_score);
    
    
    // Deduplicate by normalized cause - keep highest scoring variant
    const normalizedCauseSeen = new Set<string>();
    const deduplicatedCandidates: CandidateHypothesis[] = [];
    
    for (const candidate of scoredCandidates) {
      // Normalize cause: lowercase, remove scientific names, remove underscores
      const normalizedCause = normalizeCauseForDedup(candidate.cause);
      
      if (!normalizedCauseSeen.has(normalizedCause)) {
        normalizedCauseSeen.add(normalizedCause);
        deduplicatedCandidates.push(candidate);
      } else {
        console.log(`   [Dedup] Skipping duplicate: "${candidate.cause}" → "${normalizedCause}"`);
      }
      
      // Stop once we have 4 unique candidates
      if (deduplicatedCandidates.length >= 4) break;
    }
    
    const topCandidates = deduplicatedCandidates.slice(0, 4);

    // ONTOLOGY GATE — strip non-farmer-observable observation_keys from every
    const allCharKeys: string[] = [];
    const allRuleIds: string[] = [];
    for (const c of topCandidates) {
      allRuleIds.push(c.rule_id);
      for (const ch of c.observable_characteristics) allCharKeys.push(ch.observation_key);
    }
    if (allCharKeys.length > 0) {
      const gate = await assertFarmerObservable(supabaseClient, allCharKeys, {
        source: 'HYPOTHESIS_EVAL',
        crop_code,
        stage: growth_stage,
        rule_ids: allRuleIds,
        trace_id: traceId,
      });
      for (const c of topCandidates) {
        c.observable_characteristics = c.observable_characteristics.filter(
          ch => gate.validKeys.has(
            String(ch.observation_key || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
          )
        );
      }
    }

    console.log(`   ✅ [HypothesisEval] Top ${topCandidates.length} unique candidates (from ${scoredCandidates.length} scored, ${rulesRaw.length} loaded):`);
    topCandidates.forEach((c, i) => {
      console.log(`      ${i + 1}. ${c.cause} (${c.canonical_group}) - score: ${(c.total_score * 100).toFixed(0)}% - farmer_observable_chars=${c.observable_characteristics.length}`);
    });

    // GRAPH_NODE_TRACE — HYPOTHESIS (uniform pipeline line)
    try {
      const blockReasons: string[] = [];
      if (rulesRaw.length > 0 && rules.length === 0)          blockReasons.push('temporal_filter_dropped_all');
      if (rules.length > 0 && scoredCandidates.length === 0)  blockReasons.push('no_observation_match');
      if (scoredCandidates.length > 0 && topCandidates.length === 0) blockReasons.push('deduplication_dropped_all');
      if (topCandidates.length === 0) {
        console.warn(`[HYPOTHESIS_GAP][${traceId}] loaded=${rulesRaw.length} temporal=${rules.length} scored=${scoredCandidates.length} top=0 reasons=${blockReasons.join(',') || 'unknown'}`);
      }
      // eslint-disable-next-line no-console
      console.log(
        `[GRAPH_NODE_TRACE][${traceId}] node=HYPOTHESIS ` +
          JSON.stringify({
            loaded_rules: rulesRaw.length,
            after_temporal: rules.length,
            scored: scoredCandidates.length,
            generated: topCandidates.length,
            top: topCandidates.slice(0, 5).map(c => ({ cause: c.cause, score: Number(c.total_score.toFixed(3)) })),
            block_reasons: blockReasons,
          }),
      );
    } catch {/* trace must not throw */}

    return {
      candidates: topCandidates,
      total_rules_evaluated: rulesRaw.length,  // Total loaded before temporal filtering
      rules_after_temporal_filter: rules.length,  // After temporal constraint filtering
      stage_locked: growth_stage,
      evaluation_method: 'PARTIAL_MATCH',
      timestamp: Date.now(),
      trace_id: traceId
    };
    
  } catch (err) {
    console.error(`   ❌ [HypothesisEval] Exception:`, err);
    try {
      // eslint-disable-next-line no-console
      console.log(
        `[GRAPH_NODE_TRACE][${traceId}] node=HYPOTHESIS ` +
          JSON.stringify({ generated: 0, block_reasons: ['exception'], error: err instanceof Error ? err.message : String(err) }),
      );
    } catch {/* */}
    return {
      candidates: [],
      total_rules_evaluated: 0,
      stage_locked: growth_stage,
      evaluation_method: 'PARTIAL_MATCH',
      timestamp: Date.now(),
      trace_id: traceId
    };
  }
}

// CHECK IF AN OBSERVATION DIFFERENTIATES BETWEEN HYPOTHESES

export function calculateDifferentiationPower(
  observationKey: string,
  candidates: CandidateHypothesis[]
): number {
  if (candidates.length <= 1) return 0.5;
  
  let presenceCount = 0;
  let absenceCount = 0;
  
  for (const candidate of candidates) {
    const hasObservation = candidate.observable_characteristics.some(
      c => c.observation_key.toUpperCase() === observationKey.toUpperCase()
    );
    if (hasObservation) {
      presenceCount++;
    } else {
      absenceCount++;
    }
  }
  
  // Best differentiation is when observation appears in SOME but not ALL candidates
  // Score is highest when split is 50/50
  const splitRatio = Math.min(presenceCount, absenceCount) / candidates.length;
  
  return splitRatio * 2; // 0-1 scale, 1 = perfect differentiation
}

// NDVI CONSISTENCY CHECK

export function isObservationNDVIConsistent(
  observationKey: string,
  ndviLevel?: string,
  ndviTrend?: string
): boolean {
  const obsUpper = observationKey.toUpperCase();
  
  // Low/localized NDVI → prefer establishment/soil/moisture options
  if (ndviLevel === 'LOW') {
    // Suppress widespread foliar symptoms
    if (['WIDESPREAD_YELLOWING', 'ENTIRE_FIELD_AFFECTED', 'ALL_PLANTS_SHOW'].some(
      p => obsUpper.includes(p)
    )) {
      return false;
    }
    // Prefer localized/establishment issues
    return true;
  }
  
  // Improving NDVI → suppress disease indicators
  if (ndviTrend === 'IMPROVING') {
    // Active disease would typically show declining NDVI
    if (['BLIGHT', 'ROT', 'SPREADING', 'PROGRESSIVE'].some(
      p => obsUpper.includes(p)
    )) {
      return false;
    }
  }
  
  return true;
}

// VISUAL OBSERVABILITY SCORE

const HIGHLY_VISUAL_PATTERNS = [
  'COLOR', 'YELLOW', 'BROWN', 'BLACK', 'WHITE', 'RED', 'SPOT',
  'HOLE', 'CURL', 'WILT', 'DRY', 'DEAD', 'INSECT', 'GAP', 'MISSING'
];

const ABSTRACT_PATTERNS = [
  'DEFICIENCY', 'STRESS', 'SYNDROME', 'COMPLEX', 'SYSTEMIC'
];

export function getVisualObservabilityScore(observationKey: string): number {
  const obsUpper = observationKey.toUpperCase();
  
  // Check for highly visual patterns
  if (HIGHLY_VISUAL_PATTERNS.some(p => obsUpper.includes(p))) {
    return 1.0;
  }
  
  // Check for abstract patterns (harder to observe)
  if (ABSTRACT_PATTERNS.some(p => obsUpper.includes(p))) {
    return 0.3;
  }
  
  return 0.6; // Default mid-score
}

// DIAGNOSTIC CONFIRMATION OPTIONS GENERATOR (Trust-First Mode)

export interface DiagnosticConfirmationOption {
  label_mr: string;
  label_hi: string;
  label_en: string;
  observation_key: string;
  diagnostic_power: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_boost: number;
  source_rule_id?: string;
  icon?: string;
  i18n_key?: string;
}

export interface DiagnosticConfirmationResult {
  question_mr: string;
  question_hi: string;
  question_en: string;
  question_i18n_key?: string;
  options: DiagnosticConfirmationOption[];
  photo_option_included: boolean;
  hypotheses_count: number;
}

// SSOT: Observation labels now loaded from observation_translations table

import { loadObservationLabels, getObservationIcon } from '../i18n/observation-label-loader.ts';

// Fallback icon mapping for when database lookup is not used
// (This is language-neutral - only visual symbols, no text)
const OBSERVATION_ICONS_FALLBACK: Record<string, string> = {
  'DEAD_HEART_PRESENT': '🔴',
  'DEAD_HEART': '💀',
  'LARVAE_PRESENT': '🐛',
  'MUD_TUBES_PRESENT': '🏠',
  'TUNNELS_IN_SOIL': '🕳️',
  'HONEYDEW_PRESENT': '✨',
  'STEM_BORING_MARKS': '🕳️',
  'SETT_EASILY_PULLED_OUT': '🌱',
  'FRASS_VISIBLE': '💩',
  'WHITE_POWDERY_GROWTH': '🤍',
  'ROOT_ROTTED': '🪵',
  'SOIL_TOO_DRY': '🏜️',
  'FIELD_WATERLOGGED': '💧',
  'INSECTS_VISIBLE': '🐛',
  'LEAF_YELLOWING': '🍂',
  'LEAF_SPOTS': '🦠',
  'STUNTED_GROWTH': '📉',
  'PHOTO_REQUESTED': '📷'
};

// Generate DIAGNOSTIC_CONFIRMATION options from candidate hypotheses.
// Generate DIAGNOSTIC_CONFIRMATION options from candidate hypotheses.
export function generateDiagnosticConfirmationOptions(
  candidates: CandidateHypothesis[],
  language: string = 'mr',
  maxOptions: number = 5
): DiagnosticConfirmationResult {
  console.log(`   🔬 [DiagnosticConfirmation] Generating trust-first options from ${candidates.length} hypotheses`);
  console.log(`      Source=DECISION_RULES, Mode=TRUST_FIRST`);
  
  // Collect all unique observations with their diagnostic power
  const observationMap = new Map<string, {
    observation_key: string;
    diagnostic_power: 'HIGH' | 'MEDIUM' | 'LOW';
    confidence_boost: number;
    differentiation_score: number;
    field_verifiability: number; // How easy for farmer to verify in field
    source_rule_ids: string[];
  }>();
  
  for (const candidate of candidates) {
    for (const char of candidate.observable_characteristics) {
      const key = char.observation_key.toUpperCase();
      
      // Calculate differentiation power (appears in some but not all candidates)
      const diffScore = calculateDifferentiationPower(key, candidates);
      
      // Calculate field verifiability (visual observability)
      const fieldVerifiability = getVisualObservabilityScore(key);
      
      const existing = observationMap.get(key);
      if (!existing) {
        observationMap.set(key, {
          observation_key: key,
          diagnostic_power: char.diagnostic_power || 'MEDIUM',
          confidence_boost: char.confidence_boost || 0.12,
          differentiation_score: diffScore,
          field_verifiability: fieldVerifiability,
          source_rule_ids: [candidate.rule_id]
        });
      } else {
        existing.source_rule_ids.push(candidate.rule_id);
        // Prefer higher diagnostic power
        if (char.diagnostic_power === 'HIGH') {
          existing.diagnostic_power = 'HIGH';
          existing.confidence_boost = Math.max(existing.confidence_boost, 0.25);
        }
      }
    }
  }
  
  // RANKING: By diagnostic weight (40%) + field verifiability (40%) + differentiation (20%)
  const sortedObservations = Array.from(observationMap.values())
    .filter(obs => OBSERVATION_ICONS_FALLBACK[obs.observation_key]) // Only use observations with icons
    .sort((a, b) => {
      // Diagnostic power weight (40%)
      const powerOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const powerScore = (powerOrder[b.diagnostic_power] - powerOrder[a.diagnostic_power]) * 0.4;
      
      // Field verifiability weight (40%)
      const verifyScore = (b.field_verifiability - a.field_verifiability) * 0.4;
      
      // Differentiation weight (20%)
      const diffScore = (b.differentiation_score - a.differentiation_score) * 0.2;
      
      return powerScore + verifyScore + diffScore;
    })
    .slice(0, maxOptions);
  
  console.log(`   📋 [DiagnosticConfirmation] Selected ${sortedObservations.length} diagnostic options (max ${maxOptions})`);
  sortedObservations.forEach((obs, i) => {
    console.log(`      ${i + 1}. ${obs.observation_key} (power=${obs.diagnostic_power}, verify=${(obs.field_verifiability * 100).toFixed(0)}%, diff=${(obs.differentiation_score * 100).toFixed(0)}%)`);
  });
  
  // SSOT NOTE: For full compliance, this function should be made async and
  
  // Build options with observation keys (UI layer resolves multilingual labels)
  const options: DiagnosticConfirmationOption[] = sortedObservations.map(obs => {
    const icon = OBSERVATION_ICONS_FALLBACK[obs.observation_key] || '❓';
    // Use observation_key as i18n reference - UI/narration layer loads translations
    const formattedLabel = formatObservationCode(obs.observation_key);
    return {
      label_mr: `${icon} ${formattedLabel}`,  // Temporary: will be resolved by narration layer
      label_hi: `${icon} ${formattedLabel}`,  // via i18n_key lookup in observation_translations
      label_en: `${icon} ${formattedLabel}`,
      observation_key: obs.observation_key,
      diagnostic_power: obs.diagnostic_power,
      confidence_boost: obs.confidence_boost,
      source_rule_id: obs.source_rule_ids[0],
      icon: icon,
      i18n_key: `observation.${obs.observation_key.toLowerCase()}`  // For UI layer resolution
    };
  });
  
  // MANDATORY: Add "Take Photo" as FINAL option
  const photoOption: DiagnosticConfirmationOption = {
    label_mr: '📷 Photo',  // Placeholder - resolved via i18n_key
    label_hi: '📷 Photo',  // Placeholder - resolved via i18n_key
    label_en: '📷 Upload Photo (for expert analysis)',
    observation_key: 'PHOTO_REQUESTED',
    diagnostic_power: 'HIGH',
    confidence_boost: 0.30, // Photo provides high confidence
    icon: '📷',
    i18n_key: 'observation.photo_request'  // UI layer resolves translation
  };
  options.push(photoOption);
  
  // SSOT: Question text uses i18n_key - actual translations loaded by UI/narration layer
  // from message_translations or observation_translations table
  const questionTexts = {
    mr: 'question_placeholder',  // Resolved by narration layer
    hi: 'question_placeholder',  // Resolved by narration layer
    en: 'To identify the cause, tell us which of these you observe:',
    i18n_key: 'clarification.diagnostic_confirmation_question'  // SSOT key
  };
  
  console.log(`   ✅ [DiagnosticConfirmation] Generated ${options.length} options (including photo)`);
  console.log(`      Photo option included=true, None_of_above=REMOVED`);
  console.log(`      SSOT: Using i18n_keys for UI layer translation resolution`);
  
  return {
    question_mr: questionTexts.mr,
    question_hi: questionTexts.hi,
    question_en: questionTexts.en,
    question_i18n_key: questionTexts.i18n_key,
    options,
    photo_option_included: true,
    hypotheses_count: candidates.length
  };
}

// Helper function to format observation code as human-readable label
function formatObservationCode(code: string): string {
  return code
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

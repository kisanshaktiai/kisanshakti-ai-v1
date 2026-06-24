/**
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

export const HYPOTHESIS_EVALUATOR_VERSION = '1.3.0'; // PHASE-4: variety-resistance confidence modifier

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-17: TEMPORAL CONSTRAINT VALIDATOR IMPORT
// ═══════════════════════════════════════════════════════════════════════════
import {
  validateCropAge,
  filterRulesByAge,
  logTemporalValidation,
  logTemporalFilteringSummary,
  type TemporalValidationInput
} from './temporal-constraint-validator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface VarietyResistanceEntry {
  pathogen: string;
  threat_type?: string | null;
  level: string;            // HR | R | MR | MS | S | unknown
  observation_code?: string | null;
  canonical_observation_code?: string | null;
}

export interface HypothesisEvaluationInput {
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
  // PHASE-4: Variety-aware reasoning — adjusts candidate confidence based on
  // the planted variety's catalogued resistance/susceptibility profile.
  variety_id?: string | null;
  variety_resistance?: VarietyResistanceEntry[];
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
  // PHASE-4: Variety resistance influence on score
  variety_modifier?: number;            // multiplicative factor actually applied
  variety_resistance_level?: string;    // matched level (HR/R/MR/MS/S)
  variety_resistance_match?: string;    // pathogen / observation that matched
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

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUPS FOR RULE FILTERING
// ═══════════════════════════════════════════════════════════════════════════

const HYPOTHESIS_CANONICAL_GROUPS = [
  '01_physiology', '02_disease', '03_pest', '04_disease',
  '04_irrigation', '05_nutrient', '05_nutrition', '05_soil',
  '06_abiotic', '06_irrigation', '06_soil', '06_stress', '06_weed',
  '07_diagnosis', '07_monitoring', '07_soil', '08_remote_sensing',
  '08_stress', '08_weed', '10_stress_weather', '10_weather',
  '13_diagnosis', '15_deficiency', '15_soil', '16_stress',
  '00_decision_gate', '01_crop_identity', '01_safety', '01_seed_quality',
  '02_land', '02_stage_awareness', '03_observation', '07_climate_water',
  '07_organic', '08_recommendation', '09_best_practice', '10_stress',
  '11_economics', '11_harvest', '12_safety', '13_system',
  '17_management', '18_gate', '19_economics'
];

// ═══════════════════════════════════════════════════════════════════════════
// STAGE COMPATIBILITY PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

// Import centralized stage normalizer
import { 
  normalizeStageForDB, 
  getStageCategory, 
  calculateStageRelevanceScore,
  getStageQueryVariants,
  type StageCategory 
} from '../utils/stage-normalizer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE NORMALIZATION FOR DEDUPLICATION
// Normalizes cause strings to detect duplicates like:
// - "Early Shoot Borer (Chilo infuscatellus) infestation" → "early shoot borer"
// - "EARLY_SHOOT_BORER" → "early shoot borer"
// - "early_shoot_borer_tillering" → "early shoot borer"
// ═══════════════════════════════════════════════════════════════════════════

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
    // ═══════════════════════════════════════════════════════════════════════
    // PEST patterns (existing)
    // ═══════════════════════════════════════════════════════════════════════
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // FORENSIC AUDIT FIX v8.0: NUTRIENT dedup patterns
    // "Basal Nitrogen Recommendation", "Optimized Nitrogen Application",
    // "Split Nitrogen Application" all collapse to "nitrogen deficiency"
    // ═══════════════════════════════════════════════════════════════════════
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
    // deficiencies (Iron, Zinc, Nitrogen, Magnesium) into one bucket.
    // Specific nutrient patterns above handle dedup correctly.
    
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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-4: VARIETY-RESISTANCE CONFIDENCE MODIFIER
// Adjusts a candidate hypothesis score using the planted variety's catalogued
// resistance/susceptibility profile (from variety_resistance table).
//
//   HR / R   → cause is unlikely → lower score (variety is resistant)
//   MR       → mild down-weight
//   MS / S   → variety is susceptible → boost score
//
// SAFETY: This NEVER hard-filters a candidate. Treatment safety gates and
// downstream prescription rules remain authoritative. The modifier only
// re-ranks hypotheses so the most plausible biology surfaces first.
// ═══════════════════════════════════════════════════════════════════════════

const VARIETY_RESISTANCE_MULTIPLIER: Record<string, number> = {
  HR: 0.55,    // highly resistant — strong down-weight
  R: 0.70,     // resistant
  MR: 0.88,    // moderately resistant — mild down-weight
  MS: 1.10,    // moderately susceptible — mild boost
  S: 1.25,     // susceptible — boost
};

function normalizeForVarietyMatch(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

interface VarietyMatchResult {
  multiplier: number;
  level: string;
  matchedOn: string;
}

function computeVarietyResistanceMatch(
  candidate: { cause: string; canonical_group: string; observable_characteristics: ObservableCharacteristic[]; matched_conditions: string[] },
  resistance: VarietyResistanceEntry[] | undefined,
): VarietyMatchResult | null {
  if (!resistance || resistance.length === 0) return null;

  // Build candidate fingerprint
  const upperCodes = new Set<string>();
  const normalizedTokens = new Set<string>();

  upperCodes.add(String(candidate.cause || '').toUpperCase());
  upperCodes.add(String(candidate.canonical_group || '').toUpperCase());
  for (const oc of candidate.observable_characteristics || []) {
    if (oc?.observation_key) upperCodes.add(String(oc.observation_key).toUpperCase());
  }
  for (const mc of candidate.matched_conditions || []) {
    upperCodes.add(String(mc).toUpperCase());
  }
  normalizedTokens.add(normalizeForVarietyMatch(candidate.cause));
  normalizedTokens.add(normalizeForVarietyMatch(candidate.canonical_group));
  for (const oc of candidate.observable_characteristics || []) {
    if (oc?.label_en) normalizedTokens.add(normalizeForVarietyMatch(oc.label_en));
  }
  const causeNorm = normalizeForVarietyMatch(candidate.cause);

  let best: VarietyMatchResult | null = null;
  for (const entry of resistance) {
    const level = String(entry.level || '').toUpperCase();
    const mult = VARIETY_RESISTANCE_MULTIPLIER[level];
    if (!mult || mult === 1) continue;

    const codeKeys = [entry.observation_code, entry.canonical_observation_code]
      .filter(Boolean)
      .map((c) => String(c).toUpperCase());

    let matchedOn: string | null = null;

    for (const ck of codeKeys) {
      if (upperCodes.has(ck)) { matchedOn = ck; break; }
    }

    if (!matchedOn) {
      const pathNorm = normalizeForVarietyMatch(entry.pathogen);
      if (pathNorm && pathNorm.length >= 4) {
        if (causeNorm.includes(pathNorm) || pathNorm.includes(causeNorm)) {
          matchedOn = entry.pathogen;
        } else {
          for (const tok of normalizedTokens) {
            if (tok && (tok.includes(pathNorm) || pathNorm.includes(tok)) && tok.length >= 4) {
              matchedOn = entry.pathogen;
              break;
            }
          }
        }
      }
    }

    if (matchedOn) {
      // Keep the entry with the strongest effect (max distance from 1.0)
      if (!best || Math.abs(mult - 1) > Math.abs(best.multiplier - 1)) {
        best = { multiplier: mult, level, matchedOn };
      }
    }
  }

  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTIAL CONDITION MATCHING
// Evaluate how well a rule's conditions match available facts
// ═══════════════════════════════════════════════════════════════════════════

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
  
  // Check observations match (CASE-NORMALIZED — DB stores lower_snake_case,
  // in-memory symbolic contract is UPPER_SNAKE_CASE).
  let observationsConditionPresent = false;
  let observationsConditionMatched = false;
  if (conditionsJson.observations && Array.isArray(conditionsJson.observations)) {
    totalConditions++;
    observationsConditionPresent = true;
    const knownUpper = input.known_observations.map(k => String(k || '').toUpperCase());
    const obsMatch = conditionsJson.observations.some((obs: string) => {
      const obsUpper = String(obs || '').toUpperCase();
      if (!obsUpper) return false;
      return knownUpper.some(known => known === obsUpper);
    });
    if (obsMatch) {
      matchedCount++;
      matchedConditions.push('observations');
      observationsConditionMatched = true;
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

  // EVIDENCE GATE (post lower_snake_case migration fix):
  // If a rule declares `conditions_json.observations` but NONE of them match the
  // farmer's known observations, the rule has no diagnostic evidence. Returning
  // a positive base score here is what let advisory/safety rules like
  // "Personal Protective Equipment for spraying" (condition_observations:
  // [management_planning]) tie the real rice emergence rule on stage score
  // alone and hijack DIAGNOSIS_FIRST options. Force score=0 so the candidate
  // is dropped before deduplication / top-N selection.
  if (observationsConditionPresent && !observationsConditionMatched) {
    return { score: 0, matchedConditions };
  }

  // Calculate score (0-1)
  const score = totalConditions > 0 ? matchedCount / (totalConditions + 1) : 0.3;

  return { score: Math.min(1, score), matchedConditions };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE RELEVANCE SCORING
// Uses centralized stage-normalizer.ts for consistency
// ═══════════════════════════════════════════════════════════════════════════

function calculateStageRelevance(
  stageApplicable: string[] | null,
  currentStage: string
): number {
  // Delegate to centralized normalizer
  return calculateStageRelevanceScore(stageApplicable, currentStage);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT OBSERVABLE CHARACTERISTICS
// Parse and normalize observable_characteristics from rule
// ═══════════════════════════════════════════════════════════════════════════

/**
 * P0 FIX: Observable Characteristics Array Normalizer
 * Handles multiple formats from decision_rules:
 * - Array of strings: ["dead_heart", "larvae_present"]
 * - Array of objects: [{observation_key: "DEAD_HEART"}]
 * - Single object: {observation_key: "DEAD_HEART"}
 * - Empty/null: returns empty array safely
 */
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
    // Database stores observable_characteristics as: {dead_heart: true, central_shoot_dried: true}
    // We need to convert this to: ["DEAD_HEART", "CENTRAL_SHOOT_DRIED"]
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
  
  return charArray.map((char: any, idx: number) => {
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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HYPOTHESIS EVALUATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-evaluate symbolic rules to build candidate hypothesis set.
 * This is a READ-ONLY step that does NOT fire treatments.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP CODE NORMALIZER - Maps between full names and DB short codes
 * CRITICAL: decision_rules table uses short codes (SC, CTN, etc.)
 * ═══════════════════════════════════════════════════════════════════════════
 */
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
  const { crop_code, growth_stage, supabaseClient } = input;
  const normalizeObs = (code: string) => String(code || '').toLowerCase().replace(/[\s-]+/g, '_').trim();
  let expandedKnownObservations = Array.from(new Set(input.known_observations.map(normalizeObs).filter(Boolean)));
  
  console.log(`🎯 [HypothesisEval v1.3] Pre-evaluating rules for ${crop_code}/${growth_stage}`);
  console.log(`   Known observations: ${input.known_observations.join(', ') || 'none'}`);
  console.log(`   NDVI: ${input.ndvi_level || 'unknown'} (${input.ndvi_trend || 'unknown'})`);
  console.log(`   DAS: ${input.days_since_sowing ?? 'unknown'}`);
  
  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: NORMALIZE CROP CODE AND STAGE FOR DB QUERY
    // CRITICAL FIX: Use crop code variants (SC, SUGARCANE, etc.)
    // ═══════════════════════════════════════════════════════════════════════
    
    if (expandedKnownObservations.length > 0) {
      const originalObservationCount = expandedKnownObservations.length;
      const { data: aliasRows, error: aliasErr } = await supabaseClient
        .from('observation_aliases')
        .select('alias_code, canonical_code')
        .in('alias_code', expandedKnownObservations);
      if (aliasErr) {
        console.warn(`   ⚠️ [HypothesisEval] Alias expansion failed: ${aliasErr.message}`);
      } else if (Array.isArray(aliasRows) && aliasRows.length > 0) {
        const expanded = new Set(expandedKnownObservations);
        for (const row of aliasRows) {
          const canonical = normalizeObs(row.canonical_code);
          if (canonical) expanded.add(canonical);
        }
        expandedKnownObservations = Array.from(expanded);
        input.known_observations = expandedKnownObservations;
        console.log(`   🔁 [HypothesisEval] DB alias expansion: ${originalObservationCount} → ${expandedKnownObservations.length}`);
      }
    }

    const cropVariants = getCropCodeVariantsForDB(crop_code);
    const stageVariants = getStageQueryVariants(growth_stage);
    const dbStage = normalizeStageForDB(growth_stage);
    
    console.log(`   [HypothesisEval] Crop variants for query: [${cropVariants.join(', ')}]`);
    console.log(`   [HypothesisEval] Stage variants for query: [${stageVariants.slice(0, 5).join(', ')}...]`);
    console.log(`   [HypothesisEval] DB stage normalized: ${growth_stage} → ${dbStage}`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1.5: BUILD DYNAMIC QUERY WITH CROP AND STAGE FILTERING
    // This prevents loading 100 random rules - instead load stage-scoped rules
    // ═══════════════════════════════════════════════════════════════════════
    
    // Build crop filter: match any of the crop variants
    const cropFilter = cropVariants.map(v => `crop_code.ilike.${v}`).join(',');
    
    // Query with both crop AND stage filtering for better precision
    // Increase limit since we're filtering more precisely
    // ═══════════════════════════════════════════════════════════════════════
    // CRITICAL BUG FIX: Do NOT filter out rules with empty observable_characteristics
    // 184 rules (37.7%) were being excluded including nutrition, irrigation, pest rules
    // These rules have matching data in conditions_json instead
    // ═══════════════════════════════════════════════════════════════════════
    // WAVE 3 FIX (P1-2): Compute dynamic limit from actual matching-rule count
    // instead of the hardcoded 800 ceiling, which would silently truncate any
    // crop that later crosses that threshold.
    const { count: matchingCount, error: countErr } = await supabaseClient
      .from('decision_rules')
      .select('rule_id', { count: 'exact', head: true })
      .eq('is_active', true)
      .in('canonical_group', HYPOTHESIS_CANONICAL_GROUPS)
      .or(cropFilter);
    if (countErr) {
      console.warn(`   ⚠️ [HypothesisEval] Count query failed, using safety ceiling: ${countErr.message}`);
    }
    const dynamicLimit = Math.max(800, (matchingCount ?? 0) + 50);
    const { data: rulesRaw, error } = await supabaseClient
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
      .in('canonical_group', HYPOTHESIS_CANONICAL_GROUPS)
      .or(cropFilter)
      .limit(dynamicLimit);

    
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1.6: FILTER BY STAGE_APPLICABLE (in-code filtering)
    // Supabase can't do array-contains easily, so we filter in code
    // ═══════════════════════════════════════════════════════════════════════
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1.7: OBSERVATION LAYER PRE-FILTER (category + plant-part)
    // Uses observation_master metadata + canonical_group_mapping ontology bridge
    // ═══════════════════════════════════════════════════════════════════════
    let obsMetadataMap = new Map<string, any>();
    
    if (input.known_observations.length > 0) {
      try {
        // Phase 5 fix: observation_master.observation_code is lowercase canonical
        // post-migration; in-memory contract is UPPER snake_case. Normalize at the
        // DB ingress (.in() filter) and egress (map key) boundaries so that the
        // diagnostic-power lookup in extractObservableCharacteristics() actually
        // matches observation_master metadata.
        const obsLcArray = expandedKnownObservations;

        // Load observation metadata
        const { data: obsMetaData } = await supabaseClient
          .from('observation_master')
          .select('observation_code, observation_category, affected_plant_part, canonical_group, is_diagnostic, observation_type, symptom_type, symptom_pattern, severity_level, discriminator_score, frequency_score, clarity_score')
          .in('observation_code', obsLcArray);
        
        if (obsMetaData && obsMetaData.length > 0) {
          for (const obs of obsMetaData) {
            const upperCode = String(obs.observation_code || '').toUpperCase();
            obsMetadataMap.set(upperCode, obs);
          }
          
          const obsCategories = new Set(obsMetaData.map((o: any) => o.observation_category).filter(Boolean));
          const obsPlantParts = new Set(obsMetaData.map((o: any) => o.affected_plant_part).filter(Boolean));
          
          console.log(`   🔬 [HypObsFilter] Categories: [${[...obsCategories].join(',')}], Parts: [${[...obsPlantParts].join(',')}]`);
          
          const beforeCount = rulesToEvaluate.length;
          rulesToEvaluate = rulesToEvaluate.filter((rule: any) => {
            // Category filter
            const reqCat = rule.required_observation_category;
            if (reqCat && Array.isArray(reqCat) && reqCat.length > 0) {
              const hasMatch = reqCat.some((cat: string) => obsCategories.has(cat));
              if (!hasMatch) return false;
            }
            
            // Plant part filter with WHOLE wildcard
            const reqPart = rule.required_plant_part;
            if (reqPart && Array.isArray(reqPart) && reqPart.length > 0) {
              const hasMatch = 
                obsPlantParts.has('WHOLE') ||
                reqPart.includes('WHOLE') ||
                reqPart.some((part: string) => obsPlantParts.has(part));
              if (!hasMatch) return false;
            }
            
            return true;
          });
          
          const removedCount = beforeCount - rulesToEvaluate.length;
          if (removedCount > 0) {
            console.log(`   🎯 [HypObsFilter] Filtered ${removedCount} rules by category/plant-part (${beforeCount} → ${rulesToEvaluate.length})`);
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: PHASE-17 - Filter by temporal constraints (crop_age_days_min/max)
    // This ensures early-stage rules don't fire for mature crops and vice versa
    // ═══════════════════════════════════════════════════════════════════════
    
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Evaluate using partial condition matching
    // ═══════════════════════════════════════════════════════════════════════
    
    const scoredCandidates: CandidateHypothesis[] = [];
    
    // GAP #3: Detect strong diagnostic signals for cross-stage override
    const STRONG_SIGNALS = new Set([
      'DEAD_HEART', 'DEAD_HEART_PRESENT', 'DEADHEART', 'TUNNELS_IN_STEM',
      'TERMITE_MUD_TUBES', 'MUD_TUNNELS', 'HONEYDEW_PRESENT', 'HONEYDEW',
      'PINK_LARVAE_VISIBLE', 'PLANT_DEATH', 'SUDDEN_WILT'
    ]);
    
    const hasStrongSignal = expandedKnownObservations.some(obs => 
      STRONG_SIGNALS.has(obs.toUpperCase().replace(/[\s-]/g, '_'))
    );
    
    if (hasStrongSignal) {
      console.log(`   ⚠️ [HypothesisEval] STRONG SIGNAL DETECTED - will allow cross-stage evaluation`);
    }
    
    console.log(`   🔄 [HypothesisEval] Evaluating ${finalRulesToEvaluate.length} rules for candidates...`);
    
    for (const rule of finalRulesToEvaluate) {
      // Calculate stage relevance
      let stageRelevance = calculateStageRelevance(rule.stage_applicable, growth_stage);
      
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

      // EVIDENCE GATE: if the rule declared observation conditions but none of
      // them match the farmer's evidence, partialScore is 0 — skip it. This is
      // the post lower_snake_case fix that prevents advisory/management rules
      // (PPE / DSR / banned chemicals) from polluting DIAGNOSIS_FIRST options.
      if (partialScore === 0) {
        continue;
      }

      // Extract observable characteristics
      const observableChars = extractObservableCharacteristics(rule.observable_characteristics, obsMetadataMap);
      
      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL BUG FIX: Do NOT skip rules with empty observable_characteristics
      // Instead, generate synthetic observations from conditions_json.observations
      // This ensures nutrition, irrigation, and soil rules are included
      // ═══════════════════════════════════════════════════════════════════════
      let effectiveObsChars = observableChars;
      if (effectiveObsChars.length === 0) {
        // Try to extract observations from conditions_json
        const condObs = rule.conditions_json?.observations;
        if (condObs && Array.isArray(condObs) && condObs.length > 0) {
          // FARMER-OBSERVABLE GATE: reject action/gate/check codes that are
          // not real observable symptoms. A farmer must be able to answer
          // "yes I see this" — codes like *_check, *_gate, etl_*, phi_*,
          // safety_*, *_authority_* are workflow signals, not symptoms.
          const NON_OBSERVABLE_RE = /(^|_)(check|gate|authority|threshold|verify|verification)(_|$)|^etl_|^phi_|^safety_|_check$/i;
          effectiveObsChars = condObs
            .filter((obs: string) => typeof obs === 'string' && obs.length > 0 && !NON_OBSERVABLE_RE.test(obs))
            .map((obs: string, idx: number) => ({
              id: obs.toUpperCase(),
              observation_key: obs.toUpperCase(),
              // Leave label_en blank so the enricher's observation_translations
              // overlay can fill in farmer-friendly text. Falling back to the
              // raw code here produces action-phrase chips ("water stress check").
              label_en: undefined,
              is_visual: true,
              diagnostic_power: 'MEDIUM' as const,
              confidence_boost: 0.12
            }));
          if (effectiveObsChars.length === 0) {
            console.log(`   ⏭️ Skipping rule ${rule.rule_id}: only non-observable gate codes in conditions_json`);
            continue;
          }
        } else {
          // ═══════════════════════════════════════════════════════════════
          // FIX: Do NOT generate synthetic observation keys from `cause`.
          // Rules with no observable_characteristics AND no conditions_json
          // observations are advisory/safety rules, not diagnostic hypotheses.
          // Generating keys from cause text produces untranslatable garbage
          // like "ZINC_DEFICIENCY_CAUSES_CHLOROS" in the farmer UI.
          // ═══════════════════════════════════════════════════════════════
          console.log(`   ⏭️ Skipping rule ${rule.rule_id}: no observable evidence (advisory-only rule)`);
          continue;
        }
      }
      
      // Calculate total score
      const priorityScore = (rule.priority || 50) / 100;
      let totalScore = (stageRelevance * 0.4) + (partialScore * 0.4) + (priorityScore * 0.2);

      // PHASE-4: Apply variety-resistance modifier (post-base scoring).
      // Down-weights causes the planted variety resists; up-weights
      // susceptibility. No-op when no variety_resistance was supplied.
      const varietyMatch = computeVarietyResistanceMatch(
        {
          cause: rule.cause || 'unknown',
          canonical_group: rule.canonical_group || rule.category || 'general',
          observable_characteristics: effectiveObsChars,
          matched_conditions: matchedConditions,
        },
        input.variety_resistance,
      );
      let varietyModifier: number | undefined;
      let varietyLevel: string | undefined;
      let varietyMatchedOn: string | undefined;
      if (varietyMatch) {
        const before = totalScore;
        totalScore = Math.max(0, Math.min(1, totalScore * varietyMatch.multiplier));
        varietyModifier = varietyMatch.multiplier;
        varietyLevel = varietyMatch.level;
        varietyMatchedOn = varietyMatch.matchedOn;
        console.log(
          `   🧬 [VarietyResistance] ${rule.rule_id} (${rule.cause}) matched ${varietyMatch.matchedOn} ` +
          `→ ${varietyMatch.level} ×${varietyMatch.multiplier.toFixed(2)} ` +
          `score ${(before * 100).toFixed(0)}% → ${(totalScore * 100).toFixed(0)}%`
        );
      }

      // ═══════════════════════════════════════════════════════════════════════
      // Phase-24: STAGE BIAS — at GERMINATION/SEEDLING/EMERGENCE/ESTABLISHMENT,
      // promote causes that genuinely explain "crop hasn't emerged" and
      // suppress mature-stage causes (leaf disease / rust / borer / late
      // nutrient deficiency) that cannot apply pre-emergence.
      // Multipliers are conservative and clamped to [0,1].
      // ═══════════════════════════════════════════════════════════════════════
      const STAGE_BIAS_PROMOTE = new Set([
        'SEED_ROT', 'POOR_SEED_VIABILITY', 'WATERLOGGING',
        'DEEP_SOWING', 'SOIL_CRUST', 'TERMITE_DAMAGE',
        'BIRD_DAMAGE', 'SEED_TREATMENT_FAILURE', 'POOR_GERMINATION',
        'SEED_QUALITY', 'SOIL_MOISTURE_DEFICIT', 'CRUSTING'
      ]);
      const STAGE_BIAS_SUPPRESS = new Set([
        'LEAF_DISEASE', 'RUST', 'BLAST', 'SHEATH_BLIGHT',
        'BORER', 'STEM_BORER', 'BOLLWORM',
        'NUTRIENT_DEFICIENCY_LATE_STAGE', 'PANICLE_DISEASE',
        'GRAIN_DISEASE', 'TILLERING_ISSUE'
      ]);
      const upperStage = String(growth_stage || '').toUpperCase();
      const isEarlyStage =
        upperStage.includes('GERMINATION') ||
        upperStage.includes('SEEDLING') ||
        upperStage.includes('EMERGENCE') ||
        upperStage.includes('ESTABLISHMENT') ||
        upperStage.includes('NURSERY');
      if (isEarlyStage) {
        const causeUp = String(rule.cause || '').toUpperCase();
        const groupUp = String(rule.canonical_group || rule.category || '').toUpperCase();
        const tokens = `${causeUp} ${groupUp}`;
        const promoted = [...STAGE_BIAS_PROMOTE].some(k => tokens.includes(k));
        const suppressed = [...STAGE_BIAS_SUPPRESS].some(k => tokens.includes(k));
        if (promoted && !suppressed) {
          const before = totalScore;
          totalScore = Math.max(0, Math.min(1, totalScore * 1.25));
          console.log(`   📈 [HypothesisEval] StageBias stage=${upperStage} cause=${rule.cause} ×1.25 (${(before*100).toFixed(0)}%→${(totalScore*100).toFixed(0)}%)`);
        } else if (suppressed && !promoted) {
          const before = totalScore;
          totalScore = Math.max(0, Math.min(1, totalScore * 0.4));
          console.log(`   📉 [HypothesisEval] StageBias stage=${upperStage} cause=${rule.cause} ×0.4 (${(before*100).toFixed(0)}%→${(totalScore*100).toFixed(0)}%)`);
        }
      }



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
        conditions_json: rule.conditions_json || {},
        variety_modifier: varietyModifier,
        variety_resistance_level: varietyLevel,
        variety_resistance_match: varietyMatchedOn,
      });
    }

    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: DEDUPLICATE by normalized cause + Rank and return top 4 candidates
    // CRITICAL FIX: Multiple rules exist for same pest (e.g., EARLY_SHOOT_BORER,
    // early_shoot_borer_tillering, Early Shoot Borer infestation)
    // We MUST deduplicate to avoid showing duplicate options to farmers
    // ═══════════════════════════════════════════════════════════════════════
    
    // Sort by score first
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
    
    const varietyAdjustedCount = scoredCandidates.filter((c) => c.variety_modifier !== undefined).length;
    if (input.variety_resistance && input.variety_resistance.length > 0) {
      console.log(`   🧬 [HypothesisEval] Variety profile applied: ${input.variety_resistance.length} resistance entries, ${varietyAdjustedCount}/${scoredCandidates.length} candidates re-weighted`);
    }
    console.log(`   ✅ [HypothesisEval] Top ${topCandidates.length} unique candidates (from ${scoredCandidates.length} scored, ${rulesRaw.length} loaded):`);
    topCandidates.forEach((c, i) => {
      const varietyTag = c.variety_modifier
        ? ` [variety ${c.variety_resistance_level}×${c.variety_modifier.toFixed(2)} via ${c.variety_resistance_match}]`
        : '';
      console.log(`      ${i + 1}. ${c.cause} (${c.canonical_group}) - score: ${(c.total_score * 100).toFixed(0)}%${varietyTag}`);
    });
    
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

// ═══════════════════════════════════════════════════════════════════════════
// CHECK IF AN OBSERVATION DIFFERENTIATES BETWEEN HYPOTHESES
// Higher score if the observation helps distinguish between candidates
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// NDVI CONSISTENCY CHECK
// Adjust option ranking based on NDVI signals
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL OBSERVABILITY SCORE
// Prefer symptoms that farmers can easily observe without tools
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC CONFIRMATION OPTIONS GENERATOR (Trust-First Mode)
// ═══════════════════════════════════════════════════════════════════════════
// When terminal damage is detected (plant died, whole plant affected),
// generate cause-confirmation options from rule observable_characteristics.
// These options help differentiate between hypotheses (pest vs disease vs abiotic).
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticConfirmationOption {
  label_mr: string;
  label_hi: string;
  label_en: string;
  observation_key: string;
  diagnostic_power: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_boost: number;
  source_rule_id?: string;
  icon?: string;
}

export interface DiagnosticConfirmationResult {
  question_mr: string;
  question_hi: string;
  question_en: string;
  options: DiagnosticConfirmationOption[];
  photo_option_included: boolean;
  hypotheses_count: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SSOT: Observation labels now loaded from observation_translations table
// The loadObservationLabels function in i18n/observation-label-loader.ts
// fetches display text from database instead of hardcoded dictionaries
// ═══════════════════════════════════════════════════════════════════════════

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

/**
 * Generate DIAGNOSTIC_CONFIRMATION options from candidate hypotheses.
 * 
 * This function:
 * 1. Takes top candidate rules from hypothesis evaluation
 * 2. Extracts unique observable_characteristics
 * 3. Ranks by diagnostic power (differentiation ability)
 * 4. Returns max 4-5 options + mandatory photo option
 * 5. Removes "NONE_OF_THE_ABOVE" - replaced with "Take Photo"
 */
/**
 * Generate DIAGNOSTIC_CONFIRMATION options from candidate hypotheses.
 * 
 * AGRONOMIST PRINCIPLE:
 * When terminal damage is detected, we CONFIRM THE CAUSE - not the LOCATION.
 * This mirrors real agronomist behavior: "If the whole plant died, I don't ask 
 * which part - I ask for evidence to find the cause"
 * 
 * This function:
 * 1. Takes top candidate rules from hypothesis evaluation
 * 2. Extracts unique observable_characteristics with field verifiability
 * 3. Ranks by diagnostic power (differentiation ability), not symptom frequency
 * 4. Returns max 4-6 options + mandatory photo option
 * 5. NEVER includes "NONE_OF_THE_ABOVE" - replaced with "Take Photo"
 */
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RANKING: By diagnostic weight (40%) + field verifiability (40%) + differentiation (20%)
  // This prioritizes options farmers can actually observe and that distinguish causes
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SSOT NOTE: For full compliance, this function should be made async and
  // load labels from observation_translations table using loadObservationLabels().
  // Current implementation uses observation_key for i18n_key resolution at UI layer.
  // ═══════════════════════════════════════════════════════════════════════════
  
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MANDATORY: Add "Take Photo" as FINAL option
  // HARD RULE: NEVER include "NONE_OF_THE_ABOVE"
  // Agronomic principle: If verbal confirmation fails, visual evidence is next step
  // SSOT: Photo option uses i18n_key for UI layer resolution
  // ═══════════════════════════════════════════════════════════════════════════
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

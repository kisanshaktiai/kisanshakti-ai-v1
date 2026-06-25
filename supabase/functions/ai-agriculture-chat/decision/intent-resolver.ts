/**
 * ARCHITECTURAL CONTRACT — INTENT RESOLVER
 *
 * This module:
 * - Maps intent_code → observation_code[]
 * - Enforces biological validity via crop + DAS
 *
 * This module MUST NOT:
 * - handle language
 * - generate text
 * - decide clarification
 * - perform diagnosis
 *
 * All narration is handled by the LLM response layer.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT RESOLVER v2.0.0 - PURE SYMBOLIC RESOLUTION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Maps LLM-detected intents to database-validated observations.
 * This is the bridge between language-agnostic intent detection and
 * crop-stage specific observation codes.
 * 
 * FLOW:
 * 1. LLM extracts intent_code (e.g., COLOR_CHANGE, STEM_DAMAGE)
 * 2. This module queries intent_observation_mapping table
 * 3. Returns biologically valid observation_codes for the crop/DAS
 * 
 * NO LANGUAGE HANDLING - Pure symbolic codes only.
 * NO CLARIFICATION LOGIC - Decided by confidence gates downstream.
 * NO UI TEXT - Handled by narration layer.
 * 
 * @version 2.0.0
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

export const INTENT_RESOLVER_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS - PURE SYMBOLIC (NO LANGUAGE, NO UI TEXT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input for intent resolution - NO language field
 */
export interface IntentResolverInput {
  intent_code: string;
  crop_code: string;
  days_since_sowing: number;
  growth_stage?: string;
}

/**
 * Output from intent resolution - observation codes ONLY
 */
export interface IntentResolverOutput {
  success: boolean;
  intent_code: string;
  crop_code: string;
  growth_stage: string;
  observation_codes: string[];
  confidence_ranks: number[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }
  
  return createClient(url, key);
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE LOOKUP FROM DATABASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get growth stage from DAS using crop_stage_master table
 */
export async function getStageFromDASDatabase(
  cropCode: string,
  das: number
): Promise<string> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('crop_stage_master')
    .select('growth_stage')
    .eq('crop_code', cropCode.toUpperCase())
    .lte('das_min', das)
    .gte('das_max', das)
    .single();
  
  if (error) {
    console.warn(`[IntentResolver] Stage lookup error: ${error.message}`);
    return 'UNKNOWN';
  }
  
  return data?.growth_stage || 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION LOOKUP FROM DATABASE - CODES ONLY, NO TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

interface ObservationMapping {
  observation_code: string;
  confidence_rank: number;
  growth_stage?: string;
  crop_code?: string;
  assertion_strength?: string;
}

/**
 * Stage synonyms — pass ALL biologically equivalent stages to the DB so we
 * don't drop curated rows (e.g. SEEDLING also matches nursery + germination).
 */
const STAGE_SYNONYMS: Record<string, string[]> = {
  seedling:     ['seedling', 'nursery', 'germination', 'emergence'],
  nursery:      ['nursery', 'seedling', 'germination'],
  germination:  ['germination', 'nursery', 'seedling', 'emergence'],
  emergence:    ['emergence', 'germination', 'seedling', 'nursery'],
  vegetative:   ['vegetative', 'tillering'],
  tillering:    ['tillering', 'vegetative'],
  flowering:    ['flowering', 'reproductive', 'grand_growth'],
  reproductive: ['reproductive', 'flowering', 'grand_growth'],
  grand_growth: ['grand_growth', 'flowering', 'reproductive'],
  maturity:     ['maturity', 'ripening', 'maturation'],
  ripening:     ['ripening', 'maturity', 'maturation'],
  maturation:   ['maturation', 'maturity', 'ripening'],
  harvest:      ['harvest', 'harvesting'],
};

export function expandStageSynonyms(stage?: string | null): string[] {
  if (!stage) return ['all'];
  const key = String(stage).toLowerCase().trim().replace(/[\s-]/g, '_');
  const syn = STAGE_SYNONYMS[key] || [key];
  return Array.from(new Set([...syn, 'all']));
}

/**
 * Get valid observation codes for an intent + crop + stage + DAS from database.
 * Returns ONLY codes and confidence ranks - NO translations.
 *
 * R4 FIX: Filters by crop_code, growth_stage (with synonyms), and DAS range.
 * These columns DO exist on intent_observation_mapping (verified in DB).
 */
export async function getValidObservationCodes(
  intentCode: string,
  cropCode: string,
  das: number,
  growthStage?: string | null
): Promise<ObservationMapping[]> {
  const supabase = getSupabaseClient();

  const cropLower = (cropCode || '').toLowerCase();
  const cropVariants = Array.from(new Set([cropLower, 'all'].filter(Boolean)));
  const stageVariants = expandStageSynonyms(growthStage);

  console.log(`📊 [IntentResolver] Querying: intent=${intentCode}, crop=${cropVariants.join('|')}, stages=${stageVariants.join('|')}, DAS=${das}`);

  const { data: mappings, error: mapError } = await supabase
    .from('intent_observation_mapping')
    .select('observation_code, confidence_rank, growth_stage, crop_code, das_min, das_max, assertion_strength')
    .eq('intent_code', intentCode)
    .eq('is_active', true)
    .in('crop_code', cropVariants)
    .in('growth_stage', stageVariants)
    .order('confidence_rank', { ascending: true });

  if (mapError) {
    console.error(`[IntentResolver] Mapping query error: ${mapError.message}`);
    return [];
  }

  if (!mappings || mappings.length === 0) {
    console.log(`[IntentResolver] No mappings found for intent=${intentCode}, crop=${cropLower}, stage=${growthStage}`);
    return [];
  }

  // DAS gate (done in-memory to avoid raw SQL)
  const dasFiltered = (mappings as any[]).filter((m: any) => {
    if (typeof das !== 'number' || !isFinite(das)) return true;
    const lo = typeof m.das_min === 'number' ? m.das_min : 0;
    const hi = typeof m.das_max === 'number' ? m.das_max : 9999;
    return das >= lo && das <= hi;
  });

  // Dedupe by observation_code, keep best (lowest) confidence_rank
  const byCode = new Map<string, ObservationMapping>();
  for (const m of dasFiltered) {
    const prev = byCode.get(m.observation_code);
    if (!prev || (m.confidence_rank ?? 99) < (prev.confidence_rank ?? 99)) {
      byCode.set(m.observation_code, m as ObservationMapping);
    }
  }

  const result = Array.from(byCode.values()).sort(
    (a, b) => (a.confidence_rank ?? 99) - (b.confidence_rank ?? 99)
  );

  console.log(`✅ [IntentResolver] Found ${result.length} observation codes (raw=${mappings.length}, das_filtered=${dasFiltered.length}) for intent=${intentCode}`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RESOLVER FUNCTION - PURE SYMBOLIC OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve an intent to biologically valid observation codes
 * 
 * @param input - Intent code, crop, DAS (NO language)
 * @returns Observation codes and confidence ranks ONLY
 */
export async function resolveIntentToObservations(
  input: IntentResolverInput
): Promise<IntentResolverOutput> {
  const { intent_code, crop_code, days_since_sowing } = input;
  
  console.log(`\n🔍 [IntentResolver v${INTENT_RESOLVER_VERSION}] Resolving intent...`);
  console.log(`   Intent: ${intent_code}`);
  console.log(`   Crop: ${crop_code}, DAS: ${days_since_sowing}`);
  
  try {
    // 1. Get growth stage from database
    const growthStage = input.growth_stage || await getStageFromDASDatabase(crop_code, days_since_sowing);
    
    console.log(`   Stage: ${growthStage}`);
    
    // 2. Get valid observation codes for this intent + crop + DAS + stage
    const mappings = await getValidObservationCodes(
      intent_code,
      crop_code,
      days_since_sowing,
      growthStage
    );
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MANDATORY MAPPING GATE: If no mapping found, HALT pipeline
    // Do NOT proceed with empty mapping — log explicit error
    // ═══════════════════════════════════════════════════════════════════════════
    if (!mappings || mappings.length === 0) {
      const errorMsg = `MANDATORY_MAPPING_FAILED: No observation mappings found for intent=${intent_code}, crop=${crop_code}, DAS=${days_since_sowing}`;
      console.error(`🚨 [IntentResolver] ${errorMsg}`);
      console.error(`   Pipeline HALTED — cannot proceed without observation mappings`);
      console.error(`   Check intent_observation_mapping table for intent_code=${intent_code}`);
      
      return {
        success: false,
        intent_code,
        crop_code: crop_code.toUpperCase(),
        growth_stage: growthStage,
        observation_codes: [],
        confidence_ranks: [],
        error: errorMsg
      };
    }
    
    // 3. Extract codes and ranks into parallel arrays
    const observation_codes = mappings.map(m => m.observation_code);
    const confidence_ranks = mappings.map(m => m.confidence_rank);
    
    console.log(`   Found: ${observation_codes.length} observation codes`);
    
    return {
      success: true,
      intent_code,
      crop_code: crop_code.toUpperCase(),
      growth_stage: growthStage,
      observation_codes,
      confidence_ranks
    };
    
  } catch (error) {
    console.error(`❌ [IntentResolver] Error: ${error}`);
    
    return {
      success: false,
      intent_code,
      crop_code: crop_code.toUpperCase(),
      growth_stage: 'UNKNOWN',
      observation_codes: [],
      confidence_ranks: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPER - PURE SYMBOLIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate if an observation is biologically valid for crop/stage/DAS
 * Used by agronomic-observation-validator.ts
 */
export async function isObservationValidForCropStage(
  observationCode: string,
  cropCode: string,
  das: number
): Promise<{ valid: boolean; reason_code: string }> {
  const supabase = getSupabaseClient();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HOTFIX: Query by observation_code + is_active ONLY
  // crop_code/das_min/das_max columns don't exist yet. Re-enable after migration.
  // ═══════════════════════════════════════════════════════════════════════════
  const { data, error } = await supabase
    .from('intent_observation_mapping')
    .select('id')
    .eq('observation_code', observationCode)
    .eq('is_active', true)
    .limit(1);
  
  if (error) {
    console.error(`[IntentResolver] Validation DB error: ${error.message}`);
    return { valid: false, reason_code: 'VALIDATION_UNAVAILABLE' };
  }
  
  if (data && data.length > 0) {
    return { valid: true, reason_code: 'VALID_FOR_OBSERVATION' };
  }
  
  return {
    valid: false,
    reason_code: 'OBSERVATION_NOT_MAPPED'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ALL VALID INTENTS
// ═══════════════════════════════════════════════════════════════════════════

export const VALID_INTENT_CODES = [
  'EMERGENCE_FAILURE',
  'GROWTH_ANOMALY',
  'COLOR_CHANGE',
  'WILTING_OR_DROOPING',
  'LEAF_DAMAGE_VISIBLE',
  'LEAF_MARKS_OR_SPOTS',
  'STEM_DAMAGE',
  'ROOT_OR_BASE_PROBLEM',
  'PEST_PRESENCE_VISIBLE',
  'DISEASE_LIKE_PATTERN',
  'WATER_STRESS_SIGNAL',
  'NUTRIENT_STRESS_SIGNAL',
  'UNEVEN_FIELD_PATTERN',
  'YIELD_OR_OUTPUT_ISSUE',
  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTION FIX: Missing intent codes for common farmer queries
  // Without these, weed/fertilizer/irrigation queries fall to UNKNOWN_OBSERVATION
  // ═══════════════════════════════════════════════════════════════════════════
  'WEED_PROBLEM',
  'FERTILIZER_SCHEDULE',
  'IRRIGATION_QUERY',
  'HARVEST_TIMING',
  'GENERAL_CROP_INFO',
  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2 FIX: INPUT_RECOMMENDATION and SOIL_TESTING_QUERY intents
  // "काय टाकू" / "काय द्यायचं" = direct prescription request, NOT general info
  // ═══════════════════════════════════════════════════════════════════════════
  'INPUT_RECOMMENDATION',
  'SOIL_TESTING_QUERY',
  'SEED_SELECTION',
  'MARKET_PRICE_QUERY',
  'WEATHER_QUERY',
  // ═══════════════════════════════════════════════════════════════════════════
  // ORPHAN FIX: Intent codes used in intent_observation_mapping but missing
  // from whitelist. Without these, mapped observations are unreachable.
  // ═══════════════════════════════════════════════════════════════════════════
  'BORER_IDENTIFICATION',
  'FLOOD_DROUGHT_DAMAGE',
  'ANIMAL_DAMAGE',
  'RATOON_MANAGEMENT_QUERY',
  'UNKNOWN_OBSERVATION'
] as const;

export type IntentCode = typeof VALID_INTENT_CODES[number];

/**
 * Check if a string is a valid intent code
 */
export function isValidIntentCode(code: string): code is IntentCode {
  return VALID_INTENT_CODES.includes(code as IntentCode);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  resolveIntentToObservations,
  getStageFromDASDatabase,
  getValidObservationCodes,
  isObservationValidForCropStage,
  isValidIntentCode,
  VALID_INTENT_CODES,
  INTENT_RESOLVER_VERSION
};

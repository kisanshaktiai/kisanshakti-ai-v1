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

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';
import type { RequestScope } from '../runtime/request-scope.ts';
import { IntentResolutionError } from '../runtime/request-scope.ts';

export const INTENT_RESOLVER_VERSION = '2.1.0';

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
  /**
   * Optional per-request scope. When provided, the resolver uses
   * `scope.db` and emits trace events instead of constructing its own
   * Supabase client. Required for new code paths (Task 7 migration).
   */
  scope?: RequestScope;
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

function resolveClient(scope?: RequestScope): SupabaseClient {
  if (scope) return scope.db;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new IntentResolutionError('MISSING_DB_CREDENTIALS');
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
  das: number,
  scope?: RequestScope
): Promise<string> {
  const supabase = resolveClient(scope);

  const { data, error } = await supabase
    .from('crop_stage_master')
    .select('growth_stage')
    .eq('crop_code', cropCode.toUpperCase())
    .lte('das_min', das)
    .gte('das_max', das)
    .single();

  if (error) {
    // PGRST116 = "no rows returned" → legitimately UNKNOWN, not a fault.
    if ((error as { code?: string }).code === 'PGRST116') {
      return 'UNKNOWN';
    }
    scope?.emit({
      stage: 'intent-resolver',
      kind: 'error',
      payload: { fn: 'getStageFromDASDatabase', cropCode, das, message: error.message },
    });
    throw new IntentResolutionError('STAGE_LOOKUP_DB_ERROR', {
      cropCode,
      das,
      dbError: error.message,
    });
  }

  return data?.growth_stage || 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION LOOKUP FROM DATABASE - CODES ONLY, NO TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

interface ObservationMapping {
  observation_code: string;
  confidence_rank: number;
}

/**
 * Get valid observation codes for an intent + crop + DAS from database.
 *
 * v2.1 (Task 5): Restored the crop_code + das_min/das_max + growth_stage
 * filters that the 2026-03 HOTFIX had disabled. The columns exist on
 * `intent_observation_mapping` (verified via information_schema) and the
 * filtered query returns healthy row counts across all common intents
 * (dry-run: SUGARCANE @ DAS=90 → 30+ intents matched).
 *
 * `crop_code` is matched against `IN (cropCode, 'ALL')` so cross-crop
 * mappings (the 23 'ALL' rows in production) continue to fire.
 *
 * DB errors now throw `IntentResolutionError` (fail-closed) instead of
 * the previous silent `return []` (fail-open).
 */
export async function getValidObservationCodes(
  intentCode: string,
  cropCode: string,
  das: number,
  growthStage?: string,
  scope?: RequestScope
): Promise<ObservationMapping[]> {
  const supabase = resolveClient(scope);
  const cropUpper = cropCode.toUpperCase();

  console.log(
    `📊 [IntentResolver] Querying: intent=${intentCode}, crop=${cropUpper}, DAS=${das}, stage=${growthStage ?? '*'}`
  );

  let query = supabase
    .from('intent_observation_mapping')
    .select('observation_code, confidence_rank')
    .eq('intent_code', intentCode)
    .eq('is_active', true)
    .in('crop_code', [cropUpper, 'ALL'])
    .lte('das_min', das)
    .gte('das_max', das);

  if (growthStage && growthStage !== 'UNKNOWN') {
    // 'ALL' is the wildcard convention used in this table.
    query = query.in('growth_stage', [growthStage.toUpperCase(), 'ALL']);
  }

  const { data: mappings, error: mapError } = await query.order('confidence_rank', {
    ascending: true,
  });

  if (mapError) {
    scope?.emit({
      stage: 'intent-resolver',
      kind: 'error',
      payload: {
        fn: 'getValidObservationCodes',
        intentCode,
        cropCode: cropUpper,
        das,
        growthStage,
        message: mapError.message,
      },
    });
    throw new IntentResolutionError('MAPPING_DB_ERROR', {
      intentCode,
      cropCode: cropUpper,
      das,
      growthStage,
      dbError: mapError.message,
    });
  }

  if (!mappings || mappings.length === 0) {
    console.log(
      `[IntentResolver] No mappings for intent=${intentCode} crop=${cropUpper} DAS=${das} stage=${growthStage ?? '*'}`
    );
    return [];
  }

  console.log(
    `✅ [IntentResolver] Found ${mappings.length} observation codes for intent=${intentCode}`
  );

  return mappings;
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
    
    // 2. Get valid observation codes for this intent + crop + DAS
    const mappings = await getValidObservationCodes(
      intent_code,
      crop_code,
      days_since_sowing
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
  // ═══════════════════════════════════════════════════════════════════════════
  // NEXT-CROP RECOMMENDATION (Phase 1 — P0 fix)
  // Farmer asks "which new crop should I grow?" on a fallow/post-harvest field.
  // Routes to symbolic decision brain for rotation-aware crop selection.
  // Registered in observation_intent_master with requires_crop_context=false.
  // ═══════════════════════════════════════════════════════════════════════════
  'NEXT_CROP_RECOMMENDATION',
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

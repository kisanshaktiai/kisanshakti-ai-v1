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

  // Post-migration: crop_stage_master.crop_code is lowercase canonical.
  const { data, error } = await supabase
    .from('crop_stage_master')
    .select('growth_stage')
    .eq('crop_code', (cropCode || '').toLowerCase())
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

  // Egress translation: DB rows are lowercase post-migration; callers compare to UPPER.
  return String(data?.growth_stage || 'UNKNOWN').toUpperCase();
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
  // Post-migration canonical casing on intent_observation_mapping:
  //   intent_code  → UPPER   (legacy, unchanged)
  //   crop_code    → lower
  //   growth_stage → lower
  //   observation_code → lower
  const cropLc = (cropCode || '').toLowerCase();
  const stageLc = growthStage ? growthStage.toLowerCase() : undefined;

  console.log(
    `📊 [IntentResolver] Querying: intent=${intentCode}, crop=${cropLc}, DAS=${das}, stage=${stageLc ?? '*'}`
  );

  let query = supabase
    .from('intent_observation_mapping')
    .select('observation_code, confidence_rank')
    .eq('intent_code', intentCode)
    .eq('is_active', true)
    .in('crop_code', [cropLc, 'all'])
    .lte('das_min', das)
    .gte('das_max', das);

  if (stageLc && stageLc !== 'unknown') {
    // 'all' is the wildcard convention used in this table (post lower-case migration).
    // Early rice establishment can be labelled nursery/germination/seedling by
    // different authoritative tables; treat those labels as one family.
    const establishmentFamily = ['germination', 'nursery', 'seedling', 'emergence', 'establishment'];
    const stageCandidates = establishmentFamily.includes(stageLc)
      ? [...establishmentFamily, 'all']
      : [stageLc, 'all'];
    query = query.in('growth_stage', Array.from(new Set(stageCandidates)));
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
        cropCode: cropLc,
        das,
        growthStage,
        message: mapError.message,
      },
    });
    throw new IntentResolutionError('MAPPING_DB_ERROR', {
      intentCode,
      cropCode: cropLc,
      das,
      growthStage,
      dbError: mapError.message,
    });
  }

  if (!mappings || mappings.length === 0) {
    // Defensive fallback (Task 2): retry via case-insensitive RPC. Protects
    // against any future casing drift on intent_observation_mapping that
    // would silently kill the symbolic brain.
    try {
      const { data: rpcRows, error: rpcErr } = await supabase.rpc(
        'fn_observations_for_intent_ci',
        { p_intent_code: intentCode, p_crop_code: cropLc, p_growth_stage: stageLc ?? null }
      );
      if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
        console.log(
          `[IntentResolver] RPC fallback recovered ${rpcRows.length} mappings for intent=${intentCode} crop=${cropLc}`
        );
        scope?.emit({
          stage: 'intent-resolver',
          kind: 'derive',
          payload: { fn: 'rpc_ci_fallback_hit', intentCode, cropCode: cropLc, count: rpcRows.length },
        });
        return rpcRows as ObservationMapping[];
      }
    } catch (e) {
      console.warn(`[IntentResolver] RPC fallback failed: ${(e as Error).message}`);
    }

    console.log(
      `[IntentResolver] No mappings for intent=${intentCode} crop=${cropLc} DAS=${das} stage=${growthStage ?? '*'}`
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
  const { intent_code, crop_code, days_since_sowing, scope } = input;

  console.log(`\n🔍 [IntentResolver v${INTENT_RESOLVER_VERSION}] Resolving intent...`);
  console.log(`   Intent: ${intent_code}`);
  console.log(`   Crop: ${crop_code}, DAS: ${days_since_sowing}`);

  try {
    // 1. Get growth stage from database
    const growthStage =
      input.growth_stage ||
      (await getStageFromDASDatabase(crop_code, days_since_sowing, scope));

    console.log(`   Stage: ${growthStage}`);

    // 2. Get valid observation codes for this intent + crop + DAS + stage
    const mappings = await getValidObservationCodes(
      intent_code,
      crop_code,
      days_since_sowing,
      growthStage,
      scope
    );

    // ═════════════════════════════════════════════════════════════════════
    // MANDATORY MAPPING GATE: empty result is a legitimate "no mapping"
    // outcome (not a fault). Return success:false with a structured error
    // so the caller can degrade gracefully.
    // ═════════════════════════════════════════════════════════════════════
    if (!mappings || mappings.length === 0) {
      const errorMsg = `MANDATORY_MAPPING_FAILED: No observation mappings found for intent=${intent_code}, crop=${crop_code}, DAS=${days_since_sowing}, stage=${growthStage}`;
      console.error(`🚨 [IntentResolver] ${errorMsg}`);
      scope?.emit({
        stage: 'intent-resolver',
        kind: 'block',
        payload: { intent_code, crop_code, das: days_since_sowing, growthStage },
      });

      return {
        success: false,
        intent_code,
        crop_code: crop_code.toUpperCase(),
        growth_stage: growthStage,
        observation_codes: [],
        confidence_ranks: [],
        error: errorMsg,
      };
    }

    // Re-uppercase outputs to preserve the in-memory symbolic contract
    // (downstream comparators use UPPER snake_case). DB stores lowercase
    // canonical post-migration; this is the case-translation egress boundary.
    const observation_codes = mappings.map((m) => String(m.observation_code).toUpperCase());
    const confidence_ranks = mappings.map((m) => m.confidence_rank);

    console.log(`   Found: ${observation_codes.length} observation codes`);

    return {
      success: true,
      intent_code,
      crop_code: crop_code.toUpperCase(),
      growth_stage: String(growthStage || '').toUpperCase() || 'UNKNOWN',
      observation_codes,
      confidence_ranks,
    };
  } catch (error) {
    // DB-fault path: re-throw typed errors so the orchestrator boundary
    // can convert them to `{ error, trace_id }` 500 (fail-closed). Unknown
    // errors are wrapped in IntentResolutionError to preserve the contract.
    if (error instanceof IntentResolutionError) throw error;
    console.error(`❌ [IntentResolver] Unexpected error: ${error}`);
    throw new IntentResolutionError('UNEXPECTED_RESOLVER_ERROR', {
      intent_code,
      crop_code,
      das: days_since_sowing,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPER - PURE SYMBOLIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate if an observation is biologically valid for crop/stage/DAS.
 * Used by agronomic-observation-validator.ts.
 *
 * v2.1 (Task 5): Restored the crop_code + das_min/das_max filters; DB-fault
 * now throws `IntentResolutionError` instead of fail-open `valid:false`.
 */
export async function isObservationValidForCropStage(
  observationCode: string,
  cropCode: string,
  das: number,
  scope?: RequestScope
): Promise<{ valid: boolean; reason_code: string }> {
  const supabase = resolveClient(scope);
  const cropLc = (cropCode || '').toLowerCase();
  const obsLc = (observationCode || '').toLowerCase();

  const { data, error } = await supabase
    .from('intent_observation_mapping')
    .select('id')
    .eq('observation_code', obsLc)
    .eq('is_active', true)
    .in('crop_code', [cropLc, 'all'])
    .lte('das_min', das)
    .gte('das_max', das)
    .limit(1);

  if (error) {
    scope?.emit({
      stage: 'intent-resolver',
      kind: 'error',
      payload: {
        fn: 'isObservationValidForCropStage',
        observationCode,
        cropCode: cropLc,
        das,
        message: error.message,
      },
    });
    throw new IntentResolutionError('VALIDATION_DB_ERROR', {
      observationCode,
      cropCode: cropLc,
      das,
      dbError: error.message,
    });
  }

  if (data && data.length > 0) {
    return { valid: true, reason_code: 'VALID_FOR_OBSERVATION' };
  }

  const establishmentFamily = ['germination', 'nursery', 'seedling', 'emergence', 'establishment'];
  const { data: familyData, error: familyError } = await supabase
    .from('intent_observation_mapping')
    .select('id')
    .eq('observation_code', obsLc)
    .eq('is_active', true)
    .in('crop_code', [cropLc, 'all'])
    .in('growth_stage', establishmentFamily)
    .lte('das_min', das)
    .gte('das_max', das)
    .limit(1);

  if (familyError) {
    throw new IntentResolutionError('VALIDATION_DB_ERROR', {
      observationCode,
      cropCode: cropLc,
      das,
      dbError: familyError.message,
    });
  }

  if (familyData && familyData.length > 0) {
    return { valid: true, reason_code: 'VALID_FOR_ESTABLISHMENT_STAGE_FAMILY' };
  }

  return { valid: false, reason_code: 'OBSERVATION_NOT_MAPPED' };
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

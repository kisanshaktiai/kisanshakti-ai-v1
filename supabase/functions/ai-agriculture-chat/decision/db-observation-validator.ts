/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATABASE-DRIVEN OBSERVATION VALIDATOR v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Validates observations against crop-stage biology using DATABASE QUERIES ONLY.
 * This replaces the hardcoded STAGE_OBSERVATION_RULES with database lookups.
 * 
 * TABLES USED:
 * - crop_stage_master: DAS → Growth Stage mapping
 * - intent_observation_mapping: Valid observations per crop/stage
 * - observation_master: Observation definitions
 * 
 * NO HARDCODED RULES - All validation logic comes from database.
 * 
 * @version 1.0.0
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { EngineDataError } from '../runtime/request-scope.ts';

export const DB_VALIDATOR_VERSION = '1.1.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationInput {
  crop_code: string;
  days_since_sowing: number;
  observation_code: string;
}

export interface ValidationOutput {
  valid: boolean;
  observation_code: string;
  crop_code: string;
  growth_stage: string;
  reason: string;
  correction_suggestion?: string;
  clarification_question?: string;
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
// STAGE LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get growth stage from DAS using database
 */
export async function getGrowthStageFromDB(
  cropCode: string,
  das: number
): Promise<string> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('crop_stage_master')
    .select('growth_stage')
    .eq('crop_code', (cropCode || '').toLowerCase())
    .lte('das_min', das)
    .gte('das_max', das)
    .single();
  
  if (error) {
    console.warn(`[DBValidator] Stage lookup error: ${error.message}`);
    // Try without exact range match - get closest
    const { data: closest } = await supabase
      .from('crop_stage_master')
      .select('growth_stage, das_min, das_max')
      .eq('crop_code', (cropCode || '').toLowerCase())
      .order('das_min', { ascending: true });
    
    if (closest && closest.length > 0) {
      // Find the stage where DAS falls
      for (const stage of closest) {
        if (das >= stage.das_min && das <= stage.das_max) {
          return String(stage.growth_stage || 'UNKNOWN').toUpperCase();
        }
      }
      // If past all stages, return last
      return String(closest[closest.length - 1]?.growth_stage || 'UNKNOWN').toUpperCase();
    }

    return 'UNKNOWN';
  }

  // Egress translation: DB rows are lowercase post-migration; callers compare to UPPER.
  return String(data?.growth_stage || 'UNKNOWN').toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an observation is valid for a crop at given DAS
 */
export async function validateObservationFromDB(
  input: ValidationInput
): Promise<ValidationOutput> {
  const supabase = getSupabaseClient();
  const { crop_code, days_since_sowing, observation_code } = input;
  // Post-migration canonical casing: crop_code, observation_code, growth_stage are all lowercase in DB.
  const cropLc = (crop_code || '').toLowerCase();
  const obsLc = (observation_code || '').toLowerCase();

  console.log(`🔬 [DBValidator] Validating: ${obsLc} for ${cropLc} @ DAS ${days_since_sowing}`);
  
  // 1. Get growth stage
  const growthStage = await getGrowthStageFromDB(cropLc, days_since_sowing);
  console.log(`   Stage: ${growthStage}`);
  
  if (growthStage === 'UNKNOWN') {
    return {
      valid: true, // Allow if we can't determine stage
      observation_code: obsLc,
      crop_code: cropLc,
      growth_stage: 'UNKNOWN',
      reason: `Crop ${cropLc} not found in database - allowing observation`
    };
  }
  
  // 2. Check if observation exists in mapping for this crop/DAS
  const { data: mapping, error } = await supabase
    .from('intent_observation_mapping')
    .select('observation_code, intent_code')
    .eq('observation_code', obsLc)
    .eq('crop_code', cropLc)
    .lte('das_min', days_since_sowing)
    .gte('das_max', days_since_sowing)
    .eq('is_active', true)
    .limit(1);
  
  if (error) {
    console.warn(`[DBValidator] Query error: ${error.message}`);
    return {
      valid: true, // Allow on error
      observation_code: obsLc,
      crop_code: cropLc,
      growth_stage: growthStage,
      reason: 'Database error - allowing observation'
    };
  }
  
  // 3. Check result
  if (mapping && mapping.length > 0) {
    console.log(`   ✅ VALID: ${obsLc} found in mapping`);
    return {
      valid: true,
      observation_code: obsLc,
      crop_code: cropLc,
      growth_stage: growthStage,
      reason: `${obsLc} is biologically valid for ${cropLc}/${growthStage}`
    };
  }
  
  // 4. NOT FOUND - Check if there are any similar valid observations
  console.log(`   ⚠️ INVALID: ${obsLc} not found for ${cropLc}/${growthStage}`);
  
  // Get valid observations for this stage to suggest corrections
  const { data: validObs } = await supabase
    .from('intent_observation_mapping')
    .select('observation_code')
    .eq('crop_code', cropLc)
    .lte('das_min', days_since_sowing)
    .gte('das_max', days_since_sowing)
    .eq('is_active', true)
    .order('confidence_rank', { ascending: true })
    .limit(5);
  
  const suggestions = validObs?.map(o => o.observation_code) || [];
  
  return {
    valid: false,
    observation_code: obsLc,
    crop_code: cropLc,
    growth_stage: growthStage,
    reason: `${obsLc} is not biologically valid for ${cropLc} at ${growthStage} stage (DAS ${days_since_sowing})`,
    correction_suggestion: suggestions.length > 0 ? suggestions[0] : undefined,
    clarification_question: `This observation is unusual at ${growthStage} stage. Did you mean one of: ${suggestions.join(', ')}?`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate multiple observations at once
 */
export async function validateMultipleObservations(
  cropCode: string,
  das: number,
  observationCodes: string[]
): Promise<{
  valid: string[];
  invalid: string[];
  results: ValidationOutput[];
}> {
  const results: ValidationOutput[] = [];
  const valid: string[] = [];
  const invalid: string[] = [];
  
  for (const obsCode of observationCodes) {
    const result = await validateObservationFromDB({
      crop_code: cropCode,
      days_since_sowing: das,
      observation_code: obsCode
    });
    
    results.push(result);
    if (result.valid) {
      valid.push(obsCode);
    } else {
      invalid.push(obsCode);
    }
  }
  
  return { valid, invalid, results };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET VALID OBSERVATIONS FOR STAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all valid observation codes for a crop at given DAS
 */
export async function getValidObservationsForStage(
  cropCode: string,
  das: number
): Promise<string[]> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('intent_observation_mapping')
    .select('observation_code')
    .eq('crop_code', (cropCode || '').toLowerCase())
    .lte('das_min', das)
    .gte('das_max', das)
    .eq('is_active', true);
  
  if (error) {
    // Task 6: fail-closed on real DB error so callers don't silently get an
    // empty observation set (which would let invalid observations through
    // the downstream `validateMultipleObservations` partition).
    throw new EngineDataError('OBSERVATIONS_LOAD_DB_ERROR', {
      cropCode: cropCode.toUpperCase(),
      das,
      dbError: error.message,
    });
  }
  if (!data || data.length === 0) {
    // Legitimately empty: no observations are valid for this crop/DAS.
    return [];
  }
  
  // Deduplicate
  return [...new Set(data.map(d => d.observation_code))];
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  validateObservationFromDB,
  validateMultipleObservations,
  getGrowthStageFromDB,
  getValidObservationsForStage,
  DB_VALIDATOR_VERSION
};

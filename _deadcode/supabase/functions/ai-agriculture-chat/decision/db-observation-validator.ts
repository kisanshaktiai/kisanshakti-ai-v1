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

export const DB_VALIDATOR_VERSION = '1.0.0';

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
    .eq('crop_code', cropCode.toUpperCase())
    .lte('das_min', das)
    .gte('das_max', das)
    .single();
  
  if (error) {
    console.warn(`[DBValidator] Stage lookup error: ${error.message}`);
    // Try without exact range match - get closest
    const { data: closest } = await supabase
      .from('crop_stage_master')
      .select('growth_stage, das_min, das_max')
      .eq('crop_code', cropCode.toUpperCase())
      .order('das_min', { ascending: true });
    
    if (closest && closest.length > 0) {
      // Find the stage where DAS falls
      for (const stage of closest) {
        if (das >= stage.das_min && das <= stage.das_max) {
          return stage.growth_stage;
        }
      }
      // If past all stages, return last
      return closest[closest.length - 1]?.growth_stage || 'UNKNOWN';
    }
    
    return 'UNKNOWN';
  }
  
  return data?.growth_stage || 'UNKNOWN';
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
  const cropUpper = crop_code.toUpperCase();
  const obsUpper = observation_code.toUpperCase();
  
  console.log(`🔬 [DBValidator] Validating: ${obsUpper} for ${cropUpper} @ DAS ${days_since_sowing}`);
  
  // 1. Get growth stage
  const growthStage = await getGrowthStageFromDB(cropUpper, days_since_sowing);
  console.log(`   Stage: ${growthStage}`);
  
  if (growthStage === 'UNKNOWN') {
    return {
      valid: true, // Allow if we can't determine stage
      observation_code: obsUpper,
      crop_code: cropUpper,
      growth_stage: 'UNKNOWN',
      reason: `Crop ${cropUpper} not found in database - allowing observation`
    };
  }
  
  // 2. Check if observation exists in mapping for this crop/DAS
  const { data: mapping, error } = await supabase
    .from('intent_observation_mapping')
    .select('observation_code, intent_code')
    .eq('observation_code', obsUpper)
    .eq('crop_code', cropUpper)
    .lte('das_min', days_since_sowing)
    .gte('das_max', days_since_sowing)
    .eq('is_active', true)
    .limit(1);
  
  if (error) {
    console.warn(`[DBValidator] Query error: ${error.message}`);
    return {
      valid: true, // Allow on error
      observation_code: obsUpper,
      crop_code: cropUpper,
      growth_stage: growthStage,
      reason: 'Database error - allowing observation'
    };
  }
  
  // 3. Check result
  if (mapping && mapping.length > 0) {
    console.log(`   ✅ VALID: ${obsUpper} found in mapping`);
    return {
      valid: true,
      observation_code: obsUpper,
      crop_code: cropUpper,
      growth_stage: growthStage,
      reason: `${obsUpper} is biologically valid for ${cropUpper}/${growthStage}`
    };
  }
  
  // 4. NOT FOUND - Check if there are any similar valid observations
  console.log(`   ⚠️ INVALID: ${obsUpper} not found for ${cropUpper}/${growthStage}`);
  
  // Get valid observations for this stage to suggest corrections
  const { data: validObs } = await supabase
    .from('intent_observation_mapping')
    .select('observation_code')
    .eq('crop_code', cropUpper)
    .lte('das_min', days_since_sowing)
    .gte('das_max', days_since_sowing)
    .eq('is_active', true)
    .order('confidence_rank', { ascending: true })
    .limit(5);
  
  const suggestions = validObs?.map(o => o.observation_code) || [];
  
  return {
    valid: false,
    observation_code: obsUpper,
    crop_code: cropUpper,
    growth_stage: growthStage,
    reason: `${obsUpper} is not biologically valid for ${cropUpper} at ${growthStage} stage (DAS ${days_since_sowing})`,
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
    .eq('crop_code', cropCode.toUpperCase())
    .lte('das_min', das)
    .gte('das_max', das)
    .eq('is_active', true);
  
  if (error || !data) {
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

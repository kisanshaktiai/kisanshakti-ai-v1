/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT RESOLVER v1.0.0
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
 * 3. Returns biologically valid observations for the crop/stage/DAS
 * 
 * NO HARDCODED RULES - Everything comes from database.
 * 
 * @version 1.0.0
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.9';

export const INTENT_RESOLVER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface IntentResolverInput {
  intent_code: string;
  crop_code: string;
  days_since_sowing: number;
  growth_stage?: string;
  language: 'mr' | 'hi' | 'en';
}

export interface ResolvedObservation {
  observation_code: string;
  display_text: string;
  description_text: string;
  confidence_rank: number;
}

export interface IntentResolverOutput {
  success: boolean;
  intent_code: string;
  crop_code: string;
  growth_stage: string;
  observations: ResolvedObservation[];
  clarification_needed: boolean;
  clarification_question?: string;
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
// OBSERVATION LOOKUP FROM DATABASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get valid observations for an intent + crop + DAS from database
 */
export async function getValidObservationsForIntent(
  intentCode: string,
  cropCode: string,
  das: number,
  language: 'mr' | 'hi' | 'en' = 'en'
): Promise<ResolvedObservation[]> {
  const supabase = getSupabaseClient();
  
  console.log(`📊 [IntentResolver] Querying: intent=${intentCode}, crop=${cropCode}, DAS=${das}, lang=${language}`);
  
  // Query intent_observation_mapping with translations
  const { data: mappings, error: mapError } = await supabase
    .from('intent_observation_mapping')
    .select(`
      observation_code,
      confidence_rank,
      observation_translations!inner(
        display_text,
        description_text
      )
    `)
    .eq('intent_code', intentCode)
    .eq('crop_code', cropCode.toUpperCase())
    .eq('is_active', true)
    .lte('das_min', das)
    .gte('das_max', das)
    .eq('observation_translations.language_code', language)
    .order('confidence_rank', { ascending: true });
  
  if (mapError) {
    console.error(`[IntentResolver] Mapping query error: ${mapError.message}`);
    return [];
  }
  
  if (!mappings || mappings.length === 0) {
    console.log(`[IntentResolver] No mappings found for ${intentCode}/${cropCode}/${das}`);
    return [];
  }
  
  console.log(`✅ [IntentResolver] Found ${mappings.length} valid observations`);
  
  // Transform to output format
  return mappings.map((m: any) => ({
    observation_code: m.observation_code,
    display_text: m.observation_translations?.[0]?.display_text || m.observation_code,
    description_text: m.observation_translations?.[0]?.description_text || '',
    confidence_rank: m.confidence_rank
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT TRANSLATION LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get translated clarification question for an intent
 */
export async function getIntentClarificationQuestion(
  intentCode: string,
  language: 'mr' | 'hi' | 'en' = 'mr'
): Promise<string | null> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('intent_translations')
    .select('question_text')
    .eq('intent_code', intentCode)
    .eq('language_code', language)
    .single();
  
  if (error || !data) {
    // Fallback to English
    const { data: enData } = await supabase
      .from('intent_translations')
      .select('question_text')
      .eq('intent_code', intentCode)
      .eq('language_code', 'en')
      .single();
    
    return enData?.question_text || null;
  }
  
  return data.question_text;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RESOLVER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve an intent to biologically valid observations
 * 
 * @param input - Intent code, crop, DAS, language
 * @returns Resolved observations with translations
 */
export async function resolveIntentToObservations(
  input: IntentResolverInput
): Promise<IntentResolverOutput> {
  const { intent_code, crop_code, days_since_sowing, language } = input;
  
  console.log(`\n🔍 [IntentResolver v${INTENT_RESOLVER_VERSION}] Resolving intent...`);
  console.log(`   Intent: ${intent_code}`);
  console.log(`   Crop: ${crop_code}, DAS: ${days_since_sowing}`);
  
  try {
    // 1. Get growth stage from database
    let growthStage = input.growth_stage || await getStageFromDASDatabase(crop_code, days_since_sowing);
    
    console.log(`   Stage: ${growthStage}`);
    
    // 2. Get valid observations for this intent + crop + DAS
    const observations = await getValidObservationsForIntent(
      intent_code,
      crop_code,
      days_since_sowing,
      language
    );
    
    // 3. Determine if clarification is needed
    const clarificationNeeded = observations.length > 1;
    
    // 4. Get clarification question if needed
    let clarificationQuestion: string | undefined;
    if (clarificationNeeded) {
      clarificationQuestion = await getIntentClarificationQuestion(intent_code, language) || undefined;
    }
    
    console.log(`   Found: ${observations.length} observations, clarification: ${clarificationNeeded}`);
    
    return {
      success: true,
      intent_code,
      crop_code: crop_code.toUpperCase(),
      growth_stage: growthStage,
      observations,
      clarification_needed: clarificationNeeded,
      clarification_question: clarificationQuestion
    };
    
  } catch (error) {
    console.error(`❌ [IntentResolver] Error: ${error}`);
    
    return {
      success: false,
      intent_code,
      crop_code: crop_code.toUpperCase(),
      growth_stage: 'UNKNOWN',
      observations: [],
      clarification_needed: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate if an observation is biologically valid for crop/stage/DAS
 * Used by agronomic-observation-validator.ts
 */
export async function isObservationValidForCropStage(
  observationCode: string,
  cropCode: string,
  das: number
): Promise<{ valid: boolean; reason: string }> {
  const supabase = getSupabaseClient();
  
  // Check if this observation exists in mapping for this crop/DAS
  const { data, error } = await supabase
    .from('intent_observation_mapping')
    .select('id')
    .eq('observation_code', observationCode)
    .eq('crop_code', cropCode.toUpperCase())
    .lte('das_min', das)
    .gte('das_max', das)
    .eq('is_active', true)
    .limit(1);
  
  if (error) {
    return { valid: true, reason: 'Database error - allowing observation' };
  }
  
  if (data && data.length > 0) {
    return { valid: true, reason: `${observationCode} is valid for ${cropCode} at DAS ${das}` };
  }
  
  return {
    valid: false,
    reason: `${observationCode} is not biologically valid for ${cropCode} at DAS ${das}`
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
  'UNKNOWN_OBSERVATION'
] as const;

export type IntentCode = typeof VALID_INTENT_CODES[number];

/**
 * Check if a string is a valid intent code
 */
export function isValidIntentCode(code: string): code is IntentCode {
  return VALID_INTENT_CODES.includes(code as IntentCode);
}

export default {
  resolveIntentToObservations,
  getStageFromDASDatabase,
  getValidObservationsForIntent,
  isObservationValidForCropStage,
  isValidIntentCode,
  VALID_INTENT_CODES,
  INTENT_RESOLVER_VERSION
};

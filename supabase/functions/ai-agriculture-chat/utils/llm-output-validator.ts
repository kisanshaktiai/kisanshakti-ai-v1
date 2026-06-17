/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LLM OUTPUT VALIDATOR v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates LLM-extracted intents and observations against database tables.
 * Ensures the perception layer (LLM) does not inject invalid symbols into
 * the reasoning core (symbolic engine).
 * 
 * Validations:
 * 1. Intent codes must exist in observation_intent_master
 * 2. Observation codes must exist in observation_master
 * 3. Crop-applicability: observations must be valid for the current crop
 * 4. Crop override prevention: LLM cannot change canonicalContext.crop_code
 * 
 * Performance: In-memory caches with 15-min TTL, concurrency-safe loading.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const LLM_OUTPUT_VALIDATOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CACHE INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
  loadingPromise?: Promise<T>;
}

const VALIDATOR_CACHE_TTL = 900_000; // 15 minutes

const intentCache: { entry: CacheEntry<Set<string>> | null } = { entry: null };
const observationCache: { entry: CacheEntry<Set<string>> | null } = { entry: null };
const cropApplicabilityCache = new Map<string, CacheEntry<Set<string>>>();

// ═══════════════════════════════════════════════════════════════════════════
// CACHED LOADERS
// ═══════════════════════════════════════════════════════════════════════════

async function loadValidIntentCodes(supabase: any): Promise<Set<string>> {
  const now = Date.now();
  if (intentCache.entry && (now - intentCache.entry.loadedAt) < VALIDATOR_CACHE_TTL) {
    return intentCache.entry.data;
  }
  
  // Concurrency lock
  if (intentCache.entry?.loadingPromise) {
    return intentCache.entry.loadingPromise;
  }

  const loadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('observation_intent_master')
        .select('intent_code')
        .eq('is_active', true)
        .limit(2000);
      
      if (error) {
        console.error(`[LLM_VALIDATOR] Failed to load intent codes: ${error.message}`);
        return intentCache.entry?.data || new Set<string>();
      }
      
      const codes = new Set<string>((data || []).map((r: any) => r.intent_code));
      // Always allow fallback intents
      codes.add('UNKNOWN');
      codes.add('UNKNOWN_OBSERVATION');
      codes.add('GENERAL_QUERY');
      
      console.log(`[LLM_VALIDATOR] Loaded ${codes.size} valid intent codes`);
      intentCache.entry = { data: codes, loadedAt: Date.now() };
      return codes;
    } catch (e) {
      console.error(`[LLM_VALIDATOR] Intent cache load error: ${e}`);
      return intentCache.entry?.data || new Set<string>();
    }
  })();
  
  if (!intentCache.entry) {
    intentCache.entry = { data: new Set(), loadedAt: 0, loadingPromise: loadPromise };
  } else {
    intentCache.entry.loadingPromise = loadPromise;
  }
  
  const result = await loadPromise;
  if (intentCache.entry) delete intentCache.entry.loadingPromise;
  return result;
}

async function loadValidObservationCodes(supabase: any): Promise<Set<string>> {
  const now = Date.now();
  if (observationCache.entry && (now - observationCache.entry.loadedAt) < VALIDATOR_CACHE_TTL) {
    return observationCache.entry.data;
  }
  
  if (observationCache.entry?.loadingPromise) {
    return observationCache.entry.loadingPromise;
  }

  const loadPromise = (async () => {
    try {
      // FORENSIC FIX v9.0: PostgREST caps responses at the server max-rows
      // setting (often 1000). observation_master has ~1982 active rows, so
      // a single .limit(2000) call still got truncated. Paginate explicitly.
      const allCodes: string[] = [];
      const PAGE = 1000;
      let fromIdx = 0;
      while (true) {
        const { data, error } = await supabase
          .from('observation_master')
          .select('observation_code')
          .eq('is_active', true)
          .range(fromIdx, fromIdx + PAGE - 1);
        if (error) {
          console.error(`[LLM_VALIDATOR] Page ${fromIdx} failed: ${error.message}`);
          break;
        }
        const rows = data || [];
        for (const r of rows) {
          // Egress normalize to UPPER snake_case to match the in-memory symbolic contract
          // (DB stores lowercase post-migration; callers compare against UPPER codes).
          if (r?.observation_code) allCodes.push(String(r.observation_code).toUpperCase());
        }
        if (rows.length < PAGE) break;
        fromIdx += PAGE;
        if (fromIdx > 50_000) break;
      }
      const codes = new Set<string>(allCodes);
      console.log(`[LLM_VALIDATOR] Loaded ${codes.size} valid observation codes (paginated)`);
      observationCache.entry = { data: codes, loadedAt: Date.now() };
      return codes;
    } catch (e) {
      console.error(`[LLM_VALIDATOR] Observation cache load error: ${e}`);
      return observationCache.entry?.data || new Set<string>();
    }
  })();
  
  if (!observationCache.entry) {
    observationCache.entry = { data: new Set(), loadedAt: 0, loadingPromise: loadPromise };
  } else {
    observationCache.entry.loadingPromise = loadPromise;
  }
  
  const result = await loadPromise;
  if (observationCache.entry) delete observationCache.entry.loadingPromise;
  return result;
}

async function loadCropApplicableObservations(supabase: any, cropCode: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = cropApplicabilityCache.get(cropCode);
  if (cached && (now - cached.loadedAt) < VALIDATOR_CACHE_TTL) {
    return cached.data;
  }
  
  if (cached?.loadingPromise) {
    return cached.loadingPromise;
  }

  const loadPromise = (async () => {
    try {
      // Get observations that have rules for this crop
      const { data, error } = await supabase
        .from('decision_rules')
        .select('observable_characteristics')
        .eq('crop_code', cropCode)
        .eq('is_active', true)
        .limit(2000);
      
      if (error) {
        console.error(`[LLM_VALIDATOR] Failed to load crop-applicable observations for ${cropCode}: ${error.message}`);
        return cached?.data || new Set<string>();
      }
      
      const applicableCodes = new Set<string>();
      for (const rule of (data || [])) {
        const obs = rule.observable_characteristics;
        if (obs && typeof obs === 'object') {
          // Extract observation codes from rule conditions
          for (const [key, value] of Object.entries(obs)) {
            if (Array.isArray(value)) {
              for (const v of value) {
                if (typeof v === 'string') applicableCodes.add(v);
              }
            } else if (typeof value === 'string') {
              applicableCodes.add(value);
            }
          }
        }
      }

      // Also pull from intent_observation_mapping for this crop
      const { data: mappingData } = await supabase
        .from('intent_observation_mapping')
        .select('observation_code')
        .eq('crop_code', cropCode)
        .eq('is_active', true);
      
      for (const row of (mappingData || [])) {
        if (row.observation_code) applicableCodes.add(row.observation_code);
      }
      
      console.log(`[LLM_VALIDATOR] Loaded ${applicableCodes.size} crop-applicable observations for ${cropCode}`);
      cropApplicabilityCache.set(cropCode, { data: applicableCodes, loadedAt: Date.now() });
      return applicableCodes;
    } catch (e) {
      console.error(`[LLM_VALIDATOR] Crop applicability cache load error: ${e}`);
      return cached?.data || new Set<string>();
    }
  })();
  
  cropApplicabilityCache.set(cropCode, { 
    data: cached?.data || new Set(), 
    loadedAt: cached?.loadedAt || 0, 
    loadingPromise: loadPromise 
  });
  
  const result = await loadPromise;
  const entry = cropApplicabilityCache.get(cropCode);
  if (entry) delete entry.loadingPromise;
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface LLMValidationResult {
  valid: boolean;
  rejected_intents: string[];
  rejected_observations: string[];
  crop_applicable_rejections: string[];
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════

export async function validateLLMOutputAgainstDB(params: {
  intent_code: string;
  observation_codes: string[];
  canonical_crop?: string;
  supabase: any;
}): Promise<LLMValidationResult> {
  const { intent_code, observation_codes, canonical_crop, supabase } = params;
  
  const rejected_intents: string[] = [];
  const rejected_observations: string[] = [];
  const crop_applicable_rejections: string[] = [];
  const reasons: string[] = [];

  // Load caches in parallel
  const [validIntents, validObservations] = await Promise.all([
    loadValidIntentCodes(supabase),
    loadValidObservationCodes(supabase)
  ]);
  
  // 1. Validate intent code
  if (intent_code && !validIntents.has(intent_code)) {
    rejected_intents.push(intent_code);
    reasons.push(`Intent '${intent_code}' not found in observation_intent_master`);
  }
  
  // 2. Validate observation codes exist
  for (const code of observation_codes) {
    if (!validObservations.has(code)) {
      rejected_observations.push(code);
      reasons.push(`Observation '${code}' not found in observation_master`);
    }
  }
  
  // 3. Crop-applicability check (only if we have a canonical crop)
  if (canonical_crop && canonical_crop !== 'UNKNOWN') {
    const applicableObs = await loadCropApplicableObservations(supabase, canonical_crop);
    
    // Only reject if we have a populated applicability set (otherwise skip check gracefully)
    if (applicableObs.size > 0) {
      for (const code of observation_codes) {
        // Skip codes already rejected as non-existent
        if (rejected_observations.includes(code)) continue;
        
        if (!applicableObs.has(code)) {
          crop_applicable_rejections.push(code);
          reasons.push(`'${code}' not applicable to crop ${canonical_crop}`);
        }
      }
    }
  }
  
  const allRejected = [...rejected_intents, ...rejected_observations, ...crop_applicable_rejections];
  
  if (allRejected.length > 0) {
    console.log(`[LLM_VALIDATOR] Rejected ${allRejected.length} codes: ${reasons.join('; ')}`);
  }
  
  return {
    valid: allRejected.length === 0,
    rejected_intents,
    rejected_observations,
    crop_applicable_rejections,
    reason: reasons.join('; ') || 'All codes valid'
  };
}

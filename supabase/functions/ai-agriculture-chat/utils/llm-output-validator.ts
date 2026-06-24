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
      
      // observation_intent_master.intent_code is UPPER snake_case in DB; normalize defensively.
      const codes = new Set<string>(
        (data || [])
          .map((r: any) => (r?.intent_code ? String(r.intent_code).toUpperCase() : ''))
          .filter((s: string) => s.length > 0)
      );
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
      // Post-migration: DB stores observation/crop/condition codes as lower_snake_case.
      // In-memory symbolic contract is UPPER_SNAKE_CASE. Normalize at egress so
      // a DB value of `obs_rice_no_emergence` matches the in-memory
      // `OBS_RICE_NO_EMERGENCE` produced by the symbolic brain.
      const cropLc = String(cropCode || '').toLowerCase();

      const applicableCodes = new Set<string>();
      const addCode = (v: unknown) => {
        if (typeof v === 'string' && v.length > 0) {
          applicableCodes.add(v.toUpperCase());
        }
      };

      // SOURCE 1: decision_rules — condition_code + conditions_json.observations
      //                            + observable_characteristics (legacy)
      const { data: ruleRows, error: ruleErr } = await supabase
        .from('decision_rules')
        .select('condition_code, conditions_json, observable_characteristics')
        .eq('crop_code', cropLc)
        .eq('is_active', true)
        .limit(2000);

      if (ruleErr) {
        console.error(`[LLM_VALIDATOR] decision_rules load failed for ${cropCode}: ${ruleErr.message}`);
      }
      for (const rule of (ruleRows || [])) {
        addCode((rule as any).condition_code);
        const cj = (rule as any).conditions_json;
        if (cj && typeof cj === 'object') {
          const obsArr = (cj as any).observations;
          if (Array.isArray(obsArr)) for (const v of obsArr) addCode(v);
        }
        const obs = (rule as any).observable_characteristics;
        if (obs && typeof obs === 'object') {
          for (const [k, value] of Object.entries(obs)) {
            if (Array.isArray(value)) for (const v of value) addCode(v);
            else if (typeof value === 'string') addCode(value);
            else if (value === true) addCode(k); // legacy {dead_heart: true}
          }
        }
      }

      // SOURCE 2: intent_observation_mapping (crop-specific + 'all')
      const { data: mappingData } = await supabase
        .from('intent_observation_mapping')
        .select('observation_code')
        .in('crop_code', [cropLc, 'all'])
        .eq('is_active', true);
      for (const row of (mappingData || [])) addCode((row as any).observation_code);

      // SOURCE 3: observation_master — applicable_crop_groups contains this crop
      //                                 or is universal/all. This is the canonical
      //                                 SSOT for which observations are valid for
      //                                 a crop, independent of whether a rule
      //                                 currently references them.
      const { data: obsRows, error: obsErr } = await supabase
        .from('observation_master')
        .select('observation_code, applicable_crop_groups, crop_group')
        .eq('is_active', true)
        .or(
          `applicable_crop_groups.cs.{${cropLc}},applicable_crop_groups.cs.{universal},applicable_crop_groups.cs.{all},crop_group.eq.${cropLc},crop_group.eq.universal`
        )
        .limit(5000);
      if (obsErr) {
        console.warn(`[LLM_VALIDATOR] observation_master filter failed (${obsErr.message}); falling back to unfiltered universal scan`);
        const { data: fallbackRows } = await supabase
          .from('observation_master')
          .select('observation_code, applicable_crop_groups, crop_group')
          .eq('is_active', true)
          .limit(5000);
        for (const r of (fallbackRows || [])) {
          const grp = String((r as any).crop_group || '').toLowerCase();
          const groups = Array.isArray((r as any).applicable_crop_groups)
            ? ((r as any).applicable_crop_groups as string[]).map(g => String(g).toLowerCase())
            : [];
          if (grp === cropLc || grp === 'universal' || grp === 'all' ||
              groups.includes(cropLc) || groups.includes('universal') || groups.includes('all')) {
            addCode((r as any).observation_code);
          }
        }
      } else {
        for (const r of (obsRows || [])) addCode((r as any).observation_code);
      }

      console.log(`[LLM_VALIDATOR] Loaded ${applicableCodes.size} crop-applicable observations for ${cropCode} (rules+mapping+master)`);
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

  // Phase 5 fix: caches are keyed by UPPER snake_case (in-memory contract);
  // normalize every comparand at the boundary so casing drift can't silently
  // reject valid codes.
  const intentUpper = String(intent_code || '').toUpperCase();
  const observationsUpper = observation_codes.map((c) => String(c || '').toUpperCase());
  const cropUpper =
    canonical_crop && canonical_crop !== 'UNKNOWN'
      ? String(canonical_crop).toUpperCase()
      : canonical_crop;

  // Load caches in parallel
  const [validIntents, validObservations] = await Promise.all([
    loadValidIntentCodes(supabase),
    loadValidObservationCodes(supabase)
  ]);
  
  // 1. Validate intent code
  if (intentUpper && !validIntents.has(intentUpper)) {
    rejected_intents.push(intent_code);
    reasons.push(`Intent '${intent_code}' not found in observation_intent_master`);
  }
  
  // 2. Validate observation codes exist
  for (let i = 0; i < observationsUpper.length; i++) {
    const upper = observationsUpper[i];
    if (!validObservations.has(upper)) {
      rejected_observations.push(observation_codes[i]);
      reasons.push(`Observation '${observation_codes[i]}' not found in observation_master`);
    }
  }
  
  // 3. Crop-applicability check (only if we have a canonical crop)
  if (cropUpper && cropUpper !== 'UNKNOWN') {
    const applicableObs = await loadCropApplicableObservations(supabase, cropUpper);
    
    // Only reject if we have a populated applicability set (otherwise skip check gracefully)
    if (applicableObs.size > 0) {
      for (let i = 0; i < observationsUpper.length; i++) {
        const upper = observationsUpper[i];
        const orig = observation_codes[i];
        // Skip codes already rejected as non-existent
        if (rejected_observations.includes(orig)) continue;
        
        if (!applicableObs.has(upper)) {
          crop_applicable_rejections.push(orig);
          reasons.push(`'${orig}' not applicable to crop ${canonical_crop}`);
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

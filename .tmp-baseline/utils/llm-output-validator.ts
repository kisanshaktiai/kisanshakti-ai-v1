// LLM OUTPUT VALIDATOR v1.0.0

import { resolveAliasCanonical, observationIndexReady } from './db-ssot/observation-index.ts';

export const LLM_OUTPUT_VALIDATOR_VERSION = '1.1.0';

// ONTOLOGY-INVARIANT PAGINATED LOADER
async function paginateAll<T = any>(
  buildQuery: (offset: number, limit: number) => any,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, pageSize);
    if (error) throw new Error(error.message || String(error));
    const batch = (data || []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200_000) break; // hard sanity ceiling
  }
  return rows;
}

// ONTOLOGY ALIAS TABLE
const CANONICAL_OBSERVATION_ALIASES: Record<string, string> = {
  // Emergence-failure family — canonical peer is POOR_GERMINATION, which is
  SEEDLING_DIED: 'POOR_GERMINATION',
  PLANT_DIED: 'POOR_GERMINATION',
  DEAD_SEEDLINGS: 'POOR_GERMINATION',
  // Poor-vigour family — canonical peer is STUNTED_GROWTH, present in
  // observation_master and mapped by GROWTH_ANOMALY authors.
  STUNTED_PLANTS: 'STUNTED_GROWTH',
  POOR_TILLERING: 'STUNTED_GROWTH',
};

// CACHE INFRASTRUCTURE

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
  loadingPromise?: Promise<T>;
}

const VALIDATOR_CACHE_TTL = 900_000; // 15 minutes

const intentCache: { entry: CacheEntry<Set<string>> | null } = { entry: null };
const observationCache: { entry: CacheEntry<Set<string>> | null } = { entry: null };
const cropApplicabilityCache = new Map<string, CacheEntry<Set<string>>>();

// CACHED LOADERS

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
      const data = await paginateAll<any>((offset, limit) => supabase
        .from('observation_intent_master')
        .select('intent_code')
        .eq('is_active', true)
        .order('intent_code', { ascending: true })
        .range(offset, offset + limit - 1));
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
      const data = await paginateAll<any>((offset, limit) => supabase
        .from('observation_master')
        .select('observation_code')
        .eq('is_active', true)
        .order('observation_code', { ascending: true })
        .range(offset, offset + limit - 1));

      // CANONICAL-CONTEXT: observation_master.observation_code is stored
      // lowercase in the DB but runtime canonical case is UPPERCASE.
      const codes = new Set<string>(
        (data || [])
          .map((r: any) => String(r.observation_code || '').toUpperCase())
          .filter(Boolean)
      );
      console.log(`[LLM_VALIDATOR][CANONICAL_CONTEXT_TRACE] Loaded ${codes.size} valid observation codes (paginated, normalized to UPPERCASE)`);

      observationCache.entry = { data: codes, loadedAt: Date.now() };
      return codes;
    } catch (e) {
      console.error(`[LLM_VALIDATOR] Observation cache load error: ${(e as Error)?.message || e}`);
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
    console.log(`[LLM_VALIDATOR][CACHE_HIT] crop=${cropCode} size=${cached.data.size} ageMs=${now - cached.loadedAt}`);
    return cached.data;
  }

  if (cached?.loadingPromise) {
    console.log(`[LLM_VALIDATOR][CACHE_INFLIGHT] crop=${cropCode} awaiting in-flight load`);
    return cached.loadingPromise;
  }

  console.log(`[LLM_VALIDATOR][CACHE_MISS] crop=${cropCode} → querying DB`);

  const loadPromise = (async () => {
    try {
      const cropLower = (cropCode || '').toLowerCase();
      const cropUpper = (cropCode || '').toUpperCase();
      const cropVariants = Array.from(new Set([cropLower, cropUpper].filter(Boolean)));

      console.log(`[LLM_VALIDATOR][SQL] decision_rules WHERE crop_code IN (${JSON.stringify(cropVariants)}) AND is_active=true (paginated, no arbitrary limit)`);

      const data = await paginateAll<any>((offset, limit) => supabase
        .from('decision_rules')
        .select('observable_characteristics')
        .in('crop_code', cropVariants)
        .eq('is_active', true)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1));

      console.log(`[LLM_VALIDATOR][SQL_RESULT] decision_rules rows=${(data || []).length}`);

      const applicableCodes = new Set<string>();
      for (const rule of (data || [])) {
        const obs = rule.observable_characteristics;
        if (obs && typeof obs === 'object') {
          for (const [_key, value] of Object.entries(obs)) {
            if (Array.isArray(value)) {
              for (const v of value) {
                if (typeof v === 'string') applicableCodes.add(v.toUpperCase());
              }
            } else if (typeof value === 'string') {
              applicableCodes.add(value.toUpperCase());
            }
          }
        }
      }
      console.log(`[LLM_VALIDATOR][NORMALIZE] after decision_rules → ${applicableCodes.size} uppercase codes`);

      console.log(`[LLM_VALIDATOR][SQL] intent_observation_mapping WHERE crop_code IN (${JSON.stringify(cropVariants)}) AND is_active=true (paginated)`);
      const mappingData = await paginateAll<any>((offset, limit) => supabase
        .from('intent_observation_mapping')
        .select('observation_code')
        .in('crop_code', cropVariants)
        .eq('is_active', true)
        .order('observation_code', { ascending: true })
        .range(offset, offset + limit - 1));

      console.log(`[LLM_VALIDATOR][SQL_RESULT] intent_observation_mapping rows=${(mappingData || []).length}`);

      for (const row of (mappingData || [])) {
        if (row.observation_code) applicableCodes.add(String(row.observation_code).toUpperCase());
      }

      const sampleCodes = Array.from(applicableCodes).slice(0, 25);
      console.log(`[LLM_VALIDATOR][CANONICAL_CONTEXT_TRACE] Loaded ${applicableCodes.size} crop-applicable observations for ${cropCode} (queried as ${JSON.stringify(cropVariants)})`);
      console.log(`[LLM_VALIDATOR][NORMALIZED_CODES_SAMPLE] ${JSON.stringify(sampleCodes)}${applicableCodes.size > sampleCodes.length ? ' …(truncated)' : ''}`);
      console.log(`[LLM_VALIDATOR][CONTAINS_CHECK] SEEDLING_DIED=${applicableCodes.has('SEEDLING_DIED')} STUNTED_PLANTS=${applicableCodes.has('STUNTED_PLANTS')}`);

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

// VALIDATION RESULT

export interface LLMValidationResult {
  valid: boolean;
  rejected_intents: string[];
  rejected_observations: string[];
  crop_applicable_rejections: string[];
  // ONTOLOGY ALIASING: generic codes that were not applicable/known for the
  aliased_observations: Record<string, string>;
  reason: string;
}

// MAIN VALIDATOR

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
  const aliased_observations: Record<string, string> = {};
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

  const applicableObs = (canonical_crop && canonical_crop !== 'UNKNOWN')
    ? await loadCropApplicableObservations(supabase, canonical_crop)
    : new Set<string>();

  const tryAlias = (code: string): string | null => {
    const upper = String(code || '').toUpperCase();

    // FIX (DB-SSOT alias resolution): the neuro-symbolic contract requires
    if (observationIndexReady()) {
      const dbCanonical = resolveAliasCanonical(code);
      if (dbCanonical) {
        const dbCanonicalUpper = dbCanonical.toUpperCase();
        // Same validity gates as before: canonical must be a real
        if (validObservations.has(dbCanonicalUpper) &&
            (applicableObs.size === 0 || applicableObs.has(dbCanonicalUpper))) {
          return dbCanonicalUpper;
        }
      }
    }

    // Cold-boot / DB-miss fallback: consult the tiny in-code map. This path
    const alias = CANONICAL_OBSERVATION_ALIASES[upper];
    if (!alias) return null;
    if (!validObservations.has(alias)) return null;
    if (applicableObs.size > 0 && !applicableObs.has(alias)) return null;
    return alias;
  };

  // 2. Validate observation codes exist in observation_master (with alias fallback)
  for (const code of observation_codes) {
    if (validObservations.has(code)) continue;
    const alias = tryAlias(code);
    if (alias) {
      aliased_observations[code] = alias;
      reasons.push(`Observation '${code}' aliased → '${alias}' (canonical peer)`);
      continue;
    }
    rejected_observations.push(code);
    reasons.push(`Observation '${code}' not found in observation_master`);
  }

  // 3. Crop-applicability check (with alias fallback so evidence isn't lost)
  if (applicableObs.size > 0) {
    for (const code of observation_codes) {
      if (rejected_observations.includes(code)) continue;
      if (aliased_observations[code]) continue; // already resolved via alias above
      if (applicableObs.has(code)) continue;
      const alias = tryAlias(code);
      if (alias) {
        aliased_observations[code] = alias;
        reasons.push(`Observation '${code}' not applicable to ${canonical_crop}; aliased → '${alias}'`);
        continue;
      }
      crop_applicable_rejections.push(code);
      reasons.push(`'${code}' not applicable to crop ${canonical_crop}`);
    }
  }

  const allRejected = [...rejected_intents, ...rejected_observations, ...crop_applicable_rejections];
  const aliasedCount = Object.keys(aliased_observations).length;

  if (allRejected.length > 0 || aliasedCount > 0) {
    console.log(`[LLM_VALIDATOR] rejected=${allRejected.length} aliased=${aliasedCount} :: ${reasons.join('; ')}`);
  }

  return {
    valid: allRejected.length === 0,
    rejected_intents,
    rejected_observations,
    crop_applicable_rejections,
    aliased_observations,
    reason: reasons.join('; ') || 'All codes valid'
  };
}

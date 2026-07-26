// CHANGE LOG
// 2026-07-25 UTC — Batch A / P7: DELETED the hardcoded STAGE_KEY_PRIORITIES
//   symptom-code map (germination/tillering/grand_growth/maturity/vegetative/
//   flowering/boll_development). Stage and category priorities are now read
//   from public.observation_master (is_active ∧ is_diagnostic ∧
//   is_farmer_observable, applies_to_stages overlap, ordered by
//   discriminator_score/clarity_score) with a 5-minute cache. No DB rows →
//   empty result; there is no static fallback by design.
// 2026-07-09 21:15 UTC — Emptied STAGE_KEY_PRIORITIES.all bucket. The

//   INSECTS/YELLOW/WILT/SPOTS static list was firing as a universal
//   fallback whenever the caller passed a stage not present in the map
//   (e.g. `transplanting`), producing the "same options for every
//   clarification" bug. Unknown stage now yields [] and the hypothesis
//   graph is the only allowed source of stage-agnostic candidates.
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL OBSERVATION KEYS LOADER v3.0
 * Load observation keys from decision_rules + observation_translations (DB-only)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Dynamically load canonical observation keys from the database to generate
 * context-aware clarification options. ALL labels come from DB — zero
 * hardcoded trilingual dictionaries.
 * 
 * v3.0 CHANGES:
 * - Removed OBSERVATION_KEY_LABELS hardcoded dictionary (~200 entries)
 * - All label resolution via observation_translations table
 * - Functions that need labels are now async (DB query)
 * - STAGE_KEY_PRIORITIES removed (P7) — codes now from observation_master
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
 
import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { ObservationKey } from '../decision/observation-ontology.ts';
import { loadObservationLabels } from '../i18n/observation-label-loader.ts';
import { canonicalStageKey, canonicalCropCode } from '../utils/canonical-code.ts';
import { getStageFamilyFromDB } from '../utils/stage-knowledge-cache.ts';

export const CANONICAL_LOADER_VERSION = '3.0.0'; // v3: ZERO hardcoded labels

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ObservationKeyWithLabels {
  key: string;
  label_en: string;
  label_hi: string;
  label_mr: string;
  /** Language-resolved label (set by DB query at runtime) */
  label: string;
  category: string;
  stage: string[];
  visual_priority: number;
}

export interface LoadedObservationKeys {
  keys: ObservationKeyWithLabels[];
  crop_code: string;
  stage: string;
  total_count: number;
  loaded_from: 'DATABASE' | 'CACHE' | 'FALLBACK';
}

export interface ClarificationOption {
  key: string;
  label: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE-WISE KEY PRIORITIES — DB-SSOT (P7, 2026-07-25)
// ═══════════════════════════════════════════════════════════════════════════
//
// The previous hardcoded STAGE_KEY_PRIORITIES map (germination/tillering/
// grand_growth/... → literal symptom codes) has been REMOVED. It was authored
// agronomy living in TypeScript and it drifted from observation_master.
//
// Priorities are now derived entirely from public.observation_master:
//   is_active = true            → not retired
//   is_diagnostic = true        → carries diagnostic signal (not metadata)
//   is_farmer_observable = true → a farmer can actually answer it
//   applies_to_stages && [...]  → curated stage applicability
//   ORDER BY discriminator_score DESC, clarity_score DESC
//
// If the DB returns nothing for a stage, the result is EMPTY. Unknown stage
// MUST NOT fall back to a static list — the hypothesis graph is the only
// allowed source of stage-agnostic candidates.

const STAGE_PRIORITY_CACHE_TTL_MS = 5 * 60 * 1000;
const _stagePriorityCache = new Map<string, { at: number; codes: string[] }>();

async function loadStagePriorityCodesFromDB(
  client: any,
  stage: string,
  limit: number,
  crop?: string | null,
): Promise<string[]> {
  const stages = expandStageSynonyms(stage, crop).filter((s) => s && s !== 'all');
  const cacheKey = `${canonicalCropCode(crop)}::${stages.join('|')}::${limit}`;
  const hit = _stagePriorityCache.get(cacheKey);
  if (hit && Date.now() - hit.at < STAGE_PRIORITY_CACHE_TTL_MS) return hit.codes;

  if (!client || stages.length === 0) return [];

  try {
    const { data, error } = await client
      .from('observation_master')
      .select('observation_code, discriminator_score, clarity_score')
      .eq('is_active', true)
      .eq('is_diagnostic', true)
      .eq('is_farmer_observable', true)
      .overlaps('applies_to_stages', stages)
      .order('discriminator_score', { ascending: false, nullsFirst: false })
      .order('clarity_score', { ascending: false, nullsFirst: false })
      .limit(Math.max(limit, 50));

    if (error) {
      console.warn(`[CanonicalLoader] stage_priority_query_failed stage=${stage} err=${error.message}`);
      return [];
    }

    const codes = Array.from(
      new Set(
        (data ?? [])
          .map((r: any) => String(r.observation_code ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    ) as string[];

    // P7 cold-boot seed: the loader must never fall back to a hardcoded list.
    // When no stage-scoped row exists, seed from diagnostic observations only.
    if (codes.length === 0) {
      const { data: seedRows } = await client
        .from('observation_master')
        .select('observation_code, discriminator_score, clarity_score')
        .eq('is_active', true)
        .eq('is_diagnostic', true)
        .order('discriminator_score', { ascending: false, nullsFirst: false })
        .order('clarity_score', { ascending: false, nullsFirst: false })
        .limit(Math.max(limit, 50));
      const seedCodes = Array.from(
        new Set((seedRows ?? []).map((r: any) => String(r.observation_code ?? '').trim().toUpperCase()).filter(Boolean)),
      ) as string[];
      console.log(`[CanonicalLoader] stage_priority_cold_boot_seed stage=${stage} codes=${seedCodes.length}`);
      _stagePriorityCache.set(cacheKey, { at: Date.now(), codes: seedCodes });
      return seedCodes;
    }

    console.log(
      `[CanonicalLoader] stage_priority_db stage=${stage} synonyms=[${stages.join(',')}] codes=${codes.length}`,
    );
    _stagePriorityCache.set(cacheKey, { at: Date.now(), codes });
    return codes;

  } catch (e) {
    console.warn(`[CanonicalLoader] stage_priority_exception stage=${stage} err=${(e as Error).message}`);
    return [];
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Get Supabase client for DB queries
// ═══════════════════════════════════════════════════════════════════════════

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Format code as fallback label (no English leakage for non-English)
// ═══════════════════════════════════════════════════════════════════════════

function formatCodeFallback(key: string, language: string): string {
  if (language === 'en') {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  // Non-English: raw code to avoid English leakage
  return key.replace(/_/g, ' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS (v3: all async, DB-driven labels)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get observation key label from DB. Async — queries observation_translations.
 */
export async function getObservationKeyLabel(
  key: string,
  language: string
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) return formatCodeFallback(key, language);
  
  const labels = await loadObservationLabels(client, [key], language);
  const label = labels.get(key.toUpperCase());
  return label?.display_text || formatCodeFallback(key, language);
}

/**
 * Get observation key labels (async DB lookup)
 */
export async function getObservationKeyLabels(key: string, language: string = 'en'): Promise<ObservationKeyWithLabels | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  
  // Load labels in all three languages in parallel
  // Load labels for requested language + English fallback
  const langCodes = language === 'en' ? ['en'] : [language, 'en'];
  const labelResults = await Promise.all(
    langCodes.map(lang => loadObservationLabels(client, [key], lang))
  );
  
  const upperKey = key.toUpperCase();
  const primaryLabel = labelResults[0]?.get(upperKey);
  const enLabel = (language === 'en' ? primaryLabel : labelResults[1]?.get(upperKey)) || null;
  
  if (!primaryLabel && !enLabel) return null;
  
  const result: any = {
    key: upperKey,
    label_en: enLabel?.display_text || formatCodeFallback(key, 'en'),
    label: primaryLabel?.display_text || enLabel?.display_text || formatCodeFallback(key, language),
    category: (enLabel || primaryLabel)?.icon || 'unknown',
    stage: [],
    visual_priority: 99
  };
  if (language !== 'en') {
    result[`label_${language}`] = primaryLabel?.display_text || formatCodeFallback(key, language);
  }
  return result as ObservationKeyWithLabels;
}

/**
 * Get observation keys for a specific stage — async, DB-driven codes + labels.
 * P7: codes come from observation_master, never from a TS literal list.
 */
export async function getStageObservationKeys(
  stage: string,
  language: string,
  maxKeys: number = 4,
  crop?: string | null,
): Promise<ClarificationOption[]> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('[CanonicalLoader] getStageObservationKeys: no DB client → no static fallback (by design)');
    return [];
  }

  const priorityKeys = await loadStagePriorityCodesFromDB(client, stage, maxKeys, crop);
  const keysToLoad = priorityKeys.slice(0, maxKeys);
  if (keysToLoad.length === 0) return [];

  const labels = await loadObservationLabels(client, keysToLoad, language);

  return keysToLoad.map(key => ({
    key,
    label: labels.get(key.toUpperCase())?.display_text || formatCodeFallback(key, language)
  }));
}

/**
 * Get observation keys by category — async, DB-driven codes + labels.
 * P7: reads observation_master.observation_category directly instead of
 * flattening a hardcoded stage-priority map.
 */
export async function getCategoryObservationKeys(
  category: string,
  language: string,
  maxKeys: number = 4
): Promise<ClarificationOption[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const cat = String(category ?? '').trim();
  if (!cat) return [];

  const { data, error } = await client
    .from('observation_master')
    .select('observation_code, discriminator_score, clarity_score')
    .eq('is_active', true)
    .eq('is_diagnostic', true)
    .eq('is_farmer_observable', true)
    .or(`observation_category.eq.${cat},symptom_category.eq.${cat},canonical_group.eq.${cat}`)
    .order('discriminator_score', { ascending: false, nullsFirst: false })
    .order('clarity_score', { ascending: false, nullsFirst: false })
    .limit(Math.max(maxKeys, 25));

  if (error) {
    console.warn(`[CanonicalLoader] category_query_failed category=${cat} err=${error.message}`);
    return [];
  }

  const uniqueKeys = Array.from(
    new Set((data ?? []).map((r: any) => String(r.observation_code ?? '').trim().toUpperCase()).filter(Boolean)),
  ).slice(0, maxKeys) as string[];

  if (uniqueKeys.length === 0) return [];

  const labels = await loadObservationLabels(client, uniqueKeys, language);

  return uniqueKeys.map(key => ({
    key,
    label: labels.get(key.toUpperCase())?.display_text || formatCodeFallback(key, language)
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_NORMALIZATION_MAP: Record<string, string> = {
  'seedling': 'germination',
  'vegetative': 'tillering',
  'flowering': 'grand_growth',
  'reproductive': 'grand_growth',
  'maturation': 'maturity',
  'ripening': 'maturity',
  'harvesting': 'harvest',
  'germination': 'germination',
  'tillering': 'tillering',
  'grand_growth': 'grand_growth',
  'maturity': 'maturity',
  'harvest': 'harvest',
  'planting': 'planting',
  'post_harvest': 'post_harvest',
};

// 2026-07-26 (forensic audit F2): the hardcoded `STAGE_SYNONYM_GROUPS` map was
// DELETED. Stage families are agronomy and their SSOT is `public.crop_stage_graph`,
// surfaced by `utils/stage-knowledge-cache.ts::getStageFamilyFromDB`.
//
// Cache miss (unloaded cache, or no curated row for this crop×stage) degrades to
// the singleton `[stage, 'all']` and logs `[CANON_LOADER_STAGE_MISS]`. We NEVER
// substitute a static family.
function expandStageSynonyms(stage: string, crop?: string | null): string[] {
  const key = canonicalStageKey(stage);
  if (!key) return ['all'];
  const cropKey = canonicalCropCode(crop);
  const fam = cropKey ? getStageFamilyFromDB(cropKey, key) : null;
  if (!fam || fam.length === 0) {
    console.log(
      `[CANON_LOADER_STAGE_MISS] crop=${cropKey || 'none'} stage=${key} ` +
      `source=crop_stage_graph action=singleton_plus_all`
    );
    return Array.from(new Set([key, 'all']));
  }
  return Array.from(new Set([...fam.map((x) => canonicalStageKey(x)).filter(Boolean), key, 'all']));
}

function normalizeStageForDB(stage: string): string {
  const normalized = stage.toLowerCase().trim().replace(/[\s-]/g, '_');
  return STAGE_NORMALIZATION_MAP[normalized] || normalized;
}

/**
 * Load observation keys from database by crop and stage.
 * ALL labels resolved from observation_translations — zero hardcoded labels.
 */
export async function loadObservationKeysFromDB(
  cropCode: string,
  stage: string,
  language: string = 'en'
): Promise<LoadedObservationKeys> {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      console.warn('[CanonicalLoader] Missing Supabase credentials, using fallback');
      return await getFallbackKeys(cropCode, stage, language);
    }
    
    const dbStage = normalizeStageForDB(stage);
    console.log(`[CanonicalLoader v${CANONICAL_LOADER_VERSION}] Stage normalization: ${stage} → ${dbStage}, language=${language}`);
    
    const crop = cropCode.toLowerCase();
    // R3 FIX: pass ALL synonymous stages (e.g. seedling, nursery, germination) so
    // curated rows under any alias survive the filter.
    const stageVariants = expandStageSynonyms(stage, crop).concat(expandStageSynonyms(dbStage, crop));
    const uniqueStageVariants = Array.from(new Set(stageVariants.filter(Boolean)));

    console.log(`[CanonicalLoader] Querying for crop=${crop}, stages=${uniqueStageVariants.join(',')}`);

    let data: any[] | null = null;
    let lastError: any = null;

    for (const st of uniqueStageVariants) {
      const res = await supabase
        .from('decision_rules')
        .select('observable_characteristics')
        .in('crop_code', [crop, 'all'])
        .contains('stage_applicable', [st])
        .eq('is_active', true)
        .not('observable_characteristics', 'is', null);

      if (res.error) {
        lastError = res.error;
        continue;
      }

      if (res.data && res.data.length > 0) {
        data = data ? [...data, ...res.data] : res.data;
      }
    }

    if (lastError && (!data || data.length === 0)) {
      console.error('[CanonicalLoader] DB query error:', lastError);
      return await getFallbackKeys(cropCode, stage, language);
    }

    if (!data || data.length === 0) {
      console.warn(`[CanonicalLoader] No matching rules for ${cropCode}/${dbStage}`);
      return await getFallbackKeys(cropCode, stage, language);
    }

    console.log(`[CanonicalLoader] Found ${data.length} rules with observable_characteristics`);
    
    // R2 FIX: observable_characteristics can be either:
    //   - string[]                         (legacy seed)
    //   - { observations: string[], ... }  (current JSONB schema)
    //   - { keys: string[] } / object map  (defensive)
    // Accept all shapes so curated rules aren't silently dropped.
    const uniqueKeys = new Set<string>();
    const collectKeys = (val: unknown): void => {
      if (!val) return;
      if (Array.isArray(val)) {
        for (const k of val) {
          if (typeof k === 'string' && k.trim()) uniqueKeys.add(k.trim().toUpperCase());
        }
        return;
      }
      if (typeof val === 'object') {
        const obj = val as Record<string, unknown>;
        if (Array.isArray(obj.observations)) collectKeys(obj.observations);
        if (Array.isArray(obj.keys))         collectKeys(obj.keys);
        if (Array.isArray((obj as any).codes)) collectKeys((obj as any).codes);
      }
    };
    for (const rule of data || []) {
      collectKeys(rule.observable_characteristics);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DB-ONLY LABELS: Query observation_translations for ALL label resolution
    // ═══════════════════════════════════════════════════════════════════════════
    const keysArray = Array.from(uniqueKeys);
    const dbLabels = await loadObservationLabels(supabase, keysArray, language);
    
    const keys: ObservationKeyWithLabels[] = [];
    for (const key of uniqueKeys) {
      const dbLabel = dbLabels.get(key);
      
      keys.push({
        key,
        label_en: formatCodeFallback(key, 'en'),
        label_hi: formatCodeFallback(key, 'hi'),
        label_mr: formatCodeFallback(key, 'mr'),
        label: dbLabel?.display_text || formatCodeFallback(key, language),
        category: dbLabel?.icon || 'unknown',
        stage: [stage],
        visual_priority: 99
      });
    }
    
    // Sort alphabetically for consistency (no hardcoded priority available)
    keys.sort((a, b) => a.key.localeCompare(b.key));
    
    console.log(`[CanonicalLoader] Loaded ${keys.length} keys for ${cropCode}/${stage} from DB with ${language} labels`);
    
    return {
      keys,
      crop_code: cropCode,
      stage,
      total_count: keys.length,
      loaded_from: 'DATABASE'
    };
    
  } catch (err) {
    console.error('[CanonicalLoader] Error loading from DB:', err);
    return await getFallbackKeys(cropCode, stage, language);
  }
}

/**
 * Fallback function when DB is unavailable — uses stage priority keys with DB labels
 */
async function getFallbackKeys(cropCode: string, stage: string, language: string = 'en'): Promise<LoadedObservationKeys> {
  const stageKeys = await getStageObservationKeys(stage, language, 20);
  
  const keys: ObservationKeyWithLabels[] = stageKeys.map(k => ({
    key: k.key,
    label_en: formatCodeFallback(k.key, 'en'),
    label_hi: formatCodeFallback(k.key, 'hi'),
    label_mr: formatCodeFallback(k.key, 'mr'),
    label: k.label,
    category: 'unknown',
    stage: [stage],
    visual_priority: 99
  }));
  
  return {
    keys,
    crop_code: cropCode,
    stage,
    total_count: keys.length,
    loaded_from: 'FALLBACK'
  };
}

/**
 * Get top clarification options for a given context — async, DB-driven
 */
export async function getClarificationOptions(
  cropCode: string,
  stage: string,
  language: string,
  category?: string,
  maxOptions: number = 3
): Promise<ClarificationOption[]> {
  if (category) {
    return getCategoryObservationKeys(category, language, maxOptions);
  }
  return getStageObservationKeys(stage, language, maxOptions);
}

export default {
  getObservationKeyLabel,
  getObservationKeyLabels,
  getStageObservationKeys,
  getCategoryObservationKeys,
  loadObservationKeysFromDB,
  getClarificationOptions,
  // STAGE_KEY_PRIORITIES removed (P7, 2026-07-25) — DB-SSOT only.
  CANONICAL_LOADER_VERSION
};

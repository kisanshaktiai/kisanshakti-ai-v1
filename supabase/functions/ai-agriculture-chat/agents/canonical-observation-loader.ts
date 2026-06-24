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
 * - STAGE_KEY_PRIORITIES retained (language-neutral code lists)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
 
import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { ObservationKey } from '../decision/observation-ontology.ts';
import { loadObservationLabels } from '../i18n/observation-label-loader.ts';

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
// STAGE-WISE KEY PRIORITIES (language-neutral code lists — NOT labels)
// Which keys to show first based on growth stage
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_KEY_PRIORITIES: Record<string, string[]> = {
  germination: [
    'GAPS_IN_FIELD', 'SEEDLING_DIED', 'SETT_EASILY_PULLED_OUT', 'POOR_GERMINATION_PERCENT',
    'SEEDLING_WILTED', 'MUD_TUBES_PRESENT', 'ROOTS_ROTTED', 'SOIL_TOO_DRY',
    'WATER_LOGGING_AT_BASE', 'SEEDLING_YELLOW', 'TUNNELS_IN_SOIL'
  ],
  
  tillering: [
    'DEAD_HEART_PRESENT', 'CENTRAL_SHOOT_DRY', 'POOR_TILLERING', 'LEAF_YELLOWING',
    'STEM_BORING_MARKS', 'INSECTS_VISIBLE', 'LARVAE_PRESENT', 'STUNTED_PLANTS',
    'LEAF_REDDENING', 'WEAK_SHOOTS'
  ],
  
  grand_growth: [
    'STEM_HOLES_VISIBLE', 'STEM_BORING_MARKS', 'WHITE_INSECTS', 'HONEYDEW_PRESENT',
    'LEAF_YELLOWING', 'INTERVEINAL_CHLOROSIS', 'WHITE_POWDERY_GROWTH',
    'PLANTS_LODGING', 'SHORT_INTERNODES', 'LUSH_VEGETATIVE_GROWTH'
  ],
  
  maturity: [
    'STEM_ROT_PRESENT', 'FOUL_SMELL_PRESENT', 'STEM_SOFTENING', 'PLANTS_LODGING',
    'STEM_HOLES_VISIBLE', 'LEAF_DRYING', 'FRUIT_ROT', 'FRUIT_DEFORMED'
  ],
  
  vegetative: [
    'LEAF_YELLOWING', 'LEAF_CURLING', 'INSECTS_VISIBLE', 'LEAF_SPOTS_PRESENT',
    'LEAF_CHEWING', 'STUNTED_PLANTS', 'SLOW_GROWTH', 'SMALL_INSECTS'
  ],
  
  flowering: [
    'FLOWER_DROP', 'BUD_DROP', 'POOR_FLOWERING', 'INSECTS_VISIBLE',
    'DELAYED_FLOWERING', 'LEAF_YELLOWING'
  ],
  
  boll_development: [
    'FRUIT_DROP', 'FRUIT_ROT', 'FRUIT_DEFORMED', 'POOR_FRUIT_SET',
    'INSECTS_VISIBLE', 'LARVAE_PRESENT'
  ],
  
  all: [
    'INSECTS_VISIBLE', 'LEAF_YELLOWING', 'LEAF_WILTING', 'LEAF_SPOTS_PRESENT',
    'PATCHY_DAMAGE', 'ENTIRE_FIELD_AFFECTED', 'DAMAGE_AFTER_RAIN'
  ]
};

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
 * Get observation keys for a specific stage — async, DB-driven labels
 */
export async function getStageObservationKeys(
  stage: string,
  language: string,
  maxKeys: number = 4
): Promise<ClarificationOption[]> {
  const normalizedStage = stage.toLowerCase().replace(/[\s-]/g, '_');
  const priorityKeys = STAGE_KEY_PRIORITIES[normalizedStage] || STAGE_KEY_PRIORITIES.all;
  const keysToLoad = priorityKeys.slice(0, maxKeys);
  
  const client = getSupabaseClient();
  if (!client) {
    // Offline fallback: raw codes
    return keysToLoad.map(k => ({ key: k, label: formatCodeFallback(k, language) }));
  }
  
  const labels = await loadObservationLabels(client, keysToLoad, language);
  
  return keysToLoad.map(key => ({
    key,
    label: labels.get(key.toUpperCase())?.display_text || formatCodeFallback(key, language)
  }));
}

/**
 * Get observation keys by category — async, DB-driven labels
 */
export async function getCategoryObservationKeys(
  category: string,
  language: string,
  maxKeys: number = 4
): Promise<ClarificationOption[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  
  // Query observation_translations for the category
  // Since we don't have category in translations, use stage priority keys as fallback
  const allKeys = Object.values(STAGE_KEY_PRIORITIES).flat();
  const uniqueKeys = [...new Set(allKeys)].slice(0, maxKeys);
  
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
    const stageVariants = Array.from(
      new Set([dbStage, 'all'].filter(Boolean))
    );

    console.log(`[CanonicalLoader] Querying for crop=${crop}, stages=${stageVariants.join(',')}`);

    let data: any[] | null = null;
    let lastError: any = null;

    for (const st of stageVariants) {
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
    
    // Extract unique keys
    const uniqueKeys = new Set<string>();
    for (const rule of data || []) {
      const chars = rule.observable_characteristics;
      if (Array.isArray(chars)) {
        for (const key of chars) {
          if (typeof key === 'string') {
            uniqueKeys.add(key.toUpperCase());
          }
        }
      }
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT-DRIVEN CLARIFICATION LOADER (fix for "rice not germinated" bug)
 * ═══════════════════════════════════════════════════════════════════════════
 * When the intent classifier has already resolved a high-confidence intent
 * (e.g. EMERGENCE_FAILURE), pull the clarification question + options DIRECTLY
 * from the DB instead of falling back to generic symptom buckets like
 * COLOR_CHANGE / DRYING / HOLES — agronomically nonsensical pre-emergence.
 *
 * Sources:
 *   - Question: intent_translations.question_text (intent_code + language)
 *   - Options:  intent_observation_mapping (intent_code, crop_code, growth_stage)
 *               → observation_translations (observation_code, language)
 *
 * Crop & stage are matched permissively: rows where crop_code matches the
 * current crop OR is 'all', AND growth_stage matches the current stage OR is 'all'.
 * Results are sorted: crop-specific > all, stage-specific > all, then by confidence_rank.
 */
export interface IntentDrivenClarification {
  question: string | null;
  options: Array<{ observation_code: string; label: string }>;
  loaded_from: 'DATABASE' | 'EMPTY';
}

export async function loadIntentDrivenClarification(
  intentCode: string,
  cropCode: string | null,
  growthStage: string | null,
  language: string,
  maxOptions: number = 3
): Promise<IntentDrivenClarification> {
  const empty: IntentDrivenClarification = { question: null, options: [], loaded_from: 'EMPTY' };
  try {
    const supabase = getSupabaseClient();
    if (!supabase || !intentCode) return empty;

    const intent = String(intentCode).toUpperCase();
    const crop = (cropCode || '').toLowerCase().trim();
    const stage = (growthStage || '').toLowerCase().trim();

    // 1) Question from intent_translations (language → en fallback)
    let question: string | null = null;
    try {
      const { data: qrows } = await supabase
        .from('intent_translations')
        .select('language_code, question_text')
        .eq('intent_code', intent)
        .in('language_code', [language, 'en']);
      if (qrows && qrows.length > 0) {
        const primary = qrows.find((r: any) => r.language_code === language);
        const fallback = qrows.find((r: any) => r.language_code === 'en');
        question = (primary?.question_text || fallback?.question_text || null) as string | null;
      }
    } catch (e) {
      console.warn(`[IntentDrivenClarification] intent_translations query failed: ${(e as Error).message}`);
    }

    // 2) Options from intent_observation_mapping (crop+stage permissive)
    const cropList = crop ? [crop, 'all'] : ['all'];
    const establishmentFamily = ['germination', 'nursery', 'seedling', 'emergence', 'establishment'];
    const stageList = stage
      ? (establishmentFamily.includes(stage)
          ? Array.from(new Set([...establishmentFamily, 'all']))
          : [stage, 'all'])
      : ['all'];

    let mappingRows: any[] = [];
    try {
      const { data, error } = await supabase
        .from('intent_observation_mapping')
        .select('observation_code, crop_code, growth_stage, confidence_rank')
        .eq('intent_code', intent)
        .eq('is_active', true)
        .in('crop_code', cropList)
        .in('growth_stage', stageList)
        .order('confidence_rank', { ascending: true, nullsFirst: false })
        .limit(50);
      if (error) {
        console.warn(`[IntentDrivenClarification] mapping query error: ${error.message}`);
      } else if (data) {
        mappingRows = data;
      }
    } catch (e) {
      console.warn(`[IntentDrivenClarification] mapping query exception: ${(e as Error).message}`);
    }

    // Rank: crop-specific > 'all', stage-specific > 'all', then confidence_rank
    const rank = (r: any) => {
      const cs = r.crop_code === crop ? 0 : 1;
      const ss = r.growth_stage === stage ? 0 : 1;
      const cr = typeof r.confidence_rank === 'number' ? r.confidence_rank : 999;
      return cs * 10000 + ss * 1000 + cr;
    };
    mappingRows.sort((a, b) => rank(a) - rank(b));

    // De-duplicate by observation_code, preserve order; gather buffer for label fallback
    const seen = new Set<string>();
    const orderedCodes: string[] = [];
    for (const r of mappingRows) {
      const code = r.observation_code;
      if (typeof code === 'string' && !seen.has(code)) {
        seen.add(code);
        orderedCodes.push(code);
        if (orderedCodes.length >= maxOptions * 4) break;
      }
    }

    if (orderedCodes.length === 0) {
      return { question, options: [], loaded_from: question ? 'DATABASE' : 'EMPTY' };
    }

    // 3) Labels from observation_translations (preferred language → en fallback)
    const labelsPrimary = await loadObservationLabels(supabase, orderedCodes, language).catch(() => new Map());
    const labelsFallback = language === 'en'
      ? labelsPrimary
      : await loadObservationLabels(supabase, orderedCodes, 'en').catch(() => new Map());

    // loadObservationLabels keys may be uppercased; try both shapes for safety.
    const pickLabel = (code: string): string | null => {
      const up = code.toUpperCase();
      return (
        (labelsPrimary.get(up)?.display_text as string | undefined) ||
        (labelsPrimary.get(code)?.display_text as string | undefined) ||
        (labelsFallback.get(up)?.display_text as string | undefined) ||
        (labelsFallback.get(code)?.display_text as string | undefined) ||
        null
      );
    };

    const options: Array<{ observation_code: string; label: string }> = [];
    for (const code of orderedCodes) {
      const label = pickLabel(code);
      if (label) {
        options.push({ observation_code: code, label });
        if (options.length >= maxOptions) break;
      }
    }
    // If labels missing in DB for both languages, fall back to formatted codes so UX never empties.
    if (options.length === 0) {
      for (const code of orderedCodes.slice(0, maxOptions)) {
        options.push({ observation_code: code, label: formatCodeFallback(code, language) });
      }
    }

    console.log(`[IntentDrivenClarification] intent=${intent} crop=${crop || '*'} stage=${stage || '*'} lang=${language} → question=${question ? 'YES' : 'NO'}, options=${options.length}`);

    return {
      question,
      options,
      loaded_from: 'DATABASE'
    };
  } catch (err) {
    console.error(`[IntentDrivenClarification] fatal: ${(err as Error).message}`);
    return empty;
  }
}

export default {
  getObservationKeyLabel,
  getObservationKeyLabels,
  getStageObservationKeys,
  getCategoryObservationKeys,
  loadObservationKeysFromDB,
  loadIntentDrivenClarification,
  getClarificationOptions,
  STAGE_KEY_PRIORITIES,
  CANONICAL_LOADER_VERSION
};

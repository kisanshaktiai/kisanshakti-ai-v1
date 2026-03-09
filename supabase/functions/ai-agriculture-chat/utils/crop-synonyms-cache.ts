/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP SYNONYMS CACHE v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * In-memory cache for crop_synonyms table (multilingual crop name → crop_code).
 * Used to enrich NLU crop detection with DB-sourced synonyms beyond
 * the hardcoded agricultural-vocabulary.ts entries.
 * 
 * Performance: 10-minute TTL, single global load.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CROP_SYNONYMS_VERSION = '1.0.0';

interface CropSynonymRow {
  crop_code: string;
  synonym: string;
  language_code: string;
}

interface SynonymsCache {
  /** Map of lowercase synonym → crop_code */
  synonymMap: Map<string, string>;
  loadedAt: number;
  loadingPromise?: Promise<Map<string, string>>;
}

let cache: SynonymsCache | null = null;
const CACHE_TTL = 600_000; // 10 minutes

/**
 * Load all crop synonyms from DB into an in-memory map.
 * Returns Map<lowercase_synonym, CROP_CODE>.
 */
export async function loadCropSynonyms(supabase: any): Promise<Map<string, string>> {
  const now = Date.now();
  
  if (cache && (now - cache.loadedAt) < CACHE_TTL) {
    return cache.synonymMap;
  }
  
  if (cache?.loadingPromise) {
    return cache.loadingPromise;
  }

  const loadPromise = (async (): Promise<Map<string, string>> => {
    try {
      const { data, error } = await supabase
        .from('crop_synonyms')
        .select('crop_code, synonym, language_code')
        .eq('is_active', true);
      
      if (error) {
        console.error(`[CROP_SYNONYMS] Load failed: ${error.message}`);
        return cache?.synonymMap || new Map();
      }
      
      const map = new Map<string, string>();
      for (const row of (data || []) as CropSynonymRow[]) {
        map.set(row.synonym.toLowerCase(), row.crop_code);
      }
      
      console.log(`[CROP_SYNONYMS] Loaded ${map.size} synonyms from DB`);
      cache = { synonymMap: map, loadedAt: Date.now() };
      return map;
    } catch (e) {
      console.error(`[CROP_SYNONYMS] Cache error:`, e instanceof Error ? e.message : 'unknown');
      return cache?.synonymMap || new Map();
    }
  })();
  
  cache = {
    synonymMap: cache?.synonymMap || new Map(),
    loadedAt: cache?.loadedAt || 0,
    loadingPromise: loadPromise
  };
  
  const result = await loadPromise;
  if (cache) delete cache.loadingPromise;
  return result;
}

/**
 * Look up a crop code from a text token using the DB synonym cache.
 * Returns the CROP_CODE or null if no match.
 */
export function lookupCropSynonym(token: string, synonymMap: Map<string, string>): string | null {
  return synonymMap.get(token.toLowerCase()) || null;
}

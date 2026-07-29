// CROP SYNONYMS CACHE v1.1.0

export const CROP_SYNONYMS_VERSION = '1.1.0';

interface CropSynonymRow {
  canonical_crop: string;
  variant_name: string;
  language_code: string;
  variant_type: string;
  region: string | null;
}

interface SynonymsCache {
  /** Map of lowercase variant_name → canonical_crop */
  synonymMap: Map<string, string>;
  loadedAt: number;
  loadingPromise?: Promise<Map<string, string>>;
}

let cache: SynonymsCache | null = null;
const CACHE_TTL = 600_000; // 10 minutes

// Load all crop synonyms from DB into an in-memory map.
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
        .select('canonical_crop, variant_name, language_code, variant_type, region')
        .eq('is_active', true);
      
      if (error) {
        console.error(`[CROP_SYNONYMS] ❌ Load failed: ${error.message} (code: ${error.code}, details: ${error.details})`);
        return cache?.synonymMap || new Map();
      }
      
      const map = new Map<string, string>();
      for (const row of (data || []) as CropSynonymRow[]) {
        map.set(row.variant_name.toLowerCase(), row.canonical_crop);
      }
      
      console.log(`[CROP_SYNONYMS] ✅ Loaded ${map.size} synonyms from DB`);
      cache = { synonymMap: map, loadedAt: Date.now() };
      return map;
    } catch (e) {
      console.error(`[CROP_SYNONYMS] ❌ Cache error:`, e instanceof Error ? e.message : 'unknown');
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

// Look up a crop code from a text token using the DB synonym cache.
export function lookupCropSynonym(token: string, synonymMap: Map<string, string>): string | null {
  return synonymMap.get(token.toLowerCase()) || null;
}

// Sync accessor to the module-level synonym cache.
export function getCachedSynonymMap(): Map<string, string> {
  return cache?.synonymMap ?? new Map();
}


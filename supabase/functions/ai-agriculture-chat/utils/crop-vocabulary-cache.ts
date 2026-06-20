/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP VOCABULARY CACHE v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * In-memory cache for crop_vocabulary table.
 * Provides romanized phrase → semantic hint mappings for LLM prompt enrichment.
 * 
 * Performance: 5-minute TTL, concurrency-safe loading.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CROP_VOCABULARY_VERSION = '1.0.0';

export interface VocabEntry {
  phrase_pattern: string;
  semantic_hint: string;
  recommended_intent_bias?: string;
  recommended_observation_bias?: string;
}

interface VocabCacheEntry {
  entries: VocabEntry[];
  loadedAt: number;
  loadingPromise?: Promise<VocabEntry[]>;
}

const vocabCache = new Map<string, VocabCacheEntry>();
const VOCAB_CACHE_TTL = 300_000; // 5 minutes

/**
 * Get crop-specific vocabulary entries with caching.
 * Returns empty array if no entries found or on error.
 */
export async function getCropVocabulary(cropCodeRaw: string, supabase: any): Promise<VocabEntry[]> {
  // CASING FIX (2026-06-20): crop_vocabulary rows in live DB are LOWERCASE
  // ('rice', 'all'). The previous code forced UPPER and returned 0 rows even
  // though DB contains rice=89, all=522 active entries. Query BOTH variants
  // so any historical UPPER rows continue to match as well.
  const upperKey = (cropCodeRaw || '').toUpperCase();
  const lowerKey = (cropCodeRaw || '').toLowerCase();
  const cacheKey = upperKey; // stable canonical cache key
  const now = Date.now();
  const cached = vocabCache.get(cacheKey);

  if (cached && (now - cached.loadedAt) < VOCAB_CACHE_TTL) {
    return cached.entries;
  }

  // Concurrency lock
  if (cached?.loadingPromise) {
    return cached.loadingPromise;
  }

  const loadPromise = (async () => {
    try {
      const variants = Array.from(new Set([upperKey, lowerKey].filter(Boolean)));
      const { data, error } = await supabase
        .from('crop_vocabulary')
        .select('phrase_pattern, semantic_hint, recommended_intent_bias, recommended_observation_bias')
        .in('crop_code', variants)
        .eq('is_active', true);

      if (error) {
        console.error(`[CROP_VOCAB] Failed to load vocabulary for ${cacheKey}: ${error.message}`);
        return cached?.entries || [];
      }

      const entries: VocabEntry[] = (data || []).map((r: any) => ({
        phrase_pattern: r.phrase_pattern,
        semantic_hint: r.semantic_hint,
        recommended_intent_bias: r.recommended_intent_bias,
        recommended_observation_bias: r.recommended_observation_bias
      }));

      console.log(`[CROP_VOCAB] Loaded ${entries.length} vocabulary entries for ${cacheKey} (variants=${variants.join(',')})`);
      vocabCache.set(cacheKey, { entries, loadedAt: Date.now() });
      return entries;
    } catch (e) {
      console.error(`[CROP_VOCAB] Cache load error for ${cacheKey}: ${e}`);
      return cached?.entries || [];
    }
  })();

  vocabCache.set(cacheKey, {
    entries: cached?.entries || [],
    loadedAt: cached?.loadedAt || 0,
    loadingPromise: loadPromise
  });

  const result = await loadPromise;
  const entry = vocabCache.get(cacheKey);
  if (entry) delete entry.loadingPromise;
  return result;
}

/**
 * Build a vocabulary block for LLM prompt injection.
 * Returns empty string if no vocabulary available.
 */
export function buildVocabularyPromptBlock(cropCode: string, entries: VocabEntry[]): string {
  if (!entries || entries.length === 0) return '';
  
  const lines = entries.map(e => `- "${e.phrase_pattern}" refers to ${e.semantic_hint}`);
  return `\nCROP-SPECIFIC VOCABULARY (${cropCode}):\n${lines.join('\n')}\n`;
}

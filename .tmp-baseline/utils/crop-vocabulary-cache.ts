// CROP VOCABULARY CACHE v1.0.0

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

// Get crop-specific vocabulary entries with caching.
export async function getCropVocabulary(cropCodeRaw: string, supabase: any): Promise<VocabEntry[]> {
  // crop_vocabulary.crop_code is stored LOWERCASE in DB (rice, sugarcane, all, …).
  // Callers pass 'RICE' / 'ALL' / 'Sugarcane'; normalize to lower to match.
  const cropCode = (cropCodeRaw || '').toLowerCase();

  const now = Date.now();
  const cached = vocabCache.get(cropCode);
  
  if (cached && (now - cached.loadedAt) < VOCAB_CACHE_TTL) {
    return cached.entries;
  }
  
  // Concurrency lock
  if (cached?.loadingPromise) {
    return cached.loadingPromise;
  }

  const loadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('crop_vocabulary')
        .select('phrase_pattern, semantic_hint, recommended_intent_bias, recommended_observation_bias')
        .eq('crop_code', cropCode)
        .eq('is_active', true);
      
      if (error) {
        console.error(`[CROP_VOCAB] Failed to load vocabulary for ${cropCode}: ${error.message}`);
        return cached?.entries || [];
      }
      
      const entries: VocabEntry[] = (data || []).map((r: any) => ({
        phrase_pattern: r.phrase_pattern,
        semantic_hint: r.semantic_hint,
        recommended_intent_bias: r.recommended_intent_bias,
        recommended_observation_bias: r.recommended_observation_bias
      }));
      
      console.log(`[CROP_VOCAB] Loaded ${entries.length} vocabulary entries for ${cropCode}`);
      vocabCache.set(cropCode, { entries, loadedAt: Date.now() });
      return entries;
    } catch (e) {
      console.error(`[CROP_VOCAB] Cache load error for ${cropCode}: ${e}`);
      return cached?.entries || [];
    }
  })();
  
  vocabCache.set(cropCode, {
    entries: cached?.entries || [],
    loadedAt: cached?.loadedAt || 0,
    loadingPromise: loadPromise
  });
  
  const result = await loadPromise;
  const entry = vocabCache.get(cropCode);
  if (entry) delete entry.loadingPromise;
  return result;
}

// Build a vocabulary block for LLM prompt injection.
export function buildVocabularyPromptBlock(cropCode: string, entries: VocabEntry[]): string {
  if (!entries || entries.length === 0) return '';
  
  const lines = entries.map(e => `- "${e.phrase_pattern}" refers to ${e.semantic_hint}`);
  return `\nCROP-SPECIFIC VOCABULARY (${cropCode}):\n${lines.join('\n')}\n`;
}

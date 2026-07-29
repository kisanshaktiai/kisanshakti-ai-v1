// MARKET PRODUCT LOOKUP - Ingredient → Brand Name Resolver

import { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

// CACHE - 6-hour TTL ingredient→product cache

interface CacheEntry {
  products: string[];
  expiresAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const ingredientProductCache = new Map<string, CacheEntry>();

function getCacheKey(ingredient: string, crop: string): string {
  return `${ingredient.toLowerCase().trim()}::${crop.toLowerCase().trim()}`;
}

function getFromCache(key: string): string[] | null {
  const entry = ingredientProductCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ingredientProductCache.delete(key);
    return null;
  }
  return entry.products;
}

function setCache(key: string, products: string[]): void {
  ingredientProductCache.set(key, {
    products,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
  // Limit cache size
  if (ingredientProductCache.size > 200) {
    const oldestKey = ingredientProductCache.keys().next().value;
    if (oldestKey) ingredientProductCache.delete(oldestKey);
  }
}

// INGREDIENT KEYWORD EXTRACTION

// Extract the primary ingredient keyword from a full ingredient string.
export function extractIngredientKeyword(activeIngredient: string): string {
  if (!activeIngredient || typeof activeIngredient !== 'string') return '';
  
  // Remove percentage and formulation codes
  const cleaned = activeIngredient
    .replace(/\d+\.?\d*\s*%/g, '')  // Remove percentages
    .replace(/\b(EC|SC|SL|WP|WG|SP|SG|GR|FS|CS|SE|EW|OD|ZC)\b/gi, '') // Remove formulation codes
    .trim();
  
  // Take the first word (primary ingredient name)
  const firstWord = cleaned.split(/\s+/)[0];
  return firstWord || activeIngredient.split(/\s+/)[0] || '';
}

// MAIN LOOKUP FUNCTION

export interface MarketProductResult {
  found: boolean;
  products: string[];        // Brand names e.g. ["Dursban 20 EC", "Lorsban 20 EC"]
  ingredient: string;        // Original ingredient string
  source: 'cache' | 'db' | 'fallback';
}

// Look up market product brand names for a given active ingredient and crop.
export async function lookupMarketProducts(
  supabase: SupabaseClient,
  activeIngredient: string,
  cropCode: string
): Promise<MarketProductResult> {
  if (!activeIngredient || !supabase) {
    return { found: false, products: [], ingredient: activeIngredient || '', source: 'fallback' };
  }

  const keyword = extractIngredientKeyword(activeIngredient);
  if (!keyword) {
    return { found: false, products: [], ingredient: activeIngredient, source: 'fallback' };
  }

  const cacheKey = getCacheKey(keyword, cropCode || 'ALL');

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached !== null) {
    console.log(`[MarketProductLookup] Cache hit for ${keyword}/${cropCode}: ${cached.length} products`);
    return { found: cached.length > 0, products: cached, ingredient: activeIngredient, source: 'cache' };
  }

  try {
    // Phase G — G5: PostgREST cannot apply `ilike` to a `jsonb::text` cast
    const cropNorm = (cropCode || '').toUpperCase().replace(/[_\s-]+/g, '');

    const { data, error } = await supabase
      .from('master_products')
      .select('brand, active_ingredients, suitable_crops, ai_metadata, effectiveness_rating')
      .eq('ai_recommendable', true)
      .eq('status', 'active')
      .order('effectiveness_rating', { ascending: false })
      .limit(500);

    if (error) {
      console.warn(`[MarketProductLookup] DB error: ${error.message}`);
      setCache(cacheKey, []);
      return { found: false, products: [], ingredient: activeIngredient, source: 'fallback' };
    }

    // In-memory keyword scan over active_ingredients JSONB payload (any shape).
    const keywordLc = keyword.toLowerCase();
    const ingredientMatched = (data || []).filter((p: any) => {
      const ai = p.active_ingredients;
      if (ai == null) return false;
      try {
        const s = typeof ai === 'string' ? ai : JSON.stringify(ai);
        return s.toLowerCase().includes(keywordLc);
      } catch { return false; }
    });

    if (ingredientMatched.length === 0) {
      console.log(`[MarketProductLookup] No products found for ingredient "${keyword}"`);
      setCache(cacheKey, []);
      return { found: false, products: [], ingredient: activeIngredient, source: 'fallback' };
    }

    // Filter by crop (in-memory for flexible matching)
    const cropFiltered = cropNorm
      ? ingredientMatched.filter((p: any) => {
          const crops = p.suitable_crops || [];
          return crops.includes('ALL_CROPS') ||
            crops.some((c: string) => c.toUpperCase().replace(/[_\s-]+/g, '').includes(cropNorm));
        })
      : ingredientMatched;

    const candidates = cropFiltered.length > 0 ? cropFiltered : ingredientMatched; // fallback to all crops

    // Extract brand names, split "/" delimiter, flatten, dedupe
    const brandNames: string[] = [];
    for (const product of candidates) {
      // First check ai_metadata.brand_examples
      const brandExamples = product.ai_metadata?.brand_examples;
      if (Array.isArray(brandExamples)) {
        for (const b of brandExamples) {
          if (b && !brandNames.includes(b)) brandNames.push(b);
        }
      }
      // Then split brand field
      if (product.brand) {
        const parts = product.brand.split('/').map((s: string) => s.trim()).filter(Boolean);
        for (const p of parts) {
          if (p && !brandNames.includes(p)) brandNames.push(p);
        }
      }
      if (brandNames.length >= 3) break; // max 3
    }

    const result = brandNames.slice(0, 3);
    setCache(cacheKey, result);

    console.log(`[MarketProductLookup] Found ${result.length} products for ${keyword}/${cropCode}: ${result.join(', ')}`);
    return { found: result.length > 0, products: result, ingredient: activeIngredient, source: 'db' };

  } catch (err) {
    console.error(`[MarketProductLookup] Unexpected error:`, err);
    setCache(cacheKey, []);
    return { found: false, products: [], ingredient: activeIngredient, source: 'fallback' };
  }
}

// Format market products for display in farmer response.
export function formatMarketProducts(
  products: string[],
  language: string
): string {
  if (!products || products.length === 0) {
    const fallbacks: Record<string, string> = {
      mr: '📦 स्थानिक उपलब्ध फॉर्म्युलेशन तपासा',
      hi: '📦 स्थानीय उपलब्ध फॉर्मूलेशन जांचें',
      en: '📦 Check locally available formulation'
    };
    return fallbacks[language] || fallbacks.en;
  }

  const labels: Record<string, string> = {
    mr: '📦 बाजारात उपलब्ध',
    hi: '📦 बाज़ार में उपलब्ध',
    en: '📦 Available in market'
  };

  const label = labels[language] || labels.en;
  return `${label}: ${products.join(', ')}`;
}

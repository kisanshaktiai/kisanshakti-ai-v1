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
  // Kept for callers/tests that expect the first word (cache keys, logs).
  return extractIngredientTokens(activeIngredient)[0] || '';
}

/**
 * 2026-09-06 — EXACT-INGREDIENT MATCHING. Live trace_mtppdk03_ysulhl offered
 * "Potash, Gromor NPK" for `Potassium Sulphate (foliar)`: the old matcher used
 * only the FIRST word ("potassium"), so muriate of potash (KCl) and NPK blends
 * matched a foliar sulphate. A product must contain EVERY chemical token of the
 * rule's active ingredient. Percentages, formulation codes and parenthetical
 * notes ("(foliar)", "(ZnSO4)") are stripped; British/US spellings are folded.
 */
const _INGREDIENT_STOP = new Set(['of','and','the','foliar','soil','basal','drench','spray','granular','organic','technical']);
/** Pack/grade descriptors, not identity: folded before comparison. */
const _NON_IDENTIFYING = new Set(['monohydrate','heptahydrate','pentahydrate','dihydrate','hydrate','anhydrous','hydrated','pure','tech','technical','grade','powder','granules','crystal','crystals']);
function _foldSpelling(w: string): string {
  return w.toLowerCase()
    .replace(/sulphate/g, 'sulfate').replace(/sulphur/g, 'sulfur')
    .replace(/hydrochloride/g, 'hcl').replace(/[^a-z0-9]/g, '');
}
export function extractIngredientTokens(activeIngredient: string): string[] {
  if (!activeIngredient || typeof activeIngredient !== 'string') return [];
  const cleaned = activeIngredient
    .replace(/\([^)]*\)/g, ' ')                                    // parenthetical notes
    .replace(/\d+\.?\d*\s*%/g, ' ')                                 // percentages
    .replace(/\b(EC|SC|SL|WP|WG|SP|SG|GR|FS|CS|SE|EW|OD|ZC|G|DP|WDG)\b/gi, ' ') // formulation codes
    .replace(/[+/,]/g, ' ');
  return Array.from(new Set(
    cleaned.split(/\s+/).map(_foldSpelling).filter((w) => w.length > 2 && !_INGREDIENT_STOP.has(w)),
  ));
}
/** True when the product's active_ingredients payload identifies the same ingredient.
 *  Both sides are spelling-folded (sulphate→sulfate etc.), so a payload written "Sulphur 90% WDG"
 *  is comparable with a rule written "Sulphur 80% WG". A product is a match when it carries the
 *  IDENTIFYING tokens of the request — the longest token (the salt/molecule name) plus, when the
 *  request names an element and a salt, that element too. Requiring EVERY token made a request for
 *  "Zinc Sulphate Monohydrate" miss a product listed as "Zinc Sulphate 21%", which is the same
 *  input a farmer buys: hydration state and grade are packaging detail, not identity. */
/** The ingredient entry a product is actually sold as: highest declared percentage, else the first.
 *  Trace nutrients (the 13% sulphur inside a magnesium fertiliser) must not make that product an
 *  answer to "which sulphur product do I buy". */
function _principalIngredientText(payload: unknown): string {
  if (payload == null) return '';
  try {
    const list = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (Array.isArray(list) && list.length) {
      const best = [...list].sort((a, b) => Number(b?.percentage ?? 0) - Number(a?.percentage ?? 0))[0];
      return _foldSpelling(JSON.stringify(best ?? list[0]));
    }
    return _foldSpelling(JSON.stringify(list));
  } catch { return _foldSpelling(String(payload)); }
}

/** True when the product is the same input the rule names. Both sides are spelling-folded, so a
 *  payload written "Sulphur 90% WDG" is comparable with a rule written "Sulphur 80% WG".
 *  The identifying token must appear in the product NAME or in its PRINCIPAL ingredient — the salt
 *  is often only in the name (payloads store the nutrient plus a formula, e.g. Zinc + ZnSO4.7H2O) —
 *  and the remaining tokens are matched loosely, because hydration state and grade
 *  ("…Monohydrate", "21%") are packaging detail, not identity. */
export function productMatchesIngredient(activeIngredientsPayload: unknown, tokens: string[], productName = ''): boolean {
  if (!tokens.length) return false;
  let payloadHay = '';
  try { payloadHay = _foldSpelling(typeof activeIngredientsPayload === 'string' ? activeIngredientsPayload : JSON.stringify(activeIngredientsPayload ?? '')); } catch { payloadHay = ''; }
  const nameHay = _foldSpelling(productName || '');
  // What the product IS, is what the pack is called; the declared percentages are only a fallback
  // (a magnesium sulphate can declare more sulphur than magnesium, which would otherwise make it
  // the answer to "which sulphur product").
  const principalHay = nameHay || _principalIngredientText(activeIngredientsPayload);
  const fullHay = `${nameHay}${payloadHay}`;
  if (!principalHay && !fullHay) return false;
  const folded = tokens.map((t) => _foldSpelling(t)).filter(Boolean);
  // Hydration state, purity and grade describe the pack, not the input: a rule naming the
  // monohydrate salt is answered by the same salt sold as heptahydrate.
  const identifying = folded.filter((t) => !_NON_IDENTIFYING.has(t));
  const required = identifying.length ? identifying : folded;
  if (!required.length) return false;
  // Every identifying token must be present somewhere on the product, and at least one of them
  // must be what the product is principally sold as — so a trace nutrient never answers the query.
  if (!required.every((t) => fullHay.includes(t))) return false;
  return required.some((t) => principalHay.includes(t));
}

// MAIN LOOKUP FUNCTION

export interface MarketProductResult {
  found: boolean;
  products: string[];        // Brand names e.g. ["Dursban 20 EC", "Lorsban 20 EC"]
  ingredient: string;        // Original ingredient string
  source: 'cache' | 'db' | 'fallback';
}

export type MarketProductMemo = Map<string, Promise<MarketProductResult>>;

/** Request-local promise memo. The caller owns the Map, so results cannot leak
 * across requests while duplicate formatter/fallback lookups coalesce. */
export function lookupMarketProductsMemoized(
  memo: MarketProductMemo,
  supabase: SupabaseClient,
  activeIngredient: string,
  cropCode: string,
): Promise<MarketProductResult> {
  const key = `${activeIngredient.trim().toLowerCase()}::${cropCode.trim().toLowerCase()}`;
  const existing = memo.get(key);
  if (existing) return existing;
  const pending = lookupMarketProducts(supabase, activeIngredient, cropCode);
  memo.set(key, pending);
  return pending;
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
      .select('name, brand, active_ingredients, suitable_crops, ai_metadata, effectiveness_rating')
      .eq('ai_recommendable', true)
      .eq('status', 'active')
      .order('effectiveness_rating', { ascending: false })
      .limit(500);

    if (error) {
      console.warn(`[MarketProductLookup] DB error: ${error.message}`);
      setCache(cacheKey, []);
      return { found: false, products: [], ingredient: activeIngredient, source: 'fallback' };
    }

    // In-memory scan over active_ingredients JSONB payload (any shape).
    // 2026-09-06 — ALL ingredient tokens must match (see extractIngredientTokens).
    const _tokens = extractIngredientTokens(activeIngredient);
    const keywordLc = keyword.toLowerCase();
    const ingredientMatched = (data || []).filter((p: any) => productMatchesIngredient(p?.active_ingredients, _tokens.length ? _tokens : [keywordLc], p?.name || p?.brand || ''));

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

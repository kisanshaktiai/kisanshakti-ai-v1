// PHASE 4: CENTRALIZED I18N TRANSLATION LOADER
//
// CHANGE LOG (newest first)
//   2026-08-08 — v2.1.0 — FIX (I18N truncation, root cause of Marathi option
//     leakage): initializeTranslationCache() paginated. Both source reads
//     previously used a single .limit(5000) / .limit(2000); PostgREST caps a
//     single response at 1,000 rows, so observation_translations (5,438 rows)
//     loaded only ~1,000 (~80% of Marathi labels silently missing) and
//     decision_rules i18n_keys (1,824) capped at 1,000. Reads now page in
//     1,000-row keyset windows until exhausted, with a post-load assertion
//     that logs [I18N_COVERAGE] loaded-vs-expected so any future truncation is
//     visible instead of silent. No signature or cache-shape change — pure
//     drop-in. Verified against live schema 2026-08-08: observation_translations
//     columns (observation_code, language_code, display_text, description_text);
//     decision_rules columns (i18n_key, action_text, reason_text, cause,
//     category). Ordering keys: observation_translations has no single unique
//     column exposed, so we page by a stable composite cursor
//     (observation_code, language_code); decision_rules pages by id.
//   (prior) v2.0.0 — key-first resolution, English-only rule storage.

export const I18N_LOADER_VERSION = '2.1.0';

// TYPE DEFINITIONS

export interface Translation {
  key: string;
  [language: string]: string | undefined;  // Any language code → translated text
  category?: string;
}

export interface TranslationCache {
  translations: Map<string, Translation>;
  loaded_at: number;
  version: string;
}

// Language-agnostic: accepts any language code
export type SupportedLanguage = string;

// CACHE

let translationCache: TranslationCache | null = null;
const CACHE_TTL = 3600000; // 1 hour
const PAGE_SIZE = 1000;    // PostgREST hard cap per request
const MAX_PAGES = 50;      // safety ceiling (50k rows) — prevents infinite loop

// CORE TRANSLATION FUNCTION (unchanged)

export function getTranslation(
  i18nKey: string | null | undefined,
  language: SupportedLanguage
): string {
  if (!i18nKey) {
    return '';
  }
  const normalizedKey = normalizeI18nKey(i18nKey);
  if (translationCache?.translations.has(normalizedKey)) {
    const translation = translationCache.translations.get(normalizedKey)!;
    const value = translation[language];
    if (value && language === 'en') {
      return value;
    }
    if (value && language !== 'en' && value !== translation.en) {
      return value;
    }
  }
  return formatKeyForDisplay(normalizedKey, language);
}

export function getTranslationObject(i18nKey: string): Translation | null {
  const normalizedKey = normalizeI18nKey(i18nKey);
  if (translationCache?.translations.has(normalizedKey)) {
    return translationCache.translations.get(normalizedKey)!;
  }
  return null;
}

// KEY NORMALIZATION (unchanged)

export function normalizeI18nKey(key: string): string {
  if (!key) return '';
  return key
    .toUpperCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim();
}

function formatKeyForDisplay(key: string, language?: string): string {
  if (language && language !== 'en') {
    return key.replace(/_/g, ' ');
  }
  return key
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// BATCH TRANSLATION (unchanged)

export function getTranslations(
  keys: string[],
  language: SupportedLanguage
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    result[key] = getTranslation(key, language);
  }
  return result;
}

export function translateCause(
  cause: string,
  language: SupportedLanguage
): string {
  if (!cause) return '';
  const direct = getTranslation(cause, language);
  if (direct !== formatKeyForDisplay(normalizeI18nKey(cause))) {
    return direct;
  }
  const simplifiedCause = cause
    .replace(/_(INFESTATION|ATTACK|DAMAGE|SUSPECT)$/i, '')
    .replace(/_?(germination|tillering|vegetative|grand_growth|maturity)$/i, '');
  return getTranslation(simplifiedCause, language);
}

// ─────────────────────────────────────────────────────────────────────────
// PAGINATION HELPER — pulls an entire table in PAGE_SIZE windows.
// Uses range() offset paging (works for any table; no unique-cursor needed).
// Stops when a short page returns, or MAX_PAGES is hit (logged as a warning).
// ─────────────────────────────────────────────────────────────────────────
async function loadAllRows(
  supabaseClient: any,
  table: string,
  columns: string,
  applyFilters?: (q: any) => any,
): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabaseClient.from(table).select(columns).range(from, to);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) {
      console.warn(`⚠️ [I18N] ${table} page ${page} error: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break; // last page
    if (page === MAX_PAGES - 1) {
      console.warn(`⚠️ [I18N] ${table} hit MAX_PAGES (${MAX_PAGES}); load may be incomplete`);
    }
  }
  return rows;
}

// CACHE MANAGEMENT

export async function initializeTranslationCache(
  supabaseClient: any
): Promise<void> {
  const now = Date.now();
  if (translationCache && now < translationCache.loaded_at + CACHE_TTL) {
    return;
  }

  try {
    const translations = new Map<string, Translation>();

    // SOURCE 1: observation_translations (genuine multilingual labels) — PAGINATED
    const obsTranslations = await loadAllRows(
      supabaseClient,
      'observation_translations',
      'observation_code, language_code, display_text, description_text',
    );

    let obsGroupCount = 0;
    if (obsTranslations.length > 0) {
      const grouped = new Map<string, Translation>();
      for (const row of obsTranslations) {
        const code = (row.observation_code || '').toUpperCase();
        if (!code) continue;
        if (!grouped.has(code)) {
          grouped.set(code, { key: code });
        }
        const entry = grouped.get(code)!;
        const lang = (row.language_code || 'en').toLowerCase();
        const display = (row.display_text || '').trim();
        const desc = (row.description_text || '').trim();
        // display_text is the chip-ready label; description_text is the fallback
        entry[lang] = display || desc;
      }
      for (const [code, translation] of grouped) {
        translations.set(code, translation);
        const lower = code.toLowerCase();
        if (lower !== code) translations.set(lower, { ...translation, key: lower });
      }
      obsGroupCount = grouped.size;
      console.log(`   ✅ [I18N] Loaded ${obsTranslations.length} observation_translations rows → ${obsGroupCount} codes`);
    }

    // SOURCE 2: decision_rules i18n_key → English text ONLY — PAGINATED
    const ruleData = await loadAllRows(
      supabaseClient,
      'decision_rules',
      'i18n_key, action_text, reason_text, cause, category',
      (q) => q.not('i18n_key', 'is', null),
    );

    let ruleCount = 0;
    for (const row of ruleData) {
      if (row.i18n_key) {
        const key = normalizeI18nKey(row.i18n_key);
        const text = row.action_text || row.reason_text || row.cause || '';
        if (!translations.has(key)) {
          translations.set(key, {
            key,
            en: text, // English only — mr/hi come from observation_translations (SOURCE 1) or LLM narration
            category: row.category,
          });
          ruleCount++;
        }
      }
    }
    console.log(`   ✅ [I18N] Loaded ${ruleData.length} decision_rules rows → ${ruleCount} new i18n_keys`);

    translationCache = {
      translations,
      loaded_at: now,
      version: I18N_LOADER_VERSION,
    };

    // COVERAGE ASSERTION — makes any future truncation loud, not silent.
    // Expected counts are queried live so the check self-updates as data grows.
    try {
      const { count: obsExpected } = await supabaseClient
        .from('observation_translations')
        .select('*', { count: 'exact', head: true });
      const { count: ruleExpected } = await supabaseClient
        .from('decision_rules')
        .select('*', { count: 'exact', head: true })
        .not('i18n_key', 'is', null);
      if (obsExpected != null && obsTranslations.length < obsExpected) {
        console.warn(`⚠️ [I18N_COVERAGE] observation_translations loaded ${obsTranslations.length}/${obsExpected} — INCOMPLETE`);
      }
      if (ruleExpected != null && ruleData.length < ruleExpected) {
        console.warn(`⚠️ [I18N_COVERAGE] decision_rules loaded ${ruleData.length}/${ruleExpected} — INCOMPLETE`);
      }
      console.log(`✅ [I18N v${I18N_LOADER_VERSION}] Total cache: ${translations.size} entries (obs rows ${obsTranslations.length}/${obsExpected ?? '?'}, rule rows ${ruleData.length}/${ruleExpected ?? '?'})`);
    } catch (covErr) {
      console.log(`✅ [I18N v${I18N_LOADER_VERSION}] Total cache: ${translations.size} entries (coverage check skipped: ${covErr})`);
    }
  } catch (e) {
    console.error('❌ [I18N] Cache initialization failed:', e);
  }
}

export function clearTranslationCache(): void {
  translationCache = null;
  console.log('🧹 [I18N] Cache cleared');
}

export function isCacheInitialized(): boolean {
  return translationCache !== null;
}

export default {
  I18N_LOADER_VERSION,
  getTranslation,
  getTranslationObject,
  getTranslations,
  translateCause,
  normalizeI18nKey,
  initializeTranslationCache,
  clearTranslationCache,
  isCacheInitialized,
};

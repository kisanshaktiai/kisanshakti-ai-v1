/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP NAMES CACHE — DB-driven SSOT for multilingual crop labels
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PR-3: Replaces the hardcoded `ICAR_CALENDARS[cropCode].crop_name_{en,mr,hi}`
 * lookups that lived inside `decision/crop-calendar-lookup.ts`. That table
 * shipped only 5 crops. The `public.crops` table has 100+ crops with
 * translations for hi, mr, pa, ta, te, bn, gu, kn, ml, or, as, ur, sa.
 *
 * SSOT: `public.crops` (value, label, label_hi, label_mr, ...)
 * Runtime shape:
 *   Map<crop_code_lower, CropNameRow>
 *
 * Sync accessors — safe to call from any layer once `loadCropNames` has run
 * inside the orchestrator boot phase (idempotent, 10-minute TTL).
 *
 * Cache-miss contract: accessors return `null` on miss and log
 * `[CROP_NAMES_CACHE_MISS]`. Callers must NEVER fall back to a hardcoded
 * multilingual dictionary — the resolution chain is:
 *   crops.label_<lang> → crops.label → raw crop_code
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface CropNameRow {
  code: string;              // canonical crop_code (crops.value)
  label: string;             // English canonical (crops.label)
  translations: Record<string, string>; // lang → label_<lang>
}

interface Cache {
  loadedAt: number;
  byCode: Map<string, CropNameRow>;
  all: CropNameRow[];
}

let cache: Cache | null = null;
let loadingPromise: Promise<void> | null = null;
const TTL_MS = 10 * 60 * 1000;

const LANG_COLUMNS = [
  'label_hi', 'label_mr', 'label_pa', 'label_ta', 'label_te',
  'label_bn', 'label_gu', 'label_kn', 'label_ml', 'label_or',
  'label_as', 'label_ur', 'label_sa',
];

/** Preload public.crops into the in-memory cache. Idempotent. */
export async function loadCropNames(supabase: any): Promise<void> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const selectCols = ['value', 'label', 'local_name', ...LANG_COLUMNS].join(', ');
      const all: CropNameRow[] = [];
      const byCode = new Map<string, CropNameRow>();

      // Pagination to bypass PostgREST 1000-row cap
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('crops')
          .select(selectCols)
          .eq('is_active', true)
          .range(from, from + PAGE - 1);
        if (error) {
          console.warn(`[CROP_NAMES] load error: ${error.message}`);
          break;
        }
        if (!Array.isArray(data) || data.length === 0) break;
        for (const r of data as any[]) {
          const code = String(r?.value || '').toLowerCase().trim();
          if (!code) continue;
          const translations: Record<string, string> = {};
          for (const col of LANG_COLUMNS) {
            const v = r?.[col];
            if (v && typeof v === 'string') {
              translations[col.replace('label_', '')] = v;
            }
          }
          const row: CropNameRow = {
            code,
            label: String(r?.label || r?.local_name || code),
            translations,
          };
          all.push(row);
          byCode.set(code, row);
        }
        if (data.length < PAGE) break;
      }

      cache = { loadedAt: now, byCode, all };
      console.log(`[CROP_NAMES] loaded ${all.length} crops from public.crops`);
    } catch (e) {
      console.warn('[CROP_NAMES] load failed', e instanceof Error ? e.message : e);
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/** Sync accessor. Returns null on miss. */
export function getCropNameRow(cropCode: string): CropNameRow | null {
  if (!cache) return null;
  const key = String(cropCode || '').toLowerCase().trim();
  const row = cache.byCode.get(key);
  if (!row) {
    console.warn(`[CROP_NAMES_CACHE_MISS] crop_code=${key}`);
    return null;
  }
  return row;
}

/** English canonical label (or raw crop code on miss). */
export function getCropCanonical(cropCode: string): string {
  return getCropNameRow(cropCode)?.label || cropCode;
}

/**
 * Localized display name.
 * lang: ISO-2 code (hi, mr, ta, ...). Falls back to English label, then raw code.
 */
export function getCropDisplayName(cropCode: string, lang: string): string {
  const row = getCropNameRow(cropCode);
  if (!row) return cropCode;
  const key = String(lang || '').toLowerCase();
  return row.translations[key] || row.label || cropCode;
}

/** All loaded rows — used by crop-integrity scanners in llm-response-generator. */
export function getAllCropNames(): CropNameRow[] {
  return cache?.all ?? [];
}

export function isCropNamesLoaded(): boolean {
  return !!cache && cache.all.length > 0;
}

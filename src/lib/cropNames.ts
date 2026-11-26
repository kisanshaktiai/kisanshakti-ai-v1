/**
 * Crop names in the farmer's language.
 *
 * The lands table stores the crop two ways: `current_crop_id` (a crops row)
 * and `current_crop` (free text, written in whatever language and case the
 * crop was typed in: "Rice", "rice", "तांदूळ"). The crops table has the name
 * in every app language (`label_<code>`), plus `local_name`, `label_local`,
 * and 727 synonym rows. This module turns either form into the name for the
 * current language, and falls back to the stored text when nothing matches.
 *
 * One read of the two small tables per session, shared by every screen.
 */
import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n/config';

export interface CropRow {
  id: string;
  value: string | null;
  label: string | null;
  label_local?: string | null;
  local_name?: string | null;
  [column: string]: unknown;
}

interface CropIndex {
  byId: Map<string, CropRow>;
  /** lower-cased name or synonym -> crops row */
  byText: Map<string, CropRow>;
}

const key = (text: string | null | undefined) => (text ?? '').trim().toLowerCase();
const LABEL_PREFIX = 'label_';

let index: CropIndex | null = null;
let loading: Promise<CropIndex> | null = null;
const listeners = new Set<() => void>();

function buildIndex(rows: CropRow[], synonyms: { canonical_crop: string | null; variant_name: string | null }[]): CropIndex {
  const byId = new Map<string, CropRow>();
  const byText = new Map<string, CropRow>();
  const put = (text: string | null | undefined, row: CropRow) => {
    const k = key(text);
    if (k && !byText.has(k)) byText.set(k, row);
  };
  for (const row of rows) {
    byId.set(row.id, row);
    put(row.value, row);
    put(row.label, row);
    put(row.local_name, row);
    put(row.label_local, row);
    for (const [column, text] of Object.entries(row)) {
      if (column.startsWith(LABEL_PREFIX) && typeof text === 'string') {
        put(text, row);
        // "भात / तांदूळ" also answers to "भात" and to "तांदूळ"
        for (const part of text.split(/\s*[/,]\s*/)) put(part, row);
      }
    }
    // "Jowar (Sorghum)" also answers to "jowar" and "sorghum"
    const m = /^(.+?)\s*\((.+)\)\s*$/.exec(row.label ?? '');
    if (m) { put(m[1], row); put(m[2], row); }
  }
  for (const s of synonyms) {
    const row = byText.get(key(s.canonical_crop));
    if (row) put(s.variant_name, row);
  }
  return { byId, byText };
}

/** Reads the crop tables once; later calls return the same promise or the cached index. */
export function loadCropIndex(): Promise<CropIndex> {
  if (index) return Promise.resolve(index);
  if (!loading) {
    loading = (async () => {
      const [{ data: crops, error }, { data: synonyms }] = await Promise.all([
        supabase.from('crops').select('*').eq('is_active', true),
        supabase.from('crop_synonyms').select('canonical_crop, variant_name').eq('is_active', true),
      ]);
      if (error) throw error;
      index = buildIndex((crops ?? []) as unknown as CropRow[], synonyms ?? []);
      listeners.forEach((fn) => fn());
      return index;
    })().catch((err) => {
      loading = null;            // a failed read is retried on the next call
      throw err;
    });
  }
  return loading;
}

/** For React: called when the index arrives, so a screen drawn before it redraws. */
export function subscribeCropIndex(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const cropIndexLoaded = () => index !== null;

/** The crops row for an id and/or stored text, or null. */
export function resolveCrop(text: string | null | undefined, cropId?: string | null): CropRow | null {
  if (!index) return null;
  if (cropId) {
    const byId = index.byId.get(cropId);
    if (byId) return byId;
  }
  return index.byText.get(key(text)) ?? null;
}

/**
 * The crop's name in `language` (defaults to the app language). Falls back to
 * the stored text, so a crop that is not in the table still shows as typed.
 */
export function cropName(text: string | null | undefined, cropId?: string | null, language?: string): string {
  const row = resolveCrop(text, cropId);
  if (!row) return text ?? '';
  const lang = (language ?? i18n.language ?? 'en').split('-')[0];
  const localized = lang !== 'en' ? row[`${LABEL_PREFIX}${lang}`] : null;
  return (typeof localized === 'string' && localized) || row.local_name || row.label || row.value || text || '';
}

/** Test seam. */
export function _setCropIndexForTests(rows: CropRow[] | null, synonyms: { canonical_crop: string; variant_name: string }[] = []) {
  index = rows ? buildIndex(rows, synonyms) : null;
  loading = null;
  listeners.forEach((fn) => fn());
}

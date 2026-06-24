/**
 * useLandRefLabels — resolves raw land field values (slugs, legacy labels,
 * or UUIDs) into the farmer's selected-language display label using the
 * reference tables (soil_types, water_sources, irrigation_types, crops,
 * districts, talukas, states).
 *
 * Resolution chain per value:
 *   1. Multi-key lookup (id / value / slug / lowercased base label)
 *   2. Contains-fallback (substring match against any row's base label)
 *   3. UUID → treated as unresolved (never leaked to UI)
 *   4. Free-text slug → humanized title-case
 *   5. Empty/null/loading → localized friendly fallback via i18n
 *
 * Public API:
 *   - .soil(v) / .water(v) / .irrigation(v) / .crop(v)
 *     / .district(v) / .taluka(v) / .state(v) → user-friendly string
 *     (NEVER blank, NEVER a UUID — always safe to render)
 *   - .status(v, kind) → 'ok' | 'humanized' | 'fallback' | 'loading'
 *   - .display(v, kind) → { text, status, isFallback, loading }
 *   - .location({village, taluka, district, state}) → joined string with
 *     friendly fallback when nothing resolves.
 *   - .loading → boolean (initial fetch in flight)
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { pickLocalized, normalizeLang, cols } from '@/lib/i18nRef';

type Kind = 'soil' | 'water' | 'irrigation' | 'crop' | 'district' | 'taluka' | 'state';
type Status = 'ok' | 'humanized' | 'fallback' | 'loading';

const REF_KEY = ['ref', 'land-labels-all', 'v2'] as const;

async function fetchAll() {
  const labelCols = cols('label', 'id', 'value', 'description');
  const nameCols = cols('name', 'id');
  const [soil, water, irr, crops, dist, tal, st] = await Promise.all([
    supabase.from('soil_types').select(labelCols),
    supabase.from('water_sources').select(labelCols),
    supabase.from('irrigation_types').select(labelCols),
    supabase.from('crops').select(labelCols).limit(2000),
    supabase.from('districts').select(nameCols).limit(2000),
    supabase.from('talukas').select('id,name').limit(2000),
    supabase.from('states').select('id,name').limit(200),
  ]);

  const errors = { soil: soil.error, water: water.error, irr: irr.error, crops: crops.error, dist: dist.error, tal: tal.error, st: st.error };
  const anyErr = Object.entries(errors).find(([, e]) => e);
  if (anyErr) {
    console.warn('[useLandRefLabels] fetch errors:', errors);
  }

  return {
    soil: soil.data || [],
    water: water.data || [],
    irrigation: irr.data || [],
    crop: crops.data || [],
    district: dist.data || [],
    taluka: tal.data || [],
    state: st.data || [],
  };
}

const norm = (s: string) => String(s || '').toLowerCase().trim();
const slugify = (s: string) => norm(s).replace(/[\s/]+/g, '_').replace(/[^a-z0-9_]/g, '');
const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export interface RefDisplay {
  text: string;
  status: Status;
  /** True when label could NOT be resolved (placeholder / loading / humanized slug). */
  isFallback: boolean;
  loading: boolean;
}

export function useLandRefLabels() {
  const { i18n, t } = useTranslation();
  const lang = normalizeLang(i18n.language);

  const { data, isLoading } = useQuery({
    queryKey: REF_KEY,
    queryFn: fetchAll,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return useMemo(() => {
    const buildMap = (rows: any[], baseLabelField: 'label' | 'name') => {
      const map = new Map<string, any>();
      const rowList: any[] = [];
      for (const row of rows) {
        rowList.push(row);
        if (row.id) map.set(norm(row.id), row);
        if (row.value) {
          map.set(norm(row.value), row);
          map.set(slugify(row.value), row);
        }
        const baseLabel = row[baseLabelField];
        if (baseLabel) {
          map.set(norm(baseLabel), row);
          map.set(slugify(baseLabel), row);
        }
      }
      return { map, rows: rowList };
    };

    const maps = {
      soil: buildMap(data?.soil || [], 'label'),
      water: buildMap(data?.water || [], 'label'),
      irrigation: buildMap(data?.irrigation || [], 'label'),
      crop: buildMap(data?.crop || [], 'label'),
      district: buildMap(data?.district || [], 'name'),
      taluka: buildMap(data?.taluka || [], 'name'),
      state: buildMap(data?.state || [], 'name'),
    } as const;

    const baseFieldFor = (k: Kind): 'label' | 'name' =>
      k === 'district' || k === 'taluka' || k === 'state' ? 'name' : 'label';

    const titleCase = (s: string) =>
      s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

    const fallbackKeyFor = (k: Kind): string => {
      switch (k) {
        case 'soil': return 'common.ref_fallback.soil_not_set';
        case 'water': return 'common.ref_fallback.water_not_set';
        case 'irrigation': return 'common.ref_fallback.irrigation_not_set';
        case 'crop': return 'common.ref_fallback.crop_not_set';
        case 'district': return 'common.ref_fallback.district_not_set';
        case 'taluka': return 'common.ref_fallback.taluka_not_set';
        case 'state': return 'common.ref_fallback.state_not_set';
        default: return 'common.ref_fallback.not_specified';
      }
    };

    const friendlyFallback = (k: Kind) =>
      t(fallbackKeyFor(k), { defaultValue: t('common.ref_fallback.not_specified', { defaultValue: 'Not specified' }) });

    const loadingLabel = t('common.ref_fallback.loading', { defaultValue: 'Loading…' });

    const display = (raw: string | null | undefined, kind: Kind): RefDisplay => {
      const original = raw == null ? '' : String(raw);
      const trimmed = original.trim();


      if (!trimmed) {
        return { text: friendlyFallback(kind), status: 'fallback', isFallback: true, loading: false };
      }

      // Loading + unresolved-looking raw → show loading rather than mis-humanize a UUID
      if (isLoading && isUuid(trimmed)) {
        return { text: loadingLabel, status: 'loading', isFallback: true, loading: true };
      }

      const key = norm(trimmed);
      const baseField = baseFieldFor(kind);
      const { map, rows } = maps[kind];

      let row = map.get(key) || map.get(slugify(trimmed));

      if (!row && rows.length) {
        row = rows.find((r) => {
          const lab = norm(r[baseField] || '');
          if (!lab) return false;
          return lab === key || lab.startsWith(key) || key.startsWith(lab) || lab.includes(key) || key.includes(lab);
        });
      }

      if (row) {
        const localized = pickLocalized(row, baseField, lang);
        if (localized) return { text: localized, status: 'ok', isFallback: false, loading: false };
      }

      // Unresolved UUID → never leak; show friendly placeholder
      if (isUuid(trimmed)) {
        return { text: friendlyFallback(kind), status: 'fallback', isFallback: true, loading: false };
      }

      // Legacy free-text → humanize, but mark as fallback so UI can de-emphasize
      return { text: titleCase(trimmed), status: 'humanized', isFallback: true, loading: false };
    };

    const text = (raw: string | null | undefined, kind: Kind) => display(raw, kind).text;

    return {
      loading: isLoading,
      display,
      status: (raw: string | null | undefined, kind: Kind): Status => display(raw, kind).status,
      // Back-compat string helpers — always safe to render (never empty, never UUID).
      soil: (v?: string | null) => text(v, 'soil'),
      water: (v?: string | null) => text(v, 'water'),
      irrigation: (v?: string | null) => text(v, 'irrigation'),
      crop: (v?: string | null) => text(v, 'crop'),
      district: (v?: string | null) => text(v, 'district'),
      taluka: (v?: string | null) => text(v, 'taluka'),
      state: (v?: string | null) => text(v, 'state'),
      /**
       * Format a location chain (village, taluka, district, state) — UUID-safe.
       * Returns a localized "Location not set" placeholder when nothing resolves.
       */
      location: (parts: {
        village?: string | null;
        taluka?: string | null;
        district?: string | null;
        state?: string | null;
      }) => {
        const out: string[] = [];
        if (parts.village && !isUuid(parts.village) && parts.village.trim()) {
          out.push(parts.village.trim());
        }
        const tal = display(parts.taluka, 'taluka');
        if (tal.status === 'ok') out.push(tal.text);
        const dist = display(parts.district, 'district');
        if (dist.status === 'ok') out.push(dist.text);
        const st = display(parts.state, 'state');
        if (st.status === 'ok') out.push(st.text);

        if (out.length) return out.join(', ');
        if (isLoading) return loadingLabel;
        return t('common.ref_fallback.location_not_set', { defaultValue: 'Location not set' });
      },
    };
  }, [data, isLoading, lang, t]);
}

/**
 * useLandRefLabels — resolves raw land field values (slugs, legacy labels,
 * or UUIDs) into the farmer's selected-language display label using the
 * reference tables (soil_types, water_sources, irrigation_types, crops,
 * districts, talukas, states).
 *
 * Land rows store mixed payloads (e.g. soil_type='red_soil' OR 'Red Soil'
 * OR even a legacy label like 'Rainwater' when the DB has 'Rainwater
 * Harvesting'). This resolver normalizes via a multi-key lookup map
 * (id, value, slug, lowercased label) PLUS a substring/contains fallback.
 *
 * Output language is the farmer-selected i18n language (`hi`, `mr`, ...).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { pickLocalized, normalizeLang, cols } from '@/lib/i18nRef';

type Kind = 'soil' | 'water' | 'irrigation' | 'crop' | 'district' | 'taluka' | 'state';

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
  console.log('[useLandRefLabels] loaded rows:', {
    soil: soil.data?.length, water: water.data?.length, irrigation: irr.data?.length,
    crops: crops.data?.length, district: dist.data?.length, taluka: tal.data?.length, state: st.data?.length,
  });

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

export function useLandRefLabels() {
  const { i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);

  const { data } = useQuery({
    queryKey: REF_KEY,
    queryFn: fetchAll,
    staleTime: 1000 * 60 * 60, // 1h
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

    const resolve = (raw: string | null | undefined, kind: Kind): string => {
      if (raw === null || raw === undefined) return '';
      const original = String(raw);
      if (!original.trim()) return '';

      const key = norm(original);
      const baseField = baseFieldFor(kind);
      const { map, rows } = maps[kind];

      // 1. exact (id / value / slug / label)
      let row = map.get(key) || map.get(slugify(original));

      // 2. contains fallback — raw inside any row label, or row label inside raw
      if (!row && rows.length) {
        row = rows.find((r) => {
          const lab = norm(r[baseField] || '');
          if (!lab) return false;
          return lab === key || lab.startsWith(key) || key.startsWith(lab) || lab.includes(key) || key.includes(lab);
        });
      }

      if (row) {
        const localized = pickLocalized(row, baseField, lang);
        if (localized) return localized;
      }

      // Unresolved UUID → blank (never leak IDs in UI)
      if (isUuid(original)) return '';
      // Legacy free-text fallback — humanize the slug
      return titleCase(original);
    };

    return {
      resolve,
      soil: (v?: string | null) => resolve(v, 'soil'),
      water: (v?: string | null) => resolve(v, 'water'),
      irrigation: (v?: string | null) => resolve(v, 'irrigation'),
      crop: (v?: string | null) => resolve(v, 'crop'),
      district: (v?: string | null) => resolve(v, 'district'),
      taluka: (v?: string | null) => resolve(v, 'taluka'),
      state: (v?: string | null) => resolve(v, 'state'),
      /** Format a location chain (village, taluka, district, state) — UUID-safe. */
      location: (parts: {
        village?: string | null;
        taluka?: string | null;
        district?: string | null;
        state?: string | null;
      }) => {
        const out: string[] = [];
        if (parts.village && !isUuid(parts.village)) out.push(parts.village);
        const tal = resolve(parts.taluka, 'taluka');
        if (tal) out.push(tal);
        const dist = resolve(parts.district, 'district');
        if (dist) out.push(dist);
        const st = resolve(parts.state, 'state');
        if (st) out.push(st);
        return out.join(', ');
      },
    };
  }, [data, lang]);
}

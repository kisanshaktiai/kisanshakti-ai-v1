/**
 * useLandRefLabels — resolves raw land field values (slugs, legacy labels,
 * or UUIDs) into the farmer's selected-language display label using the
 * reference tables (soil_types, water_sources, irrigation_types, crops,
 * districts).
 *
 * Land rows store mixed payloads (e.g. soil_type='red_soil' OR 'Red Soil',
 * district=name OR UUID). This hook normalizes both via lookup maps keyed by
 * `value`, `label` (lowercased), and `id`.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { pickLocalized, normalizeLang } from '@/lib/i18nRef';

type Kind = 'soil' | 'water' | 'irrigation' | 'crop' | 'district';

const REF_KEY = ['ref', 'land-labels-all'] as const;

async function fetchAll() {
  const [soil, water, irr, crops, dist] = await Promise.all([
    supabase.from('soil_types').select('*').eq('is_active', true),
    supabase.from('water_sources').select('*').eq('is_active', true),
    supabase.from('irrigation_types').select('*').eq('is_active', true),
    supabase.from('crops').select('*').limit(2000),
    supabase.from('districts').select('*').limit(2000),
  ]);
  return {
    soil: soil.data || [],
    water: water.data || [],
    irrigation: irr.data || [],
    crop: crops.data || [],
    district: dist.data || [],
  };
}

export function useLandRefLabels() {
  const { i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);

  const { data } = useQuery({
    queryKey: REF_KEY,
    queryFn: fetchAll,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return useMemo(() => {
    const buildMap = (rows: any[], baseLabelField: 'label' | 'name') => {
      const map = new Map<string, any>();
      for (const row of rows) {
        if (row.id) map.set(String(row.id).toLowerCase(), row);
        if (row.value) map.set(String(row.value).toLowerCase(), row);
        const baseLabel = row[baseLabelField];
        if (baseLabel) map.set(String(baseLabel).toLowerCase(), row);
        // Also index normalized slug form of label ("Red Soil" -> "red_soil")
        if (baseLabel) {
          const slug = String(baseLabel).toLowerCase().replace(/\s+/g, '_');
          if (!map.has(slug)) map.set(slug, row);
        }
      }
      return map;
    };

    const maps = {
      soil: buildMap(data?.soil || [], 'label'),
      water: buildMap(data?.water || [], 'label'),
      irrigation: buildMap(data?.irrigation || [], 'label'),
      crop: buildMap(data?.crop || [], 'label'),
      district: buildMap(data?.district || [], 'name'),
    } as const;

    const baseFieldFor = (k: Kind): 'label' | 'name' =>
      k === 'district' ? 'name' : 'label';

    const titleCase = (s: string) =>
      s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const resolve = (raw: string | null | undefined, kind: Kind): string => {
      if (!raw) return '';
      const key = String(raw).toLowerCase().trim();
      const row = maps[kind].get(key);
      if (row) {
        const localized = pickLocalized(row, baseFieldFor(kind), lang);
        if (localized) return localized;
      }
      // UUID with no match → blank to avoid leaking IDs in UI.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
      if (isUuid) return '';
      // Legacy free-text fallback — humanize the slug.
      return titleCase(String(raw));
    };

    return {
      resolve,
      soil: (v?: string | null) => resolve(v, 'soil'),
      water: (v?: string | null) => resolve(v, 'water'),
      irrigation: (v?: string | null) => resolve(v, 'irrigation'),
      crop: (v?: string | null) => resolve(v, 'crop'),
      district: (v?: string | null) => resolve(v, 'district'),
    };
  }, [data, lang]);
}

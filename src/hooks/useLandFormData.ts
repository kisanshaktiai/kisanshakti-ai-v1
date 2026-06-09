import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { pickLocalized, normalizeLang } from '@/lib/i18nRef';

interface RefItem {
  id: string;
  label: string;
  value: string;
  description?: string | null;
  /** Localized label for the current farmer language (computed). */
  displayLabel: string;
  /** Localized description for the current farmer language (computed). */
  displayDescription: string;
  // Any *_<lang> columns are preserved on the row but accessed via helper.
  [key: string]: any;
}

interface LandFormRefData {
  soilTypes: RefItem[];
  waterSources: RefItem[];
  irrigationTypes: RefItem[];
}

const REF_QUERY_KEY = ['ref', 'soil-water-irrigation'] as const;

async function fetchLandFormRefData(): Promise<Omit<LandFormRefData, never>> {
  // `select('*')` so all `label_<lang>` and `description_<lang>` columns
  // (current + future) flow through without further code changes.
  const [soilTypesRes, waterSourcesRes, irrigationTypesRes] = await Promise.all([
    supabase.from('soil_types').select('*').eq('is_active', true).order('id'),
    supabase.from('water_sources').select('*').eq('is_active', true).order('id'),
    supabase.from('irrigation_types').select('*').eq('is_active', true).order('id'),
  ]);

  if (soilTypesRes.error) throw soilTypesRes.error;
  if (waterSourcesRes.error) throw waterSourcesRes.error;
  if (irrigationTypesRes.error) throw irrigationTypesRes.error;

  return {
    soilTypes: (soilTypesRes.data || []) as any,
    waterSources: (waterSourcesRes.data || []) as any,
    irrigationTypes: (irrigationTypesRes.data || []) as any,
  };
}

/**
 * Reference data for land forms — soil types, water sources, irrigation types.
 * Cached for the entire session (the rows themselves never change), but
 * `displayLabel` / `displayDescription` are re-computed on every language
 * switch via `useMemo` — no refetch needed.
 */
export function useLandFormData() {
  const { i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);

  const { data, isLoading, error } = useQuery({
    queryKey: REF_QUERY_KEY,
    queryFn: fetchLandFormRefData,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const localized = useMemo<LandFormRefData>(() => {
    const enrich = (rows: any[] | undefined): RefItem[] =>
      (rows || []).map((row) => ({
        ...row,
        // Keep the raw `label` populated for any legacy consumers that still
        // read `.label` directly; replace with the localized value so they
        // also get the farmer's language for free.
        label: pickLocalized(row, 'label', lang) || row.label,
        displayLabel: pickLocalized(row, 'label', lang),
        displayDescription: pickLocalized(row, 'description', lang),
      }));
    return {
      soilTypes: enrich(data?.soilTypes),
      waterSources: enrich(data?.waterSources),
      irrigationTypes: enrich(data?.irrigationTypes),
    };
  }, [data, lang]);

  return {
    soilTypes: localized.soilTypes,
    waterSources: localized.waterSources,
    irrigationTypes: localized.irrigationTypes,
    loading: isLoading,
    error: error ? 'Failed to load form data' : null,
  };
}

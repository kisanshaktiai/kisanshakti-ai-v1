import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RefItem {
  id: string;
  label: string;
  value: string;
  description?: string;
}

interface LandFormRefData {
  soilTypes: RefItem[];
  waterSources: RefItem[];
  irrigationTypes: RefItem[];
}

const REF_QUERY_KEY = ['ref', 'soil-water-irrigation'] as const;

async function fetchLandFormRefData(): Promise<LandFormRefData> {
  const [soilTypesRes, waterSourcesRes, irrigationTypesRes] = await Promise.all([
    supabase.from('soil_types').select('*').eq('is_active', true).order('id'),
    supabase.from('water_sources').select('*').eq('is_active', true).order('id'),
    supabase.from('irrigation_types').select('*').eq('is_active', true).order('id'),
  ]);

  if (soilTypesRes.error) throw soilTypesRes.error;
  if (waterSourcesRes.error) throw waterSourcesRes.error;
  if (irrigationTypesRes.error) throw irrigationTypesRes.error;

  return {
    soilTypes: (soilTypesRes.data || []) as RefItem[],
    waterSources: (waterSourcesRes.data || []) as RefItem[],
    irrigationTypes: (irrigationTypesRes.data || []) as RefItem[],
  };
}

/**
 * Reference data for land forms — soil types, water sources, irrigation types.
 * Cached for the entire session (staleTime: Infinity) since this is static reference data.
 */
export function useLandFormData() {
  const { data, isLoading, error } = useQuery({
    queryKey: REF_QUERY_KEY,
    queryFn: fetchLandFormRefData,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  return {
    soilTypes: data?.soilTypes || [],
    waterSources: data?.waterSources || [],
    irrigationTypes: data?.irrigationTypes || [],
    loading: isLoading,
    error: error ? 'Failed to load form data' : null,
  };
}

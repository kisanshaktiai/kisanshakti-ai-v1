import { useQuery } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuthStore } from '@/stores/authStore';

export interface LandNdviReading {
  landId: string;
  ndvi: number;
  date: string;
}

/** Readings older than this are not trusted for colouring alert cards. */
const MAX_AGE_DAYS = 21;
/** Scientific reliability gate (see NDVI reliability rules). */
const MAX_CLOUD_COVER = 40;
const MIN_COVERAGE = 15;

/**
 * Latest trustworthy satellite reading per land, for the given land ids.
 * Read-only, cached; used purely for presentation (card colour).
 */
export function useLandNdvi(landIds: string[]) {
  const { tenant } = useTenant();
  const { session } = useAuthStore();
  const tenantId = tenant?.id ?? session?.tenantId;
  const farmerId = session?.farmerId;

  const ids = Array.from(new Set(landIds.filter(Boolean))).sort();

  const { data } = useQuery({
    queryKey: ['land-ndvi-latest', tenantId, ids.join(',')],
    enabled: ids.length > 0 && !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const client = supabaseWithAuth(farmerId, tenantId);
      const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);

      const { data: rows, error } = await client
        .from('ndvi_data')
        .select('land_id, date, ndvi_value, mean_ndvi, cloud_cover, cloud_coverage, coverage_percentage')
        .in('land_id', ids)
        .gte('date', cutoff)
        .order('date', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const map = new Map<string, LandNdviReading>();
      for (const row of rows || []) {
        const r = row as any;
        if (map.has(r.land_id)) continue; // rows arrive newest-first

        const cloud = r.cloud_cover ?? r.cloud_coverage;
        if (cloud != null && Number(cloud) > MAX_CLOUD_COVER) continue;
        if (r.coverage_percentage != null && Number(r.coverage_percentage) < MIN_COVERAGE) continue;

        const value = r.ndvi_value ?? r.mean_ndvi;
        if (value == null || Number.isNaN(Number(value))) continue;

        map.set(r.land_id, { landId: r.land_id, ndvi: Number(value), date: r.date });
      }
      return map;
    },
  });

  return data ?? new Map<string, LandNdviReading>();
}

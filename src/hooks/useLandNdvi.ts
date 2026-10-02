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

/**
 * Latest trustworthy satellite reading per land, for the given land ids.
 * Read-only, cached; used purely for presentation (card colour).
 *
 * "Trustworthy" is decided by the database, not here: v_ndvi_decision_grade
 * holds only observed optical passes that passed the pipeline's quality
 * gates, so radar rows and rejected scenes never colour a card.
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
        .from('v_ndvi_decision_grade')
        .select('land_id, acquisition_date, ndvi_value')
        .in('land_id', ids)
        .gte('acquisition_date', cutoff)
        .order('acquisition_date', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const map = new Map<string, LandNdviReading>();
      for (const row of rows || []) {
        if (!row.land_id || !row.acquisition_date || map.has(row.land_id)) continue; // rows arrive newest-first
        const value = Number(row.ndvi_value);
        if (row.ndvi_value == null || Number.isNaN(value)) continue;
        map.set(row.land_id, { landId: row.land_id, ndvi: value, date: row.acquisition_date });
      }
      return map;
    },
  });

  return data ?? new Map<string, LandNdviReading>();
}

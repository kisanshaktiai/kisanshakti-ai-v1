import { useQuery } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuthStore } from '@/stores/authStore';

export interface LandNdviReading {
  landId: string;
  ndvi: number;
  date: string;
  /** Age in days and freshness, both from v_ndvi_decision_grade (the DB's own window). */
  ageDays: number | null;
  isFresh: boolean;
}

/**
 * Latest trustworthy satellite reading per land, for the given land ids.
 * Read-only, cached; shown next to an alert with its date and freshness.
 *
 * "Trustworthy" and "fresh" are decided by the database, not here:
 * v_ndvi_decision_grade holds only observed optical passes that passed the
 * pipeline's quality gates and carries is_fresh / age_days. (2026-10-02: the
 * hook used its own 21-day cut-off, wider than the view's window, so a pass
 * the evaluator treats as stale was presented as current.)
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
      const { data: rows, error } = await client
        .from('v_ndvi_decision_grade')
        .select('land_id, acquisition_date, ndvi_value, age_days, is_fresh')
        .in('land_id', ids)
        .eq('recency_rank', 1)
        .limit(1000);

      if (error) throw error;

      const map = new Map<string, LandNdviReading>();
      for (const row of rows || []) {
        if (!row.land_id || !row.acquisition_date || map.has(row.land_id)) continue; // rows arrive newest-first
        const value = Number(row.ndvi_value);
        if (row.ndvi_value == null || Number.isNaN(value)) continue;
        map.set(row.land_id, {
          landId: row.land_id, ndvi: value, date: row.acquisition_date,
          ageDays: row.age_days == null ? null : Number(row.age_days), isFresh: row.is_fresh === true,
        });
      }
      return map;
    },
  });

  return data ?? new Map<string, LandNdviReading>();
}

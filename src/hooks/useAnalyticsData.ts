/**
 * useAnalyticsData — per-land + farm-aggregate analytics from REAL DB tables.
 * No hardcoded numbers. Parallel fetches, react-query cached.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useLands } from '@/hooks/useLands';
import {
  aggregateFarm,
  computeLandAnalytics,
  type LandAnalytics,
  type LandRow,
  type FarmAggregate,
} from '@/lib/analytics/reportEngine';

export type DateRange = '7d' | '30d' | 'season' | 'year';

function rangeStart(range: DateRange): string {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === 'season' ? 120 : 365;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function useAnalyticsData(range: DateRange = '30d') {
  const { session } = useAuthStore();
  const { tenant } = useTenant();
  const { lands: rawLands = [], isLoading: landsLoading } = useLands();
  const farmerId = session?.farmerId;
  const tenantId = tenant?.id;

  const query = useQuery({
    queryKey: ['analytics-data', farmerId, tenantId, range, rawLands.map((l: any) => l.id).join(',')],
    enabled: !!farmerId && !!tenantId && !landsLoading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const lands = rawLands as unknown as LandRow[];
      const landIds = lands.map((l) => l.id);
      if (!landIds.length) {
        return {
          perLand: [] as LandAnalytics[],
          aggregate: aggregateFarm([]),
          lands,
        };
      }

      const since = rangeStart(range);

      // Fetch in parallel; tolerate per-table failures.
      const [
        tasksRes,
        weatherRes,
        soilRes,
        ndviRes,
        financeRes,
        marketRes,
      ] = await Promise.all([
        supabase
          .from('schedule_tasks')
          .select('id, schedule_id, status, task_date, completed_at, estimated_cost, task_type, farmer_id')
          .eq('farmer_id', farmerId!)
          .gte('task_date', since.slice(0, 10))
          .limit(2000),
        supabase
          .from('weather_current')
          .select('land_id, temperature_celsius, humidity_percent, rain_24h_mm, observation_time')
          .in('land_id', landIds)
          .order('observation_time', { ascending: false })
          .limit(landIds.length * 4),
        supabase
          .from('soil_health')
          .select('land_id, ph_level, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, organic_carbon, test_date, soil_moisture_surface_percent')
          .in('land_id', landIds)
          .order('test_date', { ascending: false })
          .limit(landIds.length * 3),
        supabase
          .from('ndvi_data')
          .select('land_id, date, mean_ndvi, ndvi_value, image_url, cloud_coverage')
          .in('land_id', landIds)
          .gte('date', since.slice(0, 10))
          .order('date', { ascending: true })
          .limit(2000),
        supabase
          .from('financial_transactions')
          .select('land_id, transaction_type, category, amount, transaction_date')
          .eq('farmer_id', farmerId!)
          .gte('transaction_date', since.slice(0, 10))
          .limit(2000),
        supabase
          .from('market_prices')
          .select('commodity_name_normalized, crop_name, modal_price, price_per_unit, price_date, market_location')
          .gte('price_date', new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
          .order('price_date', { ascending: false })
          .limit(500),
      ]);

      // Map schedule task → land via schedule_id lookup (best effort)
      const tasks = (tasksRes.data || []) as any[];
      let scheduleLandMap = new Map<string, string>();
      const scheduleIds = [...new Set(tasks.map((t) => t.schedule_id).filter(Boolean))];
      if (scheduleIds.length) {
        const { data: schedules } = await supabase
          .from('crop_schedules')
          .select('id, land_id')
          .in('id', scheduleIds);
        scheduleLandMap = new Map((schedules || []).map((s: any) => [s.id, s.land_id]));
      }
      const tasksWithLand = tasks.map((t) => ({
        ...t,
        land_id: t.land_id || scheduleLandMap.get(t.schedule_id) || null,
      }));

      const weatherByLand = new Map<string, any>();
      (weatherRes.data || []).forEach((w: any) => {
        if (!weatherByLand.has(w.land_id)) weatherByLand.set(w.land_id, w);
      });
      const soilByLand = new Map<string, any>();
      (soilRes.data || []).forEach((s: any) => {
        if (!soilByLand.has(s.land_id)) soilByLand.set(s.land_id, s);
      });
      const ndviAll = (ndviRes.data || []) as any[];
      const financeAll = (financeRes.data || []) as any[];
      const market = (marketRes.data || []) as any[];

      const perLand: LandAnalytics[] = lands.map((land) => {
        const tasksForLand = tasksWithLand.filter((t) => t.land_id === land.id);
        const financeForLand = financeAll.filter((f) => f.land_id === land.id);
        return computeLandAnalytics(land, {
          tasks: tasksForLand,
          weather: weatherByLand.get(land.id) || null,
          soil: soilByLand.get(land.id) || null,
          ndvi: ndviAll,
          finance: financeForLand,
          market,
        });
      });

      const aggregate: FarmAggregate = aggregateFarm(perLand);
      return { perLand, aggregate, lands };
    },
  });

  return {
    ...query,
    isLoading: query.isLoading || landsLoading,
  };
}

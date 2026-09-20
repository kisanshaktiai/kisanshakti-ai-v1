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
  const sessionToken = session?.token;
  const tenantId = tenant?.id;

  const query = useQuery({
    queryKey: ['analytics-data', 'db-ssot-v2', farmerId, tenantId, sessionToken, range, rawLands.map((l: any) => l.id).join(',')],
    enabled: !!farmerId && !!tenantId && !landsLoading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const lands = rawLands as unknown as LandRow[];
      if (!farmerId) throw new Error('Farmer session unavailable');
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
      const activeScheduleIds = lands.map((land) => land.active_schedule_id).filter((id): id is string => Boolean(id));
      const cropCodes = [...new Set(lands.map((land) => land.current_crop?.trim().toLowerCase()).filter((crop): crop is string => Boolean(crop)))];
      const [tasksRes, weatherRes, soilRes, ndviRes, financeRes, schedulesRes, baselinesRes, linksRes, decisionsRes] = await Promise.all([
        supabase
          .from('schedule_tasks')
          .select('id, schedule_id, status, task_date, completed_at, estimated_cost, task_type, farmer_id')
          .in('schedule_id', activeScheduleIds.length ? activeScheduleIds : ['00000000-0000-0000-0000-000000000000'])
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
          .eq('farmer_id', farmerId)
          .gte('transaction_date', since.slice(0, 10))
          .limit(2000),
        supabase.from('crop_schedules').select('id, land_id, total_estimated_cost, actual_total_cost, expected_yield_quintals, expected_yield_per_acre, expected_market_price_per_quintal, total_water_requirement_liters, water_requirement_liters_total, water_per_irrigation_liters, cost_by_category').in('id', activeScheduleIds.length ? activeScheduleIds : ['00000000-0000-0000-0000-000000000000']),
        supabase.from('crop_baseline_guidelines_v2').select('crop_code, growth_stage, nitrogen_min, nitrogen_max, phosphorus_min, phosphorus_max, potassium_min, potassium_max').in('crop_code', cropCodes.length ? cropCodes : ['__none__']),
        supabase.from('crop_commodity_link').select('crop_code, commodity_global_code').in('crop_code', cropCodes.length ? cropCodes : ['__none__']),
        supabase.from('farm_decision').select('land_id, title_en, action_text_en').eq('farmer_id', farmerId).in('land_id', landIds).in('status', ['DUE', 'WATCH', 'INFO', 'BLOCKED']).or(`valid_until.is.null,valid_until.gte.${new Date().toISOString().slice(0, 10)}`).order('priority', { ascending: false }).limit(100),
      ]);

      const tasks = (tasksRes.data || []) as any[];
      const schedules = (schedulesRes.data || []) as any[];
      const scheduleLandMap = new Map(schedules.map((schedule) => [schedule.id, schedule.land_id]));
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
      const links = (linksRes.data || []) as Array<{ crop_code: string; commodity_global_code: string }>;
      const commodityCodes = [...new Set(links.map((link) => link.commodity_global_code))];
      const marketRes = await supabase
        .from('market_prices')
        .select('global_commodity_code, commodity_name_normalized, crop_name, modal_price, price_per_unit, price_date, market_location')
        .in('global_commodity_code', commodityCodes.length ? commodityCodes : ['__none__'])
        .gte('price_date', new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
        .order('price_date', { ascending: false })
        .limit(500);
      const market = (marketRes.data || []) as any[];
      const commodityByCrop = new Map(links.map((link) => [link.crop_code, link.commodity_global_code]));

      const perLand: LandAnalytics[] = lands.map((land) => {
        const tasksForLand = tasksWithLand.filter((t) => t.land_id === land.id && t.schedule_id === land.active_schedule_id);
        const financeForLand = financeAll.filter((f) => f.land_id === land.id);
        const cropCode = land.current_crop?.trim().toLowerCase() ?? '';
        const commodityCode = commodityByCrop.get(cropCode);
        const marketForLand = market.filter((row) => row.global_commodity_code === commodityCode);
        const baseline = ((baselinesRes.data || []) as any[]).find((row) =>
          row.crop_code === cropCode && row.growth_stage === land.crop_stage?.trim().toLowerCase(),
        ) ?? null;
        return computeLandAnalytics(land, {
          tasks: tasksForLand,
          weather: weatherByLand.get(land.id) || null,
          soil: soilByLand.get(land.id) || null,
          ndvi: ndviAll,
          finance: financeForLand,
          market: marketForLand,
          schedule: schedules.find((schedule) => schedule.id === land.active_schedule_id) ?? null,
          baseline,
          decisions: (decisionsRes.data || []) as any[],
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

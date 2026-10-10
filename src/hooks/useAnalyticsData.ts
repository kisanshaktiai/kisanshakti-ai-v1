/**
 * useAnalyticsData — reads what the server computed for the farmer's lands.
 *
 * Sources (all farmer-scoped by RLS through the session token the shared client
 * sends; the client never supplies its own farmer_id as a filter):
 *   v_land_economics        weekly yield estimate, income range, spend so far
 *   land_farm_state         stage, canopy vs expected, evidence date
 *   land_weather_state      FAO-56 water numbers for the land
 *   v_ndvi_decision_grade   decision-grade NDVI series (trend chart only)
 *   schedule_tasks          task counts for the active schedule (whole cycle)
 *   farm_decision           open decisions, de-duplicated by decision_key
 *   soil_health             latest soil row with its source
 *   crop_stage_master       growth_stage name for the stage_code
 *
 * The date-range chip filters ONLY the NDVI trend. Season figures always cover
 * the active crop cycle.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useLands } from '@/hooks/useLands';
import {
  computeLandAnalytics, aggregateFarm,
  type LandRow, type LandEconomicsRow, type FarmStateRow, type WeatherStateRow,
  type NdviPoint, type TaskRow, type DecisionRow, type SoilRow, type LandAnalytics, type FarmAggregate,
} from '@/lib/analytics/reportEngine';

export type DateRange = '7d' | '30d' | 'season' | '1y';

function rangeStart(range: DateRange): string {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === 'season' ? 120 : 365;
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const OPEN_DECISION_STATUSES = ['DUE', 'WATCH', 'INFO', 'BLOCKED'];
const NONE = '00000000-0000-0000-0000-000000000000';

export interface AnalyticsData {
  perLand: LandAnalytics[];
  aggregate: FarmAggregate;
  computedAt: string | null;
}

export function useAnalyticsData(range: DateRange = '30d') {
  const { session } = useAuthStore();
  const { tenant } = useTenant();
  const farmerId = session?.farmerId;
  const tenantId = tenant?.id ?? session?.tenantId;
  const { lands: rawLands = [], isLoading: landsLoading } = useLands();

  return useQuery<AnalyticsData>({
    queryKey: ['analytics-data', 'v-land-economics-v1', farmerId, tenantId, range, rawLands.map((l: any) => l.id).join(',')],
    enabled: !!farmerId && !!tenantId && !landsLoading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const lands = (rawLands as unknown as LandRow[]).filter((l) => !!l.id);
      const landIds = lands.length ? lands.map((l) => l.id) : [NONE];
      const scheduleIds = lands.map((l) => l.active_schedule_id).filter((id): id is string => !!id);
      const since = rangeStart(range);

      const [econ, farmState, weather, ndvi, tasks, decisions, soil] = await Promise.all([
        supabase.from('v_land_economics' as any).select('*').in('land_id', landIds),
        supabase.from('land_farm_state' as any)
          .select('land_id, state_date, crop_code, stage_code, das, canopy, gaps')
          .in('land_id', landIds).order('state_date', { ascending: false }).limit(landIds.length * 3),
        supabase.from('land_weather_state' as any)
          .select('land_id, metric_date, total_rainfall_mm, etc_mm, root_depletion_mm, water_balance_status')
          .in('land_id', landIds).order('metric_date', { ascending: false }).limit(landIds.length * 3),
        supabase.from('v_ndvi_decision_grade' as any)
          .select('land_id, acquisition_date, ndvi_value, is_fresh')
          .in('land_id', landIds).gte('acquisition_date', since).order('acquisition_date', { ascending: true }).limit(2000),
        supabase.from('schedule_tasks')
          .select('id, schedule_id, status, task_date, completed_at, task_type')
          .in('schedule_id', scheduleIds.length ? scheduleIds : [NONE]).limit(2000),
        supabase.from('farm_decision' as any)
          .select('land_id, decision_key, category, status, created_at')
          .in('land_id', landIds).in('status', OPEN_DECISION_STATUSES).order('created_at', { ascending: false }).limit(500),
        supabase.from('soil_health')
          .select('land_id, test_date, source, ph_level, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, organic_carbon')
          .in('land_id', landIds).order('test_date', { ascending: false }).limit(landIds.length * 3),
      ]);
      for (const r of [econ, farmState, weather, ndvi, tasks, decisions, soil]) if (r.error) throw r.error;

      // Stage name for the codes present (crop_stage_master is public reference data)
      const stageCodes = [...new Set(((farmState.data ?? []) as any[]).map((f) => f.stage_code).filter(Boolean))];
      const stages = stageCodes.length
        ? await supabase.from('crop_stage_master' as any).select('stage_code, growth_stage').in('stage_code', stageCodes)
        : { data: [], error: null };
      if (stages.error) throw stages.error;
      const stageName = new Map<string, string>(((stages.data ?? []) as any[]).map((s) => [s.stage_code, s.growth_stage]));

      const latestBy = <T extends { land_id: string }>(rows: T[]) => {
        const m = new Map<string, T>();
        for (const r of rows) if (!m.has(r.land_id)) m.set(r.land_id, r); // rows arrive newest first
        return m;
      };
      const econBy = new Map<string, LandEconomicsRow>(((econ.data ?? []) as unknown as LandEconomicsRow[]).map((e) => [e.land_id, e]));
      const stateBy = latestBy((farmState.data ?? []) as any[]);
      const weatherBy = latestBy((weather.data ?? []) as unknown as WeatherStateRow[]);
      const soilBy = latestBy((soil.data ?? []) as unknown as SoilRow[]);
      const taskRows = (tasks.data ?? []) as unknown as TaskRow[];
      const decisionRows = (decisions.data ?? []) as unknown as DecisionRow[];
      const ndviRows = (ndvi.data ?? []) as unknown as { land_id: string; acquisition_date: string; ndvi_value: number | null; is_fresh: boolean | null }[];

      const perLand = lands.map((land) => {
        const fs = stateBy.get(land.id) as any;
        const farmStateRow: FarmStateRow | null = fs
          ? { ...fs, growth_stage: fs.stage_code ? stageName.get(fs.stage_code) ?? null : null }
          : null;
        const points: NdviPoint[] = ndviRows
          .filter((n) => n.land_id === land.id && n.ndvi_value != null)
          .map((n) => ({ date: n.acquisition_date, value: Number(n.ndvi_value), fresh: !!n.is_fresh }));
        return computeLandAnalytics(land, {
          economics: econBy.get(land.id) ?? null,
          farmState: farmStateRow,
          weather: weatherBy.get(land.id) ?? null,
          ndvi: points,
          tasks: taskRows.filter((t) => t.schedule_id === land.active_schedule_id),
          decisions: decisionRows.filter((d) => d.land_id === land.id),
          soil: soilBy.get(land.id) ?? null,
        });
      });

      const computedAt = perLand.map((a) => a.economics?.computed_at ?? null).filter(Boolean).sort().pop() ?? null;
      return { perLand, aggregate: aggregateFarm(perLand), computedAt };
    },
  });
}

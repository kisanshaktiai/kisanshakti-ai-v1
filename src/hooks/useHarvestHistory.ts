import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export interface HarvestHistoryRow {
  schedule_id: string;
  land_id: string;
  land_name: string;
  area_acres: number | null;
  crop_name: string | null;
  crop_variety: string | null;
  sowing_date: string | null;
  expected_harvest_date: string | null;
  actual_harvest_date: string | null;
  expected_yield_quintals: number | null;
  actual_yield_quintals: number | null;
  harvest_status: string;
  harvest_response: Record<string, unknown> | null;
  days_to_harvest: number | null;
  yield_per_acre_qtl: number | null;
  season_key: string; // e.g. "2026-H1"
}

export interface HarvestHistoryAggregate {
  totalHarvests: number;
  totalYieldQtl: number;
  avgYieldPerAcreQtl: number | null;
  avgDaysToHarvest: number | null;
  bestRow: HarvestHistoryRow | null;
  bySeason: Array<{ season: string; harvests: number; yieldQtl: number }>;
  byCrop: Array<{ crop: string; harvests: number; yieldQtl: number }>;
}

function deriveSeason(d: string | null): string {
  if (!d) return 'unknown';
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const half = dt.getUTCMonth() < 6 ? 'H1' : 'H2';
  return `${y}-${half}`;
}

export function aggregate(rows: HarvestHistoryRow[]): HarvestHistoryAggregate {
  const total = rows.length;
  const totalYield = rows.reduce((s, r) => s + (r.actual_yield_quintals || 0), 0);

  const yieldsPerAcre = rows
    .map((r) => r.yield_per_acre_qtl)
    .filter((v): v is number => v != null && v > 0);
  const avgYpa = yieldsPerAcre.length
    ? yieldsPerAcre.reduce((a, b) => a + b, 0) / yieldsPerAcre.length
    : null;

  const daysList = rows
    .map((r) => r.days_to_harvest)
    .filter((v): v is number => v != null && v > 0);
  const avgDays = daysList.length
    ? daysList.reduce((a, b) => a + b, 0) / daysList.length
    : null;

  const best = rows.reduce<HarvestHistoryRow | null>((acc, r) => {
    const v = r.yield_per_acre_qtl ?? -Infinity;
    if (!acc || v > (acc.yield_per_acre_qtl ?? -Infinity)) return r;
    return acc;
  }, null);

  const seasonMap = new Map<string, { harvests: number; yieldQtl: number }>();
  const cropMap = new Map<string, { harvests: number; yieldQtl: number }>();
  for (const r of rows) {
    const s = seasonMap.get(r.season_key) || { harvests: 0, yieldQtl: 0 };
    s.harvests += 1;
    s.yieldQtl += r.actual_yield_quintals || 0;
    seasonMap.set(r.season_key, s);

    const ck = r.crop_name || '—';
    const c = cropMap.get(ck) || { harvests: 0, yieldQtl: 0 };
    c.harvests += 1;
    c.yieldQtl += r.actual_yield_quintals || 0;
    cropMap.set(ck, c);
  }

  return {
    totalHarvests: total,
    totalYieldQtl: totalYield,
    avgYieldPerAcreQtl: avgYpa,
    avgDaysToHarvest: avgDays,
    bestRow: best,
    bySeason: Array.from(seasonMap.entries())
      .map(([season, v]) => ({ season, ...v }))
      .sort((a, b) => (a.season < b.season ? 1 : -1)),
    byCrop: Array.from(cropMap.entries())
      .map(([crop, v]) => ({ crop, ...v }))
      .sort((a, b) => b.yieldQtl - a.yieldQtl),
  };
}

export function useHarvestHistory(landId?: string | null) {
  const { user } = useAuthStore();
  const farmerId = user?.id;

  return useQuery({
    queryKey: ['harvest-history', farmerId, landId ?? 'all'],
    enabled: !!farmerId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HarvestHistoryRow[]> => {
      let q = supabase
        .from('crop_schedules')
        .select(
          'id, land_id, crop_name, crop_variety, sowing_date, expected_harvest_date, actual_harvest_date, expected_yield_quintals, actual_yield_quintals, harvest_status, harvest_response, lands:land_id(id, name, area_acres)'
        )
        .eq('farmer_id', farmerId!)
        .in('harvest_status', ['FULLY_HARVESTED', 'PARTIALLY_HARVESTED'])
        .order('actual_harvest_date', { ascending: false })
        .limit(200);

      if (landId && landId !== 'all') q = q.eq('land_id', landId);

      const { data, error } = await q;
      if (error) throw error;

      return (data || []).map((r: any) => {
        const sow = r.sowing_date ? new Date(r.sowing_date) : null;
        const harv = r.actual_harvest_date ? new Date(r.actual_harvest_date) : null;
        const days =
          sow && harv
            ? Math.max(0, Math.round((harv.getTime() - sow.getTime()) / (1000 * 60 * 60 * 24)))
            : null;
        const area = r.lands?.area_acres ?? null;
        const ypa =
          r.actual_yield_quintals != null && area && area > 0
            ? r.actual_yield_quintals / area
            : null;
        return {
          schedule_id: r.id,
          land_id: r.land_id,
          land_name: r.lands?.name || '—',
          area_acres: area,
          crop_name: r.crop_name,
          crop_variety: r.crop_variety,
          sowing_date: r.sowing_date,
          expected_harvest_date: r.expected_harvest_date,
          actual_harvest_date: r.actual_harvest_date,
          expected_yield_quintals: r.expected_yield_quintals,
          actual_yield_quintals: r.actual_yield_quintals,
          harvest_status: r.harvest_status,
          harvest_response: r.harvest_response,
          days_to_harvest: days,
          yield_per_acre_qtl: ypa,
          season_key: deriveSeason(r.actual_harvest_date),
        } as HarvestHistoryRow;
      });
    },
  });
}

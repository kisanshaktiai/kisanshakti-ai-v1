/**
 * Report engine — pure functions that turn real per-land data into derived
 * metrics (yield, water need, profit, risk, recommendations).
 *
 * Every function fails gracefully (returns null / 0 / 'unknown') when inputs
 * are missing instead of inventing numbers.
 */

import {
  cropKey,
  DAILY_WATER_L_PER_ACRE,
  EXPECTED_YIELD_Q_PER_ACRE,
  EXPECTED_COST_PER_ACRE,
  projectedCostBreakdown,
  nutrientLevel,
} from './formulas';

export interface LandRow {
  id: string;
  name: string;
  area_acres: number | null;
  current_crop: string | null;
  crop_stage: string | null;
  last_sowing_date: string | null;
  expected_harvest_date: string | null;
  ndvi_thumbnail_url: string | null;
  last_ndvi_value: number | null;
  irrigation_source: string | null;
  soil_ph: number | null;
  nitrogen_kg_per_ha: number | null;
  phosphorus_kg_per_ha: number | null;
  potassium_kg_per_ha: number | null;
}

export interface ScheduleTaskRow {
  id: string;
  land_id?: string | null;
  schedule_id?: string | null;
  status: string | null;
  task_date: string | null;
  completed_at: string | null;
  estimated_cost: number | null;
  task_type: string | null;
}

export interface WeatherRow {
  land_id: string | null;
  temperature_celsius: number | null;
  humidity_percent: number | null;
  rain_24h_mm: number | null;
  observation_time: string | null;
}

export interface SoilRow {
  land_id: string | null;
  ph_level: number | null;
  nitrogen_kg_per_ha: number | null;
  phosphorus_kg_per_ha: number | null;
  potassium_kg_per_ha: number | null;
  organic_carbon: number | null;
  test_date: string | null;
  soil_moisture_surface_percent: number | null;
}

export interface NdviRow {
  land_id: string;
  date: string;
  mean_ndvi: number | null;
  ndvi_value: number | null;
  image_url: string | null;
  cloud_coverage: number | null;
}

export interface FinancialRow {
  land_id: string | null;
  transaction_type: string;
  category: string | null;
  amount: number;
  transaction_date: string;
}

export interface MarketPriceRow {
  commodity_name_normalized: string | null;
  crop_name: string | null;
  modal_price: number | null;
  price_per_unit: number | null;
  price_date: string;
  market_location: string | null;
}

export interface LandAnalytics {
  land: LandRow;
  ndviTrend: { date: string; value: number }[];
  latestNdvi: number | null;
  weather: WeatherRow | null;
  soil: SoilRow | null;
  tasks: {
    total: number;
    completed: number;
    delayed: number;
    pending: number;
    completionRate: number;
    onTimeRate: number;
  };
  finance: {
    totalExpense: number;
    byCategory: { category: string; amount: number }[];
    income: number;
    projectedExpense: number;
    projectedExpenseBreakdown: { category: string; amount: number }[];
    expenseSource: 'actual' | 'projected' | 'mixed';
  };
  marketPrice: number | null;
  marketSource: string | null;
  expectedYieldQuintals: number;
  projectedRevenue: number;
  projectedProfit: number;
  waterRequirementL: number;
  recommendations: string[];
}

export interface FarmAggregate {
  totalLands: number;
  totalAreaAcres: number;
  activeCrops: number;
  projectedRevenue: number;
  projectedProfit: number;
  totalExpense: number;
  taskCompletionRate: number;
}

function safeAvg(nums: number[]): number {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function computeLandAnalytics(
  land: LandRow,
  opts: {
    tasks: ScheduleTaskRow[];
    weather: WeatherRow | null;
    soil: SoilRow | null;
    ndvi: NdviRow[];
    finance: FinancialRow[];
    market: MarketPriceRow[];
  },
): LandAnalytics {
  const area = Number(land.area_acres) || 0;
  const ck = cropKey(land.current_crop);

  // NDVI trend (most recent first → reverse for chart)
  const ndviSorted = [...opts.ndvi]
    .filter((n) => n.land_id === land.id && (n.mean_ndvi ?? n.ndvi_value) != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const ndviTrend = ndviSorted.map((n) => ({
    date: n.date,
    value: Number(n.mean_ndvi ?? n.ndvi_value ?? 0),
  }));
  const latestNdvi = ndviTrend.length ? ndviTrend[ndviTrend.length - 1].value : land.last_ndvi_value;

  // Tasks
  const now = Date.now();
  const total = opts.tasks.length;
  const completed = opts.tasks.filter((t) => t.status === 'completed').length;
  const delayed = opts.tasks.filter(
    (t) => t.status !== 'completed' && t.task_date && new Date(t.task_date).getTime() < now,
  ).length;
  const pending = total - completed - delayed;
  const onTime = opts.tasks.filter((t) => {
    if (t.status !== 'completed' || !t.completed_at || !t.task_date) return false;
    return new Date(t.completed_at).getTime() <= new Date(t.task_date).getTime() + 86_400_000;
  }).length;

  // Finance
  const totalExpense = opts.finance
    .filter((f) => f.transaction_type === 'expense')
    .reduce((s, f) => s + Number(f.amount || 0), 0);
  const income = opts.finance
    .filter((f) => f.transaction_type === 'income')
    .reduce((s, f) => s + Number(f.amount || 0), 0);
  const catMap = new Map<string, number>();
  opts.finance
    .filter((f) => f.transaction_type === 'expense')
    .forEach((f) => {
      const c = f.category || 'other';
      catMap.set(c, (catMap.get(c) || 0) + Number(f.amount || 0));
    });
  const byCategory = [...catMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Market price: prefer normalized commodity matching current crop
  const cropLc = (land.current_crop || '').toLowerCase();
  const priceRow = cropLc
    ? opts.market.find(
        (m) =>
          (m.commodity_name_normalized || m.crop_name || '').toLowerCase().includes(cropLc) &&
          (m.modal_price || m.price_per_unit),
      )
    : null;
  const marketPrice = Number(priceRow?.modal_price ?? priceRow?.price_per_unit ?? 0) || null;
  const marketSource = priceRow?.market_location ?? null;

  // Yield (quintal/acre × area), boosted/penalised by NDVI deviation from 0.6
  const baseYieldPerAcre = EXPECTED_YIELD_Q_PER_ACRE[ck] ?? EXPECTED_YIELD_Q_PER_ACRE.default;
  const ndviFactor =
    latestNdvi != null ? Math.max(0.5, Math.min(1.25, 0.7 + latestNdvi * 0.5)) : 1;
  const expectedYieldQuintals = Math.max(0, area * baseYieldPerAcre * ndviFactor);

  const projectedRevenue = Math.max(0, marketPrice ? expectedYieldQuintals * marketPrice : 0);

  // Projected expense — derived from crop CoC baseline (₹/acre × area).
  // We use it when actual expense logged < 60% of baseline (sparse data).
  const baselineCost = Math.max(0, (EXPECTED_COST_PER_ACRE[ck] ?? EXPECTED_COST_PER_ACRE.default) * area);
  const useProjected = totalExpense < baselineCost * 0.6;
  const projectedExpense = Math.max(0, useProjected ? baselineCost : totalExpense);
  const projectedExpenseBreakdown = useProjected
    ? projectedCostBreakdown(land.current_crop, area)
    : byCategory;
  const expenseSource: 'actual' | 'projected' | 'mixed' =
    totalExpense === 0 ? 'projected' : useProjected ? 'mixed' : 'actual';

  const projectedProfit = projectedRevenue - projectedExpense;

  // Water: daily L × 7 days (weekly horizon), minus last 24 h rainfall benefit
  const daily = DAILY_WATER_L_PER_ACRE[ck] ?? DAILY_WATER_L_PER_ACRE.default;
  const rainfallOffsetL = (opts.weather?.rain_24h_mm || 0) * 4046.86 * area;
  const waterRequirementL = Math.max(0, daily * area * 7 - rainfallOffsetL);

  // Recommendations
  const recs: string[] = [];
  if (latestNdvi != null && latestNdvi < 0.35) recs.push('recommendations.low_ndvi');
  if ((opts.weather?.rain_24h_mm ?? 0) < 1 && waterRequirementL > 0) recs.push('recommendations.irrigate_soon');
  if (nutrientLevel(opts.soil?.nitrogen_kg_per_ha ?? null, 'N') === 'low') recs.push('recommendations.low_nitrogen');
  if (delayed > 0) recs.push('recommendations.tasks_delayed');
  if (opts.soil?.ph_level != null && (opts.soil.ph_level < 5.5 || opts.soil.ph_level > 8.2)) recs.push('recommendations.ph_out_of_range');
  if (!marketPrice && land.current_crop) recs.push('recommendations.no_market_price');

  return {
    land,
    ndviTrend,
    latestNdvi,
    weather: opts.weather,
    soil: opts.soil,
    tasks: {
      total,
      completed,
      delayed,
      pending: Math.max(0, pending),
      completionRate: total ? (completed / total) * 100 : 0,
      onTimeRate: completed ? (onTime / completed) * 100 : 0,
    },
    finance: {
      totalExpense,
      byCategory,
      income,
      projectedExpense,
      projectedExpenseBreakdown,
      expenseSource,
    },
    marketPrice,
    marketSource,
    expectedYieldQuintals,
    projectedRevenue,
    projectedProfit,
    waterRequirementL,
    recommendations: recs,
  };
}

export function aggregateFarm(items: LandAnalytics[]): FarmAggregate {
  const crops = new Set<string>();
  items.forEach((i) => {
    if (i.land.current_crop) crops.add(i.land.current_crop.toLowerCase());
  });
  const totalArea = items.reduce((s, i) => s + (Number(i.land.area_acres) || 0), 0);
  const projectedRevenue = items.reduce((s, i) => s + i.projectedRevenue, 0);
  const totalExpense = items.reduce((s, i) => s + i.finance.projectedExpense, 0);
  const taskCompletion = safeAvg(items.map((i) => i.tasks.completionRate));

  return {
    totalLands: items.length,
    totalAreaAcres: totalArea,
    activeCrops: crops.size,
    projectedRevenue,
    projectedProfit: projectedRevenue - totalExpense,
    totalExpense,
    taskCompletionRate: taskCompletion,
  };
}

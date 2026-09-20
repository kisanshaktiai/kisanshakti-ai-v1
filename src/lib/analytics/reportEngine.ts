/**
 * Report engine — pure functions that turn real per-land data into derived
 * metrics (yield, water need, profit, risk, recommendations).
 *
 * Every function fails gracefully (returns null / 0 / 'unknown') when inputs
 * are missing instead of inventing numbers.
 */

import { nutrientLevel } from './formulas';

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
  active_schedule_id?: string | null;
}

export interface ScheduleEconomicsRow {
  id: string;
  land_id: string;
  total_estimated_cost: number | null;
  actual_total_cost: number | null;
  expected_yield_quintals: number | null;
  expected_yield_per_acre: number | null;
  expected_market_price_per_quintal: number | null;
  total_water_requirement_liters: number | null;
  water_requirement_liters_total: number | null;
  water_per_irrigation_liters: number | null;
  cost_by_category: Record<string, number> | null;
}

export interface CropBaselineRow {
  crop_code: string;
  growth_stage: string;
  nitrogen_min: number | null;
  nitrogen_max: number | null;
  phosphorus_min: number | null;
  phosphorus_max: number | null;
  potassium_min: number | null;
  potassium_max: number | null;
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
  expectedYieldQuintals: number | null;
  projectedRevenue: number | null;
  projectedProfit: number | null;
  waterRequirementL: number | null;
  nutrientBands: Record<'N' | 'P' | 'K', { min: number | null; max: number | null }>;
  recommendations: string[];
}

export interface FarmAggregate {
  totalLands: number;
  totalAreaAcres: number;
  activeCrops: number;
  projectedRevenue: number | null;
  projectedProfit: number | null;
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
    schedule: ScheduleEconomicsRow | null;
    baseline: CropBaselineRow | null;
  },
): LandAnalytics {
  const area = Number(land.area_acres) || 0;

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

  const priceRow = opts.market[0] ?? null;
  const marketPrice = Number(opts.schedule?.expected_market_price_per_quintal ?? priceRow?.modal_price ?? priceRow?.price_per_unit ?? 0) || null;
  const marketSource = priceRow?.market_location ?? null;

  const scheduleYield = Number(opts.schedule?.expected_yield_quintals) ||
    ((Number(opts.schedule?.expected_yield_per_acre) || 0) * area);
  const expectedYieldQuintals = scheduleYield > 0 ? scheduleYield : null;
  const projectedRevenue = marketPrice && expectedYieldQuintals != null
    ? Math.max(0, expectedYieldQuintals * marketPrice)
    : null;
  const scheduleCost = Number(opts.schedule?.actual_total_cost ?? opts.schedule?.total_estimated_cost) || 0;
  const projectedExpense = scheduleCost > 0 ? scheduleCost : totalExpense;
  const scheduleBreakdown = Object.entries(opts.schedule?.cost_by_category ?? {})
    .map(([category, amount]) => ({ category, amount: Number(amount) || 0 }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const projectedExpenseBreakdown = scheduleBreakdown.length ? scheduleBreakdown : byCategory;
  const useProjected = scheduleCost > 0;
  const expenseSource: 'actual' | 'projected' | 'mixed' =
    totalExpense === 0 ? 'projected' : useProjected ? 'mixed' : 'actual';

  const projectedProfit = projectedRevenue == null ? null : projectedRevenue - projectedExpense;

  const storedWater = Number(opts.schedule?.water_per_irrigation_liters ?? opts.schedule?.water_requirement_liters_total ?? opts.schedule?.total_water_requirement_liters) || 0;
  const waterRequirementL = storedWater > 0 ? storedWater : null;

  const nutrientBands = {
    N: { min: opts.baseline?.nitrogen_min ?? null, max: opts.baseline?.nitrogen_max ?? null },
    P: { min: opts.baseline?.phosphorus_min ?? null, max: opts.baseline?.phosphorus_max ?? null },
    K: { min: opts.baseline?.potassium_min ?? null, max: opts.baseline?.potassium_max ?? null },
  };

  // Recommendations
  const recs: string[] = [];
  if (latestNdvi != null && latestNdvi < 0.35) recs.push('recommendations.low_ndvi');
  if (nutrientLevel(opts.soil?.nitrogen_kg_per_ha, nutrientBands.N.min, nutrientBands.N.max) === 'low') recs.push('recommendations.low_nitrogen');
  if (delayed > 0) recs.push('recommendations.tasks_delayed');
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
    nutrientBands,
    recommendations: recs,
  };
}

export function aggregateFarm(items: LandAnalytics[]): FarmAggregate {
  const crops = new Set<string>();
  items.forEach((i) => {
    if (i.land.current_crop) crops.add(i.land.current_crop.toLowerCase());
  });
  const totalArea = items.reduce((s, i) => s + (Number(i.land.area_acres) || 0), 0);
  const revenueItems = items.map((i) => i.projectedRevenue).filter((v): v is number => v != null);
  const profitItems = items.map((i) => i.projectedProfit).filter((v): v is number => v != null);
  const projectedRevenue = revenueItems.length ? revenueItems.reduce((s, value) => s + value, 0) : null;
  const totalExpense = items.reduce((s, i) => s + i.finance.projectedExpense, 0);
  const taskCompletion = safeAvg(items.map((i) => i.tasks.completionRate));

  return {
    totalLands: items.length,
    totalAreaAcres: totalArea,
    activeCrops: crops.size,
    projectedRevenue,
    projectedProfit: profitItems.length ? profitItems.reduce((s, value) => s + value, 0) : null,
    totalExpense,
    taskCompletionRate: taskCompletion,
  };
}

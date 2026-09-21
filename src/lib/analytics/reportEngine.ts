/**
 * Shapes server-computed rows into what the Analytics page renders.
 * Deliberately contains NO agronomic or financial computation: yield, income,
 * spend and the "why it moved" explanation come from v_land_economics (weekly
 * yield engine); field condition from land_farm_state / land_weather_state.
 * The only arithmetic here is task counting and farm-level sums of server
 * figures.
 */

export interface LandRow {
  id: string;
  name: string;
  area_acres: number | null;
  current_crop: string | null;
  active_schedule_id: string | null;
  ndvi_thumbnail_url: string | null;
}

/** One row of public.v_land_economics (security_invoker view). */
export interface LandEconomicsRow {
  land_id: string;
  land_name: string | null;
  area_acres: number | null;
  active_schedule_id: string | null;
  crop_name: string | null;
  cultivation_method: string | null;
  sowing_date: string | null;
  expected_harvest_date: string | null;
  harvest_status: string | null;
  price_per_quintal: number | null;
  week_start: string | null;
  computed_at: string | null;
  model_version: string | null;
  crop_code: string | null;
  variety: string | null;
  potential_yield_per_acre: number | null;
  predicted_yield_per_acre: number | null;
  predicted_yield_low_per_acre: number | null;
  predicted_yield_high_per_acre: number | null;
  predicted_total_qtl: number | null;
  predicted_total_low_qtl: number | null;
  predicted_total_high_qtl: number | null;
  confidence_score: number | null;
  factors: Record<string, { value: number; ky?: number; vs_expected?: string }> | null;
  explanation: ExplanationItem[] | null;
  gaps: string[] | null;
  prev_predicted_per_acre: number | null;
  prev_week_start: string | null;
  spent_confirmed: number;
  spent_rows: number;
  estimated_due: number;
  estimated_remaining: number;
  estimates_this_week: number;
  estimate_rows: number;
  income_received: number;
  income_low: number | null;
  income_high: number | null;
}

/** explanation[] items written by compute_land_yield_estimate — rendered via i18n keys analytics.why.<code>. */
export interface ExplanationItem {
  code: string;
  [param: string]: string | number | null | undefined;
}

export interface FarmStateRow {
  land_id: string;
  state_date: string;
  crop_code: string | null;
  stage_code: string | null;
  growth_stage: string | null; // joined from crop_stage_master by the hook
  das: number | null;
  canopy: {
    ndvi?: number | null;
    date?: string | null;
    status?: string | null;
    age_days?: number | null;
    confidence?: number | null;
    vs_expected?: 'below' | 'within' | 'above' | string | null;
    expected_min?: number | null;
    expected_max?: number | null;
  } | null;
  gaps: string[] | null;
}

export interface WeatherStateRow {
  land_id: string;
  metric_date: string;
  total_rainfall_mm: number | null;
  etc_mm: number | null;
  root_depletion_mm: number | null;
  water_balance_status: string | null;
}

export interface NdviPoint { date: string; value: number; fresh: boolean }

export interface TaskRow {
  id: string;
  schedule_id: string;
  status: string | null;
  task_date: string | null;
  completed_at: string | null;
  task_type: string | null;
}

export interface DecisionRow {
  land_id: string;
  decision_key: string;
  category: string | null;
  status: string | null;
  created_at: string;
}

export interface SoilRow {
  land_id: string;
  test_date: string | null;
  source: string | null;
  ph_level: number | null;
  nitrogen_kg_per_ha: number | null;
  phosphorus_kg_per_ha: number | null;
  potassium_kg_per_ha: number | null;
  organic_carbon: number | null;
}

export interface LandAnalytics {
  land: LandRow;
  economics: LandEconomicsRow | null;
  farmState: FarmStateRow | null;
  weather: WeatherStateRow | null;
  ndviTrend: NdviPoint[];
  tasks: { total: number; completed: number; delayed: number; pending: number; onTime: number; completionRate: number; onTimeRate: number };
  /** Open decisions de-duplicated by decision_key, newest first, grouped for the "watch" card. */
  watch: { count: number; byCategory: Record<string, number>; latest: DecisionRow[] };
  soil: SoilRow | null;
}

export interface FarmAggregate {
  totalAreaAcres: number;
  activeCrops: number;
  landsWithEstimate: number;
  predictedTotalLowQtl: number | null;
  predictedTotalHighQtl: number | null;
  incomeLow: number | null;
  incomeHigh: number | null;
  spentConfirmed: number;
  estimatedRemaining: number;
}

function endOfDay(iso: string): number {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function computeLandAnalytics(land: LandRow, opts: {
  economics: LandEconomicsRow | null;
  farmState: FarmStateRow | null;
  weather: WeatherStateRow | null;
  ndvi: NdviPoint[];
  tasks: TaskRow[];
  decisions: DecisionRow[];
  soil: SoilRow | null;
}): LandAnalytics {
  const now = Date.now();
  const total = opts.tasks.length;
  const completed = opts.tasks.filter((t) => t.status === 'completed').length;
  const delayed = opts.tasks.filter((t) => t.status !== 'completed' && t.task_date && endOfDay(t.task_date) < now).length;
  const pending = Math.max(0, total - completed - delayed);
  // On time = completed on or before its scheduled day (no grace constant).
  const onTime = opts.tasks.filter((t) =>
    t.status === 'completed' && t.task_date && (!t.completed_at || new Date(t.completed_at).getTime() <= endOfDay(t.task_date)),
  ).length;

  const seen = new Set<string>();
  const unique = [...opts.decisions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((d) => (seen.has(d.decision_key) ? false : (seen.add(d.decision_key), true)));
  const byCategory: Record<string, number> = {};
  for (const d of unique) byCategory[d.category ?? 'general'] = (byCategory[d.category ?? 'general'] ?? 0) + 1;

  return {
    land,
    economics: opts.economics,
    farmState: opts.farmState,
    weather: opts.weather,
    ndviTrend: opts.ndvi,
    tasks: {
      total, completed, delayed, pending, onTime,
      completionRate: total ? (completed / total) * 100 : 0,
      onTimeRate: completed ? (onTime / completed) * 100 : 0,
    },
    watch: { count: unique.length, byCategory, latest: unique.slice(0, 3) },
    soil: opts.soil,
  };
}

/** Sums of server figures across lands; a sum is null when no land has that figure. */
export function aggregateFarm(perLand: LandAnalytics[]): FarmAggregate {
  const sum = (pick: (e: LandEconomicsRow) => number | null): number | null => {
    let acc: number | null = null;
    for (const a of perLand) {
      const v = a.economics ? pick(a.economics) : null;
      if (v != null) acc = (acc ?? 0) + v;
    }
    return acc;
  };
  return {
    totalAreaAcres: perLand.reduce((s, a) => s + (a.land.area_acres ?? 0), 0),
    activeCrops: perLand.filter((a) => !!a.land.active_schedule_id).length,
    landsWithEstimate: perLand.filter((a) => a.economics?.predicted_total_qtl != null).length,
    predictedTotalLowQtl: sum((e) => e.predicted_total_low_qtl),
    predictedTotalHighQtl: sum((e) => e.predicted_total_high_qtl),
    incomeLow: sum((e) => e.income_low),
    incomeHigh: sum((e) => e.income_high),
    spentConfirmed: sum((e) => e.spent_confirmed) ?? 0,
    estimatedRemaining: sum((e) => e.estimated_remaining) ?? 0,
  };
}

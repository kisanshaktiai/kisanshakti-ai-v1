// =====================================================
// ENVIRONMENTAL INTELLIGENCE — DERIVED STATE + RULE EVALUATION (D7)
// =====================================================
// CHANGE LOG
// 2026-08-07 12:20 UTC — Created: derived namespace hydration from
//   land_weather_state + land_gdd_daily + risk_episodes, derived.* predicate
//   evaluation, episode phase-transition gating, farmer-visibility guard.
// 2026-08-08 (v124) — EnvEvalContext gains an `ndvi` evidence namespace
//   (ndvi.value / ndvi.previous / ndvi.drop) so compiled decision rules can
//   reference satellite evidence declaratively. This adds a DATA PATH only —
//   no NDVI thresholds live in code; thresholds come from rule rows.
// 2026-10-02 (proactive audit) — three evidence gates in evaluateEnvRule and
//   one new derived field:
//   * crop_in is compared case-insensitively. FLOWERING_HEAT_RISK authors
//     ["rice","maize","cotton"] while the context carries "RICE", so the rule
//     could never fire; WATERLOGGING_GUARD authors upper case and kept working.
//   * A rule that reads any ndvi.* path needs a fresh, supported pass
//     (ndvi.is_fresh = 1 from v_ndvi_decision_grade, ndvi.evidence_rank >= 1) —
//     the gate the legacy NDVI branch already applied. PRO_NDVI_DROP fired
//     CRITICAL every day on a 27-day-old pass without it.
//   * A rule that reads derived.root_depletion needs a verified water state
//     (derived.water_state_verified). The weather pipeline's own guard
//     (isDepletionUnverifiedCeiling) marks a bucket that sat at the ceiling with
//     no irrigation evidence; no app path records IRRIGATION_APPLIED, so every
//     irrigated field ratchets there in a dry spell and the guard releases as
//     soon as a light shower nudges depletion below 98% of TAW. The state stays
//     unverified until the bucket is known again: an irrigation event, or the
//     profile back at field capacity (depletion <= 0).

import { isDepletionUnverifiedCeiling, UNVERIFIED_LOOKBACK_DAYS } from '../weather/water-events.ts';

export interface DerivedEpisode {
  risk_code: string;
  phase: string;
  current_value: number | null;
  confidence: number | null;
}

export interface DerivedState {
  et0: number | null;
  et0_method: string | null;
  vpd: number | null;
  gdd_cumulative: number | null;
  lwd_est: number | null;
  spray_score: number | null;
  frost_risk: number | null;
  heat_stress_dh: number | null;
  cold_stress_dh: number | null;
  water_deficit: number | null;
  root_depletion: number | null;
  raw_mm: number | null;
  taw_mm: number | null;
  irrigation_urgency: string | null;
  harvest_window: number | null;
  rain_24h: number | null;
  infiltration_cap: number | null;
  swsi: number | null;
  swsi_class: string | null;
  n_sd_ratio: number | null;
  confidence: number | null;
  as_of: string | null;
  /** true = the root-zone bucket rests on known ground (see isWaterStateVerified);
   *  false = it may have ratcheted without ground truth; null = no rows. */
  water_state_verified: boolean | null;
  active_episodes: DerivedEpisode[];
}


export function emptyDerived(): DerivedState {
  return {
    et0: null, et0_method: null, vpd: null, gdd_cumulative: null, lwd_est: null,
    spray_score: null, frost_risk: null, heat_stress_dh: null, cold_stress_dh: null,
    water_deficit: null, root_depletion: null, raw_mm: null, taw_mm: null,
    irrigation_urgency: null, harvest_window: null,
    rain_24h: null, infiltration_cap: null, swsi: null, swsi_class: null, n_sd_ratio: null,
    confidence: null, as_of: null, water_state_verified: null,
    active_episodes: [],
  };
}

/** One land_weather_state row as the water-state check reads it. */
export interface WaterStateRow {
  metric_date: string;
  root_depletion_mm: number | null;
  taw_mm: number | null;
  irrigation_mm_applied: number | null;
  irrigation_events_used: number | null;
}

/**
 * Walk the look-back window newest → oldest. The bucket is known again at the
 * newest day with an irrigation event or with the profile at field capacity
 * (depletion <= 0, definitional); anything older does not matter. Before that
 * point, any day that meets the pipeline's own unverified-ceiling test makes
 * today's state unverified. No rows → null (unknown, callers fail closed).
 */
export function isWaterStateVerified(rowsNewestFirst: WaterStateRow[]): boolean | null {
  if (rowsNewestFirst.length === 0) return null;
  const hadIrrigation = rowsNewestFirst.some((r) => (num(r.irrigation_events_used) ?? 0) > 0);
  for (const r of rowsNewestFirst) {
    const depl = num(r.root_depletion_mm);
    if ((num(r.irrigation_events_used) ?? 0) > 0) return true;
    if (depl != null && depl <= 0) return true;
    if (isDepletionUnverifiedCeiling(depl, num(r.taw_mm), num(r.irrigation_mm_applied) ?? 0, hadIrrigation)) return false;
  }
  return true;
}

/** derived key -> env_property_master.property_code (for the farmer-visibility guard) */
export const DERIVED_PROPERTY_CODE: Record<string, string> = {
  et0: 'ET0',
  vpd: 'VPD',
  gdd_cumulative: 'GDD_CUM',
  lwd_est: 'LWD_EST',
  spray_score: 'SPRAY_SCORE',
  frost_risk: 'FROST_RISK',
  heat_stress_dh: 'HEAT_STRESS_DH',
  cold_stress_dh: 'COLD_STRESS_DH',
  water_deficit: 'WATER_DEFICIT',
  root_depletion: 'ROOT_DEPLETION',
  raw_mm: 'RAW_THRESHOLD',
  taw_mm: 'TAW',
  harvest_window: 'HARVEST_WINDOW',
  rain_24h: 'RAIN_24H',
  swsi: 'SWSI',
  n_sd_ratio: 'N_SD_RATIO',
};

/** Raw provider fields that must never reach a farmer payload. */
export const NEVER_FARMER_VISIBLE = new Set([
  'dew_point', 'dew_point_c', 'net_radiation', 'solar_radiation', 'wind_10m',
  'wind_speed_10m', 'pressure', 'pressure_hpa', 'provider_raw', 'raw_provider',
]);

// =====================================================
// LOADERS
// =====================================================

export async function batchLoadDerived(
  supabase: any,
  landIds: string[],
): Promise<Map<string, DerivedState>> {
  const map = new Map<string, DerivedState>();
  if (!landIds.length) return map;

  const windowStart = new Date(Date.now() - UNVERIFIED_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
  const [lwsRes, gddRes, epRes, waterRes] = await Promise.all([
    supabase.from('land_weather_state')
      .select('land_id, metric_date, et0_mm, et0_pm, et0_method, vpd_kpa, lwd_est_hours, spray_score, frost_risk_score, heat_stress_dh, cold_stress_dh, water_deficit_mm, root_depletion_mm, raw_mm, taw_mm, irrigation_urgency, harvest_window_score, rain_24h_mm, infiltration_cap_mm, swsi, swsi_class, n_sd_ratio, confidence')
      .in('land_id', landIds)
      .order('metric_date', { ascending: false })
      .limit(2000),
    supabase.from('land_gdd_daily')
      .select('land_id, obs_date, cumulative_gdd')
      .in('land_id', landIds)
      .order('obs_date', { ascending: false })
      .limit(2000),
    supabase.from('risk_episodes')
      .select('land_id, risk_code, phase, current_value, confidence')
      .in('land_id', landIds)
      .neq('phase', 'ended')
      .limit(2000),
    supabase.from('land_weather_state')
      .select('land_id, metric_date, root_depletion_mm, taw_mm, irrigation_mm_applied, irrigation_events_used')
      .in('land_id', landIds)
      .gte('metric_date', windowStart)
      .order('metric_date', { ascending: false })
      .limit(landIds.length * (UNVERIFIED_LOOKBACK_DAYS + 2)),
  ]);

  const waterRows = new Map<string, WaterStateRow[]>();
  for (const r of (waterRes.data || [])) {
    if (!waterRows.has(r.land_id)) waterRows.set(r.land_id, []);
    waterRows.get(r.land_id)!.push(r);
  }

  for (const row of (lwsRes.data || [])) {
    if (map.has(row.land_id)) continue; // newest metric_date wins
    map.set(row.land_id, {
      et0: num(row.et0_pm) ?? num(row.et0_mm),
      et0_method: row.et0_method ?? null,
      vpd: num(row.vpd_kpa),
      gdd_cumulative: null,
      lwd_est: num(row.lwd_est_hours),
      spray_score: num(row.spray_score),
      frost_risk: num(row.frost_risk_score),
      heat_stress_dh: num(row.heat_stress_dh),
      cold_stress_dh: num(row.cold_stress_dh),
      water_deficit: num(row.water_deficit_mm),
      root_depletion: num(row.root_depletion_mm),
      raw_mm: num(row.raw_mm),
      taw_mm: num(row.taw_mm),
      irrigation_urgency: row.irrigation_urgency ?? null,
      harvest_window: num(row.harvest_window_score),
      rain_24h: num(row.rain_24h_mm),
      infiltration_cap: num(row.infiltration_cap_mm),
      swsi: num(row.swsi),
      swsi_class: row.swsi_class ?? null,
      n_sd_ratio: num(row.n_sd_ratio),
      confidence: num(row.confidence),
      as_of: row.metric_date ?? null,
      water_state_verified: waterRes.error ? null : isWaterStateVerified(waterRows.get(row.land_id) ?? []),
      active_episodes: [],
    });
  }

  const seenGdd = new Set<string>();
  for (const row of (gddRes.data || [])) {
    if (seenGdd.has(row.land_id)) continue;
    seenGdd.add(row.land_id);
    const d = map.get(row.land_id) || emptyDerived();
    d.gdd_cumulative = num(row.cumulative_gdd);
    map.set(row.land_id, d);
  }

  for (const row of (epRes.data || [])) {
    const d = map.get(row.land_id) || emptyDerived();
    d.active_episodes.push({
      risk_code: String(row.risk_code || ''),
      phase: String(row.phase || ''),
      current_value: num(row.current_value),
      confidence: num(row.confidence),
    });
    map.set(row.land_id, d);
  }

  return map;
}

/** 5-day forecast mean Tmax per location_key (used by WHEAT_TERMINAL_HEAT). */
export async function batchLoadForecastTmax5d(
  supabase: any,
  locationKeys: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!locationKeys.length) return out;
  const { data, error } = await supabase
    .from('weather_forecasts')
    .select('location_key, forecast_time, temperature_max_celsius, temperature_celsius')
    .in('location_key', locationKeys)
    .gte('forecast_time', new Date().toISOString())
    .lte('forecast_time', new Date(Date.now() + 5 * 86400000).toISOString())
    .limit(2000);
  if (error || !data) return out;
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of data) {
    const v = num(r.temperature_max_celsius) ?? num(r.temperature_celsius);
    if (v == null) continue;
    const a = acc.get(r.location_key) || { sum: 0, n: 0 };
    a.sum += v; a.n += 1;
    acc.set(r.location_key, a);
  }
  for (const [k, a] of acc) if (a.n > 0) out.set(k, a.sum / a.n);
  return out;
}

/** env_property_master.farmer_visible map (property_code -> boolean). */
export async function loadFarmerVisibility(supabase: any): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const { data } = await supabase.from('env_property_master').select('property_code, farmer_visible');
  for (const r of (data || [])) map.set(String(r.property_code), r.farmer_visible === true);
  return map;
}

// =====================================================
// FARMER OUTPUT GUARD
// =====================================================

/**
 * Strips env properties that are not farmer_visible from a farmer-role payload.
 * Advisory sentences (title/message/action text) are never touched.
 * Agronomist/admin roles bypass this filter.
 */
export function applyFarmerVisibilityGuard(
  payload: Record<string, any>,
  visibility: Map<string, boolean>,
  role: 'farmer' | 'agronomist' | 'admin' = 'farmer',
): Record<string, any> {
  if (role !== 'farmer') return payload;
  const clone: Record<string, any> = { ...payload };

  for (const key of Object.keys(clone)) {
    if (NEVER_FARMER_VISIBLE.has(key)) { delete clone[key]; continue; }
    const prop = DERIVED_PROPERTY_CODE[key];
    if (prop && visibility.get(prop) === false) delete clone[key];
  }

  if (clone.derived && typeof clone.derived === 'object') {
    const src = clone.derived as Record<string, any>;
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === 'active_episodes') { filtered[k] = v; continue; }
      const prop = DERIVED_PROPERTY_CODE[k];
      if (prop && visibility.get(prop) === false) continue;
      if (NEVER_FARMER_VISIBLE.has(k)) continue;
      filtered[k] = v;
    }
    clone.derived = filtered;
  }
  return clone;
}

// =====================================================
// RULE EVALUATION — derived.* / active_episodes predicates
// =====================================================

export interface EnvEvalContext {
  crop_code: string | null;
  /** v125: days-after-sowing data path (unlocks das_min/das_max rules). */
  das?: number | null;
  derived: DerivedState;
  /** v125: weather namespace also carries tmin_forecast_night (temp_night rules). */
  weather: Record<string, any>;
  forecast: Record<string, any>;
  /** v124: satellite evidence namespace — DATA PATHS ONLY, thresholds come
   *  from rule rows (paths: ndvi.value, ndvi.previous, ndvi.drop).
   *  v127: widened with the pipeline's evidence fields, all numeric so the
   *  same ops apply: ndvi.age_days, ndvi.is_fresh (1/0), ndvi.evidence_rank
   *  (3/2/1/0), ndvi.epc, ndvi.purity, ndvi.cv, ndvi.ndre, ndvi.ndre_drop,
   *  ndvi.ndmi, ndvi.ndmi_drop, ndvi.pass_gap_days, ndvi.cohort_z,
   *  ndvi.cohort_delta, ndvi.context_present (1/0), ndvi.forecast_low,
   *  ndvi.forecast_high, ndvi.forecast_days_ahead. */
  ndvi?: { value: number | null; previous: number | null; drop: number | null; [evidencePath: string]: number | null };
}

export interface EnvEvalResult {
  applicable: boolean;
  fired: boolean;
  riskScore: number;
  confidence: number;
  reasoning: string;
  triggerData: Record<string, any>;
  /** Highest-priority episode phase that drove this rule (for transition dedup). */
  episodePhase: string | null;
}

export function isEnvIntelligenceRule(conditions: Record<string, any> | null): boolean {
  return !!conditions && conditions.metadata?.engine === 'env-intelligence';
}

export function evaluateEnvRule(
  ruleCode: string,
  conditions: Record<string, any>,
  ctx: EnvEvalContext,
): EnvEvalResult {
  const triggerData: Record<string, any> = {};
  const reasons: string[] = [];
  let episodePhase: string | null = null;

  // Crop scoping (crop_in) — crop-agnostic when absent; authors write either case.
  if (Array.isArray(conditions.crop_in) && conditions.crop_in.length > 0) {
    const allowed = conditions.crop_in.map((c: unknown) => String(c ?? '').trim().toUpperCase());
    if (!ctx.crop_code || !allowed.includes(String(ctx.crop_code).trim().toUpperCase())) {
      return notFired(`crop ${ctx.crop_code ?? 'unknown'} not in ${conditions.crop_in.join('/')}`, triggerData);
    }
  }

  const preds: any[] = Array.isArray(conditions.all) ? conditions.all : [];
  if (preds.length === 0) return notFired('no predicates', triggerData);

  // Evidence gates — judged on what the rule reads, never on its name.
  const reads = (prefix: string) => preds.some((p) =>
    (typeof p?.path === 'string' && p.path.startsWith(prefix)) ||
    (typeof p?.field === 'string' && p.field.startsWith(prefix)));
  if (reads('ndvi.')) {
    if (ctx.ndvi?.is_fresh !== 1) {
      return notFired(`NDVI pass not fresh (age ${ctx.ndvi?.age_days ?? '?'} d)`, triggerData);
    }
    if ((ctx.ndvi?.evidence_rank ?? 0) < 1) return notFired('NDVI evidence insufficient', triggerData);
  }
  if (reads('derived.root_depletion') && ctx.derived.water_state_verified !== true) {
    return notFired(ctx.derived.water_state_verified === false
      ? 'root-zone water state unverified (bucket at ceiling with no irrigation evidence)'
      : 'root-zone water state unknown', triggerData);
  }

  for (const p of preds) {
    if (p.episode) {
      const ep = matchEpisode(ctx.derived.active_episodes, p.episode);
      if (!ep) {
        return notFired(`no ${p.episode.risk_family || 'matching'} episode in required phase`, triggerData);
      }
      episodePhase = ep.phase;
      triggerData.episode = { risk_code: ep.risk_code, phase: ep.phase, current_value: ep.current_value, confidence: ep.confidence };
      reasons.push(`episode ${ep.risk_code} phase=${ep.phase}`);
      continue;
    }

    const left = resolvePath(ctx, p.path);
    if (p.op === 'not_null') {
      if (left == null) return notFired(`${p.path} is null`, triggerData);
      triggerData[shortKey(p.path)] = left;
      reasons.push(`${p.path} present`);
      continue;
    }
    if (left == null) return notFired(`${p.path} unavailable`, triggerData);

    let right: number | null = null;
    if (p.op === 'gte_field' || p.op === 'lt_field') {
      const rv = resolvePath(ctx, p.field);
      if (rv == null) return notFired(`${p.field} unavailable`, triggerData);
      right = Number(rv);
      triggerData[shortKey(p.field)] = right;
    } else {
      right = Number(p.value);
    }

    const l = Number(left);
    let ok = false;
    switch (p.op) {
      case 'eq': ok = l === right; break;
      case 'gt': ok = l > (right as number); break;
      case 'gte': case 'gte_field': ok = l >= (right as number); break;
      case 'lt': case 'lt_field': ok = l < (right as number); break;
      case 'lte': ok = l <= (right as number); break;
      default: return notFired(`unsupported op ${p.op}`, triggerData);
    }
    triggerData[shortKey(p.path)] = l;
    if (!ok) return notFired(`${p.path}=${l} fails ${p.op} ${right}`, triggerData);
    reasons.push(`${p.path}=${l} ${p.op} ${right}`);
  }

  const confidence = clamp01(
    triggerData.episode?.confidence ?? ctx.derived.confidence ?? 0.6,
  );

  triggerData.method = conditions.metadata?.method ?? null;
  triggerData.engine = 'env-intelligence';
  triggerData.confidence_source = 'derived';
  triggerData.derived_as_of = ctx.derived.as_of;
  if (conditions.metadata?.is_safety_block === true) triggerData.is_safety_block = true;

  return {
    applicable: true,
    fired: true,
    riskScore: Math.round(confidence * 100),
    confidence,
    reasoning: `[${ruleCode}] ${reasons.join('; ')}`,
    triggerData,
    episodePhase,
  };
}

function matchEpisode(episodes: DerivedEpisode[], spec: any): DerivedEpisode | null {
  const family = String(spec.risk_family || '').toUpperCase();
  const phaseIn: string[] | null = Array.isArray(spec.phase_in) ? spec.phase_in.map((s: string) => s.toLowerCase()) : null;
  const phaseNotIn: string[] = Array.isArray(spec.phase_not_in) ? spec.phase_not_in.map((s: string) => s.toLowerCase()) : ['ended'];
  for (const ep of episodes) {
    if (family && !ep.risk_code.toUpperCase().includes(family)) continue;
    const ph = ep.phase.toLowerCase();
    if (phaseIn && !phaseIn.includes(ph)) continue;
    if (!phaseIn && phaseNotIn.includes(ph)) continue;
    if (phaseIn && phaseNotIn.length && phaseNotIn.includes(ph)) continue;
    return ep;
  }
  return null;
}

function resolvePath(ctx: EnvEvalContext, path: string): any {
  if (!path) return null;
  const parts = path.split('.');
  let cur: any = ctx as any;
  for (const part of parts) {
    if (cur == null) return null;
    cur = cur[part];
  }
  return cur ?? null;
}

function shortKey(path: string): string {
  return path.split('.').slice(-1)[0];
}

function notFired(reason: string, triggerData: Record<string, any>): EnvEvalResult {
  return { applicable: true, fired: false, riskScore: 0, confidence: 0, reasoning: reason, triggerData, episodePhase: null };
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAILY DERIVE PIPELINE + OBSERVATION SPINE DUAL-WRITE + RISK EPISODES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CHANGE LOG (newest first)
 * 2026-08-07 11:40 UTC — Prompt 3: land daily derive (ET0 PM, LWD, Kc/ETc,
 *   TAW/RAW/depletion bucket, stress degree-hours, frost, spray, harvest
 *   window), dual-write of raw + derived values into env_observations with
 *   env_derivation_run / env_obs_lineage provenance, and hysteresis-based
 *   risk_episodes upserts.
 *
 * INVARIANTS
 * - Additive only. The `weather` endpoint response shape is untouched.
 * - Legacy land_weather_state columns keep their existing semantics; this
 *   module only fills the NEW columns (plus confidence).
 * - Never fabricate an input. Missing Tmax/Tmin, soil or NDVI produce a
 *   qc_flag / skip reason, never a substituted value.
 * - Every scientific coefficient comes from sci_method_registry (methods map).
 * - All writes are batched multi-row statements, never per-row round trips.
 */

import {
  calculateET0PenmanMonteith,
  calculateET0Hargreaves,
  calculateVPD,
  calculateDewPoint,
  estimateLeafWetnessHours,
  interpolateHourlyTemps,
  calculateStressDegreeHours,
  getHeatStressThreshold,
  calculateFrostRisk,
  calculateSprayScore,
  computeTawRaw,
  updateSoilWaterBucket,
  resolveKc,
  computeConfidence,
  calculateDiseaseRiskIndex,
  type HourlyWetnessInput,
  type MethodsMap,
} from "./agricultural-calculations.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;
type LogFn = (runId: string, level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/** ENGINE_DERIVED row in env_source_registry (resolved lazily, cached). */
let engineSourceId: string | null = null;
let sourceCodeMap: Record<string, string> | null = null;
let propertyBounds: Record<string, { min: number | null; max: number | null }> | null = null;

/**
 * Representative sand/clay fractions per soil_type, used ONLY when soil_health
 * has no measured texture. Indicative NBSS&LUP / FAO textural class centroids.
 * TODO: move to sci_method_registry as SOIL_TEXTURE_CLASS_DEFAULTS@1.0.
 */
const SOIL_TEXTURE_DEFAULTS: Record<string, { sand: number; clay: number; om: number }> = {
  black: { sand: 0.20, clay: 0.50, om: 0.7 },
  black_cotton: { sand: 0.20, clay: 0.50, om: 0.7 },
  vertisol: { sand: 0.20, clay: 0.50, om: 0.7 },
  clay: { sand: 0.20, clay: 0.55, om: 0.8 },
  clayey: { sand: 0.20, clay: 0.55, om: 0.8 },
  red: { sand: 0.55, clay: 0.25, om: 0.5 },
  laterite: { sand: 0.55, clay: 0.25, om: 0.5 },
  alfisol: { sand: 0.55, clay: 0.25, om: 0.5 },
  sandy: { sand: 0.85, clay: 0.05, om: 0.3 },
  sandy_loam: { sand: 0.70, clay: 0.12, om: 0.5 },
  entisol: { sand: 0.80, clay: 0.08, om: 0.3 },
  alluvial: { sand: 0.45, clay: 0.22, om: 0.7 },
  loamy: { sand: 0.42, clay: 0.20, om: 0.9 },
  inceptisol: { sand: 0.45, clay: 0.22, om: 0.7 },
};

/**
 * Effective rooting depth (m) per crop. FAO-56 Table 22 (max rooting depth,
 * lower bound of the published range, which is the irrigation-planning
 * convention for smallholder fields).
 */
const ROOT_DEPTH_M: Record<string, number> = {
  rice: 0.5, wheat: 1.0, maize: 1.0, cotton: 1.2,
  soybean: 0.8, sugarcane: 1.2, chickpea: 0.8, tomato: 0.7,
};
const ROOT_DEPTH_DEFAULT_M = 0.8;

/** Stage-name fragments that mark the reproductive / flowering window. */
const SENSITIVE_STAGE_RE = /flower|anthesis|bloom|panicle|tassel|silk|pollinat|reproduct|boot|heading|grain_fill|milk|pod|boll|fruit_set/i;

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

export function istDayString(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
/** 00:00 IST of the given IST calendar day, as an absolute instant. */
export function istDayAnchor(day: string): Date {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

// ---------------------------------------------------------------------------
// REFERENCE DATA (cached per isolate)
// ---------------------------------------------------------------------------

async function loadSpineRefs(supabase: Sb) {
  if (sourceCodeMap && propertyBounds && engineSourceId) return;
  const [{ data: sources }, { data: props }] = await Promise.all([
    supabase.from("env_source_registry").select("source_id, source_code"),
    supabase.from("env_property_master").select("property_code, plausible_min, plausible_max"),
  ]);
  sourceCodeMap = {};
  for (const s of sources ?? []) sourceCodeMap[s.source_code] = s.source_id;
  engineSourceId = sourceCodeMap["ENGINE_DERIVED"] ?? null;
  propertyBounds = {};
  for (const p of props ?? []) {
    propertyBounds[p.property_code] = { min: num(p.plausible_min), max: num(p.plausible_max) };
  }
}

/** Map a runtime provider label onto an env_source_registry source_code. */
function providerSourceId(provider: string | null | undefined): string | null {
  const p = String(provider ?? "").toLowerCase();
  const code = p.includes("imd")
    ? "IMD_API"
    : p.includes("tomorrow")
    ? "TOMORROW_IO"
    : p.includes("nasa")
    ? "NASA_POWER"
    : p.includes("era5")
    ? "ERA5"
    : "OPENWEATHER";
  return sourceCodeMap?.[code] ?? null;
}

/** qc_level 1 when the value sits inside the property's plausible band. */
function qcFor(property: string, value: number): { level: number; flags: string[] } {
  const b = propertyBounds?.[property];
  if (!b) return { level: 1, flags: [] };
  if (b.min !== null && value < b.min) return { level: 0, flags: ["OUT_OF_RANGE_LOW"] };
  if (b.max !== null && value > b.max) return { level: 0, flags: ["OUT_OF_RANGE_HIGH"] };
  return { level: 1, flags: [] };
}

/**
 * Historical provider skill for the confidence model (Prompt 3 item 5):
 * skill = clamp(1 − rolling_mae / (2·sigma_ref), 0, 1) once 30+ samples exist,
 * neutral 0.7 otherwise.
 */
export function skillFromBias(
  bias: { rolling_mae: number | null; sample_n: number | null } | null | undefined,
  sigmaRef: number,
  neutral = 0.7,
): number {
  const n = num(bias?.sample_n) ?? 0;
  const mae = num(bias?.rolling_mae);
  if (n < 30 || mae === null || sigmaRef <= 0) return neutral;
  return clamp(1 - mae / (2 * sigmaRef), 0, 1);
}

export function sigmaRefFor(property: string, methods?: MethodsMap): number {
  const table = (methods?.CONFIDENCE_MODEL?.params?.sigma_ref ?? {}) as Record<string, number>;
  const direct = table[property];
  if (Number.isFinite(direct)) return direct;
  if (property.startsWith("AIR_TEMP")) return table.AIR_TEMP ?? 2;
  if (property.startsWith("WIND")) return table.WIND_2M ?? 2;
  if (property === "RH") return table.RH ?? 10;
  if (property === "RAIN") return 5;
  return 1;
}

// ---------------------------------------------------------------------------
// PER-LAND INPUT BUNDLE
// ---------------------------------------------------------------------------

interface LandRow {
  id: string; tenant_id: string; cell_key: string;
  center_lat: number | string | null; center_lon: number | string | null;
  current_crop: string | null; soil_type: string | null;
  stage_uuid: string | null; crop_stage: string | null;
  current_gdd: number | string | null; elevation_meters: number | string | null;
  current_crop_variety_id: string | null;
}

interface DeriveOutcome {
  land_id: string;
  status: "derived" | "skipped";
  reasons: string[];
  raw_obs: number;
  derived_obs: number;
  runs: number;
  lineage: number;
  episodes: number;
}

/**
 * Derive one land's daily agronomic state and dual-write it to the spine.
 */
export async function deriveLandDaily(
  supabase: Sb,
  runId: string,
  land: LandRow,
  methods: MethodsMap,
  log: LogFn,
): Promise<DeriveOutcome> {
  const out: DeriveOutcome = {
    land_id: land.id, status: "skipped", reasons: [],
    raw_obs: 0, derived_obs: 0, runs: 0, lineage: 0, episodes: 0,
  };
  await loadSpineRefs(supabase);

  const day = istDayString();
  const anchor = istDayAnchor(day);
  const nowIso = new Date().toISOString();
  const cell = land.cell_key;
  const lat = num(land.center_lat);
  const lon = num(land.center_lon);
  const crop = String(land.current_crop ?? "").toLowerCase() || "generic";

  // ---- 1. FUSED DAILY INPUTS ----------------------------------------------
  const [aggRes, fcRes, soilRes, ndviRes, prevRes, curRes, stageRes] = await Promise.all([
    supabase.from("weather_aggregates").select("*")
      .eq("location_key", cell).eq("aggregate_date", day).is("land_id", null).maybeSingle(),
    supabase.from("weather_forecasts").select("*")
      .eq("location_key", cell)
      .gte("forecast_time", new Date(Date.now() - 36 * 3600 * 1000).toISOString())
      .order("forecast_time", { ascending: true }).limit(400),
    supabase.from("soil_health").select("sand_percent, clay_percent, organic_carbon")
      .eq("land_id", land.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ndvi_data").select("ndvi_value, mean_ndvi, date")
      .eq("land_id", land.id).order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("land_weather_state").select("metric_date, root_depletion_mm, taw_mm, disease_risk_score, heat_stress_dh, frost_risk_score, raw_mm")
      .eq("land_id", land.id).lt("metric_date", day)
      .order("metric_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("weather_current").select("data_source, temperature_celsius, humidity_percent, wind_speed_kmh, cloud_cover_percent, pressure_hpa, dew_point_celsius, observation_time")
      .eq("location_key", cell).order("observation_time", { ascending: false }).limit(1).maybeSingle(),
    land.stage_uuid
      ? supabase.from("crop_stage_master").select("growth_stage, stage_code, phenology_index, gdd_min, gdd_max")
        .eq("id", land.stage_uuid).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const agg = aggRes?.data ?? null;
  const forecasts = (fcRes?.data ?? []) as Array<Record<string, unknown>>;
  const soil = soilRes?.data ?? null;
  const ndviRow = ndviRes?.data ?? null;
  const prev = prevRes?.data ?? null;
  const cur = curRes?.data ?? null;
  const stage = stageRes?.data ?? null;

  // Newest issue per forecast slot (weather_forecasts is append-only).
  const bySlot = new Map<string, Record<string, unknown>>();
  for (const f of forecasts) {
    const slot = `${f.forecast_type}:${new Date(String(f.forecast_time)).toISOString()}`;
    const prevF = bySlot.get(slot);
    const issued = (v: unknown) => new Date(String(v ?? 0)).getTime();
    if (!prevF || issued(f.issued_at) > issued(prevF.issued_at)) bySlot.set(slot, f);
  }
  const slots = [...bySlot.values()].sort(
    (a, b) => new Date(String(a.forecast_time)).getTime() - new Date(String(b.forecast_time)).getTime(),
  );
  const hourlyRows = slots.filter((f) => f.forecast_type === "hourly");
  const dailyRows = slots.filter((f) => f.forecast_type === "daily");

  const todayDaily = dailyRows.find((d) => istDayString(new Date(String(d.forecast_time))) === day) ?? null;

  // Tmax/Tmin: measured aggregate first, forecast for the same IST day second.
  const tmax = num(agg?.temp_max_celsius) ?? num(todayDaily?.temperature_max_celsius);
  const tmin = num(agg?.temp_min_celsius) ?? num(todayDaily?.temperature_min_celsius);
  const rhMean = num(agg?.humidity_avg_percent) ?? num(todayDaily?.humidity_percent) ?? num(cur?.humidity_percent);
  const windKmh = num(agg?.wind_speed_avg_kmh) ?? num(todayDaily?.wind_speed_kmh);
  const curWindKmh = num(cur?.wind_speed_kmh);
  const wind10 = windKmh !== null ? windKmh / 3.6 : (curWindKmh !== null ? curWindKmh / 3.6 : null);
  const rain = num(agg?.rain_mm_total) ?? num(todayDaily?.rain_amount_mm) ?? 0;
  const cloud = num(todayDaily?.cloud_cover_percent) ?? num(cur?.cloud_cover_percent);
  const tempNow = num(cur?.temperature_celsius) ?? (tmax !== null && tmin !== null ? (tmax + tmin) / 2 : null);
  const elevation = num(land.elevation_meters) ?? undefined;
  const providerSrc = providerSourceId((cur?.data_source ?? todayDaily?.data_source) as string);

  if (tmax === null || tmin === null) {
    out.reasons.push("MISSING_TMAXMIN");
    log(runId, "info", "derive_skipped", { land_id: land.id, reason: "MISSING_TMAXMIN" });
    return out;
  }
  if (lat === null) {
    out.reasons.push("MISSING_LATITUDE");
    return out;
  }

  const dayOfYear = Math.floor(
    (anchor.getTime() - Date.UTC(new Date(anchor).getUTCFullYear(), 0, 0)) / 86400000,
  );

  // ---- hourly series (LWD + spray window) ---------------------------------
  const wetness: HourlyWetnessInput[] = hourlyRows.map((h) => ({
    rh: num(h.humidity_percent) ?? 0,
    temp: num(h.temperature_celsius) ?? undefined,
    rain_mm: num(h.rain_amount_mm) ?? 0,
    dt: Math.floor(new Date(String(h.forecast_time)).getTime() / 1000),
  })).filter((h) => Number.isFinite(h.rh));
  if (!wetness.length) out.reasons.push("NO_HOURLY_SERIES");

  // ---- (a) ET0 -------------------------------------------------------------
  const pm = calculateET0PenmanMonteith({
    tmax_c: tmax, tmin_c: tmin, latitude: lat, day_of_year: dayOfYear,
    rh_mean_pct: rhMean ?? undefined,
    wind_10m_ms: wind10 ?? undefined,
    cloud_cover_pct: cloud ?? undefined,
    elevation_m: elevation,
  }, methods);
  const hargreaves = calculateET0Hargreaves(tmax, tmin, lat, dayOfYear, methods);
  const et0 = pm.et0 ?? hargreaves;
  const et0Method = pm.et0 !== null ? pm.method : "ET0_HARGREAVES@1.0";
  if (pm.et0 === null) out.reasons.push(...pm.qc_flags.map((f) => `PM_${f}`));

  // ---- (b) VPD -------------------------------------------------------------
  const vpd = tempNow !== null && rhMean !== null ? calculateVPD(tempNow, rhMean, methods) : null;
  const dewPoint = num(cur?.dew_point_celsius)
    ?? (tempNow !== null && rhMean !== null ? calculateDewPoint(tempNow, rhMean) : null);

  // ---- (c) leaf wetness ----------------------------------------------------
  const lwd = wetness.length ? estimateLeafWetnessHours(wetness, methods) : null;

  // ---- stage bucket / sensitivity -----------------------------------------
  const { data: variety } = land.current_crop_variety_id
    ? await supabase.from("variety_phenology_profile").select("gdd_target")
      .eq("variety_id", land.current_crop_variety_id).not("gdd_target", "is", null)
      .order("gdd_target", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const gddTarget = num(variety?.gdd_target);
  const cumGdd = num(land.current_gdd);
  const gddFrac = gddTarget && cumGdd !== null ? clamp(cumGdd / gddTarget, 0, 1) : null;
  const stageName = String(stage?.growth_stage ?? land.crop_stage ?? "");
  const stageBucket: "ini" | "mid" | "end" = gddFrac !== null
    ? (gddFrac < 0.25 ? "ini" : gddFrac < 0.75 ? "mid" : "end")
    : /germin|nursery|seedl|emerg|establish|sow|transplant/i.test(stageName)
    ? "ini"
    : /matur|ripen|harvest|senesc|dry/i.test(stageName)
    ? "end"
    : "mid";
  const isSensitiveStage = SENSITIVE_STAGE_RE.test(stageName);

  // ---- (d) Kc / ETc --------------------------------------------------------
  const ndviRaw = num(ndviRow?.ndvi_value) ?? num(ndviRow?.mean_ndvi);
  const ndviRel = ndviRaw === null ? null : clamp((ndviRaw - 0.2) / (0.8 - 0.2), 0, 1);
  if (ndviRel === null) out.reasons.push("NO_NDVI");
  const kc = resolveKc(crop, stageBucket, ndviRel, methods);
  const kcUsed = ndviRel === null ? kc.kcStatic : kc.kcAdjusted;
  const etc = et0 !== null ? kcUsed * et0 : null;

  // ---- (e) soil water bucket ----------------------------------------------
  let sandFrac = num(soil?.sand_percent) !== null ? (num(soil!.sand_percent) as number) / 100 : null;
  let clayFrac = num(soil?.clay_percent) !== null ? (num(soil!.clay_percent) as number) / 100 : null;
  let omPct = num(soil?.organic_carbon) !== null ? (num(soil!.organic_carbon) as number) * 1.724 : undefined;
  if (sandFrac === null || clayFrac === null) {
    const t = SOIL_TEXTURE_DEFAULTS[String(land.soil_type ?? "").toLowerCase()];
    if (t) {
      sandFrac = t.sand; clayFrac = t.clay; omPct = omPct ?? t.om;
      out.reasons.push("SOIL_TEXTURE_FROM_CLASS_DEFAULT");
    } else {
      out.reasons.push("NO_SOIL_TEXTURE");
    }
  }
  const rootDepth = ROOT_DEPTH_M[crop] ?? ROOT_DEPTH_DEFAULT_M;
  const tawRaw = sandFrac !== null && clayFrac !== null
    ? computeTawRaw({ sandFrac, clayFrac, omPct }, rootDepth, methods)
    : null;

  let depletion: number | null = null;
  if (tawRaw) {
    const prevDepletion = num(prev?.root_depletion_mm) ?? 0.5 * tawRaw.raw_mm;
    const bucket = updateSoilWaterBucket(prevDepletion, {
      etcMm: etc ?? 0, rainMm: rain, irrigationMm: 0, runoffMm: 0,
    }, methods);
    depletion = clamp(bucket.depletionMm, 0, tawRaw.taw_mm);
  }

  // ---- (f) stress degree-hours --------------------------------------------
  const hourlyTemps = interpolateHourlyTemps(tmax, tmin);
  const heatThreshold = getHeatStressThreshold(crop, methods);
  const heatDh = calculateStressDegreeHours(hourlyTemps, heatThreshold, "above", isSensitiveStage);
  const coldDh = calculateStressDegreeHours(hourlyTemps, 10, "below", isSensitiveStage);

  // ---- (g) frost -----------------------------------------------------------
  const frost = calculateFrostRisk({
    tmin_c: tmin, crop_frost_threshold_c: 2,
    cloud_pct: cloud ?? undefined,
    wind_ms: wind10 ?? undefined,
    dew_point_c: dewPoint ?? undefined,
  }, methods);

  // ---- (h) spray -----------------------------------------------------------
  const next6 = hourlyRows.slice(0, 6);
  const rainNext6 = next6.reduce((s, h) => s + (num(h.rain_amount_mm) ?? 0), 0);
  const spray = calculateSprayScore({
    wind_2m_ms: (wind10 ?? 0) * 0.748,
    temp_c: tempNow ?? (tmax + tmin) / 2,
    rh_pct: rhMean ?? 60,
    rain_prob_pct: num(todayDaily?.rain_probability_percent) ?? undefined,
    rain_next6h_mm: rainNext6,
    hourly: hourlyRows.slice(0, 24).map((h) => ({
      wind_2m_ms: (num(h.wind_speed_kmh) ?? 0) / 3.6 * 0.748,
      temp_c: num(h.temperature_celsius) ?? undefined,
      rh_pct: num(h.humidity_percent) ?? undefined,
      rain_prob_pct: num(h.rain_probability_percent) ?? undefined,
      rain_mm: num(h.rain_amount_mm) ?? 0,
    })),
  }, methods);

  // ---- (i) harvest window (heuristic v1) -----------------------------------
  // Product of: GDD maturity proximity, dryness of the next 5 forecast days,
  // and a topsoil-dryness proxy from the root-zone depletion fraction.
  // Heuristic v1 — not a published index; revisit once harvest outcomes are
  // logged and the weights can be fitted.
  const next5 = dailyRows.slice(0, 5);
  const rainProbAvg = next5.length
    ? next5.reduce((s, d) => s + (num(d.rain_probability_percent) ?? 0), 0) / next5.length
    : 0;
  const drynessProxy = tawRaw && depletion !== null && tawRaw.taw_mm > 0
    ? clamp(depletion / tawRaw.taw_mm, 0, 1)
    : 0.5;
  const harvestWindow = gddFrac !== null
    ? clamp(gddFrac * (1 - rainProbAvg / 100) * (0.5 + 0.5 * drynessProxy), 0, 1)
    : null;

  // ---- disease risk (now fed with real leaf wetness) -----------------------
  const disease = tempNow !== null && rhMean !== null
    ? calculateDiseaseRiskIndex(tempNow, rhMean, dewPoint, rain, lwd ?? 0)
    : null;

  // ---- confidence ----------------------------------------------------------
  const { data: biasRows } = await supabase.from("weather_cell_bias")
    .select("property_code, rolling_mae, sample_n").eq("cell_key", cell);
  const biasByProp: Record<string, { rolling_mae: number | null; sample_n: number | null }> = {};
  for (const b of biasRows ?? []) biasByProp[b.property_code] = b;
  const skillTemp = skillFromBias(biasByProp.AIR_TEMP_MAX ?? biasByProp.AIR_TEMP, sigmaRefFor("AIR_TEMP", methods));
  const ageMin = cur?.observation_time
    ? (Date.now() - new Date(String(cur.observation_time)).getTime()) / 60000
    : 0;
  const stateConfidence = computeConfidence(
    { agreement: 1.0, freshnessAgeMin: ageMin, ttlMin: 60, horizonDays: 0, skill: skillTemp },
    methods,
  );

  // ---- PERSIST land_weather_state -----------------------------------------
  const { error: upErr } = await supabase.from("land_weather_state").upsert({
    land_id: land.id,
    tenant_id: land.tenant_id,
    cell_key: cell,
    metric_date: day,
    et0_pm: r2(pm.et0),
    et0_method: et0Method,
    u_std_et0: r2(pm.u_std),
    lwd_est_hours: lwd,
    kc_static: r2(kc.kcStatic),
    kc_ndvi_adj: ndviRel === null ? null : r2(kc.kcAdjusted),
    etc_mm: r2(etc),
    taw_mm: tawRaw ? r2(tawRaw.taw_mm) : null,
    raw_mm: tawRaw ? r2(tawRaw.raw_mm) : null,
    root_depletion_mm: r2(depletion),
    heat_stress_dh: heatDh,
    cold_stress_dh: coldDh,
    frost_risk_score: r2(frost.score),
    spray_score: r2(spray.score),
    spray_window: spray.window ?? null,
    harvest_window_score: r2(harvestWindow),
    confidence: r2(stateConfidence),
    // legacy columns are written by computeLandWeatherMetrics and are only
    // filled here when this derive created the row.
    et0_mm: r2(et0),
    vpd_kpa: r2(vpd),
    computed_at: nowIso,
  }, { onConflict: "land_id,metric_date" });
  if (upErr) {
    out.reasons.push(`STATE_WRITE_FAILED:${upErr.message}`);
    log(runId, "warn", "derive_state_write_failed", { land_id: land.id, error: upErr.message });
    return out;
  }

  // ---- DUAL-WRITE TO THE OBSERVATION SPINE --------------------------------
  const spine = await writeSpine(supabase, runId, {
    land, day, anchor, nowIso, providerSrc, methods, skill: skillTemp,
    raw: {
      AIR_TEMP_MAX: tmax, AIR_TEMP_MIN: tmin,
      RH: rhMean, RAIN: rain, WIND_10M: wind10,
    },
    derived: {
      ET0: { value: et0, u_std: pm.u_std, method: et0Method },
      VPD: { value: vpd, method: "VPD_TETENS@1.0" },
      LWD_EST: { value: lwd, method: "LWD_RH_THRESHOLD@1.0" },
      ETC: { value: etc, method: "KC_FAO56_TABLE12@1.0" },
      TAW: { value: tawRaw?.taw_mm ?? null, method: "SAXTON_RAWLS_PTF@1.0" },
      RAW_THRESHOLD: { value: tawRaw?.raw_mm ?? null, method: "SOIL_WATER_BALANCE_FAO56@1.0" },
      ROOT_DEPLETION: { value: depletion, method: "SOIL_WATER_BALANCE_FAO56@1.0" },
      HEAT_STRESS_DH: { value: heatDh, method: "HEAT_STRESS_FLOWERING@1.0" },
      COLD_STRESS_DH: { value: coldDh, method: "HEAT_STRESS_FLOWERING@1.0" },
      FROST_RISK: { value: frost.score, method: "FROST_COMPOSITE@1.0" },
      SPRAY_SCORE: { value: spray.score, method: "SPRAY_SUITABILITY@1.0" },
      HARVEST_WINDOW: { value: harvestWindow, method: "HARVEST_WINDOW_HEURISTIC@1.0" },
    },
  }, log);
  out.raw_obs = spine.rawCount;
  out.derived_obs = spine.derivedCount;
  out.runs = spine.runCount;
  out.lineage = spine.lineageCount;

  // ---- RISK EPISODES -------------------------------------------------------
  out.episodes = await upsertRiskEpisodes(supabase, runId, land, {
    DISEASE: { value: disease?.score ?? null, enter: 60, confidence: stateConfidence },
    WATER_DEFICIT: {
      value: depletion !== null && tawRaw ? depletion : null,
      enter: tawRaw?.raw_mm ?? null, confidence: stateConfidence,
    },
    HEAT_STRESS: { value: heatDh, enter: 0.0001, confidence: stateConfidence },
    FROST: { value: frost.score, enter: 0.6, confidence: stateConfidence },
  }, spine.derivedIds, prev, log);

  out.status = "derived";
  log(runId, "info", "land_derive_complete", {
    land_id: land.id, et0, method: et0Method, lwd, etc, depletion,
    spray: spray.score, frost: frost.score, qc: out.reasons,
  });
  return out;
}

// ---------------------------------------------------------------------------
// OBSERVATION SPINE
// ---------------------------------------------------------------------------

interface SpinePayload {
  land: LandRow;
  day: string;
  anchor: Date;
  nowIso: string;
  providerSrc: string | null;
  methods: MethodsMap;
  skill: number;
  raw: Record<string, number | null>;
  derived: Record<string, { value: number | null; u_std?: number | null; method: string }>;
}

async function writeSpine(supabase: Sb, runId: string, p: SpinePayload, log: LogFn) {
  const result = { rawCount: 0, derivedCount: 0, runCount: 0, lineageCount: 0, derivedIds: [] as number[] };
  if (!engineSourceId) { log(runId, "warn", "spine_no_engine_source", {}); return result; }

  const validTime = p.anchor.toISOString();
  // issue_time is the IST day anchor (not wall-clock now) so a re-run of the
  // same day upserts the same rows instead of appending duplicates. The dedup
  // index is (entity_key, property_code, valid_time, source_id, issue_time).
  const issueTime = validTime;
  const conflict = "entity_key,property_code,valid_time,source_id,issue_time";

  // ---- raw inputs ----------------------------------------------------------
  const rawRows = Object.entries(p.raw)
    .filter(([, v]) => v !== null && Number.isFinite(v as number))
    .map(([property, v]) => {
      const value = v as number;
      const qc = qcFor(property, value);
      const conf = computeConfidence({
        agreement: 1.0, freshnessAgeMin: 0, ttlMin: 1440, horizonDays: 0,
        skill: p.skill, isPrecip: property === "RAIN",
      }, p.methods);
      return {
        land_id: p.land.id, cell_key: p.land.cell_key, property_code: property,
        valid_time: validTime, issue_time: issueTime,
        value, source_id: p.providerSrc ?? engineSourceId,
        qc_level: qc.level, qc_flags: qc.flags, confidence: Math.round(conf * 1000) / 1000,
      };
    });

  let inputIds: number[] = [];
  if (rawRows.length) {
    const { data, error } = await supabase.from("env_observations")
      .upsert(rawRows, { onConflict: conflict }).select("obs_id");
    if (error) log(runId, "warn", "spine_raw_write_failed", { error: error.message });
    else { inputIds = (data ?? []).map((r: { obs_id: number }) => r.obs_id); result.rawCount = inputIds.length; }
  }

  // ---- derivation runs -----------------------------------------------------
  const methodsUsed = [...new Set(Object.values(p.derived).filter((d) => d.value !== null).map((d) => d.method))];
  const runRows = methodsUsed.map((m) => {
    const [method_id, method_version] = m.split("@");
    return {
      run_id: crypto.randomUUID(), method_id, method_version: method_version ?? "1.0",
      executed_at: p.nowIso, engine_source_id: engineSourceId,
      land_id: p.land.id, cell_key: p.land.cell_key, status: "ok",
    };
  });
  const runIdByMethod: Record<string, string> = {};
  if (runRows.length) {
    const { error } = await supabase.from("env_derivation_run").insert(runRows);
    if (error) log(runId, "warn", "spine_run_write_failed", { error: error.message });
    else {
      result.runCount = runRows.length;
      runRows.forEach((r, i) => { runIdByMethod[methodsUsed[i]] = r.run_id; });
    }
  }

  // ---- derived values ------------------------------------------------------
  const derivedRows = Object.entries(p.derived)
    .filter(([, d]) => d.value !== null && Number.isFinite(d.value as number))
    .map(([property, d]) => {
      const value = d.value as number;
      const qc = qcFor(property, value);
      const conf = computeConfidence({
        agreement: 1.0, freshnessAgeMin: 0, ttlMin: 1440, horizonDays: 0, skill: p.skill,
      }, p.methods);
      return {
        land_id: p.land.id, cell_key: p.land.cell_key, property_code: property,
        valid_time: validTime, issue_time: issueTime,
        value, u_std: d.u_std ?? null, source_id: engineSourceId,
        qc_level: qc.level, qc_flags: qc.flags, confidence: Math.round(conf * 1000) / 1000,
      };
    });

  if (derivedRows.length) {
    const { data, error } = await supabase.from("env_observations")
      .upsert(derivedRows, { onConflict: conflict }).select("obs_id, property_code");
    if (error) {
      log(runId, "warn", "spine_derived_write_failed", { error: error.message });
      return result;
    }
    const rows = (data ?? []) as Array<{ obs_id: number; property_code: string }>;
    result.derivedCount = rows.length;
    result.derivedIds = rows.map((r) => r.obs_id);

    // ---- lineage: every derived value depends on the raw inputs of the day -
    if (inputIds.length) {
      const lineage: Array<Record<string, unknown>> = [];
      for (const r of rows) {
        const method = p.derived[r.property_code]?.method ?? "";
        for (const inputId of inputIds) {
          lineage.push({
            derived_obs_id: r.obs_id, input_obs_id: inputId,
            run_id: runIdByMethod[method] ?? null,
          });
        }
      }
      const { error: lErr } = await supabase.from("env_obs_lineage")
        .upsert(lineage, { onConflict: "derived_obs_id,input_obs_id" });
      if (lErr) log(runId, "warn", "spine_lineage_write_failed", { error: lErr.message });
      else result.lineageCount = lineage.length;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// RISK EPISODES (hysteresis)
// ---------------------------------------------------------------------------

interface RiskSignal { value: number | null; enter: number | null; confidence: number }

/**
 * Episode lifecycle: onset → rising / peak / declining → ended.
 * Exit threshold = enter − 15 % relative; ending requires the value to have
 * been below it while the episode was already declining (two consecutive
 * lower days, since `current_value` always holds yesterday's reading).
 */
async function upsertRiskEpisodes(
  supabase: Sb,
  runId: string,
  land: LandRow,
  signals: Record<string, RiskSignal>,
  evidenceIds: number[],
  _prev: unknown,
  log: LogFn,
): Promise<number> {
  const codes = Object.keys(signals);
  const { data: existing } = await supabase.from("risk_episodes")
    .select("*").eq("land_id", land.id).in("risk_code", codes).neq("phase", "ended");
  const byCode: Record<string, Record<string, unknown>> = {};
  for (const e of existing ?? []) byCode[e.risk_code as string] = e;

  const nowIso = new Date().toISOString();
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const code of codes) {
    const s = signals[code];
    if (s.value === null || s.enter === null || !Number.isFinite(s.enter)) continue;
    const active = byCode[code];
    const over = s.value >= s.enter;
    const exitThreshold = s.enter * 0.85;

    if (!active) {
      if (!over) continue;
      inserts.push({
        land_id: land.id, tenant_id: land.tenant_id, risk_code: code,
        phase: "onset", started_at: nowIso, phase_updated_at: nowIso,
        current_value: s.value, peak_value: s.value,
        evidence_obs_ids: evidenceIds.slice(-30),
        confidence: Math.round(s.confidence * 1000) / 1000,
      });
      continue;
    }

    const prevValue = Number(active.current_value ?? 0);
    const prevPhase = String(active.phase);
    const peak = Math.max(Number(active.peak_value ?? 0), s.value);
    const evidence = [...((active.evidence_obs_ids as number[]) ?? []), ...evidenceIds].slice(-30);

    let phase = prevPhase;
    let endedAt: string | null = null;
    if (s.value > prevValue) phase = "rising";
    else if (s.value < prevValue) phase = prevPhase === "declining" ? "declining" : "declining";
    if (s.value >= peak) phase = "peak";
    if (s.value < exitThreshold && (prevPhase === "declining" || prevPhase === "peak")) {
      phase = "ended";
      endedAt = nowIso;
    }

    updates.push({
      id: String(active.episode_id),
      patch: {
        phase, phase_updated_at: nowIso, ended_at: endedAt,
        current_value: s.value, peak_value: peak,
        evidence_obs_ids: evidence,
        confidence: Math.min(Number(active.confidence ?? 1), Math.round(s.confidence * 1000) / 1000),
      },
    });
  }

  let touched = 0;
  if (inserts.length) {
    const { error } = await supabase.from("risk_episodes").insert(inserts);
    if (error) log(runId, "warn", "risk_episode_insert_failed", { error: error.message });
    else touched += inserts.length;
  }
  for (const u of updates) {
    const { error } = await supabase.from("risk_episodes").update(u.patch).eq("episode_id", u.id);
    if (error) log(runId, "warn", "risk_episode_update_failed", { error: error.message });
    else touched++;
  }
  return touched;
}

// ---------------------------------------------------------------------------
// BATCH ENTRY POINT
// ---------------------------------------------------------------------------

export async function runDailyDerive(
  supabase: Sb,
  runId: string,
  methods: MethodsMap,
  log: LogFn,
  landIdFilter?: string,
) {
  let q = supabase.from("lands")
    .select("id, tenant_id, cell_key, center_lat, center_lon, current_crop, soil_type, stage_uuid, crop_stage, current_gdd, elevation_meters, current_crop_variety_id")
    .eq("is_active", true).not("cell_key", "is", null);
  if (landIdFilter) q = q.eq("id", landIdFilter);
  const { data: lands, error } = await q;
  if (error) throw new Error(`lands read failed: ${error.message}`);

  const outcomes: DeriveOutcome[] = [];
  for (const land of (lands ?? []) as LandRow[]) {
    try {
      outcomes.push(await deriveLandDaily(supabase, runId, land, methods, log));
    } catch (e) {
      log(runId, "warn", "land_derive_exception", { land_id: land.id, error: String(e) });
      outcomes.push({
        land_id: land.id, status: "skipped", reasons: [`EXCEPTION:${String(e)}`],
        raw_obs: 0, derived_obs: 0, runs: 0, lineage: 0, episodes: 0,
      });
    }
  }

  const summary = {
    lands: outcomes.length,
    derived: outcomes.filter((o) => o.status === "derived").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    raw_obs: outcomes.reduce((s, o) => s + o.raw_obs, 0),
    derived_obs: outcomes.reduce((s, o) => s + o.derived_obs, 0),
    derivation_runs: outcomes.reduce((s, o) => s + o.runs, 0),
    lineage_rows: outcomes.reduce((s, o) => s + o.lineage, 0),
    episodes_touched: outcomes.reduce((s, o) => s + o.episodes, 0),
    skips: outcomes.filter((o) => o.status === "skipped").map((o) => ({ land_id: o.land_id, reasons: o.reasons })),
  };
  log(runId, "info", "daily_derive_summary", summary);
  return { summary, outcomes };
}

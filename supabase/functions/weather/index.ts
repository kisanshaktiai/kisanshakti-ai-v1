// ============================================================================
// WEATHER INGESTION & SERVING — PRODUCTION REWRITE
// supabase/functions/weather/index.ts
//
// Replaces the previous 1,598-line implementation in full.
//
// WHAT WAS BROKEN (measured on the live database, 2026-08-06):
//   • Tomorrow.io: 0 rows in 8 months. It was only reachable inside
//     OpenWeather's catch block, and OpenWeather almost never fails.
//   • OpenWeather: 6.3 calls/day average against a 1,000/day budget = 0.6%
//     utilisation, because ingestion only happened when a user opened the app.
//   • 16 of the last 60 days have NO weather data at all.
//   • agricultural-calculations.ts (549 lines, crop-aware GDD, VPD, irrigation)
//     was never imported; index.ts reimplemented weaker copies inline.
//   • rain_24h_mm stored a 1-hour value (under-reporting rain up to 24x).
//   • .eq('land_id', null) never matches SQL NULL -> 162 duplicate aggregate
//     groups, every row observation_count = 1.
//   • Rain period buckets used UTC hours on IST farms (5.5h shift).
//   • A missing TOMORROW_IO_API_KEY threw before any provider was tried.
//
// WHAT THIS DOES INSTEAD:
//   Provider strategy is CAPABILITY-BASED, not failover-based:
//     current   : IMD -> OpenWeather -> Tomorrow.io
//     daily     : IMD -> OpenWeather -> Tomorrow.io
//     hourly    : OpenWeather -> Tomorrow.io      (IMD has no hourly product)
//     enrichment: Tomorrow.io fills UV / dew point / precip probability,
//                 which IMD and the OpenWeather free tier do not publish.
//   Tomorrow.io now has a real job instead of being a dead failover.
//
// CONTRACT PRESERVED: request and response shapes are unchanged, so
// src/hooks/useWeather.ts needs no modification.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { resolveTenantFromRequest } from "../_shared/tenantMiddleware.ts";
import { withTenantBlocker } from "../_shared/tenantBlocker.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  fetchImdCurrent,
  fetchImdForecast,
  imdCacheStatus,
} from "./imd-provider.ts";
import { getImdCredentials } from "./imd-token.ts";
// FIX: this module existed but was never imported. Its calculations are
// crop-aware (per-crop GDD base/cap, VPD, irrigation need) and strictly
// better than the inline copies that were being used instead.
import {
  calculateAllAgriculturalIndices,
  calculateDewPoint,
  calculateET0Hargreaves,
  calculateDailyGDD,
  getCropGDDParams,
  estimateSunshineHours,
  computeConfidence,
  estimateLeafWetnessHours,
  type HourlyWetnessInput,
} from "./agricultural-calculations.ts";
import { loadSciMethods, type MethodsMap } from "./sci-methods.ts";
import { runDailyDerive, writeForecastSpine } from "./derive-pipeline.ts";


// Scientific coefficients come from public.sci_method_registry. ONE read per
// isolate (never per calculation); the map is then passed by value into the
// science module.
let sciMethodsCache: MethodsMap | null = null;
async function getSciMethods(supabase: SupabaseClient, runId: string): Promise<MethodsMap> {
  if (sciMethodsCache) return sciMethodsCache;
  sciMethodsCache = await loadSciMethods(
    supabase,
    (l, e, d) => log(runId, l as "info" | "warn" | "error", e, d),
  );
  return sciMethodsCache;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /**
   * Shared weather cell size in degrees.
   * 0.10 deg ~= 11 km. Every farmer inside one cell shares ONE weather record.
   *
   * Previously 0.01 deg (~1.1 km), which was false precision: the nearest IMD
   * station is typically 20-60 km away, so 1 km keys produced many cache
   * entries holding identical data. Measured on live data: 32 lands produced
   * 17 distinct keys at 0.01 deg but only 9 at 0.10 deg.
   */
  CELL_RESOLUTION_DEG: 0.10,

  /** Cache TTL per provider, matched to how often each actually publishes. */
  TTL_MINUTES: { IMD: 180, OpenWeather: 60, "Tomorrow.io": 60, default: 60 },

  /** Daily call ceilings (free tiers). Enforced before dispatch. */
  DAILY_BUDGET: { IMD: 5000, OpenWeather: 950, "Tomorrow.io": 450 },

  /** Reserve part of Tomorrow.io's budget for enrichment specifically. */
  ENRICHMENT_BUDGET_TOMORROW: 200,

  HTTP: { timeoutMs: 12000, maxAttempts: 3, baseBackoffMs: 400 },

  RATE_LIMIT: { maxRequests: 20, windowMs: 900000 },

  IST_OFFSET_MS: 330 * 60 * 1000,

  /** Physical plausibility. Values outside are REJECTED, never clamped. */
  BOUNDS: {
    temp: { min: -60, max: 60 },
    humidity: { min: 0, max: 100 },
    rain: { min: 0, max: 2000 },
    windMs: { min: 0, max: 140 },
    pressure: { min: 800, max: 1100 },
  },
} as const;

// ============================================================================
// TYPES  (unchanged from the previous implementation - contract preserved)
// ============================================================================

interface WeatherRequest {
  action: "current" | "forecast" | "agricultural" | "all" | "land" | "land_state" | "refresh_land_cells" | "derive_land_state" | "daily_derive";
  lat?: number;
  lon?: number;
  landId?: string;
  units?: "metric" | "imperial" | "standard";
}

interface CurrentWeatherData {
  temp: number;
  feels_like: number;
  temp_min: number;
  temp_max: number;
  humidity: number;
  pressure: number;
  wind_speed: number; // m/s  <-- canonical internal unit
  wind_deg: number;
  description: string;
  main: string;
  icon: string;
  clouds: number;
  visibility: number; // metres
  sunrise: number;
  sunset: number;
  location: string;
  dt: number;
  provider?: string;
  uv_index?: number;
  dew_point?: number;
  rain_1h?: number;
  rain_3h?: number;
  rain_24h?: number; // real 24h total when the provider publishes one
  imd_station_code?: string;
  imd_station_name?: string;
  imd_distance_km?: number;
  station_ref?: string;
  station_name?: string;
}

interface ForecastItem {
  dt: number;
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  weather: Array<{ description: string; main: string; icon: string }>;
  pop: number;
  uv_index?: number;
}

interface DailyForecast {
  dt: number;
  temp: { day: number; min: number; max: number; night: number; eve: number; morn: number };
  humidity: number;
  wind_speed: number;
  weather: Array<{ description: string; main: string; icon: string }>;
  pop: number;
  rain?: number;
  uv_index?: number;
  moon_phase?: number;
  pop_source?: string;
}

type Provider = "IMD" | "OpenWeather" | "Tomorrow.io";

interface ProviderAttempt {
  provider: Provider;
  capability: string;
  ok: boolean;
  ms: number;
  error?: string;
}

// ============================================================================
// STRUCTURED LOGGING
// ============================================================================

const RUN_ID = () => crypto.randomUUID().slice(0, 8);

function log(runId: string, level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(), level, fn: "weather", run_id: runId, event, ...(data ?? {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Shared weather cell key. All farmers in the cell reuse one record.
 *
 * FIX E2 (2026-08-22): the key is now CANONICAL — always one decimal place on
 * both axes ('16.9,74.0'). The old `Number(x.toFixed(2))` dropped trailing
 * zeros and emitted '16.9,74', which broke the GDD accumulator's numeric join
 * on location_key. Existing rows are left alone; the DB join tolerates both.
 */
export function canonicalLocationKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

function roundCoordinates(lat: number, lon: number): { lat: number; lon: number; key: string } {
  const r = CONFIG.CELL_RESOLUTION_DEG;
  const roundedLat = Math.round(lat / r) * r;
  const roundedLon = Math.round(lon / r) * r;
  const nLat = Number(roundedLat.toFixed(2));
  const nLon = Number(roundedLon.toFixed(2));
  return { lat: nLat, lon: nLon, key: canonicalLocationKey(nLat, nLon) };
}

/**
 * FIX E3 — diurnal collapse guard.
 * 33% of weather_aggregates rows had temp_max == temp_min because a mean-only
 * provider fallback wrote the instantaneous mean into both columns, which
 * zeroes GDD and ET0. When true daily extremes are unavailable we synthesize a
 * climatologically plausible range around the mean and LABEL the row so the
 * downstream pipeline can tell fabricated extremes from observed ones.
 */
function seasonalDiurnalRange(isoDate: string): number {
  const month = Number(isoDate.slice(5, 7));
  if (month >= 6 && month <= 9) return 6;   // monsoon: compressed range
  if (month === 12 || month <= 2) return 14; // dry winter: wide range
  return 10;
}

type DailyExtremes = {
  tmax: number;
  tmin: number;
  source: "observed" | "mean_only_synthesized";
};

function resolveDailyExtremes(
  dailyMax: number | null,
  dailyMin: number | null,
  meanTemp: number,
  isoDate: string,
): DailyExtremes {
  if (dailyMax !== null && dailyMin !== null && dailyMax > dailyMin) {
    return { tmax: dailyMax, tmin: dailyMin, source: "observed" };
  }
  const r = seasonalDiurnalRange(isoDate);
  const base = Number.isFinite(dailyMax as number) && Number.isFinite(dailyMin as number)
    ? ((dailyMax as number) + (dailyMin as number)) / 2
    : meanTemp;
  return {
    tmax: Math.round((base + r / 2) * 10) / 10,
    tmin: Math.round((base - r / 2) * 10) / 10,
    source: "mean_only_synthesized",
  };
}


/** IST calendar date. Farms are in IST; the Deno runtime is UTC. */
function istDate(at: Date = new Date()): string {
  return new Date(at.getTime() + CONFIG.IST_OFFSET_MS).toISOString().split("T")[0];
}

/** IST hour 0-23, for rain-period bucketing. */
function istHour(at: Date = new Date()): number {
  return new Date(at.getTime() + CONFIG.IST_OFFSET_MS).getUTCHours();
}

function inBounds(v: number | null | undefined, b: { min: number; max: number }): boolean {
  return v !== null && v !== undefined && Number.isFinite(v) && v >= b.min && v <= b.max;
}

/** Reject implausible readings. A clamped value is a lie the brain cannot detect. */
function validateCurrent(c: CurrentWeatherData, runId: string): boolean {
  if (!inBounds(c.temp, CONFIG.BOUNDS.temp)) {
    log(runId, "warn", "rejected_reading", { field: "temp", value: c.temp, provider: c.provider });
    return false;
  }
  if (c.humidity !== undefined && !inBounds(c.humidity, CONFIG.BOUNDS.humidity)) c.humidity = 0;
  if (c.wind_speed !== undefined && !inBounds(c.wind_speed, CONFIG.BOUNDS.windMs)) c.wind_speed = 0;
  if (c.pressure !== undefined && !inBounds(c.pressure, CONFIG.BOUNDS.pressure)) c.pressure = 0;
  return true;
}

function getWindDirection(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Every outbound call goes through here: hard timeout + bounded retry.
 * The previous implementation had neither, so a hung provider hung the
 * whole invocation.
 */
async function fetchWithRetry(url: string, init: RequestInit, label: string, runId: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CONFIG.HTTP.maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.HTTP.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      // 4xx (except 429) are terminal - retrying only burns budget.
      if (!res.ok && res.status !== 429 && res.status < 500) return res;
      if (res.ok) return res;
      lastErr = new Error(`${label} HTTP ${res.status}`);
      if (attempt === CONFIG.HTTP.maxAttempts) return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt === CONFIG.HTTP.maxAttempts) throw e;
    }
    const backoff = CONFIG.HTTP.baseBackoffMs * 2 ** (attempt - 1);
    await sleep(backoff / 2 + Math.random() * (backoff / 2));
  }
  throw lastErr ?? new Error(`${label} failed`);
}

// ============================================================================
// QUOTA GOVERNANCE
// Without this, a bill cannot be bounded or explained, and we cannot tell
// whether OpenWeather's budget is being used (it was at 0.6%).
// ============================================================================

async function getUsedToday(supabase: SupabaseClient, provider: Provider): Promise<number> {
  try {
    const { count } = await supabase
      .from("weather_provider_call")
      .select("*", { count: "exact", head: true })
      .eq("provider", provider)
      .eq("quota_day", istDate());
    return count ?? 0;
  } catch {
    return 0; // telemetry must never block ingestion
  }
}

async function logCall(
  supabase: SupabaseClient,
  runId: string,
  provider: Provider,
  endpoint: string,
  ok: boolean,
  ms: number,
  errorMessage?: string,
) {
  try {
    await supabase.from("weather_provider_call").insert({
      run_id: runId, provider, endpoint, quota_day: istDate(),
      ok, latency_ms: ms, error_message: errorMessage?.slice(0, 400) ?? null,
    });
  } catch { /* never break ingestion for telemetry */ }
}

// ============================================================================
// PROVIDER: OpenWeather
// ============================================================================

async function fetchOpenWeatherCurrent(lat: number, lon: number, apiKey: string, runId: string): Promise<CurrentWeatherData> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  const res = await fetchWithRetry(url, {}, "OpenWeather current", runId);
  if (!res.ok) throw new Error(`OpenWeather current: ${res.status} - ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();

  return {
    temp: d.main.temp,
    feels_like: d.main.feels_like,
    temp_min: d.main.temp_min,
    temp_max: d.main.temp_max,
    humidity: d.main.humidity,
    pressure: d.main.pressure,
    wind_speed: d.wind?.speed ?? 0, // m/s
    wind_deg: d.wind?.deg ?? 0,
    description: d.weather[0].description,
    main: d.weather[0].main,
    icon: d.weather[0].icon,
    clouds: d.clouds?.all ?? 0,
    visibility: d.visibility ?? 10000,
    sunrise: d.sys?.sunrise ?? 0,
    sunset: d.sys?.sunset ?? 0,
    location: d.name ? `${d.name}` : `${lat}, ${lon}`,
    station_ref: d.id ? String(d.id) : undefined,
    station_name: d.name ?? undefined,
    dt: d.dt,
    provider: "OpenWeather",
    uv_index: 0,   // not in the free current endpoint
    dew_point: 0,  // derived later
    rain_1h: d.rain?.["1h"] ?? 0,
    rain_3h: d.rain?.["3h"] ?? 0,
  };
}

async function fetchOpenWeatherForecast(
  lat: number, lon: number, apiKey: string, runId: string,
): Promise<{ forecast: DailyForecast[]; hourly: ForecastItem[] }> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  const res = await fetchWithRetry(url, {}, "OpenWeather forecast", runId);
  if (!res.ok) throw new Error(`OpenWeather forecast: ${res.status}`);
  const d = await res.json();

  const hourly: ForecastItem[] = d.list.slice(0, 8).map((i: any) => ({
    dt: i.dt,
    temp: i.main.temp,
    feels_like: i.main.feels_like,
    humidity: i.main.humidity,
    wind_speed: i.wind.speed,
    weather: [{ description: i.weather[0].description, main: i.weather[0].main, icon: i.weather[0].icon }],
    pop: i.pop ?? 0,
    uv_index: 0,
  }));

  const byDay = new Map<string, any[]>();
  for (const item of d.list) {
    const key = new Date(item.dt * 1000).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(item);
  }

  const forecast: DailyForecast[] = Array.from(byDay.values()).slice(0, 7).map((items) => {
    const temps = items.map((i: any) => i.main.temp);
    const avg = temps.reduce((a: number, b: number) => a + b, 0) / temps.length;
    return {
      dt: items[0].dt,
      temp: {
        day: avg, min: Math.min(...temps), max: Math.max(...temps),
        night: Math.min(...temps), eve: avg, morn: avg,
      },
      humidity: items[0].main.humidity,
      wind_speed: items[0].wind.speed,
      weather: [{
        description: items[0].weather[0].description,
        main: items[0].weather[0].main,
        icon: items[0].weather[0].icon,
      }],
      pop: Math.max(...items.map((i: any) => i.pop ?? 0)),
      rain: items.reduce((s: number, i: any) => s + (i.rain?.["3h"] ?? 0), 0),
      uv_index: 0,
      moon_phase: 0,
      pop_source: "openweather_measured",
    };
  });

  return { forecast, hourly };
}

// ============================================================================
// PROVIDER: Tomorrow.io
// ============================================================================

function tomorrowCodeToText(code: number): { main: string; description: string; icon: string } {
  const map: Record<number, [string, string, string]> = {
    1000: ["Clear", "clear sky", "01d"], 1100: ["Clear", "mostly clear", "01d"],
    1101: ["Clouds", "partly cloudy", "02d"], 1102: ["Clouds", "mostly cloudy", "03d"],
    1001: ["Clouds", "cloudy", "04d"], 2000: ["Fog", "fog", "50d"], 2100: ["Fog", "light fog", "50d"],
    4000: ["Drizzle", "drizzle", "09d"], 4001: ["Rain", "rain", "10d"],
    4200: ["Rain", "light rain", "10d"], 4201: ["Rain", "heavy rain", "10d"],
    5000: ["Snow", "snow", "13d"], 5001: ["Snow", "flurries", "13d"],
    5100: ["Snow", "light snow", "13d"], 5101: ["Snow", "heavy snow", "13d"],
    6000: ["Drizzle", "freezing drizzle", "09d"], 6001: ["Rain", "freezing rain", "10d"],
    7000: ["Ice", "ice pellets", "13d"], 8000: ["Thunderstorm", "thunderstorm", "11d"],
  };
  const hit = map[code] ?? ["Unknown", "unknown", "01d"];
  return { main: hit[0], description: hit[1], icon: hit[2] };
}

async function fetchTomorrowIoRealtime(lat: number, lon: number, apiKey: string, runId: string): Promise<CurrentWeatherData> {
  const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&apikey=${apiKey}`;
  const res = await fetchWithRetry(url, { headers: { accept: "application/json" } }, "Tomorrow realtime", runId);
  if (!res.ok) throw new Error(`Tomorrow.io realtime: ${res.status}`);
  const d = await res.json();
  const v = d.data?.values;
  if (!v) throw new Error("Tomorrow.io returned no values block");

  const decoded = tomorrowCodeToText(v.weatherCode);
  return {
    temp: v.temperature ?? 0,
    feels_like: v.temperatureApparent ?? v.temperature ?? 0,
    temp_min: v.temperature ?? 0,
    temp_max: v.temperature ?? 0,
    humidity: v.humidity ?? 0,
    pressure: v.pressureSurfaceLevel ?? 0,
    wind_speed: v.windSpeed ?? 0, // m/s with metric units
    wind_deg: v.windDirection ?? 0,
    description: decoded.description,
    main: decoded.main,
    icon: decoded.icon,
    clouds: v.cloudCover ?? 0,
    visibility: (v.visibility ?? 10) * 1000,
    sunrise: 0,
    sunset: 0,
    location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    dt: Math.floor(new Date(d.data.time).getTime() / 1000),
    provider: "Tomorrow.io",
    uv_index: v.uvIndex ?? 0,
    dew_point: v.dewPoint ?? 0,
    rain_1h: v.rainIntensity ?? 0,
    rain_3h: 0,
  };
}

async function fetchTomorrowIoForecast(
  lat: number, lon: number, apiKey: string, runId: string,
): Promise<{ forecast: DailyForecast[]; hourly: ForecastItem[] }> {
  const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${apiKey}&timesteps=1h,1d&units=metric`;
  const res = await fetchWithRetry(url, { headers: { accept: "application/json" } }, "Tomorrow forecast", runId);
  if (!res.ok) throw new Error(`Tomorrow.io forecast: ${res.status}`);
  const d = await res.json();

  const hourlyTl = d.timelines?.hourly ?? [];
  const dailyTl = d.timelines?.daily ?? [];

  const hourly: ForecastItem[] = hourlyTl.slice(0, 24).map((h: any) => {
    const dec = tomorrowCodeToText(h.values.weatherCode);
    return {
      dt: Math.floor(new Date(h.time).getTime() / 1000),
      temp: h.values.temperature ?? 0,
      feels_like: h.values.temperatureApparent ?? 0,
      humidity: h.values.humidity ?? 0,
      wind_speed: h.values.windSpeed ?? 0,
      weather: [dec],
      pop: (h.values.precipitationProbability ?? 0) / 100,
      uv_index: h.values.uvIndex ?? 0,
    };
  });

  const forecast: DailyForecast[] = dailyTl.slice(0, 7).map((day: any) => {
    const v = day.values;
    const dec = tomorrowCodeToText(v.weatherCodeMax ?? v.weatherCode);
    return {
      dt: Math.floor(new Date(day.time).getTime() / 1000),
      temp: {
        day: v.temperatureAvg ?? 0, min: v.temperatureMin ?? 0, max: v.temperatureMax ?? 0,
        night: v.temperatureMin ?? 0, eve: v.temperatureAvg ?? 0, morn: v.temperatureAvg ?? 0,
      },
      humidity: v.humidityAvg ?? 0,
      wind_speed: v.windSpeedAvg ?? 0,
      weather: [dec],
      pop: (v.precipitationProbabilityAvg ?? 0) / 100,
      rain: v.rainAccumulationSum ?? v.rainAccumulationAvg ?? 0,
      uv_index: v.uvIndexMax ?? 0,
      moon_phase: v.moonPhase ?? 0,
      pop_source: "tomorrowio_measured",
    };
  });

  return { forecast, hourly };
}

/**
 * ENRICHMENT — the fix that finally makes Tomorrow.io earn its 500 calls/day.
 *
 * IMD publishes no UV index and no dew point; OpenWeather's free current
 * endpoint publishes neither either. Tomorrow.io publishes both directly.
 * Rather than sitting unused as a failover that never fires, Tomorrow.io now
 * fills exactly the gaps the primary sources leave.
 *
 * Budget-gated: enrichment stops when the reserved slice is spent, so it can
 * never starve the fallback role.
 */
async function enrichWithTomorrowIo(
  current: CurrentWeatherData,
  lat: number,
  lon: number,
  apiKey: string,
  supabase: SupabaseClient,
  runId: string,
): Promise<{ enriched: boolean; fields: string[] }> {
  const needsUv = !current.uv_index;
  const needsDew = !current.dew_point;
  if (!needsUv && !needsDew) return { enriched: false, fields: [] };

  const used = await getUsedToday(supabase, "Tomorrow.io");
  if (used >= CONFIG.ENRICHMENT_BUDGET_TOMORROW) {
    log(runId, "info", "enrichment_skipped_budget", { used, budget: CONFIG.ENRICHMENT_BUDGET_TOMORROW });
    return { enriched: false, fields: [] };
  }

  const started = Date.now();
  try {
    const tio = await fetchTomorrowIoRealtime(lat, lon, apiKey, runId);
    await logCall(supabase, runId, "Tomorrow.io", "realtime:enrichment", true, Date.now() - started);

    const fields: string[] = [];
    if (needsUv && tio.uv_index) { current.uv_index = tio.uv_index; fields.push("uv_index"); }
    if (needsDew && tio.dew_point) { current.dew_point = tio.dew_point; fields.push("dew_point"); }
    if (!current.visibility && tio.visibility) { current.visibility = tio.visibility; fields.push("visibility"); }

    log(runId, "info", "enrichment_applied", { provider: "Tomorrow.io", fields });
    return { enriched: fields.length > 0, fields };
  } catch (e) {
    await logCall(supabase, runId, "Tomorrow.io", "realtime:enrichment", false, Date.now() - started, String(e));
    log(runId, "warn", "enrichment_failed", { error: String(e) });
    return { enriched: false, fields: [] };
  }
}

// ============================================================================
// CACHE
// ============================================================================

async function checkCache(
  supabase: SupabaseClient,
  locationKey: string,
  action: string,
  runId: string,
  allowStale = false,
): Promise<{ current?: CurrentWeatherData; forecast?: DailyForecast[]; hourly?: ForecastItem[]; stale?: boolean } | null> {
  try {
    let q = supabase.from("weather_current").select("*").eq("location_key", locationKey);
    if (!allowStale) q = q.gt("expires_at", new Date().toISOString());

    const { data: cached, error } = await q.order("observation_time", { ascending: false }).limit(1).maybeSingle();
    if (error) { log(runId, "warn", "cache_read_error", { error: error.message }); return null; }
    if (!cached) { log(runId, "info", "cache_miss", { location_key: locationKey }); return null; }

    const isStale = new Date(cached.expires_at).getTime() < Date.now();
    log(runId, "info", isStale ? "cache_hit_stale" : "cache_hit", {
      location_key: locationKey, provider: cached.data_source,
      age_min: Math.round((Date.now() - new Date(cached.observation_time).getTime()) / 60000),
    });

    const current: CurrentWeatherData = {
      temp: cached.temperature_celsius ?? 0,
      feels_like: cached.feels_like_celsius ?? 0,
      temp_min: cached.temp_min_celsius ?? cached.temperature_celsius ?? 0,
      temp_max: cached.temp_max_celsius ?? cached.temperature_celsius ?? 0,
      humidity: cached.humidity_percent ?? 0,
      pressure: cached.pressure_hpa ?? 0,
      wind_speed: (cached.wind_speed_kmh ?? 0) / 3.6, // stored km/h -> m/s
      wind_deg: cached.wind_direction_degrees ?? 0,
      description: cached.weather_description ?? "Unknown",
      main: cached.weather_main ?? "Unknown",
      icon: cached.weather_icon ?? "01d",
      clouds: cached.cloud_cover_percent ?? 0,
      visibility: (cached.visibility_km ?? 10) * 1000,
      sunrise: cached.sunrise ? Math.floor(new Date(cached.sunrise).getTime() / 1000) : 0,
      sunset: cached.sunset ? Math.floor(new Date(cached.sunset).getTime() / 1000) : 0,
      location: `${cached.latitude}, ${cached.longitude}`,
      dt: Math.floor(new Date(cached.observation_time).getTime() / 1000),
      provider: cached.data_source ?? "Cache",
      uv_index: cached.uv_index ?? 0,
      dew_point: cached.dew_point_celsius ?? 0,
      rain_1h: cached.rain_1h_mm ?? 0,
      rain_3h: cached.rain_3h_mm ?? 0,
      rain_24h: cached.rain_24h_mm ?? 0,
      imd_station_code: cached.imd_station_code ?? undefined,
      imd_station_name: cached.imd_station_name ?? undefined,
      imd_distance_km: cached.imd_distance_km ?? undefined,
    };

    if (action === "current") return { current, stale: isStale };

    let fq = supabase.from("weather_forecasts").select("*")
      .eq("location_key", locationKey).order("forecast_time", { ascending: true });
    if (!allowStale) fq = fq.gte("forecast_time", new Date().toISOString());
    const { data: rawRows } = await fq;

    // ------------------------------------------------------------------
    // DE-DUPLICATION (root cause of repeated forecast days in the UI)
    // weather_forecasts is APPEND-ONLY: one row per issued_at, on purpose,
    // because prior issues are the forecast-skill dataset. Reading it back
    // raw therefore emits the same calendar day 2-3 times.
    // Collapse here: keep the newest issued_at per slot. Daily rows bucket
    // by the IST calendar day so a UTC-midnight row is never split in two.
    // ------------------------------------------------------------------
    const istDayKey = (iso: string) =>
      new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

    const newestBySlot = new Map<string, any>();
    for (const f of rawRows ?? []) {
      const slot = f.forecast_type === "daily"
        ? `daily:${istDayKey(f.forecast_time)}`
        : `${f.forecast_type}:${new Date(f.forecast_time).toISOString()}`;
      const prev = newestBySlot.get(slot);
      const issued = f.issued_at ? new Date(f.issued_at).getTime() : 0;
      const prevIssued = prev?.issued_at ? new Date(prev.issued_at).getTime() : -1;
      if (!prev || issued > prevIssued) newestBySlot.set(slot, f);
    }

    const rows = Array.from(newestBySlot.values()).sort(
      (a, b) => new Date(a.forecast_time).getTime() - new Date(b.forecast_time).getTime(),
    );

    const hourly: ForecastItem[] = [];
    const daily: DailyForecast[] = [];

    for (const f of rows ?? []) {
      const t = new Date(f.forecast_time);
      if (f.forecast_type === "hourly" && hourly.length < 24) {
        hourly.push({
          dt: Math.floor(t.getTime() / 1000),
          temp: f.temperature_celsius ?? 0,
          feels_like: f.feels_like_celsius ?? 0,
          humidity: f.humidity_percent ?? 0,
          wind_speed: (f.wind_speed_kmh ?? 0) / 3.6,
          weather: [{
            description: f.weather_description ?? "Unknown",
            main: f.weather_main ?? "Unknown",
            icon: f.weather_icon ?? "01d",
          }],
          pop: (f.rain_probability_percent ?? 0) / 100,
          uv_index: f.uv_index ?? 0,
        });
      } else if (f.forecast_type === "daily" && daily.length < 14) {
        daily.push({
          dt: Math.floor(t.getTime() / 1000),
          temp: {
            day: f.temperature_celsius ?? 0,
            min: f.temperature_min_celsius ?? 0,
            max: f.temperature_max_celsius ?? 0,
            night: f.temperature_min_celsius ?? 0,
            eve: f.temperature_celsius ?? 0,
            morn: f.temperature_celsius ?? 0,
          },
          humidity: f.humidity_percent ?? 0,
          wind_speed: (f.wind_speed_kmh ?? 0) / 3.6,
          weather: [{
            description: f.weather_description ?? "Unknown",
            main: f.weather_main ?? "Unknown",
            icon: f.weather_icon ?? "01d",
          }],
          pop: (f.rain_probability_percent ?? 0) / 100,
          rain: f.rain_amount_mm ?? 0,
          uv_index: f.uv_index ?? 0,
          pop_source: f.rain_prob_source ?? undefined,
        });
      }
    }

    return { current, forecast: daily, hourly, stale: isStale };
  } catch (e) {
    log(runId, "error", "cache_exception", { error: String(e) });
    return null;
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * D11: shared daily-forecast row mapping. Used by the serving-provider cache
 * write AND by the Tomorrow.io ensemble second-opinion write.
 */
function buildDailyForecastRows(
  forecast: DailyForecast[],
  provider: string,
  locationKey: string,
  rounded: { lat: number; lon: number },
  tenantId: string | undefined,
  current: CurrentWeatherData,
  now: Date,
) {
  return forecast.map((day) => ({
    location_key: locationKey,
    latitude: rounded.lat,
    longitude: rounded.lon,
    land_id: null, // LAYER 1 shared measurement
    tenant_id: tenantId ?? null,
    forecast_time: new Date(day.dt * 1000).toISOString(),
    forecast_type: "daily" as const,
    temperature_celsius: day.temp.day,
    temperature_min_celsius: day.temp.min,
    temperature_max_celsius: day.temp.max,
    feels_like_celsius: day.temp.day,
    humidity_percent: Math.round(day.humidity),
    wind_speed_kmh: day.wind_speed * 3.6,
    weather_description: day.weather[0]?.description ?? "Unknown",
    weather_main: day.weather[0]?.main ?? "Unknown",
    weather_icon: day.weather[0]?.icon ?? "01d",
    rain_probability_percent: Math.round(day.pop * 100),
    rain_amount_mm: day.rain ?? 0,
    uv_index: day.uv_index ?? 0,
    data_source: provider,
    rain_prob_source: day.pop_source ?? null,
    imd_station_code: current.imd_station_code ?? null,
    imd_distance_km: current.imd_distance_km ?? null,
    issued_at: now.toISOString(),
    station_ref: current.station_ref ?? current.imd_station_code ?? null,
    station_distance_km: current.imd_distance_km ?? null,
    created_at: now.toISOString(),
  }));
}

async function cacheWeatherData(

  supabase: SupabaseClient,
  runId: string,
  locationKey: string,
  rounded: { lat: number; lon: number },
  current: CurrentWeatherData,
  forecast?: DailyForecast[],
  hourly?: ForecastItem[],
  tenantId?: string,
  farmerId?: string,
  landId?: string,
) {
  const now = new Date();
  const provider = (current.provider ?? "API") as Provider;
  const ttlMin = (CONFIG.TTL_MINUTES as Record<string, number>)[provider] ?? CONFIG.TTL_MINUTES.default;
  const expiresAt = new Date(now.getTime() + ttlMin * 60 * 1000);

  // D6 FIX: confidence is computed (CONFIDENCE_MODEL@1.0), never a constant.
  // agreement = 1.0 and skill = registry-neutral until cross-provider ensemble
  // scoring lands; freshness comes from the record age vs its own TTL.
  const sciMethods = await getSciMethods(supabase, runId);
  const obsAgeMin = Number.isFinite(current.dt)
    ? Math.max(0, (now.getTime() - current.dt * 1000) / 60000)
    : 0;
  const currentConfidence = computeConfidence(
    { agreement: 1.0, freshnessAgeMin: obsAgeMin, ttlMin, horizonDays: 0 },
    sciMethods,
  );

  // Derive dew point when the provider did not supply one.
  const dewPointC = current.dew_point && current.dew_point !== 0
    ? current.dew_point
    : calculateDewPoint(current.temp, current.humidity);

  // FIX: rain_24h_mm previously stored a 1-HOUR value while the Decision Brain
  // read it as a 24-hour total, under-reporting rainfall by up to 24x.
  const rain24 = current.rain_24h ?? current.rain_1h ?? 0;

  try {
    // ---- 1. weather_current (shared cell cache) ----------------------------
    const currentRecord: Record<string, unknown> = {
      location_key: locationKey,
      latitude: rounded.lat,
      longitude: rounded.lon,
      land_id: null, // LAYER 1 is shared measurement — never land-scoped
      tenant_id: tenantId ?? null,
      temperature_celsius: current.temp,
      temp_min_celsius: current.temp_min,
      temp_max_celsius: current.temp_max,
      feels_like_celsius: current.feels_like,
      humidity_percent: current.humidity,
      pressure_hpa: current.pressure,
      wind_speed_kmh: current.wind_speed * 3.6, // m/s -> km/h
      wind_direction_degrees: current.wind_deg,
      weather_description: current.description,
      weather_main: current.main,
      weather_icon: current.icon,
      cloud_cover_percent: current.clouds,
      visibility_km: current.visibility / 1000,
      uv_index: current.uv_index ?? 0,
      dew_point_celsius: dewPointC,
      rain_1h_mm: current.rain_1h ?? 0,
      rain_3h_mm: current.rain_3h ?? 0,
      rain_24h_mm: rain24,
      snow_1h_mm: 0,
      sunrise: current.sunrise ? new Date(current.sunrise * 1000).toISOString() : null,
      sunset: current.sunset ? new Date(current.sunset * 1000).toISOString() : null,
      observation_time: new Date(current.dt * 1000).toISOString(),
      data_source: provider,
      imd_station_code: current.imd_station_code ?? null,
      imd_station_name: current.imd_station_name ?? null,
      imd_distance_km: current.imd_distance_km ?? null,
      station_ref: current.station_ref ?? current.imd_station_code ?? null,
      station_name: current.station_name ?? current.imd_station_name ?? null,
      station_distance_km: current.imd_distance_km ?? null,
      method: current.provider === "IMD" ? "measured" : "modelled",
      confidence: currentConfidence, // D6: CONFIDENCE_MODEL@1.0
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
    };

    await supabase.from("weather_current").delete().eq("location_key", locationKey);
    const { error: curErr } = await supabase.from("weather_current").insert(currentRecord);
    if (curErr) log(runId, "error", "weather_current_insert_failed", { error: curErr.message });
    else log(runId, "info", "weather_current_cached", { location_key: locationKey, provider, ttl_min: ttlMin });

    // ---- 2. weather_observations (history) ---------------------------------
    if (tenantId) {
      const { error: obsErr } = await supabase.from("weather_observations").upsert({
        tenant_id: tenantId,
        farmer_id: farmerId ?? null,
        land_id: null, // LAYER 1 shared measurement
        location_key: locationKey,
        station_ref: current.station_ref ?? current.imd_station_code ?? null,
        station_distance_km: current.imd_distance_km ?? null,
        method: current.provider === "IMD" ? "measured" : "modelled",
        confidence: currentConfidence, // D6: CONFIDENCE_MODEL@1.0
        observation_date: istDate(now), // FIX: IST, not UTC
        observation_time: new Date(current.dt * 1000).toISOString(),
        temperature_celsius: current.temp,
        feels_like_celsius: current.feels_like,
        humidity_percent: current.humidity,
        rainfall_mm: rain24,
        snow_1h_mm: 0,
        wind_speed_kmh: current.wind_speed * 3.6,
        wind_direction: getWindDirection(current.wind_deg),
        weather_condition: current.main,
        pressure_hpa: current.pressure,
        visibility_km: current.visibility / 1000,
        uv_index: current.uv_index ?? 0,
        dew_point_celsius: dewPointC,
        cloud_coverage_percent: current.clouds,
        metadata: {
          provider,
          location_key: locationKey,
          icon: current.icon,
          description: current.description,
          rain_1h_mm: current.rain_1h ?? 0,
          rain_3h_mm: current.rain_3h ?? 0,
          rain_24h_mm: rain24,
          imd_station_code: current.imd_station_code ?? null,
          imd_distance_km: current.imd_distance_km ?? null,
        },
        created_at: now.toISOString(),
      }, { onConflict: "tenant_id,observation_date,observation_time,land_id", ignoreDuplicates: false });

      if (obsErr) log(runId, "warn", "observation_upsert_failed", { error: obsErr.message });
    }

    // ---- 3. daily forecasts -------------------------------------------------
    if (forecast?.length) {
      const rows = buildDailyForecastRows(forecast, provider, locationKey, rounded, tenantId, current, now);

      // Append, never erase. Prior issues are the forecast-skill dataset.
      const { error } = await supabase.from("weather_forecasts")
        .upsert(rows, {
          onConflict: "location_key,forecast_type,forecast_time,issued_at,data_source",
          ignoreDuplicates: true,
        });
      if (error) log(runId, "warn", "daily_forecast_insert_failed", { error: error.message });
      else log(runId, "info", "daily_forecasts_cached", { count: rows.length, provider });
    }


    // ---- 4. hourly forecasts ------------------------------------------------
    if (hourly?.length) {
      const rows = hourly.map((h) => ({
        location_key: locationKey,
        latitude: rounded.lat,
        longitude: rounded.lon,
        land_id: null, // LAYER 1 shared measurement
        tenant_id: tenantId ?? null,
        forecast_time: new Date(h.dt * 1000).toISOString(),
        forecast_type: "hourly" as const,
        temperature_celsius: h.temp,
        feels_like_celsius: h.feels_like,
        humidity_percent: Math.round(h.humidity),
        wind_speed_kmh: h.wind_speed * 3.6,
        weather_description: h.weather[0]?.description ?? "Unknown",
        weather_main: h.weather[0]?.main ?? "Unknown",
        weather_icon: h.weather[0]?.icon ?? "01d",
        rain_probability_percent: Math.round(h.pop * 100),
        uv_index: h.uv_index ?? null,
        data_source: provider,
        issued_at: now.toISOString(),
        station_ref: current.station_ref ?? current.imd_station_code ?? null,
        station_distance_km: current.imd_distance_km ?? null,
        created_at: now.toISOString(),
      }));

      const { error } = await supabase.from("weather_forecasts")
        .upsert(rows, {
          onConflict: "location_key,forecast_type,forecast_time,issued_at,data_source",
          ignoreDuplicates: true,
        });
      if (error) log(runId, "warn", "hourly_forecast_insert_failed", { error: error.message });
    }

    // ---- 5. daily aggregate --------------------------------------------------
    // D5: the hourly series is now threaded through so leaf wetness duration
    // can actually be estimated (rain per hour is not published by the
    // providers' hourly product, so the RH / dew-point criteria decide).
    const wetnessSeries: HourlyWetnessInput[] | undefined = hourly?.length
      ? hourly.map((h) => ({ rh: h.humidity, temp: h.temp, dt: h.dt }))
      : undefined;

    if (tenantId) {
      await updateWeatherAggregate(supabase, runId, tenantId, farmerId, landId, locationKey, current, now, rounded.lat, rounded.lon, dewPointC, rain24, sciMethods, wetnessSeries);
    }

    // ---- 6. per-land derived metrics ----------------------------------------
    if (landId && tenantId) {
      await computeLandWeatherMetrics(supabase, runId, landId, tenantId, locationKey, current, rounded, rain24, sciMethods, wetnessSeries);
    }
  } catch (e) {
    log(runId, "error", "cache_write_exception", { error: String(e) });
  }
}

// ============================================================================
// DAILY AGGREGATE
// ============================================================================

async function updateWeatherAggregate(
  supabase: SupabaseClient,
  runId: string,
  tenantId: string,
  farmerId: string | undefined,
  landId: string | undefined,
  locationKey: string,
  current: CurrentWeatherData,
  now: Date,
  latitude: number,
  _longitude: number,
  dewPointC: number,
  rain24: number,
  methods?: MethodsMap,
  wetnessSeries?: HourlyWetnessInput[],
) {
  // FIX: IST date and IST hour. The runtime is UTC; farms are IST (+5:30), so
  // every rain-period bucket was previously shifted by 5.5 hours and a late
  // evening observation landed on the wrong day.
  const today = istDate(now);
  const hour = istHour(now);

  let rainColumn = "rain_mm_morning";
  if (hour >= 12 && hour < 17) rainColumn = "rain_mm_afternoon";
  else if (hour >= 17 && hour < 21) rainColumn = "rain_mm_evening";
  else if (hour >= 21 || hour < 6) rainColumn = "rain_mm_night";

  // D3 FIX: daily Tmax/Tmin are used ONLY when the provider actually supplied
  // them. Substituting the instantaneous temperature (the old
  // `current.temp_max ?? current.temp`) fabricated a zero diurnal range and
  // poisoned ET0/GDD. When they are missing, ET0/GDD are skipped here and the
  // daily finalize job (which reads weather_aggregates) computes them.
  const dailyMax = Number.isFinite(current.temp_max as number) ? (current.temp_max as number) : null;
  const dailyMin = Number.isFinite(current.temp_min as number) ? (current.temp_min as number) : null;
  const hasDaily = dailyMax !== null && dailyMin !== null;
  // FIX E1/E3: never store a collapsed diurnal range. When the provider gave no
  // usable extremes we synthesize a seasonal range around the mean and label it.
  const extremes = resolveDailyExtremes(dailyMax, dailyMin, current.temp, today);
  const hasLat = Number.isFinite(latitude);
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);

  const et0 = hasDaily && hasLat
    ? calculateET0Hargreaves(dailyMax as number, dailyMin as number, latitude, dayOfYear, methods)
    : null;
  const gddParams = getCropGDDParams("DEFAULT", methods);
  const dailyGDD = hasDaily
    ? calculateDailyGDD(dailyMax as number, dailyMin as number, gddParams.baseTemp, gddParams.maxTemp)
    : null;
  const sunshine = Number.isFinite(current.sunrise) && Number.isFinite(current.sunset) && current.sunset > current.sunrise
    ? estimateSunshineHours(current.clouds, current.sunrise, current.sunset)
    : null;
  if (!hasDaily) log(runId, "info", "agg_qc_flag", { flag: "MISSING_TMAXMIN", location_key: locationKey });

  const indicesInput = {
    temperature_c: current.temp,
    temperature_max_c: dailyMax ?? undefined,
    temperature_min_c: dailyMin ?? undefined,
    humidity_percent: current.humidity,
    cloud_cover_percent: current.clouds,
    sunrise_timestamp: current.sunrise,
    sunset_timestamp: current.sunset,
    rainfall_24h_mm: rain24,
    latitude: hasLat ? latitude : undefined,
    day_of_year: dayOfYear,
    wind_speed_ms: current.wind_speed,
    pressure_hpa: current.pressure,
    dew_point_c: dewPointC,
    hourly_series: wetnessSeries,
  };

  try {
    // FIX: .eq('land_id', null) never matches SQL NULL in PostgREST, so this
    // lookup always missed and a NEW row was inserted on every call.
    // Measured impact before the fix: 981 rows / 162 duplicate groups, every
    // row observation_count = 1, so daily rain totals never accumulated.
    let q = supabase.from("weather_aggregates").select("*")
      .eq("tenant_id", tenantId)
      .eq("aggregate_date", today)
      .eq("location_key", locationKey); // prevents city mixing
    q = q.is("land_id", null); // LAYER 1 aggregates are cell-scoped, never land-scoped
    const { data: existing } = await q.maybeSingle();

    if (existing) {
      const obsCount = existing.observation_count || 1;
      const updates: Record<string, unknown> = {
        updated_at: now.toISOString(),
        rain_mm_total: (existing.rain_mm_total || 0) + rain24,
        [rainColumn]: (existing[rainColumn] || 0) + rain24,
        observation_count: obsCount + 1,
      };

      // FIX E1/E3: extremes hygiene.
      //   observed provider extremes always win and widen the running range;
      //   a synthesized range NEVER downgrades an already-observed row.
      const newAvg = (existing.temp_avg_celsius ?? current.temp)
        + (current.temp - (existing.temp_avg_celsius ?? current.temp)) / (obsCount + 1);
      if (extremes.source === "observed") {
        updates.temp_min_celsius = existing.temp_min_celsius == null
          ? extremes.tmin : Math.min(existing.temp_min_celsius, extremes.tmin);
        updates.temp_max_celsius = existing.temp_max_celsius == null
          ? extremes.tmax : Math.max(existing.temp_max_celsius, extremes.tmax);
        updates.temp_source = "observed";
      } else if (existing.temp_source === "observed") {
        // Keep the observed range, only widen it with the live reading.
        if (existing.temp_min_celsius == null || current.temp < existing.temp_min_celsius) {
          updates.temp_min_celsius = current.temp;
        }
        if (existing.temp_max_celsius == null || current.temp > existing.temp_max_celsius) {
          updates.temp_max_celsius = current.temp;
        }
      } else {
        // Synthesized row: re-centre the seasonal range on the running mean and
        // widen it with any real reading seen so far.
        const syn = resolveDailyExtremes(null, null, newAvg, today);
        updates.temp_min_celsius = Math.min(syn.tmin, current.temp, existing.temp_min_celsius ?? syn.tmin);
        updates.temp_max_celsius = Math.max(syn.tmax, current.temp, existing.temp_max_celsius ?? syn.tmax);
        updates.temp_source = "mean_only_synthesized";
      }

      // Incremental mean: avg += (new - avg) / (n + 1)
      const prevH = existing.humidity_avg_percent ?? current.humidity;
      const prevW = existing.wind_speed_avg_kmh ?? current.wind_speed * 3.6;
      updates.temp_avg_celsius = newAvg;
      updates.humidity_avg_percent = prevH + (current.humidity - prevH) / (obsCount + 1);
      updates.wind_speed_avg_kmh = prevW + (current.wind_speed * 3.6 - prevW) / (obsCount + 1);
      if (current.wind_speed * 3.6 > (existing.wind_speed_max_kmh || 0)) {
        updates.wind_speed_max_kmh = current.wind_speed * 3.6;
      }

      const indices = calculateAllAgriculturalIndices(indicesInput, methods);

      updates.frost_risk = current.temp < 4;
      updates.heat_stress_risk = current.temp > 38;
      updates.disease_risk_level = indices.disease_risk.level.toLowerCase();
      // D3: never write a fabricated ET0/GDD — leave the column untouched.
      if (dailyGDD !== null) updates.gdd_accumulated = (existing.gdd_accumulated || 0) + dailyGDD;
      if (et0 !== null) updates.evapotranspiration_mm = et0;
      if (sunshine !== null) updates.sunshine_hours = sunshine;

      await supabase.from("weather_aggregates").update(updates).eq("id", existing.id);
      log(runId, "info", "aggregate_updated", {
        date: today, obs_count: obsCount + 1, rain_total: updates.rain_mm_total,
        temp_source: updates.temp_source ?? existing.temp_source,
      });
    } else {
      const indices = calculateAllAgriculturalIndices(indicesInput, methods);

      const { error } = await supabase.from("weather_aggregates").upsert({
        tenant_id: tenantId,
        farmer_id: farmerId ?? null,
        land_id: null, // LAYER 1 shared measurement
        location_key: locationKey,
        aggregate_date: today,
        rain_mm_total: rain24,
        [rainColumn]: rain24,
        temp_min_celsius: extremes.tmin,
        temp_max_celsius: extremes.tmax,
        temp_source: extremes.source,
        temp_avg_celsius: current.temp,
        humidity_avg_percent: current.humidity,
        wind_speed_avg_kmh: current.wind_speed * 3.6,
        wind_speed_max_kmh: current.wind_speed * 3.6,
        observation_count: 1,
        frost_risk: current.temp < 4,
        heat_stress_risk: current.temp > 38,
        disease_risk_level: indices.disease_risk.level.toLowerCase(),
        // D3: null instead of a fabricated value when daily extremes are absent
        gdd_accumulated: dailyGDD,
        evapotranspiration_mm: et0,
        sunshine_hours: sunshine,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: "tenant_id,location_key,aggregate_date,land_id", ignoreDuplicates: false });

      if (error) log(runId, "warn", "aggregate_insert_failed", { error: error.message });
      else log(runId, "info", "aggregate_created", { date: today, temp_source: extremes.source });
    }

    // FIX E4: when the fetch was made for a specific land, mirror the day's
    // measurement into a land-scoped aggregate row so the GDD accumulator can
    // prefer land-specific data over the shared cell row. Upsert on the natural
    // key (tenant, location_key, date, land_id) — never a blind insert, which is
    // what produced the duplicate for land 6b0d9b65 on 2026-01-06.
    if (landId) {
      const { error: landAggErr } = await supabase.from("weather_aggregates").upsert({
        tenant_id: tenantId,
        farmer_id: farmerId ?? null,
        land_id: landId,
        location_key: locationKey,
        aggregate_date: today,
        rain_mm_total: rain24,
        temp_min_celsius: extremes.tmin,
        temp_max_celsius: extremes.tmax,
        temp_source: extremes.source,
        temp_avg_celsius: current.temp,
        humidity_avg_percent: current.humidity,
        wind_speed_avg_kmh: current.wind_speed * 3.6,
        observation_count: 1,
        gdd_accumulated: dailyGDD,
        evapotranspiration_mm: et0,
        updated_at: now.toISOString(),
      }, { onConflict: "tenant_id,location_key,aggregate_date,land_id", ignoreDuplicates: false });
      if (landAggErr) log(runId, "warn", "land_aggregate_upsert_failed", { error: landAggErr.message });
    }


    await archiveToWeatherHistorical(supabase, runId, tenantId, landId, locationKey, latitude, _longitude);
  } catch (e) {
    log(runId, "warn", "aggregate_exception", { error: String(e) });
  }
}

// ============================================================================
// HISTORICAL ARCHIVE
// Frozen since 2026-02-08 because of the same .eq(null) defect plus a
// maybeSingle() against a table that held up to 18 rows per day.
// ============================================================================

async function archiveToWeatherHistorical(
  supabase: SupabaseClient,
  runId: string,
  tenantId: string,
  landId: string | undefined,
  locationKey: string,
  latitude: number,
  longitude: number,
) {
  try {
    const yesterday = new Date(Date.now() - 86400000);
    const yStr = istDate(yesterday);

    const { data: exists } = await supabase.from("weather_historical")
      .select("id").eq("record_date", yStr).eq("latitude", latitude ?? 0)
      .limit(1).maybeSingle();
    if (exists) return;

    let aq = supabase.from("weather_aggregates").select("*")
      .eq("tenant_id", tenantId).eq("aggregate_date", yStr)
      .eq("location_key", locationKey);
    aq = landId ? aq.eq("land_id", landId) : aq.is("land_id", null); // FIX
    const { data: agg } = await aq.limit(1).maybeSingle();

    if (!agg) return;

    const { error } = await supabase.from("weather_historical").insert({
      latitude: latitude ?? 0,
      longitude: longitude ?? 0,
      record_date: yStr,
      temperature_avg_celsius: agg.temp_avg_celsius,
      temperature_min_celsius: agg.temp_min_celsius,
      temperature_max_celsius: agg.temp_max_celsius,
      rainfall_mm: agg.rain_mm_total ?? 0,
      humidity_avg_percent: agg.humidity_avg_percent,
      wind_speed_avg_kmh: agg.wind_speed_avg_kmh,
      evapotranspiration_mm: agg.evapotranspiration_mm ?? 0,
      growing_degree_days: agg.gdd_accumulated ?? 0,
      data_source: "daily_aggregate",
      created_at: new Date().toISOString(),
    });

    if (error) log(runId, "warn", "historical_archive_failed", { error: error.message });
    else log(runId, "info", "historical_archived", { date: yStr });
  } catch (e) {
    log(runId, "warn", "historical_archive_exception", { error: String(e) });
  }
}

// ============================================================================
// PER-LAND DERIVED METRICS
// ============================================================================

// Legacy inline copy — kept only as the offline mirror. The authoritative
// values now live in sci_method_registry as SOIL_TYPE_EFFECTIVE_RAIN@1.0.
const SOIL_FACTORS: Record<string, number> = {
  black: 0.60, black_cotton: 0.60, vertisol: 0.60,
  red: 0.75, laterite: 0.75, alfisol: 0.75,
  sandy: 0.85, sandy_loam: 0.85, entisol: 0.85,
  alluvial: 0.70, loamy: 0.70, inceptisol: 0.70,
  clay: 0.55, clayey: 0.55, default: 0.70,
};

async function computeLandWeatherMetrics(
  supabase: SupabaseClient,
  runId: string,
  landId: string,
  tenantId: string,
  locationKey: string,
  current: CurrentWeatherData,
  rounded: { lat: number; lon: number },
  rain24: number,
  methods?: MethodsMap,
  wetnessSeries?: HourlyWetnessInput[],
) {
  try {
    const { data: land } = await supabase.from("lands")
      .select("soil_type, current_crop, area_acres").eq("id", landId).maybeSingle();

    const soilType = (land?.soil_type ?? "default").toLowerCase();
    const registrySoil = (methods?.SOIL_TYPE_EFFECTIVE_RAIN?.params ?? {}) as Record<string, number>;
    const soilFactor = registrySoil[soilType] ?? registrySoil.default
      ?? SOIL_FACTORS[soilType] ?? SOIL_FACTORS.default;
    const cropCode = land?.current_crop ?? "DEFAULT";

    // D3 FIX: no fabricated diurnal range here either.
    const dailyMax = Number.isFinite(current.temp_max as number) ? (current.temp_max as number) : undefined;
    const dailyMin = Number.isFinite(current.temp_min as number) ? (current.temp_min as number) : undefined;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

    // Crop-aware indices from the module that was previously dead code.
    const indices = calculateAllAgriculturalIndices({
      temperature_c: current.temp,
      temperature_max_c: dailyMax,
      temperature_min_c: dailyMin,
      humidity_percent: current.humidity,
      cloud_cover_percent: current.clouds,
      sunrise_timestamp: current.sunrise,
      sunset_timestamp: current.sunset,
      rainfall_24h_mm: rain24,
      latitude: rounded.lat,
      day_of_year: dayOfYear,
      crop_code: cropCode,
      wind_speed_ms: current.wind_speed,
      pressure_hpa: current.pressure,
      hourly_series: wetnessSeries,
    }, methods);

    const effectiveRainfall = rain24 * soilFactor;
    const runoffLoss = rain24 - effectiveRainfall;
    const et0 = indices.et0_mm; // null when daily Tmax/Tmin were unavailable
    const waterDeficit = et0 === null ? null : Math.max(0, et0 - effectiveRainfall);

    let cropStress = "NONE";
    if (current.temp > 40) cropStress = "SEVERE_HEAT";
    else if (current.temp > 38) cropStress = "HEAT";
    else if (current.temp < 5) cropStress = "FROST";
    else if ((waterDeficit ?? 0) > 5) cropStress = "WATER_STRESS";

    let waterBalance = "BALANCED";
    if (et0 !== null && effectiveRainfall > et0 * 1.5) waterBalance = "SURPLUS";
    else if ((waterDeficit ?? 0) > 3) waterBalance = "DEFICIT";

    // FIX G (2026-08-22): gdd_daily is a MIRROR of the canonical land_gdd_daily
    // table, never a second computation. `indices.gdd` used a DEFAULT crop base
    // temperature and a collapsed diurnal range, which is why all 409 rows read
    // 0.00. The two tables must never disagree; when the canonical row does not
    // exist yet we write NULL (unknown), not 0 (a false measurement).
    const metricDate = istDate();
    let canonicalGddDaily: number | null = null;
    try {
      const { data: gddRow } = await supabase.from("land_gdd_daily")
        .select("daily_gdd")
        .eq("land_id", landId)
        .eq("obs_date", metricDate)
        .maybeSingle();
      canonicalGddDaily = gddRow?.daily_gdd == null ? null : Number(gddRow.daily_gdd);
    } catch (_e) {
      canonicalGddDaily = null;
    }

    const { error } = await supabase.from("land_weather_state").upsert({
      land_id: landId,
      tenant_id: tenantId,
      cell_key: locationKey,
      metric_date: metricDate,
      temperature_c: current.temp,
      humidity_percent: current.humidity,
      wind_speed_kmh: current.wind_speed * 3.6,
      total_rainfall_mm: rain24,
      effective_rainfall_mm: Math.round(effectiveRainfall * 10) / 10,
      runoff_loss_mm: Math.round(runoffLoss * 10) / 10,
      water_deficit_mm: waterDeficit === null ? null : Math.round(waterDeficit * 10) / 10,
      soil_type_used: soilType,
      irrigation_needed: indices.irrigation_need?.needs_irrigation ?? null,
      irrigation_urgency: indices.irrigation_need?.priority ?? null,
      gdd_daily: canonicalGddDaily, // FIX G: mirror of land_gdd_daily.daily_gdd
      et0_mm: et0,
      et0_method: indices.et0_method,
      u_std_et0: indices.et0_u_std,
      lwd_est_hours: indices.leaf_wetness_hours,
      vpd_kpa: indices.vpd_kpa,
      disease_risk_score: indices.disease_risk.score,
      disease_risk_level: indices.disease_risk.level,
      crop_stress_level: cropStress,
      water_balance_status: waterBalance,
      computed_at: new Date().toISOString(),
    }, { onConflict: "land_id,metric_date" });

    if (error) log(runId, "warn", "land_metrics_failed", { error: error.message });
    else log(runId, "info", "land_metrics_computed", {
      land_id: landId, et0, method: indices.et0_method, deficit: waterDeficit,
      stress: cropStress, qc_flags: indices.qc_flags,
    });
  } catch (e) {
    log(runId, "warn", "land_metrics_exception", { error: String(e) });
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request): Promise<Response> => {
  const runId = RUN_ID();
  const startedAt = Date.now();

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const imdLog: (l: string, e: string, d?: Record<string, unknown>) => void =
      (l, e, d) => log(runId, l as "info" | "warn" | "error", e, d);
    const imdCreds = getImdCredentials(imdLog);
    const tomorrowIoApiKey = Deno.env.get("TOMORROW_IO_API_KEY");
    const openWeatherApiKey = Deno.env.get("OPENWEATHER_API_KEY") ?? Deno.env.get("WEATHER_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing Supabase configuration");

    // FIX: the previous build threw if TOMORROW_IO_API_KEY was absent, BEFORE
    // trying any provider - so a rotated Tomorrow.io key took down the whole
    // endpoint even with IMD and OpenWeather healthy.
    if (!imdCreds && !openWeatherApiKey && !tomorrowIoApiKey) {
      throw new Error("No weather API keys configured (need IMD_API_KEY, OPENWEATHER_API_KEY or TOMORROW_IO_API_KEY)");
    }

    const tenant = await resolveTenantFromRequest(req, supabaseUrl, supabaseServiceKey);
    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found for this domain" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const blocked = await withTenantBlocker(tenant, corsHeaders);
    if (blocked) return blocked;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    let userId: string | undefined;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        userId = data.user?.id;
      } catch { /* anonymous is fine */ }
    }

    const body = await req.json() as WeatherRequest;
    let { action, lat, lon, landId } = body;
    let landData: { id: string; name: string; farmer_id: string } | null = null;

    // ---- MODEL B: refresh every cell containing an active land ----------------
    if (action === "refresh_land_cells") {
      const { data: rows, error } = await supabase
        .from("lands").select("cell_key, center_lat, center_lon")
        .eq("is_active", true).not("cell_key", "is", null);
      if (error) throw new Error(`land cell read failed: ${error.message}`);

      const unique = new Map<string, { lat: number; lon: number }>();
      for (const r of rows ?? []) {
        if (!unique.has(r.cell_key as string)) {
          unique.set(r.cell_key as string, { lat: Number(r.center_lat), lon: Number(r.center_lon) });
        }
      }

      const results: Array<{ cell: string; ok: boolean; skipped?: boolean }> = [];
      for (const [cellKey, c] of unique) {
        try {
          const r = roundCoordinates(c.lat, c.lon);
          const fresh = await checkCache(supabase, r.key, "all", runId);
          if (fresh && !fresh.stale) { results.push({ cell: cellKey, ok: true, skipped: true }); continue; }
          const fwd: Record<string, string> = { "Content-Type": "application/json" };
          for (const h of ["authorization", "apikey", "x-tenant-id", "x-client-domain"]) {
            const v = req.headers.get(h);
            if (v) fwd[h] = v;
          }
          const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/weather`;
          if (!fwd["authorization"]) {
            fwd["authorization"] = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
          }
          const res = await fetch(selfUrl, {
            method: "POST",
            headers: fwd,
            body: JSON.stringify({ action: "all", lat: c.lat, lon: c.lon }),
          });
          if (!res.ok) {
            log(runId, "warn", "land_cell_refresh_failed", {
              cell: cellKey, status: res.status, body: (await res.text()).slice(0, 200),
            });
          }
          results.push({ cell: cellKey, ok: res.ok });
        } catch (e) {
          log(runId, "warn", "land_cell_refresh_exception", { cell: cellKey, error: String(e) });
          results.push({ cell: cellKey, ok: false });
        }
      }

      log(runId, "info", "land_cells_refreshed", {
        cells: unique.size, ok: results.filter((r) => r.ok).length,
        skipped_fresh: results.filter((r) => r.skipped).length,
      });
      return new Response(JSON.stringify({
        action, cells: unique.size, results, timestamp: new Date().toISOString(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- MODEL B: derive per-land agronomic state for ALL active lands -------
    if (action === "derive_land_state") {
      const { data: allLands, error } = await supabase
        .from("lands").select("id, tenant_id, cell_key, center_lat, center_lon")
        .eq("is_active", true).not("cell_key", "is", null);
      if (error) throw new Error(`lands read failed: ${error.message}`);

      let derived = 0, skipped = 0;
      for (const land of allLands ?? []) {
        const cell = await checkCache(supabase, land.cell_key as string, "current", runId, true);
        if (!cell?.current) { skipped++; continue; }
        try {
          await computeLandWeatherMetrics(
            supabase, runId, land.id as string, land.tenant_id as string,
            land.cell_key as string, cell.current,
            { lat: Number(land.center_lat), lon: Number(land.center_lon) },
            (cell.current as any).rain_24h ?? cell.current.rain_1h ?? 0,
          );
          derived++;
        } catch (e) {
          log(runId, "warn", "land_derivation_failed", { land_id: land.id, error: String(e) });
          skipped++;
        }
      }

      // D9/D10: scientific daily derive + observation-spine dual-write.
      // Runs AFTER the legacy metric loop so land_weather_state already has
      // its legacy columns; this fills the new scientific columns, writes
      // env_observations + lineage, and maintains risk_episodes.
      let spine: unknown = null;
      try {
        const methods = await getSciMethods(supabase, runId);
        spine = (await runDailyDerive(supabase, runId, methods, log)).summary;
      } catch (e) {
        log(runId, "warn", "daily_derive_failed", { error: String(e) });
      }

      log(runId, "info", "land_state_derived", { derived, skipped });
      return new Response(JSON.stringify({
        action, derived, skipped, spine, timestamp: new Date().toISOString(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Scientific derive only (single land or all) ------------------------
    if (action === "daily_derive") {
      const methods = await getSciMethods(supabase, runId);
      const { summary } = await runDailyDerive(supabase, runId, methods, log, landId ?? undefined);
      return new Response(JSON.stringify({
        action, ...summary, timestamp: new Date().toISOString(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    // ---- MODEL B (read): latest derived agronomy for ONE land ---------------
    // Read-only projection of land_weather_state. The browser cannot read this
    // table directly (RLS is auth.uid()-based while the app uses custom
    // header auth), so the UI must come through here. NEVER substitute a
    // nearby cell: agronomy is land-scoped by definition.
    if (action === "land_state") {
      if (!landId) throw new Error("landId is required for land_state");

      const { data: land } = await supabase.from("lands")
        .select("id, name, current_crop, area_acres, soil_type")
        .eq("id", landId).eq("tenant_id", tenant.id).maybeSingle();
      if (!land) {
        return new Response(JSON.stringify({ error: "Land not found for this tenant" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: state, error: stateErr } = await supabase.from("land_weather_state")
        .select("*")
        .eq("land_id", landId).eq("tenant_id", tenant.id)
        .order("metric_date", { ascending: false })
        .limit(1).maybeSingle();
      if (stateErr) log(runId, "warn", "land_state_read_failed", { error: stateErr.message });

      log(runId, "info", "land_state_served", { land_id: landId, has_state: !!state });
      return new Response(JSON.stringify({
        action, land, state: state ?? null, timestamp: new Date().toISOString(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }



    // ---- land resolution ---------------------------------------------------
    if (landId || action === "land") {
      if (!landId) throw new Error("landId is required for land-based weather request");

      const { data: land, error } = await supabase.from("lands")
        .select("id, name, center_lat, center_lon, farmer_id, boundary_polygon_old")
        .eq("id", landId).maybeSingle();
      if (error || !land) throw new Error(`Land not found: ${landId}`);

      if (!land.center_lat || !land.center_lon) {
        const ring = (land as any).boundary_polygon_old?.coordinates?.[0];
        if (ring?.length) {
          lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length;
          lon = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length;
          log(runId, "warn", "land_centroid_from_polygon", { land_id: landId });
        } else {
          throw new Error(`Land ${land.name} has no coordinates or boundary polygon`);
        }
      } else {
        lat = parseFloat(land.center_lat as unknown as string);
        lon = parseFloat(land.center_lon as unknown as string);
      }
      landData = { id: land.id, name: land.name, farmer_id: land.farmer_id };
      if (action === "land") action = "all";
    }

    if (lat === undefined || lon === undefined || lat === null || lon === null) {
      throw new Error("Latitude and longitude are required (or provide landId)");
    }

    const rounded = roundCoordinates(lat, lon);
    log(runId, "info", "request_start", {
      tenant: tenant.id, action, cell: rounded.key, land_id: landData?.id ?? null,
    });

    // ---- STEP 1: cache -----------------------------------------------------
    const cached = await checkCache(supabase, rounded.key, action, runId);
    if (cached) {
      // MODEL B: derivation must not depend on a cache miss.
      if (landData?.id && cached.current) {
        await computeLandWeatherMetrics(
          supabase, runId, landData.id, tenant.id, rounded.key,
          cached.current, rounded,
          (cached.current as any).rain_24h ?? cached.current.rain_1h ?? 0,
        );
      }
      return new Response(JSON.stringify({
        ...cached,
        tenant: { id: tenant.id, name: tenant.name },
        cached: true,
        provider: cached.current?.provider ?? "Cache",
        stale: cached.stale ?? false,
        cell: rounded.key,
        land: landData ? { id: landData.id, name: landData.name } : undefined,
        timestamp: new Date().toISOString(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- STEP 2: rate limit -------------------------------------------------
    const rateLimit = await checkRateLimit(rounded.key, "weather", {
      maxRequests: CONFIG.RATE_LIMIT.maxRequests,
      windowMs: CONFIG.RATE_LIMIT.windowMs,
    });
    if (!rateLimit.allowed) {
      log(runId, "warn", "rate_limited", { cell: rounded.key });
      const stale = await checkCache(supabase, rounded.key, action, runId, true);
      if (stale) {
        return new Response(JSON.stringify({
          ...stale, tenant: { id: tenant.id, name: tenant.name },
          cached: true, stale: true,
          warning: "Rate limit reached for this area. Showing recent data.",
          timestamp: new Date().toISOString(),
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        error: "Rate limit exceeded for this location.",
        resetTime: new Date(rateLimit.resetTime).toISOString(),
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- STEP 3: provider chain --------------------------------------------
    let current: CurrentWeatherData | undefined;
    let forecast: DailyForecast[] | undefined;
    let hourly: ForecastItem[] | undefined;
    let dataProvider = "unknown";
    const attempts: ProviderAttempt[] = [];

    const needCurrent = action === "current" || action === "all" || action === "agricultural";
    const needForecast = action === "forecast" || action === "all" || action === "agricultural";

    const budgets = {
      IMD: imdCreds ? await getUsedToday(supabase, "IMD") : Infinity,
      OpenWeather: openWeatherApiKey ? await getUsedToday(supabase, "OpenWeather") : Infinity,
      "Tomorrow.io": tomorrowIoApiKey ? await getUsedToday(supabase, "Tomorrow.io") : Infinity,
    };

    // -- TIER 1: IMD (authoritative for India, effectively unmetered) --------
    if (imdCreds && budgets.IMD < CONFIG.DAILY_BUDGET.IMD) {
      if (needCurrent) {
        const t0 = Date.now();
        try {
          const c = await fetchImdCurrent(rounded.lat, rounded.lon, imdCreds, supabase, imdLog);
          if (validateCurrent(c as CurrentWeatherData, runId)) {
            current = c as CurrentWeatherData;
            dataProvider = "IMD";
          }
          attempts.push({ provider: "IMD", capability: "current", ok: !!current, ms: Date.now() - t0 });
          await logCall(supabase, runId, "IMD", "current", !!current, Date.now() - t0);
        } catch (e) {
          attempts.push({ provider: "IMD", capability: "current", ok: false, ms: Date.now() - t0, error: String(e) });
          await logCall(supabase, runId, "IMD", "current", false, Date.now() - t0, String(e));
          log(runId, "warn", "imd_current_failed", { error: String(e) });
        }
      }
      if (needForecast) {
        const t0 = Date.now();
        try {
          const f = await fetchImdForecast(rounded.lat, rounded.lon, imdCreds, supabase, imdLog);
          if (f.forecast.length) {
            forecast = f.forecast as DailyForecast[];
            if (dataProvider === "unknown") dataProvider = "IMD";
          }
          attempts.push({ provider: "IMD", capability: "daily", ok: !!forecast, ms: Date.now() - t0 });
          await logCall(supabase, runId, "IMD", "forecast", !!forecast, Date.now() - t0);
        } catch (e) {
          attempts.push({ provider: "IMD", capability: "daily", ok: false, ms: Date.now() - t0, error: String(e) });
          await logCall(supabase, runId, "IMD", "forecast", false, Date.now() - t0, String(e));
          log(runId, "warn", "imd_forecast_failed", { error: String(e) });
        }
      }
    }

    // -- TIER 2: OpenWeather (fills gaps + ALWAYS supplies hourly) -----------
    const owNeeded = (needCurrent && !current) || (needForecast && (!forecast || !hourly));
    if (owNeeded && openWeatherApiKey && budgets.OpenWeather < CONFIG.DAILY_BUDGET.OpenWeather) {
      if (needCurrent && !current) {
        const t0 = Date.now();
        try {
          const c = await fetchOpenWeatherCurrent(rounded.lat, rounded.lon, openWeatherApiKey, runId);
          if (validateCurrent(c, runId)) {
            current = c;
            dataProvider = dataProvider === "IMD" ? "IMD+OpenWeather" : "OpenWeather";
          }
          attempts.push({ provider: "OpenWeather", capability: "current", ok: !!current, ms: Date.now() - t0 });
          await logCall(supabase, runId, "OpenWeather", "current", !!current, Date.now() - t0);
        } catch (e) {
          attempts.push({ provider: "OpenWeather", capability: "current", ok: false, ms: Date.now() - t0, error: String(e) });
          await logCall(supabase, runId, "OpenWeather", "current", false, Date.now() - t0, String(e));
        }
      }
      if (needForecast && (!forecast || !hourly)) {
        const t0 = Date.now();
        try {
          const f = await fetchOpenWeatherForecast(rounded.lat, rounded.lon, openWeatherApiKey, runId);
          if (!forecast) forecast = f.forecast;
          hourly = f.hourly; // IMD has no hourly product - OW always supplies it
          if (dataProvider === "unknown") dataProvider = "OpenWeather";
          else if (dataProvider === "IMD") dataProvider = "IMD+OpenWeather";
          attempts.push({ provider: "OpenWeather", capability: "forecast", ok: true, ms: Date.now() - t0 });
          await logCall(supabase, runId, "OpenWeather", "forecast", true, Date.now() - t0);
        } catch (e) {
          attempts.push({ provider: "OpenWeather", capability: "forecast", ok: false, ms: Date.now() - t0, error: String(e) });
          await logCall(supabase, runId, "OpenWeather", "forecast", false, Date.now() - t0, String(e));
        }
      }
    }

    // -- TIER 3: Tomorrow.io (true last resort) ------------------------------
    const tioNeeded = (needCurrent && !current) || (needForecast && (!forecast || !hourly));
    if (tioNeeded && tomorrowIoApiKey && budgets["Tomorrow.io"] < CONFIG.DAILY_BUDGET["Tomorrow.io"]) {
      if (needCurrent && !current) {
        const t0 = Date.now();
        try {
          const c = await fetchTomorrowIoRealtime(rounded.lat, rounded.lon, tomorrowIoApiKey, runId);
          if (validateCurrent(c, runId)) {
            current = c;
            dataProvider = dataProvider === "unknown" ? "Tomorrow.io" : `${dataProvider}+Tomorrow.io`;
          }
          attempts.push({ provider: "Tomorrow.io", capability: "current", ok: !!current, ms: Date.now() - t0 });
          await logCall(supabase, runId, "Tomorrow.io", "realtime", !!current, Date.now() - t0);
        } catch (e) {
          attempts.push({ provider: "Tomorrow.io", capability: "current", ok: false, ms: Date.now() - t0, error: String(e) });
          await logCall(supabase, runId, "Tomorrow.io", "realtime", false, Date.now() - t0, String(e));
        }
      }
      if (needForecast && (!forecast || !hourly)) {
        const t0 = Date.now();
        try {
          const f = await fetchTomorrowIoForecast(rounded.lat, rounded.lon, tomorrowIoApiKey, runId);
          if (!forecast) forecast = f.forecast;
          if (!hourly) hourly = f.hourly;
          if (dataProvider === "unknown") dataProvider = "Tomorrow.io";
          attempts.push({ provider: "Tomorrow.io", capability: "forecast", ok: true, ms: Date.now() - t0 });
          await logCall(supabase, runId, "Tomorrow.io", "forecast", true, Date.now() - t0);
        } catch (e) {
          attempts.push({ provider: "Tomorrow.io", capability: "forecast", ok: false, ms: Date.now() - t0, error: String(e) });
          await logCall(supabase, runId, "Tomorrow.io", "forecast", false, Date.now() - t0, String(e));
        }
      }
    }

    // -- ENRICHMENT: Tomorrow.io fills UV / dew point the others lack --------
    let enrichment: { enriched: boolean; fields: string[] } = { enriched: false, fields: [] };
    if (current && tomorrowIoApiKey && dataProvider !== "Tomorrow.io") {
      enrichment = await enrichWithTomorrowIo(current, rounded.lat, rounded.lon, tomorrowIoApiKey, supabase, runId);
      if (enrichment.enriched) dataProvider = `${dataProvider}+TIO-enriched`;
    }

    // -- D11: FORECAST ENSEMBLE (second opinion, best-effort, non-serving) ----
    // Provider priority is UNCHANGED: the serving forecast stays whatever the
    // chain above produced. This only fetches Tomorrow.io as a second opinion
    // for cross-provider agreement scoring in the observation spine.
    let ensembleForecast: DailyForecast[] | undefined;
    if (
      needForecast && forecast && !dataProvider.includes("Tomorrow.io") &&
      tomorrowIoApiKey && budgets["Tomorrow.io"] + 1 < CONFIG.DAILY_BUDGET["Tomorrow.io"]
    ) {
      const t0 = Date.now();
      try {
        const f = await fetchTomorrowIoForecast(rounded.lat, rounded.lon, tomorrowIoApiKey, runId);
        ensembleForecast = f.forecast;
        await logCall(supabase, runId, "Tomorrow.io", "forecast_ensemble", true, Date.now() - t0);
      } catch (e) {
        await logCall(supabase, runId, "Tomorrow.io", "forecast_ensemble", false, Date.now() - t0, String(e));
        log(runId, "warn", "ensemble_fetch_failed", { error: String(e) });
      }
    }



    log(runId, "info", "provider_chain_complete", {
      provider: dataProvider,
      attempts: attempts.map((a) => `${a.provider}:${a.capability}:${a.ok ? "ok" : "fail"}:${a.ms}ms`),
      enrichment: enrichment.fields,
      imd_cache: imdCacheStatus(),
    });

    // -- All providers failed -> stale cache rather than a fabricated reading -
    if (needCurrent && !current) {
      const stale = await checkCache(supabase, rounded.key, action, runId, true);
      if (stale) {
        log(runId, "warn", "all_providers_failed_serving_stale", { cell: rounded.key });
        return new Response(JSON.stringify({
          ...stale, tenant: { id: tenant.id, name: tenant.name },
          cached: true, stale: true,
          warning: "Live weather unavailable. Showing most recent data.",
          timestamp: new Date().toISOString(),
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        error: "Weather service temporarily unavailable.",
        details: attempts.map((a) => `${a.provider}:${a.capability}:${a.error ?? "failed"}`),
        timestamp: new Date().toISOString(),
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- STEP 4: persist ----------------------------------------------------
    if (current) {
      current.provider = dataProvider.split("+")[0];
      await cacheWeatherData(
        supabase, runId, rounded.key, rounded, current, forecast, hourly,
        tenant.id, userId ?? landData?.farmer_id, landData?.id,
      );
    }

    // ---- STEP 4b: D11 ensemble persistence + forecast spine (best-effort) ---
    if (forecast?.length && current) {
      try {
        if (ensembleForecast?.length) {
          const ensembleRows = buildDailyForecastRows(
            ensembleForecast, "Tomorrow.io", rounded.key, rounded, tenant.id, current, new Date(),
          );
          const { error: ensErr } = await supabase.from("weather_forecasts").upsert(ensembleRows, {
            onConflict: "location_key,forecast_type,forecast_time,issued_at,data_source",
            ignoreDuplicates: true,
          });
          if (ensErr) log(runId, "warn", "ensemble_forecast_insert_failed", { error: ensErr.message });
          else log(runId, "info", "ensemble_forecasts_cached", { count: ensembleRows.length });
        }

        const methods = await getSciMethods(supabase, runId);
        await writeForecastSpine(
          supabase, runId, rounded.key,
          { provider: dataProvider.split("+")[0], days: forecast },
          ensembleForecast?.length ? { provider: "Tomorrow.io", days: ensembleForecast } : null,
          methods,
        );
      } catch (e) {
        log(runId, "warn", "forecast_spine_stage_failed", { error: String(e) });
      }
    }



    // ---- STEP 5: respond ----------------------------------------------------
    const response: Record<string, unknown> = {
      tenant: { id: tenant.id, name: tenant.name },
      cached: false,
      provider: dataProvider,
      cell: rounded.key,
      duration_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
    if (landData) response.land = { id: landData.id, name: landData.name };
    if (needCurrent) response.current = current;
    if (needForecast) { response.forecast = forecast; response.hourly = hourly; }

    log(runId, "info", "request_complete", {
      provider: dataProvider, duration_ms: Date.now() - startedAt, cell: rounded.key,
    });

    return new Response(JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    log(runId, "error", "request_failed", {
      error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
      run_id: runId,
      timestamp: new Date().toISOString(),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

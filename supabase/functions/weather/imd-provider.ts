/**
 * supabase/functions/weather/imd-provider.ts
 * ===========================================================================
 * IMD (India Meteorological Department) provider for the existing `weather`
 * edge function. ADDITIVE ONLY — nothing in index.ts is replaced, and the
 * OpenWeather / Tomorrow.io paths are untouched.
 *
 * WHY A SEPARATE MODULE
 * index.ts is 1,598 lines and working. Adding ~400 lines of IMD parsing inline
 * would make it unreviewable. This module exposes exactly two functions that
 * return the SAME shapes index.ts already uses (CurrentWeatherData /
 * DailyForecast), so the call site changes by ~15 lines.
 *
 * ---------------------------------------------------------------------------
 * IMD COORDINATE LOOKUP — VERIFIED AGAINST THE OFFICIAL API DOCUMENTATION
 * ---------------------------------------------------------------------------
 * No IMD weather endpoint accepts an arbitrary lat/lon. Only `sunmoon` does.
 * However `cityforecastloc` returns Latitude/Longitude for EVERY station in a
 * single call, and `aws_data` does the same. We therefore:
 *      1. fetch the station catalogue once (cached in memory, 6h TTL)
 *      2. resolve the farmer's lat/lon to the nearest station by haversine
 *      3. reject the match if it is beyond the acceptance radius
 * This gives coordinate-based lookup with one catalogue call per 6 hours,
 * and the resolved distance is returned so the Decision Brain can discount a
 * far-away anchor instead of trusting it blindly.
 *
 * ---------------------------------------------------------------------------
 * CAPABILITY ROUTING (why IMD is primary but not exclusive)
 * ---------------------------------------------------------------------------
 *   current weather : IMD ✅ (current_wx + cityforecastloc)  -> OW -> Tomorrow
 *   daily forecast  : IMD ✅ (cityforecastloc, 7 days)       -> OW -> Tomorrow
 *   hourly forecast : IMD ❌ NOT PUBLISHED on the free tier  -> OW -> Tomorrow
 *
 * IMD is the authoritative Indian source and legally the one that matters for
 * warnings, but it has no hourly product. Routing per-capability (rather than
 * all-or-nothing) means we use IMD wherever it is authoritative and fall back
 * only for what it genuinely cannot supply.
 *
 * ---------------------------------------------------------------------------
 * UNIT CONTRACT — READ BEFORE EDITING
 * ---------------------------------------------------------------------------
 * index.ts stores wind as `current.wind_speed * 3.6`, i.e. it expects METRES
 * PER SECOND. IMD publishes KMPH. Every wind value here is divided by 3.6 on
 * the way out. Getting this wrong inflates every wind reading by 3.6× and
 * would silently break the G5 spray-safety gate.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  getImdToken,
  invalidateImdToken,
  imdAuthHeaders,
  type ImdCredentials,
} from "./imd-token.ts";

type LogFn = (level: string, event: string, data?: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Types mirrored from index.ts (kept structurally identical on purpose)
// ---------------------------------------------------------------------------


export interface ImdCurrentWeather {
  temp: number; feels_like: number; temp_min: number; temp_max: number;
  humidity: number; pressure: number;
  wind_speed: number;          // m/s — converted from IMD kmph
  wind_deg: number;
  description: string; main: string; icon: string;
  clouds: number; visibility: number;
  sunrise: number; sunset: number;
  location: string; dt: number;
  provider: string;
  uv_index: number; dew_point: number;
  rain_1h: number; rain_3h: number;
  rain_24h: number;            // IMD publishes a REAL 24h total (0830→0830 IST)
  imd_station_code?: string;
  imd_station_name?: string;
  imd_distance_km?: number;
}

export interface ImdDailyForecast {
  dt: number;
  temp: { day: number; min: number; max: number; night: number; eve: number; morn: number };
  humidity: number; wind_speed: number;
  weather: Array<{ description: string; main: string; icon: string }>;
  pop: number; rain: number; uv_index: number; moon_phase: number;
  pop_source: string;          // provenance for the derived probability
}

const IMD_BASE = "https://api.imd.gov.in/api/v1";
const HTTP_TIMEOUT_MS = 15000;
const STATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // 6 hours
const MAX_STATION_DISTANCE_KM = 150;                // IMD city stations are sparse
const MAX_AWS_DISTANCE_KM = 60;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const NULL_TOKENS = new Set(["", "na", "n/a", "nan", "null", "-", "--", "nil", "*"]);

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (NULL_TOKENS.has(s.toLowerCase())) return null;
  const c = s.replace(/[^0-9.+-]/g, "");
  if (!c || c === "-" || c === "+") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || NULL_TOKENS.has(s.toLowerCase()) ? null : s;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** IST = UTC+5:30, fixed year-round. Returns a unix timestamp (seconds). */
function istToUnix(dateIso: string | null, hhmm: string | null): number {
  if (!dateIso) return 0;
  const t = normalizeTime(hhmm) ?? "00:00:00";
  const asUtc = Date.parse(`${dateIso}T${t}Z`);
  if (Number.isNaN(asUtc)) return 0;
  return Math.floor((asUtc - 330 * 60_000) / 1000);
}

function normalizeTime(raw: string | null): string | null {
  const s = str(raw);
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1].slice(0, 2)}:${m[1].slice(2, 4)}:00`;
  return null;
}

async function imdFetch(path: string, apiKey: string): Promise<unknown> {
  const url = new URL(`${IMD_BASE}/${path}`);
  url.searchParams.set("api_key", apiKey);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`IMD ${path} error: ${res.status} - ${body.slice(0, 200)}`);
    }
    const text = await res.text();
    if (!text.trim()) throw new Error(`IMD ${path} returned an empty body`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function asArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
    if (Object.keys(o).length) return [o];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Weather code / text interpretation
// ---------------------------------------------------------------------------

/** IMD weather codes 01–99 (WMO 4677 style) condensed to display strings. */
function decodeImdWeather(code: number | null): { main: string; description: string; icon: string } {
  if (code === null) return { main: "Unknown", description: "unknown", icon: "01d" };
  if (code >= 95) return { main: "Thunderstorm", description: "thunderstorm", icon: "11d" };
  if (code >= 91) return { main: "Rain", description: "rain with recent thunderstorm", icon: "10d" };
  if (code >= 89) return { main: "Hail", description: "hail shower", icon: "13d" };
  if (code >= 85) return { main: "Snow", description: "snow shower", icon: "13d" };
  if (code >= 80) return { main: "Rain", description: "rain shower", icon: "09d" };
  if (code >= 70) return { main: "Snow", description: "snowfall", icon: "13d" };
  if (code >= 60) return { main: "Rain", description: "rain", icon: "10d" };
  if (code >= 50) return { main: "Drizzle", description: "drizzle", icon: "09d" };
  if (code >= 40) return { main: "Fog", description: "fog", icon: "50d" };
  if (code >= 30) return { main: "Dust", description: "duststorm", icon: "50d" };
  if (code === 29 || code === 17) return { main: "Thunderstorm", description: "thunderstorm", icon: "11d" };
  if (code === 28) return { main: "Fog", description: "fog", icon: "50d" };
  if (code === 27) return { main: "Hail", description: "hail shower", icon: "13d" };
  if (code === 25 || code === 26) return { main: "Rain", description: "shower", icon: "09d" };
  if (code >= 20) return { main: "Drizzle", description: "drizzle", icon: "09d" };
  if (code >= 18) return { main: "Squall", description: "squall", icon: "50d" };
  if (code >= 13) return { main: "Rain", description: "precipitation nearby", icon: "10d" };
  if (code >= 10) return { main: "Mist", description: "mist", icon: "50d" };
  if (code >= 6) return { main: "Dust", description: "dust in suspension", icon: "50d" };
  if (code >= 4) return { main: "Haze", description: "haze", icon: "50d" };
  if (code >= 1) return { main: "Clouds", description: "cloud development", icon: "03d" };
  return { main: "Clear", description: "clear sky", icon: "01d" };
}

/**
 * IMD daily forecasts are free text ("Rain", "Thunderstorm with hail").
 * There is no published probability, so we derive one — CONSERVATIVELY.
 *
 * SAFETY DIRECTION: we err HIGH for precipitation. A too-high rain probability
 * makes the G5 spray gate block a spray (farmer waits a day). A too-low one
 * lets a farmer spray before rain and lose the chemical and the money. When
 * uncertain, the harmless error is the one we choose.
 *
 * Provenance is returned as `pop_source` so nothing downstream mistakes this
 * for a measured probability.
 */
function popFromForecastText(text: string | null): { pop: number; source: string } {
  if (!text) return { pop: 0, source: "imd_text_absent" };
  const t = text.toLowerCase();
  if (/heavy rain|very heavy|extremely heavy/.test(t)) return { pop: 0.90, source: "imd_text_derived" };
  if (/thunder|lightning|hail|squall/.test(t))          return { pop: 0.75, source: "imd_text_derived" };
  if (/\brain\b|shower/.test(t))                        return { pop: 0.70, source: "imd_text_derived" };
  if (/drizzle/.test(t))                                return { pop: 0.50, source: "imd_text_derived" };
  if (/overcast|generally cloudy/.test(t))              return { pop: 0.30, source: "imd_text_derived" };
  if (/partly cloudy|cloud/.test(t))                    return { pop: 0.15, source: "imd_text_derived" };
  if (/mist|fog|haze/.test(t))                          return { pop: 0.10, source: "imd_text_derived" };
  if (/clear|sunny|fair|dry/.test(t))                   return { pop: 0.05, source: "imd_text_derived" };
  return { pop: 0.20, source: "imd_text_unclassified" };
}

/** Magnus-Tetens — IMD current_wx does not publish dew point. */
function dewPoint(tempC: number, rh: number): number {
  const r = Math.min(100, Math.max(1, rh));
  const a = 17.27, b = 237.7;
  const g = (a * tempC) / (b + tempC) + Math.log(r / 100);
  return Math.round(((b * g) / (a - g)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Station catalogue (in-memory, 6h TTL)
// ---------------------------------------------------------------------------

interface StationRow { code: string; name: string; lat: number; lon: number; raw: Record<string, unknown>; }

let cityCache: { at: number; rows: StationRow[] } | null = null;
let awsCache: { at: number; rows: StationRow[] } | null = null;

function fresh<T>(c: { at: number; rows: T[] } | null): boolean {
  return !!c && Date.now() - c.at < STATION_CACHE_TTL_MS && c.rows.length > 0;
}

async function getCityStations(apiKey: string): Promise<StationRow[]> {
  if (fresh(cityCache)) return cityCache!.rows;
  const rows = asArray(await imdFetch("cityforecastloc", apiKey));
  const out: StationRow[] = [];
  for (const r of rows) {
    const lat = num(r["Latitude"]), lon = num(r["Longitude"]);
    const code = str(r["Station_Code"]);
    if (!code || lat === null || lon === null) continue;
    if (lat < 6 || lat > 38 || lon < 66 || lon > 98) continue;   // India bbox guard
    out.push({ code, name: str(r["Station_Name"]) ?? code, lat, lon, raw: r });
  }
  cityCache = { at: Date.now(), rows: out };
  console.log(`🇮🇳 [IMD] City station catalogue cached: ${out.length} stations`);
  return out;
}

async function getAwsStations(apiKey: string, stateId?: number): Promise<StationRow[]> {
  if (fresh(awsCache)) return awsCache!.rows;
  const path = stateId ? `aws_data?sid=${stateId}` : "aws_data";
  const rows = asArray(await imdFetch(path, apiKey));
  const out: StationRow[] = [];
  for (const r of rows) {
    const lat = num(r["Latitude"]), lon = num(r["Longitude"]);
    const code = str(r["CALL_SIGN"]) ?? str(r["ID"]);
    if (!code || lat === null || lon === null) continue;
    out.push({ code, name: str(r["STATION"]) ?? code, lat, lon, raw: r });
  }
  awsCache = { at: Date.now(), rows: out };
  return out;
}

function nearest(lat: number, lon: number, rows: StationRow[], maxKm: number) {
  let best: StationRow | null = null, bestKm = Infinity;
  for (const s of rows) {
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestKm) { bestKm = d; best = s; }
  }
  if (!best || bestKm > maxKm) return null;
  return { station: best, distanceKm: Math.round(bestKm * 10) / 10 };
}

/** Exposed for diagnostics / warm-up. */
export function imdCacheStatus() {
  return {
    city_stations: cityCache?.rows.length ?? 0,
    aws_stations: awsCache?.rows.length ?? 0,
    city_age_min: cityCache ? Math.round((Date.now() - cityCache.at) / 60000) : null,
  };
}

// ---------------------------------------------------------------------------
// PUBLIC API 1 — current weather by lat/lon
// ---------------------------------------------------------------------------

export async function fetchImdCurrent(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<ImdCurrentWeather> {
  const stations = await getCityStations(apiKey);
  const match = nearest(lat, lon, stations, MAX_STATION_DISTANCE_KM);
  if (!match) throw new Error(`IMD: no station within ${MAX_STATION_DISTANCE_KM}km of ${lat},${lon}`);

  const { station, distanceKm } = match;
  const cf = station.raw;
  console.log(`🇮🇳 [IMD] ${lat},${lon} -> ${station.name} (${station.code}) @ ${distanceKm}km`);

  // cityforecastloc already carries today's actuals; current_wx adds live
  // wind / pressure / weather code. current_wx is best-effort: if the station
  // has no live observation we still return a valid record from cityforecast.
  let live: Record<string, unknown> | null = null;
  try {
    const rows = asArray(await imdFetch(`current_wx?id=${encodeURIComponent(station.code)}`, apiKey));
    live = rows[0] ?? null;
  } catch (e) {
    console.warn(`⚠️ [IMD] current_wx unavailable for ${station.code}: ${(e as Error).message}`);
  }

  const dateIso = str(cf["Date"]);
  const tmax = num(cf["Today_Max_temp"]);
  const tmin = num(cf["Today_Min_temp"]);
  const rh0830 = num(cf["Relative_Humidity_at_0830"]);
  const rh1730 = num(cf["Relative_Humidity_at_1730"]);
  const rain24 = num(cf["Past_24_hrs_Rainfall"]) ?? 0;

  const liveTemp = live ? num(live["Temperature"]) : null;
  const liveHum = live ? num(live["Humidity"]) : null;
  const temp = liveTemp ?? (tmax !== null && tmin !== null ? (tmax + tmin) / 2 : null);
  const humidity = liveHum ?? rh1730 ?? rh0830 ?? 0;

  if (temp === null) throw new Error(`IMD: no usable temperature for station ${station.code}`);

  // Plausibility guard — reject rather than clamp (a clamped value is a lie).
  if (temp < -60 || temp > 60) throw new Error(`IMD: implausible temperature ${temp} at ${station.code}`);

  const windKmph = live ? num(live["Wind Speed"]) ?? 0 : 0;
  const code = live ? num(live["Weather Code"]) : null;
  const decoded = decodeImdWeather(code);
  const octa = live ? num(live["Nebulosity"]) : null;

  // Observation time: current_wx publishes UTC; cityforecast is a date only.
  let dt = Math.floor(Date.now() / 1000);
  if (live) {
    const d = str(live["Date of Observation"]) ?? dateIso;
    const t = normalizeTime(str(live["Time of Observation"]));
    if (d && t) {
      const parsed = Date.parse(`${d}T${t}Z`);       // already UTC — no IST shift
      if (!Number.isNaN(parsed)) dt = Math.floor(parsed / 1000);
    }
  }

  return {
    temp,
    feels_like: temp,                                  // IMD publishes no apparent temp
    temp_min: tmin ?? temp,
    temp_max: tmax ?? temp,
    humidity,
    pressure: (live ? num(live["M.S.L.P"]) : null) ?? 0,
    wind_speed: windKmph / 3.6,                        // ⚠️ kmph -> m/s (index.ts re-multiplies)
    wind_deg: (live ? num(live["Wind Direction"]) : null) ?? 0,  // IMD values are degrees
    description: decoded.description,
    main: decoded.main,
    icon: decoded.icon,
    clouds: octa !== null ? Math.round((octa / 8) * 100) : 0,
    visibility: 10000,                                 // not published; schema default
    sunrise: istToUnix(dateIso, str(cf["Sunrise_time"])),
    sunset: istToUnix(dateIso, str(cf["Sunset_time"])),
    location: `${station.name}, IMD`,
    dt,
    provider: "IMD",
    uv_index: 0,                                       // not published on the free tier
    dew_point: dewPoint(temp, humidity),
    // IMD's rainfall figure is a genuine 0830→0830 IST 24-hour total. It is
    // NOT a 1-hour value — do not copy it into rain_1h.
    rain_1h: 0,
    rain_3h: 0,
    rain_24h: rain24,
    imd_station_code: station.code,
    imd_station_name: station.name,
    imd_distance_km: distanceKm,
  };
}

// ---------------------------------------------------------------------------
// PUBLIC API 2 — 7-day daily forecast by lat/lon
// ---------------------------------------------------------------------------

export async function fetchImdForecast(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<{ forecast: ImdDailyForecast[]; hourly: never[] }> {
  const stations = await getCityStations(apiKey);
  const match = nearest(lat, lon, stations, MAX_STATION_DISTANCE_KM);
  if (!match) throw new Error(`IMD: no station within ${MAX_STATION_DISTANCE_KM}km of ${lat},${lon}`);

  const cf = match.station.raw;
  const dateIso = str(cf["Date"]);
  if (!dateIso) throw new Error(`IMD: forecast record has no date for ${match.station.code}`);

  const baseNoonUtc = istToUnix(dateIso, "12:00") * 1000;
  const humidity = num(cf["Relative_Humidity_at_1730"]) ?? num(cf["Relative_Humidity_at_0830"]) ?? 0;

  const specs = [
    { off: 0, max: cf["Todays_Forecast_Max_Temp"], min: cf["Todays_Forecast_Min_temp"], txt: cf["Todays_Forecast"] },
    { off: 1, max: cf["Day_2_Max_Temp"], min: cf["Day_2_Min_temp"], txt: cf["Day_2_Forecast"] },
    { off: 2, max: cf["Day_3_Max_Temp"], min: cf["Day_3_Min_temp"], txt: cf["Day_3_Forecast"] },
    { off: 3, max: cf["Day_4_Max_Temp"], min: cf["Day_4_Min_temp"], txt: cf["Day_4_Forecast"] },
    { off: 4, max: cf["Day_5_Max_Temp"], min: cf["Day_5_Min_temp"], txt: cf["Day_5_Forecast"] },
    { off: 5, max: cf["Day_6_Max_Temp"], min: cf["Day_6_Min_temp"], txt: cf["Day_6_Forecast"] },
    { off: 6, max: cf["Day_7_Max_Temp"], min: cf["Day_7_Min_temp"], txt: cf["Day_7_Forecast"] },
  ];

  const forecast: ImdDailyForecast[] = [];
  for (const s of specs) {
    const tmax = num(s.max), tmin = num(s.min), text = str(s.txt);
    if (tmax === null && tmin === null && !text) continue;
    if ((tmax !== null && (tmax < -60 || tmax > 60)) || (tmin !== null && (tmin < -60 || tmin > 60))) continue;

    const hi = tmax ?? tmin ?? 0, lo = tmin ?? tmax ?? 0;
    const avg = (hi + lo) / 2;
    const { pop, source } = popFromForecastText(text);
    const decoded = { main: "Clouds", description: text ?? "forecast", icon: "03d" };
    if (text) {
      const t = text.toLowerCase();
      if (/thunder|lightning/.test(t)) { decoded.main = "Thunderstorm"; decoded.icon = "11d"; }
      else if (/rain|shower/.test(t)) { decoded.main = "Rain"; decoded.icon = "10d"; }
      else if (/drizzle/.test(t)) { decoded.main = "Drizzle"; decoded.icon = "09d"; }
      else if (/clear|sunny|fair/.test(t)) { decoded.main = "Clear"; decoded.icon = "01d"; }
      else if (/fog|mist|haze/.test(t)) { decoded.main = "Fog"; decoded.icon = "50d"; }
    }

    forecast.push({
      dt: Math.floor((baseNoonUtc + s.off * 86_400_000) / 1000),
      temp: { day: avg, min: lo, max: hi, night: lo, eve: avg, morn: lo },
      humidity,
      wind_speed: 0,                 // not published per forecast day
      weather: [decoded],
      pop,
      // No quantitative rain forecast on this endpoint. 0 means "unquantified",
      // NOT "no rain" — `pop` above carries the actual signal.
      rain: 0,
      uv_index: 0,
      moon_phase: 0,
      pop_source: source,
    });
  }

  if (forecast.length === 0) throw new Error(`IMD: no usable forecast days for ${match.station.code}`);

  // IMD publishes no hourly product on the free agriculture tier — the caller
  // must fall back to OpenWeather/Tomorrow.io for hourly. Returning [] (not
  // throwing) lets the daily forecast still be used.
  return { forecast, hourly: [] };
}

// ---------------------------------------------------------------------------
// PUBLIC API 3 (optional) — district warnings, for weather_alerts
// ---------------------------------------------------------------------------

/** districtwarning colour scale is INVERTED vs nowcast: 1=Red … 4=Green. */
const WARNING_CODES: Record<number, string> = {
  1: "NO_WARNING", 2: "HEAVY_RAIN", 3: "HEAVY_SNOW", 4: "THUNDERSTORM",
  5: "HAILSTORM", 6: "DUST_STORM", 7: "DUST_RAISING_WINDS", 8: "STRONG_WIND",
  9: "HEAT_WAVE", 10: "HOT_DAY", 11: "WARM_NIGHT", 12: "COLD_WAVE",
  13: "COLD_DAY", 14: "GROUND_FROST", 15: "FOG", 16: "VERY_HEAVY_RAIN",
  17: "EXTREMELY_HEAVY_RAIN",
};

function warningSeverity(color: number | null): string {
  switch (color) {
    case 1: return "severe";     // Red
    case 2: return "high";       // Orange
    case 3: return "moderate";   // Yellow
    case 4: return "none";       // Green
    default: return "low";
  }
}

export interface ImdWarning {
  district: string; obj_id: string; day: number;
  alert_types: string[]; severity: string; color_code: number | null;
  valid_from: string; valid_to: string; issued_at: string;
}

export async function fetchImdDistrictWarnings(
  apiKey: string,
  districtObjIds?: string[],
): Promise<ImdWarning[]> {
  const rows = asArray(await imdFetch("districtwarning", apiKey));
  const wanted = districtObjIds?.length ? new Set(districtObjIds) : null;
  const out: ImdWarning[] = [];

  for (const r of rows) {
    const objId = str(r["Obj_id"]) ?? str(r["OBJ_ID"]);
    if (!objId || (wanted && !wanted.has(objId))) continue;

    const dateIso = str(r["Date"]);
    const issued = dateIso ? Date.parse(`${dateIso}T${normalizeTime(str(r["UTC"])) ?? "00:00:00"}Z`) : Date.now();
    if (Number.isNaN(issued)) continue;

    for (let day = 1; day <= 5; day++) {
      const raw = str(r[`Day_${day}`]);
      if (!raw) continue;
      const codes = raw.split(",").map((c) => parseInt(c.trim(), 10)).filter((n) => !Number.isNaN(n) && n !== 1);
      if (codes.length === 0) continue;

      const color = num(r[`Day${day}_Color`]);
      out.push({
        district: str(r["District"]) ?? objId,
        obj_id: objId,
        day,
        alert_types: codes.map((c) => WARNING_CODES[c] ?? `UNKNOWN_${c}`),
        severity: warningSeverity(color),
        color_code: color,
        valid_from: new Date(issued + (day - 1) * 86_400_000).toISOString(),
        valid_to: new Date(issued + day * 86_400_000).toISOString(),
        issued_at: new Date(issued).toISOString(),
      });
    }
  }
  return out;
}

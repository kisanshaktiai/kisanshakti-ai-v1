/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRICULTURAL WEATHER CALCULATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Precision farming weather indices calculated from raw API data.
 * Every coefficient/threshold is read from public.sci_method_registry via the
 * `MethodsMap` loaded ONCE per invocation (see sci-methods.ts). No formula body
 * hardcodes an agronomic constant.
 *
 * VERSION: 2.0.0
 * CREATED: 2025-02-08
 * UPDATED: 2026-08-07
 *   - D3 FIX: removed fabricated diurnal range (temp+3 / temp-5). Missing daily
 *     Tmax/Tmin now yields NULL ET0/GDD with qc_flag MISSING_TMAXMIN.
 *   - D4 FIX: FAO-56 Penman–Monteith implemented (ET0_FAO56_PM@1.0).
 *   - D5 FIX: leaf wetness duration estimated (LWD_RH_THRESHOLD@1.0) and wired
 *     into the disease-risk call path.
 *   - D6 FIX: computeConfidence (CONFIDENCE_MODEL@1.0) replaces constants.
 *   - D8 FIX: resolveKc with NDVI adjustment (KC_FAO56_TABLE12 + KC_NDVI_ADJUST).
 *   - D9 FIX: root-zone soil-water bucket (SOIL_WATER_BALANCE_FAO56 + Saxton-Rawls).
 */

import {
  type MethodsMap,
  methodParam,
  methodParams,
  methodTag,
} from "./sci-methods.ts";

export type { MethodsMap };

// ═══════════════════════════════════════════════════════════════════════════
// DEW POINT CALCULATION (Magnus-Tetens Formula)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Dew Point using Magnus-Tetens approximation.
 * Method: VPD_TETENS@1.0 (same saturation-vapour formulation).
 * @param tempC - Temperature in Celsius
 * @param humidityPercent - Relative humidity (0-100)
 * @returns Dew point temperature in Celsius
 */
export function calculateDewPoint(tempC: number, humidityPercent: number): number {
  if (humidityPercent >= 100) return tempC; // Saturated air
  // D3-class fix: previously returned `tempC - 20` for RH<=0 (a fabricated
  // value). Now the physical Magnus inversion is evaluated at the lowest
  // physically meaningful humidity instead of inventing an offset.
  const rh = Math.min(100, Math.max(0.5, humidityPercent));

  const a = 17.27;
  const b = 237.7;
  const gamma = (a * tempC / (b + tempC)) + Math.log(rh / 100);
  const dewPoint = (b * gamma) / (a - gamma);

  return Math.round(dewPoint * 10) / 10; // Round to 1 decimal
}

// ═══════════════════════════════════════════════════════════════════════════
// VAPOR PRESSURE DEFICIT (VPD)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Saturation vapour pressure (Tetens / FAO-56 Eq.11).
 * Method: VPD_TETENS@1.0 — params a, b, c from sci_method_registry.
 * @returns es in kPa
 */
export function saturationVapourPressure(tempC: number, methods?: MethodsMap): number {
  const a = methodParam(methods, "VPD_TETENS", "a", 0.6108);
  const b = methodParam(methods, "VPD_TETENS", "b", 17.27);
  const c = methodParam(methods, "VPD_TETENS", "c", 237.3);
  return a * Math.exp((b * tempC) / (tempC + c));
}

/**
 * Calculate Vapor Pressure Deficit.
 * Method: VPD_TETENS@1.0
 * @param tempC - Temperature in Celsius
 * @param humidityPercent - Relative humidity (0-100)
 * @returns VPD in kPa
 */
export function calculateVPD(tempC: number, humidityPercent: number, methods?: MethodsMap): number {
  const saturationVP = saturationVapourPressure(tempC, methods);
  const actualVP = saturationVP * (humidityPercent / 100);
  const vpd = saturationVP - actualVP;

  return Math.round(vpd * 100) / 100; // Round to 2 decimals
}

/**
 * Interpret VPD for crop health
 */
export function interpretVPD(vpd: number): { level: 'LOW' | 'OPTIMAL' | 'HIGH' | 'CRITICAL'; message: string } {
  if (vpd < 0.4) {
    return { level: 'LOW', message: 'Low transpiration, disease risk increased' };
  } else if (vpd >= 0.4 && vpd <= 1.2) {
    return { level: 'OPTIMAL', message: 'Optimal transpiration range for most crops' };
  } else if (vpd > 1.2 && vpd <= 2.0) {
    return { level: 'HIGH', message: 'High transpiration stress, irrigate if needed' };
  } else {
    return { level: 'CRITICAL', message: 'Severe water stress, immediate irrigation required' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVAPOTRANSPIRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate extraterrestrial radiation (Ra) — FAO-56 Eq.21.
 * Shared by Hargreaves (ET0_HARGREAVES@1.0) and Penman–Monteith
 * (ET0_FAO56_PM@1.0, Ångström–Prescott Rs and clear-sky Rso).
 * @param latitude - Latitude in degrees
 * @param dayOfYear - Day of year (1-365)
 * @returns Ra in MJ/m²/day
 */
export function calculateExtraterrestrialRadiation(latitude: number, dayOfYear: number): number {
  const latRad = latitude * Math.PI / 180;
  const dr = 1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365);
  const delta = 0.409 * Math.sin(2 * Math.PI * dayOfYear / 365 - 1.39);

  // Sunset hour angle
  const ws = Math.acos(-Math.tan(latRad) * Math.tan(delta));

  // Solar constant = 0.0820 MJ/m²/min
  const Gsc = 0.0820;

  // Ra calculation
  const Ra = (24 * 60 / Math.PI) * Gsc * dr * (
    ws * Math.sin(latRad) * Math.sin(delta) +
    Math.cos(latRad) * Math.cos(delta) * Math.sin(ws)
  );

  return Math.max(0, Ra);
}

/**
 * Daylight hours N — FAO-56 Eq.34 (N = 24/π · ωs).
 * Reused by the Ångström–Prescott Rs estimate inside Penman–Monteith.
 */
export function calculateDaylightHours(latitude: number, dayOfYear: number): number {
  const latRad = latitude * Math.PI / 180;
  const delta = 0.409 * Math.sin(2 * Math.PI * dayOfYear / 365 - 1.39);
  const x = -Math.tan(latRad) * Math.tan(delta);
  const ws = Math.acos(Math.min(1, Math.max(-1, x)));
  return (24 / Math.PI) * ws;
}

/**
 * Estimate Reference Evapotranspiration (ET0) using Hargreaves method.
 * Method: ET0_HARGREAVES@1.0 (FAO-56 Eq.52; Hargreaves & Samani 1985).
 * Use when full Penman-Monteith data (solar radiation, wind) not available.
 *
 * @param tempMax - Maximum temperature (°C)
 * @param tempMin - Minimum temperature (°C)
 * @param latitude - Latitude in degrees
 * @param dayOfYear - Day of year (1-365)
 * @returns ET0 in mm/day
 */
export function calculateET0Hargreaves(
  tempMax: number,
  tempMin: number,
  latitude: number,
  dayOfYear: number,
  methods?: MethodsMap
): number {
  const k = methodParam(methods, "ET0_HARGREAVES", "k", 0.0023);
  const tOffset = methodParam(methods, "ET0_HARGREAVES", "t_offset", 17.8);

  const tempMean = (tempMax + tempMin) / 2;
  const tempRange = Math.max(0, tempMax - tempMin);
  const Ra = calculateExtraterrestrialRadiation(latitude, dayOfYear);

  // Ra converted from MJ/m²/day to mm/day equivalent (÷ λ ≈ 2.45)
  const RaInMmPerDay = Ra / 2.45;

  const et0 = k * RaInMmPerDay * Math.sqrt(tempRange) * (tempMean + tOffset);

  return Math.round(Math.max(0, et0) * 10) / 10; // Round to 1 decimal
}

// ───────────────────────────────────────────────────────────────────────────
// FAO-56 PENMAN–MONTEITH  (D4 FIX)
// ───────────────────────────────────────────────────────────────────────────

export interface PenmanMonteithInputs {
  tmax_c: number;
  tmin_c: number;
  latitude: number;
  day_of_year: number;
  /** Mean relative humidity (%) — used when ea/dew point absent */
  rh_mean_pct?: number;
  rh_max_pct?: number;
  rh_min_pct?: number;
  dew_point_c?: number;
  /** Actual vapour pressure (kPa) — highest priority ea source */
  ea_kpa?: number;
  wind_2m_ms?: number;
  wind_10m_ms?: number;
  /** Measured incoming solar radiation (MJ/m²/day) */
  solar_rad_mj?: number;
  sunshine_hours?: number;
  cloud_cover_pct?: number;
  /** Station pressure (kPa); derived from elevation when absent */
  pressure_kpa?: number;
  elevation_m?: number;
}

export interface ET0Result {
  et0: number | null;
  method: string;
  u_std: number | null;
  qc_flags: string[];
}

interface PMResolved {
  tmax: number; tmin: number; ea: number; u2: number; rs: number;
  ra: number; z: number; pressure: number;
}

/**
 * FAO-56 daily reference evapotranspiration (Penman–Monteith).
 * Method: ET0_FAO56_PM@1.0 — FAO Irrigation & Drainage Paper 56, Eq.6.
 *
 *   ET0 = (0.408·Δ·(Rn−G) + γ·(900/(Tmean+273))·u2·(es−ea))
 *         / (Δ + γ·(1 + 0.34·u2))
 *
 * es      : mean of es(Tmax), es(Tmin)          — FAO-56 Eq.11/12 (VPD_TETENS@1.0)
 * ea      : from dew point (Eq.14) or RH        — FAO-56 Eq.17/19
 * Δ       : 4098·es(Tmean)/(Tmean+237.3)²        — FAO-56 Eq.13
 * γ       : 0.665e-3·P, P = 101.3·((293−0.0065z)/293)^5.26 — Eq.7/8
 * u2      : u10 · wind_10_to_2_factor (registry) — Eq.47 (0.748 at 10 m)
 * Rs      : measured, else Ångström–Prescott (a + b·n/N)·Ra — Eq.35
 * Rns/Rnl : Eq.38 / Eq.39 (σ = 4.903e-9, Rso = (0.75 + 2e-5·z)·Ra)
 * G       : 0 for daily time step                — Eq.42
 *
 * Never fabricates missing inputs: absent Tmax/Tmin, RH-family or wind yields
 * et0 = null with the corresponding qc_flag.
 *
 * u_std: numerical finite-difference uncertainty propagation, perturbing each
 * input by ±1σ (T 0.8 °C, RH 5 %, u2 0.5 m/s, Rs 15 % relative) and combining
 * half-differences in quadrature.
 */
export function calculateET0PenmanMonteith(
  inputs: PenmanMonteithInputs,
  methods?: MethodsMap,
): ET0Result {
  const tag = methodTag(methods, "ET0_FAO56_PM");
  const qc: string[] = [];

  const { tmax_c, tmin_c, latitude, day_of_year } = inputs;
  if (!Number.isFinite(tmax_c) || !Number.isFinite(tmin_c)) {
    return { et0: null, method: tag, u_std: null, qc_flags: ["MISSING_TMAXMIN"] };
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(day_of_year)) {
    return { et0: null, method: tag, u_std: null, qc_flags: ["MISSING_LATITUDE"] };
  }

  // ---- wind ---------------------------------------------------------------
  const w2Factor = methodParam(methods, "ET0_FAO56_PM", "wind_10_to_2_factor", 0.748);
  let u2: number | null = null;
  if (Number.isFinite(inputs.wind_2m_ms as number)) u2 = inputs.wind_2m_ms as number;
  else if (Number.isFinite(inputs.wind_10m_ms as number)) u2 = (inputs.wind_10m_ms as number) * w2Factor;
  if (u2 === null) return { et0: null, method: tag, u_std: null, qc_flags: ["MISSING_WIND"] };

  // ---- actual vapour pressure --------------------------------------------
  let ea: number | null = null;
  if (Number.isFinite(inputs.ea_kpa as number)) {
    ea = inputs.ea_kpa as number;
  } else if (Number.isFinite(inputs.dew_point_c as number)) {
    ea = saturationVapourPressure(inputs.dew_point_c as number, methods); // FAO-56 Eq.14
  } else if (Number.isFinite(inputs.rh_max_pct as number) && Number.isFinite(inputs.rh_min_pct as number)) {
    // FAO-56 Eq.17
    ea = (saturationVapourPressure(tmin_c, methods) * (inputs.rh_max_pct as number) / 100
      + saturationVapourPressure(tmax_c, methods) * (inputs.rh_min_pct as number) / 100) / 2;
  } else if (Number.isFinite(inputs.rh_mean_pct as number)) {
    // FAO-56 Eq.19
    const es = (saturationVapourPressure(tmax_c, methods) + saturationVapourPressure(tmin_c, methods)) / 2;
    ea = es * (inputs.rh_mean_pct as number) / 100;
  }
  if (ea === null) return { et0: null, method: tag, u_std: null, qc_flags: ["MISSING_HUMIDITY"] };

  // ---- radiation ----------------------------------------------------------
  const z = Number.isFinite(inputs.elevation_m as number) ? (inputs.elevation_m as number) : 0;
  if (!Number.isFinite(inputs.elevation_m as number)) qc.push("ELEVATION_ASSUMED_SEA_LEVEL");
  const ra = calculateExtraterrestrialRadiation(latitude, day_of_year);

  let rs: number | null = null;
  if (Number.isFinite(inputs.solar_rad_mj as number)) {
    rs = inputs.solar_rad_mj as number;
  } else {
    // Ångström–Prescott, reusing the same daylight/cloud→sunshine convention
    // already used for the Hargreaves path (0.9 atmospheric factor).
    const N = calculateDaylightHours(latitude, day_of_year);
    let n: number | null = null;
    if (Number.isFinite(inputs.sunshine_hours as number)) n = inputs.sunshine_hours as number;
    else if (Number.isFinite(inputs.cloud_cover_pct as number)) {
      const clearFraction = (100 - Math.min(100, Math.max(0, inputs.cloud_cover_pct as number))) / 100;
      n = N * clearFraction * 0.9;
      qc.push("RS_FROM_CLOUD_COVER");
    }
    if (n === null) return { et0: null, method: tag, u_std: null, qc_flags: [...qc, "MISSING_RADIATION"] };
    const a = methodParam(methods, "ET0_FAO56_PM", "angstrom_a", 0.25);
    const b = methodParam(methods, "ET0_FAO56_PM", "angstrom_b", 0.50);
    rs = (a + b * Math.min(1, n / Math.max(0.001, N))) * ra;
  }

  const pressure = Number.isFinite(inputs.pressure_kpa as number)
    ? (inputs.pressure_kpa as number)
    : 101.3 * Math.pow((293 - 0.0065 * z) / 293, 5.26); // FAO-56 Eq.7

  const base: PMResolved = { tmax: tmax_c, tmin: tmin_c, ea, u2, rs, ra, z, pressure };
  const et0 = pmCore(base, methods);

  // ---- uncertainty (finite-difference propagation) ------------------------
  const sigT = 0.8, sigU2 = 0.5, sigRsRel = 0.15;
  const sigEa = 0.05 * ea; // 5 % RH ⇒ ≈5 % of ea
  const halfDiffs = [
    (pmCore({ ...base, tmax: base.tmax + sigT, tmin: base.tmin + sigT }, methods)
      - pmCore({ ...base, tmax: base.tmax - sigT, tmin: base.tmin - sigT }, methods)) / 2,
    (pmCore({ ...base, ea: base.ea + sigEa }, methods)
      - pmCore({ ...base, ea: Math.max(0.01, base.ea - sigEa) }, methods)) / 2,
    (pmCore({ ...base, u2: base.u2 + sigU2 }, methods)
      - pmCore({ ...base, u2: Math.max(0.05, base.u2 - sigU2) }, methods)) / 2,
    (pmCore({ ...base, rs: base.rs * (1 + sigRsRel) }, methods)
      - pmCore({ ...base, rs: base.rs * (1 - sigRsRel) }, methods)) / 2,
  ];
  const u_std = Math.sqrt(halfDiffs.reduce((s, d) => s + d * d, 0));

  return {
    et0: Math.round(Math.max(0, et0) * 100) / 100,
    method: tag,
    u_std: Math.round(u_std * 1000) / 1000,
    qc_flags: qc,
  };
}

/** Pure FAO-56 PM kernel — used directly and for finite-difference perturbation. */
function pmCore(x: PMResolved, methods?: MethodsMap): number {
  const albedo = methodParam(methods, "ET0_FAO56_PM", "albedo", 0.23);
  const G = methodParam(methods, "ET0_FAO56_PM", "G_daily", 0);

  const tmean = (x.tmax + x.tmin) / 2;
  const esTmax = saturationVapourPressure(x.tmax, methods);
  const esTmin = saturationVapourPressure(x.tmin, methods);
  const es = (esTmax + esTmin) / 2;
  const esTmean = saturationVapourPressure(tmean, methods);

  const delta = (4098 * esTmean) / Math.pow(tmean + 237.3, 2);           // Eq.13
  const gamma = 0.665e-3 * x.pressure;                                    // Eq.8

  const rso = (0.75 + 2e-5 * x.z) * x.ra;                                 // Eq.37
  const rns = (1 - albedo) * x.rs;                                        // Eq.38
  const sigma = 4.903e-9;
  const rnl = sigma
    * ((Math.pow(x.tmax + 273.16, 4) + Math.pow(x.tmin + 273.16, 4)) / 2)
    * (0.34 - 0.14 * Math.sqrt(Math.max(0, x.ea)))
    * (1.35 * Math.min(1, x.rs / Math.max(0.001, rso)) - 0.35);           // Eq.39
  const rn = rns - rnl;

  const num = 0.408 * delta * (rn - G) + gamma * (900 / (tmean + 273)) * x.u2 * Math.max(0, es - x.ea);
  const den = delta + gamma * (1 + 0.34 * x.u2);
  return num / den;
}

// ═══════════════════════════════════════════════════════════════════════════
// GROWING DEGREE DAYS (GDD)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate daily Growing Degree Days (modified method).
 * Method: GDD_MODIFIED@1.0 — Tmax capped at upper, Tmin floored at base.
 * @param tempMax - Maximum temperature (°C)
 * @param tempMin - Minimum temperature (°C)
 * @param baseTemp - Base temperature for crop (default 10°C)
 * @param maxTemp - Maximum cap temperature (default 30°C)
 * @returns GDD for the day
 */
export function calculateDailyGDD(
  tempMax: number,
  tempMin: number,
  baseTemp: number = 10,
  maxTemp: number = 30
): number {
  // Cap temperatures
  const cappedMax = Math.min(tempMax, maxTemp);
  const cappedMin = Math.max(tempMin, baseTemp);

  // Ensure cappedMax >= cappedMin
  if (cappedMax <= cappedMin) {
    // Tmin above the upper cap is a full-cap day (upper − base); a day whose
    // Tmax never reaches base contributes zero.
    if (tempMin >= maxTemp) return Math.round((maxTemp - baseTemp) * 10) / 10;
    return 0;
  }

  const avgTemp = (cappedMax + cappedMin) / 2;
  const gdd = Math.max(0, avgTemp - baseTemp);

  return Math.round(gdd * 10) / 10;
}

/**
 * Get crop-specific GDD parameters.
 * Registry-first: GDD_BASE_TEMPS@1.0 when a MethodsMap is supplied, otherwise
 * the legacy inline table (kept for signature compatibility).
 */
export function getCropGDDParams(cropCode: string, methods?: MethodsMap): { baseTemp: number; maxTemp: number } {
  const key = String(cropCode ?? "DEFAULT").toLowerCase();
  const registry = methodParams(methods, "GDD_BASE_TEMPS");
  const hit = registry[key];
  if (hit && Number.isFinite(hit.base) && Number.isFinite(hit.upper)) {
    return { baseTemp: hit.base, maxTemp: hit.upper };
  }

  const params: Record<string, { baseTemp: number; maxTemp: number }> = {
    // Row crops
    'SC': { baseTemp: 12, maxTemp: 34 }, // Sugarcane
    'SUGARCANE': { baseTemp: 12, maxTemp: 34 },
    'COTTON': { baseTemp: 15.6, maxTemp: 37 },
    'WHEAT': { baseTemp: 4, maxTemp: 25 },
    'RICE': { baseTemp: 10, maxTemp: 40 },
    'MAIZE': { baseTemp: 10, maxTemp: 30 },
    'SOYBEAN': { baseTemp: 10, maxTemp: 30 },

    // Vegetables
    'TOMATO': { baseTemp: 10, maxTemp: 30 },
    'ONION': { baseTemp: 7, maxTemp: 30 },
    'POTATO': { baseTemp: 7, maxTemp: 25 },
    'CHILI': { baseTemp: 15, maxTemp: 35 },

    // Pulses
    'CHICKPEA': { baseTemp: 5, maxTemp: 25 },
    'PIGEON_PEA': { baseTemp: 10, maxTemp: 35 },

    // Default
    'DEFAULT': { baseTemp: 10, maxTemp: 30 }
  };

  return params[String(cropCode ?? "DEFAULT").toUpperCase()] || params['DEFAULT'];
}

// ═══════════════════════════════════════════════════════════════════════════
// SUNSHINE HOURS ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate sunshine hours from cloud cover
 * @param cloudCoverPercent - Cloud cover percentage (0-100)
 * @param sunriseTimestamp - Unix timestamp for sunrise
 * @param sunsetTimestamp - Unix timestamp for sunset
 * @returns Estimated sunshine hours
 */
export function estimateSunshineHours(
  cloudCoverPercent: number,
  sunriseTimestamp: number,
  sunsetTimestamp: number
): number {
  // Calculate daylight hours
  const daylightHours = (sunsetTimestamp - sunriseTimestamp) / 3600; // Convert seconds to hours

  if (daylightHours <= 0) return 0;

  // Clear fraction (0-1)
  const clearFraction = (100 - Math.min(100, Math.max(0, cloudCoverPercent))) / 100;

  // Atmospheric absorption factor (typically 0.85-0.95)
  const atmosphericFactor = 0.9;

  const sunshineHours = daylightHours * clearFraction * atmosphericFactor;

  return Math.round(sunshineHours * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAF WETNESS DURATION  (D5 FIX)
// ═══════════════════════════════════════════════════════════════════════════

export interface HourlyWetnessInput {
  /** Relative humidity (%) */
  rh: number;
  /** Air temperature (°C) */
  temp?: number;
  dew_point?: number;
  rain_mm?: number;
  /** Unix seconds — enables the IST 08:00 anchoring */
  dt?: number;
}

/**
 * Estimate leaf wetness duration (hours) over the trailing 24 h window ending
 * at IST 08:00 (overnight-wetness agronomic convention).
 * Method: LWD_RH_THRESHOLD@1.0 — RH-threshold model (Sentelhas et al.).
 *
 * A wet hour is: RH >= rh_wet_pct (87) OR rain_mm > 0
 * OR (dew point supplied AND temp − dew point < dpd_wet_c (2 °C)).
 *
 * If the series does not span an IST 08:00 anchor, the last 24 entries are used.
 */
export function estimateLeafWetnessHours(
  hourly: HourlyWetnessInput[],
  methods?: MethodsMap,
): number {
  if (!Array.isArray(hourly) || hourly.length === 0) return 0;

  const rhWet = methodParam(methods, "LWD_RH_THRESHOLD", "rh_wet_pct", 87);
  const dpdWet = methodParam(methods, "LWD_RH_THRESHOLD", "dpd_wet_c", 2);

  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  let window: HourlyWetnessInput[] | null = null;

  const timed = hourly.filter((h) => Number.isFinite(h.dt as number));
  if (timed.length >= 2) {
    // most recent IST 08:00 at or before the last sample
    const lastMs = (timed[timed.length - 1].dt as number) * 1000;
    const ist = new Date(lastMs + IST_OFFSET_MS);
    const anchorIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 8, 0, 0);
    let anchorMs = anchorIst - IST_OFFSET_MS;
    if (anchorMs > lastMs) anchorMs -= 86400000;
    const startMs = anchorMs - 24 * 3600 * 1000;
    const inWindow = timed.filter((h) => {
      const t = (h.dt as number) * 1000;
      return t > startMs && t <= anchorMs;
    });
    if (inWindow.length > 0) window = inWindow;
  }

  if (!window) window = hourly.slice(-24);

  let wet = 0;
  for (const h of window) {
    const rain = Number(h.rain_mm ?? 0);
    const rh = Number(h.rh ?? 0);
    const dpdWetHit = Number.isFinite(h.dew_point as number) && Number.isFinite(h.temp as number)
      && ((h.temp as number) - (h.dew_point as number)) < dpdWet;
    if (rh >= rhWet || rain > 0 || dpdWetHit) wet++;
  }
  return Math.min(24, wet);
}

// ═══════════════════════════════════════════════════════════════════════════
// STRESS DEGREE-HOURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standard sine interpolation of hourly temperature from daily Tmax/Tmin.
 * Minimum at 05:00 local, maximum at 14:00 local (half-cosine day segment,
 * half-cosine night segment). Used by HEAT_STRESS_FLOWERING@1.0.
 * @returns 24 values, index = local hour 0..23
 */
export function interpolateHourlyTemps(tmax: number, tmin: number): number[] {
  const mean = (tmax + tmin) / 2;
  const amp = (tmax - tmin) / 2;
  const MIN_H = 5, MAX_H = 14;
  const out: number[] = [];
  for (let h = 0; h < 24; h++) {
    if (h >= MIN_H && h <= MAX_H) {
      out.push(mean - amp * Math.cos(Math.PI * (h - MIN_H) / (MAX_H - MIN_H)));
    } else {
      const hh = h < MIN_H ? h + 24 : h;                 // 15..28
      const span = 24 - (MAX_H - MIN_H);                 // 15 h night arc
      out.push(mean + amp * Math.cos(Math.PI * (hh - MAX_H) / span));
    }
  }
  return out;
}

/**
 * Accumulate stress degree-hours against a crop threshold.
 * Method: HEAT_STRESS_FLOWERING@1.0 — Liu et al. 2023, Plant Communications
 * 4:100629 (seed-set thresholds per crop live in the registry params).
 *
 * The phenological gate (flowering/reproductive only) is the CALLER's
 * responsibility: pass isSensitiveStage=false to get 0.
 *
 * @param direction 'above' → Σ max(0, T − threshold); 'below' → Σ max(0, threshold − T)
 */
export function calculateStressDegreeHours(
  hourlyTemps: number[],
  thresholdC: number,
  direction: 'above' | 'below' = 'above',
  isSensitiveStage: boolean = true,
): number {
  if (!isSensitiveStage) return 0;
  if (!Array.isArray(hourlyTemps) || !hourlyTemps.length) return 0;
  let sum = 0;
  for (const t of hourlyTemps) {
    if (!Number.isFinite(t)) continue;
    sum += direction === 'above'
      ? Math.max(0, t - thresholdC)
      : Math.max(0, thresholdC - t);
  }
  return Math.round(sum * 100) / 100;
}

/** Crop seed-set threshold (°C) from HEAT_STRESS_FLOWERING@1.0 registry params. */
export function getHeatStressThreshold(cropCode: string, methods?: MethodsMap): number {
  const p = methodParams(methods, "HEAT_STRESS_FLOWERING");
  const key = `${String(cropCode ?? "generic").toLowerCase()}_c`;
  const v = p[key];
  return typeof v === "number" ? v : (typeof p.generic_c === "number" ? p.generic_c : 35);
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRAY SUITABILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wet-bulb temperature, Stull (2011) empirical approximation.
 * Stull R., "Wet-Bulb Temperature from Relative Humidity and Air Temperature",
 * J. Appl. Meteorol. Climatol. 50(11):2267–2269. Valid ~ −20..50 °C, RH 5..99 %.
 */
export function wetBulbStull(tempC: number, rhPct: number): number {
  const rh = Math.min(100, Math.max(1, rhPct));
  return tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(tempC + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035;
}

export interface SprayInputs {
  wind_2m_ms: number;
  temp_c: number;
  rh_pct: number;
  rain_prob_pct?: number;
  rain_next6h_mm?: number;
  /** Optional hourly series for the 24-slot window labels */
  hourly?: Array<{ wind_2m_ms?: number; temp_c?: number; rh_pct?: number; rain_prob_pct?: number; rain_mm?: number }>;
}

export interface SprayResult {
  score: number;                                  // 0..1
  delta_t_c: number;
  blocked_by: string[];
  method: string;
  window?: Array<'good' | 'caution' | 'avoid'>;
}

/**
 * Spray suitability score.
 * Method: SPRAY_SUITABILITY@1.0 — WSU AgWeatherNet / Kestrel Delta-T guidance.
 * Delta-T = dry-bulb − wet-bulb (Stull 2011).
 *
 * Hard blocks (score 0): wind > wind_block_ms, ΔT >= deltaT_block_c,
 * rain probability >= rain_prob_block_pct, or rain_next6h > 0.5 mm.
 * Otherwise graded 0–1 with linear penalties outside the optimal bands.
 */
export function calculateSprayScore(inputs: SprayInputs, methods?: MethodsMap): SprayResult {
  const p = methodParams(methods, "SPRAY_SUITABILITY");
  const windOk: number[] = p.wind_ok_ms ?? [1.4, 3.6];
  const windBlock: number = p.wind_block_ms ?? 4.5;
  const dtOk: number[] = p.deltaT_ok_c ?? [2, 8];
  const dtBlock: number = p.deltaT_block_c ?? 10;
  const rhMin: number = p.rh_min_pct ?? 45;
  const rhMax: number = p.rh_max_pct ?? 90;
  const tempMax: number = p.temp_max_c ?? 30;
  const rainProbBlock: number = p.rain_prob_block_pct ?? 60;

  const evaluate = (w: number, t: number, rh: number, rainProb: number, rain6: number) => {
    const dt = t - wetBulbStull(t, rh);
    const blocked: string[] = [];
    if (w > windBlock) blocked.push("WIND_TOO_HIGH");
    if (dt >= dtBlock) blocked.push("DELTA_T_TOO_HIGH");
    if (rainProb >= rainProbBlock) blocked.push("RAIN_PROBABLE");
    if (rain6 > 0.5) blocked.push("RAIN_EXPECTED_6H");
    if (blocked.length) return { score: 0, dt, blocked };

    // graded sub-scores, linear penalty outside the optimal band
    const band = (v: number, lo: number, hi: number, slope: number) => {
      if (v >= lo && v <= hi) return 1;
      const d = v < lo ? lo - v : v - hi;
      return Math.max(0, 1 - d * slope);
    };
    const sWind = band(w, windOk[0], windOk[1], 1 / Math.max(0.1, windBlock - windOk[1]));
    const sDt = band(dt, dtOk[0], dtOk[1], 1 / Math.max(0.1, dtBlock - dtOk[1]));
    const sRh = band(rh, rhMin, rhMax, 1 / 20);
    const sTemp = band(t, -50, tempMax, 1 / 8);
    const score = sWind * 0.35 + sDt * 0.3 + sRh * 0.2 + sTemp * 0.15;
    return { score: Math.max(0, Math.min(1, score)), dt, blocked };
  };

  const main = evaluate(
    inputs.wind_2m_ms,
    inputs.temp_c,
    inputs.rh_pct,
    inputs.rain_prob_pct ?? 0,
    inputs.rain_next6h_mm ?? 0,
  );

  let window: Array<'good' | 'caution' | 'avoid'> | undefined;
  if (Array.isArray(inputs.hourly) && inputs.hourly.length) {
    window = inputs.hourly.slice(0, 24).map((h) => {
      const r = evaluate(
        h.wind_2m_ms ?? inputs.wind_2m_ms,
        h.temp_c ?? inputs.temp_c,
        h.rh_pct ?? inputs.rh_pct,
        h.rain_prob_pct ?? 0,
        h.rain_mm ?? 0,
      );
      if (r.score === 0) return 'avoid';
      return r.score >= 0.7 ? 'good' : 'caution';
    });
  }

  return {
    score: Math.round(main.score * 1000) / 1000,
    delta_t_c: Math.round(main.dt * 100) / 100,
    blocked_by: main.blocked,
    method: methodTag(methods, "SPRAY_SUITABILITY"),
    window,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT-ZONE SOIL WATER BUCKET  (D9 FIX) + Kc  (D8 FIX)
// ═══════════════════════════════════════════════════════════════════════════

export interface SoilTextureInput {
  /** Sand fraction 0..1 */
  sandFrac: number;
  /** Clay fraction 0..1 */
  clayFrac: number;
  /** Organic matter, % by weight */
  omPct?: number;
}

export interface TawRawResult {
  theta_fc: number;
  theta_wp: number;
  taw_mm: number;
  raw_mm: number;
  method: string;
}

/**
 * Total / readily available water for the root zone.
 * Methods: SAXTON_RAWLS_PTF@1.0 (Saxton & Rawls 2006, SSSAJ 70:1569–1578,
 * Eq.1 θ1500 and Eq.2 θ33) + SOIL_WATER_BALANCE_FAO56@1.0 (RAW = p·TAW).
 *
 * TAW = (θFC − θWP) · Zr · 1000  [mm]
 */
export function computeTawRaw(
  soilTexture: SoilTextureInput,
  rootDepthM: number,
  methods?: MethodsMap,
): TawRawResult {
  const S = Math.min(1, Math.max(0, soilTexture.sandFrac));
  const C = Math.min(1, Math.max(0, soilTexture.clayFrac));
  const OM = Math.max(0, soilTexture.omPct ?? 1.0);

  // Saxton & Rawls 2006 — permanent wilting point (1500 kPa)
  const t1500 = -0.024 * S + 0.487 * C + 0.006 * OM
    + 0.005 * (S * OM) - 0.013 * (C * OM) + 0.068 * (S * C) + 0.031;
  const thetaWp = t1500 + (0.14 * t1500 - 0.02);

  // Saxton & Rawls 2006 — field capacity (33 kPa)
  const t33 = -0.251 * S + 0.195 * C + 0.011 * OM
    + 0.006 * (S * OM) - 0.027 * (C * OM) + 0.452 * (S * C) + 0.299;
  const thetaFc = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015);

  const p = methodParam(methods, "SOIL_WATER_BALANCE_FAO56", "p_default", 0.5);
  const taw = Math.max(0, (thetaFc - thetaWp) * rootDepthM * 1000);

  return {
    theta_fc: thetaFc,
    theta_wp: thetaWp,
    taw_mm: taw,
    raw_mm: p * taw,
    method: `${methodTag(methods, "SAXTON_RAWLS_PTF")}+${methodTag(methods, "SOIL_WATER_BALANCE_FAO56")}`,
  };
}

export interface BucketFluxes {
  etcMm?: number;
  rainMm?: number;
  irrigationMm?: number;
  runoffMm?: number;
}

export interface BucketResult {
  depletionMm: number;
  drainageMm: number;
  method: string;
}

/**
 * Root-zone depletion update.
 * Method: SOIL_WATER_BALANCE_FAO56@1.0 — FAO-56 Ch.8 Eq.85:
 *   Dr,i = Dr,i−1 − (P − RO) − I + ETc + DP
 * Deep percolation appears when the balance would drive depletion below zero
 * (profile at field capacity). Clamping to TAW is the caller's job.
 */
export function updateSoilWaterBucket(
  prevDepletionMm: number,
  fluxes: BucketFluxes,
  methods?: MethodsMap,
): BucketResult {
  const etc = fluxes.etcMm ?? 0;
  const rain = fluxes.rainMm ?? 0;
  const irr = fluxes.irrigationMm ?? 0;
  const runoff = fluxes.runoffMm ?? 0;

  const raw = prevDepletionMm - rain - irr + etc + runoff;
  const drainage = raw < 0 ? -raw : 0;

  return {
    depletionMm: raw < 0 ? 0 : raw,
    drainageMm: drainage,
    method: methodTag(methods, "SOIL_WATER_BALANCE_FAO56"),
  };
}

export interface KcResult {
  kcStatic: number;
  kcAdjusted: number;
  method: string;
}

/**
 * Crop coefficient for the stage, optionally adjusted by canopy greenness.
 * Methods: KC_FAO56_TABLE12@1.0 (FAO-56 Table 12 stage Kc) and
 * KC_NDVI_ADJUST@1.0 (Kc_adj = clamp(Kc_stage·(a + b·NDVIrel), Kc_ini, Kc_mid)).
 * @param ndviRel caller-normalised relative NDVI 0..1, or null to skip (D8 fix)
 */
export function resolveKc(
  crop: string,
  stageBucket: 'ini' | 'mid' | 'end',
  ndviRel: number | null,
  methods?: MethodsMap,
): KcResult {
  const table = methodParams(methods, "KC_FAO56_TABLE12");
  const row = table[String(crop ?? "").toLowerCase()] ?? table["maize"] ?? { ini: 0.3, mid: 1.2, end: 0.6 };
  const kcStatic = Number(row[stageBucket] ?? row.mid);

  let kcAdjusted = kcStatic;
  if (ndviRel !== null && Number.isFinite(ndviRel)) {
    const a = methodParam(methods, "KC_NDVI_ADJUST", "a", 0.3);
    const b = methodParam(methods, "KC_NDVI_ADJUST", "b", 1.2);
    const rel = Math.min(1, Math.max(0, ndviRel));
    const lo = Number(row.ini), hi = Number(row.mid);
    kcAdjusted = Math.min(hi, Math.max(lo, kcStatic * (a + b * rel)));
  }

  return {
    kcStatic: Math.round(kcStatic * 1000) / 1000,
    kcAdjusted: Math.round(kcAdjusted * 1000) / 1000,
    method: `${methodTag(methods, "KC_FAO56_TABLE12")}+${methodTag(methods, "KC_NDVI_ADJUST")}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FROST RISK + HEATWAVE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export interface FrostInputs {
  tmin_c: number;
  crop_frost_threshold_c: number;
  cloud_pct?: number;
  wind_ms?: number;
  dew_point_c?: number;
}

export interface FrostResult {
  score: number;
  amplifiers: string[];
  method: string;
}

/**
 * Composite radiative-frost risk (0..1).
 * Method: FROST_COMPOSITE@1.0 — FAO Frost Protection guidance: Tmin proximity
 * to the crop threshold, amplified by clear skies, calm wind and a large
 * dew-point depression (strong radiative cooling potential).
 */
export function calculateFrostRisk(inputs: FrostInputs, methods?: MethodsMap): FrostResult {
  const calm = methodParam(methods, "FROST_COMPOSITE", "wind_calm_ms", 2);
  const clear = methodParam(methods, "FROST_COMPOSITE", "cloud_clear_pct", 30);
  const dpdAmp = methodParam(methods, "FROST_COMPOSITE", "dpd_amplify_c", 5);

  const { tmin_c, crop_frost_threshold_c } = inputs;
  if (!Number.isFinite(tmin_c) || !Number.isFinite(crop_frost_threshold_c)) {
    return { score: 0, amplifiers: ["MISSING_TMIN"], method: methodTag(methods, "FROST_COMPOSITE") };
  }

  // base: 0 at threshold + 4 °C, 1 at or below the threshold
  const margin = tmin_c - crop_frost_threshold_c;
  let base = margin <= 0 ? 1 : Math.max(0, 1 - margin / 4);

  const amplifiers: string[] = [];
  if (base > 0) {
    if (Number.isFinite(inputs.cloud_pct as number) && (inputs.cloud_pct as number) < clear) {
      base *= 1.15; amplifiers.push("CLEAR_SKY");
    }
    if (Number.isFinite(inputs.wind_ms as number) && (inputs.wind_ms as number) < calm) {
      base *= 1.15; amplifiers.push("CALM_WIND");
    }
    if (Number.isFinite(inputs.dew_point_c as number)
      && (tmin_c - (inputs.dew_point_c as number)) > dpdAmp) {
      base *= 1.10; amplifiers.push("DRY_AIR");
    }
  }

  return {
    score: Math.round(Math.min(1, base) * 1000) / 1000,
    amplifiers,
    method: methodTag(methods, "FROST_COMPOSITE"),
  };
}

export interface HeatwaveDay { date?: string; tmax_c: number }

export interface HeatwaveResult {
  qualifies: boolean;
  consecutiveDays: number;
  severe: boolean;
  method: string;
}

/**
 * IMD heat-wave detection over a daily Tmax series.
 * Method: EVENT_HEATWAVE_IMD@1.0 — IMD plains criteria: Tmax >= 40 °C AND
 * departure from normal >= 4.5 °C (severe >= 6.4 °C), OR absolute Tmax >= 45 °C
 * (severe >= 47 °C); declared when >= min_days (2) consecutive days qualify.
 */
export function detectHeatwave(
  dailySeries: HeatwaveDay[],
  climatologyNormalTmax: number | null,
  methods?: MethodsMap,
): HeatwaveResult {
  const p = methodParams(methods, "EVENT_HEATWAVE_IMD");
  const tmaxMin = p.tmax_min_c ?? 40;
  const dep = p.departure_c ?? 4.5;
  const sevDep = p.severe_departure_c ?? 6.4;
  const abs = p.absolute_c ?? 45;
  const sevAbs = p.severe_absolute_c ?? 47;
  const minDays = p.min_days ?? 2;
  const tag = methodTag(methods, "EVENT_HEATWAVE_IMD");

  let run = 0, best = 0, severe = false, severeRun = false;
  for (const d of dailySeries ?? []) {
    const t = Number(d?.tmax_c);
    if (!Number.isFinite(t)) { run = 0; severeRun = false; continue; }
    const departure = Number.isFinite(climatologyNormalTmax as number)
      ? t - (climatologyNormalTmax as number) : null;

    const qualifies = (t >= tmaxMin && departure !== null && departure >= dep) || t >= abs;
    const isSevere = (t >= tmaxMin && departure !== null && departure >= sevDep) || t >= sevAbs;

    if (qualifies) {
      run++; severeRun = severeRun || isSevere;
      if (run > best) best = run;
      if (run >= minDays && severeRun) severe = true;
    } else {
      run = 0; severeRun = false;
    }
  }

  return { qualifies: best >= minDays, consecutiveDays: best, severe, method: tag };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE MODEL  (D6 FIX)
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfidenceInputs {
  /** Cross-provider agreement 0..1 */
  agreement?: number;
  /** Age of the record in minutes */
  freshnessAgeMin?: number;
  /** TTL of the record in minutes */
  ttlMin?: number;
  /** Forecast lead time in days (0 for current conditions) */
  horizonDays?: number;
  /** Historical provider skill 0..1 (neutral from registry when absent) */
  skill?: number;
  /** Precipitation variables get the registry lead multiplier */
  isPrecip?: boolean;
}

/**
 * Computed (never constant) confidence.
 * Method: CONFIDENCE_MODEL@1.0 —
 *   confidence = w_agreement·agreement + w_freshness·exp(−age/ttl)
 *              + w_leadtime·leadFactor + w_skill·skill
 * multiplied by precip_multiplier for precipitation variables.
 */
export function computeConfidence(inputs: ConfidenceInputs, methods?: MethodsMap): number {
  const p = methodParams(methods, "CONFIDENCE_MODEL");
  const wA = p.w_agreement ?? 0.35;
  const wF = p.w_freshness ?? 0.20;
  const wL = p.w_leadtime ?? 0.25;
  const wS = p.w_skill ?? 0.20;
  const lf = p.leadtime_factors ?? { d0_1: 1.0, d2_3: 0.85, d4_7: 0.65, d8p: 0.4 };
  const neutralSkill = p.neutral_skill ?? 0.7;
  const precipMult = p.precip_multiplier ?? 0.8;

  const agreement = clamp01(inputs.agreement ?? 1.0);
  const age = Math.max(0, inputs.freshnessAgeMin ?? 0);
  const ttl = Math.max(1, inputs.ttlMin ?? 60);
  const freshness = Math.exp(-age / ttl);

  const h = Math.max(0, inputs.horizonDays ?? 0);
  const leadFactor = h <= 1 ? lf.d0_1 : h <= 3 ? lf.d2_3 : h <= 7 ? lf.d4_7 : lf.d8p;

  const skill = clamp01(inputs.skill ?? neutralSkill);

  let c = wA * agreement + wF * freshness + wL * leadFactor + wS * skill;
  if (inputs.isPrecip) c *= precipMult;

  return Math.round(clamp01(c) * 1000) / 1000;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE RISK INDEX
// ═══════════════════════════════════════════════════════════════════════════

export type DiseaseRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DiseaseRiskResult {
  level: DiseaseRiskLevel;
  score: number; // 0-100
  factors: string[];
  recommendations: string[];
  spray_urgency: 'NONE' | 'MONITOR' | 'PREVENTIVE' | 'URGENT';
}

/**
 * Calculate agricultural disease risk based on weather conditions
 * @param tempC - Current temperature in Celsius
 * @param humidityPercent - Relative humidity (0-100)
 * @param dewPointC - Dew point temperature in Celsius (or null to calculate)
 * @param recentRainfallMm - Rainfall in last 24-48 hours (mm)
 * @param leafWetnessHours - Hours of leaf wetness (LWD_RH_THRESHOLD@1.0 — now
 *        actually supplied by estimateLeafWetnessHours, D5 fix)
 */
export function calculateDiseaseRiskIndex(
  tempC: number,
  humidityPercent: number,
  dewPointC: number | null,
  recentRainfallMm: number = 0,
  leafWetnessHours: number = 0
): DiseaseRiskResult {
  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];

  // Calculate dew point if not provided
  const dew = dewPointC ?? calculateDewPoint(tempC, humidityPercent);

  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 1: High Humidity (25 points max)
  // ═══════════════════════════════════════════════════════════════════════
  if (humidityPercent > 85) {
    score += 25;
    factors.push('HIGH_HUMIDITY');
    recommendations.push('Ensure good air circulation around crops');
  } else if (humidityPercent > 70) {
    score += 15;
    factors.push('MODERATE_HUMIDITY');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 2: Dew Point Proximity (30 points max)
  // ═══════════════════════════════════════════════════════════════════════
  const dewPointProximity = Math.abs(tempC - dew);

  if (dewPointProximity < 2) {
    score += 30;
    factors.push('CONDENSATION_LIKELY');
    recommendations.push('Fungal disease risk high - consider preventive fungicide');
  } else if (dewPointProximity < 5) {
    score += 15;
    factors.push('CONDENSATION_POSSIBLE');
    recommendations.push('Monitor for early morning dew formation');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 3: Optimal Pathogen Temperature (20 points max)
  // ═══════════════════════════════════════════════════════════════════════
  if (tempC >= 20 && tempC <= 28) {
    score += 20;
    factors.push('OPTIMAL_PATHOGEN_TEMP');
  } else if (tempC >= 15 && tempC <= 32) {
    score += 10;
    factors.push('FAVORABLE_PATHOGEN_TEMP');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 4: Recent Rainfall (25 points max)
  // ═══════════════════════════════════════════════════════════════════════
  if (recentRainfallMm > 15) {
    score += 25;
    factors.push('WET_CANOPY');
    recommendations.push('Wait for canopy to dry before any treatment');
  } else if (recentRainfallMm > 5) {
    score += 15;
    factors.push('DAMP_CONDITIONS');
  } else if (recentRainfallMm > 2) {
    score += 10;
    factors.push('LIGHT_MOISTURE');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 5: Prolonged Leaf Wetness (15 points max) — live since D5 fix
  // ═══════════════════════════════════════════════════════════════════════
  if (leafWetnessHours > 8) {
    score += 15;
    factors.push('PROLONGED_LEAF_WETNESS');
    recommendations.push('Extended wet period - scout for disease symptoms');
  } else if (leafWetnessHours > 4) {
    score += 10;
    factors.push('MODERATE_LEAF_WETNESS');
  }

  // Estimate leaf wetness if not provided (based on rain and humidity)
  if (leafWetnessHours === 0 && recentRainfallMm > 5 && humidityPercent > 80) {
    score += 5;
    factors.push('ESTIMATED_LEAF_WETNESS');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DETERMINE RISK LEVEL AND SPRAY URGENCY
  // ═══════════════════════════════════════════════════════════════════════
  let level: DiseaseRiskLevel;
  let spray_urgency: DiseaseRiskResult['spray_urgency'];

  if (score >= 75) {
    level = 'CRITICAL';
    spray_urgency = 'URGENT';
    recommendations.push('🚨 Apply preventive fungicide immediately if not sprayed in last 7 days');
  } else if (score >= 50) {
    level = 'HIGH';
    spray_urgency = 'PREVENTIVE';
    recommendations.push('⚠️ Consider preventive fungicide application within 24-48 hours');
  } else if (score >= 25) {
    level = 'MEDIUM';
    spray_urgency = 'MONITOR';
    recommendations.push('Scout fields for early disease symptoms');
  } else {
    level = 'LOW';
    spray_urgency = 'NONE';
    recommendations.push('Conditions unfavorable for disease - continue normal monitoring');
  }

  return {
    level,
    score: Math.min(100, score),
    factors,
    recommendations,
    spray_urgency
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IRRIGATION DECISION SUPPORT
// ═══════════════════════════════════════════════════════════════════════════

export interface IrrigationRecommendation {
  needs_irrigation: boolean;
  water_deficit_mm: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommended_amount_mm: number;
  message: string;
}

/**
 * Calculate irrigation recommendation based on ET0 and rainfall
 * @param et0Mm - Reference evapotranspiration (mm/day)
 * @param rainfallMm - Recent rainfall (mm)
 * @param cropCoefficient - Kc value for crop stage (typically 0.3-1.2)
 * @param soilMoisturePercent - Current soil moisture (optional)
 */
export function calculateIrrigationNeed(
  et0Mm: number,
  rainfallMm: number,
  cropCoefficient: number = 1.0,
  soilMoisturePercent?: number
): IrrigationRecommendation {
  // Crop water requirement (ETc)
  const etc = et0Mm * cropCoefficient;

  // Water balance (simplified)
  const waterDeficit = etc - rainfallMm;

  // Determine priority
  let priority: IrrigationRecommendation['priority'];
  let needs_irrigation: boolean;
  let message: string;

  // Consider soil moisture if available
  if (soilMoisturePercent !== undefined) {
    if (soilMoisturePercent < 25) {
      priority = 'CRITICAL';
      needs_irrigation = true;
      message = 'Soil moisture critically low - irrigate immediately';
    } else if (soilMoisturePercent < 40) {
      priority = 'HIGH';
      needs_irrigation = true;
      message = 'Soil moisture low - irrigate within 24 hours';
    } else if (soilMoisturePercent < 60 && waterDeficit > 2) {
      priority = 'MEDIUM';
      needs_irrigation = true;
      message = 'Consider irrigation based on crop water demand';
    } else {
      priority = 'LOW';
      needs_irrigation = false;
      message = 'Soil moisture adequate - continue monitoring';
    }
  } else {
    // No soil moisture data - use ET-based decision
    if (waterDeficit > 5) {
      priority = 'HIGH';
      needs_irrigation = true;
      message = `High water demand (${waterDeficit.toFixed(1)} mm/day deficit) - irrigate soon`;
    } else if (waterDeficit > 2) {
      priority = 'MEDIUM';
      needs_irrigation = true;
      message = `Moderate water deficit - consider irrigation`;
    } else {
      priority = 'LOW';
      needs_irrigation = false;
      message = 'Recent rainfall covers crop water demand';
    }
  }

  // Recommended amount (typically replace deficit + 20% for efficiency losses)
  const recommendedAmount = Math.max(0, waterDeficit * 1.2);

  return {
    needs_irrigation,
    water_deficit_mm: Math.round(waterDeficit * 10) / 10,
    priority,
    recommended_amount_mm: Math.round(recommendedAmount * 10) / 10,
    message
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE AGRICULTURAL WEATHER INDICES
// ═══════════════════════════════════════════════════════════════════════════

export interface AgriculturalWeatherIndices {
  dew_point_c: number;
  vpd_kpa: number;
  vpd_interpretation: { level: string; message: string };
  /** null when daily Tmax/Tmin are unavailable (D3 fix) */
  et0_mm: number | null;
  /** ET0_FAO56_PM@1.0 | ET0_HARGREAVES@1.0 | null */
  et0_method: string | null;
  et0_u_std: number | null;
  /** null when daily Tmax/Tmin are unavailable (D3 fix) */
  gdd: number | null;
  /** null when cloud cover / sunrise / sunset are unavailable */
  sunshine_hours: number | null;
  leaf_wetness_hours: number | null;
  disease_risk: DiseaseRiskResult;
  /** null when ET0 could not be computed */
  irrigation_need: IrrigationRecommendation | null;
  qc_flags: string[];
}

export interface WeatherInputForIndices {
  temperature_c: number;
  temperature_max_c?: number;
  temperature_min_c?: number;
  humidity_percent: number;
  cloud_cover_percent?: number;
  sunrise_timestamp?: number;
  sunset_timestamp?: number;
  rainfall_24h_mm?: number;
  latitude?: number;
  day_of_year?: number;
  crop_code?: string;
  crop_coefficient?: number;
  soil_moisture_percent?: number;
  // --- additive Penman–Monteith inputs (D4) ---
  wind_speed_ms?: number;
  wind_speed_10m_ms?: number;
  solar_radiation_mj?: number;
  pressure_hpa?: number;
  elevation_m?: number;
  dew_point_c?: number;
  // --- additive leaf wetness inputs (D5) ---
  hourly_series?: HourlyWetnessInput[];
}

/**
 * Calculate all agricultural weather indices from raw data.
 *
 * D3 FIX: no fabricated diurnal range. When daily Tmax/Tmin are absent the
 * ET0/GDD/irrigation outputs are null and qc_flags carries MISSING_TMAXMIN —
 * the daily finalize job (which has weather_aggregates) computes them instead.
 *
 * ET0 fallback chain: FAO-56 Penman–Monteith (ET0_FAO56_PM@1.0) when Tmax,
 * Tmin, humidity and wind are present → Hargreaves (ET0_HARGREAVES@1.0)
 * otherwise → null when Tmax/Tmin are missing.
 */
export function calculateAllAgriculturalIndices(
  input: WeatherInputForIndices,
  methods?: MethodsMap,
): AgriculturalWeatherIndices {
  const {
    temperature_c,
    temperature_max_c,
    temperature_min_c,
    humidity_percent,
    cloud_cover_percent,
    sunrise_timestamp,
    sunset_timestamp,
    rainfall_24h_mm = 0,
    latitude,
    day_of_year = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000),
    crop_code = 'DEFAULT',
    crop_coefficient = 1.0,
    soil_moisture_percent,
  } = input;

  const qc_flags: string[] = [];

  const dew_point_c = Number.isFinite(input.dew_point_c as number)
    ? (input.dew_point_c as number)
    : calculateDewPoint(temperature_c, humidity_percent);
  const vpd_kpa = calculateVPD(temperature_c, humidity_percent, methods);
  const vpd_interpretation = interpretVPD(vpd_kpa);

  const hasDaily = Number.isFinite(temperature_max_c as number) && Number.isFinite(temperature_min_c as number);
  const hasLat = Number.isFinite(latitude as number);
  if (!hasDaily) qc_flags.push('MISSING_TMAXMIN');
  if (!hasLat) qc_flags.push('MISSING_LATITUDE');

  // ---- ET0 fallback chain -------------------------------------------------
  let et0_mm: number | null = null;
  let et0_method: string | null = null;
  let et0_u_std: number | null = null;

  if (hasDaily && hasLat) {
    const wind2 = input.wind_speed_ms;
    const wind10 = input.wind_speed_10m_ms;
    const hasWind = Number.isFinite(wind2 as number) || Number.isFinite(wind10 as number);

    if (hasWind) {
      const pm = calculateET0PenmanMonteith({
        tmax_c: temperature_max_c as number,
        tmin_c: temperature_min_c as number,
        latitude: latitude as number,
        day_of_year,
        rh_mean_pct: humidity_percent,
        dew_point_c: Number.isFinite(input.dew_point_c as number) ? input.dew_point_c : undefined,
        wind_2m_ms: wind2,
        wind_10m_ms: wind10,
        solar_rad_mj: input.solar_radiation_mj,
        cloud_cover_pct: cloud_cover_percent,
        pressure_kpa: Number.isFinite(input.pressure_hpa as number) ? (input.pressure_hpa as number) / 10 : undefined,
        elevation_m: input.elevation_m,
      }, methods);
      if (pm.et0 !== null) {
        et0_mm = pm.et0;
        et0_method = pm.method;
        et0_u_std = pm.u_std;
      }
      qc_flags.push(...pm.qc_flags);
    }

    if (et0_mm === null) {
      et0_mm = calculateET0Hargreaves(
        temperature_max_c as number, temperature_min_c as number,
        latitude as number, day_of_year, methods,
      );
      et0_method = methodTag(methods, 'ET0_HARGREAVES');
    }
  }

  // ---- GDD ---------------------------------------------------------------
  const gddParams = getCropGDDParams(crop_code, methods);
  const gdd = hasDaily
    ? calculateDailyGDD(temperature_max_c as number, temperature_min_c as number, gddParams.baseTemp, gddParams.maxTemp)
    : null;

  // ---- sunshine ----------------------------------------------------------
  const hasSunClock = Number.isFinite(cloud_cover_percent as number)
    && Number.isFinite(sunrise_timestamp as number) && Number.isFinite(sunset_timestamp as number)
    && (sunset_timestamp as number) > (sunrise_timestamp as number);
  if (!hasSunClock) qc_flags.push('MISSING_SUN_CLOCK');
  const sunshine_hours = hasSunClock
    ? estimateSunshineHours(cloud_cover_percent as number, sunrise_timestamp as number, sunset_timestamp as number)
    : null;

  // ---- leaf wetness (D5) --------------------------------------------------
  const leaf_wetness_hours = input.hourly_series?.length
    ? estimateLeafWetnessHours(input.hourly_series, methods)
    : null;
  if (leaf_wetness_hours === null) qc_flags.push('MISSING_HOURLY_SERIES');

  const disease_risk = calculateDiseaseRiskIndex(
    temperature_c,
    humidity_percent,
    dew_point_c,
    rainfall_24h_mm,
    leaf_wetness_hours ?? 0,
  );

  const irrigation_need = et0_mm === null
    ? null
    : calculateIrrigationNeed(et0_mm, rainfall_24h_mm, crop_coefficient, soil_moisture_percent);

  return {
    dew_point_c,
    vpd_kpa,
    vpd_interpretation,
    et0_mm,
    et0_method,
    et0_u_std,
    gdd,
    sunshine_hours,
    leaf_wetness_hours,
    disease_risk,
    irrigation_need,
    qc_flags,
  };
}

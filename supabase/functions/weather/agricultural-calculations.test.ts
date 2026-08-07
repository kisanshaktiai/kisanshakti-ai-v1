/**
 * Deno tests for the agricultural science module.
 * Run: supabase--test_edge_functions (functions: ["weather"])
 */
import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  calculateAllAgriculturalIndices,
  calculateDailyGDD,
  calculateET0PenmanMonteith,
  calculateSprayScore,
  calculateVPD,
  interpolateHourlyTemps,
  saturationVapourPressure,
  updateSoilWaterBucket,
  wetBulbStull,
} from "./agricultural-calculations.ts";
import { REGISTRY_FALLBACK } from "./sci-methods.ts";

const methods = REGISTRY_FALLBACK;

// (1) FAO-56 Example 18 — Bangkok, April
Deno.test("FAO-56 PM matches Example 18 (Bangkok) = 5.72 mm/day", () => {
  const r = calculateET0PenmanMonteith({
    tmax_c: 34.8,
    tmin_c: 25.6,
    ea_kpa: 2.85,
    wind_2m_ms: 2,
    solar_rad_mj: 22.65,
    elevation_m: 2,
    latitude: 13.73,
    day_of_year: 105, // mid-April
  }, methods);

  assert(r.et0 !== null, "ET0 must be computed");
  assertAlmostEquals(r.et0 as number, 5.72, 0.1);
  assertEquals(r.method, "ET0_FAO56_PM@1.0");
  assert((r.u_std ?? 0) > 0, "u_std must be propagated");
});

// (2) VPD / Tetens
Deno.test("Tetens es and VPD at 25C / 50% RH", () => {
  const es = saturationVapourPressure(25, methods);
  assertAlmostEquals(es, 3.168, 0.005);
  assertAlmostEquals(calculateVPD(25, 50, methods), 1.584, 0.01);
});

// (3) GDD modified-method edges
Deno.test("GDD edges: Tmax below base = 0, Tmin above cap = cap - base", () => {
  assertEquals(calculateDailyGDD(8, 2, 10, 30), 0);
  assertEquals(calculateDailyGDD(38, 32, 10, 30), 20);
});

// (4) Soil-water bucket mass balance
Deno.test("bucket mass balance and drainage", () => {
  const inD = 30;
  const r = updateSoilWaterBucket(inD, { etcMm: 5, rainMm: 8, irrigationMm: 4, runoffMm: 2 }, methods);
  const expected = inD - 8 - 4 + 5 + 2;
  assertAlmostEquals(r.depletionMm, expected, 1e-9);
  assertEquals(r.drainageMm, 0);

  const wet = updateSoilWaterBucket(3, { etcMm: 4, rainMm: 40, irrigationMm: 0, runoffMm: 5 }, methods);
  assertEquals(wet.depletionMm, 0);
  assertAlmostEquals(wet.drainageMm, -(3 - 40 - 0 + 4 + 5), 1e-9);
});

// (5) Spray hard blocks
Deno.test("spray hard blocks each force score 0", () => {
  const ok = calculateSprayScore({ wind_2m_ms: 2.5, temp_c: 26, rh_pct: 65, rain_prob_pct: 5, rain_next6h_mm: 0 }, methods);
  assert(ok.score > 0, "baseline conditions must be sprayable");

  const wind = calculateSprayScore({ wind_2m_ms: 6, temp_c: 26, rh_pct: 65 }, methods);
  assertEquals(wind.score, 0);
  assert(wind.blocked_by.includes("WIND_TOO_HIGH"));

  const dryHot = calculateSprayScore({ wind_2m_ms: 2, temp_c: 42, rh_pct: 10 }, methods);
  assertEquals(dryHot.score, 0);
  assert(dryHot.blocked_by.includes("DELTA_T_TOO_HIGH"));

  const rainProb = calculateSprayScore({ wind_2m_ms: 2, temp_c: 26, rh_pct: 65, rain_prob_pct: 75 }, methods);
  assertEquals(rainProb.score, 0);
  assert(rainProb.blocked_by.includes("RAIN_PROBABLE"));

  const rain6 = calculateSprayScore({ wind_2m_ms: 2, temp_c: 26, rh_pct: 65, rain_next6h_mm: 1.2 }, methods);
  assertEquals(rain6.score, 0);
  assert(rain6.blocked_by.includes("RAIN_EXPECTED_6H"));
});

// (6) Stull wet bulb
Deno.test("Stull wet-bulb 20C / 50% RH ~ 13.7C", () => {
  assertAlmostEquals(wetBulbStull(20, 50), 13.7, 0.7);
});

// (7) Sine interpolation
Deno.test("sine interpolation preserves Tmax and Tmin", () => {
  const h = interpolateHourlyTemps(38, 22);
  assertEquals(h.length, 24);
  assertAlmostEquals(Math.max(...h), 38, 1e-9);
  assertAlmostEquals(Math.min(...h), 22, 1e-9);
  assertAlmostEquals(h[14], 38, 1e-9);
  assertAlmostEquals(h[5], 22, 1e-9);
});

// (D3) no fabricated diurnal range
Deno.test("D3: missing Tmax/Tmin yields null ET0/GDD with MISSING_TMAXMIN", () => {
  const idx = calculateAllAgriculturalIndices({
    temperature_c: 30,
    humidity_percent: 60,
    latitude: 16.7,
    day_of_year: 200,
  }, methods);

  assertEquals(idx.et0_mm, null);
  assertEquals(idx.gdd, null);
  assertEquals(idx.irrigation_need, null);
  assert(idx.qc_flags.includes("MISSING_TMAXMIN"));
});

// (D5) leaf wetness feeds the disease-risk path
Deno.test("D5: leaf wetness hours are computed and reach disease risk", () => {
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    rh: i < 14 ? 92 : 60,
    temp: 22,
    rain_mm: 0,
  }));
  const idx = calculateAllAgriculturalIndices({
    temperature_c: 24,
    temperature_max_c: 31,
    temperature_min_c: 20,
    humidity_percent: 88,
    latitude: 16.7,
    day_of_year: 200,
    hourly_series: hourly,
  }, methods);

  assertEquals(idx.leaf_wetness_hours, 14);
  assert(idx.disease_risk.factors.includes("PROLONGED_LEAF_WETNESS"));
});

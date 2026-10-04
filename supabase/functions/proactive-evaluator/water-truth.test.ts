/**
 * v130 (2026-10-04) — satellite water check, days-to-harvest gate, and the
 * watering plan sized from root-zone depletion.
 * Inputs mirror the live Shinghan Mal rows of 2026-10-04 (rice, direct seeded,
 * grain filling, 0.63 acre, depletion 51.06 of 51.06 mm, NDMI 0.2633 → 0.1825
 * over 20 days).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { emptyDerived, satelliteWaterVerdict } from "./env-derived.ts";
import { ruleApplies } from "./graph-advice.ts";
import { calculateIrrigationForLand } from "./irrigation.ts";

const PARAMS = {
  ndmi_change_min: 0.02, max_pass_gap_days: 30, min_evidence_rank: 1,
  surface_water_index_min: 0, surface_water_max_age_days: 10,
};
const freshPass = (ndmi: number, prev: number, gap = 20) => ({
  is_fresh: 1, evidence_rank: 3, ndmi, ndmi_previous: prev, ndmi_drop: prev - ndmi, pass_gap_days: gap,
});

Deno.test("satellite: canopy moisture fell beyond the noise limit → agrees with dry (1)", () => {
  const v = satelliteWaterVerdict(freshPass(0.1825, 0.2633), null, PARAMS, "2026-10-04");
  assertEquals(v.verdict, 1);
  assertEquals(v.basis, "canopy_moisture_fell");
});

Deno.test("satellite: canopy moisture rose → disagrees (-1)", () => {
  const v = satelliteWaterVerdict(freshPass(0.30, 0.22), null, PARAMS, "2026-10-04");
  assertEquals(v.verdict, -1);
});

Deno.test("satellite: change inside the noise limit → no basis (0)", () => {
  assertEquals(satelliteWaterVerdict(freshPass(0.200, 0.205), null, PARAMS, "2026-10-04").verdict, 0);
});

Deno.test("satellite: open water on a recent pass → disagrees (-1) even without a fresh NDMI pair", () => {
  const v = satelliteWaterVerdict(
    { is_fresh: 0, evidence_rank: 0, ndmi: null, ndmi_previous: null, ndmi_drop: null, pass_gap_days: null },
    { acquisition_date: "2026-10-01", value_p90: 0.12, valid_fraction: 1 }, PARAMS, "2026-10-04");
  assertEquals(v.verdict, -1);
  assertEquals(v.basis, "surface_water_visible");
});

Deno.test("satellite: old open-water pass or stale NDMI pass → no basis (0)", () => {
  const old = satelliteWaterVerdict(
    { is_fresh: 0, evidence_rank: 3, ndmi: 0.1, ndmi_previous: 0.3, ndmi_drop: 0.2, pass_gap_days: 10 },
    { acquisition_date: "2026-09-01", value_p90: 0.2, valid_fraction: 1 }, PARAMS, "2026-10-04");
  assertEquals(old.verdict, 0);
});

Deno.test("satellite: no approved params → no basis (0), rules behave as before", () => {
  assertEquals(satelliteWaterVerdict(freshPass(0.1825, 0.2633), null, null, "2026-10-04").verdict, 0);
});

const row = (extra: Record<string, unknown>) => ({
  is_active: true, is_farmer_servable: true, input_class: "none",
  stage_applicable: ["grain_filling", "maturity"], cultivation_method_applicable: ["any"],
  ...extra,
});
const land = (dth: number | null) => ({
  crop_code: "rice", stage: "grain_filling", das: 118, cultivation_method: "direct_seeded",
  region_code: "IN-MH", days_to_harvest: dth,
});

Deno.test("harvest gate: a row with days_to_harvest_min 30 is not shown 22 days before harvest", () => {
  assertEquals(ruleApplies(row({ crop_age_days_min: 35, crop_age_days_max: 130, days_to_harvest_min: 30 }), land(22)), false);
  assertEquals(ruleApplies(row({ crop_age_days_min: 35, crop_age_days_max: 130, days_to_harvest_min: 30 }), land(45)), true);
});

Deno.test("harvest gate: a row with days_to_harvest_max 30 is shown 22 days before harvest, fails closed when unknown", () => {
  assertEquals(ruleApplies(row({ region_code: "IN-MH", days_to_harvest_max: 30 }), land(22)), true);
  assertEquals(ruleApplies(row({ region_code: "IN-MH", days_to_harvest_max: 30 }), land(null)), false);
});

Deno.test("harvest gate: rows without a harvest window are unaffected", () => {
  assertEquals(ruleApplies(row({ crop_age_days_min: 110, crop_age_days_max: 150 }), land(null)), true);
});

const METHODS = {
  irrigation: { efficiency: { default: 0.55, FLOOD: 0.45 }, flow_rate_lph: { default: 20000 }, cycle_days: { default: 7 } },
  urgency: { immediate: { swsi_gte: 0.75 }, today: { swsi_gte: 0.55 }, tomorrow: { swsi_gte: 0.35 } },
  infiltration: { min_actionable_depth_mm: 8 },
  satWater: null,
};

Deno.test("watering plan: sized from root-zone depletion and the land's own area", () => {
  const derived = { ...emptyDerived(), root_depletion: 51.06, water_deficit: 3.6, infiltration_cap: 60, swsi: 1 };
  const plan = calculateIrrigationForLand(
    { derived, weather: { temp: 22.9 }, ndvi: 0.695, irrigation_type: "Manual", area_acres: 0.63 }, METHODS);
  assert(plan !== null, "a full bucket deficit must give a plan (the one-day 3.6 mm gave none)");
  const appliedMm = 51.06 / 0.55;
  assertEquals(plan!.water_liters_per_acre, Math.round(appliedMm * 4047));
  assertEquals(plan!.water_liters_total, Math.round(Math.round(appliedMm * 4047) * 0.63));
  assertEquals(plan!.applications, 2); // 92.8 mm over a 60 mm single-application cap
  assertEquals(plan!.urgency, "IMMEDIATE");
});

Deno.test("watering plan: no land area → no litres (never an assumed 1 acre)", () => {
  const derived = { ...emptyDerived(), root_depletion: 51.06, swsi: 1 };
  assertEquals(calculateIrrigationForLand(
    { derived, weather: { temp: 22.9 }, ndvi: 0.695, irrigation_type: "Manual", area_acres: null }, METHODS), null);
});

// CHANGE LOG
// 2026-10-02 — Proactive-alert audit regression locks (evaluator v128):
//   evidence gates in evaluateEnvRule (NDVI freshness/support, verified water
//   state, case-insensitive crop_in), the water-state walk, and advice taken
//   only from the hypothesis → rule graph with the chat lane's applicability
//   gates. Fixture rows are copies of live rows seen in the audit (rice DSR,
//   IN-MH, DAS 116, grain_filling).

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  emptyDerived,
  type EnvEvalContext,
  evaluateEnvRule,
  isWaterStateVerified,
  type WaterStateRow,
} from "../../../supabase/functions/proactive-evaluator/env-derived.ts";
import {
  carriesDose,
  readGraphLink,
  selectGraphAdvice,
  type GraphData,
} from "../../../supabase/functions/proactive-evaluator/graph-advice.ts";

const day = (offset: number) => new Date(Date.UTC(2026, 9, 1) - offset * 86400000).toISOString().slice(0, 10);
const row = (offset: number, depl: number, extra: Partial<WaterStateRow> = {}): WaterStateRow => ({
  metric_date: day(offset), root_depletion_mm: depl, taw_mm: 51.06, irrigation_mm_applied: 0, irrigation_events_used: 0, ...extra,
});

// ── water state ─────────────────────────────────────────────────────────────

Deno.test("water state: ceiling hit in window without irrigation stays unverified after a light shower", () => {
  // Kodoli Mala, 2026-09-26 .. 10-01: pinned at TAW, then 6.5 mm effective rain → 46.5, 49.6.
  const rows = [row(0, 49.64), row(1, 46.53), row(2, 51.06), row(3, 51.06), row(4, 51.06)];
  assertEquals(isWaterStateVerified(rows), false);
});

Deno.test("water state: an irrigation event in the window makes it verified", () => {
  const rows = [row(0, 49.64), row(1, 46.53, { irrigation_events_used: 1, irrigation_mm_applied: 30 }), row(2, 51.06)];
  assertEquals(isWaterStateVerified(rows), true);
});

Deno.test("water state: profile back at field capacity resets the history", () => {
  const rows = [row(0, 20), row(1, 0), row(2, 51.06), row(3, 51.06)];
  assertEquals(isWaterStateVerified(rows), true);
});

Deno.test("water state: no rows is unknown, not verified", () => {
  assertEquals(isWaterStateVerified([]), null);
});

// ── env rule gates ──────────────────────────────────────────────────────────

const IRRIGATION_TRIGGER_FAO56 = {
  all: [{ op: "not_null", path: "derived.raw_mm" }, { op: "gte_field", path: "derived.root_depletion", field: "derived.raw_mm" }],
  metadata: { engine: "env-intelligence", method: "SOIL_WATER_BALANCE_FAO56@1.0" },
};
const PRO_NDVI_DROP = { all: [{ op: "gte", path: "ndvi.drop", value: 0.15 }], metadata: { engine: "env-intelligence" } };
const FLOWERING_HEAT_RISK = {
  all: [{ op: "gt", path: "derived.heat_stress_dh", value: 0 }],
  crop_in: ["rice", "maize", "cotton"],
  metadata: { engine: "env-intelligence" },
};

const baseCtx = (): EnvEvalContext & { ndvi: NonNullable<EnvEvalContext["ndvi"]> } => ({
  crop_code: "RICE", das: 116, derived: emptyDerived(), weather: {}, forecast: {},
  ndvi: { value: 0.474, previous: 0.698, drop: 0.224 },
});

// 2026-10-02 field check: Kodoli Mala's bucket at ceiling after a month without
// rain WAS water stress (agronomist on the land). The unverified flag is
// evidence on the card, never a reason to stay silent.
Deno.test("irrigation rule fires on an unverified water state past RAW", () => {
  const ctx = baseCtx();
  ctx.derived = { ...emptyDerived(), root_depletion: 49.64, raw_mm: 25.53, water_state_verified: false };
  const r = evaluateEnvRule("IRRIGATION_TRIGGER_FAO56", IRRIGATION_TRIGGER_FAO56, ctx);
  assertEquals(r.fired, true);
  assert(!r.reasoning.includes("unverified"));
});

Deno.test("irrigation rule fires on a verified water state past RAW", () => {
  const ctx = baseCtx();
  ctx.derived = { ...emptyDerived(), root_depletion: 30, raw_mm: 25.53, water_state_verified: true };
  assertEquals(evaluateEnvRule("IRRIGATION_TRIGGER_FAO56", IRRIGATION_TRIGGER_FAO56, ctx).fired, true);
});

Deno.test("NDVI drop on a 27-day-old pass does not fire", () => {
  const ctx = baseCtx();
  ctx.ndvi = { ...ctx.ndvi, is_fresh: 0, age_days: 27, evidence_rank: 3 };
  const r = evaluateEnvRule("PRO_NDVI_DROP", PRO_NDVI_DROP, ctx);
  assertEquals(r.fired, false);
  assert(r.reasoning.includes("not fresh"));
});

Deno.test("NDVI drop on a fresh pass without spatial support does not fire", () => {
  const ctx = baseCtx();
  ctx.ndvi = { ...ctx.ndvi, is_fresh: 1, age_days: 3, evidence_rank: 0 };
  assertEquals(evaluateEnvRule("PRO_NDVI_DROP", PRO_NDVI_DROP, ctx).fired, false);
});

Deno.test("NDVI drop on a fresh, supported pass fires", () => {
  const ctx = baseCtx();
  ctx.ndvi = { ...ctx.ndvi, is_fresh: 1, age_days: 3, evidence_rank: 3 };
  assertEquals(evaluateEnvRule("PRO_NDVI_DROP", PRO_NDVI_DROP, ctx).fired, true);
});

Deno.test("crop_in is case-insensitive (lower-case author, upper-case context)", () => {
  const ctx = baseCtx();
  ctx.derived = { ...emptyDerived(), heat_stress_dh: 4 };
  assertEquals(evaluateEnvRule("FLOWERING_HEAT_RISK", FLOWERING_HEAT_RISK, ctx).fired, true);
  ctx.crop_code = "WHEAT";
  assertEquals(evaluateEnvRule("FLOWERING_HEAT_RISK", FLOWERING_HEAT_RISK, ctx).fired, false);
});

// ── graph advice ────────────────────────────────────────────────────────────

const rule = (r: Record<string, unknown>) => ({
  is_active: true, is_farmer_servable: true, rule_intent: "recommendation", input_class: "none",
  dosage_per_acre: null, active_ingredient: null, region_code: null, cultivation_method_applicable: ["any"], ...r,
});

const graph = (): GraphData => ({
  hypothesesByCrop: new Map([["rice", [
    { hypothesis_id: "HYP_RICE_DROUGHT_001", crop_code: "rice", hypothesis_type: "STRESS", cause_name_en: "Drought stress in rice", applicability: null },
    { hypothesis_id: "HYP_RICE_TRANSPLANT_SHOCK_001", crop_code: "rice", hypothesis_type: "STRESS", cause_name_en: "Transplant shock", applicability: { cultivation_method: { in: ["transplanted"] } } },
  ]]]),
  edgesByHypothesis: new Map([
    ["HYP_RICE_DROUGHT_001", [
      { hypothesis_id: "HYP_RICE_DROUGHT_001", rule_id: "RICE_IRRIG_AWD_001", priority: 2 },
      { hypothesis_id: "HYP_RICE_DROUGHT_001", rule_id: "RICE_IRRIG_CRITICAL_STAGES_TN_001", priority: 2 },
      { hypothesis_id: "HYP_RICE_DROUGHT_001", rule_id: "RICE_DIAG_WILTING_001", priority: 2 },
      { hypothesis_id: "HYP_RICE_DROUGHT_001", rule_id: "RICE_NDVI_COLLAPSE_BLOCK_001", priority: 1 },
      { hypothesis_id: "HYP_RICE_DROUGHT_001", rule_id: "RICE_DOSE_ROW", priority: 1 },
    ]],
    ["HYP_RICE_TRANSPLANT_SHOCK_001", [{ hypothesis_id: "HYP_RICE_TRANSPLANT_SHOCK_001", rule_id: "RICE_TP_ONLY", priority: 1 }]],
  ]),
  rulesById: new Map<string, Record<string, unknown>>([
    ["RICE_IRRIG_AWD_001", rule({ rule_id: "RICE_IRRIG_AWD_001", category: "irrigation", stage_applicable: ["tillering", "panicle_initiation", "grain_filling"], growth_stage: "tillering", crop_age_days_min: 35, crop_age_days_max: 130, action_text: "AWD METHOD …" })],
    ["RICE_IRRIG_CRITICAL_STAGES_TN_001", rule({ rule_id: "RICE_IRRIG_CRITICAL_STAGES_TN_001", category: "irrigation", stage_applicable: ["grain_filling"], region_code: "IN-TN" })],
    ["RICE_DIAG_WILTING_001", rule({ rule_id: "RICE_DIAG_WILTING_001", category: "diagnosis", stage_applicable: ["tillering", "flowering"], crop_age_days_min: 35, crop_age_days_max: 110 })],
    ["RICE_NDVI_COLLAPSE_BLOCK_001", rule({ rule_id: "RICE_NDVI_COLLAPSE_BLOCK_001", category: "decision_gate", rule_intent: "block", stage_applicable: ["grain_filling"], crop_age_days_min: 35, crop_age_days_max: 130 })],
    ["RICE_DOSE_ROW", rule({ rule_id: "RICE_DOSE_ROW", category: "irrigation", stage_applicable: ["grain_filling"], input_class: "nutrient_synthetic", dosage_per_acre: "10 kg" })],
    ["RICE_TP_ONLY", rule({ rule_id: "RICE_TP_ONLY", category: "irrigation", stage_applicable: ["grain_filling"] })],
  ]),
});

const kodoli = { crop_code: "RICE", stage: "GRAIN_FILLING", das: 116, cultivation_method: "direct_seeded", region_code: "IN-MH" };

Deno.test("graph advice: only applicable, dose-free rows, strongest edge first", () => {
  const link = readGraphLink({ metadata: { graph: { hypothesis_ids: ["HYP_RICE_DROUGHT_001", "HYP_RICE_TRANSPLANT_SHOCK_001"] } } })!;
  const advice = selectGraphAdvice(graph(), link, kodoli, 5);
  assertEquals(advice.items.map((i) => i.rule_id), ["RICE_NDVI_COLLAPSE_BLOCK_001", "RICE_IRRIG_AWD_001"]);
  // transplant-only hypothesis excluded for a direct-seeded field
  assertEquals(advice.basis.hypotheses, ["HYP_RICE_DROUGHT_001"]);
});

Deno.test("graph advice: rule_categories narrows to the alert's subject", () => {
  const link = readGraphLink({ metadata: { graph: { hypothesis_types: ["STRESS"], rule_categories: ["irrigation"] } } })!;
  assertEquals(selectGraphAdvice(graph(), link, kodoli, 5).items.map((i) => i.rule_id), ["RICE_IRRIG_AWD_001"]);
});

Deno.test("graph advice: unknown region keeps region-free rows only; unknown stage gives nothing", () => {
  const link = readGraphLink({ metadata: { graph: { hypothesis_ids: ["HYP_RICE_DROUGHT_001"] } } })!;
  const noRegion = selectGraphAdvice(graph(), link, { ...kodoli, region_code: null }, 5);
  assert(!noRegion.items.some((i) => i.rule_id === "RICE_IRRIG_CRITICAL_STAGES_TN_001"));
  assertEquals(selectGraphAdvice(graph(), link, { ...kodoli, stage: null }, 5).items.length, 0);
});

Deno.test("graph advice: a dose-bearing row is never attached", () => {
  assertEquals(carriesDose({ input_class: "none", dosage_per_acre: null, active_ingredient: null }), false);
  assertEquals(carriesDose({ input_class: "synthetic" }), true);
  assertEquals(carriesDose({ input_class: "none", active_ingredient: "propiconazole" }), true);
});

Deno.test("graph advice: direct rule links use the land's crop rows only", () => {
  const g = graph();
  g.rulesById.set("RICE_NDVI_COLLAPSE_BLOCK_001", { ...g.rulesById.get("RICE_NDVI_COLLAPSE_BLOCK_001")!, crop_code: "rice" });
  g.rulesById.set("WHEAT_NDVI_COLLAPSE_BLOCK_001", rule({ rule_id: "WHEAT_NDVI_COLLAPSE_BLOCK_001", crop_code: "wheat", stage_applicable: ["grain_filling"], crop_age_days_min: 50, crop_age_days_max: 130 }));
  const link = readGraphLink({ metadata: { graph: { rule_ids: ["RICE_NDVI_COLLAPSE_BLOCK_001", "WHEAT_NDVI_COLLAPSE_BLOCK_001"], required: true } } })!;
  assertEquals(selectGraphAdvice(g, link, kodoli, 5).items.map((i) => i.rule_id), ["RICE_NDVI_COLLAPSE_BLOCK_001"]);
  // after the rule's authored age window (senescence), the graph has nothing to say
  assertEquals(selectGraphAdvice(g, link, { ...kodoli, das: 140 }, 5).items.length, 0);
});

Deno.test("graph link: absent or empty link is null", () => {
  assertEquals(readGraphLink({ metadata: {} }), null);
  assertEquals(readGraphLink({ metadata: { graph: { required: true } } }), null);
});

/**
 * Deno tests for the P0 water-state repairs.
 * Run: supabase--test_edge_functions (functions: ["weather"])
 *
 * Covers:
 *   1. FAO-56 bucket mass balance with real irrigation
 *   2. root-depletion ratchet regression (two consecutive days)
 *   3. volume_litres → depth conversion via land area
 *   4. pump-runtime event without discharge is SKIPPED, never estimated
 *   5. no maize/generic Kc fallback (Marathi label → canonical → Kc)
 *   6. unknown crop → null Kc, null ETc, KC_UNRESOLVED reason
 *   7. DEPLETION_UNVERIFIED_CEILING guard + water-confidence cap
 *   8. root-zone irrigation authority invariant (null when uncomputable)
 *   9. multilingual canonical crop resolution (exact label / synonym),
 *      driven by DB-shaped fixtures — the synonym lives in the fixture
 *      "database", never in resolver code.
 */
import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  calculateET0PenmanMonteith,
  resolveKc,
  updateSoilWaterBucket,
} from "./agricultural-calculations.ts";
import { REGISTRY_FALLBACK, type MethodsMap } from "./sci-methods.ts";
import {
  computeRunoffMm,
  DEPLETION_UNVERIFIED_CONFIDENCE_CAP,
  irrigationUrgencyFromDepletion,
  isDepletionUnverifiedCeiling,
  kcUnresolvedReason,
  REASON_DEPLETION_UNVERIFIED_CEILING,
  REASON_IRRIG_NO_DISCHARGE,
  REASON_RUNOFF_UNMODELLED,
  rootZoneIrrigationDecision,
  summarizeIrrigationEvents,
} from "./water-events.ts";
import { resolveCropCanonical } from "../_shared/crop-resolver.ts";

const methods = REGISTRY_FALLBACK;

// ───────────────────────────────────────────────────────────────────────────
// Minimal thenable mock of the Supabase query builder for the shared crop
// resolver. Rows are the "database"; the resolver must find matches itself.
// ───────────────────────────────────────────────────────────────────────────
function queryMock(rows: Array<Record<string, unknown>>) {
  const result = { data: rows, error: null };
  // deno-lint-ignore no-explicit-any
  const q: any = {
    then: (onF: unknown, onR: unknown) =>
      Promise.resolve(result).then(onF as never, onR as never),
    eq: () => q,
    limit: () => q,
  };
  return q;
}
function mockSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
  return { from: (t: string) => ({ select: () => queryMock(tables[t] ?? []) }) };
}

/** Registry-shaped fixture for the approved SWSI urgency breaks. */
const methodsWithSwsi: MethodsMap = {
  ...REGISTRY_FALLBACK,
  SWSI_STAGE_SENSITIVITY: {
    method_id: "SWSI_STAGE_SENSITIVITY", version: "1.0",
    params: { class_breaks: { mild: 0.35, moderate: 0.55, severe: 0.75 } },
  },
};

// (1) bucket mass balance with real irrigation
Deno.test("1. bucket: prev 70, ETc 5, rain 0, irrigation 30 -> depletion 45", () => {
  const r = updateSoilWaterBucket(70, { etcMm: 5, rainMm: 0, irrigationMm: 30, runoffMm: 0 }, methods);
  assertAlmostEquals(r.depletionMm, 45, 1e-9);
});

// (2) ratchet regression — day 2 with a valid irrigation event must fall below day 1
Deno.test("2. ratchet regression: irrigation event lowers depletion next day", () => {
  const day1 = updateSoilWaterBucket(70, { etcMm: 5, rainMm: 0, irrigationMm: 0, runoffMm: 0 }, methods).depletionMm;
  const ev = summarizeIrrigationEvents([{ applied_depth_mm: 30, measured: true, source: "meter" }], 1);
  assertEquals(ev.eventsUsed, 1);
  assertAlmostEquals(ev.irrigationMm, 30, 1e-9);
  const day2 = updateSoilWaterBucket(day1, { etcMm: 5, rainMm: 0, irrigationMm: ev.irrigationMm, runoffMm: 0 }, methods).depletionMm;
  assert(day2 < day1, `day2 (${day2}) must be < day1 (${day1})`);
});

// (3) volume → depth conversion (18 500 L over 1 acre ≈ 4.57 mm)
Deno.test("3. volume_litres=18500 over 1 acre -> 4.57 mm", () => {
  const ev = summarizeIrrigationEvents([{ volume_litres: 18500 }], 1);
  assertEquals(ev.eventsUsed, 1);
  assertAlmostEquals(ev.irrigationMm, 4.57, 0.01);
});

// (4) pump runtime without discharge -> skipped, reason, depth unchanged
Deno.test("4. duration without pump discharge is skipped (no estimation)", () => {
  const ev = summarizeIrrigationEvents([{ duration_minutes: 45 }], 2);
  assertEquals(ev.eventsUsed, 0);
  assertEquals(ev.irrigationMm, 0);
  assert(ev.reasons.includes(REASON_IRRIG_NO_DISCHARGE));
});

// (4b) volume without land area -> skipped with NO_AREA
Deno.test("4b. volume event without land area is skipped (no fabrication)", () => {
  const ev = summarizeIrrigationEvents([{ volume_litres: 18500 }], null);
  assertEquals(ev.eventsUsed, 0);
  assertEquals(ev.irrigationMm, 0);
  assert(ev.reasons.includes("IRRIG_EVENT_NO_AREA"));
});

// (5) no maize fallback — Marathi label must go through canonical identity first
Deno.test("5. resolveKc never falls back to maize; canonical path resolves sugarcane", async () => {
  // Raw vernacular label is NOT a registry key: null, not the old 1.20 maize value.
  const direct = resolveKc("ऊस", "mid", null, methods);
  assert(direct === null, "vernacular label must NOT hit any Kc fallback");
  assert(direct !== null ? direct.kcStatic !== 1.2 : true);

  // Pipeline-level path: canonical identity via the shared DB resolver, then Kc.
  const sb = mockSupabase({
    crops: [{ id: "c1", value: "sugarcane", label: "Sugarcane", label_mr: "ऊस" }],
    crop_synonyms: [],
  });
  const match = await resolveCropCanonical(sb, "ऊस");
  assertEquals(match?.code, "sugarcane");
  const kc = resolveKc(match!.code, "mid", null, methods);
  assert(kc !== null);
  assertAlmostEquals(kc!.kcStatic, 1.25, 1e-9); // sugarcane mid, not maize 1.20
});

// (6) unknown crop absent from the approved Kc registry -> null Kc, null ETc
Deno.test("6. unknown crop -> resolveKc null, ETc null, KC_UNRESOLVED reason", () => {
  const kc = resolveKc("quinoa", "mid", null, methods); // not in KC_FAO56_TABLE12
  assertEquals(kc, null);

  // Pipeline composition: no Kc -> no ETc, even with a valid ET0.
  const et0 = calculateET0PenmanMonteith({
    tmax_c: 34.8, tmin_c: 25.6, ea_kpa: 2.85, wind_2m_ms: 2,
    solar_rad_mj: 22.65, elevation_m: 2, latitude: 13.73, day_of_year: 105,
  }, methods).et0;
  const etc = et0 !== null && kc !== null ? kc.kcStatic * et0 : null;
  assertEquals(etc, null);
  assert(kcUnresolvedReason("quinoa").includes("KC_UNRESOLVED:quinoa"));
});

// (7) depletion ceiling guard -> reason + water confidence capped at 0.3
Deno.test("7. depletion >= 0.99*TAW with no 21d irrigation -> ceiling guard fires", () => {
  const taw = 100;
  const depletion = 0.99 * taw;
  assert(isDepletionUnverifiedCeiling(depletion, taw, 0, false));
  assertEquals(REASON_DEPLETION_UNVERIFIED_CEILING, "DEPLETION_UNVERIFIED_CEILING");

  // confidence cap behaviour (as applied in derive-pipeline)
  const rawConfidence = 0.9;
  const capped = Math.min(rawConfidence, DEPLETION_UNVERIFIED_CONFIDENCE_CAP);
  assert(capped <= 0.3);

  // guard must NOT fire when irrigation evidence exists
  assert(!isDepletionUnverifiedCeiling(depletion, taw, 12, false));
  assert(!isDepletionUnverifiedCeiling(depletion, taw, 0, true));
});

// (8) irrigation authority invariant
Deno.test("8. irrigation_needed === (root_depletion > raw); null when uncomputable", () => {
  assertEquals(rootZoneIrrigationDecision(50, 40), true);
  assertEquals(rootZoneIrrigationDecision(30, 40), false);
  assertEquals(rootZoneIrrigationDecision(null, 40), null);
  assertEquals(rootZoneIrrigationDecision(50, null), null);

  // urgency derives from the registry class breaks, null without them
  assertEquals(irrigationUrgencyFromDepletion(80, 100, methodsWithSwsi), "CRITICAL");
  assertEquals(irrigationUrgencyFromDepletion(60, 100, methodsWithSwsi), "HIGH");
  assertEquals(irrigationUrgencyFromDepletion(40, 100, methodsWithSwsi), "MEDIUM");
  assertEquals(irrigationUrgencyFromDepletion(10, 100, methodsWithSwsi), "LOW");
  assertEquals(irrigationUrgencyFromDepletion(10, 100, methods), null); // no breaks -> no invented scale
  assertEquals(irrigationUrgencyFromDepletion(null, 100, methodsWithSwsi), null);
});

// (8b) runoff from infiltration capacity; unmodelled when capacity absent
Deno.test("8b. runoff = max(0, rain - infiltration_cap); RUNOFF_UNMODELLED when null", () => {
  assertEquals(computeRunoffMm(50, 40), { runoffMm: 10, reason: null });
  assertEquals(computeRunoffMm(30, 40), { runoffMm: 0, reason: null });
  const un = computeRunoffMm(50, null);
  assertEquals(un.runoffMm, 0);
  assertEquals(un.reason, REASON_RUNOFF_UNMODELLED);
});

// (9) multilingual canonical resolution — Marathi label, English label, synonym.
// Fixtures ARE the database; the resolver code holds no translations.
Deno.test("9. canonical multilingual crop resolution (label exact / synonym)", async () => {
  const sb = mockSupabase({
    crops: [
      { id: "c1", value: "sugarcane", label: "Sugarcane", label_mr: "ऊस", is_active: true },
      { id: "c2", value: "groundnut", label: "Groundnut", is_active: true },
      { id: "c3", value: "rice", label: "Rice", local_name: "Paddy", is_active: true },
    ],
    crop_synonyms: [
      { id: "s1", crop_code: "rice", synonym: "तांदूळ", language: "mr" },
    ],
  });

  // Marathi label column
  const mr = await resolveCropCanonical(sb, "ऊस");
  assertEquals(mr?.code, "sugarcane");
  assertEquals(mr?.matchedVia, "crops.label_exact");

  // English label
  const en = await resolveCropCanonical(sb, "Groundnut");
  assertEquals(en?.code, "groundnut");

  // Synonym table (Marathi alias for rice) — found generically from the rows
  const syn = await resolveCropCanonical(sb, "तांदूळ");
  assertEquals(syn?.code, "rice");
  assertEquals(syn?.matchedVia, "crop_synonyms");

  // Unknown label -> null (callers emit CROP_CODE_UNRESOLVED, never a default crop)
  const none = await resolveCropCanonical(sb, "कुठलीही अज्ञात पीक");
  assertEquals(none, null);
});

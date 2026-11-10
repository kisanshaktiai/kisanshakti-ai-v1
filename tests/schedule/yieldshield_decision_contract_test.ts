import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isNoIrrigationDecision,
  canAdvanceNutrient,
  irrigationDeferralWithinStage,
} from "../../supabase/functions/schedule-reconciler/decision-contract.ts";

Deno.test("water:ok from the SQL decision engine reaches the no-irrigation branch", () => {
  assert(isNoIrrigationDecision("water:ok"));
  assert(isNoIrrigationDecision("water:no_irrigation"));
  assert(!isNoIrrigationDecision("water:no_data"));
  assert(!isNoIrrigationDecision("water:irrigate"));
});

Deno.test("WATCH observations never advance a nitrogen application", () => {
  assertEquals(canAdvanceNutrient({ status: "WATCH", action_code: "OBSERVE_BEFORE_INPUT" }), false);
  assertEquals(canAdvanceNutrient({ status: "DUE", action_code: "OBSERVE_BEFORE_INPUT" }), false);
  assertEquals(canAdvanceNutrient({ status: "DUE", action_code: "APPLY_NUTRIENT_VERIFIED" }), true);
});

Deno.test("declared irrigation stage end blocks out-of-window deferral", () => {
  assert(irrigationDeferralWithinStage("2026-09-29", "2026-09-01", 28));
  assert(!irrigationDeferralWithinStage("2026-10-01", "2026-09-01", 28));
  assert(!irrigationDeferralWithinStage("2026-09-10", null, 28));
});

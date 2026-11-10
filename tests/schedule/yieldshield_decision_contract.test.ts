import { describe, expect, it } from "vitest";
import {
  isNoIrrigationDecision, canAdvanceNutrient, irrigationDeferralWithinStage,
} from "../../supabase/functions/schedule-reconciler/decision-contract";

describe("YieldShield two-stage decision safety", () => {
  it("recognizes SQL water:ok and previous no_irrigation, never no_data", () => {
    expect(isNoIrrigationDecision("water:ok")).toBe(true);
    expect(isNoIrrigationDecision("water:no_irrigation")).toBe(true);
    expect(isNoIrrigationDecision("water:no_data")).toBe(false);
    expect(isNoIrrigationDecision("water:irrigate")).toBe(false);
  });
  it("does not advance fertilizer merely because an observation is WATCH", () => {
    expect(canAdvanceNutrient({status:"WATCH",action_code:"OBSERVE_BEFORE_INPUT"})).toBe(false);
    expect(canAdvanceNutrient({status:"DUE",action_code:"OBSERVE_BEFORE_INPUT"})).toBe(false);
    expect(canAdvanceNutrient({status:"DUE",action_code:"APPLY_NUTRIENT_VERIFIED"})).toBe(true);
  });
  it("never defers an irrigation card past its agronomy window", () => {
    expect(irrigationDeferralWithinStage("2026-09-29","2026-09-01",28)).toBe(true);
    expect(irrigationDeferralWithinStage("2026-09-30","2026-09-01",28)).toBe(false);
    expect(irrigationDeferralWithinStage("2026-09-15",null,28)).toBe(false);
  });
});

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertVarietyInjected,
  assertResponseHonorsVariety,
} from "../../supabase/functions/_shared/variety-assertion.ts";

const baseVariety: any = {
  variety_id: "v-1",
  name: "Co 86032",
  label_hi: "को 86032",
  label_mr: "को 86032",
  variety_code: "CO86032",
  maturity_days_min: 330,
  maturity_days_max: 360,
  resistance: [
    { pathogen: "Red Rot", level: "resistant" },
    { pathogen: "Smut", level: "moderate" },
  ],
  state_match: true,
  source: "exact",
};

Deno.test("pre-gate: passes when formatter receives same variety", () => {
  const r = assertVarietyInjected({
    land_context_variety_profile: baseVariety,
    formatter_variety_profile: baseVariety,
  });
  assertEquals(r.passed, true);
});

Deno.test("pre-gate: fails when variety dropped before formatter", () => {
  const r = assertVarietyInjected({
    land_context_variety_profile: baseVariety,
    formatter_variety_profile: null,
  });
  assertEquals(r.passed, false);
  assertEquals(r.violations[0].startsWith("VARIETY_INJECTION_DROPPED"), true);
});

Deno.test("pre-gate: passes when no variety on either side", () => {
  const r = assertVarietyInjected({
    land_context_variety_profile: null,
    formatter_variety_profile: null,
  });
  assertEquals(r.passed, true);
});

Deno.test("post-gate: passes when variety name is mentioned", () => {
  const r = assertResponseHonorsVariety(
    "तुमच्या Co 86032 साठी 340 दिवसांची तोडणी योग्य आहे.",
    baseVariety,
  );
  assertEquals(r.passed, true);
  assertEquals(r.checked.name_mentioned, true);
});

Deno.test("post-gate: blocks when variety name omitted", () => {
  const r = assertResponseHonorsVariety(
    "ऊसाची तोडणी ३४० दिवसांत करा.",
    baseVariety,
  );
  assertEquals(r.passed, false);
  assertEquals(r.checked.name_mentioned, false);
});

Deno.test("post-gate: blocks contradicting maturity window", () => {
  const r = assertResponseHonorsVariety(
    "Co 86032 will be ready in 90 days.",
    baseVariety,
  );
  assertEquals(r.passed, false);
  assertEquals(
    r.violations.some((v) => v.startsWith("VARIETY_MATURITY_CONTRADICTION")),
    true,
  );
});

Deno.test("post-gate: ignores unrelated day numbers (PHI etc) when name present", () => {
  const r = assertResponseHonorsVariety(
    "Co 86032: spray now, PHI 21 days, harvest at 340 days.",
    baseVariety,
  );
  assertEquals(r.passed, true);
});

Deno.test("post-gate: blocks resistance contradiction", () => {
  const r = assertResponseHonorsVariety(
    "Co 86032 is highly susceptible to red rot — treat aggressively.",
    baseVariety,
  );
  assertEquals(r.passed, false);
  assertEquals(
    r.violations.some((v) => v.startsWith("VARIETY_RESISTANCE_CONTRADICTION")),
    true,
  );
});

Deno.test("post-gate: passes trivially when no variety attached", () => {
  const r = assertResponseHonorsVariety("any response", null);
  assertEquals(r.passed, true);
});

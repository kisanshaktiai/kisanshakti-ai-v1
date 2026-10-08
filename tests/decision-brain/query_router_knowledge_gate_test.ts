import { assertEquals, assert } from "./assert.ts";
import { routeQuery } from "../../supabase/functions/ai-agriculture-chat/agents/query-router.ts";

Deno.test("knowledge lookup is not diagnostic evidence", () => {
  const r = routeQuery("Which pests attack rice?");
  assertEquals(r.route, "GENERAL_INFO");
  assert(r.context_hints.includes("KNOWLEDGE_LOOKUP"));
  assertEquals(r.requires_decision_brain, false);
});

Deno.test("observed pest remains diagnostic", () => {
  const r = routeQuery("BPH is on my rice, what should I spray?");
  assertEquals(r.route, "PEST_DISEASE_TREATMENT");
  assertEquals(r.requires_decision_brain, true);
});

Deno.test("fertilizer scheduling uses the decision-brain route", () => {
  const r = routeQuery("What fertilizer should I apply now?");
  assertEquals(r.route, "FERTILIZER_NUTRITION");
  assertEquals(r.requires_decision_brain, true);
});

Deno.test("weed observation is diagnostic, not taxonomy", () => {
  const r = routeQuery("Weeds are growing in my rice field, what should I do?");
  assertEquals(r.route, "PEST_DISEASE_TREATMENT");
  assertEquals(r.requires_decision_brain, true);
});

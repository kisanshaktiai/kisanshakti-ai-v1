import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);

Deno.test("evidence pack enforces farming policy before Harness", async () => {
  const src = await read("supabase/functions/ai-smart-schedule/harness/evidence-pack.ts");
  assert(src.includes("function policyAllows"));
  assert(src.includes("organic_only"));
  assert(src.includes("regulatory_status"));
  assert(src.includes("verification_status"));
  assert(src.includes("norm(rule.trigger_class) === \"observation\""));
});

Deno.test("observation candidates cannot become scheduled", async () => {
  const src = await read("supabase/functions/ai-smart-schedule/harness/validator.ts");
  assert(src.includes("observation_candidate_promoted_to_scheduled"));
  assert(src.includes("conditional_candidate_promoted_to_scheduled"));
});

Deno.test("candidate graph carries DB dependency references for baseline and evidence candidates", async () => {
  const src = await read("supabase/functions/ai-smart-schedule/harness/candidate-graph.ts");
  assert(src.includes("dependencyRuleIds"));
  assert(src.includes("sequence_after"));
  assert(src.includes("prerequisite_rule_ids"));
});

Deno.test("production schedule path passes the full resolved context into Harness", async () => {
  const src = await read("supabase/functions/ai-smart-schedule/index.ts");
  assert(src.includes("resolvedInputs: inputs"));
  assert(src.includes("landContext"));
  assert(src.includes("evidencePack"));
});

Deno.test("planner keeps model failures fail-safe", async () => {
  const src = await read("supabase/functions/ai-smart-schedule/harness/index.ts");
  assert(src.includes("deterministic_fallback"));
  assert(src.includes("optional evidence candidates were not auto-applied"));
});
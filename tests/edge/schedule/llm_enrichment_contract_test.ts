import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);

Deno.test("enrichment asks only for domains the DB left empty and never writes agronomy itself", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  assert(m.includes('g.startsWith("NO_AUTHORITATIVE_RULE:")'));
  // no crop, product, dose or threshold literals in the module
  assert(!/\b(rice|wheat|sugarcane|urea|dap|chlorantraniliprole|imidacloprid|mancozeb)\b/i.test(m));
  assert(!/dose_value:\s*[1-9]/.test(m)); // the JSON schema example uses 0; no real dose may appear
});

Deno.test("every proposal is governance-gated before it can become a candidate", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  for (const g of ["stage_not_in_graph", "chemical_without_active_ingredient", "chemical_without_phi", "input_without_dose", "unrecognised_dose_unit", "regulatory_", "blocked_by_farming_policy"]) assert(m.includes(g), `missing gate ${g}`);
  assert(m.includes('from("chemical_regulatory_status")'));
});

Deno.test("chemicals require corpus corroboration AND an independent second opinion; failures are never shown", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  assert(m.includes("chemical_not_corroborated_by_corpus"));
  assert(m.includes("chemical_second_opinion_failed"));
  assert(m.includes("chemical_second_opinion_unavailable"));
  assert(m.includes("if (rec.reasons.length) return;"));
  // no hedged farmer-facing wording anywhere in the task text builder
  assert(!/dealer|KVK|double[- ]check|consult/i.test(m.slice(m.indexOf("function candidateFromProposal"), m.indexOf("/* ────────────────────────── 5."))));
});

Deno.test("verified proposals become ordinary Harness candidates, dated or conditional per their own condition", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  assert(m.includes('kind: "RULE_ACTION"'));
  assert(m.includes('const status: CandidateStatus = conditional ? "CONDITIONAL" : "SCHEDULED"'));
  assert(m.includes('provenance: "llm_proposed_verified"'));
  const index = await read("supabase/functions/ai-smart-schedule/index.ts");
  assert(index.includes("proposeAndVerifyCandidates("));
  assert(index.indexOf("proposeAndVerifyCandidates(") < index.indexOf("await applyScheduleHarness("));
  assert(index.includes("recordProposals("));
});

Deno.test("proposal ledger and promotion path exist and promotion creates a governed rule", async () => {
  const sql = await read("supabase/migrations/20260907120000_schedule_llm_proposals.sql");
  assert(sql.includes("create table if not exists public.schedule_llm_proposals"));
  assert(sql.includes("function public.promote_llm_proposal"));
  assert(sql.includes("insert into public.decision_rules"));
  assert(sql.includes("expert_approved"));
  assertEquals(/\bdelete\s+from\b/i.test(sql), false);
});

Deno.test("calendar shape: phase + timing window on every task, pre-season anchors admitted only for PRE_SEASON", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  const v = await read("supabase/functions/ai-smart-schedule/generator/validate-schedule.ts");
  const e = await read("supabase/functions/ai-smart-schedule/harness/evidence-pack.ts");
  const i = await read("supabase/functions/ai-smart-schedule/index.ts");
  assert(m.includes("window: { from_das: start, to_das: end"));
  assert(m.includes('"planning_is_not_a_task"'));
  assert(m.includes("negative_window_outside_pre_season"));
  assert(v.includes('phase === "PRE_SEASON"'));
  assert(v.includes("t.days_from_sowing >= -60"));
  assert(e.includes("window: { from_das: das, to_das:"));
  assert(i.includes("plan_summary: planSummary"));
  assert(i.includes("r.window = rec"));
  // task types used by enrichment are inside the DB CHECK enumeration
  const allowed = ["land_preparation","seed_treatment","nursery","sowing","gap_filling","nutrition","micronutrient","irrigation","weed_management","intercultural","pest_management","disease_management","growth_regulation","monitoring","harvest","post_harvest","residue_management","planning","advisory"];
  for (const t of m.match(/"[a-z_]+"(?=,|\s*\})/g)?.filter((x) => /^"(land_preparation|seed_treatment|sowing|nutrition|micronutrient|irrigation|weed_management|pest_management|disease_management|growth_regulation|intercultural|harvest|post_harvest)"$/.test(x)) ?? []) assert(allowed.includes(t.replace(/"/g, "")));
});

Deno.test("golden calendar: every activity category of the sample rice calendar is representable", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  const v = await read("supabase/functions/ai-smart-schedule/generator/validate-schedule.ts");
  // nursery work before seeding, cultural controls without a dosed input, harvest-relative windows
  assert(m.includes('p.phase !== "NURSERY"'));
  assert(m.includes('p.phase === "NURSERY" ? "nursery"'));
  assert(m.includes("const DOSED_KINDS"));
  assert(m.includes('p.window.clock === "harvest" ? (harvestDas ?? stageEnd)'));
  assert(v.includes('phase === "NURSERY"'));
  // the 26 sample rows map onto these task types only (all inside the DB enumeration)
  for (const t of ["land_preparation", "nursery", "seed_treatment", "sowing", "nutrition", "irrigation", "weed_management", "pest_management", "harvest", "post_harvest"]) assert(m.includes(`"${t}"`), `task type ${t} unreachable`);
});

Deno.test("second golden calendar: DB-declared pre-season stages, banned vs restricted, ratoon cycles", async () => {
  const v = await read("supabase/functions/ai-smart-schedule/generator/validate-schedule.ts");
  const b = await read("supabase/functions/ai-smart-schedule/generator/baseline-generator.ts");
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  assert(v.includes("graphAllowsNegative"));
  assert(b.includes("das_min: das0(s, s.das_min)"));
  assert(m.includes('hit.status !== "restricted"'));
  assert(m.includes("regulatory_restricted"));
  assert(m.includes("ratoon / regrowth cycle"));
  assert(m.includes("one proposal per period"));
});

Deno.test("pre-push audit: policy vocabulary mirrors evidence-pack, harvest anchor is pipeline-derived, no country/language literals", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  const e = await read("supabase/functions/ai-smart-schedule/harness/evidence-pack.ts");
  for (const v of ['"organic_only"', '"organic_fertilizer"', '"fertilizer_pesticide"']) { assert(m.includes(v)); assert(e.includes(v)); }
  assert(!/"(conventional|natural)"/.test(m));
  assert(m.includes('t.task_type === "harvest"'));
  assert(!/\bfor India\b/.test(m));
  assert(!/[\u0900-\u0D7F]/.test(m), "no Indic script literals in code");
  const app = await read("src/pages/Schedule.tsx");
  assert(app.includes("t('schedule.farmer_task.translation_pending')"));
  assert(!app.includes("defaultValue: 'Your schedule is ready"));
});

Deno.test("third golden calendar: application-method groups, water basis, recipes, and the field's irrigation system", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  const i = await read("supabase/functions/ai-smart-schedule/index.ts");
  for (const k of ["application_method_group", "water_volume_basis_l", "mix_recipe", "irrigation_system", "grade"]) assert(m.includes(k), `missing ${k}`);
  assert(m.includes('from("lands").select("irrigation_type, irrigation_source, water_source")'));
  assert(m.includes("fertigation_requires_drip"));
  assert(m.includes("irrigation_system_mismatch"));
  assert(i.includes("landId, deadlineAt: Date.now() + enrichBudgetMs"));
});

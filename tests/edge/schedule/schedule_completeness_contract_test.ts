import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);

Deno.test("harness planner is deadline-aware and never sleeps on a rate limit", async () => {
  const llm = await read("supabase/functions/ai-smart-schedule/harness/llm-v3.ts");
  const harness = await read("supabase/functions/ai-smart-schedule/harness/index.ts");
  const index = await read("supabase/functions/ai-smart-schedule/index.ts");
  assert(llm.includes("deadlineAt"));
  assert(!/Retry-After/.test(llm.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
  assert(!/await sleep\(/.test(llm));
  assert(harness.includes("remaining() >= MIN_ATTEMPT_MS"));
  assert(index.includes("budgetMs: harnessBudgetMs"));
  assert(index.includes("time_plan"));
});

Deno.test("planner prompt states the full composition contract without agronomy", async () => {
  const llm = await read("supabase/functions/ai-smart-schedule/harness/llm-v3.ts");
  assert(llm.includes("appears in `sequence` exactly once"));
  assert(llm.includes("required=true keeps status SCHEDULED"));
  assert(!/\b(rice|wheat|urea|mop|dap|maharashtra|kg\/acre)\b/i.test(llm));
});

Deno.test("deterministic fallback keeps DB-classified conditional and uncovered scheduled candidates", async () => {
  const harness = await read("supabase/functions/ai-smart-schedule/harness/index.ts");
  assert(harness.includes('n.default_status === "CONDITIONAL"'));
  assert(harness.includes("!baselineTypes.has(n.task_type)"));
  assert(harness.includes("optional evidence candidates were not auto-applied"));
  assert(harness.includes("fallback(context, tasks)"));
});

Deno.test("scouting references no longer hide treatment rules from the evidence pack", async () => {
  const pack = await read("supabase/functions/ai-smart-schedule/harness/evidence-pack.ts");
  assert(pack.includes('existingTasks.filter((t) => t.task_type !== "monitoring")'));
  assert(pack.includes("farmerInstructions(rule, status)"));
  assert(pack.includes("NO_AUTHORITATIVE_RULE:"));
  assert(pack.includes("Number(v) > 0"));
});

Deno.test("fertilizer basal split is re-anchored only via DB clock origins and is always recorded", async () => {
  const gen = await read("supabase/functions/ai-smart-schedule/generator/baseline-generator.ts");
  const repo = await read("supabase/functions/ai-smart-schedule/db/agronomy-repo.ts");
  assert(repo.includes("getCropClockOrigins"));
  assert(repo.includes("fertilizer_context_mismatch:"));
  assert(gen.includes("clockOrigins.has(token) && token !== graphClock && establishmentStage"));
  assert(gen.includes("fertilizer_split_stage_remapped_to_establishment:"));
  assert(gen.includes("fertilizer_split_without_timing_skipped"));
  // no crop or stage name literal is used to drive the re-anchor
  assert(!/["'](transplanting|germination|sowing)["']/.test(gen.slice(gen.indexOf("const clockOrigins"), gen.indexOf("Strict split semantics"))));
});

Deno.test("nutrient doses carry basis and catalog-derived product equivalents, never invented products", async () => {
  const gen = await read("supabase/functions/ai-smart-schedule/generator/baseline-generator.ts");
  const repo = await read("supabase/functions/ai-smart-schedule/db/agronomy-repo.ts");
  assert(/nonZero\.length\s*!==\s*1/.test(repo) && repo.includes("PRIMARY.has(String(k).toUpperCase())"));
  assert(gen.includes("product_kg: Number((qty / (p.percent / 100)).toFixed(2))"));
  assert(gen.includes("nutrient_basis: basisKey"));
  const fertBlock = gen.slice(gen.indexOf("const straightProducts"), gen.indexOf("Irrigation plan (ONE recurring task per stage window)"));
  assert(fertBlock.length > 0);
  assert(!/urea|\bdap\b|\bmop\b|\bssp\b/i.test(fertBlock));
});

Deno.test("task language is owned by narration, never by the sync trigger", async () => {
  const sql = await read("supabase/migrations/20260905100000_crop_schedule_language_and_governance_fix.sql");
  const syncBody = sql.slice(sql.indexOf("function public.sync_schedule_task_context"), sql.indexOf("comment on function public.sync_schedule_task_context"));
  assert(!/NEW\.language\s*:=/.test(syncBody));
  assert(sql.includes("jsonb_set(m, '{gaps}', gaps, true)"));
  assert(sql.includes("r.cultivation_method_applicable && accepted"));
  assertEquals(sql.includes("cron.schedule"), false);
});

// The field-condition layer is now the decision layer (schedule-reconciler/decision-application.ts);
// its contracts live in decision_loop_contract_test.ts.

Deno.test("planner self-check covers every audited domain", async () => {
  const llm = await read("supabase/functions/ai-smart-schedule/harness/llm-v3.ts");
  const types = await read("supabase/functions/ai-smart-schedule/harness/types.ts");
  assert(llm.includes("audited_domains"));
  assert(llm.includes("domain_coverage"));
  assert(types.includes("domain_coverage?: Record<string, string>"));
});

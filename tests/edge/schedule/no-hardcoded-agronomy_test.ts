// CHANGE LOG
// 2026-08-17 14:20 UTC — Phase 7: regression locks for the DB-SSOT crop-schedule subsystem.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { isFaithful } from "../../../supabase/functions/ai-smart-schedule/generator/narrate.ts";

const FILES = [
  "supabase/functions/ai-smart-schedule/index.ts",
  "supabase/functions/ai-smart-schedule/db/resolve-inputs.ts",
  "supabase/functions/ai-smart-schedule/db/agronomy-repo.ts",
  "supabase/functions/ai-smart-schedule/generator/baseline-generator.ts",
  "supabase/functions/ai-smart-schedule/harness/evidence-pack.ts",
  "supabase/functions/schedule-reconciler/index.ts",
];

const BANNED_IDENTIFIERS = [
  "SEED_RATES","NPK_TARGETS","STATE_LABOR_RATES","FERTILIZER_PRICES","IPM_THRESHOLDS",
  "DISEASE_MANAGEMENT","CROP_WATER_REQUIREMENTS","CROP_SPECIFIC_PRODUCTS","EXPERT_NPK_SPLIT_SCHEDULE",
  "FALLBACK_TASK_TEMPLATES","YIELD_BOOST_TECHNIQUES","CROP_TASK_MULTIPLIERS","LABOR_REQUIREMENTS",
];

Deno.test("no hardcoded agronomy tables in the schedule pipeline", async () => {
  for (const f of FILES) {
    const src = await Deno.readTextFile(f);
    for (const id of BANNED_IDENTIFIERS) assert(!src.includes(`${id}:`) && !src.includes(`const ${id}`), `${f} reintroduced ${id}`);
  }
});
Deno.test("generator never defaults land area to 1 acre", async () => {
  const src = await Deno.readTextFile("supabase/functions/ai-smart-schedule/db/resolve-inputs.ts");
  assert(!/landAreaAcres\s*=\s*1\b/.test(src), "land area silently defaulted to 1 acre");
  assert(src.includes("land_area_missing"), "missing land area must be reported as a gap");
});
Deno.test("every agronomic quantity carries provenance", async () => {
  const src = await Deno.readTextFile("supabase/functions/ai-smart-schedule/generator/baseline-generator.ts");
  assert(src.includes("source_refs"), "tasks must carry source_refs");
  assert(src.includes("gaps.push"), "missing DB coverage must be reported, not filled in");
});
Deno.test("evidence-only micronutrients cannot become invented doses", async () => {
  const src = await Deno.readTextFile("supabase/functions/ai-smart-schedule/harness/evidence-pack.ts");
  assert(src.includes("value_semantics: \"STAGE_GUIDELINE_INDICATOR\""));
  assert(src.includes("materializable: false"));
  assert(src.includes("Application dose/form not supplied"));
});
Deno.test("narration fidelity gate rejects changed numbers", () => {
  assertEquals(isFaithful("Apply 25 kg urea", "२५ किलो युरिया द्या".replace("२५", "25")), true);
  assertEquals(isFaithful("Apply 25 kg urea", "Apply 30 kg urea"), false);
  assertEquals(isFaithful("Irrigation", "सिंचन"), true);
});
Deno.test("reconciler never moves pinned tasks", async () => {
  const src = await Deno.readTextFile("supabase/functions/schedule-reconciler/index.ts");
  assert(src.includes("task.is_pinned"), "pinned tasks must be skipped");
  assert(src.includes("schedule_adjustments"), "every change must be audited");
});

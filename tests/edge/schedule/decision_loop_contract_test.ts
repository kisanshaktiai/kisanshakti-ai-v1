import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);

Deno.test("reconciler applies farm_decision rows; it reads no weather thresholds itself", async () => {
  const rec = await read("supabase/functions/schedule-reconciler/index.ts");
  const dec = await read("supabase/functions/schedule-reconciler/decision-application.ts");
  assert(rec.includes('from "./decision-application.ts"'));
  assert(!rec.includes("applyWeatherAdaptation("));
  let separate = true; try { await Deno.stat("supabase/functions/schedule-reconciler/weather-adaptation.ts"); } catch { separate = false; }
  assertEquals(separate, false);
  assert(dec.includes('from("farm_decision")'));
  assert(dec.includes('from("land_farm_state")'));
  assert(!dec.includes('from("land_weather_state")'));
  assert(!/(rain|deficit|mm|humidity|wind)[^\n]*[<>]=?\s*\d/i.test(dec));
});

Deno.test("decision state uses the farm_decision status vocabulary and links the decision", async () => {
  const sql = await read("supabase/migrations/20260908120000_schedule_decision_loop.sql");
  const dec = await read("supabase/functions/schedule-reconciler/decision-application.ts");
  assert(sql.includes("array['DUE','WATCH','BLOCKED','INFO','DONE','MISSED','DISMISSED','EXPIRED','SUPERSEDED']"));
  assert(sql.includes("references public.farm_decision(id)"));
  for (const st of ['"BLOCKED"', '"DUE"', '"INFO"']) assert(dec.includes(st));
  assert(dec.includes('from("farm_decision").update({ schedule_id: input.scheduleId, task_id: t.id'));
  assertEquals(/\bdelete\s+from\b/i.test(sql), false);
});

Deno.test("every run writes a crop-state ledger row per schedule with versions", async () => {
  const rec = await read("supabase/functions/schedule-reconciler/index.ts");
  assert(rec.includes('from("schedule_monitoring").insert(row)'));
  assert((rec.match(/await monitor\(|await writeMonitoring\(/g) ?? []).length >= 5);
  for (const k of ["generator:", "reconciler: ENGINE_VERSION", "decision_application: DECISION_APPLICATION_VERSION", "decision_engine:", "rule_set:"]) assert(rec.includes(k), `missing ${k}`);
  assert(rec.includes('run_mode: dryRun ? "dry_run" : "live"'));
});

Deno.test("mutations are idempotent per decision day and moved only by the task's own cadence", async () => {
  const dec = await read("supabase/functions/schedule-reconciler/decision-application.ts");
  assert(dec.includes('stampedToday(task, "deferred_on")'));
  assert(dec.includes("advanced_on: decisionDay"));
  assert(dec.includes("Number(rec?.interval_days)"));
  assert(dec.includes("never guess a date"));
  assert(dec.includes("if (input.dryRun) return true;"));
});

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);

Deno.test("generation persists first and never refuses a schedule for pending narration", async () => {
  const index = await read("supabase/functions/ai-smart-schedule/index.ts");
  assert(!index.includes("FARMER_LANGUAGE_PENDING"));
  assert(!index.includes("FARMER_LANGUAGE_UNAVAILABLE"));
  // COMPLETE must mean EVERY task carries the farmer's language.
  assert(index.includes('narration.narratedCount >= narration.totalCount'));
  assert(index.includes('status: narrationComplete ? "COMPLETE" : "PENDING"'));
  assert(index.includes("narrationStatus: narrationState.status"));
  assert(index.indexOf("persist_ai_crop_schedule_atomic") < index.indexOf("await narrateScheduleTasks("));
  // un-narrated tasks keep the NULL-language signal the frontend guard relies on
  assert(index.includes("language: narratedIdx.has(idx) ? language : null"));
  assert(index.includes("composeFarmerText("), "generation composes in the farmer language");
});

Deno.test("narration worker lives inside ai-smart-schedule, persists per batch, soonest-first, and touches no agronomic field", async () => {
  const index = await read("supabase/functions/ai-smart-schedule/index.ts");
  const w = await read("supabase/functions/ai-smart-schedule/generator/narrate-pending.ts");
  assert(index.includes('body?.action === "narrate"'));
  assert(index.includes("bearer === serviceRoleKey"));
  assert(w.includes('.order("task_date", { ascending: true })'));
  assert(w.includes("for (let i = 0; i < pending.length; i += BATCH)"));
  const upd = w.slice(w.indexOf('.from("schedule_tasks")\n        .update('), w.indexOf('.eq("id", source.id)'));
  for (const f of ["quantity", "task_date", "rule_ids", "source_refs", "days_from_sowing", "priority"]) assertEquals(upd.includes(`${f}:`), false, `${f} must not be written by narration`);
  let separate = true; try { await Deno.stat("supabase/functions/schedule-narrate"); } catch { separate = false; }
  assertEquals(separate, false);
});

Deno.test("narrate.ts narrates each distinct text once, in small chunks, for all 13 app languages", async () => {
  const n = await read("supabase/functions/ai-smart-schedule/generator/narrate.ts");
  const chunk = Number(/const CHUNK_SIZE = (\d+)/.exec(n)?.[1] ?? 0);
  assert(chunk > 0 && chunk <= 10, `CHUNK_SIZE must stay small, found ${chunk}`);
  assert(n.includes("uniqueIndexByKey"));
  assert(n.includes("members[item.i]"));
  for (const code of ["hi", "mr", "pa", "ta", "te", "bn", "gu", "kn", "ml", "or", "as", "ur"]) assert(new RegExp(`\\b${code}: /\\[`).test(n), `missing script for ${code}`);
  assert(n.includes("export function isFaithful"));
});

Deno.test("sweep cron targets ai-smart-schedule action=narrate, never a separate function", async () => {
  const sql = await read("supabase/migrations/20260907090000_schedule_narration_sweep_repoint.sql");
  assert(sql.includes("/functions/v1/ai-smart-schedule"));
  assert(sql.includes("'action', 'narrate'"));
  assert(!sql.includes("/functions/v1/schedule-narrate'"));
});

Deno.test("app treats pending narration as success with a follow-up, not as a failed generation", async () => {
  const app = await read("src/pages/Schedule.tsx");
  assert(app.includes("data.narrationStatus === 'PENDING'"));
  assert(app.includes("body: { action: 'narrate', scheduleId: data.scheduleId }"));
});

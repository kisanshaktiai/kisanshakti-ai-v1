// Contract: a current live farm_decision must never stay linked to a cancelled / non-active schedule
// once the land's ACTIVE schedule has been reconciled (live bug: land Shinghan Mal kept a water:irrigate
// decision pointed at a cancelled schedule while lands.active_schedule_id held the new one).
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);
const DEC = "supabase/functions/schedule-reconciler/decision-application.ts";

Deno.test("the land's active_schedule_id is the authority; a non-active schedule run applies nothing", async () => {
  const dec = await read(DEC);
  assert(dec.includes('.from("lands").select("active_schedule_id")'), "must read lands.active_schedule_id");
  assert(dec.includes("if (activeScheduleId && activeScheduleId !== input.scheduleId)"));
  assert(dec.includes('skipped: "not_active_schedule"'));
  // the gate must run BEFORE any decision is read or rebound
  assert(dec.indexOf("not_active_schedule") < dec.indexOf('.from("farm_decision")'), "gate must precede decision reads");
});

Deno.test("stale-schedule decisions are rebound to the active schedule with task_id cleared", async () => {
  const dec = await read(DEC);
  const block = dec.slice(dec.indexOf("2b. STALE-SCHEDULE REBIND"), dec.indexOf("// 3. Pending tasks"));
  assert(block.length > 0, "rebind block must exist before task matching");
  assert(block.includes("if (d.schedule_id === input.scheduleId) continue;"));
  assert(block.includes("schedule_id: input.scheduleId, task_id: null"), "a link into another schedule must be cleared");
  assert(block.includes("d.task_id = null;"), "in-memory row must be cleared so re-matching happens");
  assert(block.includes("counters.rebound"));
  assert(block.includes("if (input.dryRun)") || block.includes("!input.dryRun"), "dry run must not write");
  // identity only — no agronomy, date arithmetic or quantity in the rebind
  assert(!/addDays|task_date|quantity|dose|mm|interval_days/.test(block));
});

Deno.test("only live statuses are rebound; terminal decisions stay historical", async () => {
  const dec = await read(DEC);
  assert(dec.includes('.in("status", ["DUE", "WATCH", "INFO", "BLOCKED"])'));
  assert(dec.includes("!d.valid_until || d.valid_until >= input.todayIso"));
  for (const t of ["DONE", "MISSED", "DISMISSED", "EXPIRED", "SUPERSEDED"]) {
    assert(!new RegExp(`in\\("status"[^\\)]*${t}`).test(dec), `${t} must never be selected for rebinding`);
  }
  assertEquals(/\bdelete\b\s*\(/.test(dec), false);
});

Deno.test("task_id is only ever re-matched to a task of the schedule being reconciled", async () => {
  const dec = await read(DEC);
  // tasks are read strictly from this schedule
  assert(dec.includes('.eq("schedule_id", input.scheduleId).eq("status", "pending")'));
  // linking writes this schedule's id and only fills a NULL task_id (stale ones were nulled above)
  assert(dec.includes('.update({ schedule_id: input.scheduleId, task_id: t.id'));
  assert(dec.includes('.is("task_id", null)'));
});

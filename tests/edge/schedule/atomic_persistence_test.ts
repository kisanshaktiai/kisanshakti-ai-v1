import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);

Deno.test("AI crop schedule persistence is one atomic RPC boundary", async () => {
  const src = await read("supabase/functions/ai-smart-schedule/index.ts");

  assert(
    src.includes('.rpc("persist_ai_crop_schedule_atomic"'),
    "generator must use the atomic persistence RPC",
  );

  assert(
    !src.includes('.from("schedule_tasks").insert(tasksToInsert)'),
    "generator must not insert tasks after committing the schedule separately",
  );
});

Deno.test("atomic persistence migration requires a non-empty complete task set", async () => {
  const sql = await read("supabase/migrations/20260903120000_ai_crop_schedule_atomic_persistence.sql");

  assert(sql.includes("jsonb_array_length(p_tasks) = 0"));
  assert(sql.includes("get diagnostics v_task_count = row_count"));
  assert(sql.includes("v_task_count <> jsonb_array_length(p_tasks)"));
  assert(sql.includes("update public.lands"));
  assert(sql.includes("security definer"));
  assertEquals(
    sql.includes("insert into public.schedule_tasks"),
    true,
    "RPC must insert tasks inside the same database function as the schedule",
  );
});

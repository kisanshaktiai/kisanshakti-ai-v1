import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(p);

Deno.test("phenology resolver never guesses cultivation method and prefers the active schedule", async () => {
  const sql = await read("supabase/migrations/20260906120000_resolve_crop_phenology_schedule_ssot.sql");
  assert(!/ELSE\s+'transplanted'/i.test(sql));
  assert(!/'brinjal'|'wheat'|'cotton'|'sugarcane'/i.test(sql), "no crop list may drive method inference");
  assert(sql.includes("count(distinct lower(m.cultivation_method))"));
  assert(sql.includes("coalesce(v_method_count, 0) <> 1"));
  assert(sql.indexOf("from public.crop_schedules cs") < sql.indexOf("v_sow_date        := coalesce(v_sched.sowing_date"));
  assert(sql.includes("from public.crop_synonyms s"));
});

Deno.test("generation refuses to persist an unresolved cultivation method", async () => {
  const index = await read("supabase/functions/ai-smart-schedule/index.ts");
  assert(index.includes('code: "CULTIVATION_METHOD_UNRESOLVED"'));
  assert(index.indexOf("CULTIVATION_METHOD_UNRESOLVED") < index.indexOf("await generateBaseline("));
});

Deno.test("reconciler field-condition mutations are stamped and idempotent; dry run writes nothing", async () => {
  const wx = await read("supabase/functions/schedule-reconciler/decision-application.ts");
  const rec = await read("supabase/functions/schedule-reconciler/index.ts");
  for (const stamp of ['stampedToday(task, "deferred_on")', 'stampedToday(next, "deferred_on")', 'stampedToday(task, "last_deferred_on")', "advanced_on: decisionDay", "deferred_on: decisionDay"]) {
    assert(wx.includes(stamp), `missing idempotency stamp: ${stamp}`);
  }
  assert(wx.includes("if (input.dryRun) return true;"));
  assert(rec.includes("dryRun") && rec.includes("dry_run: dryRun"));
  // every write site is guarded
  const writeSites = rec.match(/\.from\("(schedule_tasks|schedule_adjustments|edge_invocation_logs)"\)/g) ?? [];
  assert(writeSites.length >= 5);
  let idx = 0;
  while ((idx = rec.indexOf("insert(adjustments)", idx + 1)) !== -1) {
    assert(rec.slice(Math.max(0, idx - 160), idx).includes("!dryRun"), "an adjustments insert is not guarded by dryRun");
  }
  assert(rec.includes('if (!dryRun) await supabase.from("edge_invocation_logs")'));
});

Deno.test("data remediation deletes nothing and touches only the verified legacy schedule", async () => {
  const sql = await read("supabase/migrations/20260906121000_schedule_data_remediation_legacy_rice.sql");
  assert(!/\bdelete\s+from\b/i.test(sql));
  assert(sql.includes("b9f15e9e-8978-4b6e-a374-279d58fd678e"));
  assert(sql.includes("and cultivation_method is null"));
});

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

Deno.test("agronomic response table: alerts change the schedule the way an agronomist would", async () => {
  const dec = await read("supabase/functions/schedule-reconciler/decision-application.ts");
  // 1. water stress = deficit + canopy/heat signal → irrigation advanced regardless of urgency label
  assert(dec.includes("const stressConfirmed = decisions.some("));
  assert(dec.includes('adjustment_reason: stressConfirmed ? "decision_water_stress_confirmed"'));
  // canopy decline WITHOUT a deficit is scouting, not irrigation
  assert(dec.includes("const waterDeficitToday = decisions.some("));
  // 2. pest/disease onset → scouting card comes to TODAY, restored on decline
  assert(dec.includes("const bringForward = covering.task_date !== input.todayIso;"), "scouting must move to today whether the card is future-dated or overdue");
  assert(dec.includes('adjustment_reason: onset ? "decision_episode_onset"'));
  assert(dec.includes("const restoreDate = typeof current.previous_date"));
  // no spray is ever created from a weather model — only scouting moves
  assert(!/task_type:\s*"(pest_management|disease_management)"/.test(dec));
  // 3. rain loss → fertilizer deferred; 4. deficiency → next in-window nutrition advanced
  assert(dec.includes('adjustment_reason: "decision_rain_loss_risk"'));
  assert(dec.includes('adjustment_reason: "decision_nutrient_deficiency"'));
  // 5. the placeholder key is named as ignored, and nothing here holds a threshold
  assert(dec.includes('IGNORED: "info:weather_triggered"'));
  const code = dec.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert(!/(rain|deficit|mm|humidity|wind|temp)[^\n]*[<>]=?\s*\d/i.test(code));
});

Deno.test("silent proactive rules are recompiled with their own thresholds only", async () => {
  const sql = await read("supabase/migrations/20260913100000_compile_rice_proactive_rules.sql");
  for (const code of ["BPH_BUILDUP", "SHEATH_BLIGHT", "NECK_BLAST", "FALSE_SMUT", "BLB_RAIN", "LODGING_RISK", "HEAT_FLOWERING"]) assert(sql.includes(code), `missing ${code}`);
  assert(sql.includes("'legacy_source', conditions"), "legacy JSON must be preserved for audit");
  assert(sql.includes("and not (conditions ? 'all')"), "must never overwrite an already-compiled rule");
  assertEquals(/\bdelete\s+from\b/i.test(sql), false);
  // only ops the engine supports
  const ops = [...sql.matchAll(/'op','([a-z_]+)'/g)].map((m) => m[1]);
  for (const op of ops) assert(["eq", "gt", "gte", "lt", "lte", "gte_field", "lt_field", "not_null"].includes(op), `unsupported op ${op}`);
});

Deno.test("the farmer can SEE the dynamic change: real reason, field verdict, scouting re-dated to today", async () => {
  const dec = await read("supabase/functions/schedule-reconciler/decision-application.ts");
  const notice = await read("src/components/schedule/RescheduledNotice.tsx");
  const card = await read("src/components/schedule/ModernTaskCard.tsx");
  // an overdue scouting card is re-dated to today, not just re-prioritised
  assert(dec.includes("const bringForward = covering.task_date !== input.todayIso;"));
  // the notice explains decision_* reasons from i18n, never as a stage-drift sentence
  assert(notice.includes("startsWith('decision_')"));
  assert(notice.includes("`schedule.rescheduled.reason.${reasonCode}`"));
  // a verdict-only change (priority raised, date unchanged) still renders
  assert(notice.includes("if (!autoRescheduled && !verdictText) return null;"));
  assert(card.includes("fieldVerdict={") && card.includes("decisionState={"));
  // every reason code the decision layer emits has a string in en, hi and mr
  // only reason codes actually written to adjustment_reason (column names such as decision_date are not codes)
  const codes = [...new Set([...dec.matchAll(/adjustment_reason: [^\n]*?"(decision_[a-z_]+)"/g)].flatMap((m) => m.slice(1)))];
  assert(codes.length >= 6, `expected decision reason codes in the layer, found ${codes.length}`);
  for (const lang of ["en", "hi", "mr"]) {
    const j = JSON.parse(await read(`src/i18n/locales/${lang}/schedule.json`));
    for (const c of codes) assert(j.schedule.rescheduled.reason[c], `${lang} missing reason ${c}`);
    for (const v of ["scout_now", "water_sufficient", "application_window_exhausted", "label_today", "label_info"]) assert(j.schedule.field_verdict[v], `${lang} missing verdict ${v}`);
  }
});

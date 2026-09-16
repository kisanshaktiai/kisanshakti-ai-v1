// CHANGE LOG
// 2026-09-16 — v2.1.1: an OVERDUE scouting card is re-dated to today when risk is reported (previously only a
//   future-dated card moved; the live rice card stayed dated 8 Sept at priority critical).
// 2026-09-13 — v2.1.0 AGRONOMIC RESPONSE TO PROACTIVE ALERTS. The alert → decision → task chain
//   existed but responded to only four situations. The response table is now complete for what the
//   field-state engine actually reports, using only the decision keys and statuses the DB already
//   emits — no threshold, no crop word, no number lives here:
//   1. WATER STRESS CONFIRMED (satellite canopy drop or heat at a critical stage AND a measured water
//      deficit): the next irrigation moves to TODAY regardless of the urgency label. Canopy decline
//      WITHOUT a deficit is not thirst — it stays a scouting flag (pest / disease / nutrition likelier).
//   2. PEST / DISEASE RISK or EPISODE ONSET: the stage's scouting card is brought to TODAY (not just
//      re-prioritised) carrying its "if you see X → apply Y" briefs. No spray is scheduled on a weather
//      model alone — IPM requires the field check first. DECLINING restores priority and date.
//   3. HEAVY RAIN / WATERLOGGING / LODGING / BLB-RAIN: a fertilizer application due today or tomorrow is
//      deferred one day (leaching and runoff), re-checked nightly. Sprays are already deferred by the
//      spray-window decision.
//   4. NUTRIENT DEFICIENCY SIGNAL: the next nutrition card whose DB window has opened is advanced to
//      today. Quantity never changes — only the day.
//   5. info:weather_triggered is IGNORED on purpose: a generic safety advisory the evaluator emits under a
//      placeholder rule id (144 empty decisions in 30 days) that carries no field fact.
// 2026-09-08 — v2.0.0 DECISION APPLICATION (replaces weather-adaptation.ts). The reconciler no
//   longer reads land_weather_state itself. The DB's daily field-state engine already turns the
//   crop-state snapshot (land_farm_state) and the decision rules into farm_decision rows
//   (derive_farm_decisions: water:irrigate / water:no_irrigation / water:no_data,
//   info:ENV_NO_SPRAY_TODAY / info:ENV_SPRAY_WINDOW_GOOD, scout:disease_risk:*,
//   observe:stress:* / observe:nutrient …, each with status, priority, rule_id and evidence).
//   This module JOINS those decisions to the pending tasks of the land's active schedule and
//   applies them: DEFER / ADVANCE / FLAG / UNFLAG, always by the task's own DB-declared cadence
//   or window, never by a value chosen here. It also writes farm_decision.schedule_id/task_id
//   (the link the audit found NULL on every row), stamps schedule_tasks.decision_state with the
//   farm_decision status vocabulary, and returns one monitoring record per schedule: the state
//   observed, the decisions evaluated, the outcome per task, what changed and why, and the
//   engine versions involved. Idempotent (per-day stamps) and dry-run capable.
//   No threshold, cadence, crop or language word lives here.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export const DECISION_APPLICATION_VERSION = "schedule-reconciler/decision-application@2.1.1";

const iso = (d: Date) => d.toISOString().split("T")[0];
const addDays = (dateIso: string, n: number) => iso(new Date(new Date(dateIso).getTime() + n * 86400000));
const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();

/** Decision keys emitted by derive_farm_decisions (DB), matched by prefix. */
const KEY = {
  IRRIGATE: "water:irrigate",
  NO_IRRIGATION: "water:no_irrigation",
  NO_WATER_DATA: "water:no_data",
  NO_SPRAY: "info:ENV_NO_SPRAY_TODAY",
  SPRAY_OK: "info:ENV_SPRAY_WINDOW_GOOD",
  SCOUT: "scout:",
  STRESS: "observe:stress",
  NUTRIENT: "observe:nutrient",
  IGNORED: "info:weather_triggered",
} as const;
/** Rule-code fragments the evaluator embeds in decision keys; matched by substring, case-insensitive.
 *  They name WHICH engine rule fired — the agronomic response to it is decided below. */
const SIGNAL = {
  HEAT: ["HEAT_FLOWERING", "HEATWAVE", "HEAT_STRESS"],
  RAIN_LOSS: ["HEAVY_RAIN", "WATERLOGGING", "LODGING", "BLB_RAIN"],
  EPISODE_ONSET: ["EPISODE_ONSET"],
  EPISODE_DECLINING: ["EPISODE_DECLINING"],
} as const;
const hasSignal = (d: DecisionRow, frags: readonly string[]) => { const k = String(d.decision_key ?? "").toUpperCase(); return frags.some((f) => k.includes(f)); };

/** Task types whose application is weather-window sensitive (the DB task_type enumeration). */
const APPLICATION_TASK_TYPES = new Set(["pest_management", "disease_management", "weed_management", "growth_regulation", "nutrition", "micronutrient", "seed_treatment"]);
const SCOUTING_TASK_TYPES = new Set(["monitoring"]);
const PRIORITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export interface DecisionRow {
  id: string; decision_date: string; decision_key: string | null; category: string | null; status: string; priority: string | null;
  action_code: string | null; title_en: string | null; rule_id: string | null; source: string | null; evidence: Record<string, unknown> | null;
  valid_until: string | null; schedule_id: string | null; task_id: string | null;
}
interface TaskRow {
  id: string; task_type: string; task_date: string; original_date: string | null; days_from_sowing: number | null; anchor_stage: string | null;
  priority: string | null; weather_dependent: boolean | null; is_pinned: boolean | null; resources: Record<string, unknown> | null; decision_state: string | null;
}
export interface FieldDecisionInput {
  scheduleId: string; landId: string; sowingDate: string | null; todayIso: string; engineVersion: string; dryRun: boolean;
  stageRow: { stage_code: string | null; das_max: number | null } | null;
}
export interface TaskOutcome { task_id: string; task_type: string; decision_id: string | null; decision_key: string | null; outcome: string; decision_state: string | null; from: unknown; to: unknown; reason: string }
export interface FieldDecisionOutcome {
  applied: boolean; skipped: string | null;
  adjustments: Array<Record<string, unknown>>; failedTaskIds: string[];
  counters: { deferred: number; advanced: number; flagged: number; unflagged: number; linked: number; stated: number; rebound: number };
  state_snapshot: Record<string, unknown> | null;
  decisions_evaluated: Array<Record<string, unknown>>;
  outcomes: TaskOutcome[];
  decision_engine_version: string | null;
}

const emptyCounters = () => ({ deferred: 0, advanced: 0, flagged: 0, unflagged: 0, linked: 0, stated: 0, rebound: 0 });

export async function applyFieldDecisions(supabase: SupabaseClient, input: FieldDecisionInput): Promise<FieldDecisionOutcome> {
  const counters = emptyCounters();
  const adjustments: Array<Record<string, unknown>> = [];
  const failedTaskIds: string[] = [];
  const outcomes: TaskOutcome[] = [];

  // 0. AUTHORITATIVE SCHEDULE GATE (lands.active_schedule_id is the land's current schedule SSOT).
  //    INVARIANT: only the land's ACTIVE schedule may apply or re-link current live decisions. A run
  //    for a stale / cancelled schedule must never steal or rebind a current decision.
  const { data: landRow } = await supabase.from("lands").select("active_schedule_id").eq("id", input.landId).maybeSingle();
  const activeScheduleId = (landRow?.active_schedule_id ?? null) as string | null;
  if (activeScheduleId && activeScheduleId !== input.scheduleId) {
    return { applied: false, skipped: "not_active_schedule", adjustments, failedTaskIds, counters, state_snapshot: null, decisions_evaluated: [], outcomes, decision_engine_version: null };
  }

  // 1. Crop-state snapshot (DB engine) — latest on or before today.
  const { data: fs } = await supabase
    .from("land_farm_state")
    .select("state_date, crop_code, stage_uuid, stage_code, growth_stage, stage_source, stage_confidence, das, dat, stage_drift_days, stage_window, water, thermal, canopy, observations, alerts_pending, gaps, state_version, computed_at")
    .eq("land_id", input.landId).lte("state_date", input.todayIso)
    .order("state_date", { ascending: false }).limit(1).maybeSingle();
  const snapshot = fs ? { ...fs } as Record<string, unknown> : null;
  const decisionEngine = (fs?.state_version as Record<string, unknown> | null)?.engine ? String((fs!.state_version as Record<string, unknown>).engine) : null;

  // 2. Today's decisions (DB engine) — the latest decision day on or before today; only live statuses.
  const { data: dayRow } = await supabase.from("farm_decision").select("decision_date").eq("land_id", input.landId).lte("decision_date", input.todayIso).order("decision_date", { ascending: false }).limit(1).maybeSingle();
  if (!dayRow?.decision_date) {
    return { applied: false, skipped: "no_farm_decision_for_land", adjustments, failedTaskIds, counters, state_snapshot: snapshot, decisions_evaluated: [], outcomes, decision_engine_version: decisionEngine };
  }
  const { data: decRows, error: decErr } = await supabase
    .from("farm_decision")
    .select("id, decision_date, decision_key, category, status, priority, action_code, title_en, rule_id, source, evidence, valid_until, schedule_id, task_id")
    .eq("land_id", input.landId).eq("decision_date", dayRow.decision_date)
    .in("status", ["DUE", "WATCH", "INFO", "BLOCKED"]);
  if (decErr) throw decErr;
  const decisions = ((decRows || []) as DecisionRow[]).filter((d) => !d.valid_until || d.valid_until >= input.todayIso);
  const evaluated = decisions.map((d) => ({ id: d.id, decision_date: d.decision_date, key: d.decision_key, category: d.category, status: d.status, priority: d.priority, rule_id: d.rule_id, source: d.source, title: d.title_en }));
  const decisionDay = String(dayRow.decision_date);
  const byKey = (prefix: string) => decisions.filter((d) => String(d.decision_key ?? "").startsWith(prefix));

  // 3. Pending tasks of this schedule.
  const { data: rows, error } = await supabase
    .from("schedule_tasks")
    .select("id, task_type, task_date, original_date, days_from_sowing, anchor_stage, priority, weather_dependent, is_pinned, resources, decision_state")
    .eq("schedule_id", input.scheduleId).eq("status", "pending").order("task_date", { ascending: true });
  if (error) throw error;
  const tasks = (rows || []) as TaskRow[];
  const horizon = addDays(input.todayIso, 1);
  const todayDas = input.sowingDate ? Math.round((new Date(input.todayIso).getTime() - new Date(String(input.sowingDate).slice(0, 10)).getTime()) / 86400000) : null;

  const dyn = (t: TaskRow) => (t.resources?.dynamic && typeof t.resources.dynamic === "object" ? { ...(t.resources.dynamic as Record<string, unknown>) } : {});
  const stampedToday = (t: TaskRow, key: string) => String(dyn(t)[key] ?? "") === decisionDay;
  const update = async (t: TaskRow, patch: Record<string, unknown>) => {
    if (input.dryRun) return true;
    const { error: e } = await supabase.from("schedule_tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", t.id);
    if (e) { failedTaskIds.push(t.id); return false; }
    return true;
  };
  const link = async (d: DecisionRow, t: TaskRow) => {
    if (d.task_id === t.id) return;
    if (!input.dryRun) await supabase.from("farm_decision").update({ schedule_id: input.scheduleId, task_id: t.id, updated_at: new Date().toISOString() }).eq("id", d.id).is("task_id", null);
    counters.linked += 1;
  };
  const evidenceOf = (d: DecisionRow) => ({ decision_id: d.id, decision_key: d.decision_key, decision_status: d.status, decision_priority: d.priority, rule_id: d.rule_id, source: d.source, decision_date: d.decision_date, evidence: d.evidence ?? null, state_date: fs?.state_date ?? null, stage: fs?.stage_code ?? null, stage_source: fs?.stage_source ?? null, decision_engine: decisionEngine });
  const record = (t: TaskRow, change_type: string, old_value: unknown, new_value: unknown, reason: string, d: DecisionRow) =>
    adjustments.push({ schedule_id: input.scheduleId, task_id: t.id, change_type, old_value, new_value, reason, evidence: evidenceOf(d), engine_version: input.engineVersion });
  const state = async (t: TaskRow, d: DecisionRow | null, decisionState: string, outcome: string, from: unknown, to: unknown, reason: string, extraPatch: Record<string, unknown> = {}) => {
    const patch = { ...extraPatch, decision_state: decisionState, decision_id: d?.id ?? null, decision_evaluated_at: new Date().toISOString() };
    const ok = await update(t, patch);
    if (ok) { outcomes.push({ task_id: t.id, task_type: t.task_type, decision_id: d?.id ?? null, decision_key: d?.decision_key ?? null, outcome, decision_state: decisionState, from, to, reason }); counters.stated += 1; if (d) await link(d, t); }
    return ok;
  };

  // ── IRRIGATION ──────────────────────────────────────────────────────────────
  // 2026-09-16 — set true ONLY when a water-stress decision actually produced an irrigation action
  // today. The scouting section below suppresses the stress signal on this flag, never on the mere
  // presence of a water decision, so a stress warning is never silently dropped.
  let stressHandledByIrrigation = false;
  const irrigation = tasks.filter((t) => t.task_type === "irrigation" && !t.is_pinned);
  const irrigate = byKey(KEY.IRRIGATE).find((d) => d.status === "DUE") ?? null;
  const noIrrigation = byKey(KEY.NO_IRRIGATION)[0] ?? null;
  const noWaterData = byKey(KEY.NO_WATER_DATA)[0] ?? null;

  if (noIrrigation) {
    for (const task of irrigation.filter((t) => t.task_date <= horizon)) {
      if (stampedToday(task, "deferred_on") || stampedToday(task, "advanced_on")) continue;
      const rec = (task.resources?.recurrence ?? null) as Record<string, unknown> | null;
      const step = Number(rec?.interval_days);
      if (!Number.isFinite(step) || step < 1) { // no declared cadence → state only, never guess a date
        await state(task, noIrrigation, "BLOCKED", "STATE_ONLY", { task_date: task.task_date }, { task_date: task.task_date }, "Field-state decision: no irrigation needed; task has no declared cadence so it is not moved");
        continue;
      }
      const next = addDays(task.task_date, step);
      if (await state(task, noIrrigation, "BLOCKED", "DEFER", { task_date: task.task_date }, { task_date: next }, "Field-state decision: no irrigation needed today — deferred by the task's declared cadence", { task_date: next, projected_date: next, original_date: task.original_date ?? task.task_date, auto_rescheduled: true, adjustment_reason: "decision_no_irrigation", resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), deferred_on: decisionDay, deferred_by: noIrrigation.id } } })) {
        record(task, "DEFER", { task_date: task.task_date }, { task_date: next }, "no irrigation needed per farm_decision " + String(noIrrigation.decision_key), noIrrigation);
        counters.deferred += 1;
      }
    }
  } else if (irrigate) {
    for (const task of irrigation.filter((t) => t.task_date <= horizon)) if (!stampedToday(task, "stated_on")) await state(task, irrigate, "DUE", "STATE_ONLY", { task_date: task.task_date }, { task_date: task.task_date }, "Field-state decision: irrigation due — planned event confirmed", { resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), stated_on: decisionDay } } });
    const urgency = norm((irrigate.evidence as Record<string, unknown> | null)?.urgency);
    // Water stress is CONFIRMED when the measured deficit (this decision) coincides with a satellite
    // canopy decline or heat at a critical stage — that advances the next irrigation to today even
    // when the urgency label alone is not yet HIGH.
    const stressConfirmed = decisions.some((d) => String(d.decision_key ?? "").startsWith(KEY.STRESS) || hasSignal(d, SIGNAL.HEAT));
    const next = irrigation.find((t) => t.task_date > horizon) ?? null;
    const advancedAlready = irrigation.some((t) => stampedToday(t, "advanced_on"));
    if (next && !advancedAlready && !stampedToday(next, "deferred_on") && (urgency === "HIGH" || urgency === "CRITICAL" || norm(irrigate.priority) === "CRITICAL" || stressConfirmed)) {
      const why = stressConfirmed && !(urgency === "HIGH" || urgency === "CRITICAL") ? "water deficit with canopy/heat stress confirmed" : `irrigation due (urgency ${urgency})`;
      const rec = (next.resources?.recurrence ?? null) as Record<string, unknown> | null;
      const windowStart = Number(rec?.window_start);
      const windowOpen = todayDas != null && Number.isFinite(windowStart) ? todayDas >= windowStart : true;
      if (windowOpen && (await state(next, irrigate, "DUE", "ADVANCE", { task_date: next.task_date }, { task_date: input.todayIso }, `Field-state decision: ${why} — next declared irrigation event brought forward to today`, { task_date: input.todayIso, projected_date: input.todayIso, original_date: next.original_date ?? next.task_date, auto_rescheduled: true, adjustment_reason: stressConfirmed ? "decision_water_stress_confirmed" : "decision_irrigate_urgent", resources: { ...(next.resources ?? {}), dynamic: { ...dyn(next), advanced_on: decisionDay, advanced_from: next.task_date, advanced_by: irrigate.id, stress_confirmed: stressConfirmed } } }))) {
        record(next, "ADVANCE", { task_date: next.task_date }, { task_date: input.todayIso }, why + " per farm_decision " + String(irrigate.decision_key), irrigate);
        counters.advanced += 1;
        if (stressConfirmed) stressHandledByIrrigation = true;
      }
    }
  } else if (noWaterData) {
    for (const task of irrigation.filter((t) => t.task_date <= horizon)) if (!stampedToday(task, "stated_on")) await state(task, noWaterData, "INFO", "STATE_ONLY", { task_date: task.task_date }, { task_date: task.task_date }, "Field-state decision: water status unknown today — planned event kept", { resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), stated_on: decisionDay } } });
  }

  // ── APPLICATIONS (spray / spread / foliar) ─────────────────────────────────
  const noSpray = byKey(KEY.NO_SPRAY)[0] ?? null;
  const sprayOk = byKey(KEY.SPRAY_OK)[0] ?? null;
  const dueApplications = tasks.filter((t) => !t.is_pinned && t.weather_dependent === true && APPLICATION_TASK_TYPES.has(t.task_type) && t.task_date <= input.todayIso);
  if (noSpray) {
    for (const task of dueApplications) {
      if (stampedToday(task, "last_deferred_on")) continue;
      const next = addDays(input.todayIso, 1);
      const stageEndDas = input.stageRow && task.anchor_stage && input.stageRow.stage_code && norm(task.anchor_stage) === norm(input.stageRow.stage_code) ? input.stageRow.das_max : null;
      const stageEndIso = stageEndDas != null && input.sowingDate ? addDays(String(input.sowingDate).slice(0, 10), stageEndDas) : null;
      const prior = Number(dyn(task).application_deferrals ?? 0);
      if (stageEndIso && next > stageEndIso) {
        if (await state(task, noSpray, "BLOCKED", "FLAG", { task_date: task.task_date }, { task_date: task.task_date, priority: "high" }, "No usable application window today and the stage window ends before tomorrow — kept today, flagged", { priority: task.priority && PRIORITY_RANK[task.priority] >= PRIORITY_RANK.high ? task.priority : "high", resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), field_verdict: "application_window_exhausted", as_of: decisionDay } } })) {
          record(task, "FLAG", { task_date: task.task_date }, { field_verdict: "application_window_exhausted" }, "no spray window and stage window exhausted per farm_decision " + String(noSpray.decision_key), noSpray);
          counters.flagged += 1;
        }
        continue;
      }
      if (await state(task, noSpray, "BLOCKED", "DEFER", { task_date: task.task_date }, { task_date: next }, "Field-state decision: do not spray today — application moved to tomorrow and re-checked", { task_date: next, projected_date: next, original_date: task.original_date ?? task.task_date, auto_rescheduled: true, adjustment_reason: "decision_no_spray_today", resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), application_deferrals: prior + 1, last_deferred_on: decisionDay, deferred_by: noSpray.id } } })) {
        record(task, "DEFER", { task_date: task.task_date }, { task_date: next }, "do not spray today per farm_decision " + String(noSpray.decision_key), noSpray);
        counters.deferred += 1;
      }
    }
  } else if (sprayOk) {
    for (const task of dueApplications) if (!stampedToday(task, "stated_on")) await state(task, sprayOk, "DUE", "STATE_ONLY", { task_date: task.task_date }, { task_date: task.task_date }, "Field-state decision: spray window good — planned application confirmed", { resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), stated_on: decisionDay } } });
  }

  // ── NUTRITION vs RAIN LOSS / DEFICIENCY SIGNAL ─────────────────────────────
  const nutrition = tasks.filter((t) => !t.is_pinned && (t.task_type === "nutrition" || t.task_type === "micronutrient"));
  const rainLoss = decisions.find((d) => hasSignal(d, SIGNAL.RAIN_LOSS)) ?? null;
  if (rainLoss) {
    for (const task of nutrition.filter((t) => t.task_date <= horizon)) {
      if (stampedToday(task, "deferred_on")) continue;
      const next = addDays(input.todayIso, 1);
      if (await state(task, rainLoss, "BLOCKED", "DEFER", { task_date: task.task_date }, { task_date: next }, "Heavy rain / waterlogging reported — fertilizer applied now would be lost to runoff and leaching; moved to tomorrow and re-checked", { task_date: next, projected_date: next, original_date: task.original_date ?? task.task_date, auto_rescheduled: true, adjustment_reason: "decision_rain_loss_risk", resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), deferred_on: decisionDay, deferred_by: rainLoss.id } } })) {
        record(task, "DEFER", { task_date: task.task_date }, { task_date: next }, "rain-loss risk per farm_decision " + String(rainLoss.decision_key), rainLoss);
        counters.deferred += 1;
      }
    }
  } else {
    const deficiency = byKey(KEY.NUTRIENT).find((d) => d.status === "DUE" || d.status === "WATCH") ?? null;
    if (deficiency) {
      // The next nutrition card whose OWN window has opened comes forward; the quantity is untouched.
      const next = nutrition.find((t) => t.task_date > horizon) ?? null;
      if (next && !stampedToday(next, "advanced_on") && !stampedToday(next, "deferred_on")) {
        const win = (next.resources?.window ?? null) as Record<string, unknown> | null;
        const from = Number(win?.from_das);
        const windowOpen = todayDas != null && Number.isFinite(from) ? todayDas >= from : false;
        if (windowOpen && (await state(next, deficiency, "DUE", "ADVANCE", { task_date: next.task_date }, { task_date: input.todayIso }, "Nutrient deficiency signal reported and this application's window is open — brought forward to today", { task_date: input.todayIso, projected_date: input.todayIso, original_date: next.original_date ?? next.task_date, auto_rescheduled: true, adjustment_reason: "decision_nutrient_deficiency", resources: { ...(next.resources ?? {}), dynamic: { ...dyn(next), advanced_on: decisionDay, advanced_from: next.task_date, advanced_by: deficiency.id } } }))) {
          record(next, "ADVANCE", { task_date: next.task_date }, { task_date: input.todayIso }, "nutrient deficiency per farm_decision " + String(deficiency.decision_key), deficiency);
          counters.advanced += 1;
        }
      }
    }
  }

  // ── SCOUTING ────────────────────────────────────────────────────────────────
  // Risk = pest/disease scouting decisions, episode ONSET, or canopy stress that was NOT already
  // acted on as irrigation above. DECLINING never counts as risk.
  const risk = [...byKey(KEY.SCOUT), ...byKey(KEY.STRESS)]
    .filter((d) => (d.status === "WATCH" || d.status === "DUE") && !hasSignal(d, SIGNAL.EPISODE_DECLINING))
    .filter((d) => !(String(d.decision_key ?? "").startsWith(KEY.STRESS) && stressHandledByIrrigation));
  const scouting = tasks.filter((t) => SCOUTING_TASK_TYPES.has(t.task_type) && !t.is_pinned);
  const covering = scouting.find((t) => { const rec = (t.resources?.recurrence ?? null) as Record<string, unknown> | null; const a = Number(rec?.window_start), b = Number(rec?.window_end); return todayDas != null && Number.isFinite(a) && Number.isFinite(b) ? todayDas >= a && todayDas <= b : t.task_date >= input.todayIso; }) ?? scouting.find((t) => t.task_date >= input.todayIso) ?? null;
  if (covering) {
    const current = dyn(covering);
    if (risk.length) {
      const lead = risk.sort((a, b) => (PRIORITY_RANK[norm(b.priority).toLowerCase()] ?? 0) - (PRIORITY_RANK[norm(a.priority).toLowerCase()] ?? 0))[0];
      const keys = risk.map((d) => d.decision_key);
      const already = String(current.as_of ?? "") === decisionDay && JSON.stringify(current.risk_keys ?? null) === JSON.stringify(keys);
      if (!already) {
        const previousPriority = String(current.previous_priority ?? covering.priority ?? "medium");
        const onset = risk.some((d) => hasSignal(d, SIGNAL.EPISODE_ONSET) || d.status === "DUE" || norm(d.priority) === "CRITICAL");
        const raised = onset ? "critical" : (PRIORITY_RANK[String(covering.priority ?? "medium")] >= PRIORITY_RANK.high ? String(covering.priority) : "high");
        // Bring the scouting card to TODAY when it is dated later: the farmer must look now, and the
        // card already carries "if you see X → apply Y" for this stage. Its date is remembered so
        // UNFLAG can restore it when the risk clears.
        // Any date other than today is wrong for "check the field now": a future card is brought
        // forward, and an OVERDUE card (the common case — the stage's scouting card dated a week ago
        // and still pending) is re-dated to today as well, so the farmer sees it as today's job.
        const bringForward = covering.task_date !== input.todayIso;
        const datePatch = bringForward ? { task_date: input.todayIso, projected_date: input.todayIso, original_date: covering.original_date ?? covering.task_date, auto_rescheduled: true, adjustment_reason: onset ? "decision_episode_onset" : "decision_risk_scout_now" } : {};
        const reason = onset ? "Pest/disease episode onset reported — check the field today and treat only what you find" : "Field-state decisions report risk — scouting raised so the farmer checks the crop now";
        if (await state(covering, lead, "DUE", bringForward ? "ADVANCE" : "FLAG", { priority: covering.priority, task_date: covering.task_date }, { priority: raised, task_date: bringForward ? input.todayIso : covering.task_date }, reason, { ...datePatch, priority: raised, resources: { ...(covering.resources ?? {}), dynamic: { ...current, field_verdict: "scout_now", risk_keys: keys, previous_priority: previousPriority, previous_date: bringForward ? covering.task_date : (current.previous_date ?? null), as_of: decisionDay } } })) {
          record(covering, bringForward ? "ADVANCE" : "FLAG", { priority: covering.priority, task_date: covering.task_date }, { priority: raised, task_date: bringForward ? input.todayIso : covering.task_date, risk_keys: keys }, "risk decisions " + keys.join(","), lead);
          if (bringForward) counters.advanced += 1;
          counters.flagged += 1;
          for (const d of risk) await link(d, covering);
        }
      }
    } else if (current.field_verdict === "scout_now") {
      const restore = String(current.previous_priority ?? covering.priority ?? "medium");
      const restoreDate = typeof current.previous_date === "string" && current.previous_date > input.todayIso ? current.previous_date : null;
      const { field_verdict: _v, risk_keys: _k, previous_priority: _p, previous_date: _d, as_of: _a, ...rest } = current;
      if (await state(covering, null, "INFO", "UNFLAG", { priority: covering.priority, task_date: covering.task_date }, { priority: restore, task_date: restoreDate ?? covering.task_date }, "Field risk cleared — scouting task restored to its planned priority and date", { priority: restore, ...(restoreDate ? { task_date: restoreDate, projected_date: restoreDate } : {}), resources: { ...(covering.resources ?? {}), dynamic: rest } })) {
        adjustments.push({ schedule_id: input.scheduleId, task_id: covering.id, change_type: "UNFLAG", old_value: { priority: covering.priority, task_date: covering.task_date }, new_value: { priority: restore, task_date: restoreDate ?? covering.task_date }, reason: "no risk decision today", evidence: { decision_date: decisionDay, state_date: fs?.state_date ?? null, decision_engine: decisionEngine }, engine_version: input.engineVersion });
        counters.unflagged += 1;
      }
    }
  }

  return { applied: true, skipped: null, adjustments, failedTaskIds, counters, state_snapshot: snapshot, decisions_evaluated: evaluated, outcomes, decision_engine_version: decisionEngine };
}

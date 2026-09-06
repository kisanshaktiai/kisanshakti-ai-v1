// CHANGE LOG
// 2026-09-06 — v1.1.0 IDEMPOTENCY + DRY RUN. (1) Every mutation is stamped on the task
//   (resources.dynamic.{deferred_on|advanced_on|flagged_on} = metric_date) and skipped when the
//   stamp already equals today's metric_date, so "same field state + run twice = same DB state"
//   holds even for a 1-day irrigation cadence (whose deferred date lands inside tomorrow's
//   horizon and was re-deferred by a second run). (2) A task advanced today is never deferred
//   today and vice versa. (3) dryRun: compute and return every intended mutation without writing
//   a task or an adjustment — the certification path for the repeated-cron invariant.
// 2026-09-05 — v1.0.0 FIELD-CONDITION ADAPTATION (hosted inside schedule-reconciler; one
//   feature = one edge function). The static schedule says WHAT and roughly WHEN; the field says
//   whether TODAY is the day. Every signal used here is already decided by the DB weather engine
//   (land_weather_state: irrigation_needed / irrigation_urgency / water_balance_status /
//   spray_window / disease_risk_level / crop_stress_level) or the daily farm-state engine
//   (land_farm_state.canopy from NDVI). This module holds NO thresholds of its own: it only
//   applies those verdicts to the pending tasks that fall due, and records every change with
//   the evidence row it came from. Four mutations, all reversible and idempotent:
//     DEFER    irrigation due today/tomorrow when the water balance says it is not needed
//              (rain of the last days already covered the deficit); moved by the task's OWN
//              DB-declared cadence, never by a guessed interval.
//     ADVANCE  the next irrigation event when urgency is HIGH and the task's declared window
//              has already opened — the field is dry earlier than the calendar assumed.
//     DEFER    any weather-dependent application task (spray / spread / foliar) due today when
//              the day's spray_window has no usable slot; one day at a time, re-checked nightly,
//              never past the task's stage window (flagged instead).
//     FLAG     the scouting task that covers today when disease risk, crop stress or NDVI canopy
//              deficit is reported — priority raised and the evidence attached; cleared
//              (UNFLAG) when the condition clears.
//   Farmer-pinned tasks are never touched. Tasks with no declared cadence are never moved.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const iso = (d: Date) => d.toISOString().split("T")[0];
const addDays = (dateIso: string, n: number) => iso(new Date(new Date(dateIso).getTime() + n * 86400000));
const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();

/** Task types that are field APPLICATIONS sensitive to the day's spray/application window.
 *  Irrigation, scouting and harvest have their own signals and are excluded here. */
const APPLICATION_TASK_TYPES = new Set([
  "pest_management", "disease_management", "weed_management", "growth_regulation",
  "nutrition", "micronutrient", "seed_treatment", "pesticide", "fertilization",
]);
const SCOUTING_TASK_TYPES = new Set(["monitoring", "scouting"]);
const PRIORITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export interface WeatherAdaptationInput {
  scheduleId: string;
  landId: string;
  sowingDate: string | null;
  /** Resolver stage row when known; used only to bound application deferral to the stage window. */
  stageRow: { stage_code: string | null; das_max: number | null } | null;
  todayIso: string;
  engineVersion: string;
  /** When true, nothing is written; the outcome lists what WOULD change. */
  dryRun?: boolean;
}

export interface WeatherAdaptationOutcome {
  applied: boolean;
  skipped?: string;
  adjustments: Array<Record<string, unknown>>;
  failedTaskIds: string[];
  counters: { irrigation_deferred: number; irrigation_advanced: number; application_deferred: number; application_window_exhausted: number; flagged: number; unflagged: number };
  evidence: Record<string, unknown> | null;
}

interface TaskRow {
  id: string;
  task_type: string;
  task_date: string;
  original_date: string | null;
  days_from_sowing: number | null;
  anchor_stage: string | null;
  priority: string | null;
  weather_dependent: boolean | null;
  is_pinned: boolean | null;
  resources: Record<string, unknown> | null;
}

const emptyCounters = () => ({ irrigation_deferred: 0, irrigation_advanced: 0, application_deferred: 0, application_window_exhausted: 0, flagged: 0, unflagged: 0 });

export async function applyWeatherAdaptation(supabase: SupabaseClient, input: WeatherAdaptationInput): Promise<WeatherAdaptationOutcome> {
  const counters = emptyCounters();
  const adjustments: Array<Record<string, unknown>> = [];
  const failedTaskIds: string[] = [];

  // 1. Today's field verdicts (DB engines). Stale state → no field-condition mutation today.
  const { data: ws } = await supabase
    .from("land_weather_state")
    .select("metric_date, irrigation_needed, irrigation_urgency, water_balance_status, effective_rainfall_mm, total_rainfall_mm, rain_24h_mm, water_deficit_mm, spray_window, spray_score, disease_risk_level, crop_stress_level, frost_risk_score, ndvi_used, ndvi_age_days, confidence, source")
    .eq("land_id", input.landId)
    .order("metric_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ws?.metric_date || String(ws.metric_date).slice(0, 10) !== input.todayIso) {
    return { applied: false, skipped: "weather_state_not_current", adjustments, failedTaskIds, counters, evidence: ws ? { metric_date: ws.metric_date } : null };
  }
  const { data: fs } = await supabase
    .from("land_farm_state")
    .select("state_date, canopy, stage_code, stage_source")
    .eq("land_id", input.landId)
    .order("state_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const canopy = (fs?.canopy ?? null) as Record<string, unknown> | null;

  const evidence = {
    metric_date: ws.metric_date,
    irrigation_needed: ws.irrigation_needed,
    irrigation_urgency: ws.irrigation_urgency,
    water_balance_status: ws.water_balance_status,
    effective_rainfall_mm: ws.effective_rainfall_mm,
    total_rainfall_mm: ws.total_rainfall_mm,
    rain_24h_mm: ws.rain_24h_mm,
    water_deficit_mm: ws.water_deficit_mm,
    spray_score: ws.spray_score,
    spray_window_summary: summarizeWindow(ws.spray_window),
    disease_risk_level: ws.disease_risk_level,
    crop_stress_level: ws.crop_stress_level,
    ndvi_used: ws.ndvi_used,
    ndvi_age_days: ws.ndvi_age_days,
    canopy: canopy ? { status: canopy.status ?? null, vs_expected: canopy.vs_expected ?? null, ndvi: canopy.ndvi ?? null, date: canopy.date ?? null } : null,
    weather_confidence: ws.confidence,
    weather_source: ws.source,
  };

  // 2. Pending tasks in the decision horizon: anything due up to tomorrow, plus the next
  //    irrigation event (for ADVANCE) and the scouting task covering today (for FLAG).
  const horizon = addDays(input.todayIso, 1);
  const { data: rows, error } = await supabase
    .from("schedule_tasks")
    .select("id, task_type, task_date, original_date, days_from_sowing, anchor_stage, priority, weather_dependent, is_pinned, resources")
    .eq("schedule_id", input.scheduleId)
    .eq("status", "pending")
    .order("task_date", { ascending: true });
  if (error) throw error;
  const tasks = (rows || []) as TaskRow[];
  const todayDas = input.sowingDate ? Math.round((new Date(input.todayIso).getTime() - new Date(String(input.sowingDate).slice(0, 10)).getTime()) / 86400000) : null;

  const stampedToday = (task: TaskRow, key: string) => String(dyn(task)[key] ?? "") === String(ws.metric_date);
  const update = async (task: TaskRow, patch: Record<string, unknown>) => {
    if (input.dryRun) return true;
    const { error: e } = await supabase.from("schedule_tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", task.id);
    if (e) { failedTaskIds.push(task.id); return false; }
    return true;
  };
  const record = (task: TaskRow, change_type: string, old_value: unknown, new_value: unknown, reason: string, extra: Record<string, unknown> = {}) =>
    adjustments.push({ schedule_id: input.scheduleId, task_id: task.id, change_type, old_value, new_value, reason, evidence: { ...evidence, ...extra }, engine_version: input.engineVersion });

  // 3. IRRIGATION — the water balance decides today's event.
  const irrigation = tasks.filter((t) => t.task_type === "irrigation" && !t.is_pinned);
  if (ws.irrigation_needed === false) {
    for (const task of irrigation.filter((t) => t.task_date <= horizon)) {
      if (stampedToday(task, "deferred_on") || stampedToday(task, "advanced_on")) continue; // already decided today
      const rec = (task.resources?.recurrence ?? null) as Record<string, unknown> | null;
      const step = Number(rec?.interval_days);
      if (!Number.isFinite(step) || step < 1) {
        // No declared cadence → never guess a new date; make the field verdict visible instead.
        if (await update(task, { resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), field_verdict: "water_sufficient", as_of: ws.metric_date } } })) {
          record(task, "FLAG", null, { field_verdict: "water_sufficient" }, "Soil water balance already sufficient today; this irrigation task has no declared cadence, so it is flagged rather than moved");
          counters.flagged += 1;
        }
        continue;
      }
      const next = addDays(task.task_date, step);
      if (await update(task, { task_date: next, projected_date: next, original_date: task.original_date ?? task.task_date, auto_rescheduled: true, adjustment_reason: "weather_water_sufficient", resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), deferred_on: ws.metric_date, deferred_reason: "water_sufficient" } } })) {
        record(task, "DEFER", { task_date: task.task_date }, { task_date: next }, "Soil water balance already sufficient (recent rainfall covered the deficit) — irrigation deferred by the declared cadence", { interval_days: step, window_end: rec?.window_end ?? null });
        counters.irrigation_deferred += 1;
      }
    }
  } else if (ws.irrigation_needed === true && norm(ws.irrigation_urgency) === "HIGH") {
    // Field dry earlier than the calendar assumed: bring the next declared event forward to
    // today, but only once its own DB-declared window has opened.
    const next = irrigation.find((t) => t.task_date > horizon);
    const advancedAlready = irrigation.some((t) => stampedToday(t, "advanced_on"));
    if (next && !advancedAlready && !stampedToday(next, "deferred_on")) {
      const rec = (next.resources?.recurrence ?? null) as Record<string, unknown> | null;
      const windowStart = Number(rec?.window_start);
      const windowOpen = todayDas != null && Number.isFinite(windowStart) ? todayDas >= windowStart : true;
      if (windowOpen && (await update(next, { task_date: input.todayIso, projected_date: input.todayIso, original_date: next.original_date ?? next.task_date, auto_rescheduled: true, adjustment_reason: "weather_water_deficit_high", resources: { ...(next.resources ?? {}), dynamic: { ...dyn(next), advanced_on: ws.metric_date, advanced_from: next.task_date } } }))) {
        record(next, "ADVANCE", { task_date: next.task_date }, { task_date: input.todayIso }, "Water deficit urgency HIGH — next declared irrigation event brought forward to today", { window_start: Number.isFinite(windowStart) ? windowStart : null, today_das: todayDas });
        counters.irrigation_advanced += 1;
      }
    }
  }

  // 4. APPLICATIONS — spray / spread / foliar tasks due today need a usable window.
  const win = summarizeWindow(ws.spray_window);
  if (win && win.total > 0 && win.good === 0) {
    const due = tasks.filter((t) => !t.is_pinned && t.weather_dependent === true && APPLICATION_TASK_TYPES.has(t.task_type) && t.task_date <= input.todayIso);
    for (const task of due) {
      if (stampedToday(task, "last_deferred_on")) continue; // already moved today
      const next = addDays(input.todayIso, 1);
      // Bound: never defer an application past its stage window (when the window is known).
      const stageEndDas = input.stageRow && task.anchor_stage && input.stageRow.stage_code && norm(task.anchor_stage) === norm(input.stageRow.stage_code) ? input.stageRow.das_max : null;
      const stageEndIso = stageEndDas != null && input.sowingDate ? addDays(String(input.sowingDate).slice(0, 10), stageEndDas) : null;
      const priorDeferrals = Number(dyn(task).application_deferrals ?? 0);
      if (stageEndIso && next > stageEndIso) {
        if (await update(task, { priority: task.priority && PRIORITY_RANK[task.priority] >= PRIORITY_RANK.high ? task.priority : "high", resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), field_verdict: "application_window_exhausted", as_of: ws.metric_date } } })) {
          record(task, "FLAG", { task_date: task.task_date }, { field_verdict: "application_window_exhausted" }, "No usable application window today and the stage window ends before tomorrow — task kept today and flagged for the farmer/expert", { stage_end_das: stageEndDas, application_deferrals: priorDeferrals });
          counters.application_window_exhausted += 1;
        }
        continue;
      }
      if (await update(task, { task_date: next, projected_date: next, original_date: task.original_date ?? task.task_date, auto_rescheduled: true, adjustment_reason: "weather_application_window_unsuitable", resources: { ...(task.resources ?? {}), dynamic: { ...dyn(task), application_deferrals: priorDeferrals + 1, last_deferred_on: ws.metric_date } } })) {
        record(task, "DEFER", { task_date: task.task_date }, { task_date: next }, "No usable spray/application window today (rain, wind or humidity per the weather engine) — application moved to tomorrow and re-checked nightly", { application_deferrals: priorDeferrals + 1 });
        counters.application_deferred += 1;
      }
    }
  }

  // 5. SCOUTING — disease risk, crop stress or NDVI canopy deficit raises today's scouting task.
  const riskReasons: string[] = [];
  if (["HIGH", "CRITICAL"].includes(norm(ws.disease_risk_level))) riskReasons.push(`disease_risk:${norm(ws.disease_risk_level)}`);
  if (ws.crop_stress_level && norm(ws.crop_stress_level) !== "NONE") riskReasons.push(`crop_stress:${norm(ws.crop_stress_level)}`);
  if (canopy && String(canopy.vs_expected ?? "").toLowerCase() === "below") riskReasons.push("ndvi_canopy_below_expected");
  const scouting = tasks.filter((t) => SCOUTING_TASK_TYPES.has(t.task_type) && !t.is_pinned);
  const covering = scouting.find((t) => {
    const rec = (t.resources?.recurrence ?? null) as Record<string, unknown> | null;
    const ws0 = Number(rec?.window_start), we = Number(rec?.window_end);
    return todayDas != null && Number.isFinite(ws0) && Number.isFinite(we) ? todayDas >= ws0 && todayDas <= we : t.task_date >= input.todayIso;
  }) ?? scouting.find((t) => t.task_date >= input.todayIso) ?? null;
  if (covering) {
    const current = dyn(covering);
    if (riskReasons.length) {
      const already = Array.isArray(current.risk_reasons) && JSON.stringify(current.risk_reasons) === JSON.stringify(riskReasons) && String(current.as_of ?? "") === String(ws.metric_date);
      if (!already) {
        const previousPriority = String(current.previous_priority ?? covering.priority ?? "medium");
        const raised = PRIORITY_RANK[String(covering.priority ?? "medium")] >= PRIORITY_RANK.high ? String(covering.priority) : "high";
        if (await update(covering, { priority: raised, resources: { ...(covering.resources ?? {}), dynamic: { ...current, field_verdict: "scout_now", risk_reasons: riskReasons, previous_priority: previousPriority, as_of: ws.metric_date } } })) {
          record(covering, "FLAG", { priority: covering.priority }, { priority: raised, risk_reasons: riskReasons }, "Field risk reported today — scouting task raised so the farmer checks the crop now", { risk_reasons: riskReasons });
          counters.flagged += 1;
        }
      }
    } else if (current.field_verdict === "scout_now") {
      const restore = String(current.previous_priority ?? covering.priority ?? "medium");
      const { field_verdict: _v, risk_reasons: _r, previous_priority: _p, as_of: _a, ...rest } = current;
      if (await update(covering, { priority: restore, resources: { ...(covering.resources ?? {}), dynamic: rest } })) {
        record(covering, "UNFLAG", { priority: covering.priority }, { priority: restore }, "Field risk cleared — scouting task restored to its planned priority");
        counters.unflagged += 1;
      }
    }
  }

  return { applied: true, adjustments, failedTaskIds, counters, evidence };
}

function dyn(task: TaskRow): Record<string, unknown> {
  const d = task.resources?.dynamic;
  return d && typeof d === "object" ? { ...(d as Record<string, unknown>) } : {};
}

function summarizeWindow(v: unknown): { total: number; good: number; caution: number; avoid: number } | null {
  if (!Array.isArray(v)) return null;
  const s = { total: 0, good: 0, caution: 0, avoid: 0 };
  for (const x of v) { const k = String(x ?? "").toLowerCase(); s.total += 1; if (k === "good") s.good += 1; else if (k === "caution") s.caution += 1; else if (k === "avoid") s.avoid += 1; }
  return s;
}

// CHANGE LOG
// 2026-09-21 — CURRENT FIELD PLAN MATERIALIZATION. Keep the DB baseline generator unchanged;
//   classify its persisted tasks against the database-resolved current biological stage so a
//   backdated schedule does not present completed historical windows as still actionable.
//   Past-stage tasks become EXPIRED (actual field practice remains UNKNOWN); tasks in the current
//   biological stage whose window is already open are aligned to today. No agronomic values,
//   rules, thresholds, products or doses are introduced here.

import type { BaselineTask } from "./baseline-generator.ts";

export interface CurrentFieldStage {
  stageUuid: string | null;
  stageCode: string | null;
  currentDas: number | null;
  source: string | null;
  confidence: number | null;
}

export interface PreparedTask {
  task: BaselineTask;
  taskDate: string;
  projectedDate: string;
  status: "pending" | "expired";
  originalDate: string | null;
  autoRescheduled: boolean;
  adjustmentReason: string | null;
  resources: Record<string, unknown>;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function dayDiff(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000,
  );
}

function taskWindow(task: BaselineTask): { from: number | null; to: number | null } {
  const win = task.resources?.window;
  if (!win || typeof win !== "object") {
    return { from: task.days_from_sowing, to: task.days_from_sowing };
  }
  const from = Number((win as Record<string, unknown>).from_das);
  const to = Number((win as Record<string, unknown>).to_das);
  return {
    from: Number.isFinite(from) ? from : task.days_from_sowing,
    to: Number.isFinite(to) ? to : task.days_from_sowing,
  };
}

export function prepareCurrentFieldTasks(
  tasks: BaselineTask[],
  currentStage: CurrentFieldStage | null,
  todayIso: string,
  sowingDate: string | null,
): { tasks: PreparedTask[]; summary: { currentStage: string | null; expired: number; alignedToToday: number; pending: number; skippedBecauseNoStage: number }; gaps: string[] } {
  const gaps: string[] = [];
  const summary = {
    currentStage: currentStage?.stageCode ?? null,
    expired: 0,
    alignedToToday: 0,
    pending: 0,
    skippedBecauseNoStage: 0,
  };

  if (!currentStage?.stageCode || currentStage.currentDas == null || !todayIso) {
    summary.skippedBecauseNoStage = tasks.length;
    return {
      tasks: tasks.map((task) => {
        const baselineDate = sowingDate
          ? new Date(new Date(sowingDate).getTime() + task.days_from_sowing * 86400000).toISOString().split("T")[0]
          : todayIso;
        return {
          task,
          taskDate: baselineDate,
          projectedDate: baselineDate,
          status: "pending",
          originalDate: null,
          autoRescheduled: false,
          adjustmentReason: null,
          resources: task.resources ?? {},
        };
      }),
      summary,
      gaps: ["current_biological_stage_unresolved"],
    };
  }

  const todayDas = currentStage.currentDas;
  const prepared = tasks.map((task) => {
    const baseDate = sowingDate
      ? new Date(new Date(sowingDate).getTime() + task.days_from_sowing * 86400000).toISOString().split("T")[0]
      : todayIso;
    const win = taskWindow(task);
    const taskStage = norm(task.stage_uuid || task.stage_key || task.anchor_stage);
    const currentStageKey = norm(currentStage.stageUuid || currentStage.stageCode);
    const sameStage = !!taskStage && !!currentStageKey && taskStage === currentStageKey;
    const windowPast = win.to != null && win.to < todayDas;
    const windowOpen = win.from != null && win.to != null && todayDas >= win.from && todayDas <= win.to;
    const baseIsPast = baseDate < todayIso;

    const resources = { ...(task.resources ?? {}) };

    // A task whose stage window has already closed is no longer a current farmer action.
    // EXPIRED means the planned window passed before this schedule was materialized; it does
    // NOT mean the farmer skipped or completed the field operation.
    if ((windowPast || (baseIsPast && !sameStage)) && !windowOpen) {
      resources.timeline = {
        state: "HISTORICAL_UNCONFIRMED",
        as_of: todayIso,
        biological_stage: currentStage.stageCode,
        stage_source: currentStage.source,
      };
      summary.expired += 1;
      return {
        task,
        taskDate: baseDate,
        projectedDate: baseDate,
        status: "expired",
        originalDate: null,
        autoRescheduled: false,
        adjustmentReason: "biological_stage_window_passed_before_schedule_generation",
        resources,
      };
    }

    // Current-stage work is actionable now when its stage window is open. Re-anchor only the
    // materialized date; the task's DB-authored DAS window, quantity and agronomy remain intact.
    if (sameStage && windowOpen && baseIsPast) {
      resources.timeline = {
        state: "CURRENT_STAGE_OPEN",
        as_of: todayIso,
        biological_stage: currentStage.stageCode,
        stage_source: currentStage.source,
        original_date: baseDate,
      };
      summary.alignedToToday += 1;
      summary.pending += 1;
      return {
        task,
        taskDate: todayIso,
        projectedDate: todayIso,
        status: "pending",
        originalDate: baseDate,
        autoRescheduled: true,
        adjustmentReason: "current_biological_stage_window_open",
        resources,
      };
    }

    summary.pending += 1;
    return {
      task,
      taskDate: baseDate,
      projectedDate: baseDate,
      status: "pending",
      originalDate: null,
      autoRescheduled: false,
      adjustmentReason: null,
      resources,
    };
  });

  if (sowingDate && dayDiff(sowingDate, todayIso) < 0) {
    gaps.push("today_before_sowing_date");
  }

  return { tasks: prepared, summary, gaps };
}

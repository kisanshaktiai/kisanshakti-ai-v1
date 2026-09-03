// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: supabase/functions/ai-smart-schedule/generator/validate-schedule.ts
//
// CHANGE LOG
// 2026-08-30 01:35 UTC — degrade-don't-discard: das_max is now received already
//   normalised onto the sowing axis (transplant-clocked stages no longer trip the
//   bounds check); a task with NO stage link is a warning (W2), not a violation;
//   a DAS beyond the graph/variety bound is a warning (W3). Only structurally
//   impossible output still blocks persistence.
// 2026-08-28 — P2 (forensic implementation prompt): pre-activation validation gate. A
//   generated baseline is checked against structural invariants BEFORE anything is
//   persisted; any violation blocks the schedule (422 SCHEDULE_VALIDATION_FAILED in
//   index.ts — invariant 15). Pure function, no DB access, no agronomic constants:
//   every check is against the SELECTED stage graph and the tasks themselves.
//
//   Hard invariants enforced here (violations — block persistence):
//     V1 a task whose stage_uuid belongs to a DIFFERENT stage graph;
//     V2 every task carries non-empty source provenance (source_refs);
//     V3 days_from_sowing is null or negative;
//     V4 every task has a task_name and a task_type.
//     V5 recurrence metadata, when present, is structurally valid.
//   Soft checks (warnings — recorded, never block):
//     W1 a harvest-type task dated after the variety's stated maturity window;
//     W2 a task with no resolvable stage link;
//     W3 a task dated beyond the stage-graph / variety bound.


import type { BaselineTask } from "./baseline-generator.ts";

export interface StageRef {
  id: string;
  das_max: number | null;
}

export interface ValidationResult {
  violations: string[];
  warnings: string[];
}

export function validateBaseline(
  tasks: BaselineTask[],
  stages: StageRef[],
  varietyMaxDays: number | null,
): ValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const stageIds = new Set(stages.map((s) => String(s.id)));
  const graphMaxDas = stages.reduce(
    (max, s) => (s.das_max != null && s.das_max > max ? s.das_max : max),
    0,
  );

  const cap = (list: string[], msg: string) => {
    if (list.length < 10) list.push(msg);
    else if (list.length === 10) list.push("… further identical-class findings truncated");
  };

  const upperBound = Math.max(graphMaxDas, varietyMaxDays ?? 0);

  for (const t of tasks) {
    const ref = `${t.task_type}@das${t.days_from_sowing}`;
    if (t.stage_uuid) {
      // A stage id that belongs to ANOTHER graph is a hard violation.
      if (!stageIds.has(String(t.stage_uuid))) {
        cap(violations, `V1 stage_not_in_selected_graph: ${ref}`);
      }
    } else {
      // An unmappable stage is a known, degraded-but-usable outcome
      // (gap "task_stage_unmappable") — never a reason to discard the plan.
      cap(warnings, `W2 task_without_stage_link: ${ref}`);
    }
    if (!t.source_refs || t.source_refs.length === 0) {
      cap(violations, `V2 missing_provenance: ${ref}`);
    }
    if (t.days_from_sowing == null || t.days_from_sowing < 0) {
      cap(violations, `V3 das_out_of_graph_bounds: ${ref}`);
    } else if (upperBound > 0 && t.days_from_sowing > upperBound) {
      cap(warnings, `W3 das_beyond_graph_bounds: ${ref} (bound ${upperBound})`);
    }
    if (!t.task_name || !t.task_type) {
      cap(violations, `V4 incomplete_task: ${ref}`);
    }
    if (t.recurrence) {
      const r = t.recurrence;
      if (
        !Number.isFinite(r.interval_days) || r.interval_days < 1 ||
        !Number.isFinite(r.window_start) || !Number.isFinite(r.window_end) ||
        r.window_start < 0 || r.window_end < r.window_start ||
        !Number.isFinite(r.expected_events) || r.expected_events < 1
      ) {
        cap(violations, `V5 recurrence_invalid: ${ref}`);
      }
    }
    if (
      varietyMaxDays != null &&
      t.task_type === "harvest" &&
      t.days_from_sowing != null &&
      t.days_from_sowing > varietyMaxDays
    ) {
      cap(warnings, `W1 harvest_task_after_variety_maturity: ${ref} (variety max ${varietyMaxDays}d)`);
    }
    // 2026-09-03: a task counted on the SOWING axis must not be worded on the
    // transplanting clock — the farmer reads the day number against the wrong event.
    const text = `${t.task_name ?? ""} ${(t as { task_description?: string }).task_description ?? ""}`;
    if (/\b(?:DAT|after transplant)/i.test(text) && t.anchor_type !== "TRANSPLANT") {
      cap(warnings, `W4 transplant_wording_on_sowing_axis: ${ref}`);
    }

  }


  return { violations, warnings };
}

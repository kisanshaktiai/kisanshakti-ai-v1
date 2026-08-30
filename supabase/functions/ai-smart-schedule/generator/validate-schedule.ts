// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: supabase/functions/ai-smart-schedule/generator/validate-schedule.ts
//
// CHANGE LOG
// 2026-08-28 — P2 (forensic implementation prompt): pre-activation validation gate. A
//   generated baseline is checked against structural invariants BEFORE anything is
//   persisted; any violation blocks the schedule (422 SCHEDULE_VALIDATION_FAILED in
//   index.ts — invariant 15). Pure function, no DB access, no agronomic constants:
//   every check is against the SELECTED stage graph and the tasks themselves.
//
//   Hard invariants enforced here (violations — block persistence):
//     V1 every task's stage_uuid belongs to the selected stage graph
//        (⇒ a task can never carry another crop's / another method's stage — this is
//         the structural form of invariants 3, 4, 6 and 7: cross-method content cannot
//         attach because the other method's stage ids are not in the graph);
//     V2 every task carries non-empty source provenance (source_refs);
//     V3 every task's days_from_sowing lies within [0, stage-graph max DAS];
//     V4 every task has a task_name and a task_type.
//   Soft checks (warnings — recorded, never block):
//     W1 a harvest-type task dated after the variety's stated maturity window.

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
    if (
      varietyMaxDays != null &&
      t.task_type === "harvest" &&
      t.days_from_sowing != null &&
      t.days_from_sowing > varietyMaxDays
    ) {
      cap(warnings, `W1 harvest_task_after_variety_maturity: ${ref} (variety max ${varietyMaxDays}d)`);
    }
  }


  return { violations, warnings };
}

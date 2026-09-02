import type { BaselineTask } from "../generator/baseline-generator.ts";
import type { CandidateNode, ScheduleCandidateGraph } from "./types.ts";

const id = (i: number) => `task_${String(i + 1).padStart(4, "0")}`;

export function buildCandidateGraph(tasks: BaselineTask[]): ScheduleCandidateGraph {
  const nodes: CandidateNode[] = tasks.map((t, i) => ({
    id: id(i),
    task_index: i,
    task_type: t.task_type,
    days_from_sowing: t.days_from_sowing,
    stage_uuid: t.stage_uuid,
    stage_key: t.stage_key,
    stage_order: t.stage_order,
    priority: t.priority,
    weather_dependent: t.weather_dependent,
    rule_ids: [...t.rule_ids],
    source_count: t.source_refs.length,
    depends_on: [],
    required: true,
  }));

  // Dates and stage order are chronology, not proof of causality.
  // Do not invent dependency edges until an explicit DB dependency relation
  // is carried into the candidate graph by the deterministic agronomy layer.
  return { schema_version: "schedule_candidate_graph_v1", nodes, edges: [] };
}

export function canonicalSequence(graph: ScheduleCandidateGraph): string[] {
  return [...graph.nodes]
    .sort((a, b) =>
      a.days_from_sowing - b.days_from_sowing ||
      a.stage_order - b.stage_order ||
      a.task_index - b.task_index
    )
    .map((node) => node.id);
}

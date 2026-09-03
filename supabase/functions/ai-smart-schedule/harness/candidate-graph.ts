import type { BaselineTask } from "../generator/baseline-generator.ts";
import type { HarnessCandidate } from "./evidence-pack.ts";
import type { CandidateNode, ScheduleCandidateGraph } from "./types.ts";

export function buildCandidateGraph(tasks: BaselineTask[], evidenceCandidates: HarnessCandidate[] = []): ScheduleCandidateGraph {
  const baselineNodes: CandidateNode[] = tasks.map((t, i) => ({
    id: `task_${String(i + 1).padStart(4, "0")}`,
    task_index: i,
    task_type: t.task_type,
    domain: String(t.task_type).toUpperCase(),
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
    default_status: "SCHEDULED",
    trigger_class: null,
    condition_code: null,
    materializable: true,
  }));

  const evidenceNodes: CandidateNode[] = evidenceCandidates.map((c, i) => ({
    id: c.id,
    task_index: tasks.length + i,
    task_type: c.task.task_type,
    domain: c.domain,
    days_from_sowing: c.task.days_from_sowing,
    stage_uuid: c.task.stage_uuid,
    stage_key: c.task.stage_key,
    stage_order: c.task.stage_order,
    priority: c.task.priority,
    weather_dependent: c.task.weather_dependent,
    rule_ids: [...c.task.rule_ids],
    source_count: c.task.source_refs.length,
    depends_on: [],
    required: false,
    default_status: c.default_status,
    trigger_class: c.trigger_class,
    condition_code: c.condition_code,
    materializable: c.materializable,
    evidence: c.evidence,
  }));

  // Dependency edges are copied only from DB-supplied rule references. Chronology alone
  // is not treated as causality; this keeps the graph conservative until the DB expresses it.
  const all = [...baselineNodes, ...evidenceNodes];
  const byRule = new Map<string, string>();
  for (const n of all) for (const ruleId of n.rule_ids) byRule.set(ruleId, n.id);
  const edges: Array<{ from: string; to: string }> = [];
  for (const n of evidenceNodes) {
    const e = n.evidence ?? {};
    for (const key of ["sequence_after", "prerequisite_rule_ids"]) {
      const refs = Array.isArray(e[key]) ? e[key].map(String) : [];
      for (const ruleId of refs) {
        const from = byRule.get(ruleId);
        if (from && from !== n.id) edges.push({ from, to: n.id });
      }
    }
  }
  return { schema_version: "schedule_candidate_graph_v2", nodes: all, edges: [...new Map(edges.map(e => [`${e.from}->${e.to}`, e])).values()] };
}

export function canonicalSequence(graph: ScheduleCandidateGraph): string[] {
  return [...graph.nodes]
    .filter(n => n.required)
    .sort((a, b) => a.days_from_sowing - b.days_from_sowing || a.stage_order - b.stage_order || a.task_index - b.task_index)
    .map(n => n.id);
}

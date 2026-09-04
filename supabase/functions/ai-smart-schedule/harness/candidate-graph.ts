import type { BaselineTask } from "../generator/baseline-generator.ts";
import type { HarnessCandidate } from "./evidence-pack.ts";
import type { CandidateNode, ScheduleCandidateGraph } from "./types.ts";

const dependencyRuleIds = (t: BaselineTask): string[] => {
  const r = (t.resources ?? {}) as Record<string, unknown>;
  return [...new Set([r.sequence_after, r.prerequisite_rule_ids].flatMap((v) => Array.isArray(v) ? v.map(String) : []))];
};

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
    depends_on: dependencyRuleIds(t),
    required: true,
    default_status: "SCHEDULED",
    trigger_class: null,
    condition_code: null,
    materializable: true,
    evidence: { quantity: t.quantity, anchor_type: t.anchor_type, anchor_stage: t.anchor_stage, gdd_target: t.gdd_target, stage_name: t.stage_name, source_refs: t.source_refs, resources: t.resources ?? {}, technical_details: t.technical_details ?? [] },
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
    depends_on: dependencyRuleIds(c.task),
    required: false,
    default_status: c.default_status,
    trigger_class: c.trigger_class,
    condition_code: c.condition_code,
    materializable: c.materializable,
    evidence: c.evidence,
  }));

  const all = [...baselineNodes, ...evidenceNodes];
  const byRule = new Map<string, string>();
  for (const n of all) for (const ruleId of n.rule_ids) byRule.set(ruleId, n.id);
  const edges: Array<{ from: string; to: string }> = [];
  for (const n of all) {
    for (const ruleId of n.depends_on) {
      const from = byRule.get(ruleId);
      if (from && from !== n.id) edges.push({ from, to: n.id });
    }
  }
  return { schema_version: "schedule_candidate_graph_v2", nodes: all, edges: [...new Map(edges.map((e) => [`${e.from}->${e.to}`, e])).values()] };
}

export function canonicalSequence(graph: ScheduleCandidateGraph): string[] {
  const required = graph.nodes.filter((n) => n.required);
  const byId = new Map(required.map((n) => [n.id, n]));
  const deps = new Map<string, string[]>();
  for (const n of required) deps.set(n.id, n.depends_on.filter((r) => byId.has(r)));
  const result: string[] = [];
  const remaining = new Set(required.map((n) => n.id));
  while (remaining.size) {
    const ready = [...remaining]
      .filter((id) => (deps.get(id) ?? []).every((d) => !remaining.has(d)))
      .map((id) => byId.get(id)!)
      .sort((a, b) => a.days_from_sowing - b.days_from_sowing || a.stage_order - b.stage_order || a.task_index - b.task_index);
    if (!ready.length) {
      return [...result, ...[...remaining].map((id) => byId.get(id)!).sort((a, b) => a.days_from_sowing - b.days_from_sowing || a.task_index - b.task_index).map((n) => n.id)];
    }
    for (const n of ready) { result.push(n.id); remaining.delete(n.id); }
  }
  return result;
}
import type { PlanIntent, ScheduleCandidateGraph } from "./types.ts";
import { PLAN_SCHEMA_VERSION } from "./types.ts";

export function validatePlanIntent(plan: PlanIntent, graph: ScheduleCandidateGraph): string[] {
  const e: string[] = [];
  if (plan.schema_version !== PLAN_SCHEMA_VERSION) e.push("schema_version_invalid");
  if (!["READY", "NEEDS_DATA", "NO_VALID_PLAN"].includes(plan.status)) e.push("status_invalid");

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  for (const x of plan.sequence) {
    const node = byId.get(x.candidate_id);
    if (!node) e.push(`unknown_candidate_id:${x.candidate_id}`);
    if (seen.has(x.candidate_id)) e.push(`duplicate_candidate_id:${x.candidate_id}`);
    seen.add(x.candidate_id);
    if (!x.status || !["SCHEDULED", "CONDITIONAL", "MONITOR", "INSUFFICIENT_DATA"].includes(x.status)) {
      e.push(`invalid_candidate_status:${x.candidate_id}`);
    }
    if (node) {
      if (node.required && x.status !== "SCHEDULED") {
        e.push(`required_baseline_not_scheduled:${x.candidate_id}`);
      }
      if (!node.required && x.status === "SCHEDULED" && !node.materializable) {
        e.push(`non_materializable_scheduled:${x.candidate_id}`);
      }
      if (node.default_status === "MONITOR" && x.status === "SCHEDULED") {
        e.push(`monitor_candidate_promoted_to_scheduled:${x.candidate_id}`);
      }
      if (node.default_status === "INSUFFICIENT_DATA" && x.status === "SCHEDULED") {
        e.push(`insufficient_evidence_promoted_to_scheduled:${x.candidate_id}`);
      }
    }
  }

  if (plan.status === "READY") {
    for (const n of graph.nodes) {
      if (n.required && !seen.has(n.id)) e.push(`required_candidate_missing:${n.id}`);
    }
    const scheduledOrConditional = plan.sequence.filter((x) => x.status === "SCHEDULED" || x.status === "CONDITIONAL");
    const orders = plan.sequence.map((x) => x.sequence_order);
    if (new Set(orders).size !== orders.length) e.push("duplicate_sequence_order");
    const ordered = [...plan.sequence].sort((a, b) => a.sequence_order - b.sequence_order);
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].sequence_order !== i + 1) e.push("sequence_order_not_contiguous");
    }
    const pos = new Map(ordered.map((x, i) => [x.candidate_id, i]));
    for (const edge of graph.edges) {
      const a = pos.get(edge.from);
      const b = pos.get(edge.to);
      if (a != null && b != null && a >= b) e.push(`dependency_violation:${edge.from}->${edge.to}`);
    }
    if (!scheduledOrConditional.some((x) => byId.get(x.candidate_id)?.required)) e.push("no_required_schedule_candidates");
  }

  return [...new Set(e)];
}

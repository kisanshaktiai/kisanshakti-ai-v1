import { buildCandidateGraph, canonicalSequence } from "./candidate-graph.ts";
import { validatePlanIntent } from "./validator.ts";
import { PLAN_SCHEMA_VERSION, type PlanIntent } from "./types.ts";

const tasks: any[] = [
  { task_type: "sowing", days_from_sowing: 0, stage_uuid: "s1", stage_key: "SOW", stage_order: 1, priority: "high", weather_dependent: false, rule_ids: ["r1"], source_refs: [{}] },
  { task_type: "nutrition", days_from_sowing: 20, stage_uuid: "s2", stage_key: "VEG", stage_order: 2, priority: "medium", weather_dependent: false, rule_ids: ["r2"], source_refs: [{}] },
];

// Happy path: every required baseline candidate is scheduled at its canonical
// position, which the current validator must accept with zero violations.
Deno.test("harness v2: accepts canonical graph plan", () => {
  const g = buildCandidateGraph(tasks as any);
  const p: PlanIntent = {
    schema_version: PLAN_SCHEMA_VERSION,
    status: "READY",
    sequence: canonicalSequence(g).map((candidate_id: string, i: number) => ({
      candidate_id,
      sequence_order: i + 1,
      status: "SCHEDULED" as const,
    })),
    uncertainties: [],
    reasoning_summary: "test",
  };
  const violations = validatePlanIntent(p, g);
  if (violations.length !== 0) throw new Error(`expected no violations, got ${JSON.stringify(violations)}`);
});

// A candidate that is not in the graph must be rejected as invented.
Deno.test("harness v2: rejects invented candidates", () => {
  const g = buildCandidateGraph(tasks as any);
  const p: PlanIntent = {
    schema_version: PLAN_SCHEMA_VERSION,
    status: "READY",
    sequence: [{ candidate_id: "invented", sequence_order: 1, status: "SCHEDULED" }],
    uncertainties: [],
    reasoning_summary: "test",
  };
  if (!validatePlanIntent(p, g).some((x: string) => x.startsWith("unknown_candidate_id"))) {
    throw new Error("expected an unknown_candidate_id violation");
  }
});

// A required baseline candidate left out of the sequence must be rejected.
Deno.test("harness v2: rejects missing required candidates", () => {
  const g = buildCandidateGraph(tasks as any);
  const p: PlanIntent = {
    schema_version: PLAN_SCHEMA_VERSION,
    status: "READY",
    sequence: [{ candidate_id: "task_0001", sequence_order: 1, status: "SCHEDULED" }],
    uncertainties: [],
    reasoning_summary: "test",
  };
  if (!validatePlanIntent(p, g).some((x: string) => x.startsWith("required_candidate_missing"))) {
    throw new Error("expected a required_candidate_missing violation");
  }
});

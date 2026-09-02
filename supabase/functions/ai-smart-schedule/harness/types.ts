import type { BaselineTask } from "../generator/baseline-generator.ts";

export const HARNESS_VERSION = "crop-schedule-harness@2.0.0";
export const PLAN_SCHEMA_VERSION = "schedule_plan_intent_v2" as const;

export type HarnessStatus =
  | "READY"
  | "NEEDS_DATA"
  | "NO_VALID_PLAN"
  | "INVALID_PLAN"
  | "MODEL_UNAVAILABLE"
  | "MODEL_TIMEOUT";

export interface CandidateNode {
  id: string;
  task_index: number;
  task_type: string;
  days_from_sowing: number;
  stage_uuid: string | null;
  stage_key: string | null;
  stage_order: number;
  priority: string;
  weather_dependent: boolean;
  rule_ids: string[];
  source_count: number;
  depends_on: string[];
  required: true;
}

export interface ScheduleCandidateGraph {
  schema_version: "schedule_candidate_graph_v1";
  nodes: CandidateNode[];
  edges: Array<{ from: string; to: string }>;
}

export interface ScheduleHarnessContext {
  cropCode: string;
  cultivationMethod: string | null;
  cropCycle: string | null;
  gaps: string[];
  graph: ScheduleCandidateGraph;
}

export interface PlanItem {
  candidate_id: string;
  sequence_order: number;
}

export interface PlanIntent {
  schema_version: typeof PLAN_SCHEMA_VERSION;
  status: "READY" | "NEEDS_DATA" | "NO_VALID_PLAN";
  sequence: PlanItem[];
  uncertainties: string[];
  reasoning_summary: string;
}

export interface HarnessResult {
  applied: boolean;
  status: HarnessStatus;
  plan: PlanIntent | null;
  selectedIds: string[];
  trace: Record<string, unknown>;
}

export interface HarnessExecution {
  tasks: BaselineTask[];
  result: HarnessResult;
}

export const HARNESS_VERSION = "crop-schedule-harness@1.0.0";
export type HarnessStatus = "READY" | "NEEDS_DATA" | "NO_VALID_PLAN" | "INVALID_PLAN";
export interface CandidateTask { index:number; task_type:string; stage_uuid:string|null; stage_key:string|null; rule_ids:string[]; }
export interface ScheduleHarnessContext { cropCode:string; cultivationMethod:string|null; cropCycle:string|null; candidateTasks:CandidateTask[]; gaps:string[]; }
export interface PlanItem { candidate_index:number; sequence_order:number; }
export interface PlanIntent { schema_version:"schedule_plan_intent_v1"; status:HarnessStatus; selected_candidate_indices:number[]; sequence:PlanItem[]; omissions:Array<{candidate_index:number;reason_code:string}>; uncertainties:string[]; reasoning_summary:string; }
export interface HarnessResult { applied:boolean; status:HarnessStatus; plan:PlanIntent|null; selectedIndices:number[]; trace:Record<string,unknown>; }

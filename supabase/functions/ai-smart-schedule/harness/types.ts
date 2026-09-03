import type { BaselineTask } from "../generator/baseline-generator.ts";
import type { AgronomicEvidencePack, CandidateStatus } from "./evidence-pack.ts";
export const HARNESS_VERSION="crop-schedule-harness@3.0.0";
export const PLAN_SCHEMA_VERSION="schedule_plan_intent_v3" as const;
export type HarnessStatus="READY"|"NEEDS_DATA"|"NO_VALID_PLAN"|"INVALID_PLAN"|"MODEL_UNAVAILABLE"|"MODEL_TIMEOUT";
export interface CandidateNode{id:string;task_index:number;task_type:string;domain:string;days_from_sowing:number;stage_uuid:string|null;stage_key:string|null;stage_order:number;priority:string;weather_dependent:boolean;rule_ids:string[];source_count:number;depends_on:string[];required:boolean;default_status:CandidateStatus;trigger_class:string|null;condition_code:string|null;materializable:boolean;evidence?:Record<string,unknown>}
export interface ScheduleCandidateGraph{schema_version:"schedule_candidate_graph_v2";nodes:CandidateNode[];edges:Array<{from:string;to:string}>}
export interface ScheduleHarnessContext{cropCode:string;cultivationMethod:string|null;cropCycle:string|null;gaps:string[];graph:ScheduleCandidateGraph;evidencePack:AgronomicEvidencePack}
export interface PlanItem{candidate_id:string;sequence_order:number;status?:CandidateStatus;reason?:string}
export interface PlanIntent{schema_version:string;status:"READY"|"NEEDS_DATA"|"NO_VALID_PLAN";sequence:PlanItem[];uncertainties:string[];reasoning_summary:string}
export interface HarnessResult{applied:boolean;status:HarnessStatus;plan:PlanIntent|null;selectedIds:string[];trace:Record<string,unknown>}
export interface HarnessExecution{tasks:BaselineTask[];result:HarnessResult}

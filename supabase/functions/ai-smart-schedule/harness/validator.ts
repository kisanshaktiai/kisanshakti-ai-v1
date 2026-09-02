import type { CandidateTask, PlanIntent } from "./types.ts";
export function validatePlanIntent(plan: PlanIntent, candidates: CandidateTask[]): string[] {
  const errors:string[]=[]; const allowed=new Set(candidates.map(c=>c.index));
  if(plan.schema_version!=="schedule_plan_intent_v1") errors.push("schema_version_invalid");
  for(const i of plan.selected_candidate_indices) if(!allowed.has(i)) errors.push(`unknown_candidate_index:${i}`);
  const seen=new Set<number>();
  for(const item of plan.sequence){ if(!allowed.has(item.candidate_index)) errors.push(`unknown_candidate_index:${item.candidate_index}`); if(seen.has(item.candidate_index)) errors.push(`duplicate_candidate_index:${item.candidate_index}`); seen.add(item.candidate_index); }
  return [...new Set(errors)];
}

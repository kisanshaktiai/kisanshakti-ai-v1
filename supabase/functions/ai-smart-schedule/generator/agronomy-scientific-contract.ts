/**
 * YieldShield scientific publishing contract.
 * Pure safety invariants: never convert an unverified record or an ambiguous
 * agricultural clock into a farmer-ready input rate / harvest date.
 */
import { monitoringViolations } from "./monitoring-safety.ts";
export type DurationReference = "sowing" | "nursery_sowing" | "direct_sowing" | "transplanting";
export function isUnverifiedTier(tier: unknown): boolean {
  const value = String(tier ?? "").trim().toLowerCase();
  return !value || value === "d_unverified" || value.startsWith("d_") ||
    value.includes("unverified") || value.includes("pending");
}
export function resolvedMaturityDas(
  days: number | null,
  reference: unknown,
  tier: unknown,
  transplantOffset: number | null,
): { maxDas: number | null; issue: string | null } {
  if (days == null || !Number.isFinite(days) || days <= 0)
    return { maxDas: null, issue: "variety_duration_unavailable" };
  if (isUnverifiedTier(tier))
    return { maxDas: null, issue: "variety_duration_evidence_unverified" };
  const clock = String(reference ?? "").trim().toLowerCase();
  if (clock === "sowing" || clock === "nursery_sowing" || clock === "direct_sowing")
    return { maxDas: days, issue: null };
  if (clock === "transplanting")
    return transplantOffset != null && Number.isFinite(transplantOffset) && transplantOffset >= 0
      ? { maxDas: transplantOffset + days, issue: null }
      : { maxDas: null, issue: "variety_duration_transplant_anchor_missing" };
  return { maxDas: null, issue: "variety_duration_reference_unresolved" };
}
export function isDeficiencyDependentAction(id: unknown, text: unknown): boolean {
  return /(?:DEFICIT|DEFICIENCY)/i.test(String(id ?? "")) ||
    /\b(?:if|when)\s+(?:a\s+)?(?:deficien|nutrient\s+symptom)/i.test(String(text ?? ""));
}
/** Biological harvest is not a pre-harvest or post-harvest support phase. */
export function isBiologicalHarvestStage(stage: unknown): boolean {
  const name = String(stage ?? "").trim().toLowerCase();
  return /^(harvest|maturation_harvest|harvest_maturity|first_picking|successive_harvest)$/.test(name);
}
/**
 * 2026-11-12 — release assessment split in two (was one all-or-nothing blocker list that sent
 * every crop to a review draft because the approval registry is empty by design):
 *
 *  - agronomyActivationBlockers: STRUCTURAL faults. No schedule can be built safely, so the request
 *    still goes to the review-draft ledger (Lovable review flow unchanged).
 *  - agronomyProvisionalReasons: missing variety / material-rate / picking-interval evidence. The
 *    stage-graph schedule is saved as PROVISIONAL; the unverified quantity or date itself stays
 *    withheld by the generator (never fabricated) and each reason is shown to the farmer and
 *    queued for scientific approval.
 */
export interface AgronomyReleaseInput {
  propagationMaterial: string | null;
  cropCycle: string | null;
  documentedMaterialRate: boolean;
  maturityDas: number | null;
  hasHarvestStage: boolean;
  hasHarvestTask: boolean;
  multiHarvestStage: boolean;
}
export function agronomyActivationBlockers(input: AgronomyReleaseInput): string[] {
  return !input.hasHarvestStage || !input.hasHarvestTask ? ["BIOLOGICAL_HARVEST_PROGRAMME_INCOMPLETE"] : [];
}
export function agronomyProvisionalReasons(input: AgronomyReleaseInput): string[] {
  const reasons: string[] = [];
  const material = String(input.propagationMaterial ?? "").trim().toLowerCase();
  const ratoon = String(input.cropCycle ?? "").toLowerCase() === "ratoon" || material === "ratoon_stubble";
  if (!ratoon && !input.documentedMaterialRate) {
    if (!material || material === "any") reasons.push("PROPAGATION_MATERIAL_UNRESOLVED");
    else if (material === "seed") reasons.push("SEED_RATE_DOCUMENTED_EVIDENCE_MISSING");
    else reasons.push("PLANTING_MATERIAL_RATE_SOURCE_MISSING");
  }
  if (input.maturityDas == null || !Number.isFinite(input.maturityDas))
    reasons.push("VARIETY_MATURITY_CLOCK_NOT_VERIFIED");
  if (input.multiHarvestStage)
    reasons.push("REPEATED_PICKING_INTERVAL_NOT_VERIFIED");
  return reasons;
}
/** A crop is repeated-picking when its own stage graph declares more than one biological harvest stage. */
export function biologicalHarvestStages<T extends { growth_stage?: string | null }>(stages: T[]): T[] {
  return stages.filter((s) => isBiologicalHarvestStage(s.growth_stage));
}
export interface ScientificTask {
  task_type: string;
  days_from_sowing: number;
  stage_uuid?: string | null;
  source_refs?: unknown[];
  instructions?: string[];
  task_description?: string;
  resources?: Record<string, unknown>;
  water_volume?: unknown;
  quantity?: unknown;
  nutrient?: unknown;
}
export interface ScientificStage {id: string;growth_stage?: string | null;das_min?: number | null;}
export function validateScientificTasks<T extends ScientificTask>(tasks: T[], stages: ScientificStage[]): string[] {
  const issues: string[] = [];
  const stageMap = new Map(stages.map(s=>[s.id,s]));
  for(const task of tasks) {
    const tag = task.task_type+"@DAS"+task.days_from_sowing;
    if(task.task_type === "harvest") {
      const st=task.stage_uuid ? stageMap.get(task.stage_uuid):null;
      if(!st || !isBiologicalHarvestStage(st.growth_stage))
        issues.push("HARVEST_STAGE_MISMATCH:"+tag);
      else if(st.das_min != null && task.days_from_sowing < st.das_min)
        issues.push("HARVEST_BEFORE_STAGE:"+tag);
    }
    for(const v of monitoringViolations(task)) issues.push(v+":"+tag);
    if(task.task_type === "irrigation" && /nursery/i.test(String(task.resources?.area_scope || "")) &&
       task.water_volume != null)
      issues.push("NURSERY_AREA_NOT_VALIDATED:"+tag);
  }
  return issues;
}

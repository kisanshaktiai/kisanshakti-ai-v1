/**
 * YieldShield scientific publishing contract.
 * Pure safety invariants: never convert an unverified record or an ambiguous
 * agricultural clock into a farmer-ready input rate / harvest date.
 */
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
/**
 * Many old decision_rules encode application dates only in free text.
 * They cannot be treated as stage-start tasks without typed timing evidence.
 * This is a safety filter, not an extractor of agricultural timings.
 */
export function hasUnstructuredRelativeTiming(text: unknown): boolean {
  const value = String(text ?? "");
  return /\b\d+(?:\s*(?:-|to|–)\s*\d+)?\s*(?:days?|weeks?)\s+after\s+(?:transplant(?:ing)?|plant(?:ing)?|sow(?:ing)?|seeding|harvest)\b/i.test(value);
}
export function isDeficiencyDependentAction(id: unknown, text: unknown): boolean {
  return /(?:DEFICIT|DEFICIENCY)/i.test(String(id ?? "")) ||
    /\b(?:if|when)\s+(?:a\s+)?(?:deficien|nutrient\s+symptom)/i.test(String(text ?? ""));
}
/** A scouting card is observation only, never a standing prescription. */
export function isTreatmentInstruction(text: unknown): boolean {
  return /\b(?:apply|spray|dose|tank.mix|herbicide|fungicide|insecticide|ml\s*\/\s*acre|g\s*\/\s*acre)\b|(?:फवारणी\s*करा|फवारा|कीटकनाशक\s*द्या|तणनाशक\s*द्या)/i.test(String(text ?? ""));
}
/** Biological harvest is not a pre-harvest or post-harvest support phase. */
export function isBiologicalHarvestStage(stage: unknown): boolean {
  const name = String(stage ?? "").trim().toLowerCase();
  return /^(harvest|maturation_harvest|harvest_maturity|first_picking|successive_harvest)$/.test(name);
}
/**
 * A DB-backed assessment of whether the program may be ACTIVATED, as distinct
 * from a review-only discussion of crop establishment and field observations.
 * 'Documented' does not claim formal ICAR certification.
 */
export function agronomyActivationBlockers(input: {
  propagationMaterial: string | null;
  cropCycle: string | null;
  documentedMaterialRate: boolean;
  maturityDas: number | null;
  hasHarvestStage: boolean;
  hasHarvestTask: boolean;
  multiHarvestStage: boolean;
}): string[] {
  const blockers: string[] = [];
  const material = String(input.propagationMaterial ?? "").trim().toLowerCase();
  const ratoon = String(input.cropCycle ?? "").toLowerCase() === "ratoon" || material === "ratoon_stubble";
  if (!ratoon && !input.documentedMaterialRate) {
    if (!material || material === "any") blockers.push("PROPAGATION_MATERIAL_UNRESOLVED");
    else if (material === "seed") blockers.push("SEED_RATE_DOCUMENTED_EVIDENCE_MISSING");
    else blockers.push("PLANTING_MATERIAL_RATE_SOURCE_MISSING");
  }
  if (input.maturityDas == null || !Number.isFinite(input.maturityDas))
    blockers.push("VARIETY_MATURITY_CLOCK_NOT_VERIFIED");
  if (!input.hasHarvestStage || !input.hasHarvestTask)
    blockers.push("BIOLOGICAL_HARVEST_PROGRAMME_INCOMPLETE");
  if (input.multiHarvestStage)
    blockers.push("REPEATED_PICKING_PROGRAMME_NOT_VERIFIED");
  return blockers;
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
    if(task.task_type === "monitoring" &&
      (task.instructions||[]).some(isTreatmentInstruction))
      issues.push("MONITORING_CONTAINS_TREATMENT:"+tag);
    if(task.task_type === "irrigation" && /nursery/i.test(String(task.resources?.area_scope || "")) &&
       task.water_volume != null)
      issues.push("NURSERY_AREA_NOT_VALIDATED:"+tag);
  }
  return issues;
}

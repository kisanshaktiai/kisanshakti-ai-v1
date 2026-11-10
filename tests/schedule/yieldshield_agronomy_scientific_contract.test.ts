import { describe, expect, it } from "vitest";
import {
  hasUnstructuredRelativeTiming, isDeficiencyDependentAction,
  isTreatmentInstruction, isUnverifiedTier, resolvedMaturityDas,
  validateScientificTasks,
} from "../../supabase/functions/ai-smart-schedule/generator/agronomy-scientific-contract";

describe("YieldShield agronomic evidence and crop-clock invariants", () => {
  it("blocks Indrayani D_unverified 119 DAT becoming 119 nursery DAS", () => {
    expect(resolvedMaturityDas(119,"transplanting","D_unverified",42)).toEqual({
      maxDas:null,issue:"variety_duration_evidence_unverified"
    });
  });
  it("converts trusted DAT duration to sowing axis only with the recorded anchor", () => {
    expect(resolvedMaturityDas(119,"transplanting","C_documented_source",42).maxDas).toBe(161);
    expect(resolvedMaturityDas(119,"transplanting","C_documented_source",null).maxDas).toBeNull();
  });
  it("does not convert an absent or ambiguous duration reference", () => {
    expect(resolvedMaturityDas(119,null,"C_documented_source",42).issue).toBe("variety_duration_reference_unresolved");
    expect(resolvedMaturityDas(null,"sowing","C_documented_source",null).maxDas).toBeNull();
  });
  it("understands seed evidence tier D is not approved for quantitative recommendations", () => {
    expect(isUnverifiedTier("D_unverified")).toBe(true);
    expect(isUnverifiedTier("C_documented_source")).toBe(false);
    expect(isUnverifiedTier("")).toBe(true);
  });
  it("detects unstructured relative timings without turning prose into a date", () => {
    expect(hasUnstructuredRelativeTiming("Apply 8 to 10 days after transplanting")).toBe(true);
    expect(hasUnstructuredRelativeTiming("Weed 15 days after transplanting")).toBe(true);
    expect(hasUnstructuredRelativeTiming("Mix 20 kg per hectare")).toBe(false);
  });
  it("requires evidence for nutrient deficiency remediation", () => {
    expect(isDeficiencyDependentAction("RICE_NUTR_MN_DEFICIT_TNAU_DRAFT_002","spray")).toBe(true);
    expect(isDeficiencyDependentAction("N_TOP","regular nitrogen management")).toBe(false);
  });
  it("separates chemical treatment recipes from observational scouting", () => {
    expect(isTreatmentInstruction("Apply Tricyclazole 75 WP 160 g/acre by foliar spray")).toBe(true);
    expect(isTreatmentInstruction("फवारणी करा")).toBe(true);
    expect(isTreatmentInstruction("Inspect leaves for lesions and record pest counts")).toBe(false);
  });
  const harvestTask = {
    task_type:"harvest", days_from_sowing:119, stage_uuid:"grain",
    source_refs:[{table:"crop_stage_master",row_id:"grain"}],
    instructions:["Harvest"],task_description:"Harvest"
  };
  const stages = [
    {id:"grain",growth_stage:"grain_filling",das_min:122},
    {id:"harvest",growth_stage:"harvest",das_min:152},
  ];
  it("rejects harvest before grain-filling and harvest biology is even reached", () => {
    expect(validateScientificTasks([harvestTask],stages)).toContain("HARVEST_STAGE_MISMATCH:harvest@DAS119");
  });
  it("allows a stage-anchored provisional harvest inspection, not a fabricated maturity dose", () => {
    const task={...harvestTask,stage_uuid:"harvest",days_from_sowing:152};
    expect(validateScientificTasks([task],stages)).toEqual([]);
  });
  it("does not accept a harvest task earlier than its declared stage start", () => {
    const task={...harvestTask,stage_uuid:"harvest",days_from_sowing:119};
    expect(validateScientificTasks([task],stages)).toContain("HARVEST_BEFORE_STAGE:harvest@DAS119");
  });
  it("rejects drug instructions embedded in a monitoring card", () => {
    const task={...harvestTask,task_type:"monitoring",stage_uuid:"grain",instructions:["Apply 2 g/acre spray"]};
    expect(validateScientificTasks([task],stages)).toContain("MONITORING_CONTAINS_TREATMENT:monitoring@DAS119");
  });
});

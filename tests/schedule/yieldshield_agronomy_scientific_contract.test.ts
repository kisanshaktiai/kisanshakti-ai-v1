import { describe, expect, it } from "vitest";
import {
  agronomyActivationBlockers, agronomyProvisionalReasons, isBiologicalHarvestStage,
  isDeficiencyDependentAction,
  isUnverifiedTier, resolvedMaturityDas,
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
  it("requires evidence for nutrient deficiency remediation", () => {
    expect(isDeficiencyDependentAction("RICE_NUTR_MN_DEFICIT_TNAU_DRAFT_002","spray")).toBe(true);
    expect(isDeficiencyDependentAction("N_TOP","regular nitrogen management")).toBe(false);
  });
  it("missing establishment-material evidence makes the schedule provisional, never a deadlock and never an assumed seed rate", () => {
    const shared = {cropCycle:"plant",documentedMaterialRate:false,maturityDas:300,hasHarvestStage:true,hasHarvestTask:true,multiHarvestStage:false};
    expect(agronomyProvisionalReasons({...shared,propagationMaterial:"seed"})).toEqual(["SEED_RATE_DOCUMENTED_EVIDENCE_MISSING"]);
    expect(agronomyProvisionalReasons({...shared,propagationMaterial:"sett"})).toEqual(["PLANTING_MATERIAL_RATE_SOURCE_MISSING"]);
    expect(agronomyProvisionalReasons({...shared,propagationMaterial:null})).toEqual(["PROPAGATION_MATERIAL_UNRESOLVED"]);
    expect(agronomyActivationBlockers({...shared,propagationMaterial:"seed"})).toEqual([]);
    expect(agronomyProvisionalReasons({...shared,propagationMaterial:"seed",maturityDas:null})).toContain("VARIETY_MATURITY_CLOCK_NOT_VERIFIED");
  });
  it("still blocks a crop cycle with no biological harvest programme", () => {
    const shared = {propagationMaterial:"seed",cropCycle:"plant",documentedMaterialRate:true,maturityDas:120,multiHarvestStage:false};
    expect(agronomyActivationBlockers({...shared,hasHarvestStage:false,hasHarvestTask:false})).toEqual(["BIOLOGICAL_HARVEST_PROGRAMME_INCOMPLETE"]);
    expect(agronomyActivationBlockers({...shared,hasHarvestStage:true,hasHarvestTask:false})).toEqual(["BIOLOGICAL_HARVEST_PROGRAMME_INCOMPLETE"]);
  });
  it("does not expect new seed purchase for ratoon establishment", () => {
    expect(agronomyProvisionalReasons({propagationMaterial:"ratoon_stubble",cropCycle:"ratoon",documentedMaterialRate:false,maturityDas:300,hasHarvestStage:true,hasHarvestTask:true,multiHarvestStage:false})).toEqual([]);
  });
  it("recognizes biological picking/harvest but rejects pre- and post-harvest", () => {
    expect(isBiologicalHarvestStage("harvest")).toBe(true);
    expect(isBiologicalHarvestStage("maturation_harvest")).toBe(true);
    expect(isBiologicalHarvestStage("first_picking")).toBe(true);
    expect(isBiologicalHarvestStage("pre_harvest")).toBe(false);
    expect(isBiologicalHarvestStage("post_harvest")).toBe(false);
  });
  it("a multi-picking crop is provisional (picking interval unverified), not blocked", () => {
    const input={propagationMaterial:"seed",cropCycle:null,documentedMaterialRate:true,maturityDas:100,hasHarvestStage:true,hasHarvestTask:true,multiHarvestStage:true};
    expect(agronomyActivationBlockers(input)).toEqual([]);
    expect(agronomyProvisionalReasons(input)).toEqual(["REPEATED_PICKING_INTERVAL_NOT_VERIFIED"]);
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
  it("rejects a prescription on a monitoring card by structure, in any language", () => {
    const base={...harvestTask,task_type:"monitoring",stage_uuid:"grain"};
    expect(validateScientificTasks([{...base,quantity:{value:2,unit:"g"}}],stages)).toContain("MONITORING_CARRIES_QUANTITY:monitoring@DAS119");
    expect(validateScientificTasks([{...base,resources:{watch_list:[{treatment_authorized:false,if_seen:"x"}]}}],stages)).toContain("MONITORING_UNAUTHORIZED_TREATMENT:monitoring@DAS119");
    expect(validateScientificTasks([{...base,instructions:["फवारणी करा"],resources:{watch_list:[{treatment_authorized:true,if_seen:"x"}]}}],stages)).toEqual([]);
  });
});

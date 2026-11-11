import { describe, expect, it } from "vitest";
import {
  canonicalStageGraph, cropReleaseBlockers, selectedGraphBlockers, stageGraphSha256,
  type ReleaseStage, type ReleaseScope, type CropReleaseApproval,
} from "../../supabase/functions/ai-smart-schedule/generator/scientific-release-gate";

const scope: ReleaseScope = {
  cropCode:"rice", cultivationMethod:"transplanted", stageClockMethod:"transplanted",
  cropCycle:"universal", regionCode:"IN-MH", varietyId:"00000000-0000-4000-8000-000000000001",
};
const stage = (changes: Partial<ReleaseStage>={}): ReleaseStage => ({
  id:"stage-one", crop_code:"rice", growth_stage:"establishment", stage_code:"rice_establish",
  das_min:0, das_max:20, das_reference:"sowing", clock_reference:"sowing",
  gdd_min:null, gdd_max:null, base_temperature_c:null,
  cultivation_method:"transplanted", crop_cycle:"universal", is_moisture_critical:false,
  kc_coefficient:null, boundary_grace_days:0, ...changes,
});
const graph = [
  stage(), stage({id:"stage-harvest",stage_code:"rice_harvest",growth_stage:"harvest",das_min:110,das_max:130})
];
const approval = (hash:string, changes: Partial<CropReleaseApproval>={}):CropReleaseApproval=>({
  id:"approved-row",crop_code:"rice",cultivation_method:"transplanted",
  crop_cycle:"universal",region_code:"IN-MH",variety_id:scope.varietyId,
  status:"approved",stage_graph_sha256:hash,evidence_bundle_sha256:"b".repeat(64),
  reviewed_by:"independent-agronomist",reviewed_at:"2026-10-20T00:00:00Z",
  expires_at:"2027-11-01T00:00:00Z",...changes,
});
const now = new Date("2026-11-12T00:00:00Z");

describe("YieldShield crop-scoped scientific release gate (default deny)",()=>{
  it("rejects an unsupported crop with no stage graph",()=>{
    expect(selectedGraphBlockers([],{...scope,cropCode:"unknown"})).toContain("CROP_STAGE_GRAPH_MISSING");
  });
  it("rejects incomplete sugarcane ratoon graph before release",()=>{
    expect(selectedGraphBlockers([stage({crop_code:"sugarcane",cultivation_method:"sett_planted",crop_cycle:"ratoon"})],
      {...scope,cropCode:"sugarcane",cultivationMethod:"sett_planted",stageClockMethod:"sett_planted",cropCycle:"ratoon"}))
      .toContain("BIOLOGICAL_HARVEST_STAGE_MISSING");
  });
  it("rejects missing location, crop, method, cycle and invalid stage windows",()=>{
    const problems=selectedGraphBlockers([stage({crop_code:"maize",cultivation_method:"direct_seeded",crop_cycle:"ratoon",das_max:-1}),graph[1]],{...scope,regionCode:null});
    expect(problems).toEqual(expect.arrayContaining(["REGION_NOT_VERIFIED","STAGE_CROP_MISMATCH","STAGE_METHOD_MISMATCH","STAGE_CYCLE_MISMATCH","STAGE_WINDOW_NOT_VERIFIED"]));
  });
  it("rejects duplicate stage identities and a missing biological milestone",()=>{
    expect(selectedGraphBlockers([stage(),stage()],scope)).toEqual(expect.arrayContaining(["STAGE_GRAPH_IDENTITY_CONFLICT","BIOLOGICAL_HARVEST_STAGE_MISSING"]));
  });
  it("allows structurally coherent stages but does not equate structure with scientific signoff",()=>{
    expect(selectedGraphBlockers(graph,scope)).toEqual([]);
    expect(cropReleaseBlockers(null,scope,"a".repeat(64),now)).toEqual(["CROP_RELEASE_NOT_APPROVED"]);
  });
  it("hash is stable across row order and changes on agronomic stage edits",async()=>{
    const hash=await stageGraphSha256(graph);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalStageGraph(graph)).toBe(canonicalStageGraph([...graph].reverse()));
    expect(await stageGraphSha256([...graph].reverse())).toBe(hash);
    expect(await stageGraphSha256([graph[0],{...graph[1],das_min:111}])).not.toBe(hash);
  });
  it("accepts only a current, exact-match, independently reviewed record",async()=>{
    const hash=await stageGraphSha256(graph);
    expect(cropReleaseBlockers(approval(hash),scope,hash,now)).toEqual([]);
  });
  it("never substitutes another variety, cultivation method, cycle, crop or region",async()=>{
    const hash=await stageGraphSha256(graph);
    for(const other of [{variety_id:null},{cultivation_method:"direct_seeded"},{crop_cycle:"ratoon"},{crop_code:"wheat"},{region_code:"IN-KA"}]){
      expect(cropReleaseBlockers(approval(hash,other),scope,hash,now)).toContain("CROP_RELEASE_SCOPE_MISMATCH");
    }
  });
  it("fails closed on revoked, unreviewed, expired or stale approvals",async()=>{
    const hash=await stageGraphSha256(graph);
    expect(cropReleaseBlockers(approval(hash,{status:"revoked"}),scope,hash,now)).toContain("CROP_RELEASE_NOT_APPROVED");
    expect(cropReleaseBlockers(approval(hash,{reviewed_by:""}),scope,hash,now)).toContain("CROP_RELEASE_EVIDENCE_UNVERIFIED");
    expect(cropReleaseBlockers(approval(hash,{evidence_bundle_sha256:"not-a-hash"}),scope,hash,now)).toContain("CROP_RELEASE_EVIDENCE_UNVERIFIED");
    expect(cropReleaseBlockers(approval(hash,{expires_at:"2026-11-01T00:00:00Z"}),scope,hash,now)).toContain("CROP_RELEASE_APPROVAL_EXPIRED");
    expect(cropReleaseBlockers(approval("c".repeat(64)),scope,hash,now)).toContain("CROP_RELEASE_STAGE_GRAPH_STALE");
  });
  it("never allows a missing region even when a record is otherwise approved",async()=>{
    const hash=await stageGraphSha256(graph);
    expect(cropReleaseBlockers(approval(hash),{...scope,regionCode:null},hash,now)).toEqual(["REGION_NOT_VERIFIED"]);
  });
});

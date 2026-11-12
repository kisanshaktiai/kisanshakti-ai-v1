import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDraftPayload } from "../../supabase/functions/ai-smart-schedule/review-drafts";

const read = (path: string) => readFileSync(path, "utf8");
const edge = read("supabase/functions/ai-smart-schedule/index.ts");
const page = read("src/pages/Schedule.tsx");
const editor = read("src/components/schedule/CropDateInput.tsx");
const permission = read("supabase/migrations/20261112141000_yieldshield_rpc_privilege_closure.sql");

describe("YieldShield + Lovable review and activation integrated contract", () => {
  it("never starts baseline creation for a missing or stale scientific approval", () => {
    const save = edge.indexOf("const saveScientificReview");
    const graph = edge.indexOf("selectedGraphBlockers(selectedGraph, scope)");
    const approval = edge.indexOf("cropReleaseBlockers(");
    const baseline = edge.indexOf("const baseline = await generateBaseline");
    const atomic = edge.indexOf('supabase.rpc("persist_ai_crop_schedule_atomic"');
    expect(save).toBeGreaterThan(0);
    expect(graph).toBeGreaterThan(save);
    expect(approval).toBeGreaterThan(graph);
    expect(baseline).toBeGreaterThan(approval);
    expect(atomic).toBeGreaterThan(baseline);
    expect(edge).toContain("if (graphErrors.length) return await saveScientificReview(graphErrors)");
    expect(edge).toContain("if (releaseBlockers.length) return await saveScientificReview(releaseBlockers)");
    expect(edge).toContain("saveScientificReview(scientificBlockers, baseline.provenance, baseline.coverage)");
  });

  it("recheck updates only the same farmer and land draft, never inserts a new review for known ids", () => {
    expect(edge).toContain('.eq("id", requestedDraftId).eq("tenant_id", tenantId!)');
    expect(edge).toContain('.eq("farmer_id", farmerId!).eq("land_id", landId!)');
    expect(edge).toContain('return json({\n          success: false, code: "REVIEW_DRAFT_SAVE_FAILED"');
    expect(page).toContain("method, null, draft.id");
  });

  it("does not auto-retry scientific review, invent a policy, or lose edit input", () => {
    expect(page).toContain("if (data?.code === 'AGRONOMY_REVIEW_REQUIRED')");
    expect(page).toContain("setReviewDrafts(previous => [data.draft");
    expect(page).toContain("initialDraft={editingReviewDraft}");
    expect(page).toContain("!policy || !method");
    expect(page).toContain("setEditingReviewDraft(draft); setFlowStep('crop-input')");
    expect(editor).toContain("initialDraft?.crop_inputs.cropCycle");
    expect(editor).toContain("setSowingDate(sow)");
    expect(editor).toContain("setSelectedCultivationMethod");
  });

  it("forbids browser callers from SECURITY DEFINER schedule writes", () => {
    expect(permission).toMatch(/REVOKE ALL ON FUNCTION public\.persist_ai_crop_schedule_atomic\(jsonb,jsonb,jsonb\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(permission).toContain("TO service_role");
    expect(edge).toContain("resolveVerifiedCaller(req)");
  });

  it("never stores user-supplied treatment instructions or doses in review payload", () => {
    const selections = {
      cropName: "Rice", sowingDate: "2026-11-11",
      localizedCropName: "तांदूळ", farmingType: "organic_only",
      intercrops: [{cropName:"Cowpea",localizedCropName:"",cropVariety:"",areaPercent:20,quantity:9999,chemical:"do_not_save"}],
      tasks:[{task_name:"spray",dose_value:99999}],
      dose_value: 2500, status:"active", is_active:true,
    };
    const result = reviewDraftPayload({tenantId:"tenant",farmerId:"farmer",landId:"land",cropName:"Rice",language:"mr",
      selections, blockers:["CROP_RELEASE_NOT_APPROVED"], sourceRefs:[], coverage:{}});
    expect(result.crop_inputs.intercrops).toEqual([{cropName:"Cowpea",localizedCropName:"",cropVariety:"",areaPercent:20}]);
    expect(result.crop_inputs).not.toHaveProperty("tasks");
    expect(result.crop_inputs).not.toHaveProperty("dose_value");
    expect(result.crop_inputs).not.toHaveProperty("is_active");
  });

  it("never silently accepts missing security registry or activation results", () => {
    expect(edge).toContain("CROP_RELEASE_REGISTRY_UNAVAILABLE");
    expect(page).toContain("'CROP_RELEASE_REGISTRY_UNAVAILABLE'");
    expect(page).toContain("'REVIEW_DRAFT_SAVE_FAILED'");
  });
});

// Behavioural tests for the 2026-11-13 variety / crop-stage context fix. Every test runs the real
// production module on real-shaped inputs and asserts on its output.
import { describe, expect, it } from "vitest";
import { assembleCompactPlan, runPlanner } from "../../supabase/functions/ai-smart-schedule/harness/plan-assembly";
import { validatePlanIntent } from "../../supabase/functions/ai-smart-schedule/harness/validator";
import type { CandidateNode, ScheduleCandidateGraph } from "../../supabase/functions/ai-smart-schedule/harness/types";
import { buildVarietyProfile, composerVarietyView, plannerVarietyView, varietyContextBlock, type VarietyProfileInput } from "../../supabase/functions/ai-smart-schedule/db/variety-profile";
import { foldWatchBriefs, MAX_VISIBLE_WATCH_LINES, rankWatchBriefs, resistanceBindings } from "../../supabase/functions/ai-smart-schedule/generator/watch-relevance";
import type { BaselineTask } from "../../supabase/functions/ai-smart-schedule/generator/baseline-generator";

// ── Planner validation on a REAL-SHAPED graph ───────────────────────────────────────────────
// buildAgronomicEvidencePack marks every CONDITIONAL (observation) candidate materializable=false
// because it is folded into the stage scouting card, never a field task. The earlier synthetic
// graph left materializable=true on its conditional node, which hid the defect: on production
// graphs an unchanged plan failed `non_materializable_conditional` on every attempt, so the LLM
// planner never ran and the trace always showed the deterministic fallback.
const n = (id: string, o: Partial<CandidateNode> = {}): CandidateNode => ({
  id, task_index: 0, task_type: "monitoring", domain: "MONITORING", days_from_sowing: 0, stage_uuid: null, stage_key: null, stage_order: 0,
  priority: "medium", weather_dependent: false, rule_ids: [], source_count: 1, depends_on: [], required: true, default_status: "SCHEDULED",
  trigger_class: null, condition_code: null, materializable: true, ...o,
});
const realGraph: ScheduleCandidateGraph = {
  schema_version: "schedule_candidate_graph_v2",
  nodes: [
    n("task_0001", { days_from_sowing: 0, task_type: "land_preparation" }),
    n("task_0002", { days_from_sowing: 30, task_type: "nutrition" }),
    n("rule_blast", { required: false, default_status: "CONDITIONAL", trigger_class: "OBSERVATION", materializable: false, days_from_sowing: 45 }),
    n("rule_stemborer", { required: false, default_status: "CONDITIONAL", trigger_class: "OBSERVATION", materializable: false, days_from_sowing: 40 }),
    n("rule_watch_only", { required: false, default_status: "MONITOR", trigger_class: "OBSERVATION", materializable: false, days_from_sowing: 35 }),
    n("rule_weed", { required: false, default_status: "SCHEDULED", trigger_class: "CONTEXT_SCHEDULE", materializable: true, days_from_sowing: 20, task_type: "weed_management" }),
  ],
  edges: [],
};
const compact = (decisions: Array<{ candidate_id: string; status?: string; reason?: string }> = []) =>
  assembleCompactPlan(realGraph, { schema_version: "schedule_plan_intent_v3", status: "READY", decisions });

describe("planner validation on production-shaped graphs", () => {
  it("accepts an unchanged plan: a non-materializable CONDITIONAL watch candidate may keep its evidence default", () => {
    expect(validatePlanIntent(compact(), realGraph)).toEqual([]);
  });
  it("runPlanner succeeds on the first attempt instead of falling back", async () => {
    const out = await runPlanner(realGraph, async () => ({ plan: compact(), provider: "p", model: "m" }), validatePlanIntent, { maxAttempts: 2, minAttemptMs: 8_000, remainingMs: () => 60_000 });
    expect(out).toMatchObject({ ok: true, attempts: 1 });
  });
  it("still rejects PROMOTING a monitor-only candidate to CONDITIONAL", () => {
    expect(validatePlanIntent(compact([{ candidate_id: "rule_watch_only", status: "CONDITIONAL" }]), realGraph)).toContain("non_materializable_conditional:rule_watch_only");
  });
  it("still rejects scheduling an observation rule or demoting a required baseline task", () => {
    expect(validatePlanIntent(compact([{ candidate_id: "rule_blast", status: "SCHEDULED" }]), realGraph)).toContain("observation_candidate_promoted_to_scheduled:rule_blast");
    expect(validatePlanIntent(compact([{ candidate_id: "task_0001", status: "MONITOR" }]), realGraph)).toContain("required_baseline_not_scheduled:task_0001");
  });
});

// ── Variety profile: built from the SHAPE of the live Indrayani rows (rice, transplanted) ──────
const indrayani = (over: Partial<VarietyProfileInput> = {}): VarietyProfileInput => ({
  crop: { code: "rice", label: "Rice", labelLocal: null },
  variety: { id: "v1", name: "Rice Indrayani", nameLocal: null },
  method: { cultivation: "transplanted", stageClock: "transplanted", cropCycle: "universal" },
  catalogue: { variety_id: "v1", name: "Rice Indrayani", variety_code: "Indrayani", season: "kharif", maturity_days_min: 135, maturity_days_max: 140, released_by: "MPKV Rice Research Centre" },
  agronomy: [
    { cultivation_method: "direct_seeded", is_suitable: false, suitability_grade: "not_recommended", suitability_note: null, duration_days_min: 135, duration_days_max: 140, duration_reference: "sowing", evidence_tier: "C_documented_source", seedling_age_days_min: null, seedling_age_days_max: null, source: "s" },
    { cultivation_method: "transplanted", is_suitable: true, suitability_grade: null, suitability_note: null, duration_days_min: 110, duration_days_max: 119, duration_reference: "transplanting", evidence_tier: "D_unverified", seedling_age_days_min: 21, seedling_age_days_max: 25, source: "s" },
  ],
  resistance: [
    { threat_type: "disease", threat_name: "Blast", observation_code: "RC_BL", resistance_level: "R", hypothesis_id: "HYP_LEAF_BLAST", score_modifier: 0.4, source: "release notes" },
    { threat_type: "disease", threat_name: "Bacterial Leaf Blight", observation_code: "RC_BLB", resistance_level: "MS", hypothesis_id: "HYP_BLB", score_modifier: 1, source: "characterization" },
    { threat_type: "disease", threat_name: "Leaf scald", observation_code: "RC_LS", resistance_level: "MS", hypothesis_id: null, score_modifier: 1, source: "characterization" },
  ],
  hypothesisRules: [{ hypothesis_id: "HYP_LEAF_BLAST", rule_id: "RULE_BLAST_A" }, { hypothesis_id: "HYP_LEAF_BLAST", rule_id: "RULE_BLAST_B" }, { hypothesis_id: "HYP_BLB", rule_id: "RULE_BLB" }],
  stages: [
    { order: 1, stage_key: "NURSERY", stage_name: "Nursery", das_from: 0, das_to: 24 },
    { order: 2, stage_key: "TILLERING", stage_name: "Tillering", das_from: 34, das_to: 72 },
  ],
  scheduleDurationDays: null,
  ...over,
});

describe("variety profile", () => {
  it("carries the selected crop, variety, method, resistance and stage timeline from database rows", () => {
    const p = buildVarietyProfile(indrayani());
    expect(p.crop.label).toBe("Rice");
    expect(p.variety).toMatchObject({ name: "Rice Indrayani", code: "Indrayani", season: "kharif" });
    expect(p.method).toEqual({ cultivation: "transplanted", stage_clock: "transplanted", crop_cycle: "universal" });
    expect(p.stages.map((x) => x.stage_name)).toEqual(["Nursery", "Tillering"]);
    expect(p.resistance.find((r) => r.threat === "Blast")).toMatchObject({ level: "R", rule_ids: ["RULE_BLAST_A", "RULE_BLAST_B"] });
  });
  it("maturity: the selected method's row is used, its tier is carried, and an unverified window is flagged, never upgraded", () => {
    const m = buildVarietyProfile(indrayani()).maturity;
    expect(m).toMatchObject({ days_min: 110, days_max: 119, clock: "transplanting", evidence_tier: "D_unverified", verified: false, source: "variety_cultivation_agronomy" });
    expect(m.total_from_sowing).toEqual({ min: 131, max: 144, derived: true });
    expect(m.catalogue_total_days).toEqual({ min: 135, max: 140 });
    expect(buildVarietyProfile(indrayani()).data_limits).toContain("maturity_evidence_unverified:d_unverified");
  });
  it("a documented sowing-clock window is verified and copied, not derived; an unsuitable method is reported", () => {
    const p = buildVarietyProfile(indrayani({ method: { cultivation: "direct_seeded", stageClock: "direct_seeded", cropCycle: "universal" } }));
    expect(p.maturity).toMatchObject({ days_min: 135, days_max: 140, clock: "sowing", verified: true });
    expect(p.maturity.total_from_sowing).toEqual({ min: 135, max: 140, derived: false });
    expect(p.data_limits).toContain("selected_method_marked_unsuitable_for_variety");
  });
  it("falls back to the declared stage-clock method's row when the selected method has none", () => {
    const p = buildVarietyProfile(indrayani({ method: { cultivation: "transplanted_machine", stageClock: "transplanted", cropCycle: "universal" } }));
    expect(p.maturity.days_max).toBe(119);
  });
  it("names evidence gaps instead of filling them: unlinked resistance, no variety, no record for the method", () => {
    expect(buildVarietyProfile(indrayani()).data_limits).toContain("resistance_not_linked_to_rules:RC_LS");
    const none = buildVarietyProfile(indrayani({ variety: null, catalogue: null, agronomy: [], resistance: [], hypothesisRules: [] }));
    expect(none.variety).toBeNull();
    expect(none.data_limits).toContain("variety_not_resolved");
    const noRow = buildVarietyProfile(indrayani({ agronomy: [] }));
    expect(noRow.data_limits).toContain("variety_method_record_missing");
    expect(noRow.maturity.verified).toBe(false);
  });
  it("planner view carries maturity with its evidence flag; composer view carries names and levels but NO maturity number", () => {
    const p = buildVarietyProfile(indrayani());
    expect(JSON.stringify(plannerVarietyView(p))).toContain('"verified":false');
    expect(plannerVarietyView(p).stage_timeline).toEqual([{ stage: "Nursery", das_from: 0, das_to: 24 }, { stage: "Tillering", das_from: 34, das_to: 72 }]);
    const c = JSON.stringify(composerVarietyView(p));
    expect(c).toContain("Rice Indrayani");
    expect(c).toContain("Tillering");
    expect(c).toContain('"level":"R"');
    for (const n of ["110", "119", "131", "144", "135", "140"]) expect(c).not.toContain(n);
  });
  it("the prompt context block is empty without a profile and names the variety with one", () => {
    expect(varietyContextBlock(null)).toBe("");
    const block = varietyContextBlock(composerVarietyView(buildVarietyProfile(indrayani())));
    expect(block).toContain("Rice Indrayani");
    expect(block).toContain("never copy a number");
  });
});

// ── Scouting card: ordered by the variety's own resistance, capped, never emptied ───────────────
const brief = (rule: string, watch: string) => ({ rule_id: rule, category: "disease", watch_for: watch, if_seen: null, treatment_authorized: false, carries_input: false, withheld_reason: "no_authority", treatment: null });
const candidate = (rule: string, watch: string) => ({ default_status: "CONDITIONAL", task: { stage_key: "TILLERING", resources: { watch_brief: brief(rule, watch) } } });
const scoutingTask = () => ({ task_type: "monitoring", stage_key: "TILLERING", instructions: [] as string[], resources: {} as Record<string, unknown> }) as unknown as BaselineTask;

describe("variety-aware scouting list", () => {
  const profile = buildVarietyProfile(indrayani());
  const evidence = { candidates: [
    candidate("RULE_BLAST_A", "leaf blast spots"), candidate("RULE_BLAST_B", "neck blast"),
    candidate("RULE_BLB", "bacterial leaf blight"),
    candidate("RULE_X1", "stem borer deadhearts"), candidate("RULE_X2", "leaf folder"), candidate("RULE_X3", "brown planthopper"),
    candidate("RULE_X4", "sheath blight"), candidate("RULE_X5", "case worm"),
  ] };
  it("a threat the variety is documented to resist drops below the threats it is susceptible to or has no record for", () => {
    const t = scoutingTask(); foldWatchBriefs([t], evidence, profile);
    const list = (t.resources as { watch_list: Array<{ rule_id: string; visible: boolean }> }).watch_list;
    const pos = (id: string) => list.findIndex((b) => b.rule_id === id);
    expect(pos("RULE_BLB")).toBeLessThan(pos("RULE_BLAST_A"));
    expect(pos("RULE_X1")).toBeLessThan(pos("RULE_BLAST_A"));
    expect(pos("RULE_BLAST_A")).toBeGreaterThan(MAX_VISIBLE_WATCH_LINES - 1);
  });
  it("prints at most the visible limit but keeps every brief in the structured list, resistance never removes a check", () => {
    const t = scoutingTask(); foldWatchBriefs([t], evidence, profile);
    const res = t.resources as { watch_list: Array<{ rule_id: string; visible: boolean; variety_resistance?: { level: string } }>; watch_count: number };
    expect(res.watch_count).toBe(8);
    expect(res.watch_list).toHaveLength(8);
    expect(res.watch_list.filter((b) => b.visible)).toHaveLength(MAX_VISIBLE_WATCH_LINES);
    expect(t.instructions).toHaveLength(MAX_VISIBLE_WATCH_LINES + 1); // + the one closing action line
    expect(res.watch_list.find((b) => b.rule_id === "RULE_BLAST_A")?.variety_resistance?.level).toBe("R");
    expect(res.watch_list.map((b) => b.rule_id).sort()).toEqual(evidence.candidates.map((c) => c.task.resources.watch_brief.rule_id).sort());
  });
  it("without a variety profile the order is the database order and the cap still applies", () => {
    const t = scoutingTask(); foldWatchBriefs([t], evidence, null);
    const list = (t.resources as { watch_list: Array<{ rule_id: string }> }).watch_list;
    expect(list.map((b) => b.rule_id)).toEqual(evidence.candidates.map((c) => c.task.resources.watch_brief.rule_id));
  });
  it("when two records link one rule, the more susceptible record decides", () => {
    const b = resistanceBindings([
      { threat: "A", kind: "disease", level: "R", observation_code: null, hypothesis_id: "h1", score_modifier: 0.4, source: null, rule_ids: ["R1"] },
      { threat: "B", kind: "disease", level: "MS", observation_code: null, hypothesis_id: "h2", score_modifier: 1, source: null, rule_ids: ["R1"] },
    ]);
    expect(b.get("R1")).toMatchObject({ level: "MS", weight: 1 });
    expect(rankWatchBriefs([{ rule_id: "R1" }, { rule_id: "R2" }], b, 5).every((x) => x.visible)).toBe(true);
  });
});

// ── 2026-11-13: a scouting card lists symptoms, never a prescription ────────────────────────────
import { SCOUTING_ACTION_LINE } from "../../supabase/functions/ai-smart-schedule/generator/watch-relevance";
describe("scouting card content", () => {
  const b = (rule: string, code: string, o: Record<string, unknown> = {}) => ({ default_status: "CONDITIONAL", task: { stage_key: "TILLERING", resources: { watch_brief: { rule_id: rule, category: "disease", condition_code: code, watch_for: code, if_seen: "Apply Fungicide X, 600 g per acre.", treatment_authorized: true, carries_input: true, withheld_reason: null, treatment: { active_ingredient: "Fungicide X", dosage_per_acre: "600 g", application_method: null, phi_days: 20 }, ...o } } } });
  const catalog = new Map([["leaf_spots", { label: "grey diamond spots on leaves", diagnostic: true }], ["hopper_burn", { label: "plants drying in round patches", diagnostic: true }], ["stage_general", { label: "general stage", diagnostic: false }]]);
  const evidence = { candidates: [b("STORM_RECOVERY", "stage_general"), b("BLAST_A", "leaf_spots"), b("BLAST_B", "leaf_spots"), b("HOPPER", "hopper_burn")] };
  const run = (symptoms: typeof catalog | null) => { const t = scoutingTask(); foldWatchBriefs([t], evidence, null, symptoms); return t; };
  it("prints each real symptom once by its farmer label and never a product, a dose or a code", () => {
    const t = run(catalog);
    expect(t.instructions).toEqual(["Look for: grey diamond spots on leaves", "Look for: plants drying in round patches", SCOUTING_ACTION_LINE]);
    const all = JSON.stringify(t.instructions);
    for (const banned of ["Fungicide", "600", "stage_general", "if seen", "Apply"]) expect(all).not.toContain(banned);
  });
  it("a generic bucket that is not a visible symptom is not a scouting item, so it can never carry an unconditional spray", () => {
    const res = run(catalog).resources as { watch_list: Array<{ rule_id: string }>; watch_dropped_not_observable: number };
    expect(res.watch_list.map((x) => x.rule_id)).toEqual(["BLAST_A", "HOPPER"]);
    expect(res.watch_dropped_not_observable).toBe(1);
  });
  it("no treatment is left on the structured list either; only a flag that one exists after diagnosis", () => {
    const list = (run(catalog).resources as { watch_list: Array<Record<string, unknown>> }).watch_list;
    for (const x of list) { expect(x.if_seen).toBeNull(); expect(x.treatment).toBeNull(); expect(x.treatment_authorized).toBe(false); expect(x.treatment_on_diagnosis).toBe(true); }
  });
  it("without the catalog the card still prints observations only", () => {
    const all = JSON.stringify(run(null).instructions);
    expect(all).not.toContain("Fungicide");
    expect(all).toContain("report it before treating");
  });
});

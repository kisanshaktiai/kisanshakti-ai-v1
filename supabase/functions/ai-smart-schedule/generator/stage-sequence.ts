// 2026-11-13 — TASK SEQUENCE — pure, crop- and language-agnostic.
//
// The order of work is agronomy: basal fertilizer goes down before the seedlings are planted,
// seedlings are planted before the field is watered for establishment, the crop is checked for
// maturity before it is cut. The saved order was (day, stage_order, task_type alphabetical), and
// stage_order itself was wrong in two different ways: the generator used the stage's index in a
// list sorted by RAW day numbers (which mixes the nursery clock with the transplanting clock, so
// "transplant establishment, day 0 after transplanting" ranked before "land preparation, day 15
// after sowing"), and rule cards used the raw day number itself. On the transplanting day a farmer
// therefore read: water the transplanted crop, weed, plant the seedlings, apply basal fertilizer.
//
// This module is the ONE place that orders a schedule:
//   1. stage rank    — the crop's biological sequence, from crop_stage_master.phenology_index
//                      (a database value); a stage without an index is placed by its start day
//                      on the sowing axis;
//   2. rule timing   — a rule that states its own timing inside the stage
//                      (decision_rules.stage_offset_days_min/max) is dated from it;
//   3. work order    — on the same day and stage: what goes into the soil or onto the seed,
//                      then the field operation, then water, then the crop check.
// No crop name, stage name or day number is typed here.
import type { RuleStageOffset, StageRow } from "../db/agronomy-repo.ts";
import { toDas, type BaselineTask } from "./baseline-generator.ts";
import { workGroupOf, type WorkGroup } from "./stage-work-plan.ts";

/** Same day, same stage: inputs are placed before the operation they belong to; water follows the operation; the check comes last. */
const WORK_ORDER: Record<WorkGroup, number> = { nutrition: 1, field_work: 2, water: 3, crop_check: 4 };

export interface StagePosition { rank: number; from: number | null; to: number | null; stage: StageRow }

/** The crop's stages in biological order, each with its window on the sowing axis. */
export function biologicalStageOrder(stages: StageRow[], transplantOffset: number | null): StagePosition[] {
  const placed = stages.map((stage) => ({ stage, from: toDas(stage, stage.das_min, transplantOffset), to: toDas(stage, stage.das_max, transplantOffset) }));
  const byAxis = (a: typeof placed[number], b: typeof placed[number]) =>
    (a.from ?? Number.MAX_SAFE_INTEGER) - (b.from ?? Number.MAX_SAFE_INTEGER) || (a.to ?? Number.MAX_SAFE_INTEGER) - (b.to ?? Number.MAX_SAFE_INTEGER) ||
    String(a.stage.stage_code ?? a.stage.growth_stage ?? "").localeCompare(String(b.stage.stage_code ?? b.stage.growth_stage ?? ""));
  const indexed = placed.filter((p) => p.stage.phenology_index != null && Number.isFinite(Number(p.stage.phenology_index)))
    .sort((a, b) => Number(a.stage.phenology_index) - Number(b.stage.phenology_index) || byAxis(a, b));
  const ordered = [...indexed];
  // A stage with no biological index (some operational stages) goes immediately before the first
  // indexed stage that starts after it on the sowing axis; with no such stage it goes last.
  for (const p of placed.filter((x) => !indexed.includes(x)).sort(byAxis)) {
    const at = ordered.findIndex((o) => indexed.includes(o) && o.from != null && p.from != null && o.from > p.from);
    if (at < 0) ordered.push(p); else ordered.splice(at, 0, p);
  }
  return ordered.map((p, i) => ({ rank: i + 1, from: p.from, to: p.to, stage: p.stage }));
}

const stageKeyOf = (s: StageRow) => String(s.stage_code || s.growth_stage || "").toLowerCase();
function positionOf(t: BaselineTask, order: StagePosition[]): StagePosition | null {
  if (t.stage_uuid) { const hit = order.find((p) => p.stage.id === t.stage_uuid); if (hit) return hit; }
  const key = String(t.stage_key ?? t.anchor_stage ?? "").toLowerCase();
  return key ? order.find((p) => stageKeyOf(p.stage) === key) ?? null : null;
}

/**
 * Date a rule card from the rule's own timing inside its stage. When that day falls inside a later
 * stage the rule also applies to, the card moves to that stage (it is that stage's work). Scouting
 * cards are never moved: they cover the whole stage. Returns how many cards were re-dated.
 */
export function applyRuleStageOffsets(tasks: BaselineTask[], offsets: ReadonlyMap<string, RuleStageOffset>, order: StagePosition[]): number {
  if (!offsets.size) return 0;
  let moved = 0;
  for (const t of tasks) {
    if (t.task_type === "monitoring" || t.quantity) continue;
    const rule = (t.rule_ids ?? []).map((id) => offsets.get(id)).find(Boolean);
    const home = positionOf(t, order);
    if (!rule || !home || home.from == null) continue;
    const from = home.from + rule.offset_min;
    const to = home.from + (rule.offset_max ?? rule.offset_min);
    const target = order.find((p) => p.from != null && p.to != null && from >= p.from && from <= p.to && rule.stages.includes(String(p.stage.growth_stage ?? "").toLowerCase())) ?? home;
    t.days_from_sowing = from;
    if (target !== home) {
      const label = (st: StageRow) => String(st.growth_stage || st.stage_code || "").replace(/_/g, " ");
      if (label(home.stage) && t.task_name.includes(label(home.stage))) t.task_name = t.task_name.replace(label(home.stage), label(target.stage));
      t.stage_uuid = target.stage.id; t.stage_key = target.stage.stage_code; t.stage_name = target.stage.growth_stage;
      t.anchor_stage = target.stage.stage_code || target.stage.growth_stage; t.gdd_target = target.stage.gdd_min ?? null;
    }
    t.resources = { ...(t.resources ?? {}), window: { from_das: from, to_das: Math.max(from, to), clock: "sowing", timing_source: "decision_rules.stage_offset_days", rule_id: rule.rule_id } };
    moved += 1;
  }
  return moved;
}

/** Final order of the schedule. Also writes the biological stage rank onto every card. */
export function sequenceTasks(tasks: BaselineTask[], order: StagePosition[]): BaselineTask[] {
  for (const t of tasks) { const p = positionOf(t, order); if (p) t.stage_order = p.rank; }
  return [...tasks].sort((a, b) =>
    a.days_from_sowing - b.days_from_sowing ||
    a.stage_order - b.stage_order ||
    WORK_ORDER[workGroupOf(a.task_type)] - WORK_ORDER[workGroupOf(b.task_type)] ||
    a.task_name.localeCompare(b.task_name));
}

// 2026-11-13 — STAGE-WISE WORK PLAN — pure, crop- and language-agnostic.
//
// A farmer works by crop stage: at each biological stage there is the field work, the feeding, the
// water and the crop check. The generator, however, emitted one card per database row, so a rice
// plan had 41 cards — three separate fertilizer cards on the transplanting day, two water cards in
// one stage, a stage card that only stated its date window beside the rule cards holding the actual
// practice. This module folds the cards of ONE stage and ONE kind of work into ONE card.
//
// It only regroups what the pipeline already produced:
//   * no operation, dose, product, day or wording is created here;
//   * every folded card's text, rule ids, sources and quantity are kept on the merged card
//     (text as steps, quantities as typed `inputs`, the originals under resources.stage_work);
//   * the kinds of work are the canonical task types, never crop or stage names.
import type { BaselineTask } from "./baseline-generator.ts";

export type WorkGroup = "field_work" | "nutrition" | "water" | "crop_check";

/** Canonical task type -> the kind of work a farmer does in a stage. Unknown types are field work. */
const GROUP_OF: Record<string, WorkGroup> = {
  nutrition: "nutrition", micronutrient: "nutrition",
  irrigation: "water",
  monitoring: "crop_check", pest_management: "crop_check", disease_management: "crop_check",
};
export const workGroupOf = (taskType: string): WorkGroup => GROUP_OF[taskType] ?? "field_work";

const PRIORITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const res = (t: BaselineTask): Record<string, unknown> => (t.resources ?? {}) as Record<string, unknown>;
const isWindowCard = (t: BaselineTask) => res(t).stage_window_card === true;
const text = (v: unknown) => String(v ?? "").trim();

/**
 * The card the others fold into. The stage's own operation card (it names the operation and holds
 * the stage window) leads field work; a card carrying a quantity leads feeding and water; the
 * scouting card (it holds the typed watch list) leads the crop check. Ties keep generation order.
 */
function anchorOf(group: WorkGroup, members: BaselineTask[]): BaselineTask {
  const score = (t: BaselineTask): number => {
    let s = PRIORITY_RANK[t.priority] ?? 0;
    if (group === "field_work") { if (isWindowCard(t)) s += 100; if (t.task_type !== "advisory") s += 10; }
    if (group === "nutrition" || group === "water") { if (t.quantity || t.water_volume) s += 100; if (t.recurrence) s += 10; }
    if (group === "crop_check") { if (t.task_type === "monitoring") s += 100; if (Array.isArray(res(t).watch_list)) s += 10; }
    return s;
  };
  return members.reduce((best, t) => (score(t) > score(best) ? t : best), members[0]);
}

const uniq = (lines: string[]) => { const seen = new Set<string>(); return lines.map(text).filter((l) => l && !seen.has(l) && !!seen.add(l)); };

function merge(group: WorkGroup, members: BaselineTask[]): BaselineTask {
  if (members.length === 1) return members[0];
  const anchor = anchorOf(group, members);
  const others = members.filter((t) => t !== anchor);
  const anchorRes = res(anchor);

  // A stage operation card states only its window. Once it leads real practice text, the first
  // folded card's description becomes the card's description and the window-only line is dropped.
  let description = text(anchor.task_description);
  let ownSteps = anchor.instructions ?? [];
  const folded: string[] = [];
  for (const t of others) folded.push(text(t.task_description), ...(t.instructions ?? []));
  if (isWindowCard(anchor) && uniq(folded).length) {
    const windowLine = description;
    description = uniq(folded)[0];
    ownSteps = ownSteps.filter((l) => text(l) !== windowLine);
  }
  const instructions = uniq([...ownSteps, ...folded]).filter((l) => l !== description);

  // Quantities: one dosed card keeps its own quantity. Several dosed cards (the nutrients given on
  // the same stage) cannot share one quantity field, so each becomes a typed input line and the
  // single-quantity field is cleared. Nothing is summed: different nutrients are different inputs.
  const dosed = members.filter((t) => t.quantity);
  const inputs = [...(Array.isArray(anchorRes.inputs) ? anchorRes.inputs as Array<Record<string, unknown>> : [])];
  const equivalents = [...(Array.isArray(anchorRes.product_equivalents) ? anchorRes.product_equivalents as unknown[] : [])];
  for (const t of others) {
    const r = res(t);
    if (Array.isArray(r.inputs)) inputs.push(...(r.inputs as Array<Record<string, unknown>>));
    if (Array.isArray(r.product_equivalents)) equivalents.push(...(r.product_equivalents as unknown[]));
  }
  let quantity = anchor.quantity, nutrient = anchor.nutrient;
  if (dosed.length > 1) {
    for (const t of dosed) inputs.push({ nutrient: t.nutrient ?? null, dose_value: t.quantity!.value, dose_unit: t.quantity!.unit, nutrient_basis: res(t).nutrient_basis ?? null });
    quantity = null; nutrient = null;
  } else if (dosed.length === 1 && dosed[0] !== anchor) { quantity = dosed[0].quantity; nutrient = dosed[0].nutrient; }

  const recurring = members.filter((t) => t.recurrence);
  const top = members.reduce((a, b) => ((PRIORITY_RANK[b.priority] ?? 0) > (PRIORITY_RANK[a.priority] ?? 0) ? b : a));

  return {
    ...anchor,
    task_description: description,
    instructions,
    days_from_sowing: Math.min(...members.map((t) => t.days_from_sowing)),
    priority: top.priority,
    weather_dependent: members.some((t) => t.weather_dependent),
    quantity, nutrient,
    water_volume: anchor.water_volume ?? others.find((t) => t.water_volume)?.water_volume ?? null,
    recurrence: anchor.recurrence ?? (recurring.length === 1 ? recurring[0].recurrence : null),
    estimated_cost: members.some((t) => t.estimated_cost != null) ? members.reduce((sum, t) => sum + (t.estimated_cost ?? 0), 0) : null,
    confidence: anchor.confidence ?? others.find((t) => t.confidence != null)?.confidence ?? null,
    rule_ids: [...new Set(members.flatMap((t) => t.rule_ids ?? []))],
    source_refs: members.flatMap((t) => t.source_refs ?? []),
    precautions: uniq(members.flatMap((t) => t.precautions ?? [])),
    technical_details: uniq(members.flatMap((t) => t.technical_details ?? [])),
    resources: {
      ...anchorRes,
      ...(inputs.length ? { inputs } : {}),
      ...(equivalents.length ? { product_equivalents: equivalents } : {}),
      stage_work: {
        group, merged_count: members.length,
        members: members.map((t) => ({ task_name: t.task_name, task_type: t.task_type, days_from_sowing: t.days_from_sowing, nutrient: t.nutrient ?? null, quantity: t.quantity ?? null, rule_ids: t.rule_ids ?? [], requirement_semantics: res(t).requirement_semantics ?? null })),
      },
    },
  };
}

export interface StageWorkPlan { tasks: BaselineTask[]; before: number; after: number; merged_groups: number }

/**
 * One card per stage and kind of work. Cards with no stage are left exactly as they are. The
 * result keeps the generator's total order (day, stage order, type, name) so runs stay repeatable.
 */
export function consolidateByStage(tasks: BaselineTask[]): StageWorkPlan {
  const groups = new Map<string, { group: WorkGroup; members: BaselineTask[] }>();
  const loose: BaselineTask[] = [];
  for (const t of tasks) {
    const stage = t.stage_uuid ?? t.stage_key ?? t.anchor_stage;
    if (!stage) { loose.push(t); continue; }
    const group = workGroupOf(t.task_type);
    const key = `${stage}|${group}`;
    (groups.get(key) ?? groups.set(key, { group, members: [] }).get(key)!).members.push(t);
  }
  let mergedGroups = 0;
  const out = [...loose];
  for (const { group, members } of groups.values()) { if (members.length > 1) mergedGroups += 1; out.push(merge(group, members)); }
  out.sort((a, b) => a.days_from_sowing - b.days_from_sowing || a.stage_order - b.stage_order || a.task_type.localeCompare(b.task_type) || a.task_name.localeCompare(b.task_name));
  return { tasks: out, before: tasks.length, after: out.length, merged_groups: mergedGroups };
}

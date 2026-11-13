// 2026-11-13 — TIMELINE INTEGRITY AND PRE-PERSISTENCE QUALITY GATES — pure, crop-agnostic.
//
// Found by auditing live schedule 155a7891 (transplanted rice):
//   * post-transplant windows were printed as days "after sowing" while the stage itself is counted
//     from transplanting, and the language pass then mislabelled them either way;
//   * stage windows taken from a DERIVED variety phenology profile were printed as firm dates;
//   * the harvest card carried a calendar window although the variety's maturity is unverified;
//   * nothing checked the finished plan as a whole before it was saved.
// This module labels each window with the clock it is counted on, marks how far a date can be
// trusted, and runs whole-plan gates. It creates no agronomy: every number it prints is an existing
// day on the schedule re-expressed on the stage's own clock.
import type { StageRow } from "../db/agronomy-repo.ts";
import type { BaselineTask } from "./baseline-generator.ts";
import { monitoringViolations } from "./monitoring-safety.ts";
import type { StagePosition } from "./stage-sequence.ts";

const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();
const resOf = (t: BaselineTask) => (t.resources ?? {}) as Record<string, unknown>;
const clockOf = (s: StageRow) => lower(s.clock_reference ?? s.das_reference);
function positionOf(t: BaselineTask, order: StagePosition[]): StagePosition | null {
  if (t.stage_uuid) { const hit = order.find((p) => p.stage.id === t.stage_uuid); if (hit) return hit; }
  const key = lower(t.stage_key ?? t.anchor_stage);
  return key ? order.find((p) => lower(p.stage.stage_code || p.stage.growth_stage) === key) ?? null : null;
}

const DAS_RANGE = /\bDAS (\d+) to (\d+)\b/g;
const DAS_POINT = /\bDAS (\d+)\b/g;

/**
 * A stage counted from transplanting states its windows in days after transplanting. The stored
 * day (days_from_sowing) is unchanged; only the sentence a farmer reads is put on the stage's clock.
 */
export function labelStageClock(tasks: BaselineTask[], order: StagePosition[], transplantOffset: number | null): number {
  if (transplantOffset == null) return 0;
  let relabelled = 0;
  const onClock = (line: string) => String(line)
    .replace(DAS_RANGE, (_m, a, b) => `${Math.max(0, Number(a) - transplantOffset)} to ${Math.max(0, Number(b) - transplantOffset)} days after transplanting`)
    .replace(DAS_POINT, (_m, a) => `${Math.max(0, Number(a) - transplantOffset)} days after transplanting`);
  for (const t of tasks) {
    const p = positionOf(t, order);
    if (!p || clockOf(p.stage) !== "transplanting") continue;
    const before = JSON.stringify([t.task_description, t.instructions]);
    t.task_description = onClock(t.task_description ?? "");
    t.instructions = (t.instructions ?? []).map(onClock);
    t.resources = { ...resOf(t), stage_clock: { reference: "transplanting", days_after_transplanting: Math.max(0, t.days_from_sowing - transplantOffset) } };
    if (before !== JSON.stringify([t.task_description, t.instructions])) relabelled += 1;
  }
  return relabelled;
}

export type TimingConfidence = "verified" | "indicative" | "unknown";
export const HARVEST_REVIEW_LINE = "The harvest date of this variety is not verified. Decide the harvest from the crop's maturity signs in the field, not from the calendar.";
const WINDOW_LINE = /\b(?:DAS \d+ to \d+|\d+ to \d+ days after (?:sowing|transplanting))\b/;

/**
 * How far each card's date can be trusted, as data on the card (resources.timing):
 *   indicative — the stage window came from a derived / unverified variety phenology profile;
 *   unknown    — a harvest-side card while the variety's maturity is unverified: its calendar window
 *                sentence is removed and an explicit review requirement is attached;
 *   verified   — otherwise (crop-level stage graph or a recorded field event).
 */
export function markTimingConfidence(tasks: BaselineTask[], order: StagePosition[], maturityVerified: boolean, harvestStageIds: ReadonlySet<string>): { indicative: number; harvest_review: number } {
  let indicative = 0, harvestReview = 0;
  for (const t of tasks) {
    const p = positionOf(t, order);
    if (!p) continue;
    const reliability = lower(p.stage.variety_window_reliability), source = lower(p.stage.variety_window_source);
    const derived = !!p.stage.variety_window_source && (source.startsWith("derived") || (reliability !== "" && !reliability.startsWith("verified")));
    let confidence: TimingConfidence = derived ? "indicative" : "verified";
    const review: string[] = [];
    if (!maturityVerified && harvestStageIds.has(p.stage.id)) {
      confidence = "unknown"; review.push("VARIETY_MATURITY_CLOCK_NOT_VERIFIED");
      const stripped = (t.instructions ?? []).filter((l) => !WINDOW_LINE.test(String(l)));
      if (WINDOW_LINE.test(String(t.task_description ?? ""))) t.task_description = HARVEST_REVIEW_LINE;
      t.instructions = stripped.includes(HARVEST_REVIEW_LINE) || t.task_description === HARVEST_REVIEW_LINE ? stripped : [...stripped, HARVEST_REVIEW_LINE];
      harvestReview += 1;
    } else if (derived) indicative += 1;
    t.resources = { ...resOf(t), timing: { confidence, basis: p.stage.variety_window_source ?? "crop_stage_master", calendar_reliability: p.stage.variety_window_reliability ?? null }, ...(review.length ? { review_required: review } : {}) };
  }
  return { indicative, harvest_review: harvestReview };
}

export interface GateFinding { code: string; task?: string; detail?: string }
export interface GateReport { passed: boolean; blocking: GateFinding[]; warnings: GateFinding[] }
const NUTRIENT_TOLERANCE = 0.01;

/**
 * Whole-plan checks run on the finished task list before it is saved.
 * BLOCKING (the schedule is not saved): a treatment on a scouting card; a nutrient whose scheduled
 * doses add up to more than the season's programme; a stage that starts before an earlier stage.
 * WARNINGS (saved, recorded on the schedule): a card dated outside its stage; one rule on two
 * cards; an executable card with no instruction at all.
 */
export function runQualityGates(tasks: BaselineTask[], order: StagePosition[], seasonNutrients: Record<string, number | null | undefined>): GateReport {
  const blocking: GateFinding[] = [], warnings: GateFinding[] = [];
  for (const t of tasks) for (const v of monitoringViolations(t)) blocking.push({ code: v, task: t.task_name });

  const scheduled = new Map<string, number>();
  const add = (nutrient: unknown, q: unknown) => { const v = Number((q as { value?: unknown } | null)?.value); const n = String(nutrient ?? "").trim(); if (n && Number.isFinite(v)) scheduled.set(n, (scheduled.get(n) ?? 0) + v); };
  for (const t of tasks) {
    const members = (resOf(t).stage_work as { members?: Array<{ nutrient: unknown; quantity: unknown }> } | undefined)?.members;
    if (members?.length) for (const m of members) add(m.nutrient, m.quantity); else add(t.nutrient, t.quantity);
  }
  for (const [nutrient, limit] of Object.entries(seasonNutrients)) {
    if (limit == null || !Number.isFinite(Number(limit))) continue;
    const total = scheduled.get(nutrient) ?? 0;
    if (total > Number(limit) * (1 + NUTRIENT_TOLERANCE)) blocking.push({ code: "NUTRIENT_DOSES_EXCEED_SEASON_PROGRAMME", detail: `${nutrient}: scheduled ${total.toFixed(2)} > programme ${Number(limit).toFixed(2)}` });
  }

  let lastRank = 0, lastDay = Number.NEGATIVE_INFINITY;
  for (const t of tasks) {
    const p = positionOf(t, order);
    if (!p) continue;
    if (t.days_from_sowing === lastDay && p.rank < lastRank) blocking.push({ code: "STAGE_ORDER_REVERSED_ON_SAME_DAY", task: t.task_name });
    lastRank = t.days_from_sowing === lastDay ? Math.max(lastRank, p.rank) : p.rank; lastDay = t.days_from_sowing;
    const grace = Number(p.stage.boundary_grace_days ?? 0) || 0;
    const reanchored = resOf(t).window != null || resOf(t).seedling_age != null;
    if (!reanchored && p.from != null && p.to != null && (t.days_from_sowing < p.from - grace || t.days_from_sowing > p.to + grace)) warnings.push({ code: "TASK_DATED_OUTSIDE_ITS_STAGE", task: t.task_name, detail: `day ${t.days_from_sowing} not in ${p.from}-${p.to}` });
  }

  const cardOfRule = new Map<string, string>();
  for (const t of tasks) {
    if (t.task_type === "monitoring") continue;
    for (const id of t.rule_ids ?? []) { const had = cardOfRule.get(id); if (had && had !== t.task_name) warnings.push({ code: "RULE_ON_TWO_CARDS", task: t.task_name, detail: id }); else cardOfRule.set(id, t.task_name); }
    if (!String(t.task_description ?? "").trim() && !(t.instructions ?? []).length) warnings.push({ code: "EXECUTABLE_TASK_WITHOUT_INSTRUCTIONS", task: t.task_name });
  }
  return { passed: blocking.length === 0, blocking, warnings };
}

/** Ordered steps of a card for the detailed_steps field: what to do, then the precautions. Built only from the card's own text. */
export function detailedStepsOf(t: { task_description?: string | null; instructions?: string[] | null; precautions?: string[] | null }): string[] {
  const steps = (t.instructions ?? []).map((x) => String(x).trim()).filter(Boolean);
  const body = steps.length ? steps : [String(t.task_description ?? "").trim()].filter(Boolean);
  const out: string[] = [];
  for (const line of [...body, ...(t.precautions ?? []).map((x) => String(x).trim()).filter(Boolean)]) if (!out.includes(line)) out.push(line);
  return out;
}

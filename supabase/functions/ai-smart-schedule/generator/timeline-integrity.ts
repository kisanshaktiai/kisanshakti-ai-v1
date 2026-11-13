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
import { isBiologicalHarvestStage, stagesUseTransplantClock } from "./agronomy-scientific-contract.ts";
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

/**
 * 2026-11-13 — TRANSPLANT DATE APPLICABILITY (database clock fields, crop-agnostic). A transplant
 * date means something only when the selected method's stage graph counts days from transplanting.
 *   explicit request value on a method without that clock -> rejected (the request is contradictory);
 *   value inherited from the land record (a previous crop)  -> ignored and recorded as a gap.
 */
export function transplantDateDecision(stages: ReadonlyArray<{ das_reference?: unknown; clock_reference?: unknown }>, transplantDate: string | null, fromRequest: boolean):
  { keep: boolean; reject: boolean; gap: string | null } {
  if (!transplantDate) return { keep: false, reject: false, gap: null };
  if (stagesUseTransplantClock(stages)) return { keep: true, reject: false, gap: null };
  return fromRequest
    ? { keep: false, reject: true, gap: "transplant_date_not_applicable_to_method" }
    : { keep: false, reject: false, gap: "transplant_date_from_land_record_ignored_method_has_no_transplanting" };
}

/**
 * 2026-11-13 — POST-HARVEST AFTER THE HARVEST. The stage graph's post-harvest window is a crop-level
 * calendar; when the harvest window comes from the variety, the post-harvest stage must follow THAT
 * harvest. Every card on a stage after the biological harvest stage is re-dated from the harvest
 * card (day + 1), and its window AND its day numbers in the text move with it (the old fix moved
 * only the date and left "DAS 160 to 190" in the text and the window).
 */
export function alignAfterHarvest(tasks: BaselineTask[], order: StagePosition[]): { moved: number; from: number | null } {
  const harvest = order.filter((p) => isBiologicalHarvestStage(p.stage.growth_stage) && p.from != null).sort((a, b) => b.rank - a.rank)[0];
  if (!harvest) return { moved: 0, from: null };
  const harvestCard = tasks.filter((t) => t.task_type === "harvest").sort((a, b) => a.days_from_sowing - b.days_from_sowing)[0];
  const start = (harvestCard?.days_from_sowing ?? (harvest.from as number)) + 1;
  let moved = 0;
  for (const p of order) {
    if (p.rank <= harvest.rank || p.from == null || p.to == null) continue;
    const origFrom = p.from, origTo = p.to, span = origTo - origFrom, shift = start - origFrom;
    if (shift === 0) continue;
    const onNewClock = (line: string) => String(line)
      .replace(DAS_RANGE, (m, a, b) => Number(a) >= origFrom && Number(b) <= origTo ? `DAS ${Number(a) + shift} to ${Number(b) + shift}` : m)
      .replace(/\bDAS (\d+)\b(?! to)/g, (m, a) => Number(a) >= origFrom && Number(a) <= origTo ? `DAS ${Number(a) + shift}` : m);
    for (const t of tasks) {
      if (positionOf(t, [p]) !== p) continue;
      t.days_from_sowing = start + Math.max(0, t.days_from_sowing - origFrom);
      t.task_description = onNewClock(t.task_description ?? "");
      t.instructions = (t.instructions ?? []).map(onNewClock);
      if (t.recurrence) { t.recurrence.window_start = start; t.recurrence.window_end = start + span; }
      t.resources = { ...resOf(t), window: { from_das: start, to_das: start + span, clock: "sowing", origin: "aligned_after_harvest", stage_graph_window: [origFrom, origTo] } };
      moved += 1;
    }
    p.from = start; p.to = start + span;
    // The window is now as reliable as the harvest window it follows.
    p.stage = { ...p.stage, variety_window_source: harvest.stage.variety_window_source ?? p.stage.variety_window_source, variety_window_reliability: harvest.stage.variety_window_reliability ?? p.stage.variety_window_reliability };
  }
  return { moved, from: start };
}

const PER_AREA_RANGE = /(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*kg\b[^.;]{0,60}?\bper\s+(hectare|ha|acre)\b/gi;
const HA_PER_ACRE = 0.404686;

/**
 * 2026-11-13 — ONE SEED-RATE AUTHORITY. The sowing card's quantity comes from the variety record;
 * a regional rule folded onto the same card may state its own per-area seed rate for the same
 * method. When the card's rate lies outside every range the card itself states, the card would tell
 * the farmer two different amounts: the computed quantity is withheld (never averaged, never
 * replaced by a guessed number) and the card is marked for review. Reads the English source lines.
 */
export function withholdConflictingSeedRate(tasks: BaselineTask[], areaAcres: number | null): string[] {
  const conflicts: string[] = [];
  if (areaAcres == null || !(areaAcres > 0)) return conflicts;
  for (const t of tasks) {
    if (!["sowing", "planting", "transplanting"].includes(t.task_type) || !t.quantity || t.quantity.unit !== "kg") continue;
    const kg = t.quantity.value;
    const qtyToken = String(kg);
    const lines = [String(t.task_description ?? ""), ...(t.instructions ?? []).map(String)];
    const ranges: Array<{ min: number; max: number; per: string }> = [];
    for (const line of lines) {
      if (line.includes(qtyToken)) continue;
      for (const m of line.matchAll(PER_AREA_RANGE)) ranges.push({ min: Number(m[1]), max: Number(m[2]), per: m[3].toLowerCase() });
    }
    if (!ranges.length) continue;
    const perHa = kg / (areaAcres * HA_PER_ACRE), perAcre = kg / areaAcres;
    const inside = ranges.some((r) => { const v = r.per === "acre" ? perAcre : perHa; return v >= r.min * 0.95 && v <= r.max * 1.05; });
    if (inside) continue;
    // Drop every line the variety record produced for this field (they carry the field's acreage).
    const fieldLine = new RegExp(`\\b${String(areaAcres).replace(".", "\\.")}\\s*acre`, "i");
    const derived = (l: string) => l.includes(qtyToken) || fieldLine.test(l) || /^This seed quantity is for /.test(l);
    const kept = (t.instructions ?? []).filter((l) => !derived(String(l)));
    if (derived(String(t.task_description ?? ""))) t.task_description = kept[0] ?? "";
    t.instructions = kept.filter((l) => l !== t.task_description);
    const review = Array.isArray(resOf(t).review_required) ? resOf(t).review_required as string[] : [];
    t.resources = { ...resOf(t), withheld_quantity: { ...t.quantity, reason: "SEED_RATE_SOURCES_CONFLICT", card_rate_kg_per_ha: Number(perHa.toFixed(1)), stated_ranges: ranges }, review_required: [...new Set([...review, "SEED_RATE_SOURCES_CONFLICT"])] };
    t.quantity = null;
    conflicts.push(`${t.task_name}: ${perHa.toFixed(1)} kg/ha vs ${ranges.map((r) => `${r.min}-${r.max} kg/${r.per}`).join(", ")}`);
  }
  return conflicts;
}

/**
 * 2026-11-13 — CALENDAR STAGE (fallback). When the field's observed stage cannot be resolved yet
 * (the land still carries the previous crop until this schedule is committed), today's position on
 * THIS plan's own stage calendar is used so past windows are separated from current work. Marked as
 * a calendar estimate, never as an observation.
 */
export function calendarStageAt(order: StagePosition[], todayDas: number): StagePosition | null {
  const placed = order.filter((p) => p.from != null && p.to != null);
  if (!placed.length || todayDas < (placed[0].from as number)) return null;
  const open = placed.filter((p) => todayDas >= (p.from as number) && todayDas <= (p.to as number)).sort((a, b) => b.rank - a.rank)[0];
  return open ?? placed.filter((p) => (p.from as number) <= todayDas).sort((a, b) => (b.to as number) - (a.to as number) || b.rank - a.rank)[0] ?? null;
}

export interface GateFinding { code: string; task?: string; detail?: string }
export interface GateReport {
  /** True only when nothing is unsafe AND the cultivation programme is complete and verified. */
  passed: boolean;
  blocking: GateFinding[];
  warnings: GateFinding[];
  /** What keeps a safely saved plan from being farmer-executable as an approved programme. */
  incomplete: GateFinding[];
  readiness: { safe_to_save: boolean; executable: boolean; mode: "approved" | "provisional_planning" | "blocked" };
}
/** Context the whole-plan gate reads besides the tasks (all optional; absent = not checked). */
export interface GateContext {
  releaseStatus?: string | null;
  /** A yield figure the schedule would claim, and the evidence for it. */
  yieldClaim?: number | null;
  yieldEvidence?: string | null;
}
const NUTRIENT_TOLERANCE = 0.01;

/**
 * Whole-plan checks run on the finished task list before it is saved.
 * BLOCKING (the schedule is not saved): a treatment on a scouting card; a nutrient whose scheduled
 * doses add up to more than the season's programme; a stage that starts before an earlier stage.
 * WARNINGS (saved, recorded on the schedule): a card dated outside its stage; one rule on two
 * cards; an executable card with no instruction at all.
 */
export function runQualityGates(tasks: BaselineTask[], order: StagePosition[], seasonNutrients: Record<string, number | null | undefined>, ctx: GateContext = {}): GateReport {
  const blocking: GateFinding[] = [], warnings: GateFinding[] = [], incomplete: GateFinding[] = [];
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
  // ── 2026-11-13: PROGRAMME COVERAGE AND SCIENTIFIC READINESS ─────────────────────────────────
  // Canonical task types only (crop-agnostic). A missing component does not block saving a safe
  // provisional plan; it keeps the plan from being called complete or farmer-executable.
  const has = (pred: (t: BaselineTask) => boolean) => tasks.some(pred);
  const dosed = (t: BaselineTask) => !!t.quantity || (Array.isArray(resOf(t).inputs) && (resOf(t).inputs as unknown[]).length > 0);
  if (!has((t) => ["sowing", "planting", "transplanting"].includes(t.task_type))) incomplete.push({ code: "COVERAGE_ESTABLISHMENT_MISSING" });
  else if (!has((t) => ["sowing", "planting", "transplanting"].includes(t.task_type) && !!t.quantity)) incomplete.push({ code: "COVERAGE_SEED_QUANTITY_MISSING" });
  const programme = Object.values(seasonNutrients).some((v) => v != null && Number(v) > 0);
  if (!programme || !has((t) => ["nutrition", "micronutrient"].includes(t.task_type) && dosed(t))) incomplete.push({ code: "COVERAGE_NUTRIENT_PROGRAMME_MISSING" });
  if (!has((t) => t.task_type === "irrigation" || resOf(t).requirement_semantics === "BASELINE_WITHDRAWAL")) incomplete.push({ code: "COVERAGE_WATER_PLAN_MISSING" });
  if (!has((t) => t.task_type === "weed_management")) incomplete.push({ code: "COVERAGE_WEED_OPERATION_MISSING" });
  if (!has((t) => t.task_type === "monitoring")) incomplete.push({ code: "COVERAGE_SCOUTING_MISSING" });
  if (!has((t) => t.task_type === "harvest")) incomplete.push({ code: "COVERAGE_HARVEST_MISSING" });
  for (const t of tasks) {
    const r = resOf(t);
    const decision = r.irrigation_decision as { per_event_depth_mm?: unknown } | undefined;
    if (t.task_type === "irrigation" && (!decision || decision.per_event_depth_mm == null)) incomplete.push({ code: "IRRIGATION_EVENT_DEPTH_UNVERIFIED", task: t.task_name });
    for (const code of Array.isArray(r.review_required) ? r.review_required as string[] : []) incomplete.push({ code, task: t.task_name });
    // Task date, window and the day numbers printed in its own text must agree.
    const win = r.window as { from_das?: number; to_das?: number } | undefined;
    const p = positionOf(t, order);
    const lo = win?.from_das ?? p?.from ?? null, hi = win?.to_das ?? p?.to ?? null;
    if (lo != null && hi != null) {
      for (const line of [String(t.task_description ?? ""), ...(t.instructions ?? []).map(String)]) {
        for (const m of line.matchAll(DAS_RANGE)) {
          if (Number(m[1]) < lo - 1 || Number(m[2]) > hi + 1) { warnings.push({ code: "TASK_TEXT_WINDOW_MISMATCH", task: t.task_name, detail: `text ${m[1]}-${m[2]} vs window ${lo}-${hi}` }); incomplete.push({ code: "TASK_TEXT_WINDOW_MISMATCH", task: t.task_name }); }
        }
      }
      if (t.days_from_sowing < lo - 1 || t.days_from_sowing > hi + 1) incomplete.push({ code: "TASK_DATE_OUTSIDE_ITS_WINDOW", task: t.task_name, detail: `day ${t.days_from_sowing} vs ${lo}-${hi}` });
    }
  }
  for (const w of warnings) if (w.code === "TASK_DATED_OUTSIDE_ITS_STAGE") incomplete.push({ code: w.code, task: w.task });
  if (ctx.releaseStatus != null && String(ctx.releaseStatus).toLowerCase() !== "approved") incomplete.push({ code: "SCIENTIFIC_RELEASE_NOT_APPROVED", detail: String(ctx.releaseStatus) });
  if (ctx.yieldClaim != null && !String(ctx.yieldEvidence ?? "").trim()) blocking.push({ code: "UNSUPPORTED_YIELD_CLAIM", detail: String(ctx.yieldClaim) });

  const safe = blocking.length === 0;
  const complete = incomplete.length === 0;
  return { passed: safe && complete, blocking, warnings, incomplete, readiness: { safe_to_save: safe, executable: safe && complete, mode: !safe ? "blocked" : complete ? "approved" : "provisional_planning" } };
}

/** Ordered steps of a card for the detailed_steps field: what to do, then the precautions. Built only from the card's own text. */
export function detailedStepsOf(t: { task_description?: string | null; instructions?: string[] | null; precautions?: string[] | null }): string[] {
  // 2026-11-13: the description leads. A merged card keeps its main action in the description and the
  // folded practice in the instructions; the old "instructions, else description" dropped that action
  // (replay of e7c27133: the grain-filling card lost its watering cadence, the sowing card its seed-rate line).
  const steps = (t.instructions ?? []).map((x) => String(x).trim()).filter(Boolean);
  const body = [String(t.task_description ?? "").trim(), ...steps].filter(Boolean);
  const out: string[] = [];
  for (const line of [...body, ...(t.precautions ?? []).map((x) => String(x).trim()).filter(Boolean)]) if (!out.includes(line)) out.push(line);
  return out;
}

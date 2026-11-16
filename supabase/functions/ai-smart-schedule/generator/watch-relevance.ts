// 2026-11-13 — Variety-aware ordering of a stage's scouting list — pure, DB-driven.
//
// A stage's conditional rules are folded into ONE scouting card. Before this change every rule that
// could apply at that stage was printed in database order, so a variety documented as resistant to a
// disease got the same space as one it is susceptible to, and a stage could print a wall of lines.
//
// This module only ORDERS and ANNOTATES. It never drops a brief from the structured list, never
// invents a threat, and never states that a resistant variety is immune: resistance lowers the
// position of a check, it does not remove it. The weight comes from variety_resistance.score_modifier
// (database value); no disease, crop or rating scale is typed here.
import type { ResistanceEntry, VarietyProfile } from "../db/variety-profile.ts";
import type { BaselineTask } from "./baseline-generator.ts";
import { watchLine, type WatchBrief } from "./monitoring-safety.ts";

/** The slice of the evidence pack the fold reads (kept structural so this module stays pure and testable). */
export interface FoldableEvidence {
  candidates: Array<{ default_status: string; task: { stage_key?: string | null; anchor_stage?: string | null; resources?: unknown } }>;
}

/** Visible scouting lines per stage card. A readability limit, not an agronomic one: the complete list stays in resources.watch_list. */
export const MAX_VISIBLE_WATCH_LINES = 6;
/** A brief with no variety evidence is neither promoted nor demoted: it sorts as a fully susceptible check. */
const NEUTRAL_WEIGHT = 1;

export interface ResistanceBinding { level: string | null; threat: string | null; weight: number }
export interface WatchBriefLike { rule_id?: string | null; [k: string]: unknown }
export type RankedBrief<T> = T & { variety_resistance?: { level: string | null; threat: string | null }; visible: boolean };

/** rule_id -> the variety's resistance record for it (the most susceptible record wins if several link). */
export function resistanceBindings(resistance: ResistanceEntry[]): Map<string, ResistanceBinding> {
  const out = new Map<string, ResistanceBinding>();
  for (const r of resistance) {
    const weight = r.score_modifier ?? NEUTRAL_WEIGHT;
    for (const ruleId of r.rule_ids) {
      const had = out.get(ruleId);
      if (!had || weight > had.weight) out.set(ruleId, { level: r.level, threat: r.threat, weight });
    }
  }
  return out;
}

export function rankWatchBriefs<T extends WatchBriefLike>(
  briefs: T[],
  bindings: ReadonlyMap<string, ResistanceBinding>,
  maxVisible: number = MAX_VISIBLE_WATCH_LINES,
): Array<RankedBrief<T>> {
  const decorated = briefs.map((b, index) => {
    const bound = b.rule_id ? bindings.get(String(b.rule_id)) : undefined;
    return { b, index, weight: bound ? bound.weight : NEUTRAL_WEIGHT, bound };
  });
  decorated.sort((x, y) => y.weight - x.weight || x.index - y.index);
  const limit = Math.max(1, Math.floor(maxVisible));
  return decorated.map((d, position) => ({
    ...d.b,
    ...(d.bound ? { variety_resistance: { level: d.bound.level, threat: d.bound.threat } } : {}),
    visible: position < limit,
  }));
}

/** Closing line of a scouting card: the action for every symptom on it. */
export const SCOUTING_ACTION_LINE = "If you see any of these, note where and how much, and get it checked before any spray or treatment.";

/**
 * Fold conditional-rule watch briefs (evidence-pack) into each stage's scouting task, so a
 * farmer sees one scouting card per stage, not many cards.
 *
 * 2026-11-13 — A SCOUTING CARD LISTS SYMPTOMS, NEVER A PRESCRIPTION. The card used to print
 * "watch for <code>; if seen: apply <product, dose>" for every rule of the stage. With generic
 * condition codes that became an unconditional pesticide line ("watch for stage general; if seen:
 * apply a fungicide") and a dozen products on one card. A product and dose are decided after the
 * problem is confirmed in the field at its threshold, by the diagnosis flow, not by the calendar.
 * With the symptom catalog (database):
 *   - only codes the catalog marks as a diagnostic, farmer-visible symptom are listed;
 *   - each symptom appears once, by its farmer-language label, however many rules share it;
 *   - no product, dose or treatment text is printed, and none is left on the structured list.
 * Without the catalog (read failed) the card still prints observations only.
 */
export function foldWatchBriefs(tasks: BaselineTask[], evidence: FoldableEvidence, varietyProfile: VarietyProfile | null = null, symptoms: ReadonlyMap<string, { label: string; diagnostic: boolean }> | null = null): BaselineTask[] {
  const bindings = resistanceBindings(varietyProfile?.resistance ?? []);
  const briefsByStage = new Map<string, Array<Record<string, unknown>>>();
  for (const c of evidence.candidates) {
    const brief = (c.task.resources as Record<string, unknown> | undefined)?.watch_brief as Record<string, unknown> | null | undefined;
    if (c.default_status !== "CONDITIONAL" || !brief) continue;
    const key = String(c.task.stage_key ?? c.task.anchor_stage ?? "");
    if (!key) continue;
    (briefsByStage.get(key) ?? briefsByStage.set(key, []).get(key)!).push(brief);
  }
  if (!briefsByStage.size) return tasks;
  for (const t of tasks) {
    if (t.task_type !== "monitoring") continue;
    const key = String(t.stage_key ?? t.anchor_stage ?? "");
    const all = briefsByStage.get(key);
    if (!all || !all.length) continue;
    const res = (t.resources ??= {}) as Record<string, unknown>;
    // Symptoms only: drop non-diagnostic codes, then one entry per symptom (most relevant rule first).
    const observable = symptoms ? all.filter((b) => symptoms.get(String(b.condition_code ?? ""))?.diagnostic === true) : all;
    const seen = new Set<string>();
    const ranked = rankWatchBriefs(observable, bindings, Number.MAX_SAFE_INTEGER)
      .filter((b) => { const k = String(b.condition_code ?? b.rule_id ?? ""); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((b, i) => ({
        ...b,
        symptom: symptoms?.get(String(b.condition_code ?? ""))?.label ?? null,
        // The calendar never carries the treatment; whether one exists is kept as a flag only.
        treatment_on_diagnosis: b.treatment_authorized === true && b.carries_input === true,
        if_seen: null, treatment: null, treatment_authorized: false,
        visible: i < MAX_VISIBLE_WATCH_LINES,
      }));
    res.watch_list = ranked;                       // structured, for the UI
    res.watch_count = ranked.length;
    res.watch_dropped_not_observable = all.length - observable.length;
    const lines = ranked.filter((b) => b.visible).map((b) => b.symptom ? `Look for: ${b.symptom}` : watchLine(b as unknown as WatchBrief));
    if (lines.length) lines.push(SCOUTING_ACTION_LINE);
    t.instructions = [...(t.instructions ?? []), ...lines.filter((l) => !(t.instructions ?? []).includes(l))];
  }
  return tasks;
}

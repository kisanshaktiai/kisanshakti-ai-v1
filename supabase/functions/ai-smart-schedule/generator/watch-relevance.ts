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

/** Fold conditional-rule watch briefs (evidence-pack) into each stage's scouting task, so a
 *  farmer sees one scouting card per stage with a "watch for / if seen" list, not many cards. */
export function foldWatchBriefs(tasks: BaselineTask[], evidence: FoldableEvidence, varietyProfile: VarietyProfile | null = null): BaselineTask[] {
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
    const briefs = briefsByStage.get(key);
    if (!briefs || !briefs.length) continue;
    const res = (t.resources ??= {}) as Record<string, unknown>;
    // 2026-11-13: order by the selected variety's own resistance records and print at most
    // MAX_VISIBLE_WATCH_LINES; the complete list stays structured in watch_list (visible flag).
    const ranked = rankWatchBriefs(briefs, bindings);
    res.watch_list = ranked;                       // structured, for the UI
    res.watch_count = ranked.length;
    // 2026-11-12: lines render from the typed brief; a treatment appears only when the rule row
    // itself authorizes it (monitoring-safety.ts). No keyword filtering happens after this.
    const lines = ranked.filter((b) => b.visible).map((b) => watchLine(b as unknown as WatchBrief));
    t.instructions = [...(t.instructions ?? []), ...lines.filter((l) => !(t.instructions ?? []).includes(l))];
  }
  return tasks;
}

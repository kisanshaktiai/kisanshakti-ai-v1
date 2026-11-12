/**
 * Decision-rule timing anchor — pure.
 *
 * 2026-11-12 — surgical fix. Rules whose action text carried an event-relative time
 * ("25-30 days after transplanting") were dropped from every schedule. They are now anchored:
 *   1. typed crop age (decision_rules.crop_age_days_min/max, days from sowing) wins;
 *   2. otherwise ONE unambiguous relative expression in the verified English DB text is converted
 *      to the schedule clock (sowing-relative as written; transplant-relative + the resolved
 *      nursery offset);
 *   3. otherwise the rule stays a stage-window card and the reason is reported.
 * A converted day must fall inside a stage the rule itself names. Nothing is estimated: an
 * unresolved clock, several different timings, or a day outside the named stages all fall back
 * to (3) with a named gap for agronomist structuring.
 */
export interface StageWindow { dasMin: number | null; dasMax: number | null; }
export interface RuleTimingInput {
  ruleId: string;
  ageMin: number | null | undefined;
  ageMax: number | null | undefined;
  actionText: string | null | undefined;
  /** Days from sowing to transplanting, or null when the method has no resolved nursery phase. */
  transplantOffset: number | null;
  /** Windows (schedule clock) of the stages the rule names, earliest first. */
  stages: StageWindow[];
}
export interface RuleTiming {
  stageIndex: number;
  das: number | null;
  dasEnd: number | null;
  anchorType: "STAGE" | "DAS" | "DAT";
  basis: "typed_crop_age" | "text_relative_converted" | "stage_window";
  gap: string | null;
}

const num = (v: unknown): number | null => v != null && Number.isFinite(Number(v)) ? Number(v) : null;
const RELATIVE = /(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(?:(days?|weeks?)\s+after\s+(transplant(?:ing|ation)?|sow(?:ing)?|seeding|plant(?:ing)?|harvest(?:ing)?|emergence|germination)|(DAT|DAS)\b)/gi;

interface Expr { lo: number; hi: number; clock: "transplant" | "sowing" | "planting" | "other"; }
export function relativeExpressions(text: unknown): Expr[] {
  const out = new Map<string, Expr>();
  for (const m of String(text ?? "").matchAll(RELATIVE)) {
    const scale = /^week/i.test(m[3] ?? "") ? 7 : 1;
    const lo = Number(m[1]) * scale, hi = (m[2] != null ? Number(m[2]) : Number(m[1])) * scale;
    const word = String(m[5] ?? m[4] ?? "").toLowerCase();
    const clock: Expr["clock"] = word === "dat" || word.startsWith("transplant") ? "transplant"
      : word === "das" || word.startsWith("sow") || word === "seeding" ? "sowing"
      : word.startsWith("plant") ? "planting" : "other";
    out.set(`${lo}|${hi}|${clock}`, { lo: Math.min(lo, hi), hi: Math.max(lo, hi), clock });
  }
  return [...out.values()];
}

function place(lo: number, hi: number, stages: StageWindow[]): { stageIndex: number; das: number; dasEnd: number } | null {
  for (let i = 0; i < stages.length; i++) {
    const min = num(stages[i].dasMin), max = num(stages[i].dasMax);
    if (min == null || max == null) continue;
    if (hi >= min && lo <= max) return { stageIndex: i, das: Math.max(lo, min), dasEnd: Math.min(hi, max) };
  }
  return null;
}

export function resolveRuleTiming(input: RuleTimingInput): RuleTiming {
  const stageStart: RuleTiming = { stageIndex: 0, das: num(input.stages[0]?.dasMin), dasEnd: num(input.stages[0]?.dasMax), anchorType: "STAGE", basis: "stage_window", gap: null };
  const ageMin = num(input.ageMin), ageMax = num(input.ageMax);
  if (ageMin != null || ageMax != null) {
    const lo = (ageMin ?? ageMax) as number, hi = (ageMax ?? ageMin) as number;
    const hit = lo <= hi ? place(lo, hi, input.stages) : null;
    return hit ? { ...hit, anchorType: "DAS", basis: "typed_crop_age", gap: null }
      : { ...stageStart, gap: `rule_typed_crop_age_outside_named_stage:${input.ruleId}` };
  }
  const exprs = relativeExpressions(input.actionText);
  if (!exprs.length) return stageStart;
  if (exprs.length > 1) return { ...stageStart, gap: `rule_relative_timing_multiple_needs_structured_anchor:${input.ruleId}` };
  const e = exprs[0];
  let offset: number | null = null;
  if (e.clock === "sowing") offset = 0;
  else if (e.clock === "transplant") offset = input.transplantOffset;
  // "planting" is the sowing event only for a method with no nursery phase.
  else if (e.clock === "planting" && input.transplantOffset == null) offset = 0;
  if (offset == null) return { ...stageStart, gap: `rule_relative_timing_clock_unresolved:${input.ruleId}` };
  const hit = place(e.lo + offset, e.hi + offset, input.stages);
  return hit ? { ...hit, anchorType: e.clock === "transplant" ? "DAT" : "DAS", basis: "text_relative_converted", gap: null }
    : { ...stageStart, gap: `rule_relative_timing_outside_named_stage:${input.ruleId}` };
}

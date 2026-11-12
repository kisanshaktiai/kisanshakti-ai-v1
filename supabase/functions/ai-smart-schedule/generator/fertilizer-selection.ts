/**
 * Fertilizer recommendation row selection — pure, no DB access, no agronomic numbers.
 *
 * 2026-11-12 — surgical fix. The previous eligibility filter required (a) the land's soil class to
 * equal the row's class as a raw string and (b) the row's free-text cultivation_context to CONTAIN
 * the farmer's method code. Live data: soil tests store "moderate" while every recommendation row
 * says "medium", and contexts read "kharif" / "rabi" / "suru plant crop" — so no row was ever
 * eligible and no schedule carried a fertilizer programme.
 *
 * Rules implemented here:
 *  - The approved state recommendation is the default when no soil test exists. It is labelled as
 *    such (basis + gap); it is never silently presented as soil-test based.
 *  - A soil test changes the dose ONLY by selecting a row authored for that fertility class.
 *    No adjustment factor is computed here.
 *  - Region is a hard gate: a row written for another region is never used.
 *  - A context is a hard gate only when it NAMES a different cultivation method or crop cycle
 *    (vocabulary supplied by the caller from the DB masters). Any other context wording is kept
 *    and reported so an agronomist can structure it.
 */

export interface FertilizerRow {
  id: string;
  region_code?: string | null;
  soil_fertility_class?: string | null;
  cultivation_context?: string | null;
  [key: string]: unknown;
}

export interface FertilizerSelectionContext {
  regionCode: string | null;
  /** Raw fertility class from the latest soil test, or null when there is no test. */
  soilFertilityClass: string | null;
  /** The farmer's method lineage: selected method, stage-clock method, parent methods. */
  methodCodes: string[];
  cropCycle: string | null;
  /** Every active cultivation method code (cultivation_method_master). */
  methodVocabulary: string[];
  /** Every crop cycle this crop's stage graph defines (crop_stage_master.crop_cycle). */
  cycleVocabulary: string[];
}

export type FertilizerBasis = "soil_test_class_matched" | "state_recommended_dose";

export interface FertilizerSelection<R extends FertilizerRow> {
  row: R;
  basis: FertilizerBasis;
  gaps: string[];
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const words = (v: unknown) => norm(v).replace(/[_\-/]+/g, " ").replace(/\s+/g, " ").trim();

/** Spellings of the three soil-test fertility classes. Vocabulary only — no thresholds. */
const FERTILITY_SYNONYMS: Record<string, string> = {
  low: "low", poor: "low", deficient: "low",
  medium: "medium", moderate: "medium", med: "medium", average: "medium",
  high: "high", rich: "high", sufficient: "high",
};

export function normalizeFertilityClass(value: unknown): string | null {
  const key = words(value).replace(/^very\s+/, "");
  return FERTILITY_SYNONYMS[key] ?? null;
}

const containsPhrase = (haystack: string, phrase: string) =>
  !!phrase && new RegExp(`(?:^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`).test(haystack);

/** Method codes / cycles the context text names (DB vocabulary only). */
function namedTerms(context: string, vocabulary: string[]): string[] {
  const out: string[] = [];
  for (const term of vocabulary) {
    const phrase = words(term);
    if (!phrase || phrase === "any" || phrase === "universal") continue;
    if (containsPhrase(context, phrase)) out.push(norm(term));
  }
  return out;
}

export function contextVerdict(row: FertilizerRow, ctx: FertilizerSelectionContext): "conflict" | "match" | "neutral" {
  const context = words(row.cultivation_context);
  if (!context) return "neutral";
  const mine = new Set(ctx.methodCodes.map(norm).filter(Boolean));
  const methods = namedTerms(context, ctx.methodVocabulary);
  // "direct seeded dry" also contains "direct seeded": a named method conflicts only when
  // NONE of the named methods belongs to the farmer's own method lineage.
  if (methods.length && !methods.some((m) => mine.has(m))) return "conflict";
  const cycle = norm(ctx.cropCycle);
  const cycles = namedTerms(context, ctx.cycleVocabulary);
  if (cycles.length && cycle && cycle !== "universal" && !cycles.includes(cycle)) return "conflict";
  return methods.length || (cycles.length && cycles.includes(cycle)) ? "match" : "neutral";
}

export function selectFertilizerRow<R extends FertilizerRow>(
  rows: R[],
  ctx: FertilizerSelectionContext,
): FertilizerSelection<R> | null {
  const region = norm(ctx.regionCode);
  const landClass = normalizeFertilityClass(ctx.soilFertilityClass);
  const candidates = rows
    .filter((r) => !norm(r.region_code) || (!!region && norm(r.region_code) === region))
    .map((r) => ({ row: r, verdict: contextVerdict(r, ctx), rowClass: normalizeFertilityClass(r.soil_fertility_class) }))
    .filter((c) => c.verdict !== "conflict");
  if (!candidates.length) return null;

  const rank = (c: typeof candidates[number]) =>
    (landClass && c.rowClass === landClass ? 8 : 0) +
    (c.verdict === "match" ? 4 : 0) +
    (norm(c.row.region_code) ? 2 : 0) +
    // With no class match, prefer the row with no class or the general (medium) row over a
    // low/high-specific row: a class-specific dose is never the default.
    (!c.rowClass || c.rowClass === "medium" ? 1 : 0);
  const best = [...candidates].sort((a, b) => rank(b) - rank(a) || String(a.row.id).localeCompare(String(b.row.id)))[0];

  const gaps: string[] = [];
  const classMatched = !!landClass && best.rowClass === landClass;
  // A row written for low or high fertility is not a general recommendation.
  if (!classMatched && best.rowClass && best.rowClass !== "medium") return null;
  if (!classMatched) {
    if (!ctx.soilFertilityClass) gaps.push("fertilizer_state_recommendation_no_soil_test");
    else if (!landClass) gaps.push(`fertilizer_soil_class_unrecognised:${norm(ctx.soilFertilityClass)}`);
    else gaps.push(`fertilizer_not_adjusted_for_soil_class:${landClass}`);
  }
  if (best.verdict === "neutral" && words(best.row.cultivation_context))
    gaps.push(`fertilizer_context_unstructured:${words(best.row.cultivation_context)}`);
  return { row: best.row, basis: classMatched ? "soil_test_class_matched" : "state_recommended_dose", gaps };
}

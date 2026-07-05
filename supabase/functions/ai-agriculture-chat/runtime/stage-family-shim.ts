/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STAGE FAMILY SHIM — Step 6 collapse
 * ═══════════════════════════════════════════════════════════════════════════
 * Single source for biologically-equivalent stage families used by runtime
 * consumers (contradiction-engine, navigator-adapter, and any future
 * stage-comparator). Previously this map was hand-duplicated in TWO runtime
 * files, giving us TWO competing "stage authorities" — a direct violation of
 * the "GraphTruth is the only runtime truth source" contract.
 *
 * IMPORTANT — this module is a TEMPORARY SHIM. The authoritative source of
 * stage relationships is `crop_stage_graph` in the database. When that table
 * is wired into the runtime, this file MUST be deleted and callers switched
 * to a DB-backed reader. Do not add new stages here — add them to
 * `crop_stage_graph` and extend the reader instead.
 *
 *   [GRAPH_TRUTH_PENDING] stage-family-shim awaiting crop_stage_graph reader
 *
 * Contract:
 *   - Keys are canonical lowercase stage codes as delivered by the phenology
 *     layer (crop_stage_master).
 *   - Values list stages that are biologically equivalent to (or adjacent
 *     within a single phenological phase of) the key. Membership is symmetric
 *     but this file does NOT enforce that — callers must check both
 *     directions (`stagesEquivalent(a,b)`).
 *   - This shim MUST NOT gain new agronomic mappings. It only exists to
 *     eliminate the two duplicate copies while the DB migration lands.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const STAGE_FAMILIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  seedling:     ['seedling', 'nursery', 'germination', 'emergence', 'establishment'],
  nursery:      ['nursery', 'seedling', 'germination'],
  germination:  ['germination', 'nursery', 'seedling', 'emergence'],
  emergence:    ['emergence', 'germination', 'seedling', 'nursery'],
  establishment:['establishment', 'seedling', 'germination'],
  vegetative:   ['vegetative', 'tillering'],
  tillering:    ['tillering', 'vegetative'],
  flowering:    ['flowering', 'reproductive', 'grand_growth'],
  reproductive: ['reproductive', 'flowering', 'grand_growth'],
  grand_growth: ['grand_growth', 'flowering', 'reproductive'],
  maturity:     ['maturity', 'ripening', 'maturation'],
  ripening:     ['ripening', 'maturity', 'maturation'],
  maturation:   ['maturation', 'maturity', 'ripening'],
  harvest:      ['harvest', 'harvesting'],
});

/** Normalize any stage-like string to the canonical lowercase snake form. */
export function normalizeStageKey(s: unknown): string {
  return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Return the equivalence family for a stage (including the stage itself).
 * Unknown stages fall back to a singleton family — never invent new members.
 */
export function stageFamily(stage?: string | null): readonly string[] {
  const k = normalizeStageKey(stage);
  if (!k) return [];
  return STAGE_FAMILIES[k] || [k];
}

/**
 * Symmetric biological-equivalence check across families.
 * Empty inputs are treated as "unknown" and cannot contradict — callers
 * that need strict equality must not use this helper.
 */
export function stagesEquivalent(a: unknown, b: unknown): boolean {
  const x = normalizeStageKey(a);
  const y = normalizeStageKey(b);
  if (!x || !y) return true;
  if (x === y) return true;
  const famX = STAGE_FAMILIES[x];
  if (famX && famX.includes(y)) return true;
  const famY = STAGE_FAMILIES[y];
  if (famY && famY.includes(x)) return true;
  return false;
}

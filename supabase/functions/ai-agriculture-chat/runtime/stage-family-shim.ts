/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STAGE GRAPH READER — DB-backed replacement for the old shim
 * ═══════════════════════════════════════════════════════════════════════════
 * SSOT: `public.crop_stage_graph` joined against `public.crop_stage_master`.
 * Loaded by `utils/stage-knowledge-cache.ts` at request boot; this module
 * only READS from that cache via the `__stageKnowledgeCacheRef` global that
 * the orchestrator publishes.
 *
 * REMOVED (2026-07-08 forensic audit): the previous hardcoded
 * `STAGE_FAMILIES` map violated the "no hardcoded agri logic" contract by
 * duplicating what `crop_stage_graph` already curates in the database. That
 * map is GONE. If the DB has no entry for a `(crop, stage)`, callers get a
 * singleton family (`[stage]`) and strict equality — no TS-side substitution.
 *
 * PUBLIC API (backwards-compatible signatures):
 *   - normalizeStageKey(s)                    canonical lowercase snake form
 *   - stageFamily(stage, crop?)               DB adjacency or singleton
 *   - stagesEquivalent(a, b, crop?)           DB check or strict equality
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Normalize any stage-like string to the canonical lowercase snake form. */
export function normalizeStageKey(s: unknown): string {
  return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

interface StageKnowledgeCacheRef {
  getStageFamilyFromDB?: (
    crop: string,
    stage: string,
    cultivationMethod?: string | null,
  ) => string[] | null;
  stagesEquivalentFromDB?: (
    crop: string,
    a: string,
    b: string,
    cultivationMethod?: string | null,
  ) => boolean | null;
  getActiveCultivationMethod?: () => string | null;
}

function getCacheRef(): StageKnowledgeCacheRef | null {
  // deno-lint-ignore no-explicit-any
  const ref = (globalThis as any).__stageKnowledgeCacheRef as
    | StageKnowledgeCacheRef
    | undefined;
  return ref ?? null;
}

/**
 * Return the DB-curated stage family for a (crop, stage) — a set of stages
 * that share a phenological neighbourhood in `crop_stage_graph`.
 *
 * When `crop` is omitted OR the DB has no entry, returns a singleton
 * `[normalized]` and emits `[STAGE_GRAPH_MISS]` so curators can spot gaps in
 * `crop_stage_graph`. This function NEVER substitutes a hardcoded family.
 */
export function stageFamily(
  stage?: string | null,
  crop?: string | null,
  cultivationMethod?: string | null,
): readonly string[] {
  const k = normalizeStageKey(stage);
  if (!k) return [];
  const cropKey = normalizeStageKey(crop);
  const ref = getCacheRef();
  if (cropKey && ref?.getStageFamilyFromDB) {
    const fam = ref.getStageFamilyFromDB(cropKey, k, cultivationMethod);
    if (fam && fam.length > 0) {
      // Ensure the stage itself is included and de-duplicated.
      const out = Array.from(new Set([k, ...fam.map((s) => normalizeStageKey(s))]));
      return out;
    }
    console.log(`[STAGE_GRAPH_MISS] source=crop_stage_graph crop=${cropKey} stage=${k} action=singleton_fallback`);
  } else if (cropKey) {
    console.log(`[STAGE_GRAPH_MISS] source=cache_unavailable crop=${cropKey} stage=${k} action=singleton_fallback`);
  }
  return [k];
}

/**
 * Symmetric biological-equivalence check.
 *
 * - With `crop`: DB SSOT. True iff either family contains the other stage.
 *   Empty inputs are treated as "unknown" and return true (never contradict).
 * - Without `crop`: strict equality only (a === b, after normalization).
 *   No hardcoded family bridging.
 */
export function stagesEquivalent(
  a: unknown,
  b: unknown,
  crop?: string | null,
  cultivationMethod?: string | null,
): boolean {
  const x = normalizeStageKey(a);
  const y = normalizeStageKey(b);
  if (!x || !y) return true;
  if (x === y) return true;

  const cropKey = normalizeStageKey(crop);
  if (!cropKey) {
    // No crop context → cannot consult DB → strict equality only.
    return false;
  }
  const ref = getCacheRef();
  const result = ref?.stagesEquivalentFromDB?.(cropKey, x, y, cultivationMethod);
  if (result === true) return true;
  if (result === false) return false;
  // null → DB has no data for either side; treat as unknown-not-equivalent
  // (previously this would consult the hardcoded map — now removed).
  console.log(`[STAGE_GRAPH_MISS] source=crop_stage_graph crop=${cropKey} a=${x} b=${y} action=strict_fallback`);
  return false;
}

/**
 * @deprecated Retained ONLY as a named export for legacy imports that still
 * dereference it. Always an empty object. Use `stageFamily(stage, crop)`
 * instead. Any read on this object will now miss and force the DB lookup.
 */
export const STAGE_FAMILIES: Readonly<Record<string, readonly string[]>> = Object.freeze({});

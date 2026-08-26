/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHARED CANONICAL CROP RESOLVER (DB-SSOT)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Extracted from ai-smart-schedule/db/resolve-inputs.ts so that EVERY pipeline
 * (schedule generation AND the weather daily-derive) resolves the SAME
 * canonical crop identity through ONE lookup algorithm.
 *
 * Lookup order (all database-sourced, ZERO hardcoded translations):
 *   1. Exact match on any label column of public.crops (multilingual labels)
 *   2. public.crop_synonyms (multilingual aliases) → crops.value
 *   3. Contains match on crops labels (last resort, still DB-sourced)
 *
 * Consumers:
 *   - supabase/functions/ai-smart-schedule/db/resolve-inputs.ts
 *   - supabase/functions/weather/derive-pipeline.ts
 */

// deno-lint-ignore no-explicit-any
type Sb = any;

export interface CanonicalCropMatch {
  /** The matched public.crops row. */
  row: Record<string, unknown>;
  /** Canonical crop code (crops.value), lowercased. */
  code: string;
  /** Which lookup stage produced the match. */
  matchedVia: "crops.label_exact" | "crop_synonyms" | "crops.label_partial";
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Resolve a farmer-typed crop name (any language) to the canonical crops row.
 * Returns null when the database has no identity for the label — callers must
 * NEVER substitute a default crop.
 */
export async function resolveCropCanonical(
  supabase: Sb,
  cropName: string,
): Promise<CanonicalCropMatch | null> {
  const q = norm(cropName);
  if (!q) return null;

  // 1. Exact match on any label column in the crops SSOT
  const { data: crops } = await supabase
    .from("crops")
    .select("id, value, label, local_name, label_hi, label_mr, label_pa, label_ta, label_te, label_bn, label_gu, label_kn, label_ml, label_or, label_as, label_ur, label_sa")
    .eq("is_active", true);

  const rows = (crops || []) as Array<Record<string, unknown>>;
  const exact = rows.find((c) =>
    Object.entries(c).some(([k, v]) => k !== "id" && norm(v) === q)
  );
  if (exact) {
    return { row: exact, code: norm(exact.value), matchedVia: "crops.label_exact" };
  }

  // 2. Synonym table (multilingual aliases)
  const { data: syn } = await supabase
    .from("crop_synonyms")
    .select("*")
    .limit(2000);
  const synHit = ((syn || []) as Array<Record<string, unknown>>).find((s) =>
    Object.values(s).some((v) => typeof v === "string" && norm(v) === q)
  );
  if (synHit) {
    const code = norm(synHit.crop_code ?? "");
    const byCode = rows.find((c) => norm(c.value) === code);
    if (byCode) return { row: byCode, code, matchedVia: "crop_synonyms" };
  }

  // 3. Contains match (last resort, still DB-sourced)
  const partial = rows.find((c) =>
    Object.entries(c).some(([k, v]) => k !== "id" && typeof v === "string" && norm(v).includes(q))
  );
  if (partial) {
    return { row: partial, code: norm(partial.value), matchedVia: "crops.label_partial" };
  }

  return null;
}

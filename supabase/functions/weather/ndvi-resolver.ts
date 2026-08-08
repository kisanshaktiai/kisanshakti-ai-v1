// ============================================================================
// NDVI QUALITY RESOLVER — supabase/functions/weather/ndvi-resolver.ts
//
// Implements NDVI_QUALITY_RESOLVER@1.0 (sci_method_registry): quality-gated
// selection of a usable vegetation-index value from recent ndvi_data rows.
//
// WHY THIS EXISTS
// The previous naive read (latest row, ndvi_value ?? mean_ndvi) returned NULL
// whenever the newest scene was cloud-contaminated — which is the normal state
// of the monsoon. This resolver walks a small candidate set, applies the
// registry's quality gates, and degrades confidence for interpolation and age
// instead of failing silently.
//
// GOVERNANCE
// - Every threshold comes from the methods map (registry), never a literal.
// - The SAR fallback (KC_SAR_RVI_FALLBACK) is only signalled here; it can only
//   ACT once approved, because sci-methods.ts loads approved rows exclusively.
//
// INVARIANTS (match derive-pipeline.ts)
// - Pure function: rows in, decision out. No DB access, fully unit-testable.
// - Never fabricate: no candidate passing the gates -> null, with the caller
//   pushing a qc reason.
// ============================================================================

import type { MethodsMap } from "./agricultural-calculations.ts";

export interface NdviCandidateRow {
  ndvi_value: number | string | null;
  mean_ndvi: number | string | null;
  median_ndvi: number | string | null;
  date: string | null;
  quality_score: number | string | null;
  valid_fraction: number | string | null;
  is_interpolated: boolean | null;
  rvi_value: number | string | null;
}

export type NdviResolution =
  | {
      mode: "OPTICAL";
      ndvi: number;
      /** 0..1 normalisation used by resolveKc (same 0.2..0.8 envelope). */
      ndviRel: number;
      ageDays: number;
      sceneIso: string;
      satellite: "SENTINEL2";
      confidence: number;
      qcFlags: string[];
    }
  | {
      /** Optical unusable but SAR present within lookback. The caller may act
       *  on this ONLY if KC_SAR_RVI_FALLBACK is in the (approved-only) map. */
      mode: "SAR_PENDING";
      rvi: number;
      ndviRel: null;
      ageDays: number;
      sceneIso: string;
    };

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * NDVI_QUALITY_RESOLVER@1.0.
 * Rows must be ordered newest-first (the derive pipeline's batched query is).
 */
export function resolveNdviQuality(
  rows: NdviCandidateRow[],
  methods: MethodsMap,
): NdviResolution | null {
  const m = methods["NDVI_QUALITY_RESOLVER"];
  if (!m) return null; // registry row missing -> resolver disabled, caller flags NO_NDVI
  const p = m.params as {
    min_quality_score: number;
    min_valid_fraction: number;
    max_lookback_days: number;
    interpolated_conf_penalty: number;
    value_preference: string[];
    age_conf_floor: number;
    age_conf_horizon_days: number;
  };

  const now = Date.now();
  let sarCandidate: { rvi: number; ageDays: number; sceneIso: string } | null = null;

  for (const row of rows) {
    if (!row.date) continue;
    const sceneMs = new Date(row.date).getTime();
    if (!Number.isFinite(sceneMs)) continue;
    const ageDays = Math.floor((now - sceneMs) / 86400000);
    if (ageDays > p.max_lookback_days) break; // rows are newest-first

    // Remember the newest SAR observation regardless of optical quality.
    const rvi = num(row.rvi_value);
    if (rvi !== null && sarCandidate === null) {
      sarCandidate = { rvi, ageDays, sceneIso: new Date(sceneMs).toISOString() };
    }

    // Quality gates (either score passes).
    const q = num(row.quality_score);
    const vf = num(row.valid_fraction);
    const gatePassed = (q !== null && q >= p.min_quality_score) ||
      (vf !== null && vf >= p.min_valid_fraction);
    if (!gatePassed) continue;

    // Value preference chain from the registry (median -> mean -> point).
    let value: number | null = null;
    for (const field of p.value_preference) {
      value = num((row as Record<string, unknown>)[field]);
      if (value !== null) break;
    }
    if (value === null) continue; // cloud-null scene: exactly the bug we are fixing

    const qcFlags: string[] = [];
    let confidence = 1.0;
    if (row.is_interpolated === true) {
      confidence -= p.interpolated_conf_penalty;
      qcFlags.push("NDVI_INTERPOLATED");
    }
    // Linear age degradation to the registry floor over the horizon.
    const ageFactor = clamp(
      1 - ageDays / p.age_conf_horizon_days,
      p.age_conf_floor,
      1,
    );
    confidence = clamp(confidence * ageFactor, 0, 1);
    if (ageDays > 7) qcFlags.push("NDVI_AGED");

    return {
      mode: "OPTICAL",
      ndvi: value,
      ndviRel: clamp((value - 0.2) / (0.8 - 0.2), 0, 1),
      ageDays,
      sceneIso: new Date(sceneMs).toISOString(),
      satellite: "SENTINEL2",
      confidence,
      qcFlags,
    };
  }

  if (sarCandidate) return { mode: "SAR_PENDING", ndviRel: null, ...sarCandidate };
  return null;
}

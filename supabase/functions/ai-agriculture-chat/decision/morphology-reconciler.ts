/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MORPHOLOGY RECONCILER — Phase C
 * ═══════════════════════════════════════════════════════════════════════════
 * Pure, language-agnostic module that reconciles OBSERVED morphology
 * (NDVI, plant height, leaf count) against EXPECTED bands sourced from
 * variety_phenology_profile via resolve_crop_phenology().
 *
 * The output feeds two consumers:
 *   1. Symbolic reasoner — adds a `morphology_evidence` fact so rules can
 *      key off `stage_shift_hint` or `overall_status`.
 *   2. Hypothesis / confidence chain — supplies a bounded confidence_delta
 *      so an on-band crop nudges confidence up, and an off-band crop nudges
 *      it down without ever driving the deterministic response by itself.
 *
 * NEVER used to generate agronomic advice by itself — it is EVIDENCE, not
 * a decision. Deterministic advice still originates from decision_rules.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const MORPHOLOGY_RECONCILER_VERSION = '1.0.0';

export type BandStatus = 'BELOW' | 'IN_RANGE' | 'ABOVE' | 'UNKNOWN';
export type OverallStatus =
  | 'CONSISTENT'
  | 'MILD_DEVIATION'
  | 'MAJOR_DEVIATION'
  | 'INSUFFICIENT_DATA';
export type StageShiftHint = 'AHEAD' | 'BEHIND' | null;

export interface PhenologyExpectedBands {
  expected_height_cm_min?: number | null;
  expected_height_cm_max?: number | null;
  expected_leaf_count_min?: number | null;
  expected_leaf_count_max?: number | null;
  expected_ndvi_min?: number | null;
  expected_ndvi_max?: number | null;
  growth_stage?: string | null;
  stage_code?: string | null;
  source?: string | null;
  confidence?: number | null;
  /** Phase D — real thermal-time accumulated for the land (nullable pre-anchor). */
  current_gdd?: number | null;
  current_das?: number | null;
  /** Phase D — GDD-driven progress index (0..1) when variety gdd_target is present. */
  phenology_index?: number | null;
}

export interface ObservedMorphology {
  ndvi?: number | null;
  plant_height_cm?: number | null;
  leaf_count?: number | null;
}

export interface BandCheck {
  observed: number | null;
  expected_min: number | null;
  expected_max: number | null;
  status: BandStatus;
  /** Signed deviation from band midpoint, normalised by band half-width. */
  z_deviation: number | null;
}

export interface MorphologyEvidence {
  reconciler_version: string;
  stage_code: string | null;
  stage_source: string | null;
  ndvi: BandCheck;
  height_cm: BandCheck;
  leaf_count: BandCheck;
  overall_status: OverallStatus;
  stage_shift_hint: StageShiftHint;
  /** Bounded [-0.1, +0.1] adjustment for the ConfidenceChain. */
  confidence_delta: number;
  evidence: string[];
}

// ═══════════════════════════════════════════════════════════════════════════

function checkBand(
  observed: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  label: string,
  evidence: string[]
): BandCheck {
  const obs = typeof observed === 'number' && Number.isFinite(observed) ? observed : null;
  const lo = typeof min === 'number' && Number.isFinite(min) ? min : null;
  const hi = typeof max === 'number' && Number.isFinite(max) ? max : null;

  if (obs === null || lo === null || hi === null || hi < lo) {
    return {
      observed: obs,
      expected_min: lo,
      expected_max: hi,
      status: 'UNKNOWN',
      z_deviation: null,
    };
  }

  const mid = (lo + hi) / 2;
  const halfWidth = Math.max((hi - lo) / 2, 1e-6);
  const z = (obs - mid) / halfWidth;

  let status: BandStatus;
  if (obs < lo) status = 'BELOW';
  else if (obs > hi) status = 'ABOVE';
  else status = 'IN_RANGE';

  evidence.push(
    `${label}: observed=${obs} vs [${lo}, ${hi}] → ${status} (z=${z.toFixed(2)})`
  );

  return { observed: obs, expected_min: lo, expected_max: hi, status, z_deviation: z };
}

/**
 * Reconcile observed morphology against expected phenology bands.
 * Returns a bounded evidence packet. Pure — no I/O, no LLM.
 */
export function reconcileMorphology(
  phenology: PhenologyExpectedBands | null | undefined,
  observed: ObservedMorphology | null | undefined
): MorphologyEvidence {
  const evidence: string[] = [];
  const phen = phenology ?? {};
  const obs = observed ?? {};

  const ndviCheck = checkBand(
    obs.ndvi ?? null,
    phen.expected_ndvi_min ?? null,
    phen.expected_ndvi_max ?? null,
    'ndvi',
    evidence
  );
  const heightCheck = checkBand(
    obs.plant_height_cm ?? null,
    phen.expected_height_cm_min ?? null,
    phen.expected_height_cm_max ?? null,
    'height_cm',
    evidence
  );
  const leafCheck = checkBand(
    obs.leaf_count ?? null,
    phen.expected_leaf_count_min ?? null,
    phen.expected_leaf_count_max ?? null,
    'leaf_count',
    evidence
  );

  const checks = [ndviCheck, heightCheck, leafCheck];
  const known = checks.filter((c) => c.status !== 'UNKNOWN');

  let overall_status: OverallStatus;
  let stage_shift_hint: StageShiftHint = null;
  let confidence_delta = 0;

  if (known.length === 0) {
    overall_status = 'INSUFFICIENT_DATA';
  } else {
    const inRange = known.filter((c) => c.status === 'IN_RANGE').length;
    const below = known.filter((c) => c.status === 'BELOW').length;
    const above = known.filter((c) => c.status === 'ABOVE').length;
    const maxAbsZ = Math.max(...known.map((c) => Math.abs(c.z_deviation ?? 0)));

    if (inRange === known.length) {
      overall_status = 'CONSISTENT';
      confidence_delta = 0.05;
    } else if (maxAbsZ >= 2.5 || (below + above) >= 2) {
      overall_status = 'MAJOR_DEVIATION';
      confidence_delta = -0.1;
    } else {
      overall_status = 'MILD_DEVIATION';
      confidence_delta = -0.03;
    }

    // Stage-shift hint: consistent below → BEHIND, consistent above → AHEAD.
    if (below >= 2 && above === 0) stage_shift_hint = 'BEHIND';
    else if (above >= 2 && below === 0) stage_shift_hint = 'AHEAD';
    else if (below === 1 && above === 0 && known.length === 1 && maxAbsZ >= 1.5)
      stage_shift_hint = 'BEHIND';
    else if (above === 1 && below === 0 && known.length === 1 && maxAbsZ >= 1.5)
      stage_shift_hint = 'AHEAD';
  }

  if (stage_shift_hint) {
    evidence.push(`stage_shift_hint=${stage_shift_hint}`);
  }

  return {
    reconciler_version: MORPHOLOGY_RECONCILER_VERSION,
    stage_code: phen.stage_code ?? null,
    stage_source: phen.source ?? null,
    ndvi: ndviCheck,
    height_cm: heightCheck,
    leaf_count: leafCheck,
    overall_status,
    stage_shift_hint,
    confidence_delta,
    evidence,
  };
}

/** Convenience: pull observed morphology out of a canonicalState / observation blob. */
export function pickObservedMorphology(
  observation: any,
  canonicalState: any,
  landNdvi: number | null
): ObservedMorphology {
  const height =
    observation?.plant_height_cm ??
    observation?.measurements?.plant_height_cm ??
    canonicalState?.plant_height_cm ??
    null;
  const leaves =
    observation?.leaf_count ??
    observation?.measurements?.leaf_count ??
    canonicalState?.leaf_count ??
    null;
  return {
    ndvi: landNdvi,
    plant_height_cm: typeof height === 'number' ? height : null,
    leaf_count: typeof leaves === 'number' ? leaves : null,
  };
}

// GRAPH TRUTH — immutable per-turn agronomic node (single source of truth)

import { classifyEvidence } from './evidence-classifier.ts';
import type { CanonicalContext } from '../decision/canonical-context-contract.ts';

export type EvidenceSource = {
  readonly code: string;
  readonly authority: 'CONFIRMED' | 'INFERRED';
  readonly source: string;
};

export interface GraphContextMetadata {
  readonly crop_identified: boolean;
  readonly photo_available: boolean;
  readonly affected_part_unknown: boolean;
  readonly distribution_unknown: boolean;
  readonly action_none: boolean;
  readonly raw_metadata_codes: readonly string[];
}

export interface GraphTruth {
  readonly version: 'v1';
  readonly land_id: string | null;
  readonly crop_code: string | null;
  readonly variety_id: string | null;

  readonly biological_stage: string | null;
  readonly stage_uuid: string | null;
  readonly DAS: number | null;
  readonly GDD: number | null;

  readonly canonical_observations: readonly string[];
  readonly hypothesis_candidates: readonly string[];
  readonly evidence_sources: readonly EvidenceSource[];
  readonly context_metadata: GraphContextMetadata;
  /** Deterministic fingerprint of the locked field-twin used by the decision graph. */
  readonly decision_context_fingerprint: string | null;

  readonly locked_at: string;
  readonly hash: string;
}

export interface BuildGraphTruthInput {
  land_id: string | null;
  crop_code: string | null;
  variety_id: string | null;
  biological_stage: string | null;
  stage_uuid: string | null;
  DAS: number | null;
  GDD: number | null;
  canonical_observations: ReadonlyArray<string>;
  hypothesis_candidates?: ReadonlyArray<string>;
  evidence_sources?: ReadonlyArray<EvidenceSource>;
  /** Frozen field-twin used for decision-relevant context integrity. */
  decision_context?: CanonicalContext | null;
}

/** Sorted, deduplicated, uppercase-normalised for stable hashing. */
function canonSet(codes: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of codes) {
    if (!c) continue;
    const s = String(c).trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return out;
}

/** Deterministic short hash — FNV-1a 32-bit hex, sync, no deps. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

/**
 * Build a deterministic fingerprint from the locked field-twin.
 * Volatile lock/build timestamps are intentionally excluded.
 */
export function computeDecisionContextFingerprint(
  context: CanonicalContext | null | undefined,
): string | null {
  if (!context) return null;

  const biologicalState = context.biological_state;
  const payload = {
    land_id: context.land_id,
    farmer_id: context.farmer_id,
    crop_code: context.crop_code,
    crop_name: context.crop_name,
    growth_stage: context.growth_stage,
    days_since_sowing: context.days_since_sowing,
    ndvi: {
      value: context.ndvi?.value ?? null,
      trend: context.ndvi?.trend ?? null,
      interpretation: context.ndvi?.interpretation ?? null,
      reliability: context.ndvi?.reliability ?? null,
      observed_at: context.ndvi?.observed_at ?? null,
    },
    soil: {
      nitrogen: context.soil?.nitrogen ?? null,
      phosphorus: context.soil?.phosphorus ?? null,
      potassium: context.soil?.potassium ?? null,
      ph: context.soil?.ph ?? null,
      type: context.soil?.type ?? null,
      organic_carbon_percent: context.soil?.organic_carbon_percent ?? null,
      moisture_status: context.soil?.moisture_status ?? null,
      confidence: context.soil?.confidence ?? null,
    },
    weather: {
      temperature: context.weather?.temperature ?? null,
      humidity: context.weather?.humidity ?? null,
      rainfall_mm: context.weather?.rainfall_mm ?? null,
      rainfall_after_sowing_mm: context.weather?.rainfall_after_sowing_mm ?? null,
      forecast_7d: context.weather?.forecast_7d ?? null,
    },
    sowing_date: context.sowing_date ?? null,
    transplant_date: context.transplant_date ?? null,
    expected_harvest_date: context.expected_harvest_date ?? null,
    crop_cycle: context.crop_cycle ?? null,
    variety_id: context.variety_id ?? null,
    crop_variety: context.crop_variety ?? null,
    cultivation_method: context.cultivation_method ?? null,
    biological_state: biologicalState
      ? {
          crop_code: biologicalState.crop_code ?? null,
          crop_variety: biologicalState.crop_variety ?? null,
          cultivation_method: biologicalState.cultivation_method ?? null,
          growth_stage: biologicalState.growth_stage ?? null,
          stage_code: biologicalState.stage_code ?? null,
          stage_uuid: biologicalState.stage_uuid ?? null,
          resolved_stage: biologicalState.resolved_stage ?? null,
          stage_source: biologicalState.stage_source ?? null,
          das: biologicalState.das ?? null,
          dat: biologicalState.dat ?? null,
          gdd_accumulated: biologicalState.gdd_accumulated ?? null,
          sowing_date: biologicalState.sowing_date ?? null,
          confidence: biologicalState.confidence ?? null,
          source: biologicalState.source ?? null,
          resolver_version: biologicalState.resolver_version ?? null,
          predicted_stage_confidence: biologicalState.predicted_stage_confidence ?? null,
          authority: biologicalState.authority ?? null,
          confirmation: biologicalState.confirmation ?? null,
          evidence_conflicts: biologicalState.evidence_conflicts ?? [],
          evidence_sources: biologicalState.evidence_sources ?? [],
        }
      : null,
    water: {
      irrigation_source: context.water?.irrigation_source ?? null,
      water_source: context.water?.water_source ?? null,
      irrigation_type: context.water?.irrigation_type ?? null,
    },
    geo: {
      village: context.geo?.village ?? null,
      taluka: context.geo?.taluka ?? null,
      district: context.geo?.district ?? null,
      state: context.geo?.state ?? null,
      gps_lat: context.geo?.gps_lat ?? null,
      gps_lng: context.geo?.gps_lng ?? null,
      elevation: context.geo?.elevation ?? null,
      slope: context.geo?.slope ?? null,
    },
    area_acres: context.area_acres ?? null,
    sources: context.sources ?? null,
  };
  return fnv1a(JSON.stringify(payload));
}

export function computeGraphHash(input: {
  land_id?: string | null;
  crop_code: string | null;
  variety_id?: string | null;
  stage_uuid: string | null;
  biological_stage: string | null;
  DAS: number | null;
  GDD?: number | null;
  canonical_observations: ReadonlyArray<string>;
  hypothesis_candidates?: ReadonlyArray<string>;
  evidence_sources?: ReadonlyArray<EvidenceSource>;
  decision_context_fingerprint?: string | null;
}): string {
  const payload = JSON.stringify({
    land_id: input.land_id ?? null,
    crop: (input.crop_code ?? '').toLowerCase(),
    variety_id: input.variety_id ?? null,
    stage_uuid: input.stage_uuid ?? '',
    stage: (input.biological_stage ?? '').toLowerCase(),
    das: typeof input.DAS === 'number' ? input.DAS : null,
    gdd: typeof input.GDD === 'number' ? input.GDD : null,
    obs: canonSet(input.canonical_observations),
    hypothesis_candidates: canonSet(input.hypothesis_candidates ?? []),
    evidence_sources: (input.evidence_sources ?? [])
      .filter((e) => e?.code)
      .map((e) => ({
        code: String(e.code),
        authority: e.authority,
        source: e.source,
      }))
      .sort((a, b) => a.code.toLowerCase().localeCompare(b.code.toLowerCase())),
    decision_context_fingerprint: input.decision_context_fingerprint ?? null,
  });
  return fnv1a(payload);
}

export function buildGraphTruth(input: BuildGraphTruthInput): GraphTruth {
  // ── Split raw input into real observations vs context metadata ────────
  const classified = classifyEvidence(input.canonical_observations ?? []);
  const stripped = classified.ignored_codes;
  for (const md of stripped) {
    console.warn(
      `[INVALID_GRAPH_OBSERVATION] code=${md} source=graph_truth_input reason=metadata_not_observation`,
    );
  }

  const canonical_observations = Object.freeze(canonSet(classified.real_codes));
  const hypothesis_candidates = Object.freeze(canonSet(input.hypothesis_candidates ?? []));

  // Filter evidence_sources ledger to real observations only (defense in depth).
  const realSet = new Set(canonical_observations.map((c) => c.toLowerCase()));
  const evidence_sources = Object.freeze(
    (input.evidence_sources ?? [])
      .filter((e) => e?.code && realSet.has(String(e.code).toLowerCase()))
      .map((e) => Object.freeze({ ...e })),
  );

  const strippedUpper = stripped.map((c) => c.toUpperCase());
  const context_metadata: GraphContextMetadata = Object.freeze({
    crop_identified: strippedUpper.includes('CROP_IDENTIFIED'),
    photo_available: !strippedUpper.includes('PHOTO_NOT_PROVIDED'),
    affected_part_unknown: strippedUpper.includes('AFFECTED_PART_UNKNOWN'),
    distribution_unknown: strippedUpper.includes('DISTRIBUTION_UNKNOWN'),
    action_none: strippedUpper.includes('ACTION_NONE'),
    raw_metadata_codes: Object.freeze([...stripped]),
  });

  const decision_context_fingerprint = computeDecisionContextFingerprint(input.decision_context);

  const hash = computeGraphHash({
    land_id: input.land_id,
    crop_code: input.crop_code,
    variety_id: input.variety_id,
    stage_uuid: input.stage_uuid,
    biological_stage: input.biological_stage,
    DAS: input.DAS,
    GDD: input.GDD,
    canonical_observations,
    hypothesis_candidates,
    evidence_sources,
    decision_context_fingerprint,
  });

  const truth: GraphTruth = {
    version: 'v1',
    land_id: input.land_id,
    crop_code: input.crop_code,
    variety_id: input.variety_id,
    biological_stage: input.biological_stage,
    stage_uuid: input.stage_uuid,
    DAS: input.DAS,
    GDD: input.GDD,
    canonical_observations,
    hypothesis_candidates,
    evidence_sources,
    context_metadata,
    decision_context_fingerprint,
    locked_at: new Date().toISOString(),
    hash,
  };

  try {
    console.log(
      `[CANONICAL_PROJECTION_ONLY] site=graph_truth_build kept=${canonical_observations.length} stripped=${stripped.length} stripped_codes=[${stripped.join(',')}]`,
    );
    console.log(
      `[GRAPH_TRUTH_BUILT] hash=${hash} crop=${truth.crop_code ?? 'null'} ` +
        `stage=${truth.biological_stage ?? 'null'} das=${truth.DAS ?? 'null'} ` +
        `obs=[${canonical_observations.join(',')}] metadata=${JSON.stringify(context_metadata)}`,
    );
  } catch { /* trace must not throw */ }

  return Object.freeze(truth);
}


// Validate that authoritative fields didn't drift between two snapshots.
export function validateGraphTruth(
  before: GraphTruth,
  after: GraphTruth,
  callsite: string,
): string[] {
  const violations: string[] = [];
  const check = (field: string, a: unknown, b: unknown) => {
    if (a !== b) {
      violations.push(field);
      console.warn(
        `[GRAPH_CONTRACT_VIOLATION] field=${field} before=${String(a)} after=${String(b)} callsite=${callsite}`,
      );
    }
  };
  check('crop_code', before.crop_code, after.crop_code);
  check('variety_id', before.variety_id, after.variety_id);
  check('biological_stage', before.biological_stage, after.biological_stage);
  check('stage_uuid', before.stage_uuid, after.stage_uuid);
  check('DAS', before.DAS, after.DAS);
  check('GDD', before.GDD, after.GDD);
  check('decision_context_fingerprint', before.decision_context_fingerprint, after.decision_context_fingerprint);
  check('hash', before.hash, after.hash);
  return violations;
}

// Integrity check for a single GraphTruth instance.
export function assertGraphTruthIntegrity(
  gt: GraphTruth | null | undefined,
  callsite: string,
): boolean {
  if (!gt) {
    console.warn(`[GRAPH_VALIDATED] site=${callsite} hash_match=skip reason=no_graph_truth`);
    return false;
  }
  const recomputed = computeGraphHash({
    land_id: gt.land_id,
    crop_code: gt.crop_code,
    variety_id: gt.variety_id,
    stage_uuid: gt.stage_uuid,
    biological_stage: gt.biological_stage,
    DAS: gt.DAS,
    GDD: gt.GDD,
    canonical_observations: gt.canonical_observations,
    hypothesis_candidates: gt.hypothesis_candidates,
    evidence_sources: gt.evidence_sources,
    decision_context_fingerprint: gt.decision_context_fingerprint,
  });
  const ok = recomputed === gt.hash;
  if (ok) {
    console.log(
      `[GRAPH_VALIDATED] site=${callsite} hash_match=true hash=${gt.hash} ` +
        `crop=${gt.crop_code ?? 'null'} stage=${gt.biological_stage ?? 'null'} ` +
        `das=${gt.DAS ?? 'null'} obs=${gt.canonical_observations.length}`,
    );
  } else {
    const message =
      `[GRAPH_CONTRACT_VIOLATION] site=${callsite} hash_match=false ` +
      `stored=${gt.hash} recomputed=${recomputed} ` +
      `crop=${gt.crop_code} stage=${gt.biological_stage} das=${gt.DAS} gdd=${gt.GDD} ` +
      `context_fp=${gt.decision_context_fingerprint ?? 'null'} ` +
      `obs=[${gt.canonical_observations.join(',')}]`;
    console.error(message);
    throw new Error(message);
  }
  return ok;
}


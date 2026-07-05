/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH TRUTH — immutable per-turn agronomic node (single source of truth)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Built EXACTLY ONCE per turn, after the observation evidence lock. Every
 * downstream stage (hypothesis engine, rule engine, response builder) reads
 * from this object and MUST NOT mutate any field.
 *
 * Determinism contract:
 *   two agronomically identical queries against the same land MUST produce
 *   the same `hash`. If they don't, the divergence detector fires.
 *
 * Authority sources (asserted at build time, never inferred from farmer text):
 *   crop_code / variety_id ⇐ landContext (fetchComprehensiveLandContext)
 *   biological_stage / stage_uuid / DAS / GDD ⇐ BiologicalState
 *   canonical_observations ⇐ observation ontology (bridge + IOM peers)
 *   hypothesis_candidates ⇐ hypothesis engine (attached later, then re-frozen)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { classifyEvidence } from './evidence-classifier.ts';

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

export function computeGraphHash(input: {
  crop_code: string | null;
  stage_uuid: string | null;
  biological_stage: string | null;
  DAS: number | null;
  canonical_observations: ReadonlyArray<string>;
}): string {
  const payload = JSON.stringify({
    crop: (input.crop_code ?? '').toLowerCase(),
    stage_uuid: input.stage_uuid ?? '',
    stage: (input.biological_stage ?? '').toLowerCase(),
    das: typeof input.DAS === 'number' ? input.DAS : null,
    obs: canonSet(input.canonical_observations),
  });
  return fnv1a(payload);
}

export function buildGraphTruth(input: BuildGraphTruthInput): GraphTruth {
  // ── Split raw input into real observations vs context metadata ────────
  // Metadata (CROP_IDENTIFIED, PHOTO_NOT_PROVIDED, ACTION_NONE, *_UNKNOWN,
  // CONTEXT_*, etc.) MUST NEVER enter canonical_observations. It is
  // captured separately so the response builder can still see farmer
  // context without corrupting the reasoning graph.
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

  const hash = computeGraphHash({
    crop_code: input.crop_code,
    stage_uuid: input.stage_uuid,
    biological_stage: input.biological_stage,
    DAS: input.DAS,
    canonical_observations,
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


/**
 * Validate that authoritative fields didn't drift between two snapshots.
 * Emits [GRAPH_CONTRACT_VIOLATION] and returns list of violations. Never
 * mutates or silent-repairs.
 */
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
  check('hash', before.hash, after.hash);
  return violations;
}

/**
 * Integrity check for a single GraphTruth instance.
 * Recomputes hash from current fields and compares to the stored `.hash`.
 * Called before every downstream stage (hypothesis, IOM gate, rule engine,
 * response builder) to prove no upstream code mutated an authoritative
 * field after lock.
 *
 * Emits [GRAPH_VALIDATED] on success, [GRAPH_CONTRACT_VIOLATION] on drift.
 * Never throws — the caller decides how to react.
 */
export function assertGraphTruthIntegrity(
  gt: GraphTruth | null | undefined,
  callsite: string,
): boolean {
  if (!gt) {
    console.warn(`[GRAPH_VALIDATED] site=${callsite} hash_match=skip reason=no_graph_truth`);
    return false;
  }
  const recomputed = computeGraphHash({
    crop_code: gt.crop_code,
    stage_uuid: gt.stage_uuid,
    biological_stage: gt.biological_stage,
    DAS: gt.DAS,
    canonical_observations: gt.canonical_observations,
  });
  const ok = recomputed === gt.hash;
  if (ok) {
    console.log(
      `[GRAPH_VALIDATED] site=${callsite} hash_match=true hash=${gt.hash} ` +
        `crop=${gt.crop_code ?? 'null'} stage=${gt.biological_stage ?? 'null'} ` +
        `das=${gt.DAS ?? 'null'} obs=${gt.canonical_observations.length}`,
    );
  } else {
    console.warn(
      `[GRAPH_CONTRACT_VIOLATION] site=${callsite} hash_match=false ` +
        `stored=${gt.hash} recomputed=${recomputed} ` +
        `crop=${gt.crop_code} stage=${gt.biological_stage} das=${gt.DAS} ` +
        `obs=[${gt.canonical_observations.join(',')}]`,
    );
  }
  return ok;
}


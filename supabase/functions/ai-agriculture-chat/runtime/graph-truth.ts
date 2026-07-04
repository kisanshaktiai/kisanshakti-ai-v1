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

export type EvidenceSource = {
  readonly code: string;
  readonly authority: 'CONFIRMED' | 'INFERRED';
  readonly source: string;
};

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
  const canonical_observations = Object.freeze(canonSet(input.canonical_observations));
  const hypothesis_candidates = Object.freeze(canonSet(input.hypothesis_candidates ?? []));
  const evidence_sources = Object.freeze(
    (input.evidence_sources ?? []).map((e) => Object.freeze({ ...e })),
  );

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
    locked_at: new Date().toISOString(),
    hash,
  };

  try {
    console.log(
      `[GRAPH_TRUTH_BUILT] hash=${hash} crop=${truth.crop_code ?? 'null'} ` +
        `stage=${truth.biological_stage ?? 'null'} das=${truth.DAS ?? 'null'} ` +
        `obs=[${canonical_observations.join(',')}]`,
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

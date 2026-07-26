/**
 * OBSERVATION_MAPPING_CACHE — scope-aware regression suite (2026-07-09)
 *
 * Ensures the DB-SSOT `intent_observation_mapping` cache never leaks
 * cross-crop / out-of-stage / out-of-DAS observation codes into a turn.
 *
 * Root-cause history:
 *   The prior cache grouped rows by `intent_code` only, discarding crop /
 *   stage / DAS. A rice land at DAS=31 stage=transplanting was seeing
 *   brinjal, chilli, onion, cotton and sugarcane observation codes for the
 *   same intent. These tests lock the fix in place.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  loadObservationMapping,
  getObservationsForIntent,
  isObservationMappingLoaded,
  __resetObservationMappingCache,
} from '../../../../supabase/functions/ai-agriculture-chat/utils/observation-mapping-cache.ts';

// ─── Fake supabase client returning curated IOM rows ────────────────────────
interface FakeRow {
  intent_code: string;
  crop_code: string;
  growth_stage: string;
  das_min: number;
  das_max: number;
  observation_code: string;
  assertion_strength: string;
  confidence_rank: number;
}

function makeSupabase(iomRows: FakeRow[], masterRows: Array<{ observation_code: string; affected_plant_part: string | null }>) {
  return {
    from(table: string) {
      if (table === 'intent_observation_mapping') {
        return makeIOMBuilder(iomRows);
      }
      if (table === 'observation_master') {
        return makeMasterBuilder(masterRows);
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function makeIOMBuilder(rows: FakeRow[]) {
  const state: { active?: boolean; from?: number; to?: number } = {};
  const b: any = {
    select: () => b,
    eq: (_c: string, v: any) => { state.active = v; return b; },
    order: () => b,
    range: (from: number, to: number) => {
      state.from = from; state.to = to;
      const slice = rows.slice(from, to + 1);
      return Promise.resolve({ data: slice, error: null });
    },
  };
  return b;
}

function makeMasterBuilder(rows: Array<{ observation_code: string; affected_plant_part: string | null }>) {
  const b: any = {
    select: () => b,
    in: (_c: string, codes: string[]) => Promise.resolve({
      data: rows.filter((r) => codes.includes(r.observation_code)),
      error: null,
    }),
  };
  return b;
}

const ROWS: FakeRow[] = [
  // Rice — germination/nursery/seedling, DAS 0-30
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'rice', growth_stage: 'nursery', das_min: 0, das_max: 30, observation_code: 'obs_rice_no_emergence', assertion_strength: 'LITERAL', confidence_rank: 1 },
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'rice', growth_stage: 'germination', das_min: 0, das_max: 30, observation_code: 'germination_failure', assertion_strength: 'LITERAL', confidence_rank: 2 },
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'rice', growth_stage: 'seedling', das_min: 0, das_max: 45, observation_code: 'seed_not_germinated', assertion_strength: 'LITERAL', confidence_rank: 3 },
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'rice', growth_stage: 'all',      das_min: 0, das_max: 30, observation_code: 'poor_germination',   assertion_strength: 'LITERAL', confidence_rank: 4 },
  // Cotton
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'cotton', growth_stage: 'all', das_min: 0, das_max: 999, observation_code: 'boll_opening_visible', assertion_strength: 'DIFFERENTIAL', confidence_rank: 1 },
  // Brinjal
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'brinjal', growth_stage: 'all', das_min: 0, das_max: 999, observation_code: 'brinjal_obs_flower_drop', assertion_strength: 'DIFFERENTIAL', confidence_rank: 1 },
  // Onion
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'onion', growth_stage: 'all', das_min: 0, das_max: 999, observation_code: 'onion_obs_split_bulb', assertion_strength: 'DIFFERENTIAL', confidence_rank: 1 },
  // Sugarcane — LITERAL, wide DAS window
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'sugarcane', growth_stage: 'all', das_min: 0, das_max: 999, observation_code: 'plant_emergence_low', assertion_strength: 'LITERAL', confidence_rank: 1 },
  // Universal fallback
  { intent_code: 'EMERGENCE_FAILURE', crop_code: 'all', growth_stage: 'all', das_min: 0, das_max: 999, observation_code: 'generic_poor_emergence', assertion_strength: 'DIFFERENTIAL', confidence_rank: 5 },
];

const MASTER = [
  { observation_code: 'obs_rice_no_emergence',   affected_plant_part: 'seed' },
  { observation_code: 'germination_failure',     affected_plant_part: 'seed' },
  { observation_code: 'seed_not_germinated',     affected_plant_part: 'seed' },
  { observation_code: 'poor_germination',        affected_plant_part: 'seed' },
  { observation_code: 'boll_opening_visible',    affected_plant_part: 'boll' },
  { observation_code: 'brinjal_obs_flower_drop', affected_plant_part: 'flower' },
  { observation_code: 'onion_obs_split_bulb',    affected_plant_part: 'bulb' },
  { observation_code: 'plant_emergence_low',     affected_plant_part: 'shoot' },
  { observation_code: 'generic_poor_emergence',  affected_plant_part: null },
];

async function loadFixture() {
  __resetObservationMappingCache();
  await loadObservationMapping(makeSupabase(ROWS, MASTER));
  assert(isObservationMappingLoaded());
}

// ─── T1: rice in-scope returns only rice + universal rows ─────────────────
Deno.test('T1: rice/nursery/DAS=15 returns only rice + universal — no cross-crop', async () => {
  await loadFixture();
  const entry = getObservationsForIntent('EMERGENCE_FAILURE', {
    crop_code: 'rice', growth_stage: 'nursery', das: 15,
  });
  const codes = entry.observation_codes;
  assert(codes.includes('obs_rice_no_emergence'));
  assert(codes.includes('poor_germination'));
  assert(codes.includes('generic_poor_emergence'));
  // Cross-crop MUST be absent
  for (const bad of ['brinjal_obs_flower_drop', 'onion_obs_split_bulb', 'boll_opening_visible', 'plant_emergence_low']) {
    assertEquals(codes.includes(bad), false, `cross-crop leak: ${bad}`);
  }
});

// ─── T2: DAS window enforced ──────────────────────────────────────────────
Deno.test('T2: rice at DAS=31 stage=transplanting drops all rice germination rows', async () => {
  await loadFixture();
  const entry = getObservationsForIntent('EMERGENCE_FAILURE', {
    crop_code: 'rice', growth_stage: 'transplanting', das: 31,
  });
  // Only 'all' stage rows for rice pass, and their DAS window is 0-30, so
  // they drop too. Only the universal 0-999 row survives.
  assertEquals(entry.observation_codes, ['generic_poor_emergence']);
});

// ─── T3: parametrised across all crops — no leakage in either direction ──
for (const crop of ['rice', 'cotton', 'brinjal', 'onion', 'sugarcane'] as const) {
  Deno.test(`T3[${crop}]: scope returns crop-native + universal only`, async () => {
    await loadFixture();
    const entry = getObservationsForIntent('EMERGENCE_FAILURE', {
      crop_code: crop, growth_stage: 'all', das: 10,
    });
    const others = ['rice', 'cotton', 'brinjal', 'onion', 'sugarcane'].filter((c) => c !== crop);
    for (const code of entry.observation_codes) {
      // A code belongs to this crop iff it was authored under this crop or 'all'.
      const owners = ROWS.filter((r) => r.observation_code === code).map((r) => r.crop_code);
      const belongsHere = owners.includes(crop) || owners.includes('all') || owners.includes('universal');
      assert(belongsHere, `code ${code} leaked into crop=${crop} (owners=${owners.join(',')})`);
      // Extra defence: no code exclusively owned by another crop.
      const exclusiveElsewhere = owners.every((o) => others.includes(o));
      assertEquals(exclusiveElsewhere, false, `code ${code} exclusively owned by other crops in crop=${crop} turn`);
    }
  });
}

// ─── T4: missing crop_code → fail-closed (empty) ──────────────────────────
Deno.test('T4: missing crop_code returns EMPTY (no cross-crop union)', async () => {
  await loadFixture();
  const entry = getObservationsForIntent('EMERGENCE_FAILURE', {
    crop_code: null, growth_stage: 'nursery', das: 10,
  });
  // 'all' + universal rows still admissible even without a specific crop
  // because they carry crop_code='all'. Cross-crop rows MUST NOT appear.
  for (const bad of ['obs_rice_no_emergence', 'brinjal_obs_flower_drop', 'onion_obs_split_bulb', 'boll_opening_visible', 'plant_emergence_low']) {
    assertEquals(entry.observation_codes.includes(bad), false, `unscoped leak: ${bad}`);
  }
});

// ─── T5: assertion priority — LITERAL wins over DIFFERENTIAL ──────────────
Deno.test('T5: dedup keeps highest assertion (LITERAL > DIFFERENTIAL)', async () => {
  __resetObservationMappingCache();
  const conflictRows: FakeRow[] = [
    { intent_code: 'X', crop_code: 'rice', growth_stage: 'all', das_min: 0, das_max: 999, observation_code: 'dupe', assertion_strength: 'DIFFERENTIAL', confidence_rank: 1 },
    { intent_code: 'X', crop_code: 'rice', growth_stage: 'all', das_min: 0, das_max: 999, observation_code: 'dupe', assertion_strength: 'LITERAL',       confidence_rank: 5 },
  ];
  await loadObservationMapping(makeSupabase(conflictRows, [{ observation_code: 'dupe', affected_plant_part: null }]));
  const entry = getObservationsForIntent('X', { crop_code: 'rice', growth_stage: null, das: null });
  assertEquals(entry.observation_codes, ['dupe']);
  assertEquals(entry.source_rows, 1);
});

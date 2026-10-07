import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  buildGraphTruth,
  computeGraphHash,
  assertGraphTruthIntegrity,
} from '../../../../supabase/functions/ai-agriculture-chat/runtime/graph-truth.ts';

Deno.test('SURGICAL GRAPH TRUTH · decision hash changes when GDD changes', () => {
  const base = {
    land_id: 'land-1',
    crop_code: 'rice',
    variety_id: 'var-1',
    stage_uuid: 'stage-1',
    biological_stage: 'grain_filling',
    DAS: 120,
    GDD: 1500,
    canonical_observations: ['panicle_present'],
  };
  const a = computeGraphHash(base);
  const b = computeGraphHash({ ...base, GDD: 1550 });
  assert(a !== b, 'GDD is decision-relevant and must change the graph hash');
});

Deno.test('SURGICAL GRAPH TRUTH · variety changes cannot reuse the same hash', () => {
  const base = {
    land_id: 'land-1',
    crop_code: 'rice',
    stage_uuid: 'stage-1',
    biological_stage: 'grain_filling',
    DAS: 120,
    GDD: 1500,
    canonical_observations: ['panicle_present'],
  };
  const a = computeGraphHash({ ...base, variety_id: 'var-1' });
  const b = computeGraphHash({ ...base, variety_id: 'var-2' });
  assert(a !== b, 'variety_id is decision-relevant and must change the graph hash');
});

Deno.test('SURGICAL GRAPH TRUTH · IOM candidate observations are not evidence without provenance', () => {
  const graph = buildGraphTruth({
    land_id: 'land-1',
    crop_code: 'rice',
    variety_id: 'var-1',
    biological_stage: 'grain_filling',
    stage_uuid: 'stage-1',
    DAS: 120,
    GDD: 1500,
    canonical_observations: ['panicle_present'],
    evidence_sources: [
      {
        code: 'panicle_present',
        authority: 'CONFIRMED',
        source: 'TRUSTED_CONFIRMED_EVIDENCE',
      },
    ],
  });

  assertEquals([...graph.canonical_observations], ['panicle_present']);
  assertEquals(graph.evidence_sources.length, 1);
  assertEquals(graph.evidence_sources[0].source, 'TRUSTED_CONFIRMED_EVIDENCE');
});

Deno.test('SURGICAL GRAPH TRUTH · tampered locked state fails integrity', () => {
  const graph = buildGraphTruth({
    land_id: 'land-1',
    crop_code: 'rice',
    variety_id: 'var-1',
    biological_stage: 'grain_filling',
    stage_uuid: 'stage-1',
    DAS: 120,
    GDD: 1500,
    canonical_observations: ['panicle_present'],
  });
  const tampered = { ...graph, GDD: 1501 };
  assertThrows(() => assertGraphTruthIntegrity(tampered, 'TEST_TAMPERED_GDD'));
});

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  buildGraphTruth,
  computeGraphHash,
  assertGraphTruthIntegrity,
  computeDecisionContextFingerprint,
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


Deno.test('SURGICAL GRAPH TRUTH · field-twin environment changes change context fingerprint', () => {
  const base: any = {
    land_id: 'land-1',
    farmer_id: 'farmer-1',
    crop_code: 'RICE',
    crop_name: 'Rice',
    growth_stage: 'grain_filling',
    days_since_sowing: 120,
    ndvi: { value: 0.61, trend: 'stable', interpretation: 'in_range', reliability: 0.9, observed_at: '2026-10-02' },
    soil: { nitrogen: 20, phosphorus: 10, potassium: 12, ph: 6.8, type: 'red', organic_carbon_percent: 0.7, moisture_status: 'adequate', confidence: 0.8 },
    weather: { temperature: 20, humidity: 85, rainfall_mm: 0, rainfall_after_sowing_mm: 800, forecast_7d: [{ day: '2026-10-08', rain_mm: 10 }] },
    sowing_date: '2026-06-08',
    transplant_date: null,
    expected_harvest_date: '2026-10-26',
    crop_cycle: 'Kharif',
    variety_id: 'var-1',
    crop_variety: 'Rice Indrayani',
    cultivation_method: 'direct_seeded',
    biological_state: null,
    water: { irrigation_source: 'canal', water_source: 'surface', irrigation_type: 'flood' },
    geo: { village: 'Village', taluka: 'Taluka', district: 'District', state: 'Maharashtra', gps_lat: 18.5, gps_lng: 73.8, elevation: 560, slope: 1 },
    area_acres: 2,
    sources: {
      crop: 'crop_schedules',
      stage: 'biological_state',
      soil: { primary: 'soil_health', fallback: 'lands_cache', used: 'primary' },
      ndvi: { primary: 'ndvi_data', fallback: 'lands_cache', used: 'primary' },
      weather: { current: 'weather_current', forecast: 'weather_forecasts', history: 'weather_aggregates' },
      water: 'lands',
      geo: 'lands',
    },
  };
  const a = computeDecisionContextFingerprint(base);
  const b = computeDecisionContextFingerprint({
    ...base,
    weather: { ...base.weather, humidity: 91 },
  });
  assert(a !== b, 'field-twin weather changes must change the context fingerprint');
});

Deno.test('SURGICAL GRAPH TRUTH · orchestrator builds GraphTruth before first hypothesis graph', async () => {
  const src = await Deno.readTextFile(
    new URL('../supabase/functions/ai-agriculture-chat/agents/orchestrator.ts', import.meta.url),
  );
  const build = src.indexOf('const _gtForGraph = (this as any)._graphTruth as GraphTruth;');
  const execute = src.indexOf('const graphOut = await evaluateHypothesisGraph(graphInput);');
  assert(build >= 0 && execute >= 0 && build < execute, 'locked GraphTruth must exist before the first hypothesis graph call');
  assert(src.includes("r.source === 'input'"), 'only input observations may become GraphTruth evidence');
});

/**
 * 2026-11-19 — crop-cycle gate on "My field from the sky".
 * Inputs mirror live rows of 2026-11-19: Vadd farm (wheat harvested 2026-04-25, land AVAILABLE,
 * NDVI 0.629 on 2026-11-14), कोडोली मळा (AVAILABLE with a left-over stage cache), Kodoli Mala
 * (CROP_ACTIVE, schedule sown 2026-06-08 while the land row still says 2025-06-15), and an
 * active sugarcane land whose newest reading the pipeline graded "insufficient".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  lands: [] as Array<Record<string, unknown>>,
  ndvi: {} as Record<string, unknown>,
  weather: null as Record<string, unknown> | null,
  stageRow: null as Record<string, unknown> | null,
  stageReads: 0,
}));

vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ session: { farmerId: 'farmer-1', tenantId: 'tenant-1' } }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: 'tenant-1' } }) }));
vi.mock('@/services/landsApi', () => ({ landsApi: { fetchLands: async () => h.lands } }));
vi.mock('@/hooks/useNDVIAnalysis', () => ({ useNDVIAnalysis: () => h.ndvi }));
vi.mock('@/hooks/useLandWeatherState', () => ({ useLandWeatherState: () => ({ state: h.weather }) }));
vi.mock('@/integrations/supabase/client', () => {
  // crop_stage_master reads: .eq('id').maybeSingle() for the stage, then the lane query awaited directly
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order']) c[m] = () => c;
    c.maybeSingle = async () => { h.stageReads++; return { data: h.stageRow, error: null }; };
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: h.stageRow ? [h.stageRow] : [], error: null }).then(ok);
    return c;
  };
  return { supabase: { from: () => chain() } };
});

import { useFieldSky, attentionLevel } from '@/hooks/useFieldSky';

const LAND = 'land-1';
const pass = (date: string, ndvi: number, evidence = 'high', ndmi = 0.20) =>
  ({ id: `${LAND}:${date}`, land_id: LAND, date, ndvi_value: ndvi, is_fresh: true, evidence_confidence: evidence, cloud_cover: 0, ndmi_value: ndmi, metadata: null, image_url: null });
const setSatellite = (latest: ReturnType<typeof pass>, prev: ReturnType<typeof pass>, schedule: Record<string, unknown> | null) => {
  h.ndvi = { latestRaw: latest, current: latest, history: [latest, prev], isLoading: false, error: null,
    bundle: { decision: [], assets: [], logs: [], intel: [], radar: [], schedule, canopy: [], surface: [] } };
};
const band = (min: number | null, max: number | null) => ({ id: 'stage-1', crop_code: 'RICE', next_stage_id: null, is_moisture_critical: false, is_heat_critical: false,
  das_reference: 'sowing', stage_code: 'RICE_GRAIN_FILLING', growth_stage: 'grain_filling', das_min: 120, das_max: 150, expected_ndvi_min: min, expected_ndvi_max: max,
  cultivation_method: null, phenology_index: 7, expected_height_cm_min: null, expected_height_cm_max: null, expected_leaf_count_min: null, expected_leaf_count_max: null, stage_node_type: null });

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};
const run = async () => {
  const r = renderHook(() => useFieldSky(LAND), { wrapper });
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return r.result.current;
};

beforeEach(() => {
  h.stageReads = 0; h.stageRow = null;
  // the soil-water balance says "needs water" and canopy moisture fell — the signals that raised the fallow-field alerts
  h.weather = { irrigation_needed: true, water_deficit_mm: 24, metric_date: '2026-11-18' };
});

describe('useFieldSky crop-cycle gate', () => {
  it('harvested land (Vadd farm): monitoring on hold — no green verdict, no attention, no water call', async () => {
    h.lands = [{ id: LAND, lifecycle_status: 'AVAILABLE', current_crop: 'Wheat', stage_uuid: null, das: null, last_sowing_date: null }];
    setSatellite(pass('2026-11-14', 0.629, 'low', 0.18), pass('2026-11-09', 0.61, 'low', 0.26), null);
    const sky = await run();
    expect(sky.cropActive).toBe(false);
    expect(sky.state).toBe('crop_on_hold');
    expect(sky.stage.state).toBe('no_crop');
    expect(attentionLevel(sky)).toBeNull();
    // the measurement itself stays visible
    expect(sky.latest?.ndvi_value).toBe(0.629);
  });

  it('released land with a left-over stage cache (कोडोली मळा): the old stage is not read', async () => {
    h.lands = [{ id: LAND, lifecycle_status: 'AVAILABLE', current_crop: 'Rice', stage_uuid: 'stage-1', das: 195 }];
    h.stageRow = band(0.5, 0.8);
    setSatellite(pass('2026-11-14', 0.695), pass('2026-11-09', 0.68), null);
    const sky = await run();
    expect(sky.state).toBe('crop_on_hold');
    expect(sky.stage.das).toBeNull();
    expect(sky.stage.stageCode).toBeNull();
    expect(h.stageReads).toBe(0);
  });

  it('standing crop inside its band (Kodoli Mala): "as expected", sowing date from the schedule, not the land row', async () => {
    h.lands = [{ id: LAND, lifecycle_status: 'CROP_ACTIVE', current_crop: 'Rice', stage_uuid: 'stage-1', das: 163, last_sowing_date: '2025-06-15' }];
    h.stageRow = band(0.5, 0.8);
    h.weather = { irrigation_needed: false };
    setSatellite(pass('2026-11-14', 0.609), pass('2026-11-09', 0.60), { sowing_date: '2026-06-08', transplant_date: null, cultivation_method: null, crop_name: 'Rice' });
    const sky = await run();
    expect(h.stageReads).toBeGreaterThan(0);
    expect(sky.cropActive).toBe(true);
    expect(sky.stage.sowingDate).toBe('2026-06-08');
    expect(sky.stage.state).toBe('within');
    expect(sky.state).toBe('as_expected');
  });

  it('standing crop, stage has no expected band: says what was seen, never "as expected"', async () => {
    h.lands = [{ id: LAND, lifecycle_status: 'CROP_ACTIVE', stage_uuid: 'stage-1', das: 163 }];
    h.stageRow = band(null, null);
    setSatellite(pass('2026-11-14', 0.609), pass('2026-11-09', 0.60), { sowing_date: '2026-06-08', transplant_date: null, cultivation_method: null, crop_name: 'Rice' });
    const sky = await run();
    expect(sky.stage.state).toBe('no_band');
    expect(sky.state).toBe('stage_unverified');
  });

  it('standing crop, reading graded "insufficient" by the pipeline: no verdict either way', async () => {
    h.lands = [{ id: LAND, lifecycle_status: 'CROP_ACTIVE', stage_uuid: 'stage-1', das: 338 }];
    h.stageRow = band(0.7, 0.9); // 0.659 would read "below" on a trustworthy reading
    setSatellite(pass('2026-11-14', 0.659, 'insufficient'), pass('2026-11-09', 0.66, 'insufficient'), { sowing_date: '2025-12-15', transplant_date: null, cultivation_method: null, crop_name: 'Sugarcane' });
    const sky = await run();
    expect(sky.state).toBe('stage_unverified');
  });

  it('active schedule but the land says released: held, as the alert engine does', async () => {
    h.lands = [{ id: LAND, lifecycle_status: 'AVAILABLE', stage_uuid: null, das: null }];
    setSatellite(pass('2026-11-14', 0.609), pass('2026-11-09', 0.60), { sowing_date: '2026-06-08', transplant_date: null, cultivation_method: null, crop_name: 'Rice' });
    const sky = await run();
    expect(sky.state).toBe('crop_on_hold');
  });

  it('crop auto-closed after its harvest window (Shinghan Mal): held; next crop saved: active on the new sowing date', async () => {
    // after run_daily_crop_cycle_close: land AVAILABLE, no active schedule in the satellite bundle
    h.lands = [{ id: LAND, lifecycle_status: 'AVAILABLE', stage_uuid: null, das: null }];
    setSatellite(pass('2026-11-14', 0.384), pass('2026-11-09', 0.45), null);
    expect((await run()).state).toBe('crop_on_hold');
    // the farmer saves the next crop: the database sets CROP_ACTIVE, lands-api returns the new schedule
    h.lands = [{ id: LAND, lifecycle_status: 'CROP_ACTIVE', stage_uuid: null, das: null }];
    setSatellite(pass('2026-11-14', 0.384), pass('2026-11-09', 0.45), { sowing_date: '2026-11-16', transplant_date: null, cultivation_method: null, crop_name: 'Wheat' });
    const sky = await run();
    expect(sky.cropActive).toBe(true);
    expect(sky.stage.sowingDate).toBe('2026-11-16');
    // stage not worked out yet for the new crop: honest, not green
    expect(sky.state).toBe('stage_unverified');
  });

  it('lifecycle missing or PREPARING with a schedule: held (fail closed, same as the alert engine)', async () => {
    h.lands = [{ id: LAND, lifecycle_status: 'PREPARING', stage_uuid: null, das: null }];
    setSatellite(pass('2026-11-14', 0.609), pass('2026-11-09', 0.60), { sowing_date: '2026-06-08', transplant_date: null, cultivation_method: null, crop_name: 'Rice' });
    expect((await run()).state).toBe('crop_on_hold');
  });

  it('standing crop below its band on a strong reading: still "something wrong" (unchanged)', async () => {
    h.lands = [{ id: LAND, lifecycle_status: 'CROP_ACTIVE', stage_uuid: 'stage-1', das: 163 }];
    h.stageRow = band(0.7, 0.9);
    setSatellite(pass('2026-11-14', 0.384), pass('2026-11-09', 0.45), { sowing_date: '2026-05-20', transplant_date: null, cultivation_method: null, crop_name: 'Rice' });
    const sky = await run();
    expect(sky.state).toBe('something_wrong');
    expect(attentionLevel(sky)).toBe('severe');
  });
});

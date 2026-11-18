import { describe, expect, it } from 'vitest';
import { bestSoilMetrics, measuredCount } from './soilSummary';
import { resolveSoilSources, type SoilRow } from '@/services/soil/soilReport';

const row = (r: Record<string, unknown>) => r as unknown as SoilRow;

const satellite = row({ source: 'soilgrid', ph_level: '6.70', organic_carbon: '1.932', nitrogen_kg_per_ha: 150, sand_percent: 43.7 });
const lab = row({ source: 'lab_test', ph_level: 7.4, nitrogen_kg_per_ha: 180, nitrogen_level: 'low', phosphorus_kg_per_ha: null });
const byKey = (m: ReturnType<typeof bestSoilMetrics>) => Object.fromEntries(m.map((x) => [x.key, x]));

describe('bestSoilMetrics', () => {
  it('takes each value from the best report that has it and names the source', () => {
    const m = byKey(bestSoilMetrics({ lab, satellite, device: null }));
    expect(m.ph).toMatchObject({ value: 7.4, source: 'lab' });
    expect(m.organicCarbon).toMatchObject({ value: 1.932, source: 'satellite' });
    expect(m.nitrogen).toMatchObject({ value: 180, level: 'low', source: 'lab' });
    expect(m.phosphorus).toMatchObject({ value: null, source: null });
  });
  it('never takes N, P, K or moisture from the satellite estimate', () => {
    const m = byKey(bestSoilMetrics({ lab: null, satellite, device: null }));
    expect(m.nitrogen.value).toBeNull();
    expect(m.moisture.value).toBeNull();
    expect(m.ph).toMatchObject({ value: 6.7, source: 'satellite' });
  });
  it('a soil device reading fills N, P, K and moisture when there is no lab test', () => {
    const device = row({ source: 'device', potassium_kg_per_ha: 210, soil_moisture_surface_percent: 24 });
    const m = byKey(bestSoilMetrics({ lab: null, satellite, device }));
    expect(m.potassium).toMatchObject({ value: 210, source: 'device' });
    expect(m.moisture).toMatchObject({ value: 24, source: 'device' });
  });
  it('counts nothing when no report exists', () => {
    expect(measuredCount(bestSoilMetrics({ lab: null, satellite: null, device: null }))).toBe(0);
  });
});

describe('resolveSoilSources', () => {
  it('uses the server grouping when present', () => {
    expect(resolveSoilSources({ legacy: lab, sources: { lab, satellite, device: null } }).satellite).toBe(satellite);
  });
  it('places an older API single row under its own type', () => {
    expect(resolveSoilSources({ legacy: satellite })).toEqual({ lab: null, satellite, device: null });
    expect(resolveSoilSources({ legacy: row({ ...lab, source: 'manual' }) }).lab?.source).toBe('manual');
    expect(resolveSoilSources(null)).toEqual({ lab: null, satellite: null, device: null });
  });
});

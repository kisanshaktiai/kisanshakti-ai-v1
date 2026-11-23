import { describe, expect, it } from 'vitest';
import { computeSprayPlan, measure, mixStage } from './sprayPlan';
import type { SprayComponent } from '@/services/cropPhotoService';

const comp = (over: Partial<SprayComponent>): SprayComponent => ({
  role: 'fungicide', active_ingredient: 'x', formulation: null, dose_value: null, dose_unit: null,
  phi_days: null, moa_group: null, ...over,
});
const A = comp({ role: 'insecticide', active_ingredient: 'a', formulation: '5 EC', dose_value: 200, dose_unit: 'ml_per_acre' });
const B = comp({ role: 'fungicide', active_ingredient: 'b', formulation: '75 WP', dose_value: 100, dose_unit: 'g_per_acre' });
const base = { waterVolume: 120, waterUnit: 'l_per_acre' as const, pumpL: 18, stockLPerPump: 1, stockMinDilution: 10 };

describe('computeSprayPlan — shop method made exact', () => {
  it('1 acre, 18 L pump: 7 pumps, 7 L stock, each pump 1 L stock + 17 L water', () => {
    const r = computeSprayPlan({ ...base, components: [A, B], areaAcres: 1 });
    expect(r).toMatchObject({ mode: 'area', pumps: 7, stockPerPumpL: 1, stockL: 7, waterPerPumpL: 17, sprayedL: 126 });
    // Per-acre labels keep the product per acre exact.
    expect(r.lines.map((l) => [l.component.active_ingredient, l.total, l.unit])).toEqual([['b', 100, 'g'], ['a', 200, 'ml']]);
  });

  it('2.5 acres scales the product per acre, pumps rounded up', () => {
    const r = computeSprayPlan({ ...base, components: [A, B], areaAcres: 2.5 });
    expect(r.pumps).toBe(17);
    expect(r.lines.find((l) => l.component === A)?.total).toBe(500);
    expect(r.lines.find((l) => l.component === B)?.total).toBe(250);
  });

  it('per-litre label keeps the concentration on the water actually sprayed', () => {
    const C = comp({ formulation: '18.5 SC', dose_value: 2, dose_unit: 'ml_per_litre' });
    const r = computeSprayPlan({ ...base, waterVolume: 200, components: [C], areaAcres: 1 });
    expect(r.pumps).toBe(12);
    expect(r.lines[0].total).toBe(432);
    expect(r.lines[0].perPump).toBe(36);
  });

  it('converts per-hectare labels and water per hectare', () => {
    const D = comp({ formulation: '50 WP', dose_value: 500, dose_unit: 'g_per_ha' });
    const r = computeSprayPlan({ ...base, waterVolume: 500, waterUnit: 'l_per_ha', pumpL: 16, components: [D], areaAcres: 1 });
    expect(r.pumps).toBe(13);
    expect(r.lines[0].total).toBeCloseTo(202.34, 1);
  });

  it('raises the stock per pump when the stock would be too concentrated, else measures into each pump', () => {
    const heavy = comp({ formulation: 'SL', dose_value: 1000, dose_unit: 'ml_per_acre' });
    const r = computeSprayPlan({ ...base, components: [heavy], areaAcres: 1 });
    // 1000 ml × 10 = 10 L of stock needed over 7 pumps → 2 L per pump.
    expect(r).toMatchObject({ stockPerPumpL: 2, stockL: 14, waterPerPumpL: 16 });
    const r2 = computeSprayPlan({ ...base, stockMinDilution: 200, components: [heavy], areaAcres: 1 });
    expect(r2).toMatchObject({ stockPerPumpL: null, stockL: null, waterPerPumpL: 18 });
  });

  it('without an area gives one pump; without spray water gives label doses only', () => {
    const one = computeSprayPlan({ ...base, components: [A], areaAcres: null });
    expect(one).toMatchObject({ mode: 'one_pump', pumps: 1 });
    expect(one.lines[0].perPump).toBe(30); // 200 ml per 120 L → 30 ml per 18 L
    const label = computeSprayPlan({ ...base, waterVolume: null, components: [A], areaAcres: 1 });
    expect(label.mode).toBe('label_only');
    expect(label.lines[0].total).toBeNull();
  });

  it('a product without a known label dose stays in the plan with no amount', () => {
    const r = computeSprayPlan({ ...base, components: [comp({ formulation: '5 EC' })], areaAcres: 1 });
    expect(r.lines[0]).toMatchObject({ total: null, perPump: null, unit: null });
  });
});

describe('mixing order and display', () => {
  it('orders dry → flowable → emulsion → solution → adjuvant by formulation code', () => {
    expect(mixStage({ role: 'fungicide', formulation: '75 WP' })).toBe('dry');
    expect(mixStage({ role: 'fungicide', formulation: '18.5 SC' })).toBe('flowable');
    expect(mixStage({ role: 'insecticide', formulation: '5 EC' })).toBe('emulsion');
    expect(mixStage({ role: 'nutrient', formulation: '12% EDTA' })).toBe('solution');
    expect(mixStage({ role: 'adjuvant', formulation: 'SL' })).toBe('adjuvant');
  });

  it('measure rounds to what a farmer can measure', () => {
    expect(measure(28.57)).toBe('29');
    expect(measure(0.64)).toBe('0.6');
    expect(measure(202.34)).toBe('202');
  });
});

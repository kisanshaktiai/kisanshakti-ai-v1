import { describe, expect, it } from 'vitest';
import { computeLandAnalytics } from './reportEngine';

const land = {
  id: 'land-1', name: 'Test field', area_acres: 2, current_crop: 'rice', crop_stage: 'vegetative',
  last_sowing_date: null, expected_harvest_date: null, ndvi_thumbnail_url: null, last_ndvi_value: null,
  irrigation_source: null, soil_ph: null, nitrogen_kg_per_ha: null, phosphorus_kg_per_ha: null,
  potassium_kg_per_ha: null, active_schedule_id: 'schedule-current',
};

const emptyInputs = {
  tasks: [], weather: null, soil: null, ndvi: [], finance: [], market: [], schedule: null, baseline: null, decisions: [],
};

describe('analytics report engine DB authority', () => {
  it('does not invent yield, revenue, profit, water, or recommendations', () => {
    const result = computeLandAnalytics(land, emptyInputs);
    expect(result.expectedYieldQuintals).toBeNull();
    expect(result.projectedRevenue).toBeNull();
    expect(result.projectedProfit).toBeNull();
    expect(result.waterRequirementL).toBeNull();
    expect(result.recommendations).toEqual([]);
  });

  it('uses stored schedule economics and decision text unchanged', () => {
    const result = computeLandAnalytics(land, {
      ...emptyInputs,
      market: [{ commodity_name_normalized: 'rice', crop_name: 'rice', modal_price: 2500, price_per_unit: null, price_date: '2026-09-18', market_location: 'Kolhapur' }],
      schedule: {
        id: 'schedule-current', land_id: land.id, total_estimated_cost: 10000, actual_total_cost: null,
        expected_yield_quintals: 20, expected_yield_per_acre: null, expected_market_price_per_quintal: null,
        total_water_requirement_liters: null, water_requirement_liters_total: 50000,
        water_per_irrigation_liters: 5000, cost_by_category: { labor: 4000 },
      },
      decisions: [{ land_id: land.id, title_en: 'Inspect crop', action_text_en: 'Inspect the eastern edge today.' }],
    });
    expect(result.projectedRevenue).toBe(50000);
    expect(result.projectedProfit).toBe(40000);
    expect(result.waterRequirementL).toBe(5000);
    expect(result.recommendations).toEqual(['Inspect the eastern edge today.']);
  });
});
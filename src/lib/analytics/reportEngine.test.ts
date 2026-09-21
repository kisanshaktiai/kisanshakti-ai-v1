import { describe, expect, it } from 'vitest';
import { computeLandAnalytics, aggregateFarm, type LandEconomicsRow } from './reportEngine';

const land = { id: 'land-1', name: 'Test field', area_acres: 2, current_crop: 'rice', active_schedule_id: 'schedule-current', ndvi_thumbnail_url: null };
const empty = { economics: null, farmState: null, weather: null, ndvi: [], tasks: [], decisions: [], soil: null };

const econ: LandEconomicsRow = {
  land_id: 'land-1', land_name: 'Test field', area_acres: 2, active_schedule_id: 'schedule-current',
  crop_name: 'rice', cultivation_method: null, sowing_date: null, expected_harvest_date: null, harvest_status: null,
  price_per_quintal: null, week_start: '2026-09-21', computed_at: '2026-09-21T14:15:00Z', model_version: 'yield-v1',
  crop_code: 'rice', variety: null, potential_yield_per_acre: 18, predicted_yield_per_acre: 15.52,
  predicted_yield_low_per_acre: 13.19, predicted_yield_high_per_acre: 17.85,
  predicted_total_qtl: 31, predicted_total_low_qtl: 26.4, predicted_total_high_qtl: 35.7, confidence_score: 0.5,
  factors: { canopy: { value: 0.862, ky: 1, vs_expected: 'below' } },
  explanation: [{ code: 'canopy_below_normal', ndvi: 0.474, expected_min: 0.55 }], gaps: ['water_disabled_by_policy'],
  prev_predicted_per_acre: null, prev_week_start: null, spent_confirmed: 0, spent_rows: 0, estimated_due: 0,
  estimated_remaining: 0, estimates_this_week: 0, estimate_rows: 0, income_received: 0, income_low: null, income_high: null,
};

describe('analytics report engine — server authority', () => {
  it('invents nothing when the server has not computed', () => {
    const r = computeLandAnalytics(land, empty);
    expect(r.economics).toBeNull();
    expect(r.watch.count).toBe(0);
    expect(r.tasks.total).toBe(0);
    expect(aggregateFarm([r]).predictedTotalLowQtl).toBeNull();
    expect(aggregateFarm([r]).incomeLow).toBeNull();
  });

  it('passes server economics through unchanged and sums only what exists', () => {
    const r = computeLandAnalytics(land, { ...empty, economics: econ });
    expect(r.economics?.predicted_total_low_qtl).toBe(26.4);
    expect(r.economics?.explanation?.[0].code).toBe('canopy_below_normal');
    const agg = aggregateFarm([r, computeLandAnalytics({ ...land, id: 'land-2' }, empty)]);
    expect(agg.predictedTotalHighQtl).toBe(35.7);
    expect(agg.incomeLow).toBeNull();
    expect(agg.landsWithEstimate).toBe(1);
  });

  it('de-duplicates open decisions by decision_key and keeps the newest three', () => {
    const decisions = [
      { land_id: 'land-1', decision_key: 'spray_window', category: 'disease', status: 'WATCH', created_at: '2026-09-19' },
      { land_id: 'land-1', decision_key: 'spray_window', category: 'disease', status: 'WATCH', created_at: '2026-09-20' },
      { land_id: 'land-1', decision_key: 'irrigate', category: 'water', status: 'DUE', created_at: '2026-09-21' },
      { land_id: 'land-1', decision_key: 'scout', category: 'observation', status: 'INFO', created_at: '2026-09-18' },
      { land_id: 'land-1', decision_key: 'ndvi_drop', category: 'general', status: 'INFO', created_at: '2026-09-17' },
    ];
    const r = computeLandAnalytics(land, { ...empty, decisions });
    expect(r.watch.count).toBe(4);
    expect(r.watch.byCategory).toEqual({ disease: 1, water: 1, observation: 1, general: 1 });
    expect(r.watch.latest.map((d) => d.decision_key)).toEqual(['irrigate', 'spray_window', 'scout']);
  });

  it('counts a task as on time only when completed on or before its day', () => {
    const r = computeLandAnalytics(land, { ...empty, tasks: [
      { id: 't1', schedule_id: 'schedule-current', status: 'completed', task_date: '2026-09-10', completed_at: '2026-09-10T15:00:00Z', task_type: 'nutrition' },
      { id: 't2', schedule_id: 'schedule-current', status: 'completed', task_date: '2026-09-10', completed_at: '2026-09-12T15:00:00Z', task_type: 'nutrition' },
      { id: 't3', schedule_id: 'schedule-current', status: 'pending',   task_date: '2099-01-01', completed_at: null, task_type: 'harvest' },
    ] });
    expect(r.tasks.total).toBe(3);
    expect(r.tasks.completed).toBe(2);
    expect(r.tasks.onTime).toBe(1);
    expect(r.tasks.pending).toBe(1);
  });
});

/**
 * 2026-11-19 — harvest card logic. Dates mirror crop_cycle_close_plan on 2026-11-19:
 * Kodoli Mala rice (Indrayani, direct-seeded) harvest 26 Oct by variety duration,
 * released 29 Nov (go-live day + 10), still-in-field allowed up to 15 Nov.
 */
import { describe, expect, it } from 'vitest';
import {
  canReportStillInField, daysLeft, expectedDateAllowed, harvestDateAllowed, parseDay, pickHarvestCards,
  HARVEST_QUESTION_RULE_CODE, type HarvestCardAlert, type HarvestQuestion,
} from '@/lib/harvestCard';

const q: HarvestQuestion = {
  type: 'HARVEST_CONFIRM', land_id: 'land-1', schedule_id: 's-1', crop_code: 'rice', sowing_date: '2026-06-08',
  harvest_date: '2026-10-26', harvest_basis: 'variety_duration', release_on: '2026-11-29', max_expected_date: '2026-11-15',
};
const alert = (over: Partial<HarvestCardAlert> = {}, qo: Partial<HarvestQuestion> = {}): HarvestCardAlert => ({
  id: 'a-1', land_id: 'land-1', rule_id: HARVEST_QUESTION_RULE_CODE, status: 'PENDING', created_at: '2026-11-19T05:00:00Z',
  trigger_data: { land_name: 'Kodoli Mala', question: { ...q, ...qo } }, ...over,
});

describe('harvest card', () => {
  it('counts down the days to the release day', () => {
    expect(daysLeft('2026-11-29', '2026-11-19')).toBe(10);
    expect(daysLeft('2026-11-29', '2026-11-28')).toBe(1);
    expect(daysLeft('2026-11-29', '2026-11-29')).toBe(0);
  });

  it('shows after the harvest date and before the release day only', () => {
    expect(pickHarvestCards([alert()], '2026-11-19')).toHaveLength(1);
    expect(pickHarvestCards([alert()], '2026-10-26')).toHaveLength(0);   // harvest day itself
    expect(pickHarvestCards([alert()], '2026-11-29')).toHaveLength(0);   // released today
  });

  it('one card per land: the newest live one; answered or expired cards never show', () => {
    const older = alert({ id: 'old', created_at: '2026-11-18T05:00:00Z' });
    const cards = pickHarvestCards([older, alert()], '2026-11-19');
    expect(cards.map((c) => c.alertId)).toEqual(['a-1']);
    expect(pickHarvestCards([alert({ status: 'ACTED' })], '2026-11-19')).toHaveLength(0);
    expect(pickHarvestCards([alert({ status: 'EXPIRED' })], '2026-11-19')).toHaveLength(0);
    expect(pickHarvestCards([alert({ rule_id: 'IRRIGATION_TRIGGER_FAO56' })], '2026-11-19')).toHaveLength(0);
  });

  it('"remind me tomorrow" hides that land for today only', () => {
    expect(pickHarvestCards([alert()], '2026-11-19', (land) => land === 'land-1')).toHaveLength(0);
  });

  it('several lands: the one closest to release first', () => {
    const later = alert({ id: 'b', land_id: 'land-2' }, { land_id: 'land-2', release_on: '2026-12-05', harvest_date: '2026-11-01' });
    expect(pickHarvestCards([later, alert()], '2026-11-19').map((c) => c.landId)).toEqual(['land-1', 'land-2']);
  });

  it('"harvest done" dates: after sowing, up to today', () => {
    expect(harvestDateAllowed(parseDay('2026-10-30'), q, '2026-11-19')).toBe(true);
    expect(harvestDateAllowed(parseDay('2026-11-19'), q, '2026-11-19')).toBe(true);
    expect(harvestDateAllowed(parseDay('2026-11-20'), q, '2026-11-19')).toBe(false);
    expect(harvestDateAllowed(parseDay('2026-06-08'), q, '2026-11-19')).toBe(false);
  });

  it('"crop still in the field": after today, up to the crop window end; not offered once that end has passed', () => {
    expect(canReportStillInField(q, '2026-11-10')).toBe(true);
    expect(expectedDateAllowed(parseDay('2026-11-15'), q, '2026-11-10')).toBe(true);
    expect(expectedDateAllowed(parseDay('2026-11-16'), q, '2026-11-10')).toBe(false);
    expect(expectedDateAllowed(parseDay('2026-11-10'), q, '2026-11-10')).toBe(false);
    // Kodoli Mala today: the rice window ended 15 Nov, so only "harvest done" is offered
    expect(canReportStillInField(q, '2026-11-19')).toBe(false);
    expect(canReportStillInField({ ...q, max_expected_date: null }, '2026-11-10')).toBe(false);
  });
});

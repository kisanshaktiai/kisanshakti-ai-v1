import { describe, expect, it } from 'vitest';
import { buildStageTimeline, initialTimelineStage } from '../../src/lib/scheduleStageTimeline';

const task = (id: string, stage_uuid: string | null, task_date = '2026-11-14') => ({ id, stage_uuid, task_date, status: 'pending' });
describe('DB-backed schedule stage presentation', () => {
  it('shows only the selected stage tasks without changing dates or quantities', () => {
    const tasks = [{ ...task('a', 'stage-a'), quantity: 12 }, task('b', 'stage-b')];
    const groups = buildStageTimeline(tasks, [], 'stage-b');
    expect(initialTimelineStage(groups)).toBe('stage-b');
    expect(groups.find((s) => s.id === 'stage-b')?.tasks.map((t) => t.id)).toEqual(['b']);
    expect(groups.find((s) => s.id === 'stage-a')?.tasks[0]).toBe(tasks[0]);
    expect(tasks[0].quantity).toBe(12);
  });
  it('keeps separate repeated-picking UUIDs even with identical labels', () => {
    const groups = buildStageTimeline([{ ...task('first', 'p1'), stage_name: 'Picking' }, { ...task('last', 'p2'), stage_name: 'Picking' }], []);
    expect(groups.map((s) => s.tasks.map((t) => t.id))).toEqual([['first'], ['last']]);
  });
  it('retains unknown tasks rather than guessing a biological stage from dates', () => {
    const groups = buildStageTimeline([task('unknown', null)], [{ stage_key: 'db-stage', stage_name: 'DB stage', order: 0, das_from: 5, das_to: 20 }]);
    expect(groups[0].tasks).toEqual([]);
    expect(groups[1].unassigned).toBe(true);
    expect(groups[1].tasks[0].id).toBe('unknown');
  });
  it('copies DB stage order and windows and sorts task dates within stages', () => {
    const groups = buildStageTimeline([{ ...task('later', 's1', '2026-11-20'), stage_key: 'key1' }, { ...task('earlier', 's1'), stage_key: 'key1' }],
      [{ stage_key: 'key2', order: 2, das_from: 50, das_to: 70 }, { stage_key: 'key1', order: 1, das_from: 0, das_to: 49 }]);
    expect(groups.map((s) => [s.order, s.dasFrom, s.dasTo])).toEqual([[1, 0, 49], [2, 50, 70]]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['earlier', 'later']);
  });
});
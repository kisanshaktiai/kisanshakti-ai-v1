import { describe, it, expect } from 'vitest';
import { chooseBrief, topAlert, type BriefInput } from './fieldBrief';

const base: BriefInput = { hasLand: true, loading: false, failed: false, alerts: [], tasks: [], cropActive: true, irrigationNeeded: null };

describe('fieldBrief', () => {
  it('puts the most urgent, then newest, alert first', () => {
    const a = topAlert([
      { id: '1', priority: 'LOW', created_at: '2026-11-27T10:00:00Z' },
      { id: '2', priority: 'HIGH', created_at: '2026-11-26T10:00:00Z' },
      { id: '3', priority: 'HIGH', created_at: '2026-11-27T09:00:00Z' },
    ]);
    expect(a?.id).toBe('3');
  });

  it('prefers an alert over a task, and a task over the irrigation flag', () => {
    const tasks = [{ id: 't', task_name: 'x' }, { id: 'u', task_name: 'y' }];
    expect(chooseBrief({ ...base, alerts: [{ id: 'a', priority: 'CRITICAL', created_at: '' }], tasks, irrigationNeeded: true })).toEqual({ kind: 'alert', alertId: 'a', tone: 'stop' });
    expect(chooseBrief({ ...base, tasks, irrigationNeeded: true })).toEqual({ kind: 'task', taskName: 'x', more: 1, tone: 'do' });
    expect(chooseBrief({ ...base, irrigationNeeded: true })).toEqual({ kind: 'key', key: 'water_needed', tone: 'do' });
  });

  it('never says all clear while something is loading or failed to load', () => {
    expect(chooseBrief({ ...base, loading: true })).toEqual({ kind: 'key', key: 'loading', tone: 'idle' });
    expect(chooseBrief({ ...base, failed: true })).toEqual({ kind: 'key', key: 'cannot_load', tone: 'warn' });
    expect(chooseBrief(base)).toEqual({ kind: 'key', key: 'all_clear', tone: 'ok' });
  });

  it('says there is no crop or no land instead of a verdict', () => {
    expect(chooseBrief({ ...base, cropActive: false })).toEqual({ kind: 'key', key: 'no_crop', tone: 'idle' });
    expect(chooseBrief({ ...base, hasLand: false })).toEqual({ kind: 'key', key: 'no_land', tone: 'idle' });
  });
});

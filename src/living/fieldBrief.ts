/**
 * The one sentence the Field home says.
 *
 * It only chooses among facts the app already holds; it never writes advice.
 * Order: a live alert for this land, then a task due today, then the governed
 * irrigation flag. "All clear" is said only when every source loaded.
 */

export type BriefTone = 'do' | 'warn' | 'stop' | 'ok' | 'idle';

export interface BriefInput {
  hasLand: boolean;
  loading: boolean;
  failed: boolean;
  /** live alerts for the selected land, any order */
  alerts: Array<{ id: string; priority: string; created_at: string }>;
  /** tasks dated today that are not finished, in schedule order */
  tasks: Array<{ id: string; task_name: string | null }>;
  cropActive: boolean;
  irrigationNeeded: boolean | null;
}

export type Brief =
  | { kind: 'alert'; alertId: string; tone: BriefTone }
  | { kind: 'task'; taskName: string; more: number; tone: BriefTone }
  | { kind: 'key'; key: 'no_land' | 'loading' | 'cannot_load' | 'water_needed' | 'no_crop' | 'all_clear'; tone: BriefTone };

const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const rank = (p: string) => { const i = PRIORITY_ORDER.indexOf(String(p).toUpperCase()); return i === -1 ? PRIORITY_ORDER.length : i; };

export function topAlert<T extends { priority: string; created_at: string }>(alerts: T[]): T | null {
  if (!alerts.length) return null;
  return [...alerts].sort((a, b) => rank(a.priority) - rank(b.priority) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

export function chooseBrief(input: BriefInput): Brief {
  if (!input.hasLand) return { kind: 'key', key: input.loading ? 'loading' : 'no_land', tone: 'idle' };
  const alert = topAlert(input.alerts);
  if (alert) return { kind: 'alert', alertId: alert.id, tone: rank(alert.priority) <= 1 ? 'stop' : 'warn' };
  const named = input.tasks.filter((t) => !!t.task_name);
  if (named.length) return { kind: 'task', taskName: named[0].task_name as string, more: named.length - 1, tone: 'do' };
  if (input.irrigationNeeded === true) return { kind: 'key', key: 'water_needed', tone: 'do' };
  if (input.loading) return { kind: 'key', key: 'loading', tone: 'idle' };
  if (input.failed) return { kind: 'key', key: 'cannot_load', tone: 'warn' };
  if (!input.cropActive) return { kind: 'key', key: 'no_crop', tone: 'idle' };
  return { kind: 'key', key: 'all_clear', tone: 'ok' };
}

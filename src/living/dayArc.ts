/** Day view geometry: the sun's path as a half circle, and the hours of the day laid along it. Pure functions. */
import type { Pt } from './fieldGeometry';

export const ARC_W = 390;
export const ARC_H = 262;
const CX = 195, CY = 236, R = 160;

export function arcPoint(t: number, radius = R): Pt {
  return { x: CX - radius * Math.cos(Math.PI * t), y: CY - radius * Math.sin(Math.PI * t) };
}

export function arcPath(t1: number, t2: number): string {
  const a = arcPoint(t1), b = arcPoint(t2);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} A${R} ${R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

const toMs = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v < 1e12 ? v * 1000 : v);

export interface RainSegment { from: number; to: number; chance: number }

/**
 * Hourly rain chance between sunrise and sunset as stretches of the arc.
 * Each hour keeps its own chance (0..1); nothing is judged "likely" or "unlikely" here.
 */
export function rainSegments(hourly: Array<{ dt: number; pop?: number | null }> | null | undefined, sunrise: number | null | undefined, sunset: number | null | undefined): RainSegment[] {
  const up = toMs(sunrise), down = toMs(sunset);
  if (!hourly?.length || up == null || down == null || down <= up) return [];
  const span = down - up;
  const out: RainSegment[] = [];
  for (const h of hourly) {
    const start = toMs(h.dt);
    const chance = Number(h.pop ?? 0);
    if (start == null || !(chance > 0)) continue;
    const from = (start - up) / span, to = (start + 3_600_000 - up) / span;
    if (to <= 0 || from >= 1) continue;
    out.push({ from: Math.max(0, from), to: Math.min(1, to), chance: Math.min(1, chance) });
  }
  return out;
}

/** Local calendar day (yyyy-mm-dd) in India for a time. */
export function indiaDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** The next `count` days from `fromMs`, as India calendar days. */
export function nextDays(fromMs: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => indiaDay(fromMs + i * 86_400_000));
}

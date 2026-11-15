/**
 * Display-only localisation of leftover English time/unit words inside
 * farmer-facing schedule text. Numbers are never touched; every replacement
 * label comes from translation files (schedule.units.* / schedule.frequency.*).
 */
type T = (key: string, fallback?: any) => string;

const PHRASES: Array<[RegExp, string]> = [
  [/\bevery\s+day\b/gi, 'schedule.frequency.every_day'],
  [/\bdaily\b/gi, 'schedule.frequency.every_day'],
  [/\bevery\s+week\b/gi, 'schedule.frequency.every_week'],
  [/\bweekly\b/gi, 'schedule.frequency.every_week'],
];
// Unit words only when adjacent to a number ("day 0", "24 days", "49.72 kg").
const UNITS: Record<string, string> = {
  day: 'day', days: 'day', week: 'week', weeks: 'week', hour: 'hour', hours: 'hour', hr: 'hour', hrs: 'hour',
  kg: 'kg', g: 'g', gm: 'g', ml: 'ml', l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l', mm: 'mm', cm: 'cm',
  acre: 'acre', acres: 'acre', ha: 'ha',
};
const NUM = '\\d+(?:[.,]\\d+)?';

export function localizeDisplayUnits(text: string, t: T, language: string): string {
  if (!text || !language || language.split('-')[0] === 'en') return text;
  const label = (unit: string) => {
    const key = `schedule.units.${unit}`;
    const v = t(key, '');
    return v && v !== key ? v : null;
  };
  let out = text;
  for (const [re, key] of PHRASES) {
    out = out.replace(re, (m) => { const v = t(key, ''); return v && v !== key ? v : m; });
  }
  const words = Object.keys(UNITS).join('|');
  // "day 0" → "0 दिवस" (unit before number)
  out = out.replace(new RegExp(`\\b(day|days|week|weeks)\\s+(${NUM})\\b`, 'gi'), (m, w: string, n: string) => {
    const l = label(UNITS[w.toLowerCase()]); return l ? `${n} ${l}` : m;
  });
  // "24 days" / "49.72 kg" (unit after number)
  out = out.replace(new RegExp(`(${NUM})\\s*(${words})\\b`, 'gi'), (m, n: string, w: string) => {
    const l = label(UNITS[w.toLowerCase()]); return l ? `${n} ${l}` : m;
  });
  return out;
}

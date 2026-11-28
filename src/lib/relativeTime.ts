const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
];

/** "2 days ago" in the given app language, from the browser's own language data. Empty when there is no valid date. */
export function relativeTime(iso: string | null | undefined, language: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - Date.now()) / 1000);
  let format: Intl.RelativeTimeFormat;
  try { format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' }); } catch { format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }); }
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'second');
}

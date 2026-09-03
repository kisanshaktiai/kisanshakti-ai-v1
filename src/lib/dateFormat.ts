/**
 * Farmer-facing date formatting.
 *
 * date-fns ships no Marathi locale, so dates are formatted with the platform
 * Intl API using the app language. Never format farmer dates with date-fns
 * `format(d, 'PPP')` — that always renders English.
 */
export function formatFarmerDate(date: Date, language: string): string {
  const lang = (language || 'en').toLowerCase();
  try {
    return new Intl.DateTimeFormat(`${lang}-IN`, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

/** Whole days between `date` and today (positive = in the past). */
export function daysAgoFrom(date: Date): number {
  const a = new Date(date);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

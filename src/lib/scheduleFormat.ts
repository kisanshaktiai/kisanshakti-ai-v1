/**
 * Schedule display formatters.
 *
 * Task `quantity` (and other resource fields) may be stored as either a
 * plain string (legacy) or a structured object `{ value: number, unit: string }`
 * (DB-driven generator). React cannot render an object directly as a child,
 * so every render site must funnel these values through `formatQuantity`.
 *
 * This is display-only — it does NOT change the data shape or the generator.
 */

/**
 * Format a quantity (or any scalar resource field) into a renderable string.
 *
 * - null / undefined / empty / 'null' / 'undefined'  → null
 * - string  → the trimmed string (or null if empty/'null')
 * - number  → its string form
 * - object `{ value, unit }` → `${value} ${unit ?? ''}` (trimmed); null if value absent
 * - anything else → null
 *
 * Returns null means "do not render this block".
 */
export function formatQuantity(q: unknown): string | null {
  if (q === null || q === undefined) return null;

  if (typeof q === 'number') {
    return Number.isFinite(q) ? String(q) : null;
  }

  if (typeof q === 'string') {
    const s = q.trim();
    if (s === '' || s.toLowerCase() === 'null' || s === 'undefined') return null;
    return s;
  }

  if (typeof q === 'object' && !Array.isArray(q)) {
    const obj = q as Record<string, unknown>;
    if ('value' in obj && obj.value !== null && obj.value !== undefined) {
      const unit = typeof obj.unit === 'string' ? obj.unit : '';
      return `${String(obj.value)} ${unit}`.trim();
    }
    // Object without a usable value — not safely renderable as a child.
    return null;
  }

  return null;
}

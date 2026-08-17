/**
 * I18N LEAK GUARD (frontend)
 *
 * Server payload strings are rendered VERBATIM — the chat UI never calls a
 * local t() on them. The only transformation allowed is this guard: if a
 * display string still looks like an i18n key (ALL-CAPS / underscores / dots),
 * it never reaches a farmer. It is hidden and logged instead.
 */
const KEY_SHAPED = /^[A-Z0-9_. ]+$/;

export function isKeyShaped(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;
  return KEY_SHAPED.test(s);
}

/** Returns the string to display, or '' when it is a leaked i18n key. */
export function safeServerText(value?: string | null): string {
  if (!value) return '';
  if (isKeyShaped(value)) {
    console.warn(`[I18N_KEY_LEAK] value=${value}`);
    return '';
  }
  return value;
}

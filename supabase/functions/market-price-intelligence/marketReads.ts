// Cursor paging avoids repeatedly scanning discarded OFFSET rows.
export async function cursorRows<T extends { id: string }>(
  read: (after: string | undefined, size: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    const result = await read(after, size);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < size) return rows;
    const next = page[page.length - 1]?.id;
    if (!next || next === after) throw new Error('Market cursor did not advance');
    after = next;
  }
}

// Public price reference data only; never cache farmer/tenant/session records here.
export function cachedRead<T>(load: () => Promise<T>, ttl = 300000) {
  let value: T | undefined;
  let expires = 0;
  let pending: Promise<T> | undefined;
  return async (): Promise<T> => {
    if (value !== undefined && Date.now() < expires) return value;
    if (pending) return pending;
    pending = load().then(result => {
      value = result;
      expires = Date.now() + ttl;
      return result;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
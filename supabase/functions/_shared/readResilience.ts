// Bounded retries for transient database reads; never wrap writes with this helper.
export function isDatabaseTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return e.code === '57014' || e.code === '55P03' || /statement timeout|lock timeout|canceling statement/i.test(e.message || '');
}

export async function retryDatabaseRead<T extends { error: unknown }>(
  read: () => PromiseLike<T>,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  const first = await read();
  if (!isDatabaseTimeout(first.error)) return first;
  await wait(500);
  return await read();
}
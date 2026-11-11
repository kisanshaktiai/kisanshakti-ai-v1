import { describe, expect, it, vi } from 'vitest';
import { cursorRows, cachedRead } from '../../../supabase/functions/market-price-intelligence/marketReads';
import { retryDatabaseRead } from '../../../supabase/functions/_shared/readResilience';

describe('market read resilience', () => {
  it('reads every source row with advancing cursors, without deep offsets', async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'c' }], error: null });
    expect(await cursorRows(read, 2)).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(read.mock.calls).toEqual([[undefined, 2], ['b', 2]]);
  });
  it('coalesces concurrent catalog loads and caches successful reference rows', async () => {
    const load = vi.fn().mockResolvedValue(['produce']);
    const get = cachedRead(load);
    expect(await Promise.all([get(), get()])).toEqual([['produce'], ['produce']]);
    expect(await get()).toEqual(['produce']);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('does not cache failed catalogs', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(['livestock']);
    const get = cachedRead(load);
    await expect(get()).rejects.toThrow('timeout');
    expect(await get()).toEqual(['livestock']);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('rebuilds a timed-out land read once and recovers', async () => {
    const read = vi.fn().mockResolvedValueOnce({ error: { code: '57014' }, data: null })
      .mockResolvedValueOnce({ error: null, data: [{ id: 'owned' }] });
    expect((await retryDatabaseRead<{ error: unknown; data: { id: string }[] | null }>(read, async () => {})).data).toEqual([{ id: 'owned' }]);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('bounds persistent timeouts and never retries permission failures', async () => {
    const read = vi.fn().mockResolvedValue({ error: { code: '57014' } });
    await retryDatabaseRead(read, async () => {});
    expect(read).toHaveBeenCalledTimes(2);
    const denied = vi.fn().mockResolvedValue({ error: { code: '42501' } });
    await retryDatabaseRead(denied, async () => {});
    expect(denied).toHaveBeenCalledTimes(1);
  });
});
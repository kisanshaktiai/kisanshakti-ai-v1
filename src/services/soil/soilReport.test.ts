import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ token: 'verified-token', ready: vi.fn(), from: vi.fn(), client: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  getSessionToken: () => mocks.token,
  waitForHeaders: mocks.ready,
  supabaseWithAuth: mocks.client,
}));
import { loadSoilReport, soilNumber } from './soilReport';
const landId = '00000000-0000-4000-8000-000000000001';
function query(result: unknown) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  for (const key of ['select', 'eq', 'order', 'limit'] as const) q[key].mockReturnValue(q);
  return q;
}
beforeEach(() => { vi.clearAllMocks(); mocks.token = 'verified-token'; mocks.ready.mockResolvedValue(undefined); mocks.client.mockReturnValue({ from: mocks.from }); });
describe('soil report reads', () => {
  it('waits for headers, validates ownership, and scopes every report read', async () => {
    const land = query({ data: { id: landId, name: 'Test land' }, error: null });
    const soil = query({ data: { id: 'report', ph_level: 6.8 }, error: null });
    const profile = query({ data: null, error: { code: '42501' } });
    mocks.from.mockReturnValueOnce(land).mockReturnValueOnce(soil).mockReturnValueOnce(profile);
    const report = await loadSoilReport(landId, 'farmer', 'tenant');
    expect(mocks.ready).toHaveBeenCalledOnce();
    expect(mocks.client).toHaveBeenCalledWith('farmer', 'tenant');
    for (const q of [land, soil]) {
      expect(q.eq).toHaveBeenCalledWith('farmer_id', 'farmer');
      expect(q.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
    }
    expect(soil.eq).toHaveBeenCalledWith('land_id', landId);
    expect(soil.order).toHaveBeenCalledWith('test_date', { ascending: false, nullsFirst: false });
    expect(report?.lands.name).toBe('Test land');
    expect(report?.user_profiles).toBeNull();
  });
  it('returns an empty result without treating it as an exception', async () => {
    mocks.from.mockReturnValueOnce(query({ data: { name: 'Test' } })).mockReturnValueOnce(query({ data: null, error: null }));
    expect(await loadSoilReport(landId, 'farmer', 'tenant')).toBeNull();
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
  it('does not read reports for inaccessible land', async () => {
    mocks.from.mockReturnValue(query({ data: null, error: null }));
    await expect(loadSoilReport(landId, 'farmer', 'tenant')).rejects.toThrow('LAND_UNAVAILABLE');
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('preserves database failures as errors rather than empty results', async () => {
    mocks.from.mockReturnValue(query({ data: null, error: { code: '42501' } }));
    await expect(loadSoilReport(landId, 'farmer', 'tenant')).rejects.toEqual({ code: '42501' });
  });
  it('does not query without a verified session', async () => {
    mocks.token = '';
    await expect(loadSoilReport(landId, 'farmer', 'tenant')).rejects.toThrow('AUTH_REQUIRED');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects an invalid land identifier before querying', async () => {
    await expect(loadSoilReport('undefined', 'farmer', 'tenant')).rejects.toThrow('INVALID_LAND');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('discards results when the session changes during a request', async () => {
    const land = query({ data: { name: 'Test' } });
    land.maybeSingle.mockImplementation(async () => { mocks.token = 'other-session'; return { data: { name: 'Test' } }; });
    mocks.from.mockReturnValue(land);
    await expect(loadSoilReport(landId, 'farmer', 'tenant')).rejects.toThrow('AUTH_REQUIRED');
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it.each([[null, null], [undefined, null], ['', null], ['bad', null], [Infinity, null], ['6.8', 6.8], [0, 0]])('formats %s safely', (input, expected) => {
    expect(soilNumber(input)).toBe(expected);
  });
});

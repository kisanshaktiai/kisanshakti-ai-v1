import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import { useMarketPriceIntelligence } from "../useMarketPriceIntelligence";

const tomatoHistory = { month: { data: [{ price_date: "2026-07-01", modal_price: 1000 }] } };
const onionHistory = { month: { data: [{ price_date: "2026-07-01", modal_price: 500 }] } };

describe("useMarketPriceIntelligence history ownership", () => {
  beforeEach(() => invokeMock.mockReset());

  it("tags stored history with the crop it was loaded for", async () => {
    invokeMock.mockResolvedValue({ data: { success: true, comparisons: tomatoHistory }, error: null });
    const { result } = renderHook(() => useMarketPriceIntelligence());

    await act(async () => {
      await result.current.getHistoricalComparison({ crop: "टोमॅटो" });
    });

    expect(result.current.historicalCrop).toBe("टोमॅटो");
    expect(result.current.historicalData).toEqual(tomatoHistory);
  });

  it("clears the previous crop's history as soon as another crop's load starts", async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, comparisons: tomatoHistory }, error: null });
    const { result } = renderHook(() => useMarketPriceIntelligence());
    await act(async () => {
      await result.current.getHistoricalComparison({ crop: "टोमॅटो" });
    });

    // Onion load hangs; while it is in flight no Tomato data may remain visible.
    let resolveOnion: (v: unknown) => void = () => {};
    invokeMock.mockImplementationOnce(
      () => new Promise((res) => { resolveOnion = res; }),
    );
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.getHistoricalComparison({ crop: "कांदा" });
    });

    await waitFor(() => expect(result.current.historicalData).toEqual({}));
    expect(result.current.historicalCrop).toBe("टोमॅटो");

    await act(async () => {
      resolveOnion({ data: { success: true, comparisons: onionHistory }, error: null });
      await pending;
    });
    expect(result.current.historicalCrop).toBe("कांदा");
    expect(result.current.historicalData).toEqual(onionHistory);
  });

  it("keeps history empty when the new crop's load fails, instead of showing the old crop", async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, comparisons: tomatoHistory }, error: null });
    const { result } = renderHook(() => useMarketPriceIntelligence());
    await act(async () => {
      await result.current.getHistoricalComparison({ crop: "टोमॅटो" });
    });

    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "network down" } });
    await act(async () => {
      await result.current.getHistoricalComparison({ crop: "कांदा" });
    });

    expect(result.current.historicalData).toEqual({});
    expect(result.current.error).toBe("network down");
  });
});

describe('market tab isolation', () => {
  beforeEach(() => invokeMock.mockReset());

  it('passes the chosen tab to catalogs and price queries', async () => {
    invokeMock.mockResolvedValue({ data: { success: true, crops: ['बोकड'], groups: [], data: [], totalRecords: 0 }, error: null });
    const { result } = renderHook(() => useMarketPriceIntelligence(undefined, 'livestock'));
    await act(async () => {
      await result.current.fetchCrops();
      await result.current.fetchCropGroups();
      await result.current.fetchRankedPrices();
    });
    expect(invokeMock.mock.calls.map(call => call[1].body.params.scope)).toEqual(['livestock', 'livestock', 'livestock']);
  });

  it('clears produce when switching to livestock and ignores late produce responses', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, data: [{ id: 'tomato', crop_name: 'टोमॅटो' }], totalRecords: 1 }, error: null });
    const { result, rerender } = renderHook(({ scope }) => useMarketPriceIntelligence(undefined, scope), { initialProps: { scope: 'produce' as 'produce' | 'livestock' } });
    await act(async () => { await result.current.fetchRankedPrices(); });
    expect(result.current.prices[0].crop_name).toBe('टोमॅटो');
    let resolveLate: (value: unknown) => void = () => {};
    invokeMock.mockImplementationOnce(() => new Promise(resolve => { resolveLate = resolve; }));
    let pending: Promise<unknown> = Promise.resolve();
    act(() => { pending = result.current.fetchRankedPrices(); });
    rerender({ scope: 'livestock' });
    await act(async () => {
      resolveLate({ data: { success: true, data: [{ crop_name: 'टोमॅटो' }] }, error: null });
      await pending;
    });
    expect(result.current.prices).toEqual([]);
  });
});

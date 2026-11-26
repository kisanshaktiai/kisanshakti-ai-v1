/**
 * 2026-11-19 — the harvest card opens on app open, counts down, and saves the answer
 * through proactive-question-seed with the verified session token.
 * 2026-11-20 — the auto-release warning is on the card in its own line; with no network
 * the card comes from the phone's offline alert copy (localDB).
 * Dates mirror crop_cycle_close_plan on 2026-11-19 for a sugarcane field that the
 * farmer can still report as standing (harvest 5 Jan 2027, window to 9 Jan 2027).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  invoke: vi.fn(),
  toast: vi.fn(),
  cached: vi.fn(),
}));

vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'farmer-1', tenantId: 'tenant-1' } }) }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ tenant: { id: 'tenant-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: h.toast }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, a?: string | Record<string, unknown>, b?: Record<string, unknown>) => {
      const opts: Record<string, unknown> = (typeof a === 'object' ? a : b) || {};
      const base = typeof a === 'string' ? a : opts.defaultValue ?? key;
      return String(base).replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => String(opts[k] ?? ''));
    },
  }),
}));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gt', 'order', 'limit']) chain[m] = () => chain;
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: h.rows, error: null }).then(ok);
  return {
    supabase: { from: () => chain, functions: { invoke: h.invoke } },
    getSessionToken: () => 'session-xyz',
  };
});

vi.mock('@/services/localDB', () => ({ localDB: { getProactiveAlerts: h.cached } }));

import { HarvestConfirmPopup } from '@/components/proactive/HarvestConfirmPopup';

const caneCard = {
  id: 'alert-1', land_id: 'land-1', rule_id: 'HARVEST_CONFIRM_QUESTION', status: 'PENDING',
  created_at: '2027-01-06T05:00:00Z', expires_at: '2027-01-15T00:00:00Z',
  trigger_data: { land_name: 'Mala', question: {
    type: 'HARVEST_CONFIRM', land_id: 'land-1', schedule_id: 's-1', crop_code: 'sugarcane', sowing_date: '2025-12-11',
    harvest_date: '2027-01-05', harvest_basis: 'crop_harvest_window', release_on: '2027-01-15', max_expected_date: '2027-01-09',
  } },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2027, 0, 7, 9, 0, 0));   // 7 Jan 2027, local morning
  localStorage.clear();
  h.rows = [caneCard];
  h.invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  h.toast.mockReset();
  h.cached.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

/** The day cell of the month on show (the calendar also shows the neighbours' spill-over days). */
const dayOfShownMonth = (day: string) =>
  screen.getAllByRole('gridcell', { name: day }).find((el) => !String(el.className).includes('day-outside'))!;

describe('HarvestConfirmPopup', () => {
  it('opens on app open with the days left and both answers', async () => {
    render(<HarvestConfirmPopup />);
    expect(await screen.findByText('Is the harvest of Mala done?')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();   // 15 Jan - 7 Jan
    expect(screen.getByText('Harvest done — enter the date')).toBeTruthy();
    expect(screen.getByText('Crop is still in the field')).toBeTruthy();
    expect(screen.getByText('Remind me tomorrow')).toBeTruthy();
    // the auto-release warning is its own line on the card, with the release day
    expect(screen.getByText(/this land will be freed from its crop schedule automatically on/)).toBeTruthy();
  });

  it('offline: the card comes from the phone\'s alert copy (only live harvest cards of this tenant)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    h.rows = [];
    h.cached.mockResolvedValue([
      { ...caneCard, tenant_id: 'tenant-1' },
      { ...caneCard, id: 'other-tenant', land_id: 'land-9', tenant_id: 'tenant-2',
        trigger_data: { ...caneCard.trigger_data, question: { ...caneCard.trigger_data.question, land_id: 'land-9' } } },
      { ...caneCard, id: 'water', rule_id: 'IRRIGATION_TRIGGER_FAO56', tenant_id: 'tenant-1' },
    ]);
    render(<HarvestConfirmPopup />);
    expect(await screen.findByText('Is the harvest of Mala done?')).toBeTruthy();
    expect(h.cached).toHaveBeenCalledWith('farmer-1');
    // one card at a time: after "remind me tomorrow" nothing else is queued (other tenant / other rule dropped)
    fireEvent.click(screen.getByText('Remind me tomorrow'));
    await waitFor(() => expect(screen.queryByText('Is the harvest of Mala done?')).toBeNull());
  });

  it('"remind me tomorrow" closes it and keeps it closed for today', async () => {
    const { unmount } = render(<HarvestConfirmPopup />);
    fireEvent.click(await screen.findByText('Remind me tomorrow'));
    await waitFor(() => expect(screen.queryByText('Is the harvest of Mala done?')).toBeNull());
    unmount();
    render(<HarvestConfirmPopup />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Is the harvest of Mala done?')).toBeNull();
  });

  it('"harvest done" saves the picked date with the session token', async () => {
    render(<HarvestConfirmPopup />);
    fireEvent.click(await screen.findByText('Harvest done — enter the date'));
    fireEvent.click(dayOfShownMonth('6'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    const [fn, req] = h.invoke.mock.calls[0];
    expect(fn).toBe('proactive-question-seed');
    expect(req.body).toEqual({ action: 'harvest_answer', alertId: 'alert-1', landId: 'land-1', harvested: true, date: '2027-01-06' });
    expect(req.headers['x-session-token']).toBe('session-xyz');
    await waitFor(() => expect(screen.queryByText('Is the harvest of Mala done?')).toBeNull());
  });

  it('a refusal from the server is shown in the farmer\'s language and the card stays', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ code: 'HARVEST_DATE_BEFORE_SOWING' }) } } });
    render(<HarvestConfirmPopup />);
    fireEvent.click(await screen.findByText('Harvest done — enter the date'));
    fireEvent.click(dayOfShownMonth('6'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(h.toast.mock.calls[0][0].description).toBe('alerts.harvest.errors.HARVEST_DATE_BEFORE_SOWING');
    expect(screen.getByText('Is the harvest of Mala done?')).toBeTruthy();
  });

  it('no card before the harvest date has passed', async () => {
    vi.setSystemTime(new Date(2027, 0, 5, 9, 0, 0));
    render(<HarvestConfirmPopup />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Is the harvest of Mala done?')).toBeNull();
  });
});

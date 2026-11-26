import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
// The real picker loads states, districts, talukas and villages; here one tap picks a village.
vi.mock('@/components/land/LocationPickerSection', () => ({
  LocationPickerSection: ({ onChange }: { onChange: (v: Record<string, unknown>) => void }) => (
    <button type="button" onClick={() => onChange({ village_id: 'v-2', village: 'Sample Village Two' })}>
      pick-village
    </button>
  ),
}));
vi.mock('@/services/accountReachService', () => {
  class ReachError extends Error {
    code: string;
    nextChangeAt: string | null = null;
    constructor(code: string) { super(code); this.code = code; }
  }
  return { ReachError, accountReachService: { get: mocks.get, set: mocks.set } };
});

// jsdom has no ResizeObserver, which the slider needs.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

import { ReachEditor } from '../ReachEditor';
import { ReachError } from '@/services/accountReachService';
import type { ReachState } from '@/stores/accountStore';

const policy = {
  radius_min_km: 5, radius_max_km: 100, radius_step_km: 5, radius_default_km: 25,
  change_limit_count: 3, change_limit_window_days: 7,
};
const reach = (over: Partial<ReachState>): ReachState => ({
  role: 'SERVICE_PROVIDER', is_set: false, base_village_id: null, radius_km: null, changed_at: null,
  policy, changes_used: 0, changes_remaining: 3, next_change_at: null, ...over,
});

describe('ReachEditor', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('saves the Reach of the open workspace only, with one call', async () => {
    const onSaved = vi.fn();
    mocks.get.mockResolvedValue(reach({}));
    mocks.set.mockResolvedValue(reach({ is_set: true, base_village_id: 'v-2', radius_km: 25 }));
    render(<ReachEditor role="SERVICE_PROVIDER" submitLabel="save" onSaved={onSaved} />);

    fireEvent.click(await screen.findByText('pick-village'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.get).toHaveBeenCalledWith('SERVICE_PROVIDER');
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith('SERVICE_PROVIDER', 'v-2', 25, 'Sample Village Two');
  });

  it('a Reach that is already saved and not changed lets the person continue without a server call', async () => {
    const onSaved = vi.fn();
    const saved = reach({ is_set: true, base_village_id: 'v-1', radius_km: 50, village_name: 'Sample Village' });
    mocks.get.mockResolvedValue(saved);
    render(<ReachEditor role="SERVICE_PROVIDER" initial={saved} submitLabel="save" onSaved={onSaved} />);

    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    fireEvent.click(screen.getByText('save'));

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('a refused save shows the reason and does not report success', async () => {
    const onSaved = vi.fn();
    mocks.get.mockResolvedValue(reach({}));
    mocks.set.mockRejectedValue(new ReachError('REACH_VILLAGE_INVALID'));
    render(<ReachEditor role="CUSTOMER" submitLabel="save" onSaved={onSaved} />);

    fireEvent.click(await screen.findByText('pick-village'));
    fireEvent.click(screen.getByText('save'));

    expect(await screen.findByText('identity.reach.errors.REACH_VILLAGE_INVALID')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

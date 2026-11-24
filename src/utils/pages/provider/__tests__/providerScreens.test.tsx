import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  online: true,
  service: {
    refreshEnabled: vi.fn(), get: vi.fn(), loadCatalogue: vi.fn(), saveProfile: vi.fn(), setAccepting: vi.fn(),
    saveService: vi.fn(), setServiceStatus: vi.fn(), setWorkingHours: vi.fn(), addBlackout: vi.fn(),
    cancelBlackout: vi.fn(), saveEquipment: vi.fn(), removeEquipment: vi.fn(), saveNurseryProduct: vi.fn(),
    saveNurseryBatch: vi.fn(), submitForReview: vi.fn(), cropNames: vi.fn(), cropGroups: vi.fn(), cropsOfGroup: vi.fn(),
  },
}));

// Strings are checked by key, so the tests do not depend on any language.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/i18n/config', () => ({
  default: {
    language: 'en',
    exists: () => true,
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  },
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));
vi.mock('@/components/identity/ReachEditor', () => ({ ReachEditor: () => null }));
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'en', availableLanguages: [{ code: 'en', nativeName: 'English' }], setLanguage: vi.fn(),
  }),
}));
vi.mock('@/services/providerWorkspaceService', () => {
  class ProviderError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  }
  return { ProviderError, providerWorkspaceService: mocks.service, localName: () => '' };
});

// jsdom has no ResizeObserver, which some of the UI primitives need.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

import ProviderHome from '../ProviderHome';
import ProviderServiceForm from '../ProviderServiceForm';
import ProviderHours from '../ProviderHours';
import ProviderDaysOff from '../ProviderDaysOff';
import { ProviderFlagGate } from '@/components/provider/ProviderFlagGate';
import { useProviderStore } from '@/stores/providerStore';
import { useAccountStore } from '@/stores/accountStore';
import { ProviderError } from '@/services/providerWorkspaceService';

const catalogue = {
  categories: [
    { code: 'LAND_PREP', parent_code: null, label_en: 'Land preparation' },
    { code: 'PLOUGHING', parent_code: 'LAND_PREP', label_en: 'Ploughing' },
  ],
  pricingUnits: [
    { code: 'PER_ACRE', label_en: 'Per acre', is_per_area: true, is_negotiable: false },
    { code: 'NEGOTIABLE', label_en: 'Negotiable', is_per_area: false, is_negotiable: true },
  ],
  equipmentTypes: [], providerTypes: [{ code: 'INDIVIDUAL', label_en: 'Individual' }],
  skillTiers: [], nurseryItemKinds: [], paymentMethods: [{ code: 'CASH', label_en: 'Cash' }],
};
const profile = {
  provider_type: 'INDIVIDUAL', public_name: 'Test Provider', experience_years: 3, about_text: null,
  about_language: null, languages_spoken: ['en'], accepts_requests: true, listing_status: 'DRAFT',
  submitted_at: null, listed_at: null, review_note_code: null, verification_level: null,
  rating_average: null, rating_count: 0, jobs_completed: 0,
};
const workspace = (over: Record<string, unknown> = {}) => ({
  profile: null, availability: { state: 'OFFLINE', next_free_date: null }, reach_set: false,
  services: [], working_hours: [], blackouts: [], equipment: [], nursery_products: [],
  policy: { lead_time_days_default: 1, same_day_cutoff: '16:00', max_services: 50, max_blackout_days: 90 },
  ...over,
});

/** The server answers every read with this workspace. */
function serverHolds(ws: ReturnType<typeof workspace>) {
  mocks.service.get.mockImplementation(async () => { useProviderStore.getState().setWorkspace(ws as never); return ws; });
  mocks.service.loadCatalogue.mockImplementation(async () => { useProviderStore.getState().setCatalogue(catalogue as never); return catalogue; });
}

function renderAt(path: string, element: JSX.Element, route = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
        <Route path="*" element={<p>other-screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Provider Workspace screens', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.online = true;
    localStorage.clear();
    act(() => {
      useProviderStore.setState({ enabled: true, workspace: null, catalogue: null });
      useAccountStore.getState().clear();
    });
  });

  describe('the flag gate', () => {
    it('shows the fallback while the flag is off and the screen while it is on', () => {
      act(() => useProviderStore.setState({ enabled: false }));
      const view = render(
        <MemoryRouter><ProviderFlagGate fallback={<p>task-1-shell</p>}><p>provider-screen</p></ProviderFlagGate></MemoryRouter>,
      );
      expect(view.queryByText('task-1-shell')).not.toBeNull();
      expect(view.queryByText('provider-screen')).toBeNull();
      act(() => useProviderStore.setState({ enabled: true }));
      expect(view.queryByText('provider-screen')).not.toBeNull();
    });

    it('sends a business route back to the provider home while the flag is off', () => {
      act(() => useProviderStore.setState({ enabled: false }));
      render(
        <MemoryRouter initialEntries={['/provider/business/services']}>
          <Routes>
            <Route path="/provider" element={<p>provider-home</p>} />
            <Route path="/provider/business/services" element={<ProviderFlagGate><p>services-screen</p></ProviderFlagGate>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.queryByText('provider-home')).not.toBeNull();
      expect(screen.queryByText('services-screen')).toBeNull();
    });
  });

  describe('home', () => {
    it('keeps "send for review" closed until profile, service, hours and area are all there', async () => {
      serverHolds(workspace({ profile }));
      renderAt('/provider', <ProviderHome />);
      const submit = await screen.findByText('provider.setup.submit');
      expect((submit.closest('button') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByText('provider.setup.submitHint')).not.toBeNull();
      expect(screen.getAllByText('provider.setup.steps.profile.done')).toHaveLength(1);
      expect(screen.getAllByText('provider.setup.steps.service.todo')).toHaveLength(1);
    });

    it('sends the listing for review once every step is done', async () => {
      const ready = workspace({
        profile, reach_set: true,
        services: [{ id: 's1', status: 'ACTIVE' }],
        working_hours: [{ weekday: 1, is_working: true, start_time: '07:00', end_time: '18:00' }],
        availability: { state: 'AVAILABLE', next_free_date: '2027-01-10' },
      });
      serverHolds(ready);
      mocks.service.submitForReview.mockResolvedValue(ready);
      renderAt('/provider', <ProviderHome />);
      const submit = (await screen.findByText('provider.setup.submit')).closest('button') as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
      fireEvent.click(submit);
      await waitFor(() => expect(mocks.service.submitForReview).toHaveBeenCalledTimes(1));
    });

    it('locks the service and hours steps until the business profile exists', async () => {
      serverHolds(workspace());
      renderAt('/provider', <ProviderHome />);
      const service = (await screen.findByText('provider.setup.steps.service.title')).closest('button') as HTMLButtonElement;
      const business = screen.getByText('provider.setup.steps.profile.title').closest('button') as HTMLButtonElement;
      expect(service.disabled).toBe(true);
      expect(business.disabled).toBe(false);
      // No accepting switch before there is a profile to switch.
      expect(screen.queryByRole('switch')).toBeNull();
    });

    it('shows the state the server worked out and flips "take new requests" through the server', async () => {
      const ws = workspace({ profile, availability: { state: 'BUSY', next_free_date: '2027-01-12' } });
      serverHolds(ws);
      mocks.service.setAccepting.mockResolvedValue(ws);
      renderAt('/provider', <ProviderHome />);
      expect(await screen.findByText('provider.availability.busyUntil')).not.toBeNull();
      fireEvent.click(screen.getByRole('switch'));
      await waitFor(() => expect(mocks.service.setAccepting).toHaveBeenCalledWith(false));
    });

    it('shows the listing status instead of the steps after the listing was sent', async () => {
      serverHolds(workspace({ profile: { ...profile, listing_status: 'PENDING_REVIEW' } }));
      renderAt('/provider', <ProviderHome />);
      expect(await screen.findByText('provider.listing.PENDING_REVIEW.name')).not.toBeNull();
      expect(screen.queryByText('provider.setup.submit')).toBeNull();
    });

    it('shows the error of a refused write', async () => {
      const ws = workspace({ profile });
      serverHolds(ws);
      mocks.service.setAccepting.mockRejectedValue(new ProviderError('PROVIDER_PROFILE_MISSING' as never));
      renderAt('/provider', <ProviderHome />);
      fireEvent.click(await screen.findByRole('switch'));
      expect(await screen.findByText('provider.errors.PROVIDER_PROFILE_MISSING')).not.toBeNull();
    });

    it('does not ask the server and closes every control without a network', async () => {
      mocks.online = false;
      act(() => useProviderStore.getState().setWorkspace(workspace({ profile }) as never));
      renderAt('/provider', <ProviderHome />);
      expect(await screen.findByText('provider.common.offline')).not.toBeNull();
      expect(mocks.service.get).not.toHaveBeenCalled();
      expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('service form', () => {
    const open = async () => {
      serverHolds(workspace({ profile }));
      renderAt('/provider/business/services/new', <ProviderServiceForm />);
      fireEvent.change(await screen.findByLabelText('provider.services.familyLabel'), { target: { value: 'LAND_PREP' } });
      fireEvent.change(screen.getByLabelText('provider.services.categoryLabel'), { target: { value: 'PLOUGHING' } });
    };
    const saveButton = () => screen.getByText('provider.common.save').closest('button') as HTMLButtonElement;

    it('names the service after the chosen category and needs a rate for a priced unit', async () => {
      await open();
      expect((screen.getByLabelText('provider.services.titleLabel') as HTMLInputElement).value).toBe('Ploughing');
      fireEvent.change(screen.getByLabelText('provider.services.unitLabel'), { target: { value: 'PER_ACRE' } });
      expect(saveButton().disabled).toBe(true);

      fireEvent.change(screen.getByLabelText('provider.services.rateLabel'), { target: { value: '1200' } });
      expect(saveButton().disabled).toBe(false);
      mocks.service.saveService.mockResolvedValue(workspace({ profile }));
      fireEvent.click(saveButton());
      await waitFor(() => expect(mocks.service.saveService).toHaveBeenCalledTimes(1));
      expect(mocks.service.saveService.mock.calls[0][0]).toMatchObject({
        category_code: 'PLOUGHING', title: 'Ploughing', pricing_unit: 'PER_ACRE', base_rate: 1200,
        min_charge: null, capacity_value: null, capacity_unit: null, capacity_period: null,
        season_start_month: null, season_end_month: null, payment_methods: [],
      });
      expect(mocks.service.saveService.mock.calls[0][0]).not.toHaveProperty('id');
      expect(await screen.findByText('other-screen')).not.toBeNull();
    });

    it('asks for no rate and sends none when the price is open to discussion', async () => {
      await open();
      fireEvent.change(screen.getByLabelText('provider.services.unitLabel'), { target: { value: 'NEGOTIABLE' } });
      expect(screen.queryByLabelText('provider.services.rateLabel')).toBeNull();
      mocks.service.saveService.mockResolvedValue(workspace({ profile }));
      fireEvent.click(saveButton());
      await waitFor(() => expect(mocks.service.saveService).toHaveBeenCalledTimes(1));
      expect(mocks.service.saveService.mock.calls[0][0]).toMatchObject({ pricing_unit: 'NEGOTIABLE', base_rate: null });
    });

    it('stays on the form and shows the reason when the server refuses', async () => {
      await open();
      fireEvent.change(screen.getByLabelText('provider.services.unitLabel'), { target: { value: 'NEGOTIABLE' } });
      mocks.service.saveService.mockRejectedValue(new ProviderError('PROVIDER_LIMIT_REACHED' as never));
      fireEvent.click(saveButton());
      expect(await screen.findByText('provider.errors.PROVIDER_LIMIT_REACHED')).not.toBeNull();
      expect(screen.queryByText('other-screen')).toBeNull();
    });
  });

  describe('working hours', () => {
    it('starts with every day off, refuses an end before the start, and saves all seven days', async () => {
      serverHolds(workspace({ profile }));
      renderAt('/provider/business/hours', <ProviderHours />);
      const switches = await screen.findAllByRole('switch');
      expect(switches).toHaveLength(7);
      expect(switches.every((s) => s.getAttribute('aria-checked') === 'false')).toBe(true);

      fireEvent.click(switches[1]); // weekday 1
      const save = screen.getByText('provider.common.save').closest('button') as HTMLButtonElement;
      expect(save.disabled).toBe(true); // a working day without times
      fireEvent.change(screen.getByLabelText('provider.hours.from'), { target: { value: '18:00' } });
      fireEvent.change(screen.getByLabelText('provider.hours.to'), { target: { value: '07:00' } });
      expect(screen.queryByText('provider.hours.invalid')).not.toBeNull();
      expect(save.disabled).toBe(true);

      fireEvent.change(screen.getByLabelText('provider.hours.from'), { target: { value: '07:00' } });
      fireEvent.change(screen.getByLabelText('provider.hours.to'), { target: { value: '18:00' } });
      expect(save.disabled).toBe(false);
      mocks.service.setWorkingHours.mockResolvedValue(workspace({ profile }));
      fireEvent.click(save);
      await waitFor(() => expect(mocks.service.setWorkingHours).toHaveBeenCalledTimes(1));
      const days = mocks.service.setWorkingHours.mock.calls[0][0];
      expect(days).toHaveLength(7);
      expect(days[1]).toEqual({ weekday: 1, is_working: true, start_time: '07:00', end_time: '18:00' });
      expect(days[0]).toEqual({ weekday: 0, is_working: false, start_time: null, end_time: null });
    });
  });

  describe('busy days', () => {
    it('blocks whole days: from the start of the first day to the start of the day after the last', async () => {
      serverHolds(workspace({ profile }));
      mocks.service.addBlackout.mockResolvedValue(workspace({ profile }));
      renderAt('/provider/business/days-off', <ProviderDaysOff />);
      const from = await screen.findByLabelText('provider.daysOff.from');
      const year = new Date().getFullYear() + 1;
      fireEvent.change(from, { target: { value: `${year}-03-10` } });
      fireEvent.change(screen.getByLabelText('provider.daysOff.to'), { target: { value: `${year}-03-12` } });
      fireEvent.change(screen.getByLabelText('provider.daysOff.reasonLabel'), { target: { value: 'MAINTENANCE' } });
      fireEvent.click(screen.getByText('provider.daysOff.add'));
      await waitFor(() => expect(mocks.service.addBlackout).toHaveBeenCalledTimes(1));
      const [start, end, reason] = mocks.service.addBlackout.mock.calls[0];
      expect(start).toEqual(new Date(`${year}-03-10T00:00:00`));
      expect(end).toEqual(new Date(`${year}-03-13T00:00:00`));
      expect(reason).toBe('MAINTENANCE');
    });

    it('refuses a period longer than the policy allows', async () => {
      serverHolds(workspace({ profile }));
      renderAt('/provider/business/days-off', <ProviderDaysOff />);
      const from = await screen.findByLabelText('provider.daysOff.from');
      const year = new Date().getFullYear() + 1;
      fireEvent.change(from, { target: { value: `${year}-01-01` } });
      fireEvent.change(screen.getByLabelText('provider.daysOff.to'), { target: { value: `${year}-06-01` } });
      expect(screen.queryByText('provider.daysOff.invalid')).not.toBeNull();
      expect((screen.getByText('provider.daysOff.add').closest('button') as HTMLButtonElement).disabled).toBe(true);
    });

    it('lets the provider lift an own entry but not one that came from a booked job', async () => {
      const ws = workspace({
        profile,
        blackouts: [
          { id: 'b-own', from: '2027-02-01T00:00:00Z', to: '2027-02-03T00:00:00Z', source: 'MANUAL', reason_code: null },
          { id: 'b-job', from: '2027-02-10T00:00:00Z', to: '2027-02-11T00:00:00Z', source: 'JOB', reason_code: null },
        ],
      });
      serverHolds(ws);
      mocks.service.cancelBlackout.mockResolvedValue(ws);
      renderAt('/provider/business/days-off', <ProviderDaysOff />);
      const lift = await screen.findAllByText('provider.daysOff.cancel');
      expect(lift).toHaveLength(1);
      expect(screen.queryByText('provider.daysOff.fromJob')).not.toBeNull();
      fireEvent.click(lift[0]);
      await waitFor(() => expect(mocks.service.cancelBlackout).toHaveBeenCalledWith('b-own'));
    });
  });
});

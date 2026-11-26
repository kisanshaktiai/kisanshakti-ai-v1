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
    varietiesOfCrop: vi.fn(), removeNurseryPhoto: vi.fn(),
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
vi.mock('@/services/nurseryPhotoService', () => ({
  nurseryPhotoUrl: (path: string) => `https://photos.test/${path}`,
  nurseryPhotoService: { add: vi.fn(), remove: vi.fn() },
  NurseryPhotoError: class extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
}));
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
  const localName = (names: Record<string, string> | undefined, language: string) => names?.[language] ?? names?.default ?? '';
  return { ProviderError, providerWorkspaceService: mocks.service, localName };
});

// jsdom has no ResizeObserver, which some of the UI primitives need.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

import ProviderHome from '../ProviderHome';
import ProviderServiceForm from '../ProviderServiceForm';
import ProviderHours from '../ProviderHours';
import ProviderDaysOff from '../ProviderDaysOff';
import ProviderNursery from '../ProviderNursery';
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
    { code: 'PER_PIECE', label_en: 'Per piece', is_per_area: false, is_negotiable: false },
    { code: 'NEGOTIABLE', label_en: 'Negotiable', is_per_area: false, is_negotiable: true },
  ],
  equipmentTypes: [], providerTypes: [{ code: 'INDIVIDUAL', label_en: 'Individual' }],
  skillTiers: [], nurseryItemKinds: [{ code: 'SEEDLING', label_en: 'Seedling' }], paymentMethods: [{ code: 'CASH', label_en: 'Cash' }],
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
      // The main button leads to the next missing step; "send for review" waits until all are done.
      expect(await screen.findByText('provider.setup.next')).not.toBeNull();
      expect(screen.queryByText('provider.setup.submit')).toBeNull();
      expect(screen.queryByText('provider.setup.submitHint')).not.toBeNull();
      expect(screen.getAllByLabelText('provider.setup.steps.profile.title: provider.setup.steps.profile.done')).toHaveLength(1);
      expect(screen.getAllByLabelText('provider.setup.steps.service.title: provider.setup.steps.service.todo')).toHaveLength(1);
    });

    const readySetup = {
      reach_set: true,
      services: [{ id: 's1', status: 'ACTIVE' }],
      working_hours: [{ weekday: 1, is_working: true, start_time: '07:00', end_time: '18:00' }],
      availability: { state: 'AVAILABLE', next_free_date: '2027-01-10' },
    };

    it('asks for the listing by itself, once, as soon as every step is done', async () => {
      const ready = workspace({ profile, ...readySetup });
      serverHolds(ready);
      // the real service keeps the store current with what the server answers; the mock does the same
      mocks.service.submitForReview.mockImplementation(async () => {
        const listed = workspace({ profile: { ...profile, listing_status: 'LISTED' }, ...readySetup });
        useProviderStore.getState().setWorkspace(listed as never);
        return listed;
      });
      renderAt('/provider', <ProviderHome />);
      await waitFor(() => expect(mocks.service.submitForReview).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('provider.listing.LISTED.name')).not.toBeNull();
      expect(screen.queryByText('provider.setup.submit')).toBeNull();
      expect(mocks.service.submitForReview).toHaveBeenCalledTimes(1);
    });

    it('does not ask while a step is missing, and a refusal leaves the button for another try', async () => {
      serverHolds(workspace({ profile, ...readySetup, working_hours: [] }));
      renderAt('/provider', <ProviderHome />);
      await screen.findByText('provider.setup.submitHint');
      expect(mocks.service.submitForReview).not.toHaveBeenCalled();
      cleanup();

      serverHolds(workspace({ profile, ...readySetup }));
      mocks.service.submitForReview.mockRejectedValue({ code: 'PROVIDER_HOURS_NOT_SET' });
      renderAt('/provider', <ProviderHome />);
      expect(await screen.findByText('provider.errors.PROVIDER_HOURS_NOT_SET')).not.toBeNull();
      expect(mocks.service.submitForReview).toHaveBeenCalledTimes(1);
      const submit = screen.getByText('provider.setup.submit').closest('button') as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
      fireEvent.click(submit);
      await waitFor(() => expect(mocks.service.submitForReview).toHaveBeenCalledTimes(2));
    });

    it('leaves a listing the reviewer sent back for the provider to send himself', async () => {
      serverHolds(workspace({ profile: { ...profile, review_note_code: 'DETAILS_UNCLEAR' }, ...readySetup }));
      renderAt('/provider', <ProviderHome />);
      const submit = (await screen.findByText('provider.setup.submit')).closest('button') as HTMLButtonElement;
      expect(mocks.service.submitForReview).not.toHaveBeenCalled();
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
    const next = () => screen.getByText('provider.common.next').closest('button') as HTMLButtonElement;
    const saveButton = () => screen.getByText('provider.common.save').closest('button') as HTMLButtonElement;
    /** Step 1: pick the kind of work by its tile, then the service by its chip, then go on. */
    const open = async () => {
      serverHolds(workspace({ profile }));
      renderAt('/provider/business/services/new', <ProviderServiceForm />);
      const family = await screen.findByText('Land preparation');
      expect(next().disabled).toBe(true);
      fireEvent.click(family);
      fireEvent.click(screen.getByText('Ploughing'));
      expect(next().disabled).toBe(false);
      fireEvent.click(next());
    };

    it('asks the work, then the rate, then the name, and names the service after the chosen service', async () => {
      await open();
      // Step 2: a priced unit needs a rate before going on.
      expect(next().disabled).toBe(true);
      fireEvent.click(screen.getByText('Per acre'));
      expect(next().disabled).toBe(true);
      fireEvent.change(screen.getByLabelText('provider.services.rateLabel'), { target: { value: '1200' } });
      expect(next().disabled).toBe(false);
      fireEvent.click(next());
      // Step 3: the name follows the chosen service.
      expect((screen.getByLabelText('provider.services.titleLabel') as HTMLInputElement).value).toBe('Ploughing');
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

    it('sets the rate with the plus button in steps of fifty', async () => {
      await open();
      fireEvent.click(screen.getByText('Per acre'));
      fireEvent.click(screen.getByLabelText('provider.common.more'));
      fireEvent.click(screen.getByLabelText('provider.common.more'));
      expect((screen.getByLabelText('provider.services.rateLabel') as HTMLInputElement).value).toBe('100');
      fireEvent.click(screen.getByLabelText('provider.common.less'));
      expect((screen.getByLabelText('provider.services.rateLabel') as HTMLInputElement).value).toBe('50');
    });

    it('asks for no rate and sends none when the price is open to discussion', async () => {
      await open();
      fireEvent.click(screen.getByText('provider.services.otherUnits'));
      fireEvent.click(screen.getByText('Negotiable'));
      expect(screen.queryByLabelText('provider.services.rateLabel')).toBeNull();
      fireEvent.click(next());
      mocks.service.saveService.mockResolvedValue(workspace({ profile }));
      fireEvent.click(saveButton());
      await waitFor(() => expect(mocks.service.saveService).toHaveBeenCalledTimes(1));
      expect(mocks.service.saveService.mock.calls[0][0]).toMatchObject({ pricing_unit: 'NEGOTIABLE', base_rate: null });
    });

    it('stays on the form and shows the reason when the server refuses', async () => {
      await open();
      fireEvent.click(screen.getByText('provider.services.otherUnits'));
      fireEvent.click(screen.getByText('Negotiable'));
      fireEvent.click(next());
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
      const days = await screen.findAllByRole('button', { pressed: false });
      expect(days.filter((d) => d.getAttribute('aria-label'))).toHaveLength(7);
      expect(screen.queryByText('provider.hours.noDays')).not.toBeNull();

      // Monday is the first tile shown; weekday 1 on the server.
      fireEvent.click(days[0]);
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
      const sent = mocks.service.setWorkingHours.mock.calls[0][0];
      expect(sent).toHaveLength(7);
      expect(sent[1]).toEqual({ weekday: 1, is_working: true, start_time: '07:00', end_time: '18:00' });
      expect(sent[0]).toEqual({ weekday: 0, is_working: false, start_time: null, end_time: null });
    });

    it('gives a day switched on later the same times as the others', async () => {
      serverHolds(workspace({ profile }));
      renderAt('/provider/business/hours', <ProviderHours />);
      const days = await screen.findAllByRole('button', { pressed: false });
      fireEvent.click(days[0]);
      fireEvent.click(screen.getByText('provider.hours.useUsual'));
      fireEvent.click(days[1]);
      mocks.service.setWorkingHours.mockResolvedValue(workspace({ profile }));
      fireEvent.click(screen.getByText('provider.common.save'));
      await waitFor(() => expect(mocks.service.setWorkingHours).toHaveBeenCalledTimes(1));
      const sent = mocks.service.setWorkingHours.mock.calls[0][0];
      expect(sent[1]).toEqual({ weekday: 1, is_working: true, start_time: '08:00', end_time: '18:00' });
      expect(sent[2]).toEqual({ weekday: 2, is_working: true, start_time: '08:00', end_time: '18:00' });
    });
  });

  describe('nursery store', () => {
    const plant = {
      id: 'np-1', crop_id: 'c-1', variety_id: null, variety_name_local: 'Local Name', item_kind: 'SEEDLING',
      pricing_unit: 'PER_PIECE', price: 2, currency: 'INR', min_order_qty: null, description: 'Healthy plants',
      description_language: 'en', photo_paths: ['t/a/np-1/one.jpg'], status: 'ACTIVE',
      batches: [{ id: 'b-1', total_qty: 100, reserved_qty: 40, ready_date: '2027-01-15', status: 'ACTIVE' }],
    };

    it('adds a plant with a typed variety and a note, in the language in use', async () => {
      serverHolds(workspace({ profile }));
      mocks.service.cropGroups.mockResolvedValue([{ id: 'g-1', names: { default: 'Vegetables' } }]);
      mocks.service.cropsOfGroup.mockResolvedValue([{ id: 'c-1', names: { default: 'Test Crop One' } }]);
      mocks.service.varietiesOfCrop.mockResolvedValue([{ id: 'v-1', names: { default: 'Variety One' } }]);
      mocks.service.saveNurseryProduct.mockResolvedValue(workspace({ profile }));
      renderAt('/provider/business/nursery', <ProviderNursery />);
      fireEvent.click(await screen.findByText('provider.nursery.add'));
      fireEvent.change(await screen.findByLabelText('provider.nursery.groupLabel'), { target: { value: 'g-1' } });
      fireEvent.change(await screen.findByLabelText('provider.nursery.cropLabel'), { target: { value: 'c-1' } });
      expect(await screen.findByText('Variety One')).not.toBeNull();
      fireEvent.click(screen.getByText('provider.nursery.varietyOther'));
      fireEvent.change(screen.getByLabelText('provider.nursery.varietyNameLabel'), { target: { value: '  My Local Variety ' } });
      fireEvent.click(screen.getByText('Seedling'));
      fireEvent.click(screen.getByText('Per piece'));
      fireEvent.change(screen.getByLabelText('provider.nursery.priceLabel'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('provider.nursery.descriptionLabel'), { target: { value: 'Healthy plants' } });
      fireEvent.click(screen.getByText('provider.common.save'));
      await waitFor(() => expect(mocks.service.saveNurseryProduct).toHaveBeenCalledTimes(1));
      expect(mocks.service.saveNurseryProduct.mock.calls[0][0]).toMatchObject({
        crop_id: 'c-1', variety_id: null, variety_name_local: 'My Local Variety', item_kind: 'SEEDLING',
        pricing_unit: 'PER_PIECE', price: 2, description: 'Healthy plants', description_language: 'en',
      });
    });

    it('sends the master variety and no local name when one from the list is chosen', async () => {
      serverHolds(workspace({ profile }));
      mocks.service.cropGroups.mockResolvedValue([{ id: 'g-1', names: { default: 'Vegetables' } }]);
      mocks.service.cropsOfGroup.mockResolvedValue([{ id: 'c-1', names: { default: 'Test Crop One' } }]);
      mocks.service.varietiesOfCrop.mockResolvedValue([{ id: 'v-1', names: { default: 'Variety One' } }]);
      mocks.service.saveNurseryProduct.mockResolvedValue(workspace({ profile }));
      renderAt('/provider/business/nursery', <ProviderNursery />);
      fireEvent.click(await screen.findByText('provider.nursery.add'));
      fireEvent.change(await screen.findByLabelText('provider.nursery.groupLabel'), { target: { value: 'g-1' } });
      fireEvent.change(await screen.findByLabelText('provider.nursery.cropLabel'), { target: { value: 'c-1' } });
      fireEvent.click(await screen.findByText('Variety One'));
      fireEvent.click(screen.getByText('Seedling'));
      fireEvent.click(screen.getByText('Per piece'));
      fireEvent.change(screen.getByLabelText('provider.nursery.priceLabel'), { target: { value: '2' } });
      fireEvent.click(screen.getByText('provider.common.save'));
      await waitFor(() => expect(mocks.service.saveNurseryProduct).toHaveBeenCalledTimes(1));
      expect(mocks.service.saveNurseryProduct.mock.calls[0][0]).toMatchObject({ variety_id: 'v-1', variety_name_local: null, description: null, description_language: null });
    });

    it('shows the plant with its photo, variety, note and stock bar, and offers to add a photo while under three', async () => {
      serverHolds(workspace({ profile, nursery_products: [plant] }));
      mocks.service.cropNames.mockResolvedValue({ 'c-1': { default: 'Test Crop One' } });
      renderAt('/provider/business/nursery', <ProviderNursery />);
      expect(await screen.findByText('Test Crop One')).not.toBeNull();
      expect(screen.queryByText(/Local Name/)).not.toBeNull();
      expect(document.querySelectorAll('img[src^="https://photos.test/"]')).toHaveLength(2); // card picture and the strip
      expect(screen.queryByText('provider.nursery.addPhoto')).not.toBeNull();
      expect(screen.getAllByLabelText('provider.nursery.removePhoto')).toHaveLength(1);
      expect(screen.queryByText('provider.nursery.inStock')).not.toBeNull();
      expect(screen.queryAllByText('provider.nursery.batchReserved').length).toBeGreaterThan(0);
    });

    it('hides "add photo" once a plant has three', async () => {
      serverHolds(workspace({ profile, nursery_products: [{ ...plant, photo_paths: ['a/1.jpg', 'a/2.jpg', 'a/3.jpg'] }] }));
      mocks.service.cropNames.mockResolvedValue({ 'c-1': { default: 'Test Crop One' } });
      renderAt('/provider/business/nursery', <ProviderNursery />);
      expect(await screen.findByText('Test Crop One')).not.toBeNull();
      expect(screen.queryByText('provider.nursery.addPhoto')).toBeNull();
      expect(screen.getAllByLabelText('provider.nursery.removePhoto')).toHaveLength(3);
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
      fireEvent.click(screen.getByText('provider.daysOff.reasons.MAINTENANCE'));
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

    it('offers today and the next days as one tap', async () => {
      serverHolds(workspace({ profile }));
      mocks.service.addBlackout.mockResolvedValue(workspace({ profile }));
      renderAt('/provider/business/days-off', <ProviderDaysOff />);
      fireEvent.click(await screen.findByText('provider.daysOff.quick.tomorrow'));
      fireEvent.click(screen.getByText('provider.daysOff.add'));
      await waitFor(() => expect(mocks.service.addBlackout).toHaveBeenCalledTimes(1));
      const [start, end] = mocks.service.addBlackout.mock.calls[0];
      expect((end.getTime() - start.getTime()) / 86_400_000).toBe(1);
      expect(start.getTime()).toBeGreaterThan(Date.now());
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

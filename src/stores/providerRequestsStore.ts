import { create } from 'zustand';
import type { ProviderInbox } from '@/services/providerRequestsService';

/**
 * The provider's requests as the server returned them last: new ones to
 * answer, answers waiting for the farmer, booked jobs and recent past ones.
 * Kept in memory only (it carries booked farmers' contact); cleared on logout.
 */
interface ProviderRequestsState {
  inbox: ProviderInbox | null;
  setInbox: (inbox: ProviderInbox | null) => void;
}

export const useProviderRequestsStore = create<ProviderRequestsState>()((set) => ({
  inbox: null,
  setInbox: (inbox) => set({ inbox }),
}));

// Same event the account store listens to (see accountStore.ts).
if (typeof window !== 'undefined') {
  window.addEventListener('ks:auth-logout', () => useProviderRequestsStore.setState({ inbox: null }));
}

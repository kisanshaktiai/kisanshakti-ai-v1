import { create } from 'zustand';
import type { NearbyFamilies } from '@/services/farmServicesService';

/**
 * What the farmer is about to ask for, carried from the provider card or the
 * nursery store to the "ask" screen, and the last "near me" answer so the home
 * block shows at once. Kept in memory only; cleared on logout.
 */
export interface AskDraft {
  kind: 'SERVICE' | 'NURSERY';
  familyCode: string;
  /** The one provider asked; absent when the request goes to everyone near the land. */
  provider?: { accountId: string; name: string };
  /** A provider's own service (one provider). */
  service?: { id: string; title: string; categoryCode: string; rate: number | null; unit: string; currency: string };
  /** Services to choose from when asking everyone: what the nearby providers offer. */
  categories?: { code: string; unit: string }[];
  /** A nursery plant. */
  plant?: {
    productId: string; cropName: string; variety: string; price: number | null; unit: string; currency: string;
    minOrder: number | null; availableNow: number; firstReadyDate: string | null; photoPath: string | null;
  };
}

interface FarmServicesState {
  draft: AskDraft | null;
  nearby: NearbyFamilies | null;
  setDraft: (draft: AskDraft | null) => void;
  setNearby: (nearby: NearbyFamilies | null) => void;
}

export const useFarmServicesStore = create<FarmServicesState>()((set) => ({
  draft: null,
  nearby: null,
  setDraft: (draft) => set({ draft }),
  setNearby: (nearby) => set({ nearby }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('ks:auth-logout', () => useFarmServicesStore.setState({ draft: null, nearby: null }));
}

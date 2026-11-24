import { create } from 'zustand';
import type { ProviderCatalogue, ProviderWorkspace } from '@/services/providerWorkspaceService';

/**
 * providerStore — the Provider Workspace of the person who is logged in: the
 * answer to "is the provider_workspace flag on for my tenant", the business
 * the server returned last, and the catalogue (lookup rows).
 *
 * Nothing here is written to disk except the flag answer, which is remembered
 * so the right home opens at once on the next start; the server is asked again
 * every time the workspace opens.
 */

const ENABLED_KEY = 'ks_provider_workspace';

function readEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === 'true'; } catch { return false; }
}

interface ProviderState {
  enabled: boolean;
  workspace: ProviderWorkspace | null;
  catalogue: ProviderCatalogue | null;
  setEnabled: (enabled: boolean) => void;
  setWorkspace: (workspace: ProviderWorkspace) => void;
  setCatalogue: (catalogue: ProviderCatalogue) => void;
  clear: () => void;
}

export const useProviderStore = create<ProviderState>()((set) => ({
  enabled: readEnabled(),
  workspace: null,
  catalogue: null,

  setEnabled: (enabled) => {
    try {
      if (enabled) localStorage.setItem(ENABLED_KEY, 'true');
      else localStorage.removeItem(ENABLED_KEY);
    } catch { /* storage unavailable */ }
    set({ enabled });
  },
  setWorkspace: (workspace) => set({ workspace }),
  setCatalogue: (catalogue) => set({ catalogue }),

  /** Logout: the business leaves the device; the catalogue is not personal. */
  clear: () => {
    try { localStorage.removeItem(ENABLED_KEY); } catch { /* storage unavailable */ }
    set({ enabled: false, workspace: null });
  },
}));

// Same event the account store listens to (see accountStore.ts).
if (typeof window !== 'undefined') {
  window.addEventListener('ks:auth-logout', () => useProviderStore.getState().clear());
}

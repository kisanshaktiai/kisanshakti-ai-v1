import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccountRole, AccountSummary } from '@/lib/accountRoles';

/**
 * accountStore — the person behind the session, for the multi-role identity.
 *
 * It sits BESIDE authStore and never replaces it:
 *   - authStore keeps holding the farmer (user + session) exactly as before and
 *     is only filled while the Farmer workspace is open;
 *   - accountStore holds the account (id, roles, active role) and the session
 *     token for every workspace, and is the offline cache of the account id and
 *     roles (persisted under 'account-storage').
 *
 * With the multi-role flag off the server sends no account, this store stays
 * empty, and nothing that reads it changes behaviour.
 */

export interface ReachPolicy {
  radius_min_km: number;
  radius_max_km: number;
  radius_step_km: number;
  radius_default_km: number;
  change_limit_count: number;
  change_limit_window_days: number;
}

export interface ReachState {
  role: AccountRole;
  is_set: boolean;
  base_village_id: string | null;
  radius_km: number | null;
  changed_at: string | null;
  policy: ReachPolicy;
  changes_used: number;
  changes_remaining: number;
  next_change_at: string | null;
  /** Filled on the device for display; the server stores only the village id. */
  village_name?: string | null;
}

interface AccountState {
  account: AccountSummary | null;
  token: string | null;
  expiresAt: string | null;
  reach: Partial<Record<AccountRole, ReachState>>;

  setAccountSession: (account: AccountSummary, token: string, expiresAt: string | null) => void;
  setAccount: (account: AccountSummary) => void;
  setReach: (role: AccountRole, reach: ReachState) => void;
  isLive: () => boolean;
  clear: () => void;
}

const EMPTY = { account: null, token: null, expiresAt: null, reach: {} };

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      setAccountSession: (account, token, expiresAt) => {
        const sameAccount = get().account?.id === account.id;
        set({ account, token, expiresAt, reach: sameAccount ? get().reach : {} });
      },

      setAccount: (account) => set({ account }),

      setReach: (role, reach) => set({ reach: { ...get().reach, [role]: reach } }),

      /** A session is usable while it has an account, a token and has not expired. */
      isLive: () => {
        const { account, token, expiresAt } = get();
        if (!account || !token) return false;
        if (!expiresAt) return true;
        return new Date(expiresAt).getTime() > Date.now();
      },

      clear: () => set({ ...EMPTY }),
    }),
    {
      name: 'account-storage',
      partialize: (state) => ({
        account: state.account,
        token: state.token,
        expiresAt: state.expiresAt,
        reach: state.reach,
      }),
    },
  ),
);

// The farmer logout (authStore.logout) announces itself with this event; the
// account must leave the device at the same moment, whichever workspace the
// logout was pressed in.
if (typeof window !== 'undefined') {
  window.addEventListener('ks:auth-logout', () => useAccountStore.getState().clear());
}

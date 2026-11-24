/**
 * accountSessionService — turns the auth core's replies into device state for
 * the multi-role identity, and moves a session between workspaces.
 *
 * Rule that keeps the farmer app untouched:
 *   authStore (user + session) is filled ONLY while the Farmer workspace is
 *   open. In the Provider or Customer workspace it is left empty, so the farmer
 *   sync, realtime and offline machinery — all keyed on authStore — stay idle.
 *
 * Flag off: the server sends no `account`, applyAuthResult() returns null and
 * every caller continues with the code it ran before.
 */
import {
  setSessionToken,
  getSessionToken,
  updateSupabaseHeaders,
} from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { farmerAuthService, FarmerAuthError, type FarmerAuthResult } from '@/services/farmerAuthService';
import {
  WORKSPACE_HOME,
  landingRouteFor,
  normaliseRoles,
  workspaceRoleOf,
  type AccountRole,
  type AccountRoleStatus,
  type AccountSummary,
} from '@/lib/accountRoles';

/** Session lifetime on the server (farmer-auth-core SESSION_TTL): 7 days. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** localStorage keys used only while the sign-up / sign-in screens are open. */
export const REGISTER_ROLES_KEY = 'registerRoles';
const TEMP_KEYS = [
  'authMobile', 'farmerId', 'registerMobile', 'isNewRegistration',
  'requiresCurrentPin', REGISTER_ROLES_KEY,
];

function clearTempKeys() {
  for (const key of TEMP_KEYS) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}

/** Empties authStore without revoking the server session or wiping local data. */
function parkFarmerState(token: string | null) {
  const auth = useAuthStore.getState();
  if (auth.session || auth.user) {
    auth.setSession(null); // also drops the token header — restored just below
    auth.setUser(null);
  }
  if (token) setSessionToken(token);
}

/** Fills authStore the way the PIN screen does after a farmer login. */
function openFarmerState(farmer: any, profile: any, token: string, expiresAt: string | null) {
  const auth = useAuthStore.getState();
  auth.setSession({
    farmerId: farmer.id,
    tenantId: farmer.tenant_id,
    mobile: farmer.mobile_number,
    token,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt ?? new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    isPinVerified: true,
  });
  auth.setUser({
    id: farmer.id,
    phone: farmer.mobile_number,
    name: profile?.full_name || farmer.farmer_name || farmer.farmer_code || '',
    role: 'farmer',
    language: farmer.language_preference || 'hi',
    tenantId: farmer.tenant_id,
    farmerCode: farmer.farmer_code,
    farmerName: farmer.farmer_name,
    sessionToken: token,
    lastLoginAt: new Date().toISOString(),
    fullName: profile?.full_name || '',
    displayName: profile?.display_name || '',
    dateOfBirth: profile?.date_of_birth || '',
    gender: profile?.gender || '',
    village: profile?.village || '',
    taluka: profile?.taluka || '',
    district: profile?.district || '',
    state: profile?.state || '',
    pincode: profile?.pincode || '',
    preferredLanguage: profile?.preferred_language || farmer.language_preference || 'hi',
    avatarUrl: profile?.avatar_url || '',
    totalLandAcres: farmer.total_land_acres || profile?.total_land_acres || 0,
    primaryCrops: farmer.primary_crops || profile?.primary_crops || [],
    farmingExperienceYears: farmer.farming_experience_years || profile?.farming_experience_years || 0,
    farmType: farmer.farm_type || '',
    hasTractor: farmer.has_tractor || profile?.has_tractor || false,
    hasIrrigation: farmer.has_irrigation || profile?.has_irrigation || false,
    irrigationType: farmer.irrigation_type || '',
    hasStorage: farmer.has_storage || profile?.has_storage || false,
    annualIncomeRange: farmer.annual_income_range || profile?.annual_income_range || '',
  });
  updateSupabaseHeaders(farmer.id, farmer.tenant_id);
}

export const accountSessionService = {
  /** Roles chosen on the registration step; empty = today's farmer registration. */
  readRegisterRoles(): AccountRole[] {
    try { return normaliseRoles(JSON.parse(localStorage.getItem(REGISTER_ROLES_KEY) || '[]')); } catch { return []; }
  },

  /**
   * Call right after register / verifyPin / changePin / verifyPinReset.
   *
   * Returns null when the caller must carry on with its own farmer code:
   * the flag is off (no account in the reply), or the session opened in the
   * Farmer workspace. Otherwise the session belongs in another workspace: the
   * account is stored, the farmer state is parked and the route to open is
   * returned.
   */
  applyAuthResult(result: Pick<FarmerAuthResult, 'session' | 'account'> | null | undefined): string | null {
    const account = result?.account;
    if (!account || !result?.session?.token) {
      // A server reply without an account means the flag is off for the tenant:
      // nothing cached from an earlier time may steer this session.
      useAccountStore.getState().clear();
      return null;
    }

    useAccountStore.getState().setAccountSession(
      account, result.session.token, result.session.expiresAt ?? null,
    );

    const role = workspaceRoleOf(account);
    if (!role || role === 'FARMER') return null;

    parkFarmerState(result.session.token);
    clearTempKeys();
    return landingRouteFor(account);
  },

  /**
   * Moves the session to another workspace the person holds. Needs the
   * network: the server changes the role on the session, and the farmer rows
   * are readable only while that role is FARMER.
   */
  async switchWorkspace(role: AccountRole): Promise<string> {
    const { token, expiresAt } = useAccountStore.getState();
    const liveToken = token ?? getSessionToken();
    if (liveToken) setSessionToken(liveToken);

    const res = await farmerAuthService.switchRole(role);
    useAccountStore.getState().setAccount(res.account);

    if (role === 'FARMER') {
      if (!res.farmer || !liveToken) throw new FarmerAuthError('role_not_available', 'role_not_available');
      openFarmerState(res.farmer, res.profile, liveToken, expiresAt);
      return WORKSPACE_HOME.FARMER;
    }
    parkFarmerState(liveToken);
    return landingRouteFor(res.account) ?? WORKSPACE_HOME[role];
  },

  /** Adds a role to the signed-in person; returns the status the role has now. */
  async addRole(role: AccountRole): Promise<AccountRoleStatus> {
    const res = await farmerAuthService.addRole(role);
    useAccountStore.getState().setAccount(res.account);
    return res.roleStatus;
  },

  async updateAccount(fields: { displayName?: string; languageCode?: string }): Promise<AccountSummary> {
    const res = await farmerAuthService.updateAccount(fields);
    useAccountStore.getState().setAccount(res.account);
    return res.account;
  },

  /**
   * Re-reads the account from the server (roles can be changed from the
   * portals). 'signed-out' means the server no longer knows the session and the
   * device has been cleared. Any other failure keeps the cached account, so the
   * shells still open without a network.
   */
  async refresh(): Promise<'ok' | 'signed-out' | 'offline'> {
    try {
      const info = await farmerAuthService.sessionInfo();
      const store = useAccountStore.getState();
      const token = store.token ?? getSessionToken();
      if (token) store.setAccountSession(info.account, token, store.expiresAt);
      else store.setAccount(info.account);
      return 'ok';
    } catch (error) {
      if (error instanceof FarmerAuthError && error.code === 'session_required') {
        await accountSessionService.logout();
        return 'signed-out';
      }
      return 'offline';
    }
  },

  /**
   * Logout for every role: revokes the server session and removes everything
   * readable from the device — the account, the farmer state, the offline PIN
   * cache, the local database and the in-memory query cache.
   */
  async logout(): Promise<void> {
    const token =
      useAccountStore.getState().token ??
      useAuthStore.getState().session?.token ??
      getSessionToken();
    try { await farmerAuthService.logout(token); } catch { /* offline — local state is still cleared */ }

    // Wipes the local database, clears headers and fires 'ks:auth-logout',
    // which empties accountStore and the query cache.
    useAuthStore.getState().logout();
    useAccountStore.getState().clear();
    clearTempKeys();
    try {
      const { offlineAuthService } = await import('@/services/offlineAuthService');
      await offlineAuthService.clearCachedAuth();
    } catch { /* cache already gone */ }
  },
};

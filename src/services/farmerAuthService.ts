/** farmerAuthService — server-side farmer authentication transport. */
import { supabase, setSessionToken, getSessionToken } from '@/integrations/supabase/client';
import type { AccountRole, AccountRoleStatus, AccountSummary } from '@/lib/accountRoles';
import { rememberActivation } from '@/lib/activationState';
import { authMessageForCode } from '@/lib/authErrors';

const FUNCTION_NAME = 'farmer-auth';
export interface FarmerSession { token: string; expiresAt: string; }
/**
 * `account` is present only when the multi-role flag is on for the tenant.
 * `farmer` and `profile` are null for a person who is not a farmer.
 */
export interface FarmerAuthResult { session: FarmerSession; farmer: any; profile: any; account?: AccountSummary | null; }
export interface AccountSessionInfo { account: AccountSummary; multiRole: boolean; }
/** Farmer activation: what the server answers to a redeemed code. */
export interface ActivationResult {
  activated: boolean;
  /** true = the farmer was activated before this call (a repeated tap, a lost reply). */
  already: boolean;
  tenant: { id: string; name: string | null; slug: string | null } | null;
  subscriptionEnd: string | null;
  farmer: any;
  profile: any;
}
export interface RegisterOptions { roles?: AccountRole[]; displayName?: string; }
export interface FarmerProfilePayload {
  fullName?: string;
  displayName?: string;
  dateOfBirth?: string;
  gender?: string;
  email?: string;
  bio?: string;
  aadhaarNumber?: string;
  preferredContactMethod?: string;
  addressLine1?: string;
  addressLine2?: string;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  pincode?: string;
  totalLandAcres?: number;
  primaryCrops?: string[];
  farmingExperienceYears?: number;
  farmType?: string;
  hasLoan?: boolean;
  loanAmount?: number;
  hasTractor?: boolean;
  hasIrrigation?: boolean;
  irrigationType?: string;
  hasStorage?: boolean;
  annualIncomeRange?: string;
  preferredLanguage?: string;
  notes?: string;
  avatarUrl?: string;
}
export type FarmerProfileResult = Pick<FarmerAuthResult, 'farmer' | 'profile'>;

class FarmerAuthError extends Error {
  code: string; retryAfterSeconds?: number;
  constructor(code: string, message: string, retryAfterSeconds?: number) {
    super(message); this.code = code; this.retryAfterSeconds = retryAfterSeconds;
  }
}

// The server answers a refusal with a code ({ error: "<code>" }). The text for
// a code lives in the i18n bundles (auth.errors.<code>, then
// identity.errors.<code>) and is read through lib/authErrors, so a
// FarmerAuthError's message is always a sentence in the app language, never
// the code itself and never a transport message. Screens show
// authErrorMessage(err), which reads the code again at display time.
function serverCode(value: unknown): string {
  return typeof value === 'string' && value ? value : 'server_error';
}

// The multi-role flag is read server-side; `lookup` reports it for the tenant.
// It is remembered so the next PIN login can ask for the last-used workspace.
const MULTI_ROLE_KEY = 'ks_multi_role';
export function isMultiRoleEnabled(): boolean {
  try { return localStorage.getItem(MULTI_ROLE_KEY) === 'true'; } catch { return false; }
}
function rememberMultiRole(value: unknown) {
  try {
    if (value === true) localStorage.setItem(MULTI_ROLE_KEY, 'true');
    else localStorage.removeItem(MULTI_ROLE_KEY);
  } catch { /* storage unavailable */ }
}

// Farmer activation. The server marks every farmer row it returns with
// `activation_required`; the answer is remembered for the route guard
// (lib/activationState). A reply without a farmer (Provider or Customer
// workspace) changes nothing.
function rememberFarmerActivation(farmer: { activation_required?: unknown } | null | undefined) {
  if (farmer) rememberActivation(farmer.activation_required);
}

// tenant-config is already live and mounts the same auth core. Prefer it so
// login does not depend on the separately deployed farmer-auth slug.
const ENDPOINTS = ['tenant-config', FUNCTION_NAME] as const;
let preferredEndpoint: string | null = null;

async function invokeOnce<T>(fn: string, payload: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body: payload });

    if (error) {
      const status = (error as any).context?.status;
      let parsed: any = null;
      try { parsed = await (error as any).context?.json?.(); } catch {}

      // CORS/preflight/network failures often have no usable HTTP status.
      // Retry the alternate server transport; do not mask real auth errors.
      if (status === 404 || parsed?.code === 'NOT_FOUND' || status == null) {
        return { retryTransport: true } as const;
      }

      const code = serverCode(parsed?.error);
      throw new FarmerAuthError(code, authMessageForCode(code), parsed?.retryAfterSeconds);
    }

    if (data && (data as any).error) {
      const code = serverCode((data as any).error);
      throw new FarmerAuthError(code, authMessageForCode(code), (data as any).retryAfterSeconds);
    }

    return { retryTransport: false, data: data as T } as const;
  } catch (error) {
    if (error instanceof FarmerAuthError) throw error;
    return { retryTransport: true } as const;
  }
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const order = preferredEndpoint
    ? [preferredEndpoint, ...ENDPOINTS.filter((e) => e !== preferredEndpoint)]
    : [...ENDPOINTS];

  for (const fn of order) {
    const res = await invokeOnce<T>(fn, payload);
    if (res.retryTransport) continue;
    preferredEndpoint = fn;
    return res.data as T;
  }

  // Every transport attempt failed without a usable HTTP response — this is a
  // network/CORS failure, NOT a credential failure. Callers must be able to
  // tell them apart so offline PIN validation can take over.
  throw new FarmerAuthError('transport_unavailable', authMessageForCode('transport_unavailable'));
}

export const farmerAuthService = {
  async lookup(mobile: string, tenantId?: string | null) {
    const result = await call<{ exists: boolean; requiresPinSetup: boolean; multiRole?: boolean }>({
      action: 'lookup', mobile, tenantId: tenantId ?? undefined,
    });
    rememberMultiRole(result?.multiRole);
    return result;
  },
  /**
   * `options.roles` absent = today's farmer registration, byte for byte.
   * With roles, the server creates the person with those roles (flag required
   * for anything other than FARMER alone).
   */
  async register(
    mobile: string, tenantId: string, pin: string, language?: string, options?: RegisterOptions,
  ) {
    const result = await call<FarmerAuthResult>({
      action: 'register', mobile, tenantId, pin, language,
      ...(options?.roles?.length ? { roles: options.roles } : {}),
      ...(options?.displayName ? { displayName: options.displayName } : {}),
    });
    setSessionToken(result.session.token);
    rememberFarmerActivation(result.farmer);
    return result;
  },
  async verifyPin(mobile: string, tenantId: string | null, pin: string) {
    const result = await call<FarmerAuthResult>({
      action: 'verifyPin', mobile, tenantId: tenantId ?? undefined, pin,
      // Flag on: open the workspace used last. Flag off: field not sent.
      ...(isMultiRoleEnabled() ? { role: 'AUTO' } : {}),
    });
    setSessionToken(result.session.token);
    rememberFarmerActivation(result.farmer);
    return result;
  },
  async changePin(
    mobile: string, tenantId: string | null, newPin: string, currentPin?: string,
  ) {
    const result = await call<FarmerAuthResult>({
      action: 'changePin', mobile, tenantId: tenantId ?? undefined, newPin, currentPin,
    });
    setSessionToken(result.session.token);
    rememberFarmerActivation(result.farmer);
    return result;
  },
  /** Forgot-PIN step 1 — sends a one-time code by SMS. */
  async requestPinReset(mobile: string, tenantId: string | null) {
    return call<{ sent?: boolean; expiresInSeconds?: number }>({
      action: 'requestPinReset', mobile, tenantId: tenantId ?? undefined,
    });
  },
  /** Forgot-PIN step 2 — proves the code and sets a new PIN. */
  async verifyPinReset(
    mobile: string, tenantId: string | null, code: string, newPin: string,
  ) {
    const result = await call<FarmerAuthResult>({
      action: 'verifyPinReset', mobile, tenantId: tenantId ?? undefined, code, newPin,
    });
    setSessionToken(result.session.token);
    rememberFarmerActivation(result.farmer);
    return result;
  },
  // ── Multi-role identity: actions authenticated by the session token ──────
  /** The account behind the current session. Works with the flag off. */
  async sessionInfo() {
    const result = await call<AccountSessionInfo>({
      action: 'sessionInfo', sessionToken: getSessionToken() ?? undefined,
    });
    rememberMultiRole(result?.multiRole);
    return result;
  },
  /** Moves the session to another held workspace. Farmer data comes back for FARMER. */
  async switchRole(role: AccountRole) {
    const result = await call<{ account: AccountSummary; farmer: any; profile: any }>({
      action: 'switchRole', role, sessionToken: getSessionToken() ?? undefined,
    });
    rememberFarmerActivation(result.farmer);
    return result;
  },
  /** Adds a role to the signed-in person. No new credential is asked for. */
  async addRole(role: AccountRole) {
    return call<{ account: AccountSummary; roleStatus: AccountRoleStatus }>({
      action: 'addRole', role, sessionToken: getSessionToken() ?? undefined,
    });
  },
  async updateAccount(fields: { displayName?: string; languageCode?: string }) {
    return call<{ account: AccountSummary }>({
      action: 'updateAccount', ...fields, sessionToken: getSessionToken() ?? undefined,
    });
  },
  /** Reads only the farmer behind the verified session; no identity is sent. */
  async getFarmerProfile() {
    return call<FarmerProfileResult>({
      action: 'getFarmerProfile', sessionToken: getSessionToken() ?? undefined,
    });
  },
  /** Saves allowlisted profile fields for the verified session's farmer. */
  async updateFarmerProfile(profile: FarmerProfilePayload) {
    return call<FarmerProfileResult>({
      action: 'updateFarmerProfile', profile, sessionToken: getSessionToken() ?? undefined,
    });
  },
  /** Signed upload slot for the verified farmer's profile picture. */
  async avatarUploadSign() {
    return call<{ path: string; token: string; signedUrl: string; publicUrl: string }>({
      action: 'avatarUploadSign', sessionToken: getSessionToken() ?? undefined,
    });
  },
  // ── Farmer activation: actions authenticated by the session token ────────
  /** Asks the server whether the signed-in farmer still has to redeem a code. */
  async activationStatus() {
    const result = await call<{ required: boolean; tenantId: string | null }>({
      action: 'activationStatus', sessionToken: getSessionToken() ?? undefined,
    });
    rememberActivation(result?.required === true);
    return result;
  },
  /**
   * Redeems a code for the signed-in farmer. `code` is what the farmer typed or
   * the text of the scanned QR; the server validates it and assigns the tenant.
   * A refusal throws FarmerAuthError with the server's result code.
   */
  async activate(code: string) {
    const result = await call<ActivationResult>({
      action: 'activate', code, sessionToken: getSessionToken() ?? undefined,
    });
    rememberFarmerActivation(result.farmer);
    return result;
  },
  async logout(token?: string | null) {
    // The token on the device when this sign-out starts. The server call below
    // can take seconds (cold start, weak network); a sign-in that finishes in
    // the meantime has put ITS token in place, and that one must survive
    // (2026-11-26: a slow sign-out used to wipe the next person's session).
    // The activation mark is removed with the other personal keys by
    // services/deviceWipe, at the moment of sign-out.
    const tokenAtStart = getSessionToken();
    try {
      if (token) await call({ action: 'logout', sessionToken: token });
    } finally {
      if (getSessionToken() === tokenAtStart) setSessionToken(null);
    }
  },
};

/** Nursery store photos (Provider Workspace). Both need a live provider session. */
export const nurseryPhotoTransport = {
  /** One signed upload for a new photo of the provider's own plant. */
  sign(productId: string) {
    return call<{ bucket: string; path: string; signedUrl: string; token: string }>({
      action: 'nurseryPhotoSign', productId, sessionToken: getSessionToken() ?? undefined,
    });
  },
  /** Registers the photo once its bytes are in the bucket. */
  confirm(productId: string, path: string) {
    return call<{ photoPaths: string[] }>({
      action: 'nurseryPhotoConfirm', productId, path, sessionToken: getSessionToken() ?? undefined,
    });
  },
};

export { FarmerAuthError };

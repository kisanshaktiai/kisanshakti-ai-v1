/** farmerAuthService — server-side farmer authentication transport. */
import { supabase, setSessionToken, getSessionToken } from '@/integrations/supabase/client';
import i18n from '@/i18n/config';
import type { AccountRole, AccountRoleStatus, AccountSummary } from '@/lib/accountRoles';

const FUNCTION_NAME = 'farmer-auth';
export interface FarmerSession { token: string; expiresAt: string; }
/**
 * `account` is present only when the multi-role flag is on for the tenant.
 * `farmer` and `profile` are null for a person who is not a farmer.
 */
export interface FarmerAuthResult { session: FarmerSession; farmer: any; profile: any; account?: AccountSummary | null; }
export interface AccountSessionInfo { account: AccountSummary; multiRole: boolean; }
export interface RegisterOptions { roles?: AccountRole[]; displayName?: string; }

class FarmerAuthError extends Error {
  code: string; retryAfterSeconds?: number;
  constructor(code: string, message: string, retryAfterSeconds?: number) {
    super(message); this.code = code; this.retryAfterSeconds = retryAfterSeconds;
  }
}

const MESSAGES: Record<string, string> = {
  invalid_mobile: 'Please enter a valid 10-digit mobile number.',
  invalid_pin: 'PIN must be 4 digits.',
  invalid_credentials: 'Incorrect PIN. Please try again.',
  locked_out: 'Too many failed attempts. Please try again later.',
  already_registered: 'This mobile number is already registered. Please sign in.',
  tenant_required: 'Application is still loading. Please try again.',
  server_error: 'Something went wrong. Please try again.',
  transport_unavailable: 'Network connection is weak. Please try again.',
  rate_limited: 'Too many reset requests. Please wait before trying again.',
  sms_not_configured: 'PIN reset by SMS is not available yet. Please contact support.',
  sms_send_failed: 'Could not send the reset code. Please try again.',
  invalid_reset_code: 'Incorrect reset code. Please try again.',
  reset_code_expired: 'This reset code has expired. Please request a new one.',
};

// Multi-role identity: codes added with the account actions have no English text
// here; they resolve through the i18n bundle (identity.errors.<code>).
function identityMessage(code: string): string | undefined {
  const key = `identity.errors.${code}`;
  return i18n.exists(key) ? i18n.t(key) : undefined;
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

      const code = parsed?.error ?? 'server_error';
      throw new FarmerAuthError(
        code,
        MESSAGES[code] ?? identityMessage(code) ?? error.message,
        parsed?.retryAfterSeconds,
      );
    }

    if (data && (data as any).error) {
      const code = (data as any).error as string;
      throw new FarmerAuthError(
        code,
        MESSAGES[code] ?? identityMessage(code) ?? code,
        (data as any).retryAfterSeconds,
      );
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
  throw new FarmerAuthError('transport_unavailable', MESSAGES.transport_unavailable);
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
    return result;
  },
  async verifyPin(mobile: string, tenantId: string | null, pin: string) {
    const result = await call<FarmerAuthResult>({
      action: 'verifyPin', mobile, tenantId: tenantId ?? undefined, pin,
      // Flag on: open the workspace used last. Flag off: field not sent.
      ...(isMultiRoleEnabled() ? { role: 'AUTO' } : {}),
    });
    setSessionToken(result.session.token);
    return result;
  },
  async changePin(
    mobile: string, tenantId: string | null, newPin: string, currentPin?: string,
  ) {
    const result = await call<FarmerAuthResult>({
      action: 'changePin', mobile, tenantId: tenantId ?? undefined, newPin, currentPin,
    });
    setSessionToken(result.session.token);
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
    return call<{ account: AccountSummary; farmer: any; profile: any }>({
      action: 'switchRole', role, sessionToken: getSessionToken() ?? undefined,
    });
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
  async logout(token?: string | null) {
    try {
      if (token) await call({ action: 'logout', sessionToken: token });
    } finally {
      setSessionToken(null);
    }
  },
};

export { FarmerAuthError };

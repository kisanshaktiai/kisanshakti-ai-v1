/**
 * farmerAuthService — the only client entry point for farmer credentials.
 *
 * The `farmers` table no longer exposes public lookup / registration / PIN-write
 * policies. Every credential operation goes through the `farmer-auth` edge
 * function, which verifies identity server-side and returns an opaque session
 * token. The token — not a browser-supplied farmer/tenant id — is what the
 * database trusts.
 */
import { supabase, setSessionToken } from '@/integrations/supabase/client';

const FUNCTION_NAME = 'farmer-auth';

export interface FarmerSession {
  token: string;
  expiresAt: string;
}

export interface FarmerAuthResult {
  session: FarmerSession;
  farmer: any;
  profile: any;
}

class FarmerAuthError extends Error {
  code: string;
  retryAfterSeconds?: number;
  constructor(code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
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
};

// The same handler is served by two slugs (see _shared/farmer-auth-core.ts).
// `tenant-config` is the always-deployed transport; `farmer-auth` is preferred
// when it is reachable. A 404 on the first slug transparently falls through.
const ENDPOINTS = [FUNCTION_NAME, 'tenant-config'] as const;
let preferredEndpoint: string | null = null;

async function invokeOnce<T>(fn: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body: payload });

  // supabase-js surfaces non-2xx as FunctionsHttpError; recover the JSON body.
  if (error) {
    const status = (error as any).context?.status;
    let parsed: any = null;
    try {
      parsed = await (error as any).context?.json?.();
    } catch {
      /* body not JSON */
    }
    if (status === 404 || parsed?.code === 'NOT_FOUND') {
      return { notFound: true } as const;
    }
    const code = parsed?.error ?? 'server_error';
    throw new FarmerAuthError(code, MESSAGES[code] ?? error.message, parsed?.retryAfterSeconds);
  }

  if (data && (data as any).error) {
    const code = (data as any).error as string;
    throw new FarmerAuthError(code, MESSAGES[code] ?? code, (data as any).retryAfterSeconds);
  }

  return { notFound: false, data: data as T } as const;
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const order = preferredEndpoint
    ? [preferredEndpoint, ...ENDPOINTS.filter((e) => e !== preferredEndpoint)]
    : [...ENDPOINTS];

  for (const fn of order) {
    const res = await invokeOnce<T>(fn, payload);
    if (res.notFound) continue;
    preferredEndpoint = fn;
    return res.data as T;
  }

  throw new FarmerAuthError('server_error', MESSAGES.server_error);
}


export const farmerAuthService = {
  /** Minimal existence probe — returns no identifiers. */
  async lookup(mobile: string, tenantId?: string | null) {
    return call<{ exists: boolean; requiresPinSetup: boolean }>({
      action: 'lookup',
      mobile,
      tenantId: tenantId ?? undefined,
    });
  },

  async register(mobile: string, tenantId: string, pin: string, language?: string) {
    const result = await call<FarmerAuthResult>({
      action: 'register',
      mobile,
      tenantId,
      pin,
      language,
    });
    setSessionToken(result.session.token);
    return result;
  },

  async verifyPin(mobile: string, tenantId: string | null, pin: string) {
    const result = await call<FarmerAuthResult>({
      action: 'verifyPin',
      mobile,
      tenantId: tenantId ?? undefined,
      pin,
    });
    setSessionToken(result.session.token);
    return result;
  },

  /** Requires the current PIN, or a live session for the same farmer. */
  async changePin(
    mobile: string,
    tenantId: string | null,
    newPin: string,
    currentPin?: string,
  ) {
    const result = await call<FarmerAuthResult>({
      action: 'changePin',
      mobile,
      tenantId: tenantId ?? undefined,
      newPin,
      currentPin,
    });
    setSessionToken(result.session.token);
    return result;
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

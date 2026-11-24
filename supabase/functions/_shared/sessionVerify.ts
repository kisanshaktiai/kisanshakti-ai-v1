/**
 * sessionVerify — resolve WHO is calling an edge function, the same way RLS does.
 *
 * The farmer app holds no Supabase Auth session. It sends the public anon key
 * plus `x-session-token`, and the database resolves the farmer from that token
 * through `public.verified_session_context()` — the function every
 * farmer-scoped RLS policy already relies on via `get_current_farmer_id()`.
 *
 * `x-farmer-id` / `x-tenant-id` are NOT identity: anyone holding the public
 * anon key can set them. Until 2026-09-21 the shared guard and schedules-api
 * authorised on those two headers alone (checking only that the farmer row
 * belonged to the tenant — a public fact), so any anon-key holder could read
 * or edit any farmer's lands and schedules by UUID. This module closes that:
 * identity comes from the verified token; the headers may only agree with it.
 *
 * Mechanism copied from analytics-forecast/caller.ts (the one function that
 * already did this correctly) so there is a single way to verify a session.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

export type VerifiedCaller =
  | { kind: 'service' }
  | { kind: 'farmer'; farmerId: string; tenantId: string | null };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export function isServiceRoleBearer(req: Request): boolean {
  const auth = req.headers.get('authorization');
  if (!SERVICE_ROLE_KEY || !auth?.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  return token.length === SERVICE_ROLE_KEY.length && token === SERVICE_ROLE_KEY;
}

/** Ask the database who this session token belongs to. Null = not a live session. */
export async function lookupSession(sessionToken: string): Promise<{ farmer_id: string | null; tenant_id: string | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-session-token': sessionToken } },
  });
  const { data, error } = await client.rpc('verified_session_context');
  if (error) {
    console.warn('[sessionVerify] verified_session_context failed:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { farmer_id: row.farmer_id ?? null, tenant_id: row.tenant_id ?? null } : null;
}

/**
 * Resolve the caller. Service role is trusted (cron/admin). Everything else
 * MUST present a session token the database verifies (hashed lookup, active,
 * unexpired — see public.verified_session_context). No header fallback.
 */
export async function resolveVerifiedCaller(req: Request): Promise<VerifiedCaller | null> {
  if (isServiceRoleBearer(req)) return { kind: 'service' };
  const sessionToken = req.headers.get('x-session-token')?.trim();
  if (!sessionToken) return null;
  const row = await lookupSession(sessionToken);
  if (!row?.farmer_id) return null;
  return { kind: 'farmer', farmerId: row.farmer_id, tenantId: row.tenant_id ?? null };
}

// ---------------------------------------------------------------------------
// Multi-role identity (2026-11-24, additive). Everything above is unchanged and
// still means "a farmer in the Farmer Workspace": after the identity cutover
// verified_session_context() returns no row for a session whose active role is
// Service Provider or Customer, so every function using resolveVerifiedCaller()
// stays closed to them without being edited.
//
// Provider and Customer functions (later tasks) use the two exports below. The
// role comes from the database on every call (public.verified_account_context),
// never from a header: a suspended or removed role stops resolving at once.
// ---------------------------------------------------------------------------

export type AccountRole = 'FARMER' | 'SERVICE_PROVIDER' | 'CUSTOMER';

export type VerifiedAccountCaller =
  | { kind: 'service' }
  | { kind: 'account'; accountId: string; tenantId: string; role: AccountRole; sessionId: string };

/** Ask the database which account and active role this session token carries. */
export async function lookupAccountSession(sessionToken: string): Promise<
  { session_id: string; account_id: string; tenant_id: string; active_role: AccountRole } | null
> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-session-token': sessionToken } },
  });
  const { data, error } = await client.rpc('verified_account_context');
  if (error) {
    console.warn('[sessionVerify] verified_account_context failed:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row?.account_id && row?.tenant_id && row?.active_role ? row : null;
}

/**
 * Resolve the caller as an account in one of the allowed roles. Service role is
 * trusted (cron/admin). Null when there is no live session, or the session's
 * active role is not in `allowedRoles`. Pass the roles the function serves, e.g.
 * ['SERVICE_PROVIDER'] — an empty list admits nobody.
 */
export async function resolveVerifiedAccount(
  req: Request,
  allowedRoles: readonly AccountRole[],
): Promise<VerifiedAccountCaller | null> {
  if (isServiceRoleBearer(req)) return { kind: 'service' };
  const sessionToken = req.headers.get('x-session-token')?.trim();
  if (!sessionToken) return null;
  const row = await lookupAccountSession(sessionToken);
  if (!row || !allowedRoles.includes(row.active_role)) return null;
  return {
    kind: 'account',
    accountId: row.account_id,
    tenantId: row.tenant_id,
    role: row.active_role,
    sessionId: row.session_id,
  };
}

/** Standard rejection when no verified session is present. */
export function sessionRequiredResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: 'Authentication required',
      details: 'A valid session is required. Please log in again.',
      code: 'SESSION_REQUIRED',
      timestamp: new Date().toISOString(),
    }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

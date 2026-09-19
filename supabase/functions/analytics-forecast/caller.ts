/**
 * Caller identity for analytics-forecast.
 *
 * The farmer app does not hold a Supabase Auth session: it sends the anon key
 * plus `x-session-token`, and the database resolves the farmer from that token
 * through `public.verified_session_context()` (the same function every
 * farmer-scoped RLS policy relies on via `get_current_farmer_id()`).
 *
 * `x-farmer-id` / `x-tenant-id` / a `farmer_id` in the body are NOT identity:
 * anyone holding the public anon key can set them. They are ignored here.
 *
 * Only two callers are accepted:
 *   - service role  (Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>) — cron/admin
 *   - a farmer whose x-session-token the database verifies
 */

export type Caller =
  | { kind: 'service' }
  | { kind: 'farmer'; farmerId: string; tenantId: string | null };

export interface SessionContextRow {
  farmer_id: string | null;
  tenant_id: string | null;
}

/** Looks up the verified session for a token. Injected so it can be tested. */
export type SessionLookup = (sessionToken: string) => Promise<SessionContextRow | null>;

export function isServiceRoleRequest(req: Request, serviceKey: string | undefined): boolean {
  const auth = req.headers.get('authorization');
  if (!serviceKey || !auth?.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  return token.length === serviceKey.length && token === serviceKey;
}

export async function resolveCaller(
  req: Request,
  serviceKey: string | undefined,
  lookup: SessionLookup,
): Promise<Caller | null> {
  if (isServiceRoleRequest(req, serviceKey)) return { kind: 'service' };

  const sessionToken = req.headers.get('x-session-token')?.trim();
  if (!sessionToken) return null;

  const row = await lookup(sessionToken);
  if (!row?.farmer_id) return null;
  return { kind: 'farmer', farmerId: row.farmer_id, tenantId: row.tenant_id ?? null };
}

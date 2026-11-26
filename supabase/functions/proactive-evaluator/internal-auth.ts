/**
 * Zero-trust authorization for the internal proactive evaluation sweep.
 * This module is deliberately free of database and Deno dependencies so that
 * denied requests can be proven to issue no land or rule queries in unit tests.
 */
export function parseSweepBearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const matched = /^Bearer\s+([^\s]{1,1024})$/i.exec(authorization.trim());
  return matched?.[1] ?? null;
}

/** Compare bounded opaque secrets without exiting early on a mismatched byte. */
export function matchesInternalSecret(provided: string, expected: string | null | undefined): boolean {
  if (!expected || provided.length > 1024 || expected.length > 1024) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Service role JWT OR explicit Vault sweep secret only. Public anon keys,
 * x-farmer-id, x-tenant-id, session tokens and other headers NEVER authorize
 * this service-role-only operation.
 */
export async function authorizeEvaluator(
  request: Pick<Request, "headers">,
  serviceRoleKey: string | null | undefined,
  loadVaultSweepKey: () => Promise<string | null>,
): Promise<boolean> {
  const token = parseSweepBearer(request.headers.get("authorization"));
  if (!token) return false;
  if (matchesInternalSecret(token, serviceRoleKey)) return true;
  try {
    return matchesInternalSecret(token, await loadVaultSweepKey());
  } catch {
    return false;
  }
}

// Sprint 5 — Rate Guard
import { checkRateLimit, RateLimitConfig } from './rateLimiter.ts';
import { corsHeaders } from './cors.ts';

export interface RateGuardOptions extends Partial<RateLimitConfig> {
  /** Endpoint name written to rate_limit_tracking.endpoint */
  endpoint: string;
}

export async function rateGuard(
  req: Request,
  opts: RateGuardOptions,
): Promise<Response | null> {
  const farmerId = req.headers.get('x-farmer-id');
  const tenantId = req.headers.get('x-tenant-id');
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous';
  const identifier = farmerId || tenantId || ip;

  const config: RateLimitConfig = {
    maxRequests: opts.maxRequests ?? 30,
    windowMs: opts.windowMs ?? 60_000,
  };

  try {
    const result = await checkRateLimit(identifier, opts.endpoint, config);
    if (!result.allowed) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((result.resetTime - Date.now()) / 1000),
      );
      return new Response(
        JSON.stringify({
          error: 'Too many requests',
          code: 'RATE_LIMITED',
          retry_after_seconds: retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSec),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }
  } catch (err) {
    // Fail-open: never block traffic on rate-limiter failure.
    console.error('[rateGuard] check failed, allowing request:', err);
  }
  return null;
}

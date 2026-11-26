// Database-backed rate limiter for edge functions
// Prevents abuse and controls API costs using persistent storage
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig = { maxRequests: 20, windowMs: 60000 }
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Rate limiter: Missing Supabase credentials');
    // Fail open in case of configuration error to avoid blocking legitimate traffic
    return { allowed: true, remaining: config.maxRequests, resetTime: Date.now() + config.windowMs };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMs);
  const windowEnd = new Date(now.getTime() + config.windowMs);

  try {
    // Clean up old entries first (async, don't wait)
    (async () => {
      try {
        await supabase
          .from('rate_limit_tracking')
          .delete()
          .lt('window_end', now.toISOString());
      } catch (err: unknown) {
        console.error('Rate limiter cleanup error:', err);
      }
    })();

    // Count this request. The database does it under a lock for this
    // (identifier, endpoint) pair, so the limit also holds when many requests
    // arrive at the same moment (a read-then-write here let all of them pass).
    const { data, error: hitError } = await supabase.rpc('rate_limit_hit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_max: config.maxRequests,
      p_window_ms: config.windowMs,
    });

    if (hitError || !data) {
      console.error('Rate limiter hit error:', hitError);
      // Fail open on error
      return { allowed: true, remaining: config.maxRequests, resetTime: windowEnd.getTime() };
    }

    const resetAt = new Date((data as any).reset_at).getTime();
    return {
      allowed: (data as any).allowed === true,
      remaining: Number((data as any).remaining ?? 0),
      resetTime: Number.isFinite(resetAt) ? resetAt : windowEnd.getTime(),
    };

  } catch (error) {
    console.error('Rate limiter error:', error);
    // Fail open on unexpected errors to avoid blocking legitimate traffic
    return { allowed: true, remaining: config.maxRequests, resetTime: windowEnd.getTime() };
  }
}

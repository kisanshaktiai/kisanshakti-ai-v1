// Database-backed rate limiter for edge functions
// Prevents abuse and controls API costs using persistent storage
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
    supabase
      .from('rate_limit_tracking')
      .delete()
      .lt('window_end', now.toISOString())
      .then(() => {})
      .catch(err => console.error('Rate limiter cleanup error:', err));

    // Check current rate limit
    const { data: existing, error: fetchError } = await supabase
      .from('rate_limit_tracking')
      .select('*')
      .eq('identifier', identifier)
      .eq('endpoint', endpoint)
      .gte('window_end', now.toISOString())
      .order('window_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('Rate limiter fetch error:', fetchError);
      // Fail open on error
      return { allowed: true, remaining: config.maxRequests, resetTime: windowEnd.getTime() };
    }

    if (!existing) {
      // Create new entry
      const { error: insertError } = await supabase
        .from('rate_limit_tracking')
        .insert({
          identifier,
          endpoint,
          request_count: 1,
          window_start: now.toISOString(),
          window_end: windowEnd.toISOString()
        });

      if (insertError) {
        console.error('Rate limiter insert error:', insertError);
        // Fail open on error
        return { allowed: true, remaining: config.maxRequests - 1, resetTime: windowEnd.getTime() };
      }

      return { 
        allowed: true, 
        remaining: config.maxRequests - 1, 
        resetTime: windowEnd.getTime() 
      };
    }

    // Check if limit exceeded
    if (existing.request_count >= config.maxRequests) {
      return { 
        allowed: false, 
        remaining: 0, 
        resetTime: new Date(existing.window_end).getTime() 
      };
    }

    // Increment count
    const { error: updateError } = await supabase
      .from('rate_limit_tracking')
      .update({ request_count: existing.request_count + 1 })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Rate limiter update error:', updateError);
      // Fail open on error
      return { 
        allowed: true, 
        remaining: config.maxRequests - existing.request_count - 1, 
        resetTime: new Date(existing.window_end).getTime() 
      };
    }

    return { 
      allowed: true, 
      remaining: config.maxRequests - existing.request_count - 1, 
      resetTime: new Date(existing.window_end).getTime() 
    };

  } catch (error) {
    console.error('Rate limiter error:', error);
    // Fail open on unexpected errors to avoid blocking legitimate traffic
    return { allowed: true, remaining: config.maxRequests, resetTime: windowEnd.getTime() };
  }
}

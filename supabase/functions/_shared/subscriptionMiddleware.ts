import { createClient } from "npm:@supabase/supabase-js@2.57.2";

interface SubscriptionCheckResult {
  valid: boolean;
  subscription_id?: string;
  plan_name?: string;
  plan_type?: string;
  features?: Record<string, boolean>;
  limits?: Record<string, number | string>;
  status?: string;
  error?: string;
  is_in_grace_period?: boolean;
}

// Validates farmer subscription status for edge function middleware.
export async function validateSubscription(
  farmerId: string,
  tenantId: string
): Promise<SubscriptionCheckResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase.rpc('check_farmer_subscription', {
      p_farmer_id: farmerId,
      p_tenant_id: tenantId,
    });

    if (error) {
      console.error('❌ [SubscriptionMiddleware] RPC error:', error);
      // Fail open in case of DB issues — don't block farmers
      return { valid: true, error: 'check_failed_fail_open' };
    }

    return data as SubscriptionCheckResult;
  } catch (err) {
    console.error('❌ [SubscriptionMiddleware] Exception:', err);
    // Fail open
    return { valid: true, error: 'exception_fail_open' };
  }
}

// Check if a specific feature is available in the subscription.
export function hasSubscriptionFeature(
  subCheck: SubscriptionCheckResult,
  featureName: string
): boolean {
  if (!subCheck.valid || !subCheck.features) return false;
  return subCheck.features[featureName] === true;
}

// Check and increment usage for a metered feature.
export async function checkAndIncrementUsage(
  farmerId: string,
  tenantId: string,
  subscriptionId: string,
  metricName: string,
  quantity: number = 1
): Promise<{ allowed: boolean; current_usage: number; limit: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase.rpc('increment_usage', {
      p_farmer_id: farmerId,
      p_tenant_id: tenantId,
      p_subscription_id: subscriptionId,
      p_metric_name: metricName,
      p_quantity: quantity,
    });

    if (error) {
      console.error('❌ [UsageMeter] RPC error:', error);
      // Fail open
      return { allowed: true, current_usage: 0, limit: 'unknown' };
    }

    const result = data as { current_usage: number; limit: string; exceeded: boolean };
    return {
      allowed: !result.exceeded,
      current_usage: result.current_usage,
      limit: result.limit,
    };
  } catch (err) {
    console.error('❌ [UsageMeter] Exception:', err);
    return { allowed: true, current_usage: 0, limit: 'unknown' };
  }
}

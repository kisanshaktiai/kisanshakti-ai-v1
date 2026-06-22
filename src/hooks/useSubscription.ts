import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { localDB } from '@/services/localDB';
import { useCallback, useEffect, useRef } from 'react';

export interface SubscriptionData {
  valid: boolean;
  subscription_id?: string;
  plan_id?: string;
  plan_name?: string;
  plan_type?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  grace_period_ends_at?: string;
  features?: Record<string, boolean>;
  limits?: Record<string, number | string>;
  days_remaining?: number;
  is_in_grace_period?: boolean;
  error?: string;
}

export interface SubscriptionState {
  data: SubscriptionData | null;
  isLoading: boolean;
  isError: boolean;
  subscriptionStatus: string;
  planName: string;
  daysRemaining: number;
  isInGracePeriod: boolean;
  hasFeature: (featureName: string) => boolean;
  isWithinLimit: (limitName: string, currentUsage: number) => boolean;
  refetch: () => void;
}

const SUBSCRIPTION_QUERY_KEY = 'farmer-subscription';
const STALE_TIME = 5 * 60 * 1000; // 5 minutes SWR

/**
 * Hook to fetch and cache farmer subscription status.
 * Uses 5-minute stale-while-revalidate caching via React Query.
 * Persists to localDB for offline fallback.
 */
export function useSubscription(): SubscriptionState {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const lastForegroundRef = useRef<number>(Date.now());

  const farmerId = user?.id;
  const tenantId = user?.tenantId;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [SUBSCRIPTION_QUERY_KEY, farmerId, tenantId],
    queryFn: async (): Promise<SubscriptionData> => {
      if (!farmerId || !tenantId) {
        return { valid: false, error: 'not_authenticated' };
      }

      const client = supabaseWithAuth(farmerId, tenantId);
      const { data: result, error } = await client.rpc('check_farmer_subscription', {
        p_farmer_id: farmerId,
        p_tenant_id: tenantId,
      });

      if (error) {
        console.error('❌ [Subscription] RPC error:', error);
        // Try IndexedDB fallback first, then localStorage
        const offline = await getOfflineFallback(farmerId);
        return offline || { valid: false, error: error.message };
      }

      const subData = result as unknown as SubscriptionData;

      // Persist to localStorage for legacy fast-path
      try {
        localStorage.setItem(
          `subscription_cache_${farmerId}`,
          JSON.stringify({ data: subData, timestamp: Date.now() })
        );
      } catch (e) {
        console.warn('⚠️ [Subscription] Failed to cache locally:', e);
      }

      return subData;
    },
    enabled: !!farmerId && !!tenantId,
    staleTime: STALE_TIME,
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Invalidate cache when app comes to foreground after 5+ min
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastForegroundRef.current;
        if (elapsed > STALE_TIME) {
          console.log('🔄 [Subscription] App foregrounded after 5+ min, refetching...');
          queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_QUERY_KEY] });
        }
        lastForegroundRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [queryClient]);

  const hasFeature = useCallback(
    (featureName: string): boolean => {
      if (!data?.valid || !data.features) return false;
      return data.features[featureName] === true;
    },
    [data]
  );

  const isWithinLimit = useCallback(
    (limitName: string, currentUsage: number): boolean => {
      if (!data?.valid || !data.limits) return false;
      const limit = data.limits[limitName];
      if (limit === 'unlimited' || limit === undefined) return true;
      return currentUsage < Number(limit);
    },
    [data]
  );

  return {
    data: data ?? null,
    isLoading,
    isError,
    subscriptionStatus: data?.status ?? 'unknown',
    planName: data?.plan_name ?? 'Free',
    daysRemaining: data?.days_remaining ?? 0,
    isInGracePeriod: data?.is_in_grace_period ?? false,
    hasFeature,
    isWithinLimit,
    refetch: () => refetch(),
  };
}

async function getOfflineFallback(farmerId: string): Promise<SubscriptionData | null> {
  // 1) Try IndexedDB (rich, full row)
  try {
    const sub = await localDB.getActiveSubscription(farmerId);
    if (sub) {
      const plan = sub.plan_id ? await localDB.getPlanById(sub.plan_id) : undefined;
      const now = Date.now();
      const endTs = sub.end_date ? new Date(sub.end_date).getTime() : null;
      const graceTs = sub.grace_period_ends_at ? new Date(sub.grace_period_ends_at).getTime() : null;
      const isActive = sub.status === 'active' && (!endTs || endTs > now);
      const isInGrace = !!graceTs && graceTs > now && (!endTs || endTs <= now);
      const daysRemaining = endTs ? Math.max(0, Math.ceil((endTs - now) / 86400000)) : 0;

      console.log('📴 [Subscription] Using IndexedDB offline fallback');
      return {
        valid: isActive || isInGrace,
        subscription_id: sub.id,
        plan_id: sub.plan_id,
        plan_name: plan?.name ?? 'Unknown',
        plan_type: plan?.plan_type,
        status: sub.status,
        start_date: sub.start_date ?? undefined,
        end_date: sub.end_date ?? undefined,
        grace_period_ends_at: sub.grace_period_ends_at ?? undefined,
        features: plan?.features ?? {},
        limits: plan?.limits ?? {},
        days_remaining: daysRemaining,
        is_in_grace_period: isInGrace,
      };
    }
  } catch (e) {
    console.warn('⚠️ [Subscription] IndexedDB fallback failed:', e);
  }

  // 2) Legacy localStorage fallback (72h TTL)
  try {
    const cached = localStorage.getItem(`subscription_cache_${farmerId}`);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    const TTL_72H = 72 * 60 * 60 * 1000;

    if (age > TTL_72H) {
      console.warn('⚠️ [Subscription] Offline cache expired (>72h)');
      return { valid: false, error: 'offline_cache_expired' };
    }

    console.log('📴 [Subscription] Using localStorage offline fallback, age:', Math.round(age / 60000), 'min');
    return data;
  } catch {
    return null;
  }
}

export { SUBSCRIPTION_QUERY_KEY };

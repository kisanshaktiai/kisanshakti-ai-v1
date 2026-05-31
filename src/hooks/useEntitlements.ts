/**
 * useEntitlements — SSOT for tenant + subscription + per-feature gating.
 * Backed by the unified `resolve_farmer_entitlements` Postgres RPC which merges:
 *   tenant_subscriptions × tenant_features × tenant_feature_overrides
 *   × tenant_feature_grants × tenant_farmer_plan_features
 *   × tenant_farmer_pricing × subscription_plans × farmer_feature_usage
 *
 * Returns one resolved view per (farmer, tenant) — call it from anywhere.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export interface FeatureEntitlement {
  enabled: boolean;
  quota: number | null;
  unit: string | null;
  used_today: number;
  used_month: number;
  tokens_today: number;
  resets_at: string | null;
  source: 'tenant_master' | 'tenant_plan_override' | 'tenant_grant' | 'plan_base';
}

export interface EntitlementsPayload {
  valid: boolean;
  reason?: string;
  tenant: {
    id: string;
    subscription_id: string | null;
    status: string;
    plan_name: string | null;
    period_end: string | null;
    in_grace: boolean;
    suspended: boolean;
    master_features: Record<string, boolean>;
  };
  farmer: {
    id: string;
    timezone: string;
    subscription_id: string | null;
    plan_id: string | null;
    plan_name: string | null;
    plan_type: string | null;
    status: string | null;
    end_date: string | null;
    in_grace: boolean;
    days_remaining: number;
  };
  features: Record<string, FeatureEntitlement>;
  limits: Record<string, number | string>;
  lands: { used: number };
  now: string;
  today: string;
}

export interface UsageView {
  allowed: boolean;
  reason: string | null;
  used: number;
  limit: number | null;
  remaining: number | null;
  resetsAt: string | null;
}

export const ENTITLEMENTS_QUERY_KEY = 'entitlements';

const STALE_MS = 5 * 60 * 1000;
const GC_MS = 30 * 60 * 1000;

function viewFromFeature(f?: FeatureEntitlement, fallbackUsed = 0): UsageView {
  if (!f) {
    return { allowed: false, reason: 'feature_unknown', used: fallbackUsed, limit: null, remaining: null, resetsAt: null };
  }
  const used = f.used_today ?? fallbackUsed;
  const limit = f.quota;
  const remaining = limit === null ? null : Math.max(limit - used, 0);
  const allowed = f.enabled && (limit === null || remaining! > 0);
  return {
    allowed,
    reason: !f.enabled ? 'feature_disabled' : (limit !== null && remaining === 0 ? 'quota_exceeded' : null),
    used,
    limit,
    remaining,
    resetsAt: f.resets_at,
  };
}

export function useEntitlements() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const farmerId = user?.id;
  const tenantId = user?.tenantId;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [ENTITLEMENTS_QUERY_KEY, farmerId, tenantId],
    queryFn: async (): Promise<EntitlementsPayload | null> => {
      if (!farmerId || !tenantId) return null;
      const { data, error } = await supabase.rpc('resolve_farmer_entitlements', {
        p_farmer: farmerId,
        p_tenant: tenantId,
      });
      if (error) {
        console.error('[useEntitlements] RPC error', error);
        // fall back to cached payload (kept by react-query gcTime)
        const cached = queryClient.getQueryData<EntitlementsPayload>([
          ENTITLEMENTS_QUERY_KEY, farmerId, tenantId,
        ]);
        return cached ?? null;
      }
      return data as unknown as EntitlementsPayload;
    },
    enabled: !!farmerId && !!tenantId,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: 2,
  });

  const canUse = useCallback((featureCode: string): UsageView => {
    return viewFromFeature(data?.features?.[featureCode]);
  }, [data]);

  const aiChat = useMemo(() => viewFromFeature(data?.features?.ai_chat), [data]);
  const lands = useMemo(() => {
    // Lands are a stocked resource (count), not a daily-reset quota — always
    // prefer the live `lands.used` count over the feature's used_today.
    const f = data?.features?.my_land;
    const used = data?.lands?.used ?? 0;
    const limit = f?.quota ?? null;
    const remaining = limit === null ? null : Math.max(limit - used, 0);
    const enabled = f?.enabled ?? true;
    return {
      allowed: enabled && (limit === null || remaining! > 0),
      reason: !enabled ? 'feature_disabled' : (limit !== null && remaining === 0 ? 'quota_exceeded' : null),
      used,
      limit,
      remaining,
      resetsAt: f?.resets_at ?? null,
    };
  }, [data]);

  // Optimistic increment after a successful chat send (server is authoritative)
  const bumpUsage = useCallback((featureCode: string, by = 1) => {
    if (!farmerId || !tenantId) return;
    queryClient.setQueryData<EntitlementsPayload | null>(
      [ENTITLEMENTS_QUERY_KEY, farmerId, tenantId],
      (prev) => {
        if (!prev?.features?.[featureCode]) return prev ?? null;
        const next = { ...prev, features: { ...prev.features } };
        const f = { ...next.features[featureCode] };
        f.used_today = (f.used_today ?? 0) + by;
        next.features[featureCode] = f;
        return next;
      }
    );
  }, [farmerId, tenantId, queryClient]);

  return {
    data: data ?? null,
    isLoading,
    isError,
    isReady: !isLoading && !!data,
    tenant: data?.tenant,
    farmer: data?.farmer,
    canUse,
    aiChat,
    lands,
    refresh: () => refetch(),
    bumpUsage,
  };
}

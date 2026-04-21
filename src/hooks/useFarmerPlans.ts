import { useQuery } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export interface FarmerPlanRow {
  id: string;
  name: string;
  plan_type: string;
  plan_category: string;
  price_monthly: number;
  price_quarterly: number | null;
  price_annually: number | null;
  features: Record<string, boolean>;
  limits: Record<string, number | string>;
  sort_order: number | null;
  is_active: boolean;
  is_public: boolean | null;
  tenant_id: string | null;
}

const LS_KEY = 'farmer_plans_cache_v1';

function readLocal(tenantId: string): FarmerPlanRow[] | null {
  try {
    const raw = localStorage.getItem(`${LS_KEY}:${tenantId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as FarmerPlanRow[];
  } catch {
    return null;
  }
}

function writeLocal(tenantId: string, plans: FarmerPlanRow[]) {
  try {
    localStorage.setItem(`${LS_KEY}:${tenantId}`, JSON.stringify(plans));
  } catch {
    /* quota or private mode — non-fatal */
  }
}

/**
 * Fetches farmer-tier subscription plans only (Kisan / Shakti / AI PRO).
 * - Server-side filtered via SECURITY DEFINER RPC `get_farmer_subscription_plans`.
 * - 30-min React Query cache → ~1 DB hit / user / 30 min at 1M-user scale.
 * - localStorage fallback for cold-start / offline.
 * - Defensive client-side filter strips any non-farmer rows.
 */
export function useFarmerPlans() {
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? '';

  return useQuery({
    queryKey: ['plans', 'farmer', tenantId],
    enabled: !!user?.id && !!tenantId,
    staleTime: 30 * 60 * 1000, // 30 min
    gcTime: 60 * 60 * 1000, // 1 h
    refetchOnWindowFocus: false,
    placeholderData: () => readLocal(tenantId) ?? undefined,
    queryFn: async (): Promise<FarmerPlanRow[]> => {
      const client = supabaseWithAuth(user!.id, tenantId) as any;
      const { data, error } = await client.rpc('get_farmer_subscription_plans', {
        p_tenant_id: tenantId,
      });

      if (error) {
        // Fallback: try local cache so the page still renders
        const cached = readLocal(tenantId);
        if (cached) return cached;
        throw error;
      }

      const rows = (data ?? []) as FarmerPlanRow[];
      // Defense-in-depth: drop anything not in farmer category
      const safe = rows.filter((p) => p.plan_category === 'farmer');
      writeLocal(tenantId, safe);
      return safe;
    },
  });
}

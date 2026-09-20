/**
 * useAnalyticsForecast — read stored monthly forecasts and trigger an
 * on-demand refresh. Cached via react-query; canonical source is the
 * `analytics_forecasts` table.
 *
 * The refresh call goes through the session-token client (same pattern as
 * useLandWeatherState) because analytics-forecast only accepts a farmer whose
 * `x-session-token` the database verifies. Two non-2xx answers are expected
 * domain states, not failures, and are returned as `refreshState` so the UI
 * can tell the farmer plainly instead of showing a generic error:
 *   409 FORECAST_GENERATION_PAUSED — no forecast engine is live yet
 *   401 UNAUTHENTICATED           — the session token was not accepted
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';

export interface ForecastRow {
  id: string;
  farmer_id: string;
  land_id: string | null;
  scope: 'land' | 'farm';
  forecast_month: string;
  generated_for_month: string;
  crop: string | null;
  projected_revenue: number;
  projected_expense: number;
  projected_profit: number;
  expected_yield_quintals: number | null;
  market_price_used: number | null;
  confidence: number | null;
  ai_reasoning: string | null;
  breakdown: Record<string, number> | null;
  model_version: string | null;
  updated_at: string;
}

export type ForecastRefreshState =
  | { status: 'generated' }
  | { status: 'paused' }
  | { status: 'unauthenticated' };

const EXPECTED_REFRESH_CODES: Record<string, ForecastRefreshState> = {
  FORECAST_GENERATION_PAUSED: { status: 'paused' },
  UNAUTHENTICATED: { status: 'unauthenticated' },
};

export function useAnalyticsForecast(months = 6) {
  const { session, user } = useAuthStore();
  const { tenant } = useTenant();
  const farmerId = session?.farmerId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['analytics-forecast', farmerId, months],
    enabled: !!farmerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const today = new Date();
      const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
        .toISOString().slice(0, 10);
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + months, 1))
        .toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('analytics_forecasts' as any)
        .select('*')
        .eq('farmer_id', farmerId!)
        .gte('forecast_month', startMonth)
        .lt('forecast_month', end)
        .order('forecast_month', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ForecastRow[];
    },
  });

  const refresh = useMutation<ForecastRefreshState>({
    mutationFn: async () => {
      if (!farmerId) throw new Error('no farmer');
      const client = user?.id && tenant?.id ? supabaseWithAuth(user.id, tenant.id) : supabase;
      // farmer_id stays in the body only so the call also works against the
      // pre-lock-down function version (which requires it); the lock-down
      // version ignores it and takes identity from the session token.
      const { error } = await client.functions.invoke('analytics-forecast', {
        body: { mode: 'farmer', farmer_id: farmerId },
      });
      if (error) {
        const context = (error as { context?: Response }).context;
        let errorBody: { code?: string; error?: string } | null = null;
        try {
          errorBody = context ? await context.clone().json() : null;
        } catch {
          errorBody = null;
        }
        const expected = errorBody?.code ? EXPECTED_REFRESH_CODES[errorBody.code] : undefined;
        if (expected) return expected;
        throw error;
      }
      return { status: 'generated' };
    },
    onSuccess: (state) => {
      if (state.status === 'generated') {
        qc.invalidateQueries({ queryKey: ['analytics-forecast', farmerId] });
      }
    },
  });

  return { ...query, refresh };
}

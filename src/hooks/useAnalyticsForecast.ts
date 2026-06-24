/**
 * useAnalyticsForecast — read AI-generated monthly forecasts and trigger
 * an on-demand refresh. Cached via react-query; canonical source is the
 * `analytics_forecasts` table updated monthly by a pg_cron job.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

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

export function useAnalyticsForecast(months = 6) {
  const { session } = useAuthStore();
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

  const refresh = useMutation({
    mutationFn: async () => {
      if (!farmerId) throw new Error('no farmer');
      const { data, error } = await supabase.functions.invoke('analytics-forecast', {
        body: { mode: 'farmer', farmer_id: farmerId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics-forecast', farmerId] }),
  });

  return { ...query, refresh };
}

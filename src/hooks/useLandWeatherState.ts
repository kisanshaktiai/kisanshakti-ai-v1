import { useQuery } from '@tanstack/react-query';
import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';

/**
 * MODEL B — land-scoped agronomy.
 *
 * Reads the latest row of `public.land_weather_state` for ONE land through the
 * `weather` edge function (`action: 'land_state'`).
 *
 * Why not query the table directly?
 *   `land_weather_state` RLS is `auth.uid()`-based, while this app authenticates
 *   farmers with custom `x-farmer-id` / `x-tenant-id` headers. A direct
 *   PostgREST read therefore returns zero rows, silently. The edge function runs
 *   with the service role and scopes by the resolved tenant.
 *
 * Invariant: no proximity substitution. Display weather (Model A) may borrow a
 * nearby cell; GDD / ET0 / disease compound daily, so agronomy never may.
 */

export interface LandWeatherState {
  land_id: string;
  tenant_id: string;
  cell_key: string | null;
  metric_date: string;
  temperature_c: number | null;
  humidity_percent: number | null;
  wind_speed_kmh: number | null;
  total_rainfall_mm: number | null;
  effective_rainfall_mm: number | null;
  runoff_loss_mm: number | null;
  water_deficit_mm: number | null;
  soil_type_used: string | null;
  irrigation_needed: boolean | null;
  irrigation_urgency: string | null;
  gdd_daily: number | null;
  et0_mm: number | null;
  vpd_kpa: number | null;
  disease_risk_score: number | null;
  disease_risk_level: string | null;
  crop_stress_level: string | null;
  water_balance_status: string | null;
  computed_at: string | null;
  confidence: number | null;
  source: string | null;
}

export interface LandWeatherStateResult {
  land: { id: string; name: string; current_crop: string | null; area_acres: number | null; soil_type: string | null } | null;
  state: LandWeatherState | null;
}

export function useLandWeatherState(landId?: string | null) {
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  const query = useQuery<LandWeatherStateResult>({
    queryKey: ['land-weather-state', landId, tenant?.id],
    enabled: !!landId && !!tenant?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const client = user?.id && tenant?.id ? supabaseWithAuth(user.id, tenant.id) : supabase;
      const { data, error } = await client.functions.invoke('weather', {
        body: { action: 'land_state', landId },
      });
      if (error) throw error;
      return { land: data?.land ?? null, state: data?.state ?? null };
    },
  });

  const state = query.data?.state ?? null;

  // A derived row is only trustworthy for the day it was computed for.
  const isToday = (() => {
    if (!state?.metric_date) return false;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return state.metric_date.slice(0, 10) === today;
  })();

  return {
    state,
    land: query.data?.land ?? null,
    isToday,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

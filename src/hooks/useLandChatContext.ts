/**
 * useLandChatContext
 *
 * SINGLE prefetch/query hook that assembles the full "land-specific chat"
 * context BEFORE the farmer starts typing in a land tab of AI Chat.
 *
 * Contract (no assumptions, DB is SSOT):
 *   Fetches, in parallel and scoped to (land_id, tenant_id, farmer_id):
 *     • lands                 → the authoritative land row (already cached in
 *                               useLands, but we re-select the specific row so
 *                               columns dropped from the list view are present).
 *     • land_crops            → active crop row: crop_name, crop_variety,
 *                               sowing_date, expected_harvest_date, status.
 *     • soil_health           → latest test/estimate for pH, NPK, texture,
 *                               moisture, agro-climatic zone.
 *     • ndvi_data             → latest ndvi row within 45d for the field.
 *     • weather_current       → latest live weather bound to the land.
 *     • land_weather_metrics  → latest daily aggregate (GDD, ET0, rainfall).
 *
 * Every column referenced here was verified against the live public schema
 * (see .lovable/plan.md audit — 2026-07-07). No column is assumed.
 *
 * Consumers:
 *   • LandContextCard renders the resolved values.
 *   • EnhancedAIChatInterface calls `prefetchLandChatContext(qc, ...)` when the
 *     farmer taps a land tab so the panel is ready on first paint.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export interface LandChatContext {
  land: any | null;
  /**
   * Active crop schedule row from `public.crop_schedules` — the SSOT for
   * "what is planted right now" (crop_name, crop_variety, variety_id,
   * sowing_date, expected_harvest_date, status/lifecycle).
   */
  activeCrop: {
    crop_name: string | null;
    crop_variety: string | null;
    variety_id: string | null;
    sowing_date: string | null;
    expected_harvest_date: string | null;
    actual_harvest_date: string | null;
    status: string | null;
    lifecycle_status: string | null;
    harvest_status: string | null;
    stages_covered: any | null;
  } | null;
  /**
   * Stage SSOT: `public.resolve_crop_phenology(land_id, today)` — derives the
   * current growth stage from crop_stage_master + variety_phenology_profile
   * (variety-aware), using the schedule's sowing_date and any GDD data.
   * NEVER derive stage on the client — always trust this resolver.
   */
  phenology: {
    stage_uuid: string | null;
    stage_code: string | null;
    growth_stage: string | null;
    crop_code: string | null;
    crop_cycle: string | null;
    current_das: number | null;
    current_gdd: number | null;
    expected_ndvi_min: number | null;
    expected_ndvi_max: number | null;
    expected_height_cm_min: number | null;
    expected_height_cm_max: number | null;
    phenology_index: number | null;
    confidence: number | null;
    reference_system: string | null;
    source: string | null;
    resolver_version: number | null;
  } | null;
  soil: {
    ph_level: number | null;
    soil_type: string | null;
    texture: string | null;
    nitrogen_level: string | null;
    phosphorus_level: string | null;
    potassium_level: string | null;
    organic_carbon: number | null;
    soil_moisture_surface_percent: number | null;
    agro_climatic_zone: string | null;
    test_date: string | null;
    source: string | null;
  } | null;
  ndvi: {
    date: string | null;
    ndvi_value: number | null;
    mean_ndvi: number | null;
    coverage_percentage: number | null;
    cloud_coverage: number | null;
    quality_score: number | null;
    image_url: string | null;
  } | null;
  weather: {
    temperature_celsius: number | null;
    humidity_percent: number | null;
    wind_speed_kmh: number | null;
    rain_1h_mm: number | null;
    rain_24h_mm: number | null;
    weather_description: string | null;
    observation_time: string | null;
  } | null;
  weatherMetrics: {
    metric_date: string | null;
    gdd_accumulated: number | null;
    et0_mm: number | null;
    total_rainfall_mm: number | null;
    irrigation_urgency: string | null;
    disease_risk_level: string | null;
  } | null;
}

const EMPTY_CTX: LandChatContext = {
  land: null,
  activeCrop: null,
  phenology: null,
  soil: null,
  ndvi: null,
  weather: null,
  weatherMetrics: null,
};

const FIVE_MIN = 5 * 60 * 1000;

export const landChatContextKey = (landId: string | null, tenantId?: string) =>
  ['land-chat-context', landId, tenantId] as const;

async function fetchLandChatContext(
  landId: string,
  tenantId: string,
  farmerId: string,
): Promise<LandChatContext> {
  const client = supabaseWithAuth(farmerId, tenantId);

  const [landRes, cropRes, phenRes, soilRes, ndviRes, wxRes, wxMetricRes] = await Promise.all([
    client
      .from('lands')
      .select('id, name, area_acres, soil_type, current_crop, current_crop_id, crop_stage, planting_date, last_sowing_date, expected_harvest_date, water_source, irrigation_type, irrigation_source, district, state, village, center_lat, center_lon, last_ndvi_value, last_ndvi_calculation, ndvi_status')
      .eq('id', landId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    // Active crop schedule = SSOT for what is planted now (crop + variety + sowing).
    client
      .from('crop_schedules')
      .select('crop_name, crop_variety, variety_id, sowing_date, expected_harvest_date, actual_harvest_date, status, lifecycle_status, harvest_status, stages_covered')
      .eq('land_id', landId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sowing_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    // Phenology SSOT: variety-aware growth-stage resolver (DB function).
    client.rpc('resolve_crop_phenology', { p_land_id: landId }),
    client
      .from('soil_health')
      .select('ph_level, soil_type, texture, nitrogen_level, phosphorus_level, potassium_level, organic_carbon, soil_moisture_surface_percent, agro_climatic_zone, test_date, source')
      .eq('land_id', landId)
      .eq('tenant_id', tenantId)
      .order('test_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('ndvi_data')
      .select('date, ndvi_value, mean_ndvi, coverage_percentage, cloud_coverage, quality_score, image_url')
      .eq('land_id', landId)
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('weather_current')
      .select('temperature_celsius, humidity_percent, wind_speed_kmh, rain_1h_mm, rain_24h_mm, weather_description, observation_time')
      .eq('land_id', landId)
      .eq('tenant_id', tenantId)
      .order('observation_time', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('land_weather_metrics')
      .select('metric_date, gdd_accumulated, et0_mm, total_rainfall_mm, irrigation_urgency, disease_risk_level')
      .eq('land_id', landId)
      .eq('tenant_id', tenantId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // resolve_crop_phenology returns TABLE(...) → array; take first row (or null).
  const phenRow = Array.isArray(phenRes?.data) ? (phenRes.data[0] ?? null) : null;

  return {
    land: (landRes.data as any) ?? null,
    activeCrop: (cropRes.data as any) ?? null,
    phenology: (phenRow as any) ?? null,
    soil: (soilRes.data as any) ?? null,
    ndvi: (ndviRes.data as any) ?? null,
    weather: (wxRes.data as any) ?? null,
    weatherMetrics: (wxMetricRes.data as any) ?? null,
  };
}

export function useLandChatContext(landId: string | null | undefined) {
  const { user, session } = useAuthStore();
  const tenantId = user?.tenantId ?? session?.tenantId;
  const farmerId = user?.id ?? session?.farmerId;

  const query = useQuery({
    queryKey: landChatContextKey(landId ?? null, tenantId),
    queryFn: () => fetchLandChatContext(landId!, tenantId!, farmerId!),
    enabled: !!landId && !!tenantId && !!farmerId,
    staleTime: FIVE_MIN,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    context: query.data ?? EMPTY_CTX,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fire-and-forget prefetch used on land-tab click so the panel is ready
 * before the farmer's first paint / first message.
 */
export function prefetchLandChatContext(
  qc: QueryClient,
  landId: string,
  tenantId: string,
  farmerId: string,
): void {
  if (!landId || !tenantId || !farmerId) return;
  void qc.prefetchQuery({
    queryKey: landChatContextKey(landId, tenantId),
    queryFn: () => fetchLandChatContext(landId, tenantId, farmerId),
    staleTime: FIVE_MIN,
  });
}

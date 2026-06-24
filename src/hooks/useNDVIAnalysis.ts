import { useQuery } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import {
  getScientificRiskLevel,
  getTrendDirection,
  isObservationReliable,
  computeTrendPerDay,
  NDVI_THRESHOLDS,
} from '@/lib/ndviScience';

export interface NDVIMetadata {
  alerts?: string[];
  health_label?: 'Critical' | 'Moderate' | 'Healthy' | 'Excellent';
  ndvi_trend?: number;
  ndre_trend?: number;
  ndvi_geotiff_url?: string;
  valid_observations?: number;
}

export interface NDVIDataComplete {
  id: string;
  land_id: string;
  date: string;
  ndvi_value: number;
  evi_value: number | null;
  ndwi_value: number | null;
  savi_value: number | null;
  min_ndvi: number | null;
  max_ndvi: number | null;
  ndvi_min?: number | null;
  ndvi_max?: number | null;
  mean_ndvi: number | null;
  median_ndvi: number | null;
  ndvi_std: number | null;
  quality_score: number | null;
  confidence_level: string | null;
  cloud_coverage: number | null;
  cloud_cover?: number | null;
  coverage_percentage: number | null;
  coverage?: number | null;
  valid_pixels: number | null;
  total_pixels: number | null;
  satellite_source: string | null;
  collection_id: string | null;
  scene_id: string | null;
  processing_level: string | null;
  spatial_resolution: number | null;
  tile_id: string | null;
  image_url: string | null;
  metadata: NDVIMetadata | null;
  created_at: string;
  updated_at: string | null;
  computed_at: string | null;
  soil_moisture: number | null;
  tenant_id: string;
  /** Derived client-side */
  is_reliable?: boolean;
}

export interface NDVIProcessingLog {
  id: string;
  land_id: string | null;
  processing_step: string;
  step_status: string;
  completed_at: string | null;
  created_at: string | null;
  error_message: string | null;
  metadata: {
    thumbnail_url?: string;
    geotiff_url?: string;
    health_label?: string;
  } | null;
}

export interface NDVIProcessingThumbnail {
  url: string;
  date: string;
  geotiffUrl?: string;
}

export interface NDVIPrediction {
  days7:  { predicted_ndvi: number; trend_direction: 'improving' | 'declining' | 'stable'; confidence: number };
  days14: { predicted_ndvi: number; trend_direction: 'improving' | 'declining' | 'stable'; confidence: number };
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  /** i18n keys, NOT English text. */
  recommended_action_keys: string[];
  /** Indicative only — based on linear extrapolation of reliable observations. */
  is_indicative: true;
}

export interface NDVIAnalysisResult {
  /** Most recent reliable observation (or null). */
  current: NDVIDataComplete | null;
  /** Most recent reliable + all reliable history. */
  history: NDVIDataComplete[];
  /** Latest raw row, even if unreliable — used to show "stale" banner. */
  latestRaw: NDVIDataComplete | null;
  /** Latest active processing status from ndvi_processing_logs (last 45 days only). */
  latestProcessingLog: NDVIProcessingLog | null;
  /** Fallback thumbnail from successful processing logs, still limited to last 45 days. */
  processingThumbnail: NDVIProcessingThumbnail | null;
  prediction: NDVIPrediction | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function buildRecommendationKeys(ndvi: number, alerts: string[] | undefined): string[] {
  const keys: string[] = [];
  if (ndvi < NDVI_THRESHOLDS.POOR) {
    keys.push('ndvi.actions.irrigate_immediately', 'ndvi.actions.contact_expert', 'ndvi.actions.take_photos');
  } else if (ndvi < NDVI_THRESHOLDS.MODERATE) {
    keys.push('ndvi.actions.increase_irrigation', 'ndvi.actions.check_nutrients', 'ndvi.actions.look_pests');
  } else if (ndvi < NDVI_THRESHOLDS.HEALTHY) {
    keys.push('ndvi.actions.maintain_water', 'ndvi.actions.continue_monitoring');
  } else {
    keys.push('ndvi.actions.maintain_water', 'ndvi.actions.continue_monitoring');
  }
  if (alerts?.some((a) => /water stress/i.test(a))) keys.push('ndvi.actions.water_now');
  // Deduplicate, cap 4
  return Array.from(new Set(keys)).slice(0, 4);
}

function calculatePrediction(reliableHistory: NDVIDataComplete[]): NDVIPrediction | null {
  // Strict gating: need ≥ 4 reliable observations
  if (reliableHistory.length < 4) return null;

  const trendInfo = computeTrendPerDay(
    reliableHistory.map((r) => ({ date: r.date, ndvi_value: r.ndvi_value })),
    6,
  );
  if (!trendInfo) return null;

  const current = reliableHistory[0];
  const currentNdvi = current.ndvi_value;
  const trend = trendInfo.trend; // ΔNDVI/day

  const predicted7 = Math.max(0, Math.min(1, currentNdvi + trend * 7));
  const predicted14 = Math.max(0, Math.min(1, currentNdvi + trend * 14));
  const trendDir = getTrendDirection(trend);

  // Honest confidence: capped by sample size; never above 80 since linear.
  const conf7 = Math.min(80, 40 + trendInfo.n * 6);
  const conf14 = Math.min(65, 30 + trendInfo.n * 5);

  return {
    days7:  { predicted_ndvi: predicted7,  trend_direction: trendDir, confidence: conf7 },
    days14: { predicted_ndvi: predicted14, trend_direction: trendDir, confidence: conf14 },
    risk_level: getScientificRiskLevel(currentNdvi, trend),
    recommended_action_keys: buildRecommendationKeys(currentNdvi, current.metadata?.alerts),
    is_indicative: true,
  };
}

const SIX_HOURS = 6 * 60 * 60 * 1000;
const ONE_HOUR  = 60 * 60 * 1000;

export function useNDVIAnalysis(landId: string | null): NDVIAnalysisResult {
  const { tenant } = useTenant();
  const { session } = useAuthStore();
  const tenantId = tenant?.id ?? session?.tenantId;
  const farmerId = session?.farmerId;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ndvi-analysis', landId, tenantId],
    queryFn: async () => {
      if (!landId || !tenantId) {
        return { current: null, history: [], latestRaw: null, latestProcessingLog: null, processingThumbnail: null };
      }
      const client = supabaseWithAuth(farmerId, tenantId);
      const cutoffDate = new Date(Date.now() - 45 * 86_400_000);
      const cutoffDay = cutoffDate.toISOString().slice(0, 10);

      const [ndviResult, logResult] = await Promise.all([
        client
          .from('ndvi_data')
          .select('*')
          .eq('land_id', landId)
          .eq('tenant_id', tenantId)
          .gte('date', cutoffDay)
          .order('date', { ascending: false })
          .limit(60),
        client
          .from('ndvi_processing_logs')
          .select('id, land_id, processing_step, step_status, completed_at, created_at, error_message, metadata')
          .eq('land_id', landId)
          .eq('tenant_id', tenantId)
          .gte('created_at', cutoffDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      const { data: rows, error: qErr } = ndviResult;
      if (qErr) throw qErr;

      const parsedAll = (rows || []).map((item: any) => {
        const metadata = item.metadata
          ? (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)
          : null;
        const row: NDVIDataComplete = { ...item, metadata };
        row.is_reliable = isObservationReliable(row);
        return row;
      });

      // Deduplicate same-day rows: keep the best scene per date.
      // Priority: highest quality_score → highest coverage_percentage → lowest cloud_coverage.
      const byDate = new Map<string, NDVIDataComplete>();
      for (const r of parsedAll) {
        const prev = byDate.get(r.date);
        if (!prev) { byDate.set(r.date, r); continue; }
        const q = (x: NDVIDataComplete) => (x.quality_score ?? 0);
        const c = (x: NDVIDataComplete) => (x.coverage_percentage ?? x.coverage ?? 0);
        const cl = (x: NDVIDataComplete) => (x.cloud_coverage ?? x.cloud_cover ?? 100);
        const better =
          q(r) > q(prev) ||
          (q(r) === q(prev) && c(r) > c(prev)) ||
          (q(r) === q(prev) && c(r) === c(prev) && cl(r) < cl(prev));
        if (better) byDate.set(r.date, r);
      }
      const parsed = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));

      const latestRaw = parsed[0] || null;
      const reliable = parsed.filter((r) => r.is_reliable);
      const current = reliable[0] || latestRaw;
      const history = reliable.length > 0 ? reliable : parsed;
      const logs = ((logResult.data || []) as any[]).map((item) => ({
        ...item,
        metadata: item.metadata
          ? (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)
          : null,
      })) as NDVIProcessingLog[];
      const latestProcessingLog = logs[0] || null;
      const successfulThumb = logs.find((log) =>
        log.processing_step === 'PROCESS_END'
        && log.step_status === 'completed'
        && !!log.metadata?.thumbnail_url,
      );
      const processingThumbnail = successfulThumb?.metadata?.thumbnail_url
        ? {
            url: successfulThumb.metadata.thumbnail_url,
            date: successfulThumb.completed_at || successfulThumb.created_at || cutoffDay,
            geotiffUrl: successfulThumb.metadata.geotiff_url,
          }
        : null;

      return { current, history, latestRaw, latestProcessingLog, processingThumbnail };
    },
    enabled: !!landId && !!farmerId && !!tenantId,
    staleTime: SIX_HOURS,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const prediction = data?.history ? calculatePrediction(data.history) : null;

  return {
    current: data?.current ?? null,
    history: data?.history ?? [],
    latestRaw: data?.latestRaw ?? null,
    latestProcessingLog: data?.latestProcessingLog ?? null,
    processingThumbnail: data?.processingThumbnail ?? null,
    prediction,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  MICRO-TILES (feeds the heatmap renderer)                                  */
/* ────────────────────────────────────────────────────────────────────────── */

export interface NDVIMicroTile {
  id: string;
  land_id: string;
  acquisition_date: string;
  bbox: any;
  cloud_cover: number | null;
  ndvi_mean: number | null;
  ndvi_min: number | null;
  ndvi_max: number | null;
  ndvi_std_dev: number | null;
  ndvi_thumbnail_url: string | null;
  resolution_meters: number | null;
  /** Derived */
  is_reliable: boolean;
}

export function useNDVIMicroTiles(landId: string | null) {
  const { tenant } = useTenant();
  const { session } = useAuthStore();
  const tenantId = tenant?.id ?? session?.tenantId;
  const farmerId = session?.farmerId;

  return useQuery({
    queryKey: ['ndvi-micro-tiles', landId, tenantId],
    queryFn: async (): Promise<NDVIMicroTile[]> => {
      if (!landId || !tenantId) return [];
      // ndvi_micro_tiles is NOT actively updated (last write > 45 days ago).
      // The farmer app must rely only on `ndvi_data.image_url` for per-date
      // satellite thumbnails. We keep the hook for forward-compat but only
      // return rows from the last 45 days so stale data never reaches the map.
      const client = supabaseWithAuth(farmerId, tenantId);
      const cutoff = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await client
        .from('ndvi_micro_tiles')
        .select('*')
        .eq('land_id', landId)
        .eq('tenant_id', tenantId)
        .gte('acquisition_date', cutoff)
        .order('acquisition_date', { ascending: false })
        .limit(24);
      if (error) return [];
      return (data || []).map((t: any) => ({
        ...t,
        is_reliable: (t.cloud_cover ?? 0) <= 30,
      })) as NDVIMicroTile[];
    },
    enabled: !!landId && !!farmerId && !!tenantId,
    staleTime: ONE_HOUR,
    refetchOnWindowFocus: false,
  });
}

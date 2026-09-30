/**
 * useFieldSky — one model for the farmer-facing satellite view.
 *
 * Reads only governed sources and reports what they say; it does not invent
 * agronomic thresholds:
 *   - v_ndvi_decision_grade / ndvi_data   (via useNDVIAnalysis)   observed optical passes
 *   - ndvi_data radar rows                                          cloud-proof structure (RVI)
 *   - ndvi_intelligence                    parcel-vs-surroundings robust z, forecast band
 *   - crop_stage_master                    expected NDVI band for the crop at this DAS (DB-governed)
 *   - land_weather_state                   FAO-56 water balance (root depletion vs RAW, rain)
 *   - lands                                crop and sowing/transplant date
 *
 * The words it produces ("behind", "with", "ahead") are statistical descriptors
 * of a robust z-score, and the stage position is the row's own expected band.
 * Everything else the screen shows is a picture of the data, not a judgement.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useNDVIAnalysis, type NDVIDataComplete } from '@/hooks/useNDVIAnalysis';
import { useLandWeatherState, type LandWeatherState } from '@/hooks/useLandWeatherState';
import { useSatelliteWaterLayers } from '@/hooks/useSatelliteWaterLayers';

export type FieldState = 'as_expected' | 'slower' | 'something_wrong' | 'unclear' | 'no_data';
export type CohortState = 'well_behind' | 'behind' | 'with' | 'ahead' | 'unknown';
export type StageState = 'below' | 'within' | 'above' | 'no_sowing_date' | 'no_band';
export type SkyState = 'clear' | 'hazy' | 'cloudy' | 'radar_only' | 'none';

interface IntelRow { acquisition_date: string; observed_or_predicted: string | null; parcel_context_robust_z: number | null; parcel_context_delta: number | null; evidence_json: Record<string, unknown> | null; estimated_ndvi_low: number | null; estimated_ndvi_high: number | null; intelligence_status: string | null; }
interface RadarRow { acquisition_date: string; rvi_value: number | null; cross_ratio_db: number | null; }
interface StageRow { stage_code: string; growth_stage: string | null; das_min: number | null; das_max: number | null; expected_ndvi_min: number | null; expected_ndvi_max: number | null; cultivation_method: string | null; phenology_index: number | null; expected_height_cm_min: number | null; expected_height_cm_max: number | null; expected_leaf_count_min: number | null; expected_leaf_count_max: number | null; stage_node_type: string | null; }
interface ScheduleRow { sowing_date: string | null; transplant_date: string | null; cultivation_method: string | null; crop_name: string | null; }
interface LandCtxRow { id: string; current_crop: string | null; current_crop_id: string | null; last_sowing_date: string | null; planting_date: string | null; transplant_date: string | null; das: number | null; crop_cycle: string | null; }
interface WaterRowLite { image_path?: string | null; image_metadata?: Record<string, unknown> }

export interface LayerFrame { date: string; path: string; bounds: { west: number; south: number; east: number; north: number } | null; kind: 'zones' | 'gradient'; shares: { lower: number; normal: number; higher: number } | null }
export type Quarter = 'NE' | 'NW' | 'SE' | 'SW';
const toBounds = (m: unknown): LayerFrame['bounds'] => {
  const b = (m as { bounds_wgs84?: Record<string, unknown> } | null)?.bounds_wgs84;
  return b && [b.west, b.south, b.east, b.north].every((x) => Number.isFinite(Number(x))) ? { west: Number(b.west), south: Number(b.south), east: Number(b.east), north: Number(b.north) } : null;
};
const asQuarter = (q: unknown): Quarter | null => (q === 'NE' || q === 'NW' || q === 'SE' || q === 'SW' ? q : null);

export interface FieldSky {
  landId: string | null;
  loading: boolean;
  error: unknown;
  /** newest decision-grade optical pass (all v3 columns) */
  latest: NDVIDataComplete | null;
  previous: NDVIDataComplete | null;
  history: Array<{ date: string; ndvi: number; quality?: number | null }>;
  /** newest radar pass, for cloudy days */
  radar: { date: string; rvi: number | null; cross_ratio_db: number | null } | null;
  sky: { state: SkyState; ageDays: number | null; cloudPct: number | null; fieldSeenPct: number | null; evidence: string | null; epc: number | null; purity: number | null };
  /** "where to check" quarters from the pipeline (ndvi_data.metadata.zones): growth and, independently, moisture */
  zone: { level: 'none' | 'watch' | 'check'; quarter: Quarter | null; pattern: string | null; reason: string | null;
          water: { level: 'none' | 'watch' | 'check'; quarter: Quarter | null } };
  /** every dated image per layer (newest first) with the bounds the pipeline wrote — drives the map */
  layerFrames: { vigour: LayerFrame[]; moisture: LayerFrame[]; standing: LayerFrame[] };
  stage: { state: StageState; das: number | null; stageCode: string | null; stageName: string | null; expectedMin: number | null; expectedMax: number | null; sowingDate: string | null; cropCode: string | null;
           /** ordered ladder of this crop's stages (crop_stage_master) and where the field sits on it — drives the crop figure */
           ladder: Array<{ code: string; name: string | null; dasMin: number | null; dasMax: number | null; heightCm: number | null; leaves: number | null }>; index: number | null; heightCm: number | null; leaves: number | null; sowingSource: 'schedule' | 'land' | null };
  neighbours: { state: CohortState; z: number | null; delta: number | null; contextPresent: boolean; asOf: string | null };
  forecast: { low: number | null; high: number | null; targetDate: string | null; daysAhead: number | null } | null;
  /** weather side comes from the `weather` edge function (useLandWeatherState): governed FAO-56 balance flags, not raw table columns */
  water: { ndmi: number | null; ndmiPrev: number | null; ndmiDrop: number | null; passGapDays: number | null; waterDeficitMm: number | null; irrigationNeeded: boolean | null; balanceStatus: string | null; rainMm: number | null; urgency: string | null; asOf: string | null; agreeing: number; canopyImagePath: string | null; surfaceImagePath: string | null; surfaceEvidencePx: number | null };
  greenness: { ndre: number | null; ndrePrev: number | null; ndreDrop: number | null };
  state: FieldState;
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const daysBetween = (a?: string | null, b?: string | null): number | null => {
  if (!a || !b) return null; const ms = new Date(a).getTime() - new Date(b).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
};

export function useFieldSky(landId: string | null, refreshKey = 0): FieldSky {
  const { session } = useAuthStore();
  const { tenant } = useTenant();
  const tenantId = session?.tenantId ?? tenant?.id;

  const ndvi = useNDVIAnalysis(landId, refreshKey);
  const weather = useLandWeatherState(landId);
  const canopy = useSatelliteWaterLayers(landId || undefined, 'canopy_moisture_signal');
  const surface = useSatelliteWaterLayers(landId || undefined, 'surface_water_trace');

  const landQ = useQuery({
    queryKey: ['field-sky-land', landId, tenantId],
    enabled: !!landId && !!tenantId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('lands')
        .select('id, current_crop, current_crop_id, last_sowing_date, planting_date, transplant_date, das, crop_cycle')
        .eq('id', landId!).eq('tenant_id', tenantId!).maybeSingle();
      if (error) throw error; return data as LandCtxRow | null;
    },
  });

  const intelQ = useQuery({
    queryKey: ['field-sky-intel', landId, tenantId],
    enabled: !!landId && !!tenantId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('ndvi_intelligence')
        .select('acquisition_date, observed_or_predicted, parcel_context_robust_z, parcel_context_delta, evidence_json, estimated_ndvi_low, estimated_ndvi_high, intelligence_status')
        .eq('land_id', landId!).eq('tenant_id', tenantId!)
        .order('acquisition_date', { ascending: false }).limit(40);
      if (error) throw error; return (data || []) as IntelRow[];
    },
  });

  const radarQ = useQuery({
    queryKey: ['field-sky-radar', landId, tenantId],
    enabled: !!landId && !!tenantId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('ndvi_data')
        .select('acquisition_date, rvi_value, cross_ratio_db')
        .eq('land_id', landId!).eq('tenant_id', tenantId!).eq('observation_source', 'sentinel-1')
        .not('rvi_value', 'is', null)
        .order('acquisition_date', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error; return data as RadarRow | null;
    },
  });

  // The proactive evaluator takes the sowing date from the ACTIVE crop schedule
  // first and only then from the land row; the Season card must agree with it.
  const scheduleQ = useQuery({
    queryKey: ['field-sky-schedule', landId, tenantId],
    enabled: !!landId && !!tenantId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('crop_schedules')
        .select('sowing_date, transplant_date, cultivation_method, crop_name')
        .eq('land_id', landId!).eq('tenant_id', tenantId!).eq('is_active', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error; return data as ScheduleRow | null;
    },
  });
  const scheduleSowing: string | null = scheduleQ.data?.sowing_date ?? scheduleQ.data?.transplant_date ?? null;
  const landSowing: string | null = landQ.data?.last_sowing_date ?? landQ.data?.planting_date ?? landQ.data?.transplant_date ?? null;
  const sowingDate: string | null = scheduleSowing ?? landSowing;
  const sowingSource: 'schedule' | 'land' | null = scheduleSowing ? 'schedule' : landSowing ? 'land' : null;
  const cropCode: string | null = (landQ.data?.current_crop ?? scheduleQ.data?.crop_name) ? String(landQ.data?.current_crop ?? scheduleQ.data?.crop_name).toUpperCase().trim() : null;
  const das = sowingDate ? daysBetween(new Date().toISOString().slice(0, 10), sowingDate) : (n(landQ.data?.das));

  const stageQ = useQuery({
    queryKey: ['field-sky-stage-ladder', cropCode],
    enabled: !!cropCode,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('crop_stage_master')
        .select('stage_code, growth_stage, das_min, das_max, expected_ndvi_min, expected_ndvi_max, cultivation_method, phenology_index, expected_height_cm_min, expected_height_cm_max, expected_leaf_count_min, expected_leaf_count_max, stage_node_type')
        .ilike('crop_code', cropCode!).eq('is_active', true)
        .not('das_min', 'is', null)
        .order('phenology_index', { ascending: true, nullsFirst: false })
        .order('das_min', { ascending: true });
      if (error) throw error; return (data || []) as StageRow[];
    },
  });

  const { latestRaw, current, history, isLoading: ndviLoading, error: ndviError } = ndvi;

  return useMemo<FieldSky>(() => {
    // useNDVIAnalysis.history is the full decision-grade series, newest first,
    // each row merged with its ndvi_data asset columns (ndre/ndmi/spatial stats).
    const latest: NDVIDataComplete | null = latestRaw ?? current ?? null;
    const prevRow: NDVIDataComplete | null = (history || [])[1] ?? null;

    const passDate = (r: NDVIDataComplete | null): string | null => r?.date ?? null;
    const ageDays = latest ? (n(latest.age_days) ?? daysBetween(new Date().toISOString().slice(0, 10), passDate(latest))) : null;
    const cloudPct = n(latest?.cloud_cover);
    const vp = n(latest?.valid_pixels), tp = n(latest?.total_pixels);
    const fieldSeen = vp != null && tp ? Math.round((vp / tp) * 100) : n(latest?.coverage_percentage);
    const fresh = latest ? latest.is_fresh === true || (ageDays != null && ageDays <= 14) : false;
    const radar = radarQ.data ? { date: radarQ.data.acquisition_date, rvi: n(radarQ.data.rvi_value), cross_ratio_db: n(radarQ.data.cross_ratio_db) } : null;

    let skyState: SkyState = 'none';
    if (latest && fresh) skyState = (cloudPct ?? 0) > 10 ? 'hazy' : 'clear';
    else if (radar && daysBetween(new Date().toISOString().slice(0, 10), radar.date)! <= 14) skyState = 'radar_only';
    else if (latest) skyState = 'cloudy';

    // stage ladder (DB-governed): prefer the lane matching the schedule's cultivation method, else any
    const method = scheduleQ.data?.cultivation_method ? String(scheduleQ.data.cultivation_method).toLowerCase() : null;
    const allStages = stageQ.data || [];
    const laneStages = method ? allStages.filter((r) => !r.cultivation_method || String(r.cultivation_method).toLowerCase() === method) : allStages;
    const ladderRows = (laneStages.length ? laneStages : allStages);
    const mid = (a: number | null, b: number | null): number | null => (a != null && b != null ? (a + b) / 2 : a ?? b);
    const ladder = ladderRows.map((r) => ({ code: r.stage_code, name: r.growth_stage, dasMin: r.das_min, dasMax: r.das_max, heightCm: mid(r.expected_height_cm_min, r.expected_height_cm_max), leaves: mid(r.expected_leaf_count_min, r.expected_leaf_count_max) }));
    let stageIndex: number | null = null;
    if (das != null) {
      stageIndex = ladderRows.findIndex((r) => r.das_min != null && r.das_max != null && das >= r.das_min && das <= r.das_max);
      if (stageIndex < 0) stageIndex = ladderRows.length && das > (ladderRows[ladderRows.length - 1].das_max ?? -1) ? ladderRows.length - 1 : null;
    }
    const band = stageIndex != null ? ladderRows[stageIndex] : null;
    let stageState: StageState = 'no_sowing_date';
    if (sowingDate || das != null) {
      if (!band || band.expected_ndvi_min == null || band.expected_ndvi_max == null) stageState = 'no_band';
      else if (latest?.ndvi_value != null) stageState = latest.ndvi_value < band.expected_ndvi_min ? 'below' : latest.ndvi_value > band.expected_ndvi_max ? 'above' : 'within';
      else stageState = 'no_band';
    }

    // neighbours (pipeline robust z)
    // context_present is written inside evidence_json by the pipeline (not a column)
    const ctxPresent = (r: IntelRow): boolean => r.evidence_json?.context_present === true || r.parcel_context_robust_z != null;
    const obs = (intelQ.data || []).find((r) => r.observed_or_predicted !== 'predicted' && ctxPresent(r)) ?? null;
    const z = n(obs?.parcel_context_robust_z);
    let cohort: CohortState = 'unknown';
    if (z != null) cohort = z <= -2 ? 'well_behind' : z <= -1 ? 'behind' : z >= 1 ? 'ahead' : 'with';

    const pred = (intelQ.data || []).find((r) => r.observed_or_predicted === 'predicted') ?? null;
    const forecast = pred ? { low: n(pred.estimated_ndvi_low), high: n(pred.estimated_ndvi_high), targetDate: pred.acquisition_date, daysAhead: daysBetween(pred.acquisition_date, new Date().toISOString().slice(0, 10)) } : null;

    // water: satellite moisture + FAO-56 balance
    const st: LandWeatherState | null = weather.state ?? null;
    const ndmi = n(latest?.ndmi_value), ndmiPrev = n(prevRow?.ndmi_value);
    const ndmiDrop = ndmi != null && ndmiPrev != null ? ndmiPrev - ndmi : null;
    const waterDeficit = n(st?.water_deficit_mm);
    const irrigationNeeded: boolean | null = st ? (st.irrigation_needed ?? null) : null;
    const rainMm = n(st?.effective_rainfall_mm ?? st?.total_rainfall_mm);
    const canopyRow = (canopy.layers?.[0] ?? null) as WaterRowLite | null;
    const surfaceRow = (surface.layers?.[0] ?? null) as WaterRowLite | null;
    // independent signs of drying: satellite moisture fell; governed water balance says irrigate;
    // no effective rain on the balance date; balance status names a deficit
    const agreeing = [ndmiDrop != null && ndmiDrop >= 0.05, irrigationNeeded === true, rainMm != null && rainMm < 1, /deficit|dry|stress/i.test(String(st?.water_balance_status ?? ''))].filter(Boolean).length;

    const ndre = n(latest?.ndre_value), ndrePrev = n(prevRow?.ndre_value);

    let state: FieldState = 'no_data';
    if (!latest) state = radar ? 'unclear' : 'no_data';
    else if (!fresh) state = 'unclear';
    else if (stageState === 'below' || cohort === 'well_behind') state = 'something_wrong';
    else if (cohort === 'behind') state = 'slower';
    else state = 'as_expected';

    return {
      landId, loading: ndviLoading || landQ.isLoading || intelQ.isLoading || scheduleQ.isLoading, error: ndviError ?? landQ.error ?? intelQ.error ?? null,
      latest, previous: prevRow,
      history: (history || []).filter((h) => h.ndvi_value != null).map((h) => ({ date: h.date, ndvi: Number(h.ndvi_value), quality: h.quality_score ?? null })),
      radar,
      zone: (() => {
        const z = ((latest as { metadata?: { zones?: Record<string, unknown> } } | null)?.metadata?.zones ?? null) as Record<string, unknown> | null;
        const lv = z?.level === 'watch' || z?.level === 'check' ? (z.level as 'watch' | 'check') : 'none';
        const w = (z?.water ?? null) as Record<string, unknown> | null;
        const wl = w?.level === 'watch' || w?.level === 'check' ? (w.level as 'watch' | 'check') : 'none';
        return { level: lv, quarter: lv === 'none' ? null : asQuarter(z?.weakest), pattern: typeof z?.pattern === 'string' ? z.pattern : null, reason: typeof z?.reason === 'string' ? z.reason : null,
                 water: { level: wl, quarter: wl === 'none' ? null : asQuarter(w?.weakest) } };
      })(),
      layerFrames: {
        vigour: (history || []).flatMap((h): LayerFrame[] => {
          const img = ((h as { metadata?: { image?: Record<string, unknown> } }).metadata?.image ?? null) as Record<string, unknown> | null;
          const zones = (img?.zones ?? null) as Record<string, unknown> | null;
          if (zones?.storage_path) {
            const sh = (zones.shares ?? null) as Record<string, number> | null;
            return [{ date: h.date, path: String(zones.storage_path), bounds: toBounds(zones), kind: 'zones' as const, shares: sh ? { lower: Number(sh.lower) || 0, normal: Number(sh.normal) || 0, higher: Number(sh.higher) || 0 } : null }];
          }
          if (h.image_url && !/^https?:/i.test(String(h.image_url))) return [{ date: h.date, path: String(h.image_url), bounds: toBounds(img), kind: 'gradient' as const, shares: null }];
          return [];
        }),
        moisture: ((canopy.layers ?? []) as Array<{ acquisition_date?: string; image_path?: string | null; image_metadata?: unknown }>).filter((r) => r.image_path)
          .map((r) => ({ date: String(r.acquisition_date ?? ''), path: String(r.image_path), bounds: toBounds(r.image_metadata), kind: 'gradient' as const, shares: null })),
        standing: ((surface.layers ?? []) as Array<{ acquisition_date?: string; image_path?: string | null; image_metadata?: Record<string, unknown> }>).filter((r) => r.image_path && Number(r.image_metadata?.drawn_pixels) > 0)
          .map((r) => ({ date: String(r.acquisition_date ?? ''), path: String(r.image_path), bounds: toBounds(r.image_metadata), kind: 'gradient' as const, shares: null })),
      },
      sky: { state: skyState, ageDays, cloudPct, fieldSeenPct: fieldSeen ?? null, evidence: latest?.evidence_confidence ?? null, epc: n(latest?.effective_pixel_count), purity: n(latest?.coverage_weighted_purity) },
      stage: { state: stageState, das, stageCode: band?.stage_code ?? null, stageName: band?.growth_stage ?? null, expectedMin: n(band?.expected_ndvi_min), expectedMax: n(band?.expected_ndvi_max), sowingDate, cropCode,
               ladder, index: stageIndex, heightCm: band ? mid(band.expected_height_cm_min, band.expected_height_cm_max) : null, leaves: band ? mid(band.expected_leaf_count_min, band.expected_leaf_count_max) : null, sowingSource },
      neighbours: { state: cohort, z, delta: n(obs?.parcel_context_delta), contextPresent: obs ? ctxPresent(obs) : false, asOf: obs?.acquisition_date ?? null },
      forecast,
      water: { ndmi, ndmiPrev, ndmiDrop, passGapDays: daysBetween(passDate(latest), passDate(prevRow)), waterDeficitMm: waterDeficit, irrigationNeeded, balanceStatus: st?.water_balance_status ?? null, rainMm, urgency: st?.irrigation_urgency ?? null, asOf: st?.metric_date ?? null, agreeing,
               canopyImagePath: canopyRow?.image_path ?? null, surfaceImagePath: surfaceRow?.image_path ?? null, surfaceEvidencePx: n(surfaceRow?.image_metadata?.drawn_pixels) },
      greenness: { ndre, ndrePrev, ndreDrop: ndre != null && ndrePrev != null ? ndrePrev - ndre : null },
      state,
    };
  }, [landId, latestRaw, current, history, ndviLoading, ndviError, landQ.isLoading, landQ.error, scheduleQ.data, scheduleQ.isLoading, sowingSource, intelQ.data, intelQ.isLoading, intelQ.error, radarQ.data, stageQ.data, weather.state, canopy.layers, surface.layers, sowingDate, das, cropCode]);
}

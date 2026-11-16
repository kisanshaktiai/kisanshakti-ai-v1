/**
 * useFieldSky — one model for the farmer-facing satellite view.
 *
 * Reads only governed sources and reports what they say; it does not invent
 * agronomic thresholds:
 *   - v_ndvi_decision_grade / ndvi_data   (via useNDVIAnalysis)   observed optical passes
 *   - ndvi_data radar rows                                          cloud-proof structure (RVI)
 *   - ndvi_intelligence                    parcel-vs-surroundings robust z, the field's and its surroundings' NDVI on that pass, forecast band
 *   - satellite_water_layers               canopy-moisture pictures per pass; standing-water evidence pixels
 *   - lands.stage_uuid / das / stage_source  the crop's CURRENT STAGE as the phenology engine resolved it
 *                                          (phenology SSOT — the same stage the schedule and the Decision Brain use)
 *   - crop_stage_master                    that stage's row and its lane (same crop_code + cultivation_method):
 *                                          expected NDVI band, height, leaves, critical flags, next stage
 *   - land_weather_state                   FAO-56 water balance (root depletion vs RAW, rain)
 *   - lands (via the lands-api edge function)  crop, sowing/transplant date, engine stage cache
 *
 * The page never re-derives the stage from the calendar: a stage the engine has not resolved is shown
 * as "not worked out yet", not guessed. "Below / above the expected range" uses the pipeline's own 95%
 * interval for the pass, so one noisy reading is never called a problem.
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
import { landsApi } from '@/services/landsApi';
import { useNDVIAnalysis, type NDVIDataComplete } from '@/hooks/useNDVIAnalysis';
import { useLandWeatherState, type LandWeatherState } from '@/hooks/useLandWeatherState';

export type FieldState = 'as_expected' | 'above_band' | 'slower' | 'something_wrong' | 'unclear' | 'no_data';
export type CohortState = 'well_behind' | 'behind' | 'with' | 'ahead' | 'unknown';
export type StageState = 'below' | 'within' | 'above' | 'no_sowing_date' | 'not_resolved' | 'no_band';
export type SkyState = 'clear' | 'hazy' | 'cloudy' | 'radar_only' | 'none';

interface IntelRow { acquisition_date: string; observed_or_predicted: string | null; observed_ndvi: number | null; context_ndvi_median: number | null; parcel_context_robust_z: number | null; parcel_context_delta: number | null; evidence_json: Record<string, unknown> | null; estimated_ndvi_low: number | null; estimated_ndvi_high: number | null; intelligence_status: string | null; }
interface RadarRow { acquisition_date: string; rvi_value: number | null; cross_ratio_db: number | null; }
interface StageRow { id: string; crop_code: string; next_stage_id: string | null; is_moisture_critical: boolean | null; is_heat_critical: boolean | null; das_reference: string | null; stage_code: string; growth_stage: string | null; das_min: number | null; das_max: number | null; expected_ndvi_min: number | null; expected_ndvi_max: number | null; cultivation_method: string | null; phenology_index: number | null; expected_height_cm_min: number | null; expected_height_cm_max: number | null; expected_leaf_count_min: number | null; expected_leaf_count_max: number | null; stage_node_type: string | null; }
interface ScheduleRow { sowing_date: string | null; transplant_date: string | null; cultivation_method: string | null; crop_name: string | null; }
interface LandCtxRow { id: string; current_crop: string | null; current_crop_id: string | null; last_sowing_date: string | null; planting_date: string | null; transplant_date: string | null; das: number | null; crop_cycle: string | null;
  /** phenology engine's stage cache on the land row (FK to crop_stage_master), with its DAS and source */
  stage_uuid: string | null; crop_stage: string | null; stage_source: string | null; stage_resolved_at: string | null; }
/** one stage of the crop's own lane, as the crop figure and the season card read it */
export interface StageStep { id: string; code: string; name: string | null; dasMin: number | null; dasMax: number | null; heightCm: number | null; leaves: number | null;
  ndviMin: number | null; ndviMax: number | null; nodeType: string | null; moistureCritical: boolean; heatCritical: boolean;
  /** what the stage's day window counts from (sowing, planting, transplanting, nursery_sowing, ratoon_initiation) */
  dasReference: string | null }
interface WaterRowLite { acquisition_date?: string; image_path?: string | null; image_metadata?: Record<string, unknown>; evidence_json?: Record<string, unknown> }

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
  /** newest radar pass, for cloudy days, and the radar pass before it */
  radar: { date: string; rvi: number | null; cross_ratio_db: number | null; prevDate: string | null; prevRvi: number | null } | null;
  /** the satellite's recent visits to this field, newest first: clear optical passes and radar passes */
  visits: Array<{ date: string; kind: 'clear' | 'radar' }>;
  sky: { state: SkyState; ageDays: number | null; cloudPct: number | null; fieldSeenPct: number | null; evidence: string | null; epc: number | null; purity: number | null };
  /** "where to check" quarters from the pipeline (ndvi_data.metadata.zones): growth and, independently, moisture */
  zone: { level: 'none' | 'watch' | 'check'; quarter: Quarter | null; pattern: string | null; reason: string | null;
          water: { level: 'none' | 'watch' | 'check'; quarter: Quarter | null } };
  /** every dated image per layer (newest first) with the bounds the pipeline wrote — drives the map */
  layerFrames: { vigour: LayerFrame[]; moisture: LayerFrame[]; standing: LayerFrame[] };
  stage: { state: StageState; das: number | null; stageCode: string | null; stageName: string | null; expectedMin: number | null; expectedMax: number | null; sowingDate: string | null; cropCode: string | null;
           /** ordered lane of this crop's stages (crop_stage_master) and where the engine says the field sits on it — drives the crop figure */
           ladder: StageStep[]; index: number | null; heightCm: number | null; leaves: number | null; sowingSource: 'schedule' | 'land' | null;
           /** the stage after this one (crop_stage_master.next_stage_id, else the next row of the lane) */
           next: StageStep | null;
           /** who set the stage (lands.stage_source, e.g. phenology_ssot) and when */
           source: string | null; resolvedAt: string | null;
           /** newest pass's NDVI with the pipeline's 95% interval (null ends = not published), compared against the band */
           reading: { value: number; low: number | null; high: number | null; date: string | null } | null };
  /** `mine` and `around` are the field's NDVI and the median of the crop around it ON THE SAME PASS (asOf), as the pipeline stored them */
  neighbours: { state: CohortState; z: number | null; delta: number | null; mine: number | null; around: number | null; contextPresent: boolean; asOf: string | null };
  forecast: { low: number | null; high: number | null; targetDate: string | null; daysAhead: number | null } | null;
  /** weather side comes from the `weather` edge function (useLandWeatherState): governed FAO-56 balance flags, not raw table columns */
  water: { ndmi: number | null; ndmiPrev: number | null; ndmiDrop: number | null; passGapDays: number | null; waterDeficitMm: number | null; irrigationNeeded: boolean | null; balanceStatus: string | null; rainMm: number | null; urgency: string | null; asOf: string | null; agreeing: number; canopyImagePath: string | null; surfaceImagePath: string | null;
           /** standing-water evidence pixels the pipeline counted on the newest pass (0 = looked and found none), and that pass's date */
           surfaceEvidencePx: number | null; surfaceAsOf: string | null };
  greenness: { ndre: number | null; ndrePrev: number | null; ndreDrop: number | null };
  state: FieldState;
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** Day and short month in the app language, for pass dates ("12 Sep"). Digits stay 0-9, like every other number on the screen. */
export function formatSkyDay(iso: string | null | undefined, lang?: string): string {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat(lang || undefined, { day: 'numeric', month: 'short', numberingSystem: 'latn' }).format(new Date(iso)); } catch { return String(iso); }
}
/**
 * Translation key for a crop_stage_master.growth_stage ("grain_filling", "Grand growth" → sky.stage.grain_filling /
 * sky.stage.grand_growth). Callers pass the table's own text as the fallback, so a stage without a translation
 * still shows the table's word, never a blank.
 */
export function stageKey(name: string): string {
  return `sky.stage.${name.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}`;
}
/**
 * The ONE place that decides whether this field needs the farmer's attention today. The Today tab asks
 * for a photo once: from this card when it shows, otherwise from AskCard (which steps aside when this
 * card is on screen). water.agreeing counts independent sources (satellite, FAO-56 balance), so "2"
 * means both agree — it is not a tuning number.
 */
export function attentionLevel(sky: FieldSky): 'severe' | 'watch' | null {
  if (sky.state === 'something_wrong' || sky.water.agreeing >= 2) return 'severe';
  if (sky.state === 'slower' || sky.neighbours.state === 'well_behind' || sky.water.agreeing >= 1) return 'watch';
  return null;
}
const VISITS_SHOWN = 8;
const daysBetween = (a?: string | null, b?: string | null): number | null => {
  if (!a || !b) return null; const ms = new Date(a).getTime() - new Date(b).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
};

export function useFieldSky(landId: string | null, reloadKey = 0): FieldSky {
  const { session } = useAuthStore();
  const { tenant } = useTenant();
  const tenantId = session?.tenantId ?? tenant?.id;

  const ndvi = useNDVIAnalysis(landId);
  const weather = useLandWeatherState(landId);
  void reloadKey; // refresh re-runs the shared 'ndvi-analysis' query, which carries every satellite row
  // 2026-10-10: intel / radar / schedule / water layers come from the same server read as the
  // optical passes (lands-api?action=satellite). Direct browser reads were refused (42501).
  const bundle = ndvi.bundle;
  const canopy = { layers: (bundle?.canopy ?? []) as WaterRowLite[] };
  const surface = { layers: (bundle?.surface ?? []) as WaterRowLite[] };

  // The lands table is not readable from the farmer's session directly (its row rules are
  // auth.uid()-based, so a direct read returns nothing, silently). The lands-api edge function
  // is the app's land source; this is the same query (same key) the page already runs, so it
  // is answered from the shared cache.
  const landsQ = useQuery({
    queryKey: ['lands', session?.farmerId, tenantId],
    enabled: !!session?.farmerId && !!tenantId,
    queryFn: async () => ((await landsApi.fetchLands()) || []) as unknown as LandCtxRow[],
  });
  const landRow: LandCtxRow | null = useMemo(() => (landsQ.data || []).find((l) => l.id === landId) ?? null, [landsQ.data, landId]);

  const intelQ = { data: (bundle?.intel ?? []) as IntelRow[], isLoading: false, error: null };
  const radarQ = { data: (bundle?.radar ?? []) as RadarRow[] };
  // The proactive evaluator takes the sowing date from the ACTIVE crop schedule
  // first and only then from the land row; the Season card must agree with it.
  const scheduleQ = { data: (bundle?.schedule ?? null) as ScheduleRow | null, isLoading: false };
  const scheduleSowing: string | null = scheduleQ.data?.sowing_date ?? scheduleQ.data?.transplant_date ?? null;
  const landSowing: string | null = landRow?.last_sowing_date ?? landRow?.planting_date ?? landRow?.transplant_date ?? null;
  const sowingDate: string | null = scheduleSowing ?? landSowing;
  const sowingSource: 'schedule' | 'land' | null = scheduleSowing ? 'schedule' : landSowing ? 'land' : null;
  // The stage, its DAS and its crop come from the phenology engine's cache on the land row — never from
  // today minus a sowing date (overlapping stage windows, e.g. maturity 130-150 and harvest 140-160,
  // made a calendar lookup name a different stage than the schedule and the Decision Brain).
  const stageUuid: string | null = landRow?.stage_uuid ?? null;
  const das = n(landRow?.das);

  const stageQ = useQuery({
    queryKey: ['field-sky-stage-lane', stageUuid],
    enabled: !!stageUuid,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const cols = 'id, crop_code, next_stage_id, is_moisture_critical, is_heat_critical, das_reference, stage_code, growth_stage, das_min, das_max, expected_ndvi_min, expected_ndvi_max, cultivation_method, phenology_index, expected_height_cm_min, expected_height_cm_max, expected_leaf_count_min, expected_leaf_count_max, stage_node_type';
      const cur = await supabase.from('crop_stage_master').select(cols).eq('id', stageUuid!).maybeSingle();
      if (cur.error) throw cur.error;
      const row = cur.data as StageRow | null;
      if (!row) return { current: null as StageRow | null, lane: [] as StageRow[] };
      // the engine's own lane: same crop and the same cultivation method as the resolved stage
      let q = supabase.from('crop_stage_master').select(cols).eq('crop_code', row.crop_code).eq('is_active', true);
      q = row.cultivation_method == null ? q.is('cultivation_method', null) : q.eq('cultivation_method', row.cultivation_method);
      const lane = await q.order('phenology_index', { ascending: true, nullsFirst: false }).order('das_min', { ascending: true });
      if (lane.error) throw lane.error;
      const rows = (lane.data || []) as StageRow[];
      return { current: row, lane: rows.some((r) => r.id === row.id) ? rows : [...rows, row] };
    },
  });
  const cropCode: string | null = stageQ.data?.current?.crop_code ?? null;

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
    // freshness is the decision-grade view's own is_fresh — one rule, not a second one written here
    const fresh = latest ? latest.is_fresh === true : false;
    const radarRow = radarQ.data?.[0] ?? null, radarPrev = radarQ.data?.[1] ?? null;
    const radar = radarRow ? { date: radarRow.acquisition_date, rvi: n(radarRow.rvi_value), cross_ratio_db: n(radarRow.cross_ratio_db), prevDate: radarPrev?.acquisition_date ?? null, prevRvi: n(radarPrev?.rvi_value) } : null;

    let skyState: SkyState = 'none';
    if (latest && fresh) skyState = (cloudPct ?? 0) > 10 ? 'hazy' : 'clear';
    else if (radar && daysBetween(new Date().toISOString().slice(0, 10), radar.date)! <= 14) skyState = 'radar_only';
    else if (latest) skyState = 'cloudy';

    // stage (phenology engine) and its lane (crop_stage_master)
    const mid = (a: number | null, b: number | null): number | null => (a != null && b != null ? (Number(a) + Number(b)) / 2 : n(a) ?? n(b));
    const ladderRows = stageQ.data?.lane ?? [];
    const toStep = (r: StageRow): StageStep => ({ id: r.id, code: r.stage_code, name: r.growth_stage, dasMin: n(r.das_min), dasMax: n(r.das_max),
      heightCm: mid(r.expected_height_cm_min, r.expected_height_cm_max), leaves: mid(r.expected_leaf_count_min, r.expected_leaf_count_max),
      ndviMin: n(r.expected_ndvi_min), ndviMax: n(r.expected_ndvi_max), nodeType: r.stage_node_type, moistureCritical: r.is_moisture_critical === true, heatCritical: r.is_heat_critical === true, dasReference: r.das_reference ?? null });
    const ladder = ladderRows.map(toStep);
    const band = stageQ.data?.current ?? null;
    const found = band ? ladderRows.findIndex((r) => r.id === band.id) : -1;
    const stageIndex: number | null = found >= 0 ? found : null;
    const nextRow = band ? (ladderRows.find((r) => r.id === band.next_stage_id) ?? (stageIndex != null ? ladderRows[stageIndex + 1] : undefined) ?? null) : null;

    // the newest pass's NDVI and the pipeline's 95% interval for that same pass (ndvi_intelligence.evidence_json)
    const passIntel = latest ? (intelQ.data || []).find((r) => r.observed_or_predicted !== 'predicted' && r.acquisition_date === passDate(latest)) ?? null : null;
    const reading = latest?.ndvi_value != null ? { value: Number(latest.ndvi_value), low: n(passIntel?.evidence_json?.ndvi_lower_95), high: n(passIntel?.evidence_json?.ndvi_upper_95), date: passDate(latest) } : null;

    let stageState: StageState = 'no_sowing_date';
    if (stageUuid && stageQ.isLoading) stageState = 'no_band'; // the stage row is on its way: say nothing yet
    else if (!band) stageState = sowingDate || das != null || stageUuid ? 'not_resolved' : 'no_sowing_date';
    else if (band.expected_ndvi_min == null || band.expected_ndvi_max == null || !reading) stageState = 'no_band';
    else {
      // "below" only when even the top of the pass's interval is under the band; "above" only when even its bottom is over it
      const lo = reading.low ?? reading.value, hi = reading.high ?? reading.value;
      stageState = hi < Number(band.expected_ndvi_min) ? 'below' : lo > Number(band.expected_ndvi_max) ? 'above' : 'within';
    }

    // neighbours (pipeline robust z)
    // context_present is written inside evidence_json by the pipeline (not a column)
    const ctxPresent = (r: IntelRow): boolean => r.evidence_json?.context_present === true || r.parcel_context_robust_z != null;
    const obs = (intelQ.data || []).find((r) => r.observed_or_predicted !== 'predicted' && ctxPresent(r)) ?? null;
    const z = n(obs?.parcel_context_robust_z);
    let cohort: CohortState = 'unknown';
    if (z != null) cohort = z <= -2 ? 'well_behind' : z <= -1 ? 'behind' : z >= 1 ? 'ahead' : 'with';

    // a forecast is only a forecast while its target date is still ahead; older predicted rows stay in the table
    // ...and only one the pipeline has validated: rows it marks estimated_unvalidated are not shown to the farmer as a forecast
    const pred = (intelQ.data || []).find((r) => r.observed_or_predicted === 'predicted' && r.intelligence_status !== 'estimated_unvalidated' && r.acquisition_date > new Date().toISOString().slice(0, 10)) ?? null;
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
    // The pipeline counts standing-water evidence pixels in evidence_json on every pass; the picture
    // metadata carries a count only when a picture was drawn, so it cannot tell "none seen" from "not looked".
    const surfacePx = n(surfaceRow?.evidence_json?.spatial_evidence_pixels) ?? n(surfaceRow?.image_metadata?.drawn_pixels);
    // INDEPENDENT signs of drying — one per source, never the same source twice: the satellite (canopy
    // moisture fell between passes) and the governed FAO-56 balance (irrigation_needed). Rain and the balance
    // status are outputs of that same balance, so they are not counted again as extra "signs".
    const agreeing = [ndmiDrop != null && ndmiDrop >= 0.05, irrigationNeeded === true].filter(Boolean).length;

    const ndre = n(latest?.ndre_value), ndrePrev = n(prevRow?.ndre_value);

    let state: FieldState = 'no_data';
    if (!latest) state = radar ? 'unclear' : 'no_data';
    else if (!fresh) state = 'unclear';
    else if (stageState === 'below' || cohort === 'well_behind') state = 'something_wrong';
    else if (cohort === 'behind') state = 'slower';
    // greener than the stage's band is said as it is — at maturity/harvest it means the crop is not ripening yet,
    // so it is never folded into "as expected"; it raises no attention on its own
    else if (stageState === 'above') state = 'above_band';
    else state = 'as_expected';

    return {
      landId, loading: ndviLoading || landsQ.isLoading || intelQ.isLoading || scheduleQ.isLoading || (!!stageUuid && stageQ.isLoading), error: ndviError ?? landsQ.error ?? intelQ.error ?? stageQ.error ?? null,
      latest, previous: prevRow,
      history: (history || []).filter((h) => h.ndvi_value != null).map((h) => ({ date: h.date, ndvi: Number(h.ndvi_value), quality: h.quality_score ?? null })),
      radar,
      visits: [
        ...(history || []).map((h) => ({ date: h.date, kind: 'clear' as const })),
        ...(radarQ.data || []).map((r) => ({ date: r.acquisition_date, kind: 'radar' as const })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, VISITS_SHOWN),
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
               ladder, index: stageIndex, heightCm: band ? mid(band.expected_height_cm_min, band.expected_height_cm_max) : null, leaves: band ? mid(band.expected_leaf_count_min, band.expected_leaf_count_max) : null, sowingSource,
               next: nextRow ? toStep(nextRow) : null, source: landRow?.stage_source ?? null, resolvedAt: landRow?.stage_resolved_at ?? null, reading },
      neighbours: { state: cohort, z, delta: n(obs?.parcel_context_delta), mine: n(obs?.observed_ndvi), around: n(obs?.context_ndvi_median), contextPresent: obs ? ctxPresent(obs) : false, asOf: obs?.acquisition_date ?? null },
      forecast,
      water: { ndmi, ndmiPrev, ndmiDrop, passGapDays: daysBetween(passDate(latest), passDate(prevRow)), waterDeficitMm: waterDeficit, irrigationNeeded, balanceStatus: st?.water_balance_status ?? null, rainMm, urgency: st?.irrigation_urgency ?? null, asOf: st?.metric_date ?? null, agreeing,
               canopyImagePath: canopyRow?.image_path ?? null, surfaceImagePath: surfaceRow?.image_path ?? null, surfaceEvidencePx: surfacePx, surfaceAsOf: surfaceRow?.acquisition_date ?? null },
      greenness: { ndre, ndrePrev, ndreDrop: ndre != null && ndrePrev != null ? ndrePrev - ndre : null },
      state,
    };
  }, [landId, latestRaw, current, history, ndviLoading, ndviError, landsQ.isLoading, landsQ.error, landRow, scheduleQ.isLoading, sowingSource, intelQ.data, intelQ.isLoading, intelQ.error, radarQ.data, stageQ.data, stageQ.isLoading, stageQ.error, stageUuid, weather.state, canopy.layers, surface.layers, sowingDate, das, cropCode]);
}

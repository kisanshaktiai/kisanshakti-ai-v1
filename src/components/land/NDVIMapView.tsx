/**
 * NDVI Map View — Production Farmer MapLibre renderer
 *
 * Security/accuracy:
 * - Uses the same farmer/tenant/session context as NDVI data access.
 * - Private ndvi-thumbnails bucket remains private.
 * - Selected date, value and image come from the same ndvi_data row.
 * - Never shows predicted NDVI on the farmer map.
 * - Uses one MapLibre renderer; no screen-space duplicate image.
 * - Falls back to reliable zonal NDVI color if image access fails.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Layers, Locate, Maximize2, Minimize2, Info, Satellite,
  CloudOff, Calendar, Sliders,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  ndviToColor,
  NDVI_GRADIENT_CSS,
  getScientificHealthStatus,
  isObservationReliable,
  formatNDVI,
  NDVI_INTERPRETATION,
} from '@/lib/ndviScience';
import { SUPABASE_CONFIG } from '@/config/supabase';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useNDVIAnalysis, NDVIDataComplete } from '@/hooks/useNDVIAnalysis';

interface NDVIMapViewProps {
  landId: string;
  boundary?: Array<{ lat: number; lng: number }>;
  centerLat?: number;
  centerLng?: number;
  areaAcres?: number;
  soilType?: string;
  currentCrop?: string;
  landThumbnailUrl?: string | null;
  landThumbnailDate?: string | null;
}

type RenderMode = 'land_thumb' | 'zonal' | 'boundary';
type NdviAsset = { kind: 'url' | 'path'; value: string } | null;

function classifyNdviAsset(raw?: string | null): NdviAsset {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return { kind: 'url', value: raw };
  if (raw.startsWith('/storage/v1/')) {
    return { kind: 'url', value: `${SUPABASE_CONFIG.URL}${raw}` };
  }
  if (raw.startsWith('/thumbnails/ndvi/')) return null;
  return { kind: 'path', value: raw.replace(/^\/+/, '') };
}

const NDVI_IMAGE_BUCKET = 'ndvi-thumbnails';
const NDVI_SIGNED_URL_TTL_SECONDS = 3600;

function isTenantScopedNdviPath(path: string, tenantId: string | undefined, landId: string) {
  const parts = path.split('/').filter(Boolean);
  return !!tenantId && parts.length >= 3 && parts[0] === tenantId && parts[1] === landId;
}

function useSignedNdviUrl(
  asset: NdviAsset,
  farmerId: string | undefined,
  tenantId: string | undefined,
  landId: string,
) {
  const [state, setState] = useState<{ url: string | null; error: string | null; loading: boolean }>({
    url: null,
    error: null,
    loading: false,
  });

  useEffect(() => {
    let cancelled = false;

    if (!asset) {
      setState({ url: null, error: null, loading: false });
      return;
    }

    if (asset.kind === 'url') {
      setState({ url: asset.value, error: null, loading: false });
      return;
    }

    if (!farmerId || !tenantId) {
      setState({ url: null, error: 'Missing farmer or tenant context', loading: false });
      return;
    }

    if (!isTenantScopedNdviPath(asset.value, tenantId, landId)) {
      const message = 'NDVI image path failed tenant/land scope validation';
      console.error('[NDVIMapView]', message, { landId, tenantId, path: asset.value });
      setState({ url: null, error: message, loading: false });
      return;
    }

    setState({ url: null, error: null, loading: true });

    supabaseWithAuth(farmerId, tenantId)
      .storage
      .from(NDVI_IMAGE_BUCKET)
      .createSignedUrl(asset.value, NDVI_SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          const message = error?.message || 'Storage returned no signed URL';
          console.error('[NDVIMapView] failed to sign NDVI thumbnail', {
            landId, tenantId, path: asset.value, message,
          });
          setState({ url: null, error: message, loading: false });
          return;
        }
        setState({ url: data.signedUrl, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unknown Storage error';
        console.error('[NDVIMapView] NDVI thumbnail signing exception', {
          landId, tenantId, path: asset.value, message,
        });
        setState({ url: null, error: message, loading: false });
      });

    return () => { cancelled = true; };
  }, [asset?.kind, asset?.value, farmerId, tenantId, landId]);

  return state;
}

const ESRI_SAT_STYLE = {
  version: 8 as const,
  sources: {
    esri: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [{ id: 'esri', type: 'raster' as const, source: 'esri' }],
};

function computeBounds(poly: Array<{ lat: number; lng: number }>): LngLatBoundsLike | null {
  if (!poly?.length) return null;
  let minLat = poly[0].lat;
  let maxLat = poly[0].lat;
  let minLng = poly[0].lng;
  let maxLng = poly[0].lng;
  for (const p of poly) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

function polygonGeoJSON(poly: Array<{ lat: number; lng: number }>) {
  if (!poly?.length) return null;
  const ring = poly.map((p) => [p.lng, p.lat]);
  if (ring.length > 0 &&
      (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }
  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [ring] },
    }],
  };
}

export function NDVIMapView({
  landId,
  boundary = [],
  centerLat,
  centerLng,
  areaAcres,
  currentCrop,
  landThumbnailUrl,
  landThumbnailDate,
}: NDVIMapViewProps) {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { session } = useAuthStore();
  const tenantId = tenant?.id ?? session?.tenantId;
  const farmerId = session?.farmerId;

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);

  const { current, history, latestRaw, processingThumbnail } = useNDVIAnalysis(landId);

  const acquisitions = useMemo(() => {
    type Acq = {
      date: string;
      reliable: boolean;
      ndvi: number | null;
      source: 'ndvi_data';
      raw: NDVIDataComplete;
    };
    const byDate = new Map<string, Acq>();
    for (const r of history) {
      byDate.set(r.date, {
        date: r.date,
        reliable: true,
        ndvi: r.ndvi_value,
        source: 'ndvi_data',
        raw: r,
      });
    }
    if (latestRaw && !byDate.has(latestRaw.date)) {
      byDate.set(latestRaw.date, {
        date: latestRaw.date,
        reliable: false,
        ndvi: latestRaw.ndvi_value,
        source: 'ndvi_data',
        raw: latestRaw,
      });
    }
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [history, latestRaw]);

  const [activeDate, setActiveDate] = useState<string | null>(null);

  useEffect(() => {
    const firstReliable = acquisitions.find((a) => a.reliable);
    setActiveDate(firstReliable?.date ?? acquisitions[0]?.date ?? null);
  }, [acquisitions]);

  const active = useMemo(
    () => acquisitions.find((a) => a.date === activeDate) ?? null,
    [acquisitions, activeDate],
  );

  // The selected observation is the authoritative image source.
  // Fallback images are allowed only when their date agrees with the active observation.
  const activeAsset = useMemo<NdviAsset>(() => {
    if (active) {
      const selected = classifyNdviAsset(active.raw.image_url);
      if (selected) return selected;
    }
    if (processingThumbnail?.url &&
        (!active || processingThumbnail.date.slice(0, 10) === active.date)) {
      return classifyNdviAsset(processingThumbnail.url);
    }
    if (landThumbnailUrl &&
        (!active || !landThumbnailDate || landThumbnailDate.slice(0, 10) === active.date)) {
      return classifyNdviAsset(landThumbnailUrl);
    }
    return null;
  }, [active, landThumbnailUrl, landThumbnailDate, processingThumbnail]);

  const signed = useSignedNdviUrl(activeAsset, farmerId, tenantId, landId);

  const activeThumbnailUrl = useMemo(() => {
    if (!signed.url) return null;
    const sceneId = active?.raw.scene_id ?? '';
    const cacheKey = `${active?.date ?? ''}_${sceneId}`;
    return cacheKey.trim() === '_'
      ? signed.url
      : `${signed.url}${signed.url.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}`;
  }, [signed.url, active]);

  const renderMode: RenderMode = useMemo(() => {
    if (activeThumbnailUrl) return 'land_thumb';
    if (active?.reliable && active.ndvi != null) return 'zonal';
    return 'boundary';
  }, [active, activeThumbnailUrl]);

  const [overlayOpacity, setOverlayOpacity] = useState(0.75);
  const [expandedSheet, setExpandedSheet] = useState<0 | 1 | 2>(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: ESRI_SAT_STYLE,
      center: [centerLng ?? 78.9629, centerLat ?? 20.5937],
      zoom: 15,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-right');

    map.on('load', () => {
      const geo = polygonGeoJSON(boundary);
      if (!geo) return;

      map.addSource('land-boundary', { type: 'geojson', data: geo });
      map.addLayer({
        id: 'land-fill',
        type: 'fill',
        source: 'land-boundary',
        paint: { 'fill-color': 'hsl(140, 60%, 35%)', 'fill-opacity': 0 },
      });
      map.addLayer({
        id: 'land-outline',
        type: 'line',
        source: 'land-boundary',
        paint: { 'line-color': 'hsl(0, 0%, 100%)', 'line-width': 2.5, 'line-opacity': 0.95 },
      });

      const b = computeBounds(boundary);
      if (b) map.fitBounds(b, { padding: 32, duration: 0, maxZoom: 17 });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sync = () => {
      const geo = polygonGeoJSON(boundary);
      if (!geo) return;

      const src = map.getSource('land-boundary') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geo as any);
      } else {
        map.addSource('land-boundary', { type: 'geojson', data: geo });
        map.addLayer({
          id: 'land-fill',
          type: 'fill',
          source: 'land-boundary',
          paint: { 'fill-color': 'hsl(140, 60%, 35%)', 'fill-opacity': 0 },
        });
        map.addLayer({
          id: 'land-outline',
          type: 'line',
          source: 'land-boundary',
          paint: { 'line-color': 'hsl(0, 0%, 100%)', 'line-width': 2.5, 'line-opacity': 0.95 },
        });
      }

      const b = computeBounds(boundary);
      if (b) map.fitBounds(b, { padding: 32, duration: 300, maxZoom: 17 });
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);
  }, [boundary]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = window.setTimeout(() => map.resize(), 50);
    return () => window.clearTimeout(timer);
  }, [fullscreen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      const onLoad = () => applyRender();
      map?.once('load', onLoad);
      return () => { map?.off('load', onLoad); };
    }
    applyRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderMode, active, overlayOpacity, activeThumbnailUrl, boundary]);

  function applyRender() {
    const map = mapRef.current;
    if (!map) return;

    const clearRaster = () => {
      if (map.getLayer('ndvi-raster')) map.removeLayer('ndvi-raster');
      if (map.getSource('ndvi-raster-src')) map.removeSource('ndvi-raster-src');
    };

    if (renderMode === 'land_thumb' && activeThumbnailUrl) {
      const b = computeBounds(boundary) as [[number, number], [number, number]] | null;
      if (b) {
        const [[w, s], [e, n]] = b;
        clearRaster();

        map.addSource('ndvi-raster-src', {
          type: 'image',
          url: activeThumbnailUrl,
          coordinates: [[w, n], [e, n], [e, s], [w, s]],
        });
        map.addLayer({
          id: 'ndvi-raster',
          type: 'raster',
          source: 'ndvi-raster-src',
          paint: { 'raster-opacity': overlayOpacity, 'raster-fade-duration': 200 },
        });

        if (map.getLayer('land-fill')) {
          map.setPaintProperty('land-fill', 'fill-opacity', 0);
        }
        return;
      }
    }

    if (renderMode === 'zonal' && active?.ndvi != null) {
      if (map.getLayer('land-fill')) {
        map.setPaintProperty('land-fill', 'fill-color', ndviToColor(active.ndvi));
        map.setPaintProperty('land-fill', 'fill-opacity', overlayOpacity);
      }
      clearRaster();
      return;
    }

    if (map.getLayer('land-fill')) {
      map.setPaintProperty('land-fill', 'fill-opacity', 0);
    }
    clearRaster();
  }

  const sheetHeights = ['96px', '220px', '70vh'];
  const currentStatus = current ? getScientificHealthStatus(current.ndvi_value) : null;
  const hasData = !!current;
  const hasStale = !!latestRaw && !isObservationReliable(latestRaw);
  const heatmapDate = active?.date ?? current?.date ?? latestRaw?.date ?? null;

  return (
    <div className={cn(
      'relative w-full overflow-hidden border border-border/40 bg-card',
      fullscreen
        ? 'fixed inset-0 z-[60] border-0 rounded-none'
        : 'rounded-2xl mx-2 h-[calc(100vh-180px)] min-h-[460px]',
    )}>
      <div
        ref={mapContainer}
        className="absolute inset-0"
        aria-label={t('ndvi.map.aria', 'NDVI satellite heatmap')}
      />

      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-2 rounded-lg shadow-md bg-background/95 text-foreground gap-1"
          onClick={() => setLegendOpen((v) => !v)}
          aria-label={t('ndvi.map.legend', 'Legend')}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium">{t('ndvi.map.legend', 'Legend')}</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-2 rounded-lg shadow-md bg-background/95 text-foreground gap-1"
          onClick={() => {
            const map = mapRef.current;
            const b = boundary.length ? computeBounds(boundary) : null;
            if (map && b) map.fitBounds(b, { padding: 32, duration: 400, maxZoom: 17 });
          }}
          aria-label={t('ndvi.map.recenter', 'Recenter')}
        >
          <Locate className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium">{t('ndvi.map.recenter', 'Center')}</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-2 rounded-lg shadow-md bg-background/95 text-foreground gap-1"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={t('ndvi.map.fullscreen', 'Fullscreen')}
        >
          {fullscreen
            ? <Minimize2 className="h-3.5 w-3.5" />
            : <Maximize2 className="h-3.5 w-3.5" />}
          <span className="text-[10px] font-medium">
            {fullscreen ? t('ndvi.map.exit', 'Exit') : t('ndvi.map.full', 'Full')}
          </span>
        </Button>
      </div>

      {renderMode !== 'boundary' && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-background/95 rounded-lg shadow-md px-2 py-1.5">
          <Sliders className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="w-24">
            <Slider
              value={[overlayOpacity * 100]}
              onValueChange={(v) => setOverlayOpacity(v[0] / 100)}
              min={20}
              max={100}
              step={5}
              aria-label={t('ndvi.map.opacity', 'Heatmap opacity')}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums w-6 text-right">
            {Math.round(overlayOpacity * 100)}%
          </span>
        </div>
      )}

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <Badge variant="secondary" className="bg-background/95 shadow-md text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <Satellite className="h-3 w-3 text-primary" />
          {renderMode === 'land_thumb' && t('ndvi.map.mode_land_thumb', 'Satellite NDVI thumbnail')}
          {renderMode === 'zonal' && t('ndvi.map.mode_zonal', 'Field-level NDVI')}
          {renderMode === 'boundary' && t('ndvi.map.mode_boundary', 'No clean data')}
        </Badge>
      </div>

      {signed.error && active?.reliable && (
        <div className="absolute top-12 left-2 right-28 z-10">
          <Badge
            variant="outline"
            className="bg-warning/15 border-warning/40 text-warning-foreground text-[10px] px-2 py-1 rounded-full"
            title={signed.error}
          >
            {t('ndvi.map.image_fallback', 'Satellite image unavailable — showing field NDVI color.')}
          </Badge>
        </div>
      )}

      <AnimatePresence>
        {legendOpen && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            className="absolute top-12 right-2 z-20 bg-background rounded-xl shadow-xl border border-border/40 p-3 w-56"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold">{t('ndvi.map.legend_title', 'NDVI Scale')}</p>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">NASA/ESA</Badge>
            </div>
            <div className="flex gap-3">
              <div className="w-4 rounded-md" style={{ height: 140, background: NDVI_GRADIENT_CSS }} aria-hidden />
              <div className="flex-1 flex flex-col justify-between text-[10px] leading-tight">
                {NDVI_INTERPRETATION.ranges.map((r) => (
                  <div key={r.level} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: ndviToColor((r.min + r.max) / 2) }} />
                    <span className="font-medium">{r.min.toFixed(2)}–{r.max.toFixed(2)}</span>
                    <span className="text-muted-foreground truncate">{t(`ndvi.health_status.${r.level}`, r.label)}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[9px] text-muted-foreground leading-snug">
              {t('ndvi.map.legend_note', 'Continuous gradient. Colors mirror the ring, charts and badges across the app.')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {hasStale && (
        <div className="absolute top-12 left-2 right-28 z-10">
          <Badge variant="outline" className="bg-warning/15 border-warning/40 text-warning-foreground text-[11px] px-2 py-1 rounded-full flex items-center gap-1.5">
            <CloudOff className="h-3 w-3" />
            {t('ndvi.map.stale_warning', 'Latest reading hidden — clouds or low coverage. Showing last clean reading.')}
          </Badge>
        </div>
      )}

      {acquisitions.length > 0 && (
        <div className="absolute left-0 right-0 z-10" style={{ bottom: sheetHeights[expandedSheet] }}>
          <div className="px-3 py-2 overflow-x-auto no-scrollbar">
            <div className="flex gap-1.5 min-w-min">
              {acquisitions.slice(0, 14).map((a) => {
                const isActive = a.date === activeDate;
                return (
                  <button
                    key={a.date}
                    onClick={() => setActiveDate(a.date)}
                    className={cn(
                      'flex flex-col items-center justify-center min-w-[44px] h-11 px-2 rounded-lg text-[10px] font-medium shrink-0 transition-all',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/40'
                        : a.reliable
                        ? 'bg-background/90 text-foreground hover:bg-background'
                        : 'bg-muted/70 text-muted-foreground line-through opacity-70',
                    )}
                    aria-label={`${a.date}${a.reliable ? '' : ' (cloudy)'}`}
                  >
                    <span className="text-[9px] opacity-75">{new Date(a.date).toLocaleDateString(undefined, { month: 'short' })}</span>
                    <span className="font-bold">{new Date(a.date).getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <motion.div
        initial={false}
        animate={{ height: sheetHeights[expandedSheet] }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        className="absolute left-0 right-0 bottom-0 z-20 bg-background border-t border-border/40 rounded-t-2xl shadow-2xl overflow-hidden"
      >
        <button
          onClick={() => setExpandedSheet(((expandedSheet + 1) % 3) as 0 | 1 | 2)}
          className="w-full py-2 flex items-center justify-center"
          aria-label="Toggle details"
        >
          <span className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </button>

        <div className="px-4 pb-3 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 44px)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: current ? ndviToColor(current.ndvi_value) : 'hsl(var(--muted))' }}
            >
              {current ? formatNDVI(current.ndvi_value) : '—'}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {currentStatus ? t(currentStatus.labelKey, currentStatus.label) : t('ndvi.map.no_data', 'No clean reading')}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {heatmapDate ? new Date(heatmapDate).toLocaleDateString() : '—'}
                {areaAcres != null && <span className="ml-2">{areaAcres.toFixed(2)} ac</span>}
                {currentCrop && <span className="ml-2 truncate">· {currentCrop}</span>}
              </p>
            </div>

            {current && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 shrink-0">
                {t('ndvi.map.cloud', 'Cloud {{value}}%', { value: Math.round(current.cloud_coverage ?? 0) })}
              </Badge>
            )}
          </div>

          {expandedSheet >= 1 && active?.reliable && active.ndvi != null && (
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Stat label={t('ndvi.map.min', 'Min')} value={active.raw.min_ndvi ?? active.raw.ndvi_min} />
              <Stat label={t('ndvi.map.mean', 'Mean')} value={active.raw.mean_ndvi ?? active.raw.ndvi_value} emphasis />
              <Stat label={t('ndvi.map.max', 'Max')} value={active.raw.max_ndvi ?? active.raw.ndvi_max} />
            </div>
          )}

          {expandedSheet === 2 && current && (
            <div className="pt-2 border-t border-border/30 mt-2 space-y-2">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                {t('ndvi.map.provenance', 'Source')}:{' '}
                <span className="text-foreground font-medium">{current.satellite_source ?? 'Sentinel-2'}</span>
                {current.spatial_resolution && <span>· {current.spatial_resolution}m</span>}
                {current.processing_level && <span>· {current.processing_level}</span>}
              </p>
              {current.scene_id && <p className="text-[10px] text-muted-foreground truncate">Scene: {current.scene_id}</p>}
              {!hasData && <p className="text-[11px] text-amber-600">{t('ndvi.map.no_clean_for_date', 'No clean satellite observation on this date.')}</p>}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number | null | undefined;
  emphasis?: boolean;
}) {
  const v = value == null ? null : value;
  return (
    <div className={cn(
      'text-center p-2 rounded-lg',
      emphasis ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-muted/40',
    )}>
      <p className="text-[9px] uppercase text-muted-foreground tracking-wider">{label}</p>
      <p
        className={cn('text-sm font-bold', emphasis && 'text-primary')}
        style={v != null ? { color: emphasis ? undefined : ndviToColor(v) } : {}}
      >
        {v != null ? v.toFixed(2) : '—'}
      </p>
    </div>
  );
}

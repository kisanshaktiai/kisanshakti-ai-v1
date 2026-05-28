/**
 * NDVI Map View — Scientific Heatmap (MapLibre GL)
 *
 * Rendering modes (auto-selected per land):
 *   A. Pixel raster   — when ndvi_micro_tiles.ndvi_thumbnail_url exists and bbox known
 *   B. Zonal mosaic   — when ndvi_micro_tiles stats exist (no thumbnail) → field-level fill
 *   C. Boundary only  — no reliable data
 *
 * STRICT ACCURACY RULES (zero hallucination):
 *   - Never display values from rows that fail isObservationReliable()
 *   - Never interpolate between dates
 *   - Never show predictive overlays on the map
 *   - Always show provenance on tap
 *   - Always clip raster to land polygon
 *   - Always show legend
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
  NDVI_COLOR_STOPS,
  NDVI_GRADIENT_CSS,
  getScientificHealthStatus,
  isObservationReliable,
  formatNDVI,
  NDVI_INTERPRETATION,
} from '@/lib/ndviScience';
import { SUPABASE_CONFIG } from '@/config/supabase';
import { useNDVIAnalysis, NDVIDataComplete } from '@/hooks/useNDVIAnalysis';

interface NDVIMapViewProps {
  landId: string;
  boundary?: Array<{ lat: number; lng: number }>;
  centerLat?: number;
  centerLng?: number;
  areaAcres?: number;
  soilType?: string;
  currentCrop?: string;
  /** Latest satellite NDVI thumbnail URL stored on the land row. */
  landThumbnailUrl?: string | null;
  /** Acquisition/processing date of the land-level thumbnail. */
  landThumbnailDate?: string | null;
}

type RenderMode = 'land_thumb' | 'zonal' | 'boundary';

function normalizeNdviAssetUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/storage/v1/')) return `${SUPABASE_CONFIG.URL}${url}`;
  if (url.startsWith('/thumbnails/ndvi/')) {
    return `${SUPABASE_CONFIG.URL}/storage/v1/object/public/ndvi-thumbnails/${url.split('/').pop()}`;
  }
  return null;
}

const ESRI_SAT_STYLE = {
  version: 8 as const,
  sources: {
    esri: {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [{ id: 'esri', type: 'raster' as const, source: 'esri' }],
};

function computeBounds(poly: Array<{ lat: number; lng: number }>): LngLatBoundsLike | null {
  if (!poly?.length) return null;
  let minLat = poly[0].lat, maxLat = poly[0].lat, minLng = poly[0].lng, maxLng = poly[0].lng;
  for (const p of poly) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

function polygonGeoJSON(poly: Array<{ lat: number; lng: number }>) {
  if (!poly?.length) return null;
  const ring = poly.map((p) => [p.lng, p.lat]);
  // close ring
  if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [ring] } }],
  };
}

function polygonCssClipPath(poly: Array<{ lat: number; lng: number }>): string | undefined {
  if (!poly?.length) return undefined;
  const b = computeBounds(poly) as [[number, number], [number, number]] | null;
  if (!b) return undefined;
  const [[w, s], [e, n]] = b;
  const dLng = Math.max(e - w, 1e-9);
  const dLat = Math.max(n - s, 1e-9);
  const points = poly.map((p) => {
    const x = ((p.lng - w) / dLng) * 100;
    const y = (1 - (p.lat - s) / dLat) * 100;
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
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
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);

  const { current, history, latestRaw, processingThumbnail } = useNDVIAnalysis(landId);

  // Build the chronological list of acquisitions farmers can scrub through.
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
      byDate.set(r.date, { date: r.date, reliable: true, ndvi: r.ndvi_value, source: 'ndvi_data', raw: r });
    }
    if (latestRaw && !byDate.has(latestRaw.date)) {
      byDate.set(latestRaw.date, { date: latestRaw.date, reliable: false, ndvi: latestRaw.ndvi_value, source: 'ndvi_data', raw: latestRaw });
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

  // Per-date satellite NDVI thumbnail directly from the actively-updated
  // ndvi_data row (image_url is a public ndvi-thumbnails PNG). This is the
  // single source of truth for the heatmap when no micro-tile raster exists.
  const activeThumbnailUrl: string | null = useMemo(() => {
    let base: string | null = null;
    if (active?.source === 'ndvi_data') {
      base = normalizeNdviAssetUrl((active.raw as NDVIDataComplete).image_url);
    }
    if (!base) base = normalizeNdviAssetUrl(processingThumbnail?.url) ?? normalizeNdviAssetUrl(landThumbnailUrl);
    if (!base) return null;
    // Cache-bust by acquisition date + scene_id so the browser and MapLibre
    // re-fetch when the farmer scrubs to a different date even when the storage
    // path is identical (pipeline currently overwrites one PNG per land).
    const sceneId = (active?.raw as NDVIDataComplete | undefined)?.scene_id ?? '';
    const v = `${active?.date ?? ''}_${sceneId}`;
    return v.trim() === '_' ? base : `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}`;
  }, [active, landThumbnailUrl, processingThumbnail]);

  // Decide render mode for the active acquisition.
  // Priority: micro-tile pixel raster → per-date ndvi_data thumbnail (clipped to boundary bbox)
  //         → zonal fill (boundary painted with mean NDVI color) → boundary only.
  const renderMode: RenderMode = useMemo(() => {
    if (activeThumbnailUrl) return 'land_thumb';
    if (active && active.reliable && active.ndvi != null) return 'zonal';
    return 'boundary';
  }, [active, activeThumbnailUrl]);

  const thumbnailClipPath = useMemo(() => polygonCssClipPath(boundary), [boundary]);

  const [overlayOpacity, setOverlayOpacity] = useState(0.75);
  const [expandedSheet, setExpandedSheet] = useState<0 | 1 | 2>(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  /* ────────────────── Map init ────────────────── */
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const center = { lat: centerLat ?? 20.5937, lng: centerLng ?? 78.9629 };
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: ESRI_SAT_STYLE,
      center: [center.lng, center.lat],
      zoom: 15,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-right');

    map.on('load', () => {
      const geo = polygonGeoJSON(boundary);
      if (geo) {
        map.addSource('land-boundary', { type: 'geojson', data: geo });
        map.addLayer({
          id: 'land-fill',
          type: 'fill',
          source: 'land-boundary',
          paint: { 'fill-color': 'hsl(140, 60%, 35%)', 'fill-opacity': 0.0 },
        });
        map.addLayer({
          id: 'land-outline',
          type: 'line',
          source: 'land-boundary',
          paint: { 'line-color': 'hsl(0, 0%, 100%)', 'line-width': 2.5, 'line-opacity': 0.95 },
        });
        const b = computeBounds(boundary);
        if (b) map.fitBounds(b, { padding: 32, duration: 0, maxZoom: 17 });
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ────────────────── Sync boundary when prop changes ────────────────── */
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
          paint: { 'fill-color': 'hsl(140, 60%, 35%)', 'fill-opacity': 0.0 },
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

  /* ────────────────── Render NDVI per active acquisition ────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      // Defer until style loaded
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

    // Helper: remove any previously added raster overlay
    const clearRaster = () => {
      if (map.getLayer('ndvi-raster')) map.removeLayer('ndvi-raster');
      if (map.getSource('ndvi-raster-src')) map.removeSource('ndvi-raster-src');
    };

    // LAND-LEVEL THUMBNAIL — actual satellite-derived NDVI PNG for this field,
    // clipped to the boundary bbox. Pure data, no interpolation.
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
        if (map.getLayer('land-fill')) map.setPaintProperty('land-fill', 'fill-opacity', 0.0);
        return;
      }
    }

    // ZONAL — paint boundary fill with mean NDVI color
    if (renderMode === 'zonal' && active?.ndvi != null) {
      const color = ndviToColor(active.ndvi);
      if (map.getLayer('land-fill')) {
        map.setPaintProperty('land-fill', 'fill-color', color);
        map.setPaintProperty('land-fill', 'fill-opacity', overlayOpacity);
      }
      clearRaster();
      return;
    }

    // BOUNDARY ONLY
    if (map.getLayer('land-fill')) map.setPaintProperty('land-fill', 'fill-opacity', 0.0);
    clearRaster();
  }

  /* ────────────────── Sheet snap points ────────────────── */
  const sheetHeights = ['96px', '220px', '70vh'];

  const currentStatus = current ? getScientificHealthStatus(current.ndvi_value) : null;
  const hasData = !!current;
  const hasStale = !!latestRaw && !isObservationReliable(latestRaw);

  const heatmapDate = active?.date ?? current?.date ?? latestRaw?.date ?? null;

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden border border-border/40 bg-card',
        fullscreen ? 'fixed inset-0 z-[60] border-0 rounded-none' : 'rounded-2xl mx-2 h-[calc(100vh-180px)] min-h-[460px]',
      )}
    >
      {/* ───────── Map canvas ───────── */}
      <div ref={mapContainer} className="absolute inset-0" aria-label={t('ndvi.map.aria', 'NDVI satellite heatmap')} />

      {activeThumbnailUrl && (
        <div className="absolute inset-4 z-[1] pointer-events-none flex items-center justify-center">
          <div
            className="relative w-full max-w-[92%] aspect-square overflow-hidden border border-background/70 shadow-2xl"
            style={{ opacity: overlayOpacity, clipPath: thumbnailClipPath }}
          >
            <img
              src={activeThumbnailUrl}
              alt={t('ndvi.map.thumbnail_alt', 'Satellite NDVI vegetation thumbnail')}
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
        </div>
      )}

      {/* ───────── Top toolbar (right) — compact labeled pills ───────── */}
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
            if (map && boundary.length > 0) {
              const b = computeBounds(boundary);
              if (b) map.fitBounds(b, { padding: 32, duration: 400, maxZoom: 17 });
            }
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
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <span className="text-[10px] font-medium">
            {fullscreen ? t('ndvi.map.exit', 'Exit') : t('ndvi.map.full', 'Full')}
          </span>
        </Button>
      </div>

      {/* ───────── Opacity slider — horizontal, bottom-left ───────── */}
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

      {/* ───────── Mode badge (top-left) ───────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <Badge
          variant="secondary"
          className="bg-background/95 shadow-md text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5"
        >
          <Satellite className="h-3 w-3 text-primary" />
          {renderMode === 'land_thumb' && t('ndvi.map.mode_land_thumb', 'Satellite NDVI thumbnail')}
          {renderMode === 'zonal' && t('ndvi.map.mode_zonal', 'Field-level NDVI')}
          {renderMode === 'boundary' && t('ndvi.map.mode_boundary', 'No clean data')}
        </Badge>
      </div>

      {/* ───────── Legend popover ───────── */}
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
              <div
                className="w-4 rounded-md"
                style={{ height: 140, background: NDVI_GRADIENT_CSS }}
                aria-hidden
              />
              <div className="flex-1 flex flex-col justify-between text-[10px] leading-tight">
                {NDVI_INTERPRETATION.ranges.map((r) => (
                  <div key={r.level} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-sm"
                      style={{ background: ndviToColor((r.min + r.max) / 2) }}
                    />
                    <span className="font-medium">
                      {r.min.toFixed(2)}–{r.max.toFixed(2)}
                    </span>
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

      {/* ───────── Stale banner — uses semantic warning tokens ───────── */}
      {hasStale && (
        <div className="absolute top-12 left-2 right-28 z-10">
          <Badge variant="outline" className="bg-warning/15 border-warning/40 text-warning-foreground text-[11px] px-2 py-1 rounded-full flex items-center gap-1.5">
            <CloudOff className="h-3 w-3" />
            {t('ndvi.map.stale_warning', 'Latest reading hidden — clouds or low coverage. Showing last clean reading.')}
          </Badge>
        </div>
      )}

      {/* ───────── Date scrubber (bottom, above sheet) ───────── */}
      {acquisitions.length > 0 && (
        <div
          className="absolute left-0 right-0 z-10"
          style={{ bottom: sheetHeights[expandedSheet] }}
        >
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
                    <span className="text-[9px] opacity-75">
                      {new Date(a.date).toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                    <span className="font-bold">
                      {new Date(a.date).getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ───────── Bottom glass sheet ───────── */}
      <motion.div
        initial={false}
        animate={{ height: sheetHeights[expandedSheet] }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        className="absolute left-0 right-0 bottom-0 z-20 bg-background border-t border-border/40 rounded-t-2xl shadow-2xl overflow-hidden"
      >
        {/* Drag handle */}
        <button
          onClick={() => setExpandedSheet(((expandedSheet + 1) % 3) as 0 | 1 | 2)}
          className="w-full py-2 flex items-center justify-center"
          aria-label="Toggle details"
        >
          <span className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </button>

        <div className="px-4 pb-3 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 44px)' }}>
          {/* Snap 1: peek */}
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

          {/* Snap 2 & 3 */}
          {expandedSheet >= 1 && active && active.reliable && active.ndvi != null && (
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Stat
                label={t('ndvi.map.min', 'Min')}
                value={(active.raw as NDVIDataComplete).min_ndvi ?? (active.raw as NDVIDataComplete).ndvi_min}
              />
              <Stat
                label={t('ndvi.map.mean', 'Mean')}
                value={(active.raw as NDVIDataComplete).mean_ndvi ?? (active.raw as NDVIDataComplete).ndvi_value}
                emphasis
              />
              <Stat
                label={t('ndvi.map.max', 'Max')}
                value={(active.raw as NDVIDataComplete).max_ndvi ?? (active.raw as NDVIDataComplete).ndvi_max}
              />
            </div>
          )}

          {expandedSheet === 2 && current && (
            <div className="pt-2 border-t border-border/30 mt-2 space-y-2">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                {t('ndvi.map.provenance', 'Source')}:{' '}
                <span className="text-foreground font-medium">
                  {current.satellite_source ?? 'Sentinel-2'}
                </span>
                {current.spatial_resolution && (
                  <span>· {current.spatial_resolution}m</span>
                )}
                {current.processing_level && <span>· {current.processing_level}</span>}
              </p>
              {current.scene_id && (
                <p className="text-[10px] text-muted-foreground truncate">
                  Scene: {current.scene_id}
                </p>
              )}
              {!hasData && (
                <p className="text-[11px] text-amber-600">
                  {t('ndvi.map.no_clean_for_date', 'No clean satellite observation on this date.')}
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: number | null | undefined; emphasis?: boolean }) {
  const v = value == null ? null : value;
  return (
    <div
      className={cn(
        'text-center p-2 rounded-lg',
        emphasis ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-muted/40',
      )}
    >
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

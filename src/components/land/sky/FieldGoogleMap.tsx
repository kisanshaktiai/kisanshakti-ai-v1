import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as turf from '@turf/turf';
import { Maximize2, Minimize2, LocateFixed, Loader2, ImageOff } from 'lucide-react';
import { useGoogleMapsScript } from '@/components/maps/GoogleMapsScriptProvider';
import { useSignedSatelliteImage } from '@/hooks/useSignedSatelliteImage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The farmer's field on the SAME Google satellite map he drew it on
 * (GoogleMapBoundaryDrawer / LandThumbnail), with the pipeline's PNG for the
 * chosen layer laid over it as a GroundOverlay pinned to its own
 * bounds_wgs84, and the "where to check" quarter marked. Pinch zoom, Google's
 * zoom buttons, and a full-screen mode that fills the phone.
 *
 * Every image is signed on read through the private bucket (tenant/land
 * ownership enforced by RLS) — see useSignedSatelliteImage.
 *
 * The legend is handed in already built from the picture's own colours (zone
 * classes, or the layer's colour ramp), so it always describes what is drawn.
 */
export type FieldMapBounds = { west: number; south: number; east: number; north: number };
export type Quarter = 'NE' | 'NW' | 'SE' | 'SW';

/** Either the picture's classes (colour, words, share of the field) or its continuous colour ramp with its two ends named. */
export type MapLegend =
  | { kind: 'classes'; items: Array<{ color: string; label: string; sharePct: number | null }> }
  | { kind: 'ramp'; css: string | null; low: string; high: string };

export interface FieldGoogleMapProps {
  landId: string; farmerId?: string; tenantId?: string;
  boundary: Array<{ lat: number; lng: number }>;
  centerLat: number; centerLng: number;
  imagePath: string | null;           // storage path of the layer PNG
  imageBounds: FieldMapBounds | null; // bounds_wgs84 written by the pipeline
  highlightQuarter: Quarter | null;
  legend: MapLegend;
  legendTitle: string;
  fullscreen: boolean; onToggleFullscreen: () => void;
  /** shown on the map just above the legend (the day strip, when the map fills the screen) */
  footer?: ReactNode;
}

const OVERLAY_OPACITY = 0.85;
const OVERLAY_FADE_MS = 350;

/** A theme token ("38 95% 58%") as a colour string the Maps API accepts. */
function tokenColour(name: string): string | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  return m ? `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)` : null;
}

function quarterPath(boundary: Array<{ lat: number; lng: number }>, q: Quarter): Array<{ lat: number; lng: number }> | null {
  if (!boundary || boundary.length < 3) return null;
  try {
    const ring = boundary.map((p) => [p.lng, p.lat] as [number, number]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
    const field = turf.polygon([ring]);
    const [w, s, e, n] = turf.bbox(field);
    const [cx, cy] = turf.centroid(field).geometry.coordinates;
    const rect = q === 'NE' ? turf.bboxPolygon([cx, cy, e, n]) : q === 'NW' ? turf.bboxPolygon([w, cy, cx, n]) : q === 'SE' ? turf.bboxPolygon([cx, s, e, cy]) : turf.bboxPolygon([w, s, cx, cy]);
    const clipped = turf.intersect(turf.featureCollection([field, rect]));
    if (!clipped) return null;
    const coords = clipped.geometry.type === 'Polygon' ? clipped.geometry.coordinates[0] : clipped.geometry.coordinates[0][0];
    return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch { return null; }
}

/**
 * COST CONTROL: Google bills one "map load" per google.maps.Map INSTANTIATION.
 * This module keeps a single Map object alive for the whole app session in a
 * detached container and re-attaches that container wherever the field view
 * mounts (any land, any tab, any page visit). Result: one billable load per
 * session instead of one per screen. Pan/zoom/overlays are never billed.
 * No Map ID is used, so this would also be the $0 "Maps SDK" path if the
 * same options were ever moved to a native container.
 */
let sharedContainer: HTMLDivElement | null = null;
let sharedMap: google.maps.Map | null = null;

function getSharedMap(): { container: HTMLDivElement; map: google.maps.Map } {
  if (!sharedContainer) {
    sharedContainer = document.createElement('div');
    sharedContainer.style.width = '100%';
    sharedContainer.style.height = '100%';
  }
  if (!sharedMap) {
    sharedMap = new google.maps.Map(sharedContainer, {
      mapTypeId: 'satellite',          // imagery only: the crop colours must not fight road labels
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
      gestureHandling: 'greedy',       // pinch-zoom on iOS WebView (same reason as the land drawer)
      isFractionalZoomEnabled: true,
      tilt: 0, heading: 0,             // north-up: the direction words depend on it
      rotateControl: false, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false, scaleControl: true, minZoom: 12, maxZoom: 21,
      // NO mapId on purpose: a Map ID switches the SKU from "Maps SDK/Dynamic Maps" free tier rules to billable Dynamic Maps.
    });
  }
  return { container: sharedContainer, map: sharedMap };
}

export function FieldGoogleMap(p: FieldGoogleMapProps) {
  const { t } = useTranslation();
  const { isLoaded, loadError } = useGoogleMapsScript();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.GroundOverlay | null>(null);
  const fieldPolyRef = useRef<google.maps.Polygon | null>(null);
  const quarterPolyRef = useRef<google.maps.Polygon | null>(null);
  const image = useSignedSatelliteImage(p.imagePath, p.farmerId, p.tenantId, p.landId);
  const signedUrl = image.url;

  const fitToField = useCallback(() => {
    const map = mapRef.current; if (!map || !p.boundary.length) return;
    const b = new google.maps.LatLngBounds();
    p.boundary.forEach((pt) => b.extend(pt));
    map.fitBounds(b, { top: 72, bottom: 160, left: 24, right: 56 });
  }, [p.boundary]);

  // attach the shared map into this host; detach (never destroy) on unmount
  useEffect(() => {
    const host = hostRef.current;
    if (!isLoaded || !host) return;
    const { container, map } = getSharedMap();
    host.appendChild(container);
    mapRef.current = map;
    google.maps.event.trigger(map, 'resize');
    fitToField();
    // A map attached while its host is hidden is 0x0 and fits the field wrongly. Re-fit
    // whenever the host gets a real size (first reveal, rotation, full screen).
    let lastW = 0, lastH = 0;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect; if (!r) return;
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
        lastW = w; lastH = h;
        google.maps.event.trigger(map, 'resize');
        fitToField();
      }
    }) : null;
    ro?.observe(host);
    return () => {
      ro?.disconnect();
      overlayRef.current?.setMap(null); overlayRef.current = null;
      fieldPolyRef.current?.setMap(null); fieldPolyRef.current = null;
      quarterPolyRef.current?.setMap(null); quarterPolyRef.current = null;
      if (container.parentNode === host) host.removeChild(container);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  useEffect(() => { if (mapRef.current) { google.maps.event.trigger(mapRef.current, 'resize'); fitToField(); } }, [fitToField, p.fullscreen]);

  // field outline
  useEffect(() => {
    const map = mapRef.current; if (!map || !isLoaded) return;
    fieldPolyRef.current?.setMap(null);
    if (p.boundary.length < 3) return;
    // White on purpose: the outline has to stand out against satellite imagery, whatever the tenant theme is.
    fieldPolyRef.current = new google.maps.Polygon({ paths: p.boundary, fillOpacity: 0, strokeColor: '#FFFFFF', strokeOpacity: 0.95, strokeWeight: 3, clickable: false, zIndex: 2, map });
    return () => { fieldPolyRef.current?.setMap(null); };
  }, [p.boundary, isLoaded]);

  // the layer image: one GroundOverlay, replaced when the URL or bounds change
  useEffect(() => {
    const map = mapRef.current; if (!map || !isLoaded) return;
    overlayRef.current?.setMap(null); overlayRef.current = null;
    if (!signedUrl || !p.imageBounds) return;
    const b = p.imageBounds;
    const bounds = new google.maps.LatLngBounds({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.east });
    // fade the picture in, so changing the day reads as one picture replacing another
    const ov = new google.maps.GroundOverlay(signedUrl, bounds, { clickable: false, opacity: 0 });
    ov.setMap(map); overlayRef.current = ov;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    if (reduce) ov.setOpacity(OVERLAY_OPACITY);
    else {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / OVERLAY_FADE_MS);
        ov.setOpacity(OVERLAY_OPACITY * k);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    return () => { cancelAnimationFrame(raf); ov.setMap(null); };
  }, [signedUrl, p.imageBounds, isLoaded]);

  // where-to-check quarter
  useEffect(() => {
    const map = mapRef.current; if (!map || !isLoaded) return;
    quarterPolyRef.current?.setMap(null); quarterPolyRef.current = null;
    const path = p.highlightQuarter ? quarterPath(p.boundary, p.highlightQuarter) : null;
    if (!path) return;
    const mark = tokenColour('--warning');
    if (!mark) return;
    quarterPolyRef.current = new google.maps.Polygon({ paths: path, fillColor: mark, fillOpacity: 0.22, strokeColor: mark, strokeOpacity: 1, strokeWeight: 3, clickable: false, zIndex: 3, map });
    return () => { quarterPolyRef.current?.setMap(null); };
  }, [p.boundary, p.highlightQuarter, isLoaded]);

  if (loadError) return <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{t('sky.map.google_error', 'The map could not load. Check your connection and try again.')}</div>;
  if (!isLoaded) return <Skeleton className={cn('w-full rounded-2xl', p.fullscreen ? 'h-screen' : 'h-[calc(100vh-180px)] min-h-[460px]')} />;

  return (
    <div className={cn('relative w-full overflow-hidden bg-card', p.fullscreen ? 'fixed inset-0 z-[60]' : 'rounded-2xl mx-2 h-[calc(100vh-180px)] min-h-[460px] border border-border/40')}>
      <div ref={hostRef} className="absolute inset-0" />

      {/* direction words — the map is locked north-up */}
      <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
        <span className={cn('absolute left-1/2 -translate-x-1/2 rounded-full bg-background/95 px-3 py-1 text-[13px] font-bold shadow', p.fullscreen ? 'top-[72px]' : 'top-3')}>{t('sky.map.north', 'north')} ↑</span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/95 px-3 py-1 text-[13px] font-bold shadow">{t('sky.map.west', 'west')}</span>
        <span className="absolute right-14 top-1/2 -translate-y-1/2 rounded-full bg-background/95 px-3 py-1 text-[13px] font-bold shadow">{t('sky.map.east', 'east')}</span>
      </div>

      {/* controls: full screen + re-centre. In full screen they sit below the layer buttons, which take the top row. */}
      <div className={cn('absolute right-2 z-[4] flex flex-col gap-2', p.fullscreen ? 'top-[68px]' : 'top-2')}>
        <Button type="button" size="sm" variant="secondary" onClick={p.onToggleFullscreen} className="min-h-11 min-w-11 rounded-xl shadow bg-background text-foreground gap-1.5" aria-label={p.fullscreen ? t('sky.map.exit_fullscreen', 'Exit full screen') : t('sky.map.fill_screen', 'Fill screen')}>
          {p.fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="text-xs font-semibold">{p.fullscreen ? t('sky.map.exit_fullscreen', 'Exit full screen') : t('sky.map.fill_screen', 'Fill screen')}</span>
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={fitToField} className="min-h-11 min-w-11 rounded-xl shadow bg-background text-foreground gap-1.5" aria-label={t('sky.map.recenter', 'My field')}>
          <LocateFixed className="h-4 w-4" /><span className="text-xs font-semibold">{t('sky.map.recenter', 'My field')}</span>
        </Button>
      </div>

      {/* what is happening with the picture, when it is not simply on the map */}
      {p.imagePath && (image.status === 'loading' || image.status === 'error' || (image.status === 'ready' && !p.imageBounds)) && (
        <div className="pointer-events-none absolute left-1/2 top-28 z-[4] -translate-x-1/2 w-max max-w-[80%] rounded-full bg-background/95 shadow px-3 py-1.5 flex items-center gap-2 text-[13px] font-medium" role="status">
          {image.status === 'loading'
            ? <><Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />{t('sky.map.image_loading', 'Opening the picture…')}</>
            : <><ImageOff className="h-4 w-4 text-destructive shrink-0" />{image.status === 'error' ? t('sky.map.image_error', 'This picture could not be opened. Tap refresh and try again.') : t('sky.map.no_bounds', 'This picture has no position on the map yet.')}</>}
        </div>
      )}

      {/* bottom of the map, stacked so nothing overlaps whatever the legend's height: south, the day strip (full screen), the legend */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[4] px-3 flex flex-col gap-2">
        <span className="self-center rounded-full bg-background/95 px-3 py-1 text-[13px] font-bold shadow" aria-hidden>{t('sky.map.south', 'south')}</span>
        {p.footer && <div className="pointer-events-auto">{p.footer}</div>}
      {/* legend: the picture's own colours */}
      <div className="self-start w-full max-w-xs rounded-2xl bg-background/95 shadow px-3 py-2">
        <p className="text-[12px] font-semibold text-muted-foreground mb-1.5">{p.legendTitle}</p>
        {p.legend.kind === 'classes' ? (
          <ul className="space-y-1">
            {p.legend.items.map((it) => (
              <li key={it.label} className="flex items-center gap-2 text-[13px] font-medium">
                <i className="h-3.5 w-3.5 rounded-sm shrink-0 border border-border/40" style={{ backgroundColor: it.color }} />
                <span className="flex-1 min-w-0 truncate">{it.label}</span>
                {it.sharePct != null && <span className="tabular-nums text-muted-foreground">{it.sharePct}%</span>}
              </li>))}
          </ul>
        ) : (
          <div>
            {p.legend.css && <div className="h-3 w-full rounded-full border border-border/40" style={{ backgroundImage: p.legend.css }} />}
            <div className="flex justify-between text-[13px] font-medium mt-1"><span>{p.legend.low}</span><span>{p.legend.high}</span></div>
          </div>
        )}
        <p className="text-[12px] text-muted-foreground mt-1.5">{t('sky.map.north_hint', 'Top of the map is north. Your field is outlined.')}</p>
      </div>
      </div>
    </div>
  );
}

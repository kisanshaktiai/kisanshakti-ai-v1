import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as turf from '@turf/turf';
import { Maximize2, Minimize2, LocateFixed } from 'lucide-react';
import { useGoogleMapsScript } from '@/components/maps/GoogleMapsScriptProvider';
import { supabaseWithAuth } from '@/integrations/supabase/client';
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
 * ownership enforced by RLS); the path must be {tenant}/{land}/... or it is
 * refused before signing — same guard as NDVIMapView.
 */
export type FieldMapBounds = { west: number; south: number; east: number; north: number };
export type Quarter = 'NE' | 'NW' | 'SE' | 'SW';

export interface FieldGoogleMapProps {
  landId: string; farmerId?: string; tenantId?: string;
  boundary: Array<{ lat: number; lng: number }>;
  centerLat: number; centerLng: number;
  imagePath: string | null;           // storage path of the layer PNG
  imageBounds: FieldMapBounds | null; // bounds_wgs84 written by the pipeline
  highlightQuarter: Quarter | null;
  legend: [string, string, string];
  legendTitle: string;
  fullscreen: boolean; onToggleFullscreen: () => void;
}

const BUCKET = 'ndvi-thumbnails';
const SIGNED_TTL = 3600;

function isTenantScopedPath(path: string, tenantId: string | undefined, landId: string) {
  const p = path.split('/').filter(Boolean);
  return !!tenantId && p.length >= 3 && p[0] === tenantId && p[1] === landId;
}

function useSignedLayerUrl(path: string | null, farmerId?: string, tenantId?: string, landId?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!path || !farmerId || !tenantId || !landId) return;
    if (/^https?:\/\//i.test(path)) { setUrl(path); return; }
    const clean = path.replace(/^\/+/, '');
    if (!isTenantScopedPath(clean, tenantId, landId)) { console.error('[FieldGoogleMap] path failed tenant/land scope', { landId, tenantId, path }); return; }
    supabaseWithAuth(farmerId, tenantId).storage.from(BUCKET).createSignedUrl(clean, SIGNED_TTL)
      .then(({ data, error }) => { if (cancelled) return; if (error || !data?.signedUrl) { console.error('[FieldGoogleMap] sign failed', error?.message); return; } setUrl(data.signedUrl); })
      .catch((e) => console.error('[FieldGoogleMap] sign exception', e));
    return () => { cancelled = true; };
  }, [path, farmerId, tenantId, landId]);
  return url;
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
  const signedUrl = useSignedLayerUrl(p.imagePath, p.farmerId, p.tenantId, p.landId);

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
    return () => {
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
    const ov = new google.maps.GroundOverlay(signedUrl, bounds, { clickable: false, opacity: 0.85 });
    ov.setMap(map); overlayRef.current = ov;
    return () => { ov.setMap(null); };
  }, [signedUrl, p.imageBounds, isLoaded]);

  // where-to-check quarter
  useEffect(() => {
    const map = mapRef.current; if (!map || !isLoaded) return;
    quarterPolyRef.current?.setMap(null); quarterPolyRef.current = null;
    const path = p.highlightQuarter ? quarterPath(p.boundary, p.highlightQuarter) : null;
    if (!path) return;
    quarterPolyRef.current = new google.maps.Polygon({ paths: path, fillColor: '#F59E0B', fillOpacity: 0.22, strokeColor: '#F59E0B', strokeOpacity: 1, strokeWeight: 3, clickable: false, zIndex: 3, map });
    return () => { quarterPolyRef.current?.setMap(null); };
  }, [p.boundary, p.highlightQuarter, isLoaded]);

  if (loadError) return <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{t('sky.map.google_error', 'The map could not load. Check your connection and try again.')}</div>;
  if (!isLoaded) return <Skeleton className={cn('w-full rounded-2xl', p.fullscreen ? 'h-screen' : 'h-[calc(100vh-180px)] min-h-[460px]')} />;

  return (
    <div className={cn('relative w-full overflow-hidden bg-card', p.fullscreen ? 'fixed inset-0 z-[60]' : 'rounded-2xl mx-2 h-[calc(100vh-180px)] min-h-[460px] border border-border/40')}>
      <div ref={hostRef} className="absolute inset-0" />

      {/* direction words — the map is locked north-up */}
      <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
        <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-background/95 px-3 py-1 text-[13px] font-bold shadow">{t('sky.map.north', 'north')} ↑</span>
        <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-background/95 px-3 py-1 text-[13px] font-bold shadow" style={{ bottom: 132 }}>{t('sky.map.south', 'south')}</span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/95 px-3 py-1 text-[13px] font-bold shadow">{t('sky.map.west', 'west')}</span>
        <span className="absolute right-14 top-1/2 -translate-y-1/2 rounded-full bg-background/95 px-3 py-1 text-[13px] font-bold shadow">{t('sky.map.east', 'east')}</span>
      </div>

      {/* controls: full screen + re-centre */}
      <div className="absolute top-2 right-2 z-[4] flex flex-col gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={p.onToggleFullscreen} className="min-h-11 min-w-11 rounded-xl shadow bg-background text-foreground gap-1.5" aria-label={p.fullscreen ? t('sky.map.exit_fullscreen', 'Exit full screen') : t('sky.map.fill_screen', 'Fill screen')}>
          {p.fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="text-xs font-semibold">{p.fullscreen ? t('sky.map.exit_fullscreen', 'Exit full screen') : t('sky.map.fill_screen', 'Fill screen')}</span>
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={fitToField} className="min-h-11 min-w-11 rounded-xl shadow bg-background text-foreground gap-1.5" aria-label={t('sky.map.recenter', 'My field')}>
          <LocateFixed className="h-4 w-4" /><span className="text-xs font-semibold">{t('sky.map.recenter', 'My field')}</span>
        </Button>
      </div>

      {/* legend on the map */}
      <div className="pointer-events-none absolute left-3 z-[4] rounded-2xl bg-background/95 shadow px-3 py-2" style={{ bottom: 12 }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{p.legendTitle}</p>
        <div className="flex items-center gap-3 text-[13px] font-medium">
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-warning" />{p.legend[0]}</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-success/60" />{p.legend[1]}</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-success" />{p.legend[2]}</span>
        </div>
        <p className="text-[12px] text-muted-foreground mt-1">{t('sky.map.north_hint', 'Top of the map is north. Your field is outlined.')}</p>
      </div>
    </div>
  );
}

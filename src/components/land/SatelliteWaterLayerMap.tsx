import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '@/integrations/supabase/client';
import type { SatelliteWaterLayerView } from '@/hooks/useSatelliteWaterLayers';

const STYLE = {
  version: 8 as const,
  sources: {
    esri: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [{ id: 'esri', type: 'raster' as const, source: 'esri' }],
};

type Point = { lat: number; lng: number };
type Bounds = { west: number; south: number; east: number; north: number };

function polygonGeoJSON(poly: Point[]) {
  if (!poly.length) return null;
  const ring = poly.map((p) => [p.lng, p.lat]);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
  return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [ring] } }] };
}

function polygonBounds(poly: Point[]): [[number, number], [number, number]] | null {
  if (!poly.length) return null;
  let w = poly[0].lng, e = poly[0].lng, s = poly[0].lat, n = poly[0].lat;
  for (const p of poly) { w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  return [[w, s], [e, n]];
}

function metadataBounds(layer: SatelliteWaterLayerView): Bounds | null {
  const b = layer.image_metadata?.bounds_wgs84;
  if (!b || typeof b !== 'object') return null;
  const x = b as Record<string, unknown>;
  const west = Number(x.west), south = Number(x.south), east = Number(x.east), north = Number(x.north);
  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) return null;
  return { west, south, east, north };
}

interface Props { landId: string; layer: SatelliteWaterLayerView | null; height?: string; }

/** Georeferenced satellite evidence viewer. The raster is positioned only from pipeline WGS84 metadata. */
export function SatelliteWaterLayerMap({ landId, layer, height = '260px' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [boundary, setBoundary] = useState<Point[]>([]);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!landId) return;
    supabase.from('lands').select('boundary_polygon_old').eq('id', landId).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setBoundaryError(error.message); return; }
      const coords = (data?.boundary_polygon_old as any)?.coordinates?.[0];
      if (Array.isArray(coords)) setBoundary(coords.map((c: number[]) => ({ lat: c[1], lng: c[0] })));
    });
    return () => { cancelled = true; };
  }, [landId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: STYLE, center: [74.1, 16.84], zoom: 15, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-right');
    map.on('load', () => {
      map.addSource('water-land-boundary', { type: 'geojson', data: polygonGeoJSON(boundary) ?? { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'water-land-outline', type: 'line', source: 'water-land-boundary', paint: { 'line-color': '#ffffff', 'line-width': 2.5 } });
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('water-land-boundary') as maplibregl.GeoJSONSource | undefined;
    const geo = polygonGeoJSON(boundary);
    if (src && geo) src.setData(geo as any);
    const b = polygonBounds(boundary);
    if (b) map.fitBounds(b, { padding: 28, duration: 0, maxZoom: 18 });
  }, [boundary]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer('water-evidence-raster')) map.removeLayer('water-evidence-raster');
    if (map.getSource('water-evidence-image')) map.removeSource('water-evidence-image');
    if (!layer?.signedImageUrl) return;
    const b = metadataBounds(layer);
    // Never invent geolocation from the field bbox: the pipeline's image bounds are authoritative.
    if (!b) return;
    map.addSource('water-evidence-image', { type: 'image', url: layer.signedImageUrl, coordinates: [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]] });
    map.addLayer({ id: 'water-evidence-raster', type: 'raster', source: 'water-evidence-image', paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0 } });
  }, [layer?.signedImageUrl, layer?.scene_id, layer?.image_metadata, boundary]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/40 bg-muted/20" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" aria-label="Georeferenced satellite water evidence map" />
      {layer?.signedImageUrl && !metadataBounds(layer) && <div className="absolute inset-0 z-10 grid place-items-center bg-background/80 px-4 text-center text-xs text-muted-foreground">Satellite image has no verified geographic bounds, so it is not placed on the field map.</div>}
      {!layer?.signedImageUrl && !boundaryError && <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 text-xs text-muted-foreground">Satellite image unavailable</div>}
      {boundaryError && <div className="absolute left-2 right-2 bottom-2 z-10 rounded-lg bg-background/90 px-2 py-1 text-[10px] text-destructive">{boundaryError}</div>}
      <div className="absolute right-2 top-2 z-10 rounded-lg bg-background/90 px-2 py-1 text-[10px] font-medium shadow-sm">Field location · satellite evidence</div>
    </div>
  );
}

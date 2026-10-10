import { useEffect, useState } from 'react';
import { landsApi } from '@/services/landsApi';

/**
 * Signed read of one field picture from the private satellite bucket.
 *
 * The pipeline stores a storage PATH ({tenant}/{land}/...), never a URL, in
 * ndvi_data.image_url, ndvi_data.metadata.image.zones.storage_path,
 * satellite_water_layers.image_path and lands.ndvi_thumbnail_url. Tenant and
 * land ownership are enforced by the bucket's row rules; the path is also
 * checked here so a foreign path is refused before it is signed.
 *
 * Signed URLs are remembered for their lifetime, so switching between dates
 * on the map (or playing them) signs each picture once.
 */
const SIGNED_TTL = 3600;

export type SignedImageStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface SignedSatelliteImage { url: string | null; status: SignedImageStatus }

const signedCache = new Map<string, { url: string; expiresAt: number }>();

function isTenantScopedPath(path: string, tenantId: string | undefined, landId: string) {
  const p = path.split('/').filter(Boolean);
  return !!tenantId && p.length >= 3 && p[0] === tenantId && p[1] === landId;
}

export function useSignedSatelliteImage(path: string | null | undefined, farmerId?: string, tenantId?: string, landId?: string): SignedSatelliteImage {
  const [state, setState] = useState<SignedSatelliteImage>({ url: null, status: 'idle' });
  useEffect(() => {
    let cancelled = false;
    if (!path || !farmerId || !tenantId || !landId) { setState({ url: null, status: 'idle' }); return; }
    if (/^https?:\/\//i.test(path)) { setState({ url: path, status: 'ready' }); return; }
    const clean = path.replace(/^\/+/, '');
    if (!isTenantScopedPath(clean, tenantId, landId)) { console.error('[satellite image] path failed tenant/land scope', { landId, tenantId, path }); setState({ url: null, status: 'error' }); return; }
    const cached = signedCache.get(clean);
    if (cached && cached.expiresAt > Date.now()) { setState({ url: cached.url, status: 'ready' }); return; }
    setState({ url: null, status: 'loading' });
    // Signed by lands-api (owned land only): the bucket's rules refuse the browser's anon role.
    landsApi.signSatellite([clean])
      .then((urls) => {
        if (cancelled) return;
        const signedUrl = urls[clean];
        if (!signedUrl) { console.error('[satellite image] sign failed', clean); setState({ url: null, status: 'error' }); return; }
        // keep a safety margin so a cached URL is never handed out moments before it expires
        signedCache.set(clean, { url: signedUrl, expiresAt: Date.now() + (SIGNED_TTL - 300) * 1000 });
        setState({ url: signedUrl, status: 'ready' });
      })
      .catch((e) => { if (cancelled) return; console.error('[satellite image] sign exception', e); setState({ url: null, status: 'error' }); });
    return () => { cancelled = true; };
  }, [path, farmerId, tenantId, landId]);
  return state;
}

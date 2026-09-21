import React, { useState, useEffect, useMemo } from 'react';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

const THUMB_BUCKET = 'ndvi-thumbnails';
const THUMB_TTL = 6 * 60 * 60; // 6 h signed URL; the image itself never changes
const ownUrlCache = new Map<string, string>();

/** Sign the pipeline's one-time thumbnail (private bucket, tenant/land ownership enforced by RLS). */
function useOwnThumbnail(path: string | null | undefined, landId?: string): string | null {
  const { session } = useAuthStore();
  const [url, setUrl] = useState<string | null>(() => (path ? ownUrlCache.get(path) ?? null : null));
  useEffect(() => {
    let cancelled = false;
    if (!path || !landId || !session?.farmerId || !session?.tenantId) { setUrl(null); return; }
    if (/^https?:\/\//i.test(path)) { setUrl(path); return; }
    const clean = path.replace(/^\/+/, '');
    const parts = clean.split('/');
    if (parts.length < 3 || parts[0] !== session.tenantId || parts[1] !== landId) { setUrl(null); return; }
    const cached = ownUrlCache.get(clean); if (cached) { setUrl(cached); return; }
    supabaseWithAuth(session.farmerId, session.tenantId).storage.from(THUMB_BUCKET).createSignedUrl(clean, THUMB_TTL)
      .then(({ data }) => { if (cancelled || !data?.signedUrl) return; ownUrlCache.set(clean, data.signedUrl); setUrl(data.signedUrl); })
      .catch(() => { /* fall back to the static map below */ });
    return () => { cancelled = true; };
  }, [path, landId, session?.farmerId, session?.tenantId]);
  return url;
}
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from 'lucide-react';
import { useGoogleMaps } from '@/contexts/GoogleMapsContext';

interface LandThumbnailProps {
  boundary?: {
    coordinates?: number[][][];
  } | null;
  centerPoint?: {
    coordinates?: number[];
  } | null;
  landName: string;
  className?: string;
  /** v3.3: one-time true-colour thumbnail written by the satellite pipeline
   *  (lands.ndvi_thumbnail_url, a storage path {tenant}/{land}/truecolor_*.png).
   *  When present it is used instead of a Google Static Map request. */
  thumbnailPath?: string | null;
  landId?: string;
}

// Cache for static map URLs to avoid regenerating
const urlCache = new Map<string, string>();

// Generate a simple SVG representation of the boundary for offline/loading display
function generateBoundarySvg(coordinates: number[][]): string {
  if (!coordinates || coordinates.length < 3) {
    return '';
  }

  // Find bounds
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  coordinates.forEach(([lng, lat]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });

  // Add padding
  const latPad = (maxLat - minLat) * 0.1 || 0.0001;
  const lngPad = (maxLng - minLng) * 0.1 || 0.0001;
  minLat -= latPad;
  maxLat += latPad;
  minLng -= lngPad;
  maxLng += lngPad;

  const width = 400;
  const height = 200;
  
  // Convert coordinates to SVG points
  const points = coordinates.map(([lng, lat]) => {
    const x = ((lng - minLng) / (maxLng - minLng)) * width;
    const y = height - ((lat - minLat) / (maxLat - minLat)) * height;
    return `${x},${y}`;
  }).join(' ');

  // SVG with gradient background
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#1a472a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#2d5a3a;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <polygon points="${points}" fill="rgba(34,197,94,0.3)" stroke="#22c55e" stroke-width="2"/>
    </svg>
  `)}`;
}

export function LandThumbnail({ boundary, centerPoint, landName, className = '', thumbnailPath = null, landId }: LandThumbnailProps) {
  const ownThumbnail = useOwnThumbnail(thumbnailPath, landId);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [retryCount, setRetryCount] = useState(0);
  
  // Use context hook to get API key reactively
  const { apiKey, isLoading: isApiKeyLoading } = useGoogleMaps();

  // Listen for online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Generate fallback SVG immediately (no API key needed)
  const fallbackSvg = useMemo(() => {
    if (boundary?.coordinates?.[0]) {
      return generateBoundarySvg(boundary.coordinates[0]);
    }
    return '';
  }, [boundary]);

  // Generate static map URL when API key is available
  const mapUrl = useMemo(() => {
    // No API key yet - return empty
    if (!apiKey) return '';
    
    const cacheKey = `${landName}-${JSON.stringify(boundary?.coordinates?.[0]?.slice(0, 3))}-${retryCount}`;
    
    // Check cache first
    if (urlCache.has(cacheKey)) {
      return urlCache.get(cacheKey)!;
    }

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const imageSize = isMobile ? '400x200' : '600x300';

    // No boundary but has center point
    if (!boundary?.coordinates?.[0]?.length && centerPoint?.coordinates) {
      const center = `${centerPoint.coordinates[1]},${centerPoint.coordinates[0]}`;
      const url = `https://maps.googleapis.com/maps/api/staticmap?` +
        `center=${center}` +
        `&zoom=16` +
        `&size=${imageSize}` +
        `&maptype=satellite` +
        `&markers=color:green|size:medium|${center}` +
        `&key=${apiKey}`;
      urlCache.set(cacheKey, url);
      return url;
    }

    // Has boundary
    if (boundary?.coordinates?.[0]?.length) {
      const coordinates = boundary.coordinates[0];
      
      // Calculate bounds with padding
      let minLat = coordinates[0][1];
      let maxLat = coordinates[0][1];
      let minLng = coordinates[0][0];
      let maxLng = coordinates[0][0];
      
      coordinates.forEach((coord: number[]) => {
        minLat = Math.min(minLat, coord[1]);
        maxLat = Math.max(maxLat, coord[1]);
        minLng = Math.min(minLng, coord[0]);
        maxLng = Math.max(maxLng, coord[0]);
      });
      
      const latDiff = maxLat - minLat;
      const lngDiff = maxLng - minLng;
      const paddingFactor = 0.25;
      const minBoundSize = 0.0005;
      const effectiveLatDiff = Math.max(latDiff, minBoundSize);
      const effectiveLngDiff = Math.max(lngDiff, minBoundSize);
      
      const paddedMinLat = minLat - (effectiveLatDiff * paddingFactor);
      const paddedMaxLat = maxLat + (effectiveLatDiff * paddingFactor);
      const paddedMinLng = minLng - (effectiveLngDiff * paddingFactor);
      const paddedMaxLng = maxLng + (effectiveLngDiff * paddingFactor);
      
      const visibleBounds = `${paddedMinLat},${paddedMinLng}|${paddedMaxLat},${paddedMaxLng}`;
      
      const path = coordinates
        .map((coord: number[]) => `${coord[1]},${coord[0]}`)
        .join('|');
      
      const url = `https://maps.googleapis.com/maps/api/staticmap?` +
        `visible=${visibleBounds}` +
        `&size=${imageSize}` +
        `&maptype=satellite` +
        `&path=color:0xffffff|weight:3|${path}` +
        `&path=color:0x00ff00|weight:2|fillcolor:0x00ff0033|${path}` +
        `&key=${apiKey}`;
      
      urlCache.set(cacheKey, url);
      return url;
    }

    return '';
  }, [boundary, centerPoint, landName, apiKey, retryCount]);

  // Handle image error with retry
  const handleImageError = () => {
    const maxRetries = 2;
    if (retryCount < maxRetries && isOnline && apiKey) {
      setTimeout(() => setRetryCount(prev => prev + 1), 1000);
    } else {
      setImageError(true);
      setImageLoaded(true);
    }
  };

  // Reset states when retry count changes
  useEffect(() => {
    if (retryCount > 0) {
      setImageLoaded(false);
      setImageError(false);
    }
  }, [retryCount]);

  // Determine what to display
  // Priority: 1) Show SVG fallback immediately while loading
  //           2) Upgrade to static map when API key is ready + online
  //           3) Fall back to SVG if image fails or offline
  // Own one-time thumbnail first (no Google request at all); Static Map only while a land has none yet.
  const shouldUseFallback = !isOnline || (!ownThumbnail && !mapUrl) || imageError;
  const displayUrl = shouldUseFallback ? fallbackSvg : (ownThumbnail ?? mapUrl);

  // Handle no boundary and no center point
  if (!displayUrl && !isApiKeyLoading) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <div className="text-center text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No boundary</p>
        </div>
      </div>
    );
  }

  // Show fallback SVG while API key is loading (if available)
  if (isApiKeyLoading && fallbackSvg) {
    return (
      <div className={`relative ${className}`}>
        <img 
          src={fallbackSvg} 
          alt={`${landName} boundary`}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-1 right-1 bg-background/80 backdrop-blur-sm rounded px-1.5 py-0.5">
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  // Show skeleton only if we have no fallback at all
  if (!displayUrl) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Show skeleton while loading static map (not for SVG fallback) */}
      {!imageLoaded && !shouldUseFallback && (
        <Skeleton className="absolute inset-0" />
      )}
      
      <img 
        src={displayUrl} 
        alt={`${landName} boundary`}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          imageLoaded || shouldUseFallback ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        onLoad={() => setImageLoaded(true)}
        onError={handleImageError}
      />

      {/* Offline indicator */}
      {!isOnline && (
        <div className="absolute bottom-1 right-1 bg-background/80 backdrop-blur-sm rounded px-1.5 py-0.5">
          <span className="text-xs text-muted-foreground">Offline</span>
        </div>
      )}
    </div>
  );
}

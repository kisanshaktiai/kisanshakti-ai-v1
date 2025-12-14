import React, { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, RefreshCw } from 'lucide-react';
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
}

// Cache for static map URLs to avoid regenerating
const urlCache = new Map<string, string>();

// Generate a simple SVG representation of the boundary for offline display
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

export function LandThumbnail({ boundary, centerPoint, landName, className = '' }: LandThumbnailProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [retryCount, setRetryCount] = useState(0);
  
  // Use the context hook to get API key reactively
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

  // Reset image states when retry count changes
  useEffect(() => {
    if (retryCount > 0) {
      setImageLoaded(false);
      setImageError(false);
    }
  }, [retryCount]);

  // Generate static map URL or fallback - now reactive to apiKey changes
  const { mapUrl, fallbackSvg } = useMemo(() => {
    const cacheKey = `${landName}-${JSON.stringify(boundary?.coordinates?.[0]?.slice(0, 3))}-${retryCount}`;
    
    // Check cache first
    if (urlCache.has(cacheKey) && apiKey) {
      return { mapUrl: urlCache.get(cacheKey)!, fallbackSvg: '' };
    }

    // Generate fallback SVG from boundary
    let fallbackSvg = '';
    if (boundary?.coordinates?.[0]) {
      fallbackSvg = generateBoundarySvg(boundary.coordinates[0]);
    }

    // No API key yet - use SVG fallback
    if (!apiKey) {
      return { mapUrl: '', fallbackSvg };
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
      return { mapUrl: url, fallbackSvg };
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
      return { mapUrl: url, fallbackSvg };
    }

    return { mapUrl: '', fallbackSvg };
  }, [boundary, centerPoint, landName, apiKey, retryCount]);

  // Handle image error with retry
  const handleImageError = () => {
    const maxRetries = 2;
    if (retryCount < maxRetries && isOnline && apiKey) {
      // Retry after a delay
      setTimeout(() => setRetryCount(prev => prev + 1), 1000);
    } else {
      setImageError(true);
      setImageLoaded(true);
    }
  };

  // Use fallback if offline, no map URL, or image error
  const shouldUseFallback = !isOnline || !mapUrl || imageError;
  const displayUrl = shouldUseFallback ? fallbackSvg : mapUrl;

  // Show loading while API key is being fetched
  if (isApiKeyLoading && !fallbackSvg) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <Skeleton className="w-full h-full absolute inset-0" />
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Handle no boundary and no center point
  if (!displayUrl) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <div className="text-center text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No boundary</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
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

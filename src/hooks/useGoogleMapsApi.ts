import { useState, useEffect, useRef, useCallback } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { supabase } from '@/integrations/supabase/client';
import { onAppResume } from '@/utils/capacitorInit';

// Cache configuration
const CACHE_KEY = 'google_maps_api_key_v4';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Global state to prevent duplicate loads
let globalApiKey: string | null = null;
let apiKeyFetchPromise: Promise<string | null> | null = null;

// Libraries to load
const GOOGLE_MAPS_LIBRARIES: ("drawing" | "geometry")[] = ['drawing', 'geometry'];

/**
 * Get cached API key synchronously
 */
function getCachedApiKey(): string | null {
  if (globalApiKey) return globalApiKey;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { key, timestamp } = JSON.parse(cached);
      const isValid = Date.now() - timestamp < CACHE_DURATION && key && key.length > 10;
      if (isValid) {
        globalApiKey = key;
        console.log('🗺️ [GoogleMaps] Using cached API key');
        return key;
      }
    }
  } catch (err) {
    console.warn('🗺️ [GoogleMaps] Cache read error:', err);
  }
  return null;
}

/**
 * Save API key to cache
 */
function cacheApiKey(key: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      key,
      timestamp: Date.now()
    }));
    globalApiKey = key;
    console.log('🗺️ [GoogleMaps] API key cached');
  } catch (err) {
    console.warn('🗺️ [GoogleMaps] Cache write error:', err);
  }
}

/**
 * Clear cached API key and reset state
 */
function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    globalApiKey = null;
    apiKeyFetchPromise = null;
    console.log('🗺️ [GoogleMaps] Cache cleared');
  } catch (err) {
    console.warn('🗺️ [GoogleMaps] Cache clear error:', err);
  }
}

/**
 * Fetch API key from edge function (singleton pattern)
 */
async function fetchApiKeyFromServer(): Promise<string | null> {
  // Return cached key if available
  const cached = getCachedApiKey();
  if (cached) return cached;
  
  // Return existing promise if fetching
  if (apiKeyFetchPromise) return apiKeyFetchPromise;
  
  apiKeyFetchPromise = (async () => {
    try {
      console.log('🗺️ [GoogleMaps] Fetching API key from server...');
      
      const { data, error } = await supabase.functions.invoke('google-maps-config', {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (error) {
        console.error('🗺️ [GoogleMaps] Fetch error:', error);
        throw new Error(error.message);
      }

      if (data?.apiKey && data.apiKey.length > 10) {
        console.log('🗺️ [GoogleMaps] API key received successfully');
        cacheApiKey(data.apiKey);
        return data.apiKey;
      } else {
        throw new Error('Invalid API key received');
      }
    } catch (err) {
      console.error('🗺️ [GoogleMaps] Failed to fetch API key:', err);
      apiKeyFetchPromise = null; // Allow retry
      return null;
    }
  })();
  
  return apiKeyFetchPromise;
}

/**
 * Check if Google Maps is fully functional
 */
function isGoogleMapsReady(): boolean {
  return !!(
    typeof window !== 'undefined' && 
    window.google?.maps?.Map &&
    window.google?.maps?.Marker &&
    window.google?.maps?.Polygon
  );
}

/**
 * Hook to manage Google Maps API loading
 * Uses @react-google-maps/api's useJsApiLoader for reliable script management
 */
export function useGoogleMapsApi() {
  const [apiKey, setApiKey] = useState<string | null>(() => getCachedApiKey());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isKeyLoading, setIsKeyLoading] = useState(!getCachedApiKey());
  const [retryCount, setRetryCount] = useState(0);
  
  const isMounted = useRef(true);
  const lastRetryTime = useRef(0);

  // Fetch API key on mount
  useEffect(() => {
    isMounted.current = true;

    const loadKey = async () => {
      if (apiKey) {
        setIsKeyLoading(false);
        return;
      }

      setIsKeyLoading(true);
      const key = await fetchApiKeyFromServer();
      
      if (isMounted.current) {
        if (key) {
          setApiKey(key);
          setFetchError(null);
        } else {
          setFetchError('Failed to load Google Maps API key');
        }
        setIsKeyLoading(false);
      }
    };

    loadKey();

    return () => {
      isMounted.current = false;
    };
  }, [retryCount]);

  // Use the official loader from @react-google-maps/api
  // Only load when we have a valid API key
  const { isLoaded: isScriptLoaded, loadError: scriptLoadError } = useJsApiLoader({
    id: 'google-maps-script-main',
    googleMapsApiKey: apiKey || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
    // Don't load if no API key
    preventGoogleFontsLoading: false,
  });

  // Handle app resume
  useEffect(() => {
    const unsubscribe = onAppResume(() => {
      console.log('🗺️ [GoogleMaps] App resumed, checking state...');
      
      if (isGoogleMapsReady()) {
        console.log('🗺️ [GoogleMaps] Still functional after resume');
      } else {
        console.log('🗺️ [GoogleMaps] May need refresh after resume');
        // Force a re-render to check state
        setRetryCount(c => c);
      }
    });

    return () => unsubscribe();
  }, []);

  // Auto-retry on error (with exponential backoff)
  useEffect(() => {
    if ((fetchError || scriptLoadError) && retryCount < 3 && !apiKey) {
      const now = Date.now();
      const timeSinceLastRetry = now - lastRetryTime.current;
      const delay = Math.min(2000 * Math.pow(2, retryCount), 10000);
      
      if (timeSinceLastRetry > delay) {
        console.log(`🗺️ [GoogleMaps] Auto-retry ${retryCount + 1}/3 in ${delay}ms`);
        
        const timeout = setTimeout(() => {
          if (isMounted.current) {
            lastRetryTime.current = Date.now();
            setFetchError(null);
            setRetryCount(prev => prev + 1);
          }
        }, delay);

        return () => clearTimeout(timeout);
      }
    }
  }, [fetchError, scriptLoadError, retryCount, apiKey]);

  // Manual retry function
  const retry = useCallback(() => {
    console.log('🗺️ [GoogleMaps] Manual retry triggered');
    clearCache();
    setApiKey(null);
    setFetchError(null);
    setIsKeyLoading(true);
    lastRetryTime.current = 0;
    
    // Use timeout to ensure state updates are processed
    setTimeout(() => {
      setRetryCount(prev => prev + 1);
    }, 100);
  }, []);

  // Compute final states
  const hasApiKey = !!apiKey && apiKey.length > 10;
  const isFullyLoaded = hasApiKey && isScriptLoaded && isGoogleMapsReady();
  const isLoading = isKeyLoading || (hasApiKey && !isScriptLoaded && !scriptLoadError);
  const errorMessage = fetchError || (scriptLoadError?.message ?? null);

  // Debug logging
  useEffect(() => {
    console.log('🗺️ [GoogleMaps] State:', { 
      hasApiKey, 
      isScriptLoaded,
      isFullyLoaded,
      isLoading,
      error: errorMessage,
      retryCount,
      googleReady: isGoogleMapsReady()
    });
  }, [hasApiKey, isScriptLoaded, isFullyLoaded, isLoading, errorMessage, retryCount]);

  return {
    isLoaded: isFullyLoaded,
    loadError: errorMessage,
    isLoading,
    apiKey,
    retry
  };
}

/**
 * Get cached API key synchronously (for static maps, thumbnails)
 */
export function getGoogleMapsApiKey(): string | null {
  return getCachedApiKey();
}

/**
 * Reset Google Maps state (for testing/debugging)
 */
export function resetGoogleMapsState(): void {
  clearCache();
}

/**
 * Preload API key in background (call early in app lifecycle)
 */
export async function preloadGoogleMapsApiKey(): Promise<void> {
  await fetchApiKeyFromServer();
}

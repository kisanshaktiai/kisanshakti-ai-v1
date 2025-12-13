import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { onAppResume, isNativeApp } from '@/utils/capacitorInit';

// Cache configuration
const CACHE_KEY = 'google_maps_api_key_v3';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Global state to prevent multiple script loads
let globalApiKey: string | null = null;
let globalScriptLoaded = false;
let scriptLoadPromise: Promise<void> | null = null;

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
        console.log('🗺️ [GoogleMaps] Loaded API key from cache');
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
 * Clear cached API key
 */
function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    globalApiKey = null;
    globalScriptLoaded = false;
    scriptLoadPromise = null;
  } catch (err) {
    console.warn('🗺️ [GoogleMaps] Cache clear error:', err);
  }
}

/**
 * Load Google Maps script
 */
function loadScript(apiKey: string): Promise<void> {
  // Return existing promise if loading
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  // Already loaded
  if (window.google?.maps) {
    console.log('🗺️ [GoogleMaps] Script already loaded');
    globalScriptLoaded = true;
    return Promise.resolve();
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    // Check for existing script
    const existingScript = document.getElementById('google-maps-script-v3');
    if (existingScript) {
      if (window.google?.maps) {
        globalScriptLoaded = true;
        resolve();
        return;
      }
      existingScript.addEventListener('load', () => {
        globalScriptLoaded = true;
        resolve();
      });
      existingScript.addEventListener('error', () => {
        scriptLoadPromise = null;
        reject(new Error('Script load failed'));
      });
      return;
    }

    console.log('🗺️ [GoogleMaps] Injecting script...');
    
    const script = document.createElement('script');
    script.id = 'google-maps-script-v3';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=drawing,geometry&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log('🗺️ [GoogleMaps] Script loaded');
      globalScriptLoaded = true;
      resolve();
    };

    script.onerror = () => {
      console.error('🗺️ [GoogleMaps] Script load failed');
      scriptLoadPromise = null;
      reject(new Error('Script load failed'));
    };

    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Check if Google Maps is functional
 */
function isGoogleMapsReady(): boolean {
  return !!(window.google?.maps?.Map);
}

/**
 * Hook to manage Google Maps API loading
 */
export function useGoogleMapsApi() {
  // Initialize with cached key
  const [apiKey, setApiKey] = useState<string | null>(() => getCachedApiKey());
  const [error, setError] = useState<string | null>(null);
  const [isKeyLoading, setIsKeyLoading] = useState(!getCachedApiKey());
  const [isScriptLoaded, setIsScriptLoaded] = useState(() => isGoogleMapsReady());
  const [retryCount, setRetryCount] = useState(0);
  
  const isMounted = useRef(true);
  const fetchingRef = useRef(false);

  // Fetch API key
  const fetchApiKey = useCallback(async (force: boolean = false) => {
    if (fetchingRef.current && !force) return;
    
    const cachedKey = getCachedApiKey();
    if (cachedKey && !force) {
      setApiKey(cachedKey);
      setIsKeyLoading(false);
      return;
    }

    fetchingRef.current = true;
    setIsKeyLoading(true);

    try {
      console.log('🗺️ [GoogleMaps] Fetching API key...');
      
      const { data, error: fetchError } = await supabase.functions.invoke('google-maps-config', {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!isMounted.current) return;

      if (fetchError) throw new Error(fetchError.message);

      if (data?.apiKey && data.apiKey.length > 10) {
        console.log('🗺️ [GoogleMaps] API key received');
        cacheApiKey(data.apiKey);
        setApiKey(data.apiKey);
        setError(null);
      } else {
        throw new Error('Invalid API key');
      }
    } catch (err) {
      if (!isMounted.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load Google Maps';
      console.error('🗺️ [GoogleMaps] Error:', msg);
      setError(msg);
    } finally {
      fetchingRef.current = false;
      setIsKeyLoading(false);
    }
  }, []);

  // Load script when API key is available
  useEffect(() => {
    if (!apiKey) return;

    // Check if already loaded
    if (isGoogleMapsReady()) {
      setIsScriptLoaded(true);
      return;
    }

    loadScript(apiKey)
      .then(() => {
        if (isMounted.current) {
          setIsScriptLoaded(true);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted.current) {
          setError(err.message);
          setIsScriptLoaded(false);
        }
      });
  }, [apiKey]);

  // Initial fetch
  useEffect(() => {
    isMounted.current = true;

    if (!apiKey && !error) {
      fetchApiKey();
    }

    // App resume handler
    const unsubscribe = onAppResume(() => {
      console.log('🗺️ [GoogleMaps] App resumed, checking state...');
      
      if (isGoogleMapsReady()) {
        console.log('🗺️ [GoogleMaps] Still functional');
        setIsScriptLoaded(true);
      } else if (globalApiKey) {
        console.log('🗺️ [GoogleMaps] Reloading script...');
        scriptLoadPromise = null;
        loadScript(globalApiKey)
          .then(() => isMounted.current && setIsScriptLoaded(true))
          .catch(() => isMounted.current && setIsScriptLoaded(false));
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, []);

  // Retry logic
  useEffect(() => {
    if (error && retryCount < 3 && !apiKey) {
      const delay = Math.min(2000 * Math.pow(2, retryCount), 10000);
      console.log(`🗺️ [GoogleMaps] Retry ${retryCount + 1}/3 in ${delay}ms`);
      
      const timeout = setTimeout(() => {
        if (isMounted.current) {
          setError(null);
          setRetryCount(prev => prev + 1);
          fetchApiKey(true);
        }
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [error, retryCount, apiKey, fetchApiKey]);

  // Compute states
  const isFullyLoaded = isScriptLoaded && isGoogleMapsReady();
  const isLoading = isKeyLoading || (apiKey && !isScriptLoaded);

  // Debug logging
  useEffect(() => {
    console.log('🗺️ [GoogleMaps] State:', { 
      hasApiKey: !!apiKey, 
      isScriptLoaded,
      isFullyLoaded,
      isLoading,
      error,
      retryCount
    });
  }, [apiKey, isScriptLoaded, isFullyLoaded, isLoading, error, retryCount]);

  const retry = useCallback(() => {
    console.log('🗺️ [GoogleMaps] Manual retry triggered');
    clearCache();
    setApiKey(null);
    setError(null);
    setRetryCount(0);
    setIsKeyLoading(true);
    setIsScriptLoaded(false);
    fetchingRef.current = false;
    
    setTimeout(() => fetchApiKey(true), 100);
  }, [fetchApiKey]);

  return {
    isLoaded: isFullyLoaded,
    loadError: error,
    isLoading: !!isLoading,
    apiKey,
    retry
  };
}

/**
 * Get cached API key synchronously (for static maps)
 */
export function getGoogleMapsApiKey(): string | null {
  return getCachedApiKey();
}

/**
 * Reset Google Maps state (for testing/debugging)
 */
export function resetGoogleMapsState(): void {
  clearCache();
  console.log('🗺️ [GoogleMaps] State reset');
}

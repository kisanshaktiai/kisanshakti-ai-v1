import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLoadScript, Libraries } from '@react-google-maps/api';
import { onAppResume, isNativeApp } from '@/utils/capacitorInit';

// Define libraries with proper typing
const libraries: Libraries = ['drawing', 'geometry'];

// Cache configuration
const CACHE_KEY = 'google_maps_api_key_v2';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days for offline support

// Singleton to track script loading state across component instances
let scriptLoadAttempted = false;
let cachedApiKey: string | null = null;
let isAppResuming = false;

/**
 * Get cached API key synchronously on app start
 * This ensures the key is available immediately when app reopens
 */
function getCachedApiKey(): string | null {
  if (cachedApiKey) return cachedApiKey;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { key, timestamp } = JSON.parse(cached);
      const isValid = Date.now() - timestamp < CACHE_DURATION && key && key.length > 10;
      if (isValid) {
        cachedApiKey = key;
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
    cachedApiKey = key;
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
    cachedApiKey = null;
    scriptLoadAttempted = false;
  } catch (err) {
    console.warn('🗺️ [GoogleMaps] Cache clear error:', err);
  }
}

/**
 * Hook to manage Google Maps API loading
 * 
 * CRITICAL FIX for white screen issue:
 * - Load API key from cache SYNCHRONOUSLY on first render
 * - Never call useLoadScript with empty key
 * - Proper cleanup and retry logic
 */
export function useGoogleMapsApi() {
  // Initialize with cached key immediately (synchronous)
  const [apiKey, setApiKey] = useState<string | null>(() => getCachedApiKey());
  const [error, setError] = useState<string | null>(null);
  const [isKeyLoading, setIsKeyLoading] = useState(!apiKey);
  const [retryCount, setRetryCount] = useState(0);
  const isMounted = useRef(true);
  const fetchingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    
    // Register for app resume events (for native apps)
    const unsubscribe = onAppResume(() => {
      console.log('🗺️ [GoogleMaps] App resumed, checking state...');
      isAppResuming = true;
      
      // If we have a cached key, the script should already be loaded
      // Just ensure the state is correct
      if (cachedApiKey && !apiKey) {
        setApiKey(cachedApiKey);
        setIsKeyLoading(false);
      }
      
      setTimeout(() => {
        isAppResuming = false;
      }, 1000);
    });
    
    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [apiKey]);

  // Fetch API key from edge function
  const fetchApiKey = useCallback(async (force: boolean = false) => {
    // Prevent concurrent fetches
    if (fetchingRef.current && !force) {
      console.log('🗺️ [GoogleMaps] Fetch already in progress');
      return;
    }

    // Skip if already have valid key
    if (apiKey && !force) {
      setIsKeyLoading(false);
      return;
    }

    fetchingRef.current = true;
    setIsKeyLoading(true);

    try {
      console.log('🗺️ [GoogleMaps] Fetching API key from edge function...');
      
      const { data, error: fetchError } = await supabase.functions.invoke('google-maps-config', {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (!isMounted.current) return;

      if (fetchError) {
        throw new Error(fetchError.message || 'Failed to fetch API key');
      }

      if (data?.apiKey && data.apiKey.length > 10) {
        console.log('🗺️ [GoogleMaps] API key received');
        cacheApiKey(data.apiKey);
        setApiKey(data.apiKey);
        setError(null);
        setIsKeyLoading(false);
      } else {
        throw new Error('Invalid API key in response');
      }
    } catch (err) {
      if (!isMounted.current) return;
      
      const errorMsg = err instanceof Error ? err.message : 'Failed to load Google Maps';
      console.error('🗺️ [GoogleMaps] Fetch error:', errorMsg);
      setError(errorMsg);
      setIsKeyLoading(false);
    } finally {
      fetchingRef.current = false;
    }
  }, [apiKey]);

  // Initial fetch if no cached key
  useEffect(() => {
    if (!apiKey && !error) {
      fetchApiKey();
    }
  }, []);

  // Retry logic with exponential backoff
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

  // CRITICAL: Only load script when we have a valid API key
  // This prevents the white screen caused by loading with empty/invalid key
  const shouldLoadScript = Boolean(apiKey && apiKey.length > 10);
  
  const { isLoaded: scriptLoaded, loadError: scriptError } = useLoadScript({
    googleMapsApiKey: shouldLoadScript ? apiKey! : '',
    libraries,
    preventGoogleFontsLoading: true,
    id: 'google-map-script-v2',
    // CRITICAL: Don't load if no valid key
    ...(shouldLoadScript ? {} : { googleMapsApiKey: '' }),
  });

  // Handle script load errors
  useEffect(() => {
    if (scriptError && retryCount < 3) {
      console.error('🗺️ [GoogleMaps] Script error:', scriptError.message);
      clearCache();
      setApiKey(null);
      setError('Failed to load Google Maps. Please try again.');
    }
  }, [scriptError, retryCount]);

  // Compute final states
  const isFullyLoaded = shouldLoadScript && scriptLoaded && !scriptError;
  const isLoading = isKeyLoading || (shouldLoadScript && !scriptLoaded && !scriptError);
  const loadError = scriptError?.message || error;

  // Debug logging
  useEffect(() => {
    console.log('🗺️ [GoogleMaps] State:', { 
      hasApiKey: !!apiKey, 
      shouldLoadScript,
      scriptLoaded,
      isFullyLoaded,
      isLoading,
      error: loadError,
      retryCount
    });
  }, [apiKey, shouldLoadScript, scriptLoaded, isFullyLoaded, isLoading, loadError, retryCount]);

  return {
    isLoaded: isFullyLoaded,
    loadError,
    isLoading,
    apiKey,
    retry: useCallback(() => {
      console.log('🗺️ [GoogleMaps] Manual retry triggered');
      clearCache();
      setApiKey(null);
      setError(null);
      setRetryCount(0);
      setIsKeyLoading(true);
      fetchingRef.current = false;
      
      // Small delay to ensure state updates
      setTimeout(() => {
        fetchApiKey(true);
      }, 100);
    }, [fetchApiKey])
  };
}

/**
 * Reset the Google Maps API state
 * Call this when the app becomes active after being in background
 */
export function resetGoogleMapsState(): void {
  scriptLoadAttempted = false;
  console.log('🗺️ [GoogleMaps] State reset for app resume');
}

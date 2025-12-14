import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { onAppResume } from '@/utils/capacitorInit';

// Cache configuration - must match useGoogleMapsApi.ts
const API_KEY_CACHE_KEY = 'google_maps_api_key_v4';
const API_KEY_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

interface GoogleMapsContextType {
  apiKey: string | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  apiKey: null,
  isLoading: true,
  error: null,
  retry: () => {},
});

// Global state for API key (shared with useGoogleMapsApi)
let globalApiKey: string | null = null;

/**
 * Get cached API key synchronously
 */
function getCachedApiKey(): string | null {
  if (globalApiKey) return globalApiKey;
  
  try {
    const cached = localStorage.getItem(API_KEY_CACHE_KEY);
    if (cached) {
      const { key, timestamp } = JSON.parse(cached);
      const isValid = Date.now() - timestamp < API_KEY_CACHE_DURATION && key && key.length > 10;
      if (isValid) {
        globalApiKey = key;
        return key;
      }
    }
  } catch (err) {
    console.warn('🗺️ [GoogleMapsContext] Cache read error:', err);
  }
  return null;
}

/**
 * Save API key to cache
 */
function cacheApiKey(key: string): void {
  try {
    localStorage.setItem(API_KEY_CACHE_KEY, JSON.stringify({
      key,
      timestamp: Date.now()
    }));
    globalApiKey = key;
  } catch (err) {
    console.warn('🗺️ [GoogleMapsContext] Cache write error:', err);
  }
}

/**
 * Clear cached API key
 */
function clearApiKeyCache(): void {
  try {
    localStorage.removeItem(API_KEY_CACHE_KEY);
    globalApiKey = null;
  } catch (err) {
    console.warn('🗺️ [GoogleMapsContext] Cache clear error:', err);
  }
}

/**
 * Provider that preloads and manages Google Maps API key
 * This allows the API key to be fetched once at app startup
 * Note: Script loading is handled by useJsApiLoader in useGoogleMapsApi hook
 */
export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(() => getCachedApiKey());
  const [isLoading, setIsLoading] = useState(!getCachedApiKey());
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const isMounted = useRef(true);
  const fetchingRef = useRef(false);

  // Fetch API key from edge function
  const fetchApiKey = useCallback(async (force: boolean = false) => {
    if (fetchingRef.current && !force) return;
    
    const cachedKey = getCachedApiKey();
    if (cachedKey && !force) {
      setApiKey(cachedKey);
      setIsLoading(false);
      return;
    }

    fetchingRef.current = true;
    setIsLoading(true);

    try {
      console.log('🗺️ [GoogleMapsContext] Fetching API key...');
      
      const { data, error: fetchError } = await supabase.functions.invoke('google-maps-config', {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!isMounted.current) return;

      if (fetchError) {
        throw new Error(fetchError.message || 'Failed to fetch API key');
      }

      if (data?.apiKey && data.apiKey.length > 10) {
        console.log('🗺️ [GoogleMapsContext] API key fetched successfully');
        cacheApiKey(data.apiKey);
        setApiKey(data.apiKey);
        setError(null);
      } else {
        throw new Error('Invalid API key received');
      }
    } catch (err) {
      if (!isMounted.current) return;
      
      const errorMsg = err instanceof Error ? err.message : 'Failed to load Google Maps';
      console.error('🗺️ [GoogleMapsContext] Fetch error:', errorMsg);
      setError(errorMsg);
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    isMounted.current = true;
    fetchApiKey();

    // Handle app resume
    const unsubscribe = onAppResume(() => {
      console.log('🗺️ [GoogleMapsContext] App resumed');
      // Verify cached key is still valid
      if (!getCachedApiKey()) {
        fetchApiKey(true);
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [fetchApiKey]);

  // Auto-retry logic
  useEffect(() => {
    if (error && retryCount < 3 && !apiKey) {
      const delay = Math.min(2000 * Math.pow(2, retryCount), 10000);
      console.log(`🗺️ [GoogleMapsContext] Retry ${retryCount + 1}/3 in ${delay}ms`);
      
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

  // Manual retry function
  const retry = useCallback(() => {
    console.log('🗺️ [GoogleMapsContext] Manual retry triggered');
    clearApiKeyCache();
    setApiKey(null);
    setError(null);
    setRetryCount(0);
    setIsLoading(true);
    fetchingRef.current = false;
    
    setTimeout(() => fetchApiKey(true), 100);
  }, [fetchApiKey]);

  return (
    <GoogleMapsContext.Provider value={{
      apiKey,
      isLoading,
      error,
      retry,
    }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

/**
 * Hook to access Google Maps context
 */
export function useGoogleMaps() {
  const context = useContext(GoogleMapsContext);
  if (!context) {
    throw new Error('useGoogleMaps must be used within GoogleMapsProvider');
  }
  return context;
}

/**
 * Get the cached API key synchronously (for static maps, thumbnails)
 */
export function getGoogleMapsApiKey(): string | null {
  return getCachedApiKey();
}

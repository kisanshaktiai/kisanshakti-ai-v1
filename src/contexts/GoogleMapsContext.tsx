import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { onAppResume } from '@/utils/capacitorInit';

// Cache configuration
const API_KEY_CACHE_KEY = 'google_maps_api_key_v5';
const API_KEY_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

interface GoogleMapsContextType {
  apiKey: string | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
  isReady: boolean;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  apiKey: null,
  isLoading: true,
  error: null,
  retry: () => {},
  isReady: false,
});

/**
 * Get cached API key synchronously
 */
function getCachedApiKey(): string | null {
  try {
    const cached = localStorage.getItem(API_KEY_CACHE_KEY);
    if (cached) {
      const { key, timestamp } = JSON.parse(cached);
      const isValid = Date.now() - timestamp < API_KEY_CACHE_DURATION && key && key.length > 10;
      if (isValid) {
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
  } catch (err) {
    console.warn('🗺️ [GoogleMapsContext] Cache clear error:', err);
  }
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 8000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

/**
 * Fetch API key using direct fetch (fallback)
 */
async function fetchApiKeyDirect(): Promise<string> {
  const response = await fetch('https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/google-maps-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2xra3p4ZW1zYmVuaXl1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjcxNjUsImV4cCI6MjA2ODAwMzE2NX0.dUnGp7wbwYom1FPbn_4EGf3PWjgmr8mXwL2w2SdYOh4',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2xra3p4ZW1zYmVuaXl1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjcxNjUsImV4cCI6MjA2ODAwMzE2NX0.dUnGp7wbwYom1FPbn_4EGf3PWjgmr8mXwL2w2SdYOh4',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.apiKey) {
    throw new Error('No API key in response');
  }
  
  return data.apiKey;
}

/**
 * Provider that preloads and manages Google Maps API key
 * Single source of truth for API key management
 */
export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  // Initialize with cached key immediately for fast startup
  const [apiKey, setApiKey] = useState<string | null>(() => {
    const cached = getCachedApiKey();
    if (cached) {
      console.log('🗺️ [GoogleMapsContext] Immediate cache hit');
    }
    return cached;
  });
  const [isLoading, setIsLoading] = useState(!getCachedApiKey());
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const isMounted = useRef(true);
  const fetchingRef = useRef(false);

  // Fetch API key from edge function with fallback
  const fetchApiKey = useCallback(async (force: boolean = false) => {
    if (fetchingRef.current && !force) return;
    
    const cachedKey = getCachedApiKey();
    
    // Use cached key immediately if available and not forcing refresh
    if (cachedKey && !force) {
      console.log('🗺️ [GoogleMapsContext] Using cached API key');
      setApiKey(cachedKey);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Check network connectivity before attempting fetch
    if (!navigator.onLine) {
      console.log('🗺️ [GoogleMapsContext] Offline detected');
      if (cachedKey) {
        console.log('🗺️ [GoogleMapsContext] Using cached key while offline');
        setApiKey(cachedKey);
        setError(null);
      } else {
        setError('No internet connection. Please check your network.');
      }
      setIsLoading(false);
      return;
    }

    fetchingRef.current = true;
    setIsLoading(true);

    try {
      console.log('🗺️ [GoogleMapsContext] Fetching API key from server...');
      
      let apiKeyResult: string | null = null;
      
      // Try using Supabase client first
      try {
        const { data, error: fetchError } = await fetchWithTimeout(
          () => supabase.functions.invoke('google-maps-config', {
            method: 'POST',
            body: {}
          }),
          6000
        );

        if (fetchError) {
          console.warn('🗺️ [GoogleMapsContext] Supabase client failed:', fetchError.message);
          throw fetchError;
        }

        if (data?.apiKey && data.apiKey.length > 10) {
          apiKeyResult = data.apiKey;
        }
      } catch (supabaseErr) {
        console.warn('🗺️ [GoogleMapsContext] Trying direct fetch fallback...');
        
        // Fallback to direct fetch
        try {
          apiKeyResult = await fetchWithTimeout(() => fetchApiKeyDirect(), 6000);
        } catch (directErr) {
          console.error('🗺️ [GoogleMapsContext] Direct fetch also failed:', directErr);
          throw directErr;
        }
      }

      if (!isMounted.current) return;

      if (apiKeyResult) {
        console.log('🗺️ [GoogleMapsContext] API key fetched successfully');
        cacheApiKey(apiKeyResult);
        setApiKey(apiKeyResult);
        setError(null);
      } else {
        throw new Error('Invalid API key received from server');
      }
    } catch (err) {
      if (!isMounted.current) return;
      
      const errorMsg = err instanceof Error ? err.message : 'Failed to load Google Maps';
      console.error('🗺️ [GoogleMapsContext] Fetch error:', errorMsg);
      
      // CRITICAL: Fallback to cached key on any error
      if (cachedKey) {
        console.log('🗺️ [GoogleMapsContext] Network error - falling back to cached key');
        setApiKey(cachedKey);
        setError(null); // Clear error since we have a valid fallback
      } else {
        setError(errorMsg);
      }
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Initial fetch - PERFORMANCE FIX: Delay fetching if we have cache
  useEffect(() => {
    isMounted.current = true;
    
    // If we have a cached key, we're already good
    // Delay background refresh to not block app startup
    if (apiKey) {
      // PERFORMANCE FIX: Delay background refresh to 10 seconds
      const refreshTimeout = setTimeout(() => {
        if (isMounted.current && navigator.onLine) {
          console.log('🗺️ [GoogleMapsContext] Background refresh of API key...');
          fetchApiKey(true).catch(() => {
            // Ignore errors during background refresh - we already have a key
          });
        }
      }, 10000); // Increased from 1000ms to 10000ms
      
      return () => {
        clearTimeout(refreshTimeout);
        isMounted.current = false;
      };
    }
    
    // PERFORMANCE FIX: If no cache, still delay initial fetch by 2 seconds
    // Maps are usually not needed immediately on app load
    const initialFetchTimeout = setTimeout(() => {
      if (isMounted.current) {
        fetchApiKey();
      }
    }, 2000);

    // Handle app resume
    const unsubscribe = onAppResume(() => {
      console.log('🗺️ [GoogleMapsContext] App resumed');
      if (!getCachedApiKey()) {
        fetchApiKey(true);
      }
    });

    return () => {
      clearTimeout(initialFetchTimeout);
      isMounted.current = false;
      unsubscribe();
    };
  }, [fetchApiKey, apiKey]);

  // Auto-retry logic (only if no cached key available)
  useEffect(() => {
    if (error && retryCount < 3 && !apiKey && !getCachedApiKey()) {
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

  // Computed ready state
  const isReady = Boolean(apiKey && apiKey.length > 10);

  return (
    <GoogleMapsContext.Provider value={{
      apiKey,
      isLoading,
      error,
      retry,
      isReady,
    }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

/**
 * Hook to access Google Maps context - SINGLE SOURCE OF TRUTH
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

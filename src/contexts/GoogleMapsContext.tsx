import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { onAppResume, isNativeApp } from '@/utils/capacitorInit';

// Cache configuration
const API_KEY_CACHE_KEY = 'google_maps_api_key_v3';
const API_KEY_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

interface GoogleMapsContextType {
  apiKey: string | null;
  isLoading: boolean;
  error: string | null;
  isScriptLoaded: boolean;
  retry: () => void;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  apiKey: null,
  isLoading: true,
  error: null,
  isScriptLoaded: false,
  retry: () => {},
});

// Global state for script loading
let scriptLoadPromise: Promise<void> | null = null;
let isScriptInjected = false;

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
 * Load Google Maps script
 */
function loadGoogleMapsScript(apiKey: string): Promise<void> {
  // Return existing promise if script is already loading
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  // Check if already loaded
  if (window.google?.maps) {
    console.log('🗺️ [GoogleMapsContext] Script already loaded');
    isScriptInjected = true;
    return Promise.resolve();
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    // Check for existing script tag
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      // Wait for it to load
      if (window.google?.maps) {
        isScriptInjected = true;
        resolve();
        return;
      }
      
      existingScript.addEventListener('load', () => {
        isScriptInjected = true;
        resolve();
      });
      existingScript.addEventListener('error', () => {
        reject(new Error('Failed to load existing Google Maps script'));
      });
      return;
    }

    console.log('🗺️ [GoogleMapsContext] Injecting script...');
    
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=drawing,geometry&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log('🗺️ [GoogleMapsContext] Script loaded successfully');
      isScriptInjected = true;
      resolve();
    };

    script.onerror = () => {
      console.error('🗺️ [GoogleMapsContext] Script failed to load');
      scriptLoadPromise = null;
      reject(new Error('Failed to load Google Maps script'));
    };

    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Reset script state for app resume scenarios
 */
function resetScriptState(): void {
  scriptLoadPromise = null;
  // Don't remove the script tag, just reset the promise
  // The script should still be functional if already loaded
}

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  // Initialize with cached key synchronously
  const [apiKey, setApiKey] = useState<string | null>(() => getCachedApiKey());
  const [isLoading, setIsLoading] = useState(!getCachedApiKey());
  const [error, setError] = useState<string | null>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
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
        console.log('🗺️ [GoogleMapsContext] API key received');
        cacheApiKey(data.apiKey);
        setApiKey(data.apiKey);
        setError(null);
      } else {
        throw new Error('Invalid API key in response');
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

  // Load script when API key is available
  useEffect(() => {
    if (!apiKey) return;

    loadGoogleMapsScript(apiKey)
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
    fetchApiKey();

    // Register for app resume
    const unsubscribe = onAppResume(() => {
      console.log('🗺️ [GoogleMapsContext] App resumed');
      
      // Check if Google Maps is still functional
      if (window.google?.maps && apiKey) {
        console.log('🗺️ [GoogleMapsContext] Google Maps still functional');
        setIsScriptLoaded(true);
      } else if (apiKey) {
        // Script may have been corrupted, reload
        console.log('🗺️ [GoogleMapsContext] Reloading script on resume');
        resetScriptState();
        loadGoogleMapsScript(apiKey)
          .then(() => setIsScriptLoaded(true))
          .catch(() => setIsScriptLoaded(false));
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [fetchApiKey, apiKey]);

  // Retry logic
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

  const retry = useCallback(() => {
    console.log('🗺️ [GoogleMapsContext] Manual retry triggered');
    clearApiKeyCache();
    resetScriptState();
    setApiKey(null);
    setError(null);
    setRetryCount(0);
    setIsLoading(true);
    setIsScriptLoaded(false);
    fetchingRef.current = false;
    
    setTimeout(() => fetchApiKey(true), 100);
  }, [fetchApiKey]);

  return (
    <GoogleMapsContext.Provider value={{
      apiKey,
      isLoading,
      error,
      isScriptLoaded,
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
 * Get the cached API key synchronously (for components that need it immediately)
 */
export function getGoogleMapsApiKey(): string | null {
  return getCachedApiKey();
}

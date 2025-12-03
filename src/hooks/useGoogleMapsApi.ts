import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLoadScript, Libraries } from '@react-google-maps/api';

// Define libraries with proper typing
const libraries: Libraries = ['drawing', 'geometry'];

// Global flag to prevent multiple API key fetches
let apiKeyFetched = false;
let globalApiKey: string | null = null;
let fetchInProgress = false;

// Cache configuration
const CACHE_KEY = 'google_maps_api_key';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function useGoogleMapsApi() {
  const [apiKey, setApiKey] = useState<string | null>(globalApiKey);
  const [error, setError] = useState<string | null>(null);
  const [isKeyLoading, setIsKeyLoading] = useState(!apiKeyFetched);
  const [retryCount, setRetryCount] = useState(0);
  const isMounted = useRef(true);

  useEffect(() => {
    // Cleanup function to track component mount status
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchApiKey = useCallback(async () => {
    // Skip if already fetching
    if (fetchInProgress) {
      console.log('🗺️ [GoogleMaps] Fetch already in progress, skipping...');
      return;
    }

    // Check cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { key, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION && key) {
          console.log('🗺️ [GoogleMaps] Using cached API key');
          globalApiKey = key;
          apiKeyFetched = true;
          setApiKey(key);
          setIsKeyLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('🗺️ [GoogleMaps] Failed to read cache:', err);
    }

    // Skip if already fetched globally
    if (apiKeyFetched && globalApiKey) {
      console.log('🗺️ [GoogleMaps] Using global API key');
      setApiKey(globalApiKey);
      setIsKeyLoading(false);
      return;
    }

    fetchInProgress = true;
    
    try {
      console.log('🗺️ [GoogleMaps] Fetching API key from edge function...');
      
      const response = await supabase.functions.invoke('google-maps-config');

      if (!isMounted.current) return;

      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch API key');
      }

      if (response.data?.apiKey) {
        console.log('🗺️ [GoogleMaps] API key received successfully');
        globalApiKey = response.data.apiKey;
        apiKeyFetched = true;
        setApiKey(response.data.apiKey);
        setError(null);
        
        // Cache the API key
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            key: response.data.apiKey,
            timestamp: Date.now()
          }));
        } catch (err) {
          console.warn('🗺️ [GoogleMaps] Failed to cache API key:', err);
        }
      } else {
        throw new Error('API key not found in response');
      }
    } catch (err) {
      if (!isMounted.current) return;
      console.error('🗺️ [GoogleMaps] Error fetching API key:', err);
      setError(err instanceof Error ? err.message : 'Failed to load Google Maps');
      
      // Clear bad cache
      localStorage.removeItem(CACHE_KEY);
      globalApiKey = null;
      apiKeyFetched = false;
    } finally {
      fetchInProgress = false;
      if (isMounted.current) {
        setIsKeyLoading(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!apiKeyFetched && !apiKey) {
      fetchApiKey();
    }
  }, [fetchApiKey, apiKey]);

  // Retry logic for failed fetches
  useEffect(() => {
    if (error && retryCount < 3 && !apiKey) {
      const timeout = setTimeout(() => {
        console.log(`🗺️ [GoogleMaps] Retrying API key fetch (attempt ${retryCount + 1}/3)...`);
        setError(null);
        setIsKeyLoading(true);
        apiKeyFetched = false;
        globalApiKey = null;
        fetchApiKey();
        setRetryCount(prev => prev + 1);
      }, 2000 * (retryCount + 1)); // Exponential backoff

      return () => clearTimeout(timeout);
    }
  }, [error, retryCount, apiKey, fetchApiKey]);

  // CRITICAL: Only load the script when we have a valid API key
  // This prevents the blank screen issue caused by loading with empty key
  const shouldLoadScript = !!apiKey && !isKeyLoading && !error;
  
  const { isLoaded: scriptLoaded, loadError: scriptError } = useLoadScript({
    googleMapsApiKey: shouldLoadScript ? apiKey : '',
    libraries,
    preventGoogleFontsLoading: true,
    id: 'google-map-script',
  });

  // Clear cache and retry on script load error
  useEffect(() => {
    if (scriptError && retryCount < 3) {
      console.error('🗺️ [GoogleMaps] Script load error, clearing cache:', scriptError);
      localStorage.removeItem(CACHE_KEY);
      globalApiKey = null;
      apiKeyFetched = false;
    }
  }, [scriptError, retryCount]);

  // Better error handling for loadError
  const actualLoadError = scriptError ? 
    (typeof scriptError === 'string' ? scriptError : 
     scriptError.message || 'Failed to load Google Maps') : null;

  // Only consider loaded if we have a key AND the script loaded successfully
  const isFullyLoaded = shouldLoadScript && scriptLoaded && !scriptError;

  console.log('🗺️ [GoogleMaps] Hook state:', { 
    hasApiKey: !!apiKey, 
    shouldLoadScript,
    scriptLoaded,
    isFullyLoaded,
    loadError: actualLoadError, 
    keyError: error, 
    isKeyLoading,
    retryCount
  });

  return {
    isLoaded: isFullyLoaded,
    loadError: actualLoadError || error,
    isLoading: isKeyLoading || (shouldLoadScript && !scriptLoaded && !scriptError),
    apiKey,
    retry: () => {
      setRetryCount(0);
      setError(null);
      setIsKeyLoading(true);
      apiKeyFetched = false;
      globalApiKey = null;
      localStorage.removeItem(CACHE_KEY);
      fetchApiKey();
    }
  };
}
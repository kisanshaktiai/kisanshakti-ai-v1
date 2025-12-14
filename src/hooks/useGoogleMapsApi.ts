import { useMemo } from 'react';
import { useJsApiLoader, Libraries } from '@react-google-maps/api';
import { useGoogleMaps, getGoogleMapsApiKey } from '@/contexts/GoogleMapsContext';

// Google Maps libraries to load
const GOOGLE_MAPS_LIBRARIES: Libraries = ['places', 'geometry', 'drawing'];

// Stable script ID to prevent duplicate loading
const SCRIPT_ID = 'google-maps-script-main';

// Placeholder key to prevent useJsApiLoader from erroring with empty string
const PLACEHOLDER_KEY = 'AWAITING_VALID_KEY';

/**
 * Check if Google Maps is fully functional
 */
function isGoogleMapsReady(): boolean {
  return !!(
    typeof window !== 'undefined' && 
    window.google?.maps?.Map &&
    window.google?.maps?.Marker &&
    window.google?.maps?.Polygon &&
    window.google?.maps?.SymbolPath
  );
}

/**
 * Primary hook for Google Maps API - consumes from GoogleMapsContext
 * This ensures single source of truth for API key and prevents duplicate fetching
 */
export function useGoogleMapsApi() {
  // Get API key from context (single source of truth)
  const { 
    apiKey, 
    isLoading: isKeyLoading, 
    error: keyError, 
    retry: retryKey,
    isReady: isKeyReady 
  } = useGoogleMaps();

  // Only load Google Maps script when we have a valid API key
  const shouldLoadScript = isKeyReady && apiKey && apiKey.length > 10;

  // Use the official loader from @react-google-maps/api
  // CRITICAL: Never pass empty string - use placeholder when no key
  const { isLoaded: scriptLoaded, loadError: scriptError } = useJsApiLoader({
    id: SCRIPT_ID,
    googleMapsApiKey: shouldLoadScript ? apiKey : PLACEHOLDER_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    // Prevent actual loading when using placeholder
    preventGoogleFontsLoading: !shouldLoadScript,
  });

  // Only consider truly loaded if we have valid key AND script loaded AND google is ready
  const isLoaded = useMemo(() => {
    if (!shouldLoadScript) return false;
    if (!scriptLoaded) return false;
    return isGoogleMapsReady();
  }, [shouldLoadScript, scriptLoaded]);

  // Combined loading state
  const isLoading = isKeyLoading || (!isLoaded && shouldLoadScript && !scriptError);

  // Combined error - prefer key error over script error (key error is more actionable)
  const loadError = useMemo(() => {
    if (keyError) return keyError;
    if (scriptError && shouldLoadScript) return scriptError.message;
    return null;
  }, [keyError, scriptError, shouldLoadScript]);

  // Retry function that retries the entire flow
  const retry = () => {
    console.log('🗺️ [useGoogleMapsApi] Retry triggered');
    retryKey();
  };

  return {
    isLoaded,
    loadError,
    isLoading,
    apiKey,
    retry,
  };
}

/**
 * Get the cached API key synchronously (for static maps, thumbnails)
 * Re-exported from context for backwards compatibility
 */
export { getGoogleMapsApiKey };

/**
 * Preload the Google Maps API key in the background
 * Call this early in the app lifecycle for faster map loading
 */
export function preloadGoogleMapsApiKey(): void {
  // The context handles preloading automatically when mounted
  console.log('🗺️ [useGoogleMapsApi] Preload triggered (handled by context)');
}

/**
 * Reset Google Maps state (for testing/debugging)
 */
export function resetGoogleMapsState(): void {
  console.log('🗺️ [useGoogleMapsApi] Reset triggered');
}

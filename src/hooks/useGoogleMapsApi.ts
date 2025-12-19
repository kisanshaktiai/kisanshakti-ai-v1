import { useGoogleMaps, getGoogleMapsApiKey } from '@/contexts/GoogleMapsContext';
import { useGoogleMapsScript } from '@/components/maps/GoogleMapsScriptProvider';

/**
 * Primary hook for Google Maps API
 * 
 * USAGE:
 * - For components that need the full Google Maps API (interactive maps),
 *   wrap them with <GoogleMapsScriptProvider> and use this hook.
 * 
 * - For components that only need the API key (static maps, thumbnails),
 *   use useGoogleMaps() directly from the context.
 * 
 * This hook combines:
 * - API key state from GoogleMapsContext
 * - Script loading state from GoogleMapsScriptProvider
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

  // Get script loading state from provider
  // This will return defaults if not inside GoogleMapsScriptProvider
  let scriptState = { isLoaded: false, loadError: null as string | null, isLoading: false };
  
  try {
    scriptState = useGoogleMapsScript();
  } catch {
    // Not inside GoogleMapsScriptProvider - that's okay for thumbnail components
  }

  // Combined loading state
  const isLoading = isKeyLoading || scriptState.isLoading;
  
  // Combined loaded state - both API key ready AND script loaded
  const isLoaded = isKeyReady && scriptState.isLoaded;
  
  // Combined error - prefer key error over script error
  const loadError = keyError || scriptState.loadError;

  // Retry function
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
  console.log('🗺️ [useGoogleMapsApi] Preload triggered (handled by context)');
}

/**
 * Reset Google Maps state (for testing/debugging)
 */
export function resetGoogleMapsState(): void {
  console.log('🗺️ [useGoogleMapsApi] Reset triggered');
}

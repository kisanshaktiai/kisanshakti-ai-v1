import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLoadScript, Libraries } from '@react-google-maps/api';

// Define libraries with proper typing
const libraries: Libraries = ['drawing', 'geometry'];

// Global flag to prevent multiple API key fetches
let apiKeyFetched = false;
let globalApiKey: string | null = null;

export function useGoogleMapsApi() {
  const [apiKey, setApiKey] = useState<string | null>(globalApiKey);
  const [error, setError] = useState<string | null>(null);
  const [isKeyLoading, setIsKeyLoading] = useState(!apiKeyFetched);
  const isMounted = useRef(true);

  useEffect(() => {
    // Cleanup function to track component mount status
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    async function fetchApiKey() {
      // Skip if already fetched
      if (apiKeyFetched && globalApiKey) {
        setApiKey(globalApiKey);
        setIsKeyLoading(false);
        return;
      }

      try {
        console.log('Fetching Google Maps API key...');
        
        // No authentication needed - function is public
        const response = await supabase.functions.invoke('google-maps-config');

        console.log('Edge function response:', response);

        if (!isMounted.current) return;

        if (response.error) {
          throw new Error(response.error.message || 'Failed to fetch API key');
        }

        if (response.data?.apiKey) {
          console.log('API key received successfully');
          globalApiKey = response.data.apiKey;
          apiKeyFetched = true;
          setApiKey(response.data.apiKey);
        } else {
          throw new Error('API key not found in response');
        }
      } catch (err) {
        if (!isMounted.current) return;
        console.error('Error fetching Google Maps API key:', err);
        setError(err instanceof Error ? err.message : 'Failed to load Google Maps');
      } finally {
        if (isMounted.current) {
          setIsKeyLoading(false);
        }
      }
    }

    if (!apiKeyFetched) {
      fetchApiKey();
    }
  }, []);

  // Only load the script once we have an API key
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
    preventGoogleFontsLoading: true,
    id: 'google-map-script',
  });

  // Better error handling for loadError
  const actualLoadError = loadError ? 
    (typeof loadError === 'string' ? loadError : 
     loadError.message || 'Failed to load Google Maps') : null;

  console.log('useGoogleMapsApi state:', { 
    apiKey: !!apiKey, 
    isLoaded, 
    loadError: actualLoadError, 
    error, 
    isKeyLoading 
  });

  return {
    isLoaded: !!(isLoaded && apiKey && !isKeyLoading),
    loadError: actualLoadError || error,
    isLoading: isKeyLoading || (!apiKey && !error),
    apiKey, // Return the API key for static map generation
  };
}
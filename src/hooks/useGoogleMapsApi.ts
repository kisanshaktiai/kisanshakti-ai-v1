import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLoadScript } from '@react-google-maps/api';

const libraries: any[] = ['drawing', 'geometry'];

export function useGoogleMapsApi() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchApiKey() {
      try {
        console.log('Fetching Google Maps API key...');
        
        // No authentication needed - function is public
        const response = await supabase.functions.invoke('google-maps-config');

        console.log('Edge function response:', response);

        if (response.error) {
          throw new Error(response.error.message || 'Failed to fetch API key');
        }

        if (response.data?.apiKey) {
          console.log('API key received successfully');
          setApiKey(response.data.apiKey);
        } else {
          throw new Error('API key not found in response');
        }
      } catch (err) {
        console.error('Error fetching Google Maps API key:', err);
        setError(err instanceof Error ? err.message : 'Failed to load Google Maps');
      } finally {
        setIsLoading(false);
      }
    }

    fetchApiKey();
  }, []);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  console.log('useGoogleMapsApi state:', { apiKey: !!apiKey, isLoaded, loadError, error, isLoading });

  return {
    isLoaded: isLoaded && !!apiKey,
    loadError: loadError || error,
    isLoading: isLoading || (!apiKey && !error),
  };
}
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLoadScript } from '@react-google-maps/api';

const libraries: any[] = ['drawing', 'geometry'];

export function useGoogleMapsApi() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchApiKey() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setError('User not authenticated');
          return;
        }

        const response = await supabase.functions.invoke('google-maps-config', {
          headers: {
            authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || 'Failed to fetch API key');
        }

        if (response.data?.apiKey) {
          setApiKey(response.data.apiKey);
        } else {
          throw new Error('API key not found in response');
        }
      } catch (err) {
        console.error('Error fetching Google Maps API key:', err);
        setError(err instanceof Error ? err.message : 'Failed to load Google Maps');
      }
    }

    fetchApiKey();
  }, []);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  return {
    isLoaded: isLoaded && !!apiKey,
    loadError: loadError || error,
  };
}
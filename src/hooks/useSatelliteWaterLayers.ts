import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SatelliteWaterLayer } from '@/types/satelliteWater';

export function useSatelliteWaterLayers(landId: string | undefined) {
  const [layers, setLayers] = useState<SatelliteWaterLayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!landId) {
      setLayers([]);
      return;
    }
    setLoading(true);
    setError(null);
    supabase
      .from('satellite_water_layers')
      .select('*')
      .eq('land_id', landId)
      .eq('status', 'observed')
      .order('acquisition_date', { ascending: false })
      .limit(120)
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          setLayers([]);
          return;
        }
        setLayers((data ?? []) as SatelliteWaterLayer[]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [landId]);

  return { layers, loading, error };
}

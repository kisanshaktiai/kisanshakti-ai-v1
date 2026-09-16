import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SatelliteWaterLayer } from '@/types/satelliteWater';

export interface SatelliteWaterLayerView extends SatelliteWaterLayer {
  signedImageUrl?: string | null;
}

export function useSatelliteWaterLayers(landId: string | undefined) {
  const [layers, setLayers] = useState<SatelliteWaterLayerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!landId) { setLayers([]); return; }
    setLoading(true); setError(null);
    supabase.from('satellite_water_layers').select('*').eq('land_id', landId)
      .eq('status', 'observed').order('acquisition_date', { ascending: false }).limit(120)
      .then(async ({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) { setError(queryError.message); setLayers([]); return; }
        const rows = (data ?? []) as SatelliteWaterLayer[];
        const signed = await Promise.all(rows.map(async (row) => {
          if (!row.image_path) return { ...row, signedImageUrl: null };
          const { data: signedData } = await supabase.storage.from('ndvi-thumbnails').createSignedUrl(row.image_path, 300);
          return { ...row, signedImageUrl: signedData?.signedUrl ?? null };
        }));
        if (!cancelled) setLayers(signed);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load water evidence'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [landId]);

  return { layers, loading, error };
}

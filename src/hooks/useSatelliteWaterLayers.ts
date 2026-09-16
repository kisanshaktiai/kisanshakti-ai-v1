import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SatelliteWaterLayer, SatelliteWaterLayerCode } from '@/types/satelliteWater';

export interface SatelliteWaterLayerView extends SatelliteWaterLayer {
  signedImageUrl?: string | null;
}

/**
 * Loads one evidence layer at a time. The UI only needs the latest observed
 * image for the selected layer, so do not mint dozens of signed URLs for
 * historical rows. The query is tenant-scoped by Supabase RLS.
 */
export function useSatelliteWaterLayers(
  landId: string | undefined,
  selectedCode: SatelliteWaterLayerCode = 'surface_water_trace',
) {
  const [layers, setLayers] = useState<SatelliteWaterLayerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!landId) {
      setLayers([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setLayers([]);

    supabase
      .from('satellite_water_layers')
      .select('*')
      .eq('land_id', landId)
      .eq('layer_code', selectedCode)
      .eq('status', 'observed')
      .order('acquisition_date', { ascending: false })
      .order('acquisition_time', { ascending: false })
      .limit(12)
      .then(async ({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          setLayers([]);
          return;
        }

        const rows = (data ?? []) as SatelliteWaterLayer[];
        if (rows.length === 0) {
          setLayers([]);
          return;
        }

        // Only the latest image is displayed. Older rows remain available for
        // future temporal analysis without causing an N+1 signed-URL storm.
        const latest = rows[0];
        let signedImageUrl: string | null = null;
        if (latest.image_path) {
          const { data: signedData, error: signError } = await supabase.storage
            .from('ndvi-thumbnails')
            .createSignedUrl(latest.image_path, 300);
          if (signError || !signedData?.signedUrl) {
            setError(signError?.message ?? 'Unable to open satellite evidence image');
          } else {
            signedImageUrl = signedData.signedUrl;
          }
        }

        if (!cancelled) {
          setLayers([{ ...latest, signedImageUrl }]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load satellite evidence');
          setLayers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [landId, selectedCode]);

  return { layers, loading, error };
}

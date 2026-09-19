import { useEffect, useState } from 'react';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import type { SatelliteWaterLayer, SatelliteWaterLayerCode } from '@/types/satelliteWater';

export interface SatelliteWaterLayerView extends SatelliteWaterLayer {
  signedImageUrl?: string | null;
}

/**
 * Loads one evidence layer at a time for the active land and tenant.
 * Only the latest observed image is signed; historical rows remain available
 * for temporal analysis without an N+1 signed-URL storm.
 */
export function useSatelliteWaterLayers(
  landId: string | undefined,
  selectedCode: SatelliteWaterLayerCode = 'surface_water_trace',
) {
  const { tenant } = useTenant();
  const { session } = useAuthStore();
  const tenantId = session?.tenantId ?? tenant?.id;
  const farmerId = session?.farmerId;
  const sessionToken = session?.token;
  const [layers, setLayers] = useState<SatelliteWaterLayerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!landId || !tenantId) {
      setLayers([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setLayers([]);

    // Farmer-scoped access needs the authenticated request context (farmer/tenant/session
    // headers); the plain client is refused by the row rules and returns nothing.
    const client = supabaseWithAuth(farmerId, tenantId);

    Promise.resolve(
      client
        .from('satellite_water_layers')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('land_id', landId)
        .eq('layer_code', selectedCode)
        .eq('status', 'observed')
        .order('acquisition_date', { ascending: false })
        .order('acquisition_time', { ascending: false })
        .limit(12)
    )
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

        const latest = rows[0];
        let signedImageUrl: string | null = null;
        if (latest.image_path) {
          const { data: signedData, error: signError } = await client.storage
            .from('ndvi-thumbnails')
            .createSignedUrl(latest.image_path, 300);
          if (signError || !signedData?.signedUrl) {
            setError(signError?.message ?? 'Unable to open satellite evidence image');
          } else {
            signedImageUrl = signedData.signedUrl;
          }
        }

        if (!cancelled) setLayers([{ ...latest, signedImageUrl }]);
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
  }, [landId, tenantId, farmerId, sessionToken, selectedCode]);

  return { layers, loading, error };
}

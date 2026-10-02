import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The colour ramp of each satellite water layer, read from
 * `satellite_layer_config` — the same rows the pipeline reads when it paints
 * the layer picture (water_layers._config). The map legend is drawn from
 * these stops so it always describes the picture the farmer is looking at.
 */
export interface SatelliteLayerRamp { layer_code: string; value_min: number | null; value_max: number | null; stops: Array<{ value: number; hex: string }> }

export function useSatelliteLayerConfig() {
  return useQuery({
    queryKey: ['satellite-layer-config'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Record<string, SatelliteLayerRamp>> => {
      const { data, error } = await supabase.from('satellite_layer_config')
        .select('layer_code, value_min, value_max, color_stops').eq('enabled', true);
      if (error) throw error;
      const out: Record<string, SatelliteLayerRamp> = {};
      for (const row of data || []) {
        const raw = Array.isArray(row.color_stops) ? (row.color_stops as Array<{ v?: unknown; c?: unknown }>) : [];
        const stops = raw.filter((s) => Number.isFinite(Number(s?.v)) && typeof s?.c === 'string')
          .map((s) => ({ value: Number(s.v), hex: String(s.c) })).sort((a, b) => a.value - b.value);
        out[row.layer_code] = { layer_code: row.layer_code, value_min: row.value_min === null ? null : Number(row.value_min), value_max: row.value_max === null ? null : Number(row.value_max), stops };
      }
      return out;
    },
  });
}

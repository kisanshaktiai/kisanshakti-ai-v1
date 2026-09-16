export type SatelliteWaterLayerCode = 'surface_water_trace' | 'canopy_moisture_signal';

export interface SatelliteWaterLayer {
  id: string;
  tenant_id: string;
  land_id: string;
  scene_id: string;
  acquisition_date: string;
  acquisition_time?: string | null;
  layer_code: SatelliteWaterLayerCode;
  value_mean?: number | null;
  value_median?: number | null;
  value_p10?: number | null;
  value_p90?: number | null;
  value_min?: number | null;
  value_max?: number | null;
  valid_fraction?: number | null;
  effective_pixel_count?: number | null;
  image_path?: string | null;
  image_metadata?: Record<string, unknown>;
  uncertainty_json?: Record<string, unknown>;
  evidence_json?: Record<string, unknown>;
  provenance_json?: Record<string, unknown>;
  status: 'observed' | 'unavailable' | 'invalid';
}

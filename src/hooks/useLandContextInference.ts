import { useMutation } from '@tanstack/react-query';
import { landsApi } from '@/services/landsApi';

export interface InferredFields {
  country?: string;
  country_code?: string;
  state?: string; state_id?: string;
  district?: string; district_id?: string;
  taluka?: string; taluka_id?: string;
  village?: string; village_id?: string;
  location_context?: any;
  elevation_meters?: number;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  current_crop?: string;
  current_crop_id?: string;
}

export interface CropRef {
  id: string;
  value: string;
  label: string;
  label_local?: string | null;
  label_hi?: string | null;
  label_mr?: string | null;
  duration_days?: number | null;
  season?: string | null;
  is_popular?: boolean | null;
}

export interface InferContextResult {
  fields: InferredFields;
  confidence: Record<string, number>;
  sources: Record<string, string>;
  crops: CropRef[];
}

/**
 * Calls lands-api?action=infer-context for AI auto-fill of a brand-new land.
 * Single-flight via React Query mutation (we only run it once per session).
 */
export function useLandContextInference() {
  return useMutation<InferContextResult, Error, { centroid: { lat: number; lng: number }; language?: string }>({
    mutationFn: async ({ centroid, language }) =>
      landsApi.inferLandContext(centroid, language),
  });
}

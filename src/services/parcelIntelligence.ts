/**
 * Parcel Intelligence contract.
 *
 * This is deliberately separate from NDVIDataComplete.ndvi_value:
 * ndvi_value is an observed satellite-derived measurement; estimated values
 * produced by future parcel reconstruction/ML must never overwrite it.
 */

export type IntelligenceStatus = 'observed' | 'estimated' | 'insufficient_evidence' | 'conflict';

export interface ParcelIntelligenceResult {
  version: string;
  status: IntelligenceStatus;
  observed_ndvi: number | null;
  estimated_crop_ndvi: number | null;
  estimated_ndvi_lower: number | null;
  estimated_ndvi_upper: number | null;
  local_context_ndvi: number | null;
  parcel_context_delta: number | null;
  context_buffer_m: number | null;
  context_target_area_m2: number | null;
  context_area_m2: number | null;
  spectral_unmixing_rmse: number | null;
  spatial_support: number | null;
  temporal_support: number | null;
  cross_sensor_agreement: number | null;
  water_stress_probability: number | null;
  biological_anomaly_probability: number | null;
  uncertainty: number | null;
  provenance: string[];
}

export function parseParcelIntelligence(metadata: unknown): ParcelIntelligenceResult | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const root = metadata as Record<string, unknown>;
  const raw = root.parcel_intelligence;
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;

  const n = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return v;
  };
  const s = (v: unknown): string | null => typeof v === 'string' ? v : null;
  const arr = (v: unknown): string[] => Array.isArray(v) ? v.filter((a): a is string => typeof a === 'string') : [];

  const status = s(x.status);
  const allowed: IntelligenceStatus[] = ['observed', 'estimated', 'insufficient_evidence', 'conflict'];
  if (!status || !allowed.includes(status as IntelligenceStatus)) return null;

  return {
    version: s(x.version) ?? 'unknown',
    status: status as IntelligenceStatus,
    observed_ndvi: n(x.observed_ndvi),
    estimated_crop_ndvi: n(x.estimated_crop_ndvi),
    estimated_ndvi_lower: n(x.estimated_ndvi_lower),
    estimated_ndvi_upper: n(x.estimated_ndvi_upper),
    local_context_ndvi: n(x.local_context_ndvi),
    parcel_context_delta: n(x.parcel_context_delta),
    context_buffer_m: n(x.context_buffer_m),
    context_target_area_m2: n(x.context_target_area_m2),
    context_area_m2: n(x.context_area_m2),
    spectral_unmixing_rmse: n(x.spectral_unmixing_rmse),
    spatial_support: n(x.spatial_support),
    temporal_support: n(x.temporal_support),
    cross_sensor_agreement: n(x.cross_sensor_agreement),
    water_stress_probability: n(x.water_stress_probability),
    biological_anomaly_probability: n(x.biological_anomaly_probability),
    uncertainty: n(x.uncertainty),
    provenance: arr(x.provenance),
  };
}

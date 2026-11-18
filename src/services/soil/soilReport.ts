import { getSessionToken, waitForHeaders } from '@/integrations/supabase/client';
import { landsApi } from '@/services/landsApi';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/integrations/supabase/types';
export type SoilRow = Database['public']['Tables']['soil_health']['Row'];
export type SoilReport = SoilRow & { lands: { name: string }; user_profiles: { full_name: string | null; farmer_code: string | null } | null };
export interface SoilModel {
  id: string; quality: 'complete' | 'partial'; retrieved_at: string; expires_at: string;
  source_version: string; algorithm_version: string; area_m2: number;
  sampling: { generated_points: number; distinct_sample_pixels: number; points: { x_m: number; y_m: number; order: number }[] };
  properties: Record<string, Record<string, {mean: number | null;unit: string;quality: string;coverage_fraction: number;distinct_pixels: number}>>;
  warnings: string[];
}
/** One governed rating row from soil_test_interpretation (bands in the row's unit). */
export interface SoilRating {
  parameter: string; extraction_method: string | null; unit: string | null;
  low_below: number | string | null; medium_low: number | string | null; medium_high: number | string | null; high_above: number | string | null;
  review_status: string | null; source: string | null; authority: string | null;
}
/** The three soil report types: physical lab test, satellite (soil-map) estimate, soil device. */
export type SoilSourceKey = 'lab' | 'satellite' | 'device';
export type SoilSources = Record<SoilSourceKey, SoilRow | null>;
export interface SoilState {
  land: {id: string;name: string}; legacy: SoilRow | null;
  /** Newest saved row per report type (lands-api ≥ 2026-11-18). */
  sources?: SoilSources;
  /** Governed rating bands (lands-api ≥ 2026-11-18); absent or empty = show values without verdicts. */
  ratings?: SoilRating[];
  profile: SoilReport['user_profiles']; model: SoilModel | null;
  job: {id: string;status: 'queued'|'running'|'complete'|'partial'|'failed';progress: number;error_code: string|null;updated_at: string}|null;
  engine_available: boolean; boundary_changed: boolean; source_changed: boolean;
  engine_status?: 'SOURCE_NOT_CONFIGURED'|'QUEUE_UNAVAILABLE'|'READY';
  dispatch_mode?: 'immediate'|'scheduled'|null;
}
export function soilNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number=Number(value); return Number.isFinite(number)?number:null;
}
/** Map a saved row's source to its report type; unknown sources map to none. */
export function soilSourceKey(source: unknown): SoilSourceKey | null {
  if (source === 'lab_test' || source === 'manual') return 'lab';
  if (source === 'soilgrid') return 'satellite';
  if (source === 'device' || source === 'sensor') return 'device';
  return null;
}
/** Report rows per type. An older lands-api sends only `legacy`; place it under its own type. */
export function resolveSoilSources(state: Pick<SoilState, 'legacy' | 'sources'> | null | undefined): SoilSources {
  if (state?.sources) return { lab: state.sources.lab ?? null, satellite: state.sources.satellite ?? null, device: state.sources.device ?? null };
  const out: SoilSources = { lab: null, satellite: null, device: null };
  const key = soilSourceKey(state?.legacy?.source);
  if (key && state?.legacy) out[key] = state.legacy;
  return out;
}
export async function loadSoilState(landId: string, farmerId: string, tenantId: string, start = false): Promise<SoilState> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(landId)) throw new Error('INVALID_LAND');
  await waitForHeaders();
  const token=getSessionToken();
  const sameSession=()=> {
    const s=useAuthStore.getState().session;
    return !!token && getSessionToken()===token && s?.farmerId===farmerId && s?.tenantId===tenantId;
  };
  if (!sameSession()) throw new Error('AUTH_REQUIRED');
  const state=await landsApi.soil(landId,start);
  if (!sameSession()) throw new Error('AUTH_REQUIRED');
  return state;
}

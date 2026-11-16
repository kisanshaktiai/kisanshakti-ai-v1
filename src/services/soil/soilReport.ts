import { getSessionToken, waitForHeaders } from '@/integrations/supabase/client';
import { landsApi } from '@/services/landsApi';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/integrations/supabase/types';
type SoilRow = Database['public']['Tables']['soil_health']['Row'];
export type SoilReport = SoilRow & { lands: { name: string }; user_profiles: { full_name: string | null; farmer_code: string | null } | null };
export interface SoilModel {
  id: string; quality: 'complete' | 'partial'; retrieved_at: string; expires_at: string;
  source_version: string; algorithm_version: string; area_m2: number;
  sampling: { generated_points: number; distinct_sample_pixels: number; points: { x_m: number; y_m: number; order: number }[] };
  properties: Record<string, Record<string, {mean: number | null;unit: string;quality: string;coverage_fraction: number;distinct_pixels: number}>>;
  warnings: string[];
}
export interface SoilState {
  land: {id: string;name: string}; legacy: SoilRow | null;
  profile: SoilReport['user_profiles']; model: SoilModel | null;
  job: {id: string;status: 'queued'|'running'|'complete'|'partial'|'failed';progress: number;error_code: string|null;updated_at: string}|null;
  engine_available: boolean; boundary_changed: boolean; source_changed: boolean;
}
export function soilNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number=Number(value); return Number.isFinite(number)?number:null;
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

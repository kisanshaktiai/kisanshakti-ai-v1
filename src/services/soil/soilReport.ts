import { getSessionToken, supabaseWithAuth, waitForHeaders } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type SoilRow = Database['public']['Tables']['soil_health']['Row'];
export type SoilReport = SoilRow & {
  lands: { name: string };
  user_profiles: { full_name: string | null; farmer_code: string | null } | null;
};

export function soilNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function loadSoilReport(landId: string, farmerId: string, tenantId: string): Promise<SoilReport | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(landId)) {
    throw new Error('INVALID_LAND');
  }
  await waitForHeaders();
  const token = getSessionToken();
  if (!token || !farmerId || !tenantId) throw new Error('AUTH_REQUIRED');
  const client = supabaseWithAuth(farmerId, tenantId);
  const checkSession = () => {
    if (getSessionToken() !== token) throw new Error('AUTH_REQUIRED');
  };
  // Explicit ownership filters supplement RLS; never infer ownership from a soil row.
  const land = await client.from('lands').select('id, name')
    .eq('id', landId).eq('farmer_id', farmerId).eq('tenant_id', tenantId).maybeSingle();
  checkSession();
  if (land.error) throw land.error;
  if (!land.data) throw new Error('LAND_UNAVAILABLE');
  const soil = await client.from('soil_health').select('*')
    .eq('land_id', landId).eq('farmer_id', farmerId).eq('tenant_id', tenantId)
    .order('test_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(1).maybeSingle();
  checkSession();
  if (soil.error) throw soil.error;
  if (!soil.data) return null;
  // Profile decoration must not prevent the report itself from loading.
  let profile: SoilReport['user_profiles'] = null;
  try {
    const result = await client.from('user_profiles').select('full_name, farmer_code')
      .eq('farmer_id', farmerId).eq('tenant_id', tenantId).limit(1).maybeSingle();
    if (!result.error) profile = result.data;
  } catch { /* report remains useful without optional profile details */ }
  checkSession();
  return { ...soil.data, lands: { name: land.data.name }, user_profiles: profile };
}

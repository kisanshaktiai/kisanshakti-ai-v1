import { useQuery } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';

/**
 * Pest/disease findings for one field.
 *
 * There is no satellite pest layer in this system: no pest imagery is produced or
 * stored anywhere. Pest evidence comes from ground/scan-driven alerts only, so this
 * hook reads the farmer's own alert records and never infers pests from satellite data.
 */
export interface LandPestFinding {
  id: string;
  title: string | null;
  message: string | null;
  priority: string | null;
  alert_type: string | null;
  created_at: string;
}

const PEST_ALERT_TYPES = ['pest', 'disease', 'pest_risk', 'disease_risk', 'pest_disease'];

export function useLandPestFindings(landId: string | null | undefined) {
  const { tenant } = useTenant();
  const { session } = useAuthStore();
  const tenantId = session?.tenantId ?? tenant?.id;
  const farmerId = session?.farmerId;
  const sessionToken = session?.token;

  return useQuery({
    queryKey: ['land-pest-findings', landId, tenantId, sessionToken],
    queryFn: async (): Promise<LandPestFinding[]> => {
      if (!landId || !tenantId) return [];
      const client = supabaseWithAuth(farmerId, tenantId);
      const { data, error } = await client
        .from('farmer_alerts')
        .select('id,title,message,priority,alert_type,created_at')
        .eq('land_id', landId)
        .in('alert_type', PEST_ALERT_TYPES)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as LandPestFinding[];
    },
    enabled: !!landId && !!tenantId && !!farmerId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

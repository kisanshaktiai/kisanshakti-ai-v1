/**
 * useAnchorClarification — surfaces the germination-anchor ambiguity flagged by
 * `resolve_germination_anchor` / `check_germination_gate`.
 *
 * When a transplanted land's recorded sowing date is on/after its transplant
 * date, the resolver returns
 *   anchor.needs_farmer_clarification = true
 *   anchor.reason = 'ambiguous_nursery_vs_transplant_dates'
 * Until the farmer supplies the nursery sowing date, the germination question
 * and any favorability display must be suppressed for that land.
 *
 * No dates are inferred on the client — every value comes from the RPC payload.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export const AMBIGUOUS_ANCHOR_REASON = 'ambiguous_nursery_vs_transplant_dates';

export interface AnchorClarification {
  land_id: string;
  land_name: string | null;
  reason: string;
  transplant_date: string | null;
  sowing_date: string | null;
}

function extractAnchor(gate: any): any | null {
  return gate?.signal?.anchor ?? gate?.anchor ?? null;
}

async function fetchClarifications(
  farmerId: string,
  tenantId: string,
): Promise<AnchorClarification[]> {
  const { data: lands } = await supabase
    .from('lands')
    .select('id, name, current_crop')
    .eq('farmer_id', farmerId)
    .eq('tenant_id', tenantId)
    .not('current_crop', 'is', null)
    .limit(20);

  if (!lands?.length) return [];

  const results = await Promise.all(
    lands.map(async (l: any) => {
      const { data, error } = await supabase.rpc('check_germination_gate', { p_land_id: l.id });
      if (error) return null;
      const anchor = extractAnchor(data as any);
      if (!anchor?.needs_farmer_clarification) return null;
      return {
        land_id: l.id,
        land_name: l.name ?? null,
        reason: String(anchor.reason ?? ''),
        transplant_date: anchor.transplant_date ?? null,
        sowing_date: anchor.sowing_date ?? null,
      } as AnchorClarification;
    }),
  );

  return results.filter((r): r is AnchorClarification => r !== null);
}

export function useAnchorClarification() {
  const { user, session } = useAuthStore();
  const farmerId = user?.id ?? session?.farmerId;
  const tenantId = user?.tenantId ?? session?.tenantId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['anchor-clarification', farmerId, tenantId],
    queryFn: () => fetchClarifications(farmerId!, tenantId!),
    enabled: !!farmerId && !!tenantId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  /** Writes the corrected nursery sowing date, then recomputes the gate. */
  const submitSowingDate = async (landId: string, sowingDate: string) => {
    const { error } = await supabase
      .from('lands')
      .update({ last_sowing_date: sowingDate })
      .eq('id', landId);
    if (error) throw error;
    const { error: rpcError } = await supabase.rpc('enforce_germination_gate', { p_land_id: landId });
    if (rpcError) throw rpcError;
    await qc.invalidateQueries({ queryKey: ['anchor-clarification', farmerId, tenantId] });
  };

  return {
    clarifications: query.data ?? [],
    isLoading: query.isLoading,
    submitSowingDate,
  };
}

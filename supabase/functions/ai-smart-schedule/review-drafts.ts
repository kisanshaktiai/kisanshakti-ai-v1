import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

/** Only input selections and evidence identifiers cross into the review ledger. */
export function reviewDraftPayload(input: {
  tenantId: string; farmerId: string; landId: string; cropName: string;
  language: string; selections: Record<string, unknown>; blockers: string[];
  sourceRefs: unknown[]; coverage: Record<string, unknown>;
}) {
  const keys = ['cropName', 'cropVariety', 'sowingDate', 'transplantDate', 'cultivationMethod',
    'cropCycle', 'isReadyMadePlant', 'farmingType', 'nurseryDays', 'backdatedConsent'];
  return {
    tenant_id: input.tenantId, farmer_id: input.farmerId, land_id: input.landId,
    crop_name: input.cropName, requested_language: input.language,
    crop_inputs: Object.fromEntries(keys.filter(k => k in input.selections).map(k => [k, input.selections[k]])),
    blockers: [...new Set(input.blockers)],
    source_refs: input.sourceRefs.map(ref => {
      const r = ref && typeof ref === 'object' ? ref as Record<string, unknown> : {};
      return { table: r.table ?? null, row_id: r.row_id ?? null };
    }),
    review_summary: { coverage: input.coverage },
  };
}

export async function listReviewDrafts(db: SupabaseClient, owner: {tenantId: string; farmerId: string}, landId: string) {
  const { data, error } = await db.from('crop_schedule_review_drafts').select('*')
    .eq('tenant_id', owner.tenantId).eq('farmer_id', owner.farmerId).eq('land_id', landId)
    .order('created_at', {ascending: false}).limit(20);
  if (error) throw error;
  return data ?? [];
}
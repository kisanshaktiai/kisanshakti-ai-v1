import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

/** Only input selections and evidence identifiers cross into the review ledger. */
export function reviewDraftPayload(input: {
  tenantId: string; farmerId: string; landId: string; cropName: string;
  language: string; selections: Record<string, unknown>; blockers: string[];
  sourceRefs: unknown[]; coverage: Record<string, unknown>;
}) {
  const keys = ['cropName', 'cropVariety', 'sowingDate', 'transplantDate', 'cultivationMethod',
    'cropCycle', 'isReadyMadePlant', 'farmingType', 'nurseryDays', 'backdatedConsent', 'localizedCropName'];
  // Preserve intercrop selections for a faithful recheck, but never persist
  // arbitrary user-supplied actions, fertilizer doses or pesticide recipes.
  const intercrops = Array.isArray(input.selections.intercrops)
    ? input.selections.intercrops.slice(0, 3).flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const x = item as Record<string, unknown>;
      const cropName = typeof x.cropName === "string" ? x.cropName.trim().slice(0, 120) : "";
      const areaPercent = Number(x.areaPercent);
      if (!cropName || !Number.isFinite(areaPercent) || areaPercent <= 0 || areaPercent > 100) return [];
      return [{
        cropName,
        localizedCropName: typeof x.localizedCropName === "string" ? x.localizedCropName.slice(0, 120) : "",
        cropVariety: typeof x.cropVariety === "string" ? x.cropVariety.slice(0, 120) : "",
        areaPercent,
      }];
    }) : [];
  const cropInputs = Object.fromEntries(keys.filter(k => k in input.selections).map(k => [k, input.selections[k]]));
  if (intercrops.length && intercrops.reduce((sum, x) => sum + x.areaPercent, 0) <= 100)
    cropInputs.intercrops = intercrops;
  return {
    tenant_id: input.tenantId, farmer_id: input.farmerId, land_id: input.landId,
    crop_name: input.cropName, requested_language: input.language,
    crop_inputs: cropInputs,
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
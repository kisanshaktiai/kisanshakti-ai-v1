import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

/** No executable schedule reads or writes belong in this endpoint. */
export async function readOwnedReviewDrafts(
  db: SupabaseClient,
  owner: { tenantId: string; farmerId: string },
  landId: string | null,
) {
  if (!landId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(landId))
    return { status: 400, body: { error: 'Valid landId required' } };
  const land = await db.from('lands').select('id')
    .eq('id', landId).eq('farmer_id', owner.farmerId).eq('tenant_id', owner.tenantId).maybeSingle();
  if (land.error) return { status: 503, body: { error: 'Land lookup unavailable' } };
  if (!land.data) return { status: 404, body: { error: 'Land not found' } };
  const drafts = await db.from('crop_schedule_review_drafts').select('*')
    .eq('tenant_id', owner.tenantId).eq('farmer_id', owner.farmerId).eq('land_id', landId)
    .order('created_at', { ascending: false }).limit(20);
  if (drafts.error) return { status: 503, body: { error: 'Review lookup unavailable' } };
  return { status: 200, body: { success: true, drafts: drafts.data ?? [] } };
}
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../supabase/functions/ai-agriculture-chat/photo/perception-engine.ts', () => ({ runPhotoDiagnosis: vi.fn() }));
import { handlePhotoAction } from '../../supabase/functions/ai-agriculture-chat/photo/photo-routes';

const landId = '30197c15-786e-4aff-acab-2d94b2ff8e59';
const request = { land_id: landId, client_capture_id: '40197c15-786e-4aff-acab-2d94b2ff8e59', purpose: 'chat_question', shot_role: 'symptom_closeup', content_sha256: 'a'.repeat(64), mime_type: 'image/jpeg', bytes: 1200, width_px: 100, height_px: 100, captured_at: '2026-10-29T16:20:00Z' };
function db(rows: Record<string, unknown>) {
  return { from: vi.fn((table: string) => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: rows[table] ?? null })) };
    return query;
  }) };
}
describe('photo land isolation', () => {
  it.each([
    ['farmer-b', 'tenant-a'],
    ['farmer-a', 'tenant-b'],
  ])('denies farmer/tenant mismatch %s %s before upload registration', async (farmer, tenant) => {
    const supabase = db({ lands: { id: landId, farmer_id: farmer, tenant_id: tenant } });
    const response = await handlePhotoAction('photo_begin_upload', request, { supabase, farmerId: 'farmer-a', tenantId: 'tenant-a', isServiceRole: false }, {});
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('LAND_NOT_OWNED');
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
  it('rejects a schedule from another land', async () => {
    const supabase = db({ lands: { id: landId, farmer_id: 'farmer-a', tenant_id: 'tenant-a' }, crop_schedules: { land_id: 'other-land', farmer_id: 'farmer-a', tenant_id: 'tenant-a' } });
    const response = await handlePhotoAction('photo_begin_upload', { ...request, schedule_id: request.client_capture_id }, { supabase, farmerId: 'farmer-a', tenantId: 'tenant-a', isServiceRole: false }, {});
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('PHOTO_CONTEXT_NOT_OWNED');
  });
  it('preserves trusted service access through the land ownership gate', async () => {
    const supabase = db({ lands: { id: landId, farmer_id: 'farmer-b', tenant_id: 'tenant-b' } });
    const response = await handlePhotoAction('photo_begin_upload', { ...request, schedule_id: request.client_capture_id }, { supabase, farmerId: 'service', tenantId: 'service', isServiceRole: true }, {});
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('PHOTO_CONTEXT_NOT_OWNED');
    expect(supabase.from).toHaveBeenCalledWith('crop_schedules');
  });
});
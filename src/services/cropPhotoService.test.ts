import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'farmer-a', tenantId: 'tenant-a' }, session: { farmerId: 'farmer-a', tenantId: 'tenant-a', isPinVerified: true }, isAuthenticated: true },
  pending: vi.fn(), queue: vi.fn(), invoke: vi.fn(), update: vi.fn(), token: 'session-a',
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => mocks.auth } }));
vi.mock('@/integrations/supabase/client', () => ({
  getSessionToken: () => mocks.token,
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock('@/services/localDB', () => ({ localDB: { getPendingPhotoCaptures: mocks.pending, queuePhotoCapture: mocks.queue, updatePhotoCapture: mocks.update } }));
import { getCapturePolicy, identifyGeneral, queueCapture, syncPendingPhotoCaptures, uploadQueued } from './cropPhotoService';
import type { PhotoCaptureQueueItem } from './localDB';

describe('shared photo identity isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isAuthenticated = true;
    mocks.auth.user.tenantId = 'tenant-a';
    mocks.auth.session.tenantId = 'tenant-a';
    mocks.token = 'session-a';
  });
  it('does not sync another tenant photo for the same farmer', async () => {
    mocks.pending.mockResolvedValue([{ id: 'photo-b', farmer_id: 'farmer-a', tenant_id: 'tenant-b', status: 'pending' }]);
    expect(await syncPendingPhotoCaptures({ farmerId: 'farmer-a', tenantId: 'tenant-a' }, 'en')).toBe(0);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects already uploaded evidence from a different tenant', async () => {
    await expect(uploadQueued({ farmer_id: 'farmer-a', tenant_id: 'tenant-b', status: 'uploaded', upload_id: 'other-upload' } as PhotoCaptureQueueItem)).rejects.toThrow('PHOTO_IDENTITY_MISMATCH');
  });
  it('does not queue photos after logout', async () => {
    mocks.auth.isAuthenticated = false;
    await expect(queueCapture({ captureId: 'photo-a', blob: new Blob(), previewUrl: '', source: 'gallery', capturedAt: new Date().toISOString() }, {
      id: { farmerId: 'farmer-a', tenantId: 'tenant-a' }, landId: 'land-a', purpose: 'chat_question', shotRole: 'symptom_closeup', location: null,
    })).rejects.toThrow('PHOTO_IDENTITY_MISMATCH');
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('discards a response when the session changes while awaiting it', async () => {
    mocks.invoke.mockImplementation(async () => {
      mocks.token = 'session-replaced';
      return { data: { image_policy: {}, max_photos_per_diagnosis: 3 }, error: null };
    });
    await expect(getCapturePolicy({ farmerId: 'farmer-a', tenantId: 'tenant-a' })).rejects.toThrow('PHOTO_SESSION_CHANGED');
  });
  it('preserves the General Scan setup code without consuming its response body', async () => {
    const context = new Response(JSON.stringify({ code: 'GENERAL_SCAN_NOT_CONFIGURED' }), { status: 503 });
    mocks.invoke.mockResolvedValue({ data: null, error: { context } });
    await expect(identifyGeneral({ id: { farmerId: 'farmer-a', tenantId: 'tenant-a' }, purpose: 'instascan', photos: [], language: 'mr' }))
      .rejects.toThrow('GENERAL_SCAN_NOT_CONFIGURED');
    expect(await context.json()).toEqual({ code: 'GENERAL_SCAN_NOT_CONFIGURED' });
  });
  it('does not relabel other registration failures as General Scan setup errors', async () => {
    const error = { context: new Response(JSON.stringify({ code: 'PHOTO_REGISTER_FAILED' }), { status: 500 }) };
    mocks.invoke.mockResolvedValue({ data: null, error });
    await expect(identifyGeneral({ id: { farmerId: 'farmer-a', tenantId: 'tenant-a' }, purpose: 'instascan', photos: [], language: 'en' }))
      .rejects.toBe(error);
  });
});
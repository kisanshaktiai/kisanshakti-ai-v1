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
import { getCapturePolicy, queueCapture, syncPendingPhotoCaptures, uploadQueued } from './cropPhotoService';
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
});
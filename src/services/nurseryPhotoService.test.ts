import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sign: vi.fn(), confirm: vi.fn(), upload: vi.fn(), removeNurseryPhoto: vi.fn(), get: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: () => ({ uploadToSignedUrl: mocks.upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/nursery-photos/${path}` } }) }) },
  },
}));
vi.mock('@/services/farmerAuthService', () => {
  class FarmerAuthError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
  return { FarmerAuthError, nurseryPhotoTransport: { sign: mocks.sign, confirm: mocks.confirm } };
});
vi.mock('@/services/providerWorkspaceService', () => {
  class ProviderError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
  return { ProviderError, providerWorkspaceService: { removeNurseryPhoto: mocks.removeNurseryPhoto, get: mocks.get } };
});
vi.mock('@/i18n/config', () => ({ default: { language: 'en', exists: () => true, t: (k: string) => k } }));

import { nurseryPhotoService, nurseryPhotoUrl, NurseryPhotoError, encodeNurseryPhoto } from './nurseryPhotoService';
import { FarmerAuthError } from '@/services/farmerAuthService';
import { useProviderStore } from '@/stores/providerStore';

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], 'plant.jpg', { type: 'image/jpeg' });

describe('nurseryPhotoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProviderStore.setState({ workspace: null });
    // jsdom has no image decoder: stand in for the encode step so the flow can be followed.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) { cb(new Blob(['x'], { type: 'image/jpeg' })); });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2000, height: 1000, close: () => {} })));
  });

  it('builds the public URL of a stored photo', () => {
    expect(nurseryPhotoUrl('t/a/p/x.jpg')).toBe('https://cdn.test/nursery-photos/t/a/p/x.jpg');
  });

  it('refuses a file that is not a picture before any network call', async () => {
    await expect(encodeNurseryPhoto(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'PHOTO_NOT_IMAGE' });
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('signs, uploads to the signed URL, confirms, and puts the new paths into the stored workspace', async () => {
    useProviderStore.setState({ workspace: { nursery_products: [{ id: 'np-1', photo_paths: [] }, { id: 'np-2', photo_paths: ['keep.jpg'] }] } as never });
    mocks.sign.mockResolvedValue({ bucket: 'nursery-photos', path: 't/a/np-1/abc.jpg', signedUrl: 'https://s/u', token: 'tok' });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.confirm.mockResolvedValue({ photoPaths: ['t/a/np-1/abc.jpg'] });
    const ws = await nurseryPhotoService.add('np-1', jpeg());
    expect(mocks.sign).toHaveBeenCalledWith('np-1');
    expect(mocks.upload).toHaveBeenCalledWith('t/a/np-1/abc.jpg', 'tok', expect.any(Blob), { contentType: 'image/jpeg', upsert: false });
    expect(mocks.confirm).toHaveBeenCalledWith('np-1', 't/a/np-1/abc.jpg');
    expect((ws as never as { nursery_products: { id: string; photo_paths: string[] }[] }).nursery_products).toEqual([
      { id: 'np-1', photo_paths: ['t/a/np-1/abc.jpg'] }, { id: 'np-2', photo_paths: ['keep.jpg'] },
    ]);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('does not confirm when the upload failed, and names the failure', async () => {
    mocks.sign.mockResolvedValue({ bucket: 'nursery-photos', path: 'p', signedUrl: 'u', token: 't' });
    mocks.upload.mockResolvedValue({ error: { message: 'boom' } });
    await expect(nurseryPhotoService.add('np-1', jpeg())).rejects.toMatchObject({ code: 'PHOTO_UPLOAD_FAILED' });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('maps the router\'s refusals to provider error codes', async () => {
    for (const [serverCode, code] of [['photo_limit', 'NURSERY_PHOTO_LIMIT'], ['product_not_found', 'NURSERY_PRODUCT_NOT_FOUND'], ['feature_disabled', 'PROVIDER_FEATURE_DISABLED'], ['role_not_active', 'PROVIDER_ROLE_NOT_ACTIVE']]) {
      mocks.sign.mockRejectedValue(new FarmerAuthError(serverCode, serverCode));
      const error = await nurseryPhotoService.add('np-1', jpeg()).catch((e) => e);
      expect(error).toBeInstanceOf(NurseryPhotoError);
      expect(error.code).toBe(code);
    }
  });

  it('removes through the workspace function', async () => {
    mocks.removeNurseryPhoto.mockResolvedValue({ ok: true });
    await nurseryPhotoService.remove('np-1', 'p');
    expect(mocks.removeNurseryPhoto).toHaveBeenCalledWith('np-1', 'p');
  });
});

import { supabase } from '@/integrations/supabase/client';
import { nurseryPhotoTransport, FarmerAuthError } from '@/services/farmerAuthService';
import { providerWorkspaceService, ProviderError, type ProviderWorkspace } from '@/services/providerWorkspaceService';
import { useProviderStore } from '@/stores/providerStore';

/**
 * Photos of a nursery's plants.
 *
 * One photo goes: pick a file on the phone → one resize and one JPEG encode
 * here (small phones, slow networks) → the farmer-auth router signs one upload
 * for the provider's own product → the bytes go straight to that signed URL →
 * the router confirms the object is there and registers the path. The browser
 * never holds a key to the bucket. Reading needs no key: the bucket is public.
 */

export const NURSERY_PHOTO_BUCKET = 'nursery-photos';
/** Long edge of a stored photo, in pixels. */
const LONG_EDGE_PX = 1280;
const JPEG_QUALITY = 0.82;
/** Files larger than this are refused before any work (the bucket allows 2 MB after encoding). */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class NurseryPhotoError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** Public URL of a stored photo. */
export function nurseryPhotoUrl(path: string): string {
  return supabase.storage.from(NURSERY_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch { /* fall through to the image element */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new NurseryPhotoError('PHOTO_UNREADABLE'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One resize to the long edge and one JPEG encode. */
export async function encodeNurseryPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new NurseryPhotoError('PHOTO_NOT_IMAGE');
  if (file.size > MAX_INPUT_BYTES) throw new NurseryPhotoError('PHOTO_TOO_LARGE');
  const source = await loadBitmap(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!(width > 0 && height > 0)) throw new NurseryPhotoError('PHOTO_UNREADABLE');
  const scale = Math.min(1, LONG_EDGE_PX / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new NurseryPhotoError('PHOTO_UNREADABLE');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new NurseryPhotoError('PHOTO_UNREADABLE'))), 'image/jpeg', JPEG_QUALITY);
  });
}

function toPhotoError(error: unknown): NurseryPhotoError {
  if (error instanceof NurseryPhotoError) return error;
  if (error instanceof FarmerAuthError) {
    const map: Record<string, string> = {
      photo_limit: 'NURSERY_PHOTO_LIMIT',
      product_not_found: 'NURSERY_PRODUCT_NOT_FOUND',
      feature_disabled: 'PROVIDER_FEATURE_DISABLED',
      role_not_active: 'PROVIDER_ROLE_NOT_ACTIVE',
      session_required: 'NOT_AUTHENTICATED',
      object_missing: 'PHOTO_UPLOAD_FAILED',
      transport_unavailable: 'PROVIDER_UNAVAILABLE',
    };
    return new NurseryPhotoError(map[error.code] ?? 'PHOTO_UPLOAD_FAILED');
  }
  if (error instanceof ProviderError) return new NurseryPhotoError(error.code);
  return new NurseryPhotoError('PHOTO_UPLOAD_FAILED');
}

export const nurseryPhotoService = {
  /**
   * Stores one photo of the provider's own plant and returns the workspace
   * with the new path in place. Throws NurseryPhotoError with a code from
   * provider.errors.*.
   */
  async add(productId: string, file: File): Promise<ProviderWorkspace> {
    try {
      const jpeg = await encodeNurseryPhoto(file);
      const signed = await nurseryPhotoTransport.sign(productId);
      const { error } = await supabase.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, jpeg, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new NurseryPhotoError('PHOTO_UPLOAD_FAILED');
      const { photoPaths } = await nurseryPhotoTransport.confirm(productId, signed.path);
      // The workspace in the store gets the new paths without another round trip.
      const store = useProviderStore.getState();
      const current = store.workspace;
      if (current) {
        const next: ProviderWorkspace = {
          ...current,
          nursery_products: current.nursery_products.map((p) => (p.id === productId ? { ...p, photo_paths: photoPaths } : p)),
        };
        store.setWorkspace(next);
        return next;
      }
      return providerWorkspaceService.get();
    } catch (error) {
      throw toPhotoError(error);
    }
  },

  async remove(productId: string, path: string): Promise<ProviderWorkspace> {
    try {
      return await providerWorkspaceService.removeNurseryPhoto(productId, path);
    } catch (error) {
      throw toPhotoError(error);
    }
  },
};

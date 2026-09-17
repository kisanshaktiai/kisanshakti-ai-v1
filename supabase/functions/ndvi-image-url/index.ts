import { guardCorsHeaders, guardTenantAccess } from '../_shared/tenantAccessGuard.ts';

const BUCKET = 'ndvi-thumbnails';
const SIGNED_URL_TTL_SECONDS = 3600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...guardCorsHeaders,
      'Cache-Control': 'private, no-store',
      ...extraHeaders,
    },
  });
}

function normalizeStoragePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim().replace(/^\/+/, '');
  if (!path || path.includes('..') || path.includes('\\') || path.startsWith('http://') || path.startsWith('https://')) {
    return null;
  }
  return path;
}

function isOwnedNdviPath(path: string, tenantId: string, landId: string): boolean {
  const parts = path.split('/');
  if (parts.length !== 3) return false;
  const [pathTenantId, pathLandId, filename] = parts;
  if (pathTenantId.toLowerCase() !== tenantId.toLowerCase()) return false;
  if (pathLandId.toLowerCase() !== landId.toLowerCase()) return false;
  return /^\d{4}-\d{2}-\d{2}_[A-Za-z0-9._-]+\.png$/i.test(filename);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: guardCorsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const guard = await guardTenantAccess(req);
  if (guard instanceof Response) return guard;

  try {
    const body = await req.json().catch(() => null);
    const landId = typeof body?.land_id === 'string' ? body.land_id.trim() : '';
    const sceneId = typeof body?.scene_id === 'string' ? body.scene_id.trim() : '';

    if (!UUID_RE.test(landId)) {
      return json({ error: 'land_id must be a valid UUID', code: 'INVALID_LAND_ID' }, 400);
    }
    if (!sceneId || sceneId.length > 255 || /[\r\n]/.test(sceneId)) {
      return json({ error: 'scene_id is invalid', code: 'INVALID_SCENE_ID' }, 400);
    }

    // The client never supplies an arbitrary Storage path. We resolve it from
    // the tenant-scoped observation row, then validate the resulting path.
    const { data: row, error: queryError } = await guard.supabase
      .from('ndvi_data')
      .select('tenant_id, land_id, date, acquisition_date, scene_id, image_url')
      .eq('tenant_id', guard.tenantId)
      .eq('land_id', landId)
      .eq('scene_id', sceneId)
      .not('image_url', 'is', null)
      .limit(1)
      .maybeSingle();

    if (queryError) {
      console.error('[ndvi-image-url] observation lookup failed:', queryError.message);
      return json({ error: 'Unable to resolve NDVI image', code: 'OBSERVATION_LOOKUP_FAILED' }, 503);
    }

    if (!row?.image_url) {
      return json({ error: 'NDVI image is not available for this observation', code: 'NDVI_IMAGE_NOT_AVAILABLE' }, 404);
    }

    const imagePath = normalizeStoragePath(row.image_url);
    if (!imagePath || !isOwnedNdviPath(imagePath, guard.tenantId, landId)) {
      console.error('[ndvi-image-url] rejected unsafe/non-canonical image path', {
        tenantId: guard.tenantId,
        landId,
        sceneId,
      });
      return json({ error: 'NDVI image path is invalid', code: 'INVALID_NDVI_IMAGE_PATH' }, 500);
    }

    const { data: signed, error: signError } = await guard.supabase.storage
      .from(BUCKET)
      .createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      console.error('[ndvi-image-url] signed URL creation failed:', signError?.message);
      return json({ error: 'NDVI image could not be served', code: 'NDVI_IMAGE_SIGNING_FAILED' }, 503);
    }

    const now = Date.now();
    const expiresAt = new Date(now + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    return json({
      ok: true,
      url: signed.signedUrl,
      bucket: BUCKET,
      date: row.date ?? row.acquisition_date ?? null,
      scene_id: row.scene_id,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('[ndvi-image-url] unexpected error:', error);
    return json({ error: 'NDVI image service failed', code: 'NDVI_IMAGE_SERVICE_FAILED' }, 500);
  }
});

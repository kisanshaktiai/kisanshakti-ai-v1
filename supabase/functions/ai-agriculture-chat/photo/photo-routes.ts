/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHOTO ROUTES — body.action handlers for the central capture tool
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: supabase/functions/ai-agriculture-chat/photo/photo-routes.ts
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-09-23 — 'photo_capture_policy' returns the configured image policy so
 *   the app resizes/encodes with server config, not numbers baked into code.
 * 2026-09-23 — NEW. 'photo_begin_upload' registers the photo as evidence and
 *   returns a signed upload URL for the private crop-growth-media bucket;
 *   'diagnose_photo' runs the perception engine. Both run after index.ts's
 *   guardTenantAccess (verified identity) and use its service-role client:
 *   the client never writes storage or evidence tables itself.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { runPhotoDiagnosis } from './perception-engine.ts';
import type { BeginPhotoUploadRequest, BeginPhotoUploadResponse, DiagnosePhotoRequest } from './diagnosis-contract.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface PhotoRouteContext {
  supabase: Db;              // service-role client from guardTenantAccess
  farmerId: string;
  isServiceRole: boolean;
}

const BUCKET = 'crop-growth-media';
const PURPOSES = ['chat_question', 'instascan', 'schedule_task', 'growth_tracking', 'land_card'];
const SHOT_ROLES = ['symptom_closeup', 'whole_plant', 'field_view', 'other'];
const SUBJECTS = ['crop', 'soil', 'land_preparation', 'irrigation', 'pest', 'fertilizer', 'harvest', 'general'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{64}$/i;

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Great-circle distance in metres. */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

async function loadOwnedLand(ctx: PhotoRouteContext, landId: string) {
  const { data: land } = await ctx.supabase.from('lands')
    .select('id, tenant_id, farmer_id, center_lat, center_lon')
    .eq('id', landId).maybeSingle();
  if (!land) return null;
  if (!ctx.isServiceRole && land.farmer_id !== ctx.farmerId) return null;
  return land;
}

async function signUpload(sb: Db, path: string) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return null;
  return { signed_url: data.signedUrl as string, token: data.token as string, storage_path: path, bucket: BUCKET };
}

async function beginUpload(body: BeginPhotoUploadRequest, ctx: PhotoRouteContext, cors: Record<string, string>) {
  if (!UUID_RE.test(body.land_id ?? '') || !UUID_RE.test(body.client_capture_id ?? '')
      || !PURPOSES.includes(body.purpose) || !SHOT_ROLES.includes(body.shot_role)
      || !SHA_RE.test(body.content_sha256 ?? '') || body.mime_type !== 'image/jpeg'
      || !(body.bytes > 0) || !(body.width_px > 0) || !(body.height_px > 0) || !body.captured_at
      || (body.subject_type && !SUBJECTS.includes(body.subject_type))
      || (body.task_id && !UUID_RE.test(body.task_id)) || (body.schedule_id && !UUID_RE.test(body.schedule_id))) {
    return json({ error: 'Invalid photo upload request', code: 'PHOTO_REQUEST_INVALID' }, 400, cors);
  }
  const land = await loadOwnedLand(ctx, body.land_id);
  if (!land) return json({ error: 'Land not found for this farmer', code: 'LAND_NOT_OWNED' }, 403, cors);

  const sb = ctx.supabase;
  const sha = body.content_sha256.toLowerCase();

  // Idempotent retry from the offline queue, or the same bytes already stored on this land.
  const { data: existing } = await sb.from('crop_growth_uploads')
    .select('id, storage_path, object_confirmed, client_capture_id')
    .eq('land_id', land.id)
    .or(`client_capture_id.eq.${body.client_capture_id},content_sha256.eq.${sha}`)
    .limit(1).maybeSingle();
  if (existing) {
    const response: BeginPhotoUploadResponse = {
      upload_id: existing.id,
      deduplicated: existing.client_capture_id !== body.client_capture_id,
    };
    if (!existing.object_confirmed && existing.storage_path) {
      const up = await signUpload(sb, existing.storage_path);
      if (up) response.upload = up;
    }
    return json(response, 200, cors);
  }

  const id = crypto.randomUUID();
  const captured = new Date(body.captured_at);
  if (Number.isNaN(captured.getTime())) return json({ error: 'Invalid captured_at', code: 'PHOTO_REQUEST_INVALID' }, 400, cors);
  const yyyy = String(captured.getUTCFullYear());
  const mm = String(captured.getUTCMonth() + 1).padStart(2, '0');
  const storagePath = `${land.tenant_id}/${land.farmer_id}/${land.id}/${yyyy}/${mm}/${id}/raw.jpg`;

  // Distance to the land is computed here from the land's own centre, not sent by the client.
  let distance: number | null = null;
  let level: 'at_land' | 'nearby' | 'far' | 'unknown' = 'unknown';
  const loc = body.location;
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
      && land.center_lat != null && land.center_lon != null) {
    const { data: pol } = await sb.from('system_config').select('config_value').eq('config_key', 'photo_diagnosis_policy').maybeSingle();
    const levels = pol?.config_value?.location_levels_m;
    distance = Math.round(haversineM(loc.lat, loc.lon, Number(land.center_lat), Number(land.center_lon)));
    if (levels && typeof levels.at_land === 'number' && typeof levels.nearby === 'number') {
      level = distance <= levels.at_land ? 'at_land' : distance <= levels.nearby ? 'nearby' : 'far';
    }
  }

  const { error: insErr } = await sb.from('crop_growth_uploads').insert({
    id,
    land_id: land.id,
    farmer_id: land.farmer_id,   // the DB trigger re-derives identity from the land
    tenant_id: land.tenant_id,
    file_type: 'image',
    upload_type: body.subject_type ?? 'crop',
    schedule_id: body.schedule_id ?? null,
    task_id: body.task_id ?? null,
    storage_bucket: BUCKET,
    storage_path: storagePath,
    content_sha256: sha,
    mime_type: 'image/jpeg',
    width_px: Math.round(body.width_px),
    height_px: Math.round(body.height_px),
    bytes: Math.round(body.bytes),
    original_width_px: Math.round(body.original_width_px || body.width_px),
    original_height_px: Math.round(body.original_height_px || body.height_px),
    processing: body.processing,
    client_quality: body.client_quality ?? null,
    captured_at: captured.toISOString(),
    client_capture_id: body.client_capture_id,
    created_offline: !!body.created_offline,
    device: body.device ?? null,
    capture_purpose: body.purpose,
    capture_location: loc ? { lat: loc.lat, lon: loc.lon, accuracy_m: loc.accuracy_m ?? null } : null,
    distance_from_land_meters: distance,
    location_level: level,
    location_validated: level === 'at_land',
  });
  if (insErr) {
    console.error('[PHOTO_ROUTES] evidence insert failed:', insErr.message);
    return json({ error: 'Could not register photo', code: 'PHOTO_REGISTER_FAILED' }, 500, cors);
  }

  const up = await signUpload(sb, storagePath);
  if (!up) return json({ error: 'Could not create upload URL', code: 'PHOTO_SIGN_FAILED' }, 500, cors);
  const response: BeginPhotoUploadResponse = { upload_id: id, upload: up, deduplicated: false };
  return json(response, 200, cors);
}

async function diagnose(body: DiagnosePhotoRequest, ctx: PhotoRouteContext, cors: Record<string, string>) {
  if (!UUID_RE.test(body.land_id ?? '') || !PURPOSES.includes(body.purpose) || !Array.isArray(body.photos)
      || body.photos.some((p) => !UUID_RE.test(p?.upload_id ?? '') || !SHOT_ROLES.includes(p?.shot_role))
      || (body.task_id && !UUID_RE.test(body.task_id)) || (body.session_id && !UUID_RE.test(body.session_id))) {
    return json({ error: 'Invalid diagnosis request', code: 'PHOTO_REQUEST_INVALID' }, 400, cors);
  }
  const land = await loadOwnedLand(ctx, body.land_id);
  if (!land) return json({ error: 'Land not found for this farmer', code: 'LAND_NOT_OWNED' }, 403, cors);

  const result = await runPhotoDiagnosis(ctx.supabase, {
    farmerId: land.farmer_id,
    landId: land.id,
    purpose: body.purpose,
    photos: body.photos,
    taskId: body.task_id ?? null,
    sessionId: body.session_id ?? null,
    language: body.language || 'und',
    farmerText: body.farmer_text ?? null,
  });
  return json(result, result.status === 'failed' && !result.diagnosis_id ? 400 : 200, cors);
}

async function capturePolicy(ctx: PhotoRouteContext, cors: Record<string, string>) {
  const { data } = await ctx.supabase.from('system_config').select('config_value')
    .eq('config_key', 'photo_diagnosis_policy').maybeSingle();
  const v = data?.config_value;
  const ip = v?.image_policy;
  if (!ip || typeof ip.jpeg_quality !== 'number' || !ip.shot_role_max_px || typeof v.max_photos_per_diagnosis !== 'number') {
    return json({ error: 'Photo policy not configured', code: 'PHOTO_POLICY_MISSING' }, 503, cors);
  }
  return json({
    image_policy: { status: ip.status ?? null, shot_role_max_px: ip.shot_role_max_px, jpeg_quality: ip.jpeg_quality },
    max_photos_per_diagnosis: v.max_photos_per_diagnosis,
  }, 200, cors);
}

export async function handlePhotoAction(
  action: string,
  body: any,
  ctx: PhotoRouteContext,
  cors: Record<string, string>,
): Promise<Response> {
  if (action === 'photo_capture_policy') return capturePolicy(ctx, cors);
  if (action === 'photo_begin_upload') return beginUpload(body as BeginPhotoUploadRequest, ctx, cors);
  if (action === 'diagnose_photo') return diagnose(body as DiagnosePhotoRequest, ctx, cors);
  return json({ error: 'Unknown photo action', code: 'PHOTO_ACTION_UNKNOWN' }, 400, cors);
}

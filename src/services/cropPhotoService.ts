/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP PHOTO SERVICE — the one photo pipeline every screen uses
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/services/cropPhotoService.ts
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-11-23d — General Scan v1.3 types: chemical options carry product class
 *   (type) and application method; spray roles nutrient → fertilizer /
 *   micronutrient, + biopesticide, biostimulant.
 * 2026-11-23 09:27 UTC — Preserve General Scan setup errors for localized capture recovery.
 * 2026-11-23b — General Scan v1.2 types: root_cause, spray_plan (label doses in
 *   the label's own unit; the app's src/lib/sprayPlan.ts does the arithmetic),
 *   spray_defaults from config; farmer_card loses life_cycle/spread (moved to
 *   root_cause).
 * 2026-11-23 — GeneralIdentification gains `management` (prevention, biological
 *   agents, chemical active ingredients with MoA group — no brands, no doses)
 *   and the server's `language_check`.
 * 2026-11-22 — General Scan (land-less identification): uploadGeneralPhoto()
 *   and identifyGeneral() send scan_scope 'general' on the same photo routes.
 *   Online only (no offline queue, so localDB is unchanged); the land queue,
 *   upload, diagnosis and brain functions are untouched.
 * 2026-10-29 — Bind queued photos and policy cache to the active farmer/tenant session.
 * 2026-09-23 — v2 REWRITE (photo evidence store v2). Capture → offline queue →
 *   one resize + ONE JPEG encode with the server's image policy → SHA-256 →
 *   'photo_begin_upload' (evidence row + signed URL, private bucket) → upload →
 *   'diagnose_photo' (perception only) → chat turn with photoDiagnosisId, where
 *   the Decision Brain decides the answer. No size target, no quality loop,
 *   no second compression, no public URLs. The original is never deleted.
 * 2026-08-30 — v1 (single upload/analysis path for chat and schedule).
 *
 * Language-agnostic: this file holds no farmer-facing text; screens render
 * codes (retake reasons, statuses) through i18n keys.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase, getSessionToken } from '@/integrations/supabase/client';
import { calculateQualityMetrics, type ImageQualityMetrics } from '@/utils/imagePreprocessing';
import { localDB, type PhotoCaptureQueueItem } from '@/services/localDB';
import { useAuthStore } from '@/stores/authStore';

export type CapturePurpose = PhotoCaptureQueueItem['purpose'];
export type ShotRole = PhotoCaptureQueueItem['shot_role'];
export type CaptureSource = PhotoCaptureQueueItem['source'];
export type CropPhotoUploadType =
  | 'crop' | 'soil' | 'land_preparation' | 'irrigation' | 'pest' | 'fertilizer' | 'harvest' | 'general';
export type RetakeReason =
  | 'blurred' | 'too_dark' | 'overexposed' | 'not_a_plant' | 'wrong_plant_part' | 'too_far' | 'obstructed';
export type DiagnosisStatus =
  | 'queued' | 'processing' | 'completed' | 'needs_follow_up'
  | 'retake_requested' | 'crop_mismatch' | 'crop_unresolved' | 'failed';

export const PHOTO_PIPELINE_VERSION = 'photo-pipeline@1.0.0';
const CHAT_FUNCTION = 'ai-agriculture-chat';

export interface PhotoIdentity {
  farmerId: string;
  tenantId: string;
}

export interface CapturedPhoto {
  captureId: string;       // client_capture_id (idempotency key)
  blob: Blob;              // the camera's own image — never re-encoded twice
  previewUrl: string;      // object URL for the preview
  source: CaptureSource;
  capturedAt: string;
}

export interface ImagePolicy {
  shot_role_max_px: Record<string, number>;
  jpeg_quality: number;
  status: string | null;
}

/** The chat function's reply for a photo turn (same payload the chat renders). */
export interface BrainAnswer {
  response?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface DiagnoseResult {
  diagnosis_id: string | null;
  status: DiagnosisStatus;
  retake?: { reason_code: RetakeReason | null; photo_index: number | null };
  crop_mismatch?: { registered_crop_code: string; seen_crop_code: string | null };
  follow_up?: unknown;
  error_code?: string;
}

// ── Function calls (same header convention as EnhancedAIChatInterface) ─────

function sessionToken(): string {
  return getSessionToken() || localStorage.getItem('app_session_token') || '';
}

async function invokeChat<T>(body: Record<string, unknown>, id: PhotoIdentity): Promise<T> {
  assertPhotoIdentity(id);
  const token = sessionToken();
  const { data, error } = await supabase.functions.invoke(CHAT_FUNCTION, {
    body,
    headers: {
      'x-tenant-id': id.tenantId,
      'x-farmer-id': id.farmerId,
      'x-session-token': token,
    },
  });
  assertPhotoIdentity(id);
  if (sessionToken() !== token) throw new Error('PHOTO_SESSION_CHANGED');
  if (error) {
    // FunctionsHttpError keeps the JSON error code in its Response context.
    // Read a clone so diagnostics and other consumers retain the original body.
    if (error.context instanceof Response) {
      const payload = await error.context.clone().json().catch(() => null);
      if (payload?.code === 'GENERAL_SCAN_NOT_CONFIGURED') {
        throw new Error('GENERAL_SCAN_NOT_CONFIGURED');
      }
    }
    throw error;
  }
  return data as T;
}

/** Local isolation guard; the server remains the authorization authority. */
function assertPhotoIdentity(id: PhotoIdentity): void {
  const { user, session, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user || !session?.isPinVerified ||
      user.id !== id.farmerId || user.tenantId !== id.tenantId ||
      session.farmerId !== id.farmerId || session.tenantId !== id.tenantId) {
    throw new Error('PHOTO_IDENTITY_MISMATCH');
  }
}

let cachedPolicy: { key: string; value: { policy: ImagePolicy; maxPhotos: number } } | null = null;

/** The image policy lives in system_config; fetched once per app session. */
export async function getCapturePolicy(id: PhotoIdentity): Promise<{ policy: ImagePolicy; maxPhotos: number }> {
  assertPhotoIdentity(id);
  const key = `${id.tenantId}:${id.farmerId}:${sessionToken()}`;
  if (cachedPolicy?.key === key) return cachedPolicy.value;
  const res = await invokeChat<{ image_policy: ImagePolicy; max_photos_per_diagnosis: number }>(
    { action: 'photo_capture_policy' }, id);
  const value = { policy: res.image_policy, maxPhotos: res.max_photos_per_diagnosis };
  cachedPolicy = { key, value };
  return value;
}

// ── Capture ─────────────────────────────────────────────────────────────────

function newCaptured(blob: Blob, source: CaptureSource): CapturedPhoto {
  return {
    captureId: crypto.randomUUID(),
    blob,
    previewUrl: URL.createObjectURL(blob),
    source,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Native app: a real still photo from the phone camera (autofocus, full sensor),
 * not a video frame. Returns null when the farmer cancels.
 */
export async function takeStillPhoto(): Promise<CapturedPhoto | null> {
  try {
    try {
      const perm = await Camera.checkPermissions();
      if (perm.camera !== 'granted') {
        const req = await Camera.requestPermissions({ permissions: ['camera'] });
        if (req.camera === 'denied') return null;
      }
    } catch { /* permission API unavailable — let getPhoto ask */ }
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 100,               // our single encode happens later, with policy quality
      correctOrientation: true,
      saveToGallery: false,
    });
    if (!photo.webPath) return null;
    const blob = await (await fetch(photo.webPath)).blob();
    return newCaptured(blob, 'still_camera');
  } catch {
    return null;
  }
}

export function isNativeCamera(): boolean {
  return Capacitor.isNativePlatform();
}

/** Browser / PWA or gallery pick: the file as the device produced it. */
export function capturedFromFile(file: File, fromCamera: boolean): CapturedPhoto {
  return newCaptured(file, fromCamera ? 'in_app_camera' : 'gallery');
}

// ── One resize + one encode, with the server's policy ──────────────────────

interface Prepared {
  jpeg: Blob;
  sha256: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  metrics: ImageQualityMetrics;
  resize: string;
  quality: number;
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  // imageOrientation 'from-image' applies EXIF rotation once, at decode.
  return await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function prepareForUpload(original: Blob, role: ShotRole, policy: ImagePolicy): Promise<Prepared> {
  const bitmap = await decode(original);
  const maxPx = Number(policy.shot_role_max_px[role] ?? policy.shot_role_max_px.other);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = Number.isFinite(maxPx) && maxPx > 0 && longEdge > maxPx ? maxPx / longEdge : 1; // never upscale
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw new Error('CANVAS_UNAVAILABLE'); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const metrics = calculateQualityMetrics(canvas);
  const jpeg: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', policy.jpeg_quality),
  );
  if (jpeg.type !== 'image/jpeg') throw new Error('JPEG encoding not supported on this device');
  metrics.fileSize = jpeg.size;

  return {
    jpeg,
    sha256: await sha256Hex(jpeg),
    width,
    height,
    originalWidth: Math.round(width / scale),
    originalHeight: Math.round(height / scale),
    metrics,
    resize: scale < 1 ? `long_edge_${maxPx}` : 'none',
    quality: policy.jpeg_quality,
  };
}

/**
 * Device-side quality gate — the same thresholds validateImageQuality()
 * already uses (dark < 25, bright > 250). Blur is judged by the server
 * model, as that function's comment already decided.
 */
export async function quickQualityCheck(original: Blob): Promise<RetakeReason | null> {
  const bitmap = await decode(original);
  const edge = 512;
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw new Error('CANVAS_UNAVAILABLE'); }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const m = calculateQualityMetrics(canvas);
  if (m.brightness < 25) return 'too_dark';
  if (m.brightness > 250) return 'overexposed';
  return null;
}

// ── Location ────────────────────────────────────────────────────────────────

export function getCurrentLocation(timeoutMs = 10000): Promise<PhotoCaptureQueueItem['location']> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy_m: pos.coords.accuracy ?? null }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

// ── Queue → upload ──────────────────────────────────────────────────────────

export interface QueueArgs {
  id: PhotoIdentity;
  landId: string;
  purpose: CapturePurpose;
  shotRole: ShotRole;
  scheduleId?: string | null;
  taskId?: string | null;
  subjectType?: CropPhotoUploadType | null;
  location: PhotoCaptureQueueItem['location'];
}

/** Always queue first, so nothing is lost if the network drops mid-way. */
export async function queueCapture(photo: CapturedPhoto, a: QueueArgs): Promise<PhotoCaptureQueueItem> {
  assertPhotoIdentity(a.id);
  const item: Omit<PhotoCaptureQueueItem, 'lastModified'> = {
    id: photo.captureId,
    farmer_id: a.id.farmerId,
    tenant_id: a.id.tenantId,
    land_id: a.landId,
    purpose: a.purpose,
    shot_role: a.shotRole,
    schedule_id: a.scheduleId ?? null,
    task_id: a.taskId ?? null,
    subject_type: a.subjectType ?? null,
    source: photo.source,
    original: photo.blob,
    captured_at: photo.capturedAt,
    location: a.location,
    created_offline: !navigator.onLine,
    status: 'pending',
    upload_id: null,
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
  };
  await localDB.queuePhotoCapture(item);
  return { ...item, lastModified: Date.now() };
}

interface BeginUploadResponse {
  upload_id: string;
  upload?: { signed_url: string; token: string; storage_path: string; bucket: string };
  deduplicated: boolean;
}

/** Upload one queued photo; returns the evidence id (crop_growth_uploads.id). */
export async function uploadQueued(item: PhotoCaptureQueueItem): Promise<string> {
  const id: PhotoIdentity = { farmerId: item.farmer_id, tenantId: item.tenant_id };
  assertPhotoIdentity(id);
  const token = sessionToken();
  if (item.status === 'uploaded' && item.upload_id) return item.upload_id;
  try {
    const { policy } = await getCapturePolicy(id);
    const p = await prepareForUpload(item.original, item.shot_role, policy);
    const begin = await invokeChat<BeginUploadResponse>({
      action: 'photo_begin_upload',
      land_id: item.land_id,
      purpose: item.purpose,
      shot_role: item.shot_role,
      schedule_id: item.schedule_id,
      task_id: item.task_id,
      subject_type: item.subject_type ?? undefined,
      client_capture_id: item.id,
      content_sha256: p.sha256,
      mime_type: 'image/jpeg',
      bytes: p.jpeg.size,
      width_px: p.width,
      height_px: p.height,
      original_width_px: p.originalWidth,
      original_height_px: p.originalHeight,
      captured_at: item.captured_at,
      created_offline: item.created_offline,
      location: item.location,
      client_quality: { sharpness: p.metrics.sharpness, brightness: p.metrics.brightness, contrast: p.metrics.contrast },
      processing: {
        pipeline_version: PHOTO_PIPELINE_VERSION,
        source: item.source,
        resize: p.resize,
        jpeg_quality: p.quality,
        encoded_once: true,
      },
      device: { platform: Capacitor.getPlatform(), user_agent: navigator.userAgent },
    }, id);

    if (begin.upload) {
      assertPhotoIdentity(id);
      if (sessionToken() !== token) throw new Error('PHOTO_SESSION_CHANGED');
      const { error } = await supabase.storage
        .from(begin.upload.bucket)
        .uploadToSignedUrl(begin.upload.storage_path, begin.upload.token, p.jpeg, { contentType: 'image/jpeg' });
      if (error) throw error;
    }
    assertPhotoIdentity(id);
    if (sessionToken() !== token) throw new Error('PHOTO_SESSION_CHANGED');
    await localDB.updatePhotoCapture(item.id, { status: 'uploaded', upload_id: begin.upload_id, last_error: null });
    return begin.upload_id;
  } catch (e) {
    await localDB.updatePhotoCapture(item.id, {
      status: 'failed',
      attempts: (item.attempts ?? 0) + 1,
      last_error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

// ── Diagnose → Decision Brain ───────────────────────────────────────────────

export interface DiagnoseArgs {
  id: PhotoIdentity;
  landId: string;
  purpose: CapturePurpose;
  photos: Array<{ upload_id: string; shot_role: ShotRole }>;
  taskId?: string | null;
  sessionId?: string | null;
  language: string;
  farmerText?: string | null;
}

/** Perception only. The answer comes from askDecisionBrain(). */
export async function diagnosePhotos(a: DiagnoseArgs): Promise<DiagnoseResult> {
  return await invokeChat<DiagnoseResult>({
    action: 'diagnose_photo',
    land_id: a.landId,
    purpose: a.purpose,
    photos: a.photos,
    task_id: a.taskId ?? null,
    session_id: a.sessionId ?? null,
    language: a.language,
    farmer_text: a.farmerText ?? null,
  }, a.id);
}

/**
 * The ordinary chat turn, carrying the completed diagnosis. The farmer's own
 * words go verbatim (empty when none) — never a placeholder sentence.
 */
export async function askDecisionBrain(a: {
  id: PhotoIdentity;
  landId: string;
  sessionId?: string | null;
  language: string;
  diagnosisId: string;
  farmerText?: string | null;
}): Promise<BrainAnswer> {
  return await invokeChat<BrainAnswer>({
    messages: [{ role: 'user', content: (a.farmerText ?? '').trim() }],
    landId: a.landId,
    sessionId: a.sessionId ?? undefined,
    language: a.language,
    photoDiagnosisId: a.diagnosisId,
    metadata: { tenantId: a.id.tenantId, farmerId: a.id.farmerId, mediaType: 'photo' },
  }, a.id);
}

// ── General Scan — land-less identification (online only) ─────────────────

export type GeneralScanCategory =
  | 'crop_plant' | 'weed' | 'insect_pest' | 'mite_pest' | 'pest_damage'
  | 'fungal_disease' | 'bacterial_disease' | 'viral_disease' | 'nematode_damage'
  | 'nutrient_deficiency' | 'abiotic_stress' | 'animal_damage' | 'beneficial_organism'
  | 'not_agricultural' | 'unknown';

export interface GeneralScanName {
  common_name_en: string | null;
  scientific_name: string | null;
  local_name: string | null;
  confidence: number;
}

/** Mirrors GeneralIdentification in supabase/functions/ai-agriculture-chat/photo/general-scan.ts. */
/** Control measures from General Scan. Chemicals are active ingredients (ISO common names) only. */
export interface GeneralManagement {
  applicable: boolean;
  prevention_local: string[];
  biological: Array<{ agent: string; how_local: string | null }>;
  chemical: Array<{
    active_ingredient: string;
    /** Product class and how it is applied (v1.3+; absent on older stored results). */
    type?: ProductType | null;
    application?: ApplicationMethod | null;
    moa_group: string | null;
    how_local: string | null;
    watch_list?: boolean;
  }>;
  action_threshold_local: string | null;
  safety_local: string | null;
  /** Server held products back: identification not sure, or the regulatory list could not be read. */
  products_withheld?: 'not_sure' | 'regulatory_unavailable' | null;
}

export type SprayRole = 'fungicide' | 'bactericide' | 'insecticide' | 'acaricide' | 'nematicide' | 'herbicide'
  | 'biopesticide' | 'fertilizer' | 'micronutrient' | 'growth_regulator' | 'biostimulant' | 'adjuvant';
export type ProductType = SprayRole | 'rodenticide' | 'molluscicide';
export type ApplicationMethod = 'foliar_spray' | 'soil_application' | 'seed_treatment' | 'bait';
export type DoseUnit = 'g_per_acre' | 'ml_per_acre' | 'g_per_ha' | 'ml_per_ha' | 'g_per_litre' | 'ml_per_litre';
export type WaterUnit = 'l_per_acre' | 'l_per_ha';

/** One product in the spray plan, dose exactly as the label states it. */
export interface SprayComponent {
  role: SprayRole;
  active_ingredient: string;
  formulation: string | null;
  dose_value: number | null;
  dose_unit: DoseUnit | null;
  phi_days: number | null;
  moa_group: string | null;
  watch_list?: boolean;
}

export interface GeneralSprayPlan {
  needed: boolean;
  water_volume: number | null;
  water_unit: WaterUnit | null;
  components: SprayComponent[];
  clash_note_local: string | null;
  withheld?: 'not_sure' | 'regulatory_unavailable' | null;
  dose_withheld?: 'crop_unknown' | null;
}

/** Config defaults for the pump / stock-solution calculator (system_config). */
export interface SprayDefaults {
  pump_sizes_l: number[];
  default_pump_l: number;
  stock_l_per_pump: number;
  stock_min_dilution: number;
}

export interface GeneralIdentification {
  scan_scope: 'general';
  language: string;
  image_usable: boolean;
  retake_reason_code: RetakeReason | null;
  retake_photo_index: number | null;
  observed_features_en: string[];
  category: GeneralScanCategory;
  primary: GeneralScanName & { taxon_rank: string };
  host_crop: GeneralScanName | null;
  alternatives: Array<GeneralScanName & { category: GeneralScanCategory; how_to_tell_apart_local: string | null }>;
  farmer_card: {
    summary_local: string | null;
    identification_marks_local: string[];
    damage_or_role_local: string | null;
    field_checks_local: string[];
  };
  root_cause: { primary_en: string | null; contributing_factors_local: string[]; life_cycle_local: string | null };
  another_photo: { needed: boolean; shot_role: ShotRole | null; reason_local: string | null };
  management: GeneralManagement;
  spray_plan: GeneralSprayPlan;
  abstained: boolean;
  language_check?: 'ok' | 'repaired' | 'mismatch' | 'not_checked';
}

export interface GeneralScanResult {
  diagnosis_id: string | null;
  status: Extract<DiagnosisStatus, 'completed' | 'needs_follow_up' | 'retake_requested' | 'failed'>;
  retake?: { reason_code: RetakeReason | null; photo_index: number | null };
  identification?: GeneralIdentification;
  spray_defaults?: SprayDefaults | null;
  error_code?: string;
}

/**
 * Register and upload one General Scan photo (no land). Same single encode,
 * same private bucket and signed upload as land photos; returns the evidence id.
 */
export async function uploadGeneralPhoto(photo: CapturedPhoto, a: {
  id: PhotoIdentity;
  purpose: CapturePurpose;
  shotRole: ShotRole;
  location: PhotoCaptureQueueItem['location'];
}): Promise<string> {
  assertPhotoIdentity(a.id);
  const token = sessionToken();
  const { policy } = await getCapturePolicy(a.id);
  const p = await prepareForUpload(photo.blob, a.shotRole, policy);
  const begin = await invokeChat<BeginUploadResponse>({
    action: 'photo_begin_upload',
    scan_scope: 'general',
    purpose: a.purpose,
    shot_role: a.shotRole,
    client_capture_id: photo.captureId,
    content_sha256: p.sha256,
    mime_type: 'image/jpeg',
    bytes: p.jpeg.size,
    width_px: p.width,
    height_px: p.height,
    original_width_px: p.originalWidth,
    original_height_px: p.originalHeight,
    captured_at: photo.capturedAt,
    created_offline: false,
    location: a.location,
    client_quality: { sharpness: p.metrics.sharpness, brightness: p.metrics.brightness, contrast: p.metrics.contrast },
    processing: {
      pipeline_version: PHOTO_PIPELINE_VERSION,
      source: photo.source,
      resize: p.resize,
      jpeg_quality: p.quality,
      encoded_once: true,
    },
    device: { platform: Capacitor.getPlatform(), user_agent: navigator.userAgent },
  }, a.id);
  if (begin.upload) {
    assertPhotoIdentity(a.id);
    if (sessionToken() !== token) throw new Error('PHOTO_SESSION_CHANGED');
    const { error } = await supabase.storage
      .from(begin.upload.bucket)
      .uploadToSignedUrl(begin.upload.storage_path, begin.upload.token, p.jpeg, { contentType: 'image/jpeg' });
    if (error) throw error;
  }
  assertPhotoIdentity(a.id);
  if (sessionToken() !== token) throw new Error('PHOTO_SESSION_CHANGED');
  return begin.upload_id;
}

/** Identification only — the result is shown as is; no Decision Brain turn follows. */
export async function identifyGeneral(a: {
  id: PhotoIdentity;
  purpose: CapturePurpose;
  photos: Array<{ upload_id: string; shot_role: ShotRole }>;
  language: string;
  farmerText?: string | null;
}): Promise<GeneralScanResult> {
  return await invokeChat<GeneralScanResult>({
    action: 'diagnose_photo',
    scan_scope: 'general',
    purpose: a.purpose,
    photos: a.photos,
    language: a.language,
    farmer_text: a.farmerText ?? null,
  }, a.id);
}

/**
 * Background sync for photos captured offline: upload, then run perception so
 * the evidence is stored. The farmer asks about them from the land when online.
 */
export async function syncPendingPhotoCaptures(id: PhotoIdentity, language: string): Promise<number> {
  if (!navigator.onLine) return 0;
  assertPhotoIdentity(id);
  const token = sessionToken();
  const pending = await localDB.getPendingPhotoCaptures(id.farmerId);
  let done = 0;
  for (const item of pending) {
    if (item.farmer_id !== id.farmerId || item.tenant_id !== id.tenantId) continue;
    assertPhotoIdentity(id);
    if (sessionToken() !== token) break;
    try {
      const uploadId = await uploadQueued(item);
      await diagnosePhotos({
        id, landId: item.land_id, purpose: item.purpose,
        photos: [{ upload_id: uploadId, shot_role: item.shot_role }],
        taskId: item.task_id, language,
      });
      done++;
    } catch (e) {
      console.warn('[cropPhotoService] sync failed for', item.id, e);
    }
  }
  return done;
}

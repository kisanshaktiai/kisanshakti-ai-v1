/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP PHOTO SERVICE — single upload + analyse path for every photo surface
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/services/cropPhotoService.ts
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-08-30 — NEW. Replaces four divergent photo paths (InstaScan,
 *   chat attachment, chat camera, schedule task upload) with one service.
 *   Every surface now analyses through `ai-agriculture-chat`, whose PHASE-19
 *   photo path (agents/orchestrator.ts:2011 → photo/photo-analyzer.ts) maps
 *   vision observations onto canonical observation_master codes and lets the
 *   hypothesis→rule graph remain the only diagnostic authority.
 *   `ai-crop-scan` is intentionally NOT called from here.
 *
 * VERIFIED WIRING (do not change without re-verifying against the live DB):
 *   - bucket `chat-attachments`  : public,  38 objects, uploads working
 *   - bucket `crop-growth-media` : private, 0 objects, INSERT policy uses
 *     auth.uid() which is NULL under this app's custom (mobile+PIN) auth.
 *     Schedule uploads stay blocked until migration
 *     20260830_photo_pipeline_rls_p0.sql is applied.
 *   - table `crop_growth_uploads`: columns verified against information_schema
 *     on 2026-08-30. Same auth.uid() RLS problem as the bucket above.
 *   - edge function `ai-agriculture-chat` requires headers x-tenant-id,
 *     x-farmer-id, x-session-token and accepts an OPTIONAL sessionId
 *     (index.ts:589-639 creates or reuses one when absent).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { preprocessImage, type ImageQualityMetrics } from '@/utils/imagePreprocessing';
import { uploadChatImage } from '@/utils/chatImageStorage';

/** Which product surface captured the photo. Decides the storage bucket and
 *  whether a crop_growth_uploads history row is written. */
export type PhotoSurface = 'chat' | 'schedule' | 'instascan';

/** Mirrors the existing crop_growth_uploads.upload_type values already used by
 *  TaskPhotoUploadDialog.tsx. Do not add values without a DB check. */
export type CropPhotoUploadType =
  | 'crop'
  | 'soil'
  | 'land_preparation'
  | 'irrigation'
  | 'pest'
  | 'fertilizer'
  | 'harvest'
  | 'general';

export interface CropPhotoGeo {
  lat: number;
  lng: number;
}

export interface CropPhotoLocationValidation {
  isValid: boolean;
  distanceMeters: number | null;
  level: 'at_land' | 'nearby' | 'far' | 'unknown';
}

export interface UploadCropPhotoParams {
  /** base64 data URL from camera or FileReader. */
  imageDataUrl: string;
  surface: PhotoSurface;
  farmerId: string;
  tenantId: string;
  landId?: string;
  /** Chat surface only — used to build the storage path. */
  sessionId?: string;
  messageId?: string;
  /** Schedule surface only. */
  scheduleId?: string;
  taskId?: string;
  uploadType?: CropPhotoUploadType;
  notes?: string;
  location?: CropPhotoGeo | null;
  locationValidation?: CropPhotoLocationValidation;
}

export interface UploadCropPhotoResult {
  success: boolean;
  /** URL the edge function will read. Public URL for chat-attachments,
   *  signed URL for crop-growth-media. */
  fileUrl: string | null;
  /** Preprocessed base64, kept for optimistic UI preview. */
  processedImage: string;
  /** crop_growth_uploads.id — only set for the schedule surface. */
  uploadId: string | null;
  qualityMetrics: ImageQualityMetrics;
  warnings: string[];
  error?: string;
}

export interface AnalyzeCropPhotoParams {
  fileUrl: string;
  farmerId: string;
  tenantId: string;
  language: string;
  landId?: string;
  sessionId?: string;
  /** The farmer's own words. Never substitute an English placeholder — the
   *  NLU and language-induction layers read this verbatim. */
  farmerMessage?: string;
  qualityMetrics?: ImageQualityMetrics;
  uploadId?: string | null;
  surface: PhotoSurface;
}

export interface AnalyzeCropPhotoResult {
  success: boolean;
  /** 'PHOTO_REQUEST' means the brain judged the image unusable and wants a
   *  retake (orchestrator.ts:2039-2065). Surface this to the farmer. */
  type?: string;
  response?: string;
  quickReplies?: unknown[];
  metadata?: Record<string, unknown>;
  retakeRequested: boolean;
  retakeTips: string[];
  error?: string;
}

const PREPROCESS_OPTIONS = {
  maxDimension: 1536,
  targetQuality: 0.85,
  targetSizeKB: 500,
} as const;

const CROP_GROWTH_BUCKET = 'crop-growth-media';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Preprocess once, upload once. Resolution/compression settings are identical
 * for every surface so the model always sees the same class of image.
 */
export async function uploadCropPhoto(
  params: UploadCropPhotoParams
): Promise<UploadCropPhotoResult> {
  const {
    imageDataUrl,
    surface,
    farmerId,
    tenantId,
    landId,
    sessionId,
    messageId,
    scheduleId,
    taskId,
    uploadType = 'crop',
    notes,
    location,
    locationValidation,
  } = params;

  const preprocessed = await preprocessImage(imageDataUrl, PREPROCESS_OPTIONS);

  console.log('📷 [CropPhoto] Preprocessed', {
    surface,
    originalKB: Math.round(preprocessed.originalSize / 1024),
    processedKB: Math.round(preprocessed.processedSize / 1024),
    sharpness: preprocessed.qualityMetrics.sharpness,
    brightness: preprocessed.qualityMetrics.brightness,
    warnings: preprocessed.warnings,
  });

  const base: Omit<UploadCropPhotoResult, 'success' | 'fileUrl' | 'uploadId'> = {
    processedImage: preprocessed.processedImage,
    qualityMetrics: preprocessed.qualityMetrics,
    warnings: preprocessed.warnings,
  };

  // ── Chat / InstaScan → chat-attachments via the existing, working helper ──
  if (surface === 'chat' || surface === 'instascan') {
    const uploadSessionId = sessionId ?? 'instascan';
    const uploadMessageId = messageId ?? crypto.randomUUID();

    const result = await uploadChatImage(
      preprocessed.processedImage,
      uploadSessionId,
      uploadMessageId,
      farmerId
    );

    if (!result.success) {
      console.error('❌ [CropPhoto] chat-attachments upload failed');
      return {
        ...base,
        success: false,
        fileUrl: null,
        uploadId: null,
        error: 'STORAGE_UPLOAD_FAILED',
      };
    }

    return { ...base, success: true, fileUrl: result.url, uploadId: null };
  }

  // ── Schedule → crop-growth-media + crop_growth_uploads history row ──
  if (!landId) {
    return {
      ...base,
      success: false,
      fileUrl: null,
      uploadId: null,
      error: 'LAND_ID_REQUIRED',
    };
  }

  const client = supabaseWithAuth(farmerId, tenantId);
  const objectPath = `${farmerId}/${landId}/${Date.now()}.jpg`;
  const blob = dataUrlToBlob(preprocessed.processedImage);

  const { error: uploadError } = await client.storage
    .from(CROP_GROWTH_BUCKET)
    .upload(objectPath, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });

  if (uploadError) {
    // Under custom auth this is the expected failure until the RLS migration
    // lands. Fail loudly rather than continuing with an unusable URL.
    console.error('❌ [CropPhoto] crop-growth-media upload failed:', uploadError.message);
    return {
      ...base,
      success: false,
      fileUrl: null,
      uploadId: null,
      error: `STORAGE_UPLOAD_FAILED: ${uploadError.message}`,
    };
  }

  const { data: signed, error: signError } = await client.storage
    .from(CROP_GROWTH_BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error('❌ [CropPhoto] signed URL failed:', signError?.message);
    return {
      ...base,
      success: false,
      fileUrl: null,
      uploadId: null,
      error: 'SIGNED_URL_FAILED',
    };
  }

  // Columns verified against information_schema.columns on 2026-08-30.
  const { data: uploadRow, error: insertError } = await client
    .from('crop_growth_uploads')
    .insert({
      land_id: landId,
      farmer_id: farmerId,
      tenant_id: tenantId,
      schedule_id: scheduleId ?? null,
      task_id: taskId ?? null,
      file_url: signed.signedUrl,
      file_type: 'image',
      upload_type: uploadType,
      notes: notes || null,
      capture_location: location ?? null,
      location_validated: locationValidation?.isValid ?? false,
      distance_from_land_meters: locationValidation?.distanceMeters ?? null,
      is_processed: false,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('❌ [CropPhoto] crop_growth_uploads insert failed:', insertError.message);
    return {
      ...base,
      success: false,
      fileUrl: signed.signedUrl,
      uploadId: null,
      error: `UPLOAD_ROW_INSERT_FAILED: ${insertError.message}`,
    };
  }

  return {
    ...base,
    success: true,
    fileUrl: signed.signedUrl,
    uploadId: uploadRow.id as string,
  };
}

/**
 * Send the photo to the Decision Brain. Every surface uses this one call, so
 * a photo always earns the same rule-graph governance regardless of where the
 * farmer took it.
 */
export async function analyzeCropPhoto(
  params: AnalyzeCropPhotoParams
): Promise<AnalyzeCropPhotoResult> {
  const {
    fileUrl,
    farmerId,
    tenantId,
    language,
    landId,
    sessionId,
    farmerMessage,
    qualityMetrics,
    uploadId,
    surface,
  } = params;

  const sessionToken = localStorage.getItem('app_session_token') || '';

  // The farmer's own text is passed verbatim. When they sent no text we send
  // an empty message: index.ts:804 accepts an empty message when imageUrl is
  // present, and an English placeholder would corrupt language detection.
  const messageContent = (farmerMessage ?? '').trim();

  try {
    const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
      body: {
        messages: [{ role: 'user', content: messageContent }],
        sessionId,
        landId,
        imageUrl: fileUrl,
        language,
        metadata: {
          tenantId,
          farmerId,
          mediaType: 'photo',
          photo_surface: surface,
          crop_growth_upload_id: uploadId ?? null,
          // Real measured values from the browser. The brain may use these
          // instead of guessing image quality.
          image_quality_metrics: qualityMetrics
            ? {
                brightness: qualityMetrics.brightness,
                contrast: qualityMetrics.contrast,
                sharpness: qualityMetrics.sharpness,
                width: qualityMetrics.width,
                height: qualityMetrics.height,
                file_size_bytes: qualityMetrics.fileSize,
              }
            : null,
        },
      },
      headers: {
        'x-tenant-id': tenantId,
        'x-farmer-id': farmerId,
        'x-session-token': sessionToken,
      },
    });

    if (error) throw error;

    const responseType = data?.type as string | undefined;
    const retakeRequested = responseType === 'PHOTO_REQUEST';

    return {
      success: true,
      type: responseType,
      response: data?.response ?? data?.photo_instructions?.text_en,
      quickReplies: data?.quickReplies ?? [],
      metadata: data?.metadata ?? {},
      retakeRequested,
      retakeTips: retakeRequested ? (data?.photo_instructions?.tips ?? []) : [],
    };
  } catch (err) {
    console.error('❌ [CropPhoto] analysis failed:', err);
    return {
      success: false,
      retakeRequested: false,
      retakeTips: [],
      error: err instanceof Error ? err.message : 'ANALYSIS_FAILED',
    };
  }
}

/** Haversine distance in metres. Same formula already used by
 *  TaskPhotoUploadDialog.tsx — kept identical so both agree. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Thresholds match the existing TaskPhotoUploadDialog behaviour (100m / 500m). */
export function classifyLocation(
  photo: CropPhotoGeo | null,
  landCenter: CropPhotoGeo | null
): CropPhotoLocationValidation {
  if (!photo || !landCenter) {
    return { isValid: false, distanceMeters: null, level: 'unknown' };
  }
  const d = distanceMeters(photo.lat, photo.lng, landCenter.lat, landCenter.lng);
  if (d <= 100) return { isValid: true, distanceMeters: d, level: 'at_land' };
  if (d <= 500) return { isValid: true, distanceMeters: d, level: 'nearby' };
  return { isValid: false, distanceMeters: d, level: 'far' };
}

/** lands.center_lat / lands.center_lon — columns confirmed present and already
 *  read the same way by TaskPhotoUploadDialog.tsx. */
export async function fetchLandCenter(landId: string): Promise<CropPhotoGeo | null> {
  const { data, error } = await supabase
    .from('lands')
    .select('center_lat, center_lon')
    .eq('id', landId)
    .maybeSingle();

  if (error || !data?.center_lat || !data?.center_lon) return null;
  return { lat: Number(data.center_lat), lng: Number(data.center_lon) };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

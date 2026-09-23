/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHOTO DIAGNOSIS — ENGINE CONTRACT
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: supabase/functions/ai-agriculture-chat/photo/diagnosis-contract.ts
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-09-23 — v2: photo ids are crop_growth_uploads.id (evidence store v2);
 *   routes are body.action 'photo_begin_upload' and 'diagnose_photo'; the
 *   chat turn carries photoDiagnosisId; buildBrainPhotoEvidence() added.
 * 2026-09-23 — NEW (design, not wired). One contract for every photo surface.
 *   The vision model PERCEIVES only: usable or not, crop check, plant part,
 *   visible stage, canonical observation codes with confidence, unmapped signs,
 *   candidate problems as hypotheses. It has no field for severity, alert,
 *   treatment, dose or timing — those come only from the Decision Brain's
 *   governed rules. Replaces photo-analyzer.ts output (PhotoAnalysisOutput)
 *   and ai-crop-scan's three response shapes.
 *
 * Language: every free-text field the model writes is English ("*_en"), per
 * the rule that agronomic prose is stored in English and the explainer LLM
 * renders it in the farmer's language. Retake reasons are CODES; the client
 * renders them through i18n keys, never literal strings.
 * Crop-agnostic: no crop names or crop branches here — crop, stage and code
 * vocabularies arrive from the database at runtime.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const DIAGNOSIS_ENGINE_VERSION = 'photo-diagnosis@2.0.0';
export const PHOTO_PIPELINE_VERSION = 'photo-pipeline@1.0.0';

// ── Shared vocabulary ───────────────────────────────────────────────────────

/** Mirrors the CHECK on photo_diagnosis.purpose / crop_photo_evidence.purpose. */
export type CapturePurpose =
  | 'chat_question'
  | 'instascan'
  | 'schedule_task'
  | 'growth_tracking'
  | 'land_card';

/** Mirrors the CHECK on photo_diagnosis_photo.shot_role. */
export type ShotRole = 'symptom_closeup' | 'whole_plant' | 'field_view' | 'other';

/** Mirrors crop_photo_evidence.subject_type (same values as crop_growth_uploads.upload_type). */
export type SubjectType =
  | 'crop' | 'soil' | 'land_preparation' | 'irrigation'
  | 'pest' | 'fertilizer' | 'harvest' | 'general';

/** Codes only. Client i18n key: `photoCapture.retake.<code>`; null reason → `photoCapture.retake.generic`. */
export type RetakeReason =
  | 'blurred'
  | 'too_dark'
  | 'overexposed'
  | 'not_a_plant'
  | 'wrong_plant_part'
  | 'too_far'
  | 'obstructed';

export const RETAKE_REASONS: readonly RetakeReason[] = [
  'blurred', 'too_dark', 'overexposed', 'not_a_plant', 'wrong_plant_part', 'too_far', 'obstructed',
] as const;

export type DiagnosisStatus =
  | 'queued' | 'processing' | 'completed' | 'needs_follow_up'
  | 'retake_requested' | 'crop_mismatch' | 'crop_unresolved' | 'failed';

// ── Route 1: body.action = 'photo_begin_upload' ─────────────────────────────
// Session-verified (resolveVerifiedCaller from _shared/sessionVerify.ts) and
// land-ownership-checked. Creates the crop_photo_evidence row and returns a
// signed upload URL for the private crop-growth-media bucket. The client never
// writes storage or evidence tables directly.

export interface BeginPhotoUploadRequest {
  action: 'photo_begin_upload';
  land_id: string;
  purpose: CapturePurpose;
  shot_role: ShotRole;
  schedule_id?: string | null;
  task_id?: string | null;
  subject_type?: SubjectType;
  client_capture_id: string;      // uuid generated at capture; idempotent across offline retries
  content_sha256: string;         // hex SHA-256 of the exact JPEG bytes being uploaded
  mime_type: 'image/jpeg';
  bytes: number;
  width_px: number;
  height_px: number;
  original_width_px: number;      // camera output before the single resize
  original_height_px: number;
  captured_at: string;            // ISO, device time at shutter
  created_offline: boolean;
  location?: { lat: number; lon: number; accuracy_m: number | null } | null;
  client_quality?: { sharpness: number; brightness: number; contrast: number } | null;
  processing: {                   // provenance, frozen with the photo
    pipeline_version: string;
    source: 'still_camera' | 'in_app_camera' | 'gallery';
    resize: string;               // e.g. "long_edge_3072" or "none"
    jpeg_quality: number;
    encoded_once: true;
  };
  device?: Record<string, unknown> | null;
}

export interface BeginPhotoUploadResponse {
  upload_id: string;
  /** Present only when the object still has to be uploaded. */
  upload?: { signed_url: string; token: string; storage_path: string; bucket: string };
  /** Same bytes already stored for this land (content_sha256 match). */
  deduplicated: boolean;
}

// ── Route 2: body.action = 'diagnose_photo' ─────────────────────────────────

export interface DiagnosePhotoRequest {
  action: 'diagnose_photo';
  land_id: string;
  purpose: CapturePurpose;
  schedule_id?: string | null;
  task_id?: string | null;
  session_id?: string | null;     // chat session to continue, when the surface has one
  language: string;               // farmer's app language code
  farmer_text?: string | null;    // verbatim, may be empty; never a placeholder
  photos: Array<{ upload_id: string; shot_role: ShotRole }>;
}

export interface DiagnosePhotoResponse {
  diagnosis_id: string | null;
  status: DiagnosisStatus;
  retake?: { reason_code: RetakeReason | null; photo_index: number | null };
  crop_mismatch?: { registered_crop_code: string; seen_crop_code: string | null };
  follow_up?: PerceptionOutput['follow_up'] | null;
  error_code?: string;
}

/** Body extension for the ordinary chat turn that follows a completed diagnosis. */
export interface PhotoChatTurnFields {
  photoDiagnosisId: string;
}

// ── What the server gives the model (all from the database) ────────────────

export interface PerceptionContext {
  registered_crop_code: string;                 // crops.value
  allowed_crop_codes: string[];                 // crops.value, active — for seen_crop_code
  allowed_plant_part_codes: string[];           // distinct observation_master.affected_plant_part in scope
  allowed_stage_codes: string[];                // crop_stage_master.stage_code for this crop
  allowed_observations: Array<{ code: string; label_en: string; plant_part: string | null }>;
  allowed_hypotheses: Array<{ code: string; label_en: string }>;  // hypothesis_master for this crop
  photo_roles: ShotRole[];                      // by photo_index
}

// ── What the model must return (strict JSON) ───────────────────────────────

export interface PerceptionObservation {
  observation_code: string;
  confidence: number;             // 0..1, required — no server default
  seen_en: string;                // short description of what is visible
  photo_index: number;
}

export interface PerceptionOutput {
  image_usable: boolean;
  retake_reason_code: RetakeReason | null;
  retake_photo_index: number | null;
  crop_check: { status: 'match' | 'mismatch' | 'uncertain'; seen_crop_code: string | null; confidence: number };
  plant_part_code: string | null;
  stage_observation: { stage_code: string | null; confidence: number };
  observations: PerceptionObservation[];
  unmapped_signs: Array<{ seen_en: string; plant_part_code: string | null; photo_index: number }>;
  candidate_problems: Array<{
    hypothesis_code: string | null;
    problem_class: 'pest' | 'disease' | 'nutrient' | 'abiotic' | 'unknown';
    label_en: string;
    confidence: number;
    supporting_observation_codes: string[];
  }>;
  follow_up: {
    kind: 'none' | 'question' | 'another_photo';
    question_en: string | null;
    requested_shot_role: ShotRole | null;
    requested_plant_part_code: string | null;
  };
}

/** JSON Schema for the OpenAI structured-output request (strict mode:
 *  every property required, no additional properties). Code values are
 *  plain strings here; membership in the allowed lists is enforced by
 *  validatePerception() below, not trusted from the model. */
export const PERCEPTION_JSON_SCHEMA = {
  name: 'crop_photo_perception',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['image_usable', 'retake_reason_code', 'retake_photo_index', 'crop_check', 'plant_part_code',
               'stage_observation', 'observations', 'unmapped_signs', 'candidate_problems', 'follow_up'],
    properties: {
      image_usable: { type: 'boolean' },
      retake_reason_code: { type: ['string', 'null'], enum: [...RETAKE_REASONS, null] },
      retake_photo_index: { type: ['integer', 'null'] },
      crop_check: {
        type: 'object', additionalProperties: false,
        required: ['status', 'seen_crop_code', 'confidence'],
        properties: {
          status: { type: 'string', enum: ['match', 'mismatch', 'uncertain'] },
          seen_crop_code: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
      },
      plant_part_code: { type: ['string', 'null'] },
      stage_observation: {
        type: 'object', additionalProperties: false,
        required: ['stage_code', 'confidence'],
        properties: { stage_code: { type: ['string', 'null'] }, confidence: { type: 'number' } },
      },
      observations: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['observation_code', 'confidence', 'seen_en', 'photo_index'],
          properties: {
            observation_code: { type: 'string' },
            confidence: { type: 'number' },
            seen_en: { type: 'string' },
            photo_index: { type: 'integer' },
          },
        },
      },
      unmapped_signs: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['seen_en', 'plant_part_code', 'photo_index'],
          properties: {
            seen_en: { type: 'string' },
            plant_part_code: { type: ['string', 'null'] },
            photo_index: { type: 'integer' },
          },
        },
      },
      candidate_problems: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['hypothesis_code', 'problem_class', 'label_en', 'confidence', 'supporting_observation_codes'],
          properties: {
            hypothesis_code: { type: ['string', 'null'] },
            problem_class: { type: 'string', enum: ['pest', 'disease', 'nutrient', 'abiotic', 'unknown'] },
            label_en: { type: 'string' },
            confidence: { type: 'number' },
            supporting_observation_codes: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      follow_up: {
        type: 'object', additionalProperties: false,
        required: ['kind', 'question_en', 'requested_shot_role', 'requested_plant_part_code'],
        properties: {
          kind: { type: 'string', enum: ['none', 'question', 'another_photo'] },
          question_en: { type: ['string', 'null'] },
          requested_shot_role: { type: ['string', 'null'], enum: ['symptom_closeup', 'whole_plant', 'field_view', 'other', null] },
          requested_plant_part_code: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

// ── Server-side validation — fail closed, no invented defaults ─────────────

export interface ValidatedPerception {
  ok: boolean;
  /** Set when ok=false: the model output could not be used at all. */
  error_code?: 'PERCEPTION_SHAPE_INVALID';
  perception?: PerceptionOutput;
  /** Codes the model returned that the database does not own. They go to
   *  observation_vocabulary_gaps (source 'PHOTO_VISION'), never into the brain. */
  rejected_codes: Array<{ field: string; value: string }>;
}

function isConfidence(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * Checks the model output against the database-supplied context.
 * - A missing or out-of-range confidence rejects the item (no 0.5 / 0.7 defaults).
 * - An observation code not in allowed_observations moves to unmapped_signs.
 * - Unknown crop / part / stage / hypothesis codes become null and are reported.
 */
export function validatePerception(raw: unknown, ctx: PerceptionContext): ValidatedPerception {
  const rejected: Array<{ field: string; value: string }> = [];
  const r = raw as Partial<PerceptionOutput> | null;
  if (!r || typeof r !== 'object' || typeof r.image_usable !== 'boolean'
      || !r.crop_check || !Array.isArray(r.observations) || !Array.isArray(r.unmapped_signs)
      || !Array.isArray(r.candidate_problems) || !r.follow_up || !r.stage_observation) {
    return { ok: false, error_code: 'PERCEPTION_SHAPE_INVALID', rejected_codes: [] };
  }

  const obsCodes = new Set(ctx.allowed_observations.map((o) => o.code));
  const partCodes = new Set(ctx.allowed_plant_part_codes);
  const stageCodes = new Set(ctx.allowed_stage_codes);
  const cropCodes = new Set(ctx.allowed_crop_codes);
  const hypCodes = new Set(ctx.allowed_hypotheses.map((h) => h.code));
  const photoCount = ctx.photo_roles.length;
  const validIndex = (i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < photoCount;

  const keepCode = (field: string, v: string | null | undefined, allowed: Set<string>): string | null => {
    if (v == null || v === '') return null;
    if (allowed.has(v)) return v;
    rejected.push({ field, value: String(v) });
    return null;
  };

  const unmapped = r.unmapped_signs
    .filter((u) => u && typeof u.seen_en === 'string' && u.seen_en.trim() && validIndex(u.photo_index))
    .map((u) => ({
      seen_en: u.seen_en.trim(),
      plant_part_code: keepCode('unmapped_signs.plant_part_code', u.plant_part_code, partCodes),
      photo_index: u.photo_index,
    }));

  const observations: PerceptionObservation[] = [];
  const seen = new Set<string>();
  for (const o of r.observations) {
    if (!o || typeof o.observation_code !== 'string' || !isConfidence(o.confidence) || !validIndex(o.photo_index)) {
      if (o?.observation_code) rejected.push({ field: 'observations.invalid_item', value: String(o.observation_code) });
      continue;
    }
    if (!obsCodes.has(o.observation_code)) {
      rejected.push({ field: 'observations.observation_code', value: o.observation_code });
      if (typeof o.seen_en === 'string' && o.seen_en.trim()) {
        unmapped.push({ seen_en: o.seen_en.trim(), plant_part_code: null, photo_index: o.photo_index });
      }
      continue;
    }
    if (seen.has(o.observation_code)) continue;
    seen.add(o.observation_code);
    observations.push({
      observation_code: o.observation_code,
      confidence: o.confidence,
      seen_en: typeof o.seen_en === 'string' ? o.seen_en.trim() : '',
      photo_index: o.photo_index,
    });
  }

  const candidate_problems = r.candidate_problems
    .filter((c) => c && isConfidence(c.confidence) && typeof c.label_en === 'string')
    .map((c) => ({
      hypothesis_code: keepCode('candidate_problems.hypothesis_code', c.hypothesis_code, hypCodes),
      problem_class: (['pest', 'disease', 'nutrient', 'abiotic', 'unknown'] as const).includes(c.problem_class as never)
        ? c.problem_class : 'unknown' as const,
      label_en: c.label_en.trim(),
      confidence: c.confidence,
      supporting_observation_codes: Array.isArray(c.supporting_observation_codes)
        ? c.supporting_observation_codes.filter((s) => seen.has(s)) : [],
    }));

  const cc = r.crop_check;
  const cropStatus = (['match', 'mismatch', 'uncertain'] as const).includes(cc.status as never) && isConfidence(cc.confidence)
    ? cc.status : 'uncertain' as const;

  const retake = r.retake_reason_code && RETAKE_REASONS.includes(r.retake_reason_code)
    ? r.retake_reason_code : null;

  if (r.retake_reason_code && !retake) rejected.push({ field: 'retake_reason_code', value: String(r.retake_reason_code) });

  // A stage code the crop does not own carries no confidence either.
  const stageCode = keepCode('stage_observation.stage_code', r.stage_observation.stage_code, stageCodes);
  const stageObservation = {
    stage_code: stageCode,
    confidence: stageCode && isConfidence(r.stage_observation.confidence) ? r.stage_observation.confidence : 0,
  };

  const fu = r.follow_up;
  const fuKind = (['none', 'question', 'another_photo'] as const).includes(fu.kind as never) ? fu.kind : 'none' as const;

  return {
    ok: true,
    rejected_codes: rejected,
    perception: {
      image_usable: r.image_usable,
      // No invented reason: an unusable photo with no valid code keeps null and
      // the client shows its generic retake key (photoCapture.retake.generic).
      retake_reason_code: r.image_usable ? null : retake,
      retake_photo_index: validIndex(r.retake_photo_index) ? (r.retake_photo_index as number) : null,
      crop_check: {
        status: cropStatus,
        seen_crop_code: keepCode('crop_check.seen_crop_code', cc.seen_crop_code, cropCodes),
        confidence: isConfidence(cc.confidence) ? cc.confidence : 0,
      },
      plant_part_code: keepCode('plant_part_code', r.plant_part_code, partCodes),
      stage_observation: stageObservation,
      observations,
      unmapped_signs: unmapped,
      candidate_problems,
      follow_up: {
        kind: fuKind,
        question_en: typeof fu.question_en === 'string' && fu.question_en.trim() ? fu.question_en.trim() : null,
        requested_shot_role: (['symptom_closeup', 'whole_plant', 'field_view', 'other'] as const)
          .includes(fu.requested_shot_role as never) ? fu.requested_shot_role : null,
        requested_plant_part_code: keepCode('follow_up.requested_plant_part_code', fu.requested_plant_part_code, partCodes),
      },
    },
  };
}

// ── What the Decision Brain receives ───────────────────────────────────────
// Observations enter through the existing evidence scorer
// (decision/evidence-confidence.ts scoreEvidenceSet) with source 'VISION',
// weighted by system_config.evidence_weight_source_vision (live: 0.85).
// Only observations at or above photo_diagnosis_policy.observation_min_confidence
// are injected; the rest are offered to the farmer as confirmation questions.

export interface BrainPhotoEvidence {
  diagnosis_id: string;
  upload_ids: string[];
  crop_check_status: 'match' | 'mismatch' | 'uncertain';
  plant_part_code: string | null;
  observed_stage_code: string | null;
  observed_stage_confidence: number;
  /** Injected into observationKeys / inductionResult with source 'VISION'. */
  confirmed_observations: Array<{ observation_code: string; confidence: number }>;
  /** Below the confidence gate: brain may ask the farmer to confirm these. */
  tentative_observations: Array<{ observation_code: string; confidence: number }>;
  /** Priors only. The hypothesis graph decides; these never select a rule. */
  hypothesis_priors: Array<{ hypothesis_code: string; confidence: number }>;
  follow_up: PerceptionOutput['follow_up'];
}

/** Per-run usage record written to photo_diagnosis. */
export interface PerceptionUsage {
  model_requested: string;
  model_used: string;
  fallback_used: boolean;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;        // null when prices are not configured — never estimated
  price_snapshot: Record<string, unknown> | null;
  latency_ms: number;
}

/**
 * Split validated perception into what the brain may treat as evidence now
 * (at or above the configured confidence gate) and what it must confirm with
 * the farmer first. Only codes that passed validatePerception() arrive here.
 */
export function buildBrainPhotoEvidence(
  perception: PerceptionOutput,
  diagnosisId: string,
  uploadIds: string[],
  observationMinConfidence: number,
): BrainPhotoEvidence {
  const present = perception.observations;
  return {
    diagnosis_id: diagnosisId,
    upload_ids: uploadIds,
    crop_check_status: perception.crop_check.status,
    plant_part_code: perception.plant_part_code,
    observed_stage_code: perception.stage_observation.stage_code,
    observed_stage_confidence: perception.stage_observation.confidence,
    confirmed_observations: present
      .filter((o) => o.confidence >= observationMinConfidence)
      .map((o) => ({ observation_code: o.observation_code, confidence: o.confidence })),
    tentative_observations: present
      .filter((o) => o.confidence < observationMinConfidence)
      .map((o) => ({ observation_code: o.observation_code, confidence: o.confidence })),
    hypothesis_priors: perception.candidate_problems
      .filter((c) => c.hypothesis_code)
      .map((c) => ({ hypothesis_code: c.hypothesis_code as string, confidence: c.confidence })),
    follow_up: perception.follow_up,
  };
}

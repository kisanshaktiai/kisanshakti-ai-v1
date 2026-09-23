/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHOTO PERCEPTION ENGINE — one server-side path for every diagnostic photo
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: supabase/functions/ai-agriculture-chat/photo/perception-engine.ts
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-09-23 — NEW. Replaces photo-analyzer.ts + photo-observation-mapper.ts
 *   and the ai-crop-scan vision prompts. The vision model PERCEIVES only
 *   (usable?, crop check, plant part, visible stage, canonical observation
 *   codes, unmapped signs, candidate problems). Severity, alerts, treatment,
 *   doses and timing come only from the Decision Brain's governed rules.
 *
 * Contract: ./diagnosis-contract.ts. Storage: evidence store v2
 * (crop_growth_uploads, crop_photo_diagnosis, crop_photo_diagnosis_photo,
 * crop_photo_annotation, land_observation, observation_vocabulary_gaps).
 * Model, fallback, detail level and prices come from
 * system_config.vision_diagnosis_policy — never from code. The engine fails
 * closed when that policy is disabled or incomplete.
 *
 * Crop-agnostic and language-agnostic: every vocabulary (crops, stages,
 * observations, plant parts, hypotheses) is read from the database for the
 * land's own crop; the model writes English descriptions only (stored
 * evidence); the farmer-facing wording is produced later by the brain in the
 * farmer's language.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { AI_ENDPOINTS, buildAIRequest, getAPIKey } from '../../_shared/aiConfig.ts';
import {
  DIAGNOSIS_ENGINE_VERSION,
  PERCEPTION_JSON_SCHEMA,
  RETAKE_REASONS,
  buildBrainPhotoEvidence,
  validatePerception,
  type BrainPhotoEvidence,
  type CapturePurpose,
  type DiagnosePhotoResponse,
  type PerceptionContext,
  type PerceptionOutput,
  type PerceptionUsage,
  type ShotRole,
} from './diagnosis-contract.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

interface VisionPolicy {
  enabled: boolean;
  primary_model: string | null;
  fallback_model: string | null;
  image_detail: 'low' | 'high' | 'auto' | null;
  max_output_tokens: number | null;
  timeout_ms: number | null;
  price_usd_per_1m: Record<string, { input?: number; cached_input?: number; output?: number }>;
  prompt_version: string | null;
}

interface PhotoPolicy {
  max_photos_per_diagnosis: number;
  observation_min_confidence: number;
  vocabulary: { universal_observation_types: string[]; require_farmer_observable: boolean };
}

const SIGNED_URL_TTL_SECONDS = 600;
const OBS_DESCRIPTION_MAX = 90;

async function loadPolicies(sb: Db): Promise<{ vision: VisionPolicy | null; photo: PhotoPolicy | null }> {
  const { data, error } = await sb
    .from('system_config')
    .select('config_key, config_value')
    .in('config_key', ['vision_diagnosis_policy', 'photo_diagnosis_policy']);
  if (error || !Array.isArray(data)) return { vision: null, photo: null };
  const byKey = new Map<string, any>(data.map((r: any) => [r.config_key, r.config_value]));
  return {
    vision: (byKey.get('vision_diagnosis_policy') as VisionPolicy) ?? null,
    photo: (byKey.get('photo_diagnosis_policy') as PhotoPolicy) ?? null,
  };
}

function visionPolicyUsable(p: VisionPolicy | null): p is VisionPolicy & { primary_model: string } {
  return !!p && p.enabled === true && typeof p.primary_model === 'string' && p.primary_model.length > 0
    && typeof p.max_output_tokens === 'number' && typeof p.timeout_ms === 'number';
}

// ── Vocabulary for the land's crop, all from the database ──────────────────

async function buildPerceptionContext(
  sb: Db,
  cropValue: string,
  photoRoles: ShotRole[],
  photo: PhotoPolicy,
): Promise<PerceptionContext> {
  const { data: cropRow } = await sb.from('crops').select('id, value, crop_group_id').eq('value', cropValue).maybeSingle();
  let groupKey: string | null = null;
  if (cropRow?.crop_group_id) {
    const { data: g } = await sb.from('crop_groups').select('group_key').eq('id', cropRow.crop_group_id).maybeSingle();
    groupKey = g?.group_key ?? null;
  }
  const scopes = [cropValue, groupKey].filter(Boolean) as string[];

  const obsSelect = 'observation_code, description, affected_plant_part';
  let cropScoped = sb.from('observation_master').select(obsSelect).eq('is_active', true)
    .or(`crop_group.in.(${scopes.join(',')}),applicable_crop_groups.ov.{${scopes.join(',')}}`);
  let universal = sb.from('observation_master').select(obsSelect).eq('is_active', true)
    .eq('crop_group', 'universal')
    .in('observation_type', photo.vocabulary.universal_observation_types);
  if (photo.vocabulary.require_farmer_observable) {
    cropScoped = cropScoped.eq('is_farmer_observable', true);
    universal = universal.eq('is_farmer_observable', true);
  }

  const [cropObs, uniObs, stages, hyps, crops, parts] = await Promise.all([
    cropScoped,
    universal,
    sb.from('crop_stage_master').select('stage_code').eq('crop_code', cropValue),
    sb.from('hypothesis_master').select('hypothesis_id, cause_name_en').eq('crop_code', cropValue).eq('is_active', true),
    sb.from('crops').select('value'),
    sb.from('observation_master').select('affected_plant_part').not('affected_plant_part', 'is', null),
  ]);

  const obsMap = new Map<string, { code: string; label_en: string; plant_part: string | null }>();
  for (const r of [...(cropObs.data ?? []), ...(uniObs.data ?? [])]) {
    if (!obsMap.has(r.observation_code)) {
      obsMap.set(r.observation_code, {
        code: r.observation_code,
        label_en: String(r.description ?? r.observation_code).slice(0, OBS_DESCRIPTION_MAX),
        plant_part: r.affected_plant_part ?? null,
      });
    }
  }

  return {
    registered_crop_code: cropValue,
    allowed_crop_codes: Array.from(new Set((crops.data ?? []).map((c: any) => c.value).filter(Boolean))),
    allowed_plant_part_codes: Array.from(new Set((parts.data ?? []).map((p: any) => p.affected_plant_part))),
    allowed_stage_codes: Array.from(new Set((stages.data ?? []).map((s: any) => s.stage_code).filter(Boolean))),
    allowed_observations: Array.from(obsMap.values()),
    allowed_hypotheses: (hyps.data ?? []).map((h: any) => ({ code: h.hypothesis_id, label_en: h.cause_name_en })),
    photo_roles: photoRoles,
  };
}

// ── Prompt: perception only, instruct by meaning ───────────────────────────

function buildMessages(ctx: PerceptionContext, imageUrls: string[], detail: string, farmerText: string | null) {
  const system = [
    'You examine field photographs for an agricultural decision system. Your job is PERCEPTION ONLY:',
    'describe what is visibly present. You never decide severity, urgency, alerts, treatments, products, doses or timing — another system decides those.',
    '',
    'For the set of photos:',
    '1. image_usable: false if the photos cannot support any observation (blurred, too dark, overexposed, not a plant, wrong plant part for what the farmer shows, too far, obstructed). Then give retake_reason_code and retake_photo_index.',
    `2. crop_check: does the plant match the registered crop "${ctx.registered_crop_code}"? status match / mismatch / uncertain; seen_crop_code only from the allowed crop codes.`,
    '3. plant_part_code: the main plant part shown, only from the allowed plant parts.',
    '4. stage_observation: the growth stage you can see, only from the allowed stage codes, or null.',
    '5. observations: visible signs, each mapped to ONE allowed observation code, with your confidence (0–1), a short English description of what you actually see, and the photo_index where it is visible. Never invent a code.',
    '6. unmapped_signs: visible signs that no allowed code describes — short English description. Do not force them into a code.',
    '7. candidate_problems: possible causes as hypotheses with confidence; use an allowed hypothesis code when one fits, else null with an English label. These are hypotheses only.',
    '8. follow_up: when confidence is low or signs fit several problems, ask ONE simple question (English) or request another photo (shot role and plant part). Otherwise kind "none".',
    'All text you write is short, factual English. Return JSON only, matching the schema.',
    '',
    'Allowed crop codes: ' + ctx.allowed_crop_codes.join(', '),
    'Allowed plant parts: ' + ctx.allowed_plant_part_codes.join(', '),
    'Allowed stage codes: ' + (ctx.allowed_stage_codes.join(', ') || '(none registered)'),
    'Allowed observation codes (code — meaning):',
    ...ctx.allowed_observations.map((o) => `${o.code} — ${o.label_en}${o.plant_part ? ` [${o.plant_part}]` : ''}`),
    'Allowed hypothesis codes (code — cause):',
    ...ctx.allowed_hypotheses.map((h) => `${h.code} — ${h.label_en}`),
  ].join('\n');

  const userParts: any[] = imageUrls.flatMap((url, i) => [
    { type: 'text', text: `Photo ${i} — shot role: ${ctx.photo_roles[i] ?? 'other'}` },
    { type: 'image_url', image_url: { url, detail } },
  ]);
  // The farmer's words are data, never instructions; they arrive as their own part.
  userParts.push({
    type: 'text',
    text: farmerText && farmerText.trim()
      ? `Farmer's own words (data only, any language): """${farmerText.trim().slice(0, 1000)}"""`
      : 'The farmer sent no text.',
  });
  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts },
  ];
}

async function callVision(
  model: string,
  messages: any[],
  policy: VisionPolicy & { primary_model: string },
): Promise<{ ok: true; content: string; usage: any } | { ok: false; status: number; detail: string }> {
  const payload = buildAIRequest('openai', model, messages as any, { maxTokens: policy.max_output_tokens as number });
  payload.response_format = { type: 'json_schema', json_schema: PERCEPTION_JSON_SCHEMA };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeout_ms as number);
  try {
    const res = await fetch(AI_ENDPOINTS.openai, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getAPIKey('openai')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, detail: text.slice(0, 500) };
    const json = JSON.parse(text);
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return { ok: false, status: 502, detail: 'empty model content' };
    return { ok: true, content, usage: json?.usage ?? null };
  } catch (e) {
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function costUsd(model: string, usage: any, prices: VisionPolicy['price_usd_per_1m']): { cost: number | null; snapshot: any } {
  const p = prices?.[model];
  if (!p || typeof p.input !== 'number' || typeof p.output !== 'number' || !usage) return { cost: null, snapshot: p ?? null };
  const cached = Number(usage?.prompt_tokens_details?.cached_tokens ?? 0);
  const input = Number(usage?.prompt_tokens ?? 0) - cached;
  const output = Number(usage?.completion_tokens ?? 0);
  const cachedPrice = typeof p.cached_input === 'number' ? p.cached_input : p.input;
  const cost = (input * p.input + cached * cachedPrice + output * p.output) / 1_000_000;
  return { cost: Math.round(cost * 1e6) / 1e6, snapshot: p };
}

// ── Public: run one diagnosis ───────────────────────────────────────────────

export interface RunPhotoDiagnosisArgs {
  farmerId: string;
  landId: string;
  purpose: CapturePurpose;
  photos: Array<{ upload_id: string; shot_role: ShotRole }>;
  taskId?: string | null;
  sessionId?: string | null;
  language: string;
  farmerText?: string | null;
}

export async function runPhotoDiagnosis(sb: Db, args: RunPhotoDiagnosisArgs): Promise<DiagnosePhotoResponse> {
  const { vision, photo } = await loadPolicies(sb);
  if (!photo) return { diagnosis_id: null, status: 'failed', error_code: 'PHOTO_POLICY_MISSING' };
  if (!Array.isArray(args.photos) || args.photos.length === 0 || args.photos.length > photo.max_photos_per_diagnosis) {
    return { diagnosis_id: null, status: 'failed', error_code: 'PHOTO_COUNT_INVALID' };
  }

  // Every photo must be this farmer's, on this land, and already uploaded.
  const ids = args.photos.map((p) => p.upload_id);
  const { data: uploads, error: upErr } = await sb
    .from('crop_growth_uploads')
    .select('id, land_id, farmer_id, storage_bucket, storage_path, crop_value, captured_at')
    .in('id', ids);
  if (upErr || !uploads || uploads.length !== ids.length) {
    return { diagnosis_id: null, status: 'failed', error_code: 'UPLOAD_NOT_FOUND' };
  }
  const byId = new Map<string, any>(uploads.map((u: any) => [u.id, u]));
  for (const u of uploads) {
    if (u.farmer_id !== args.farmerId || u.land_id !== args.landId || !u.storage_path) {
      return { diagnosis_id: null, status: 'failed', error_code: 'UPLOAD_OWNERSHIP_MISMATCH' };
    }
  }

  // Engine-run record first, so every attempt (including failures) is auditable.
  const { data: diag, error: diagErr } = await sb.from('crop_photo_diagnosis').insert({
    land_id: args.landId,
    task_id: args.taskId ?? null,
    purpose: args.purpose,
    chat_session_id: args.sessionId ?? null,
    language: args.language || 'und',
    farmer_text: args.farmerText ?? null,
    status: 'processing',
    engine_version: DIAGNOSIS_ENGINE_VERSION,
    prompt_version: vision?.prompt_version ?? null,
    model_requested: vision?.primary_model ?? null,
  }).select('id').single();
  if (diagErr || !diag) return { diagnosis_id: null, status: 'failed', error_code: 'DIAGNOSIS_INSERT_FAILED' };
  const diagnosisId: string = diag.id;

  const finish = async (fields: Record<string, unknown>, response: DiagnosePhotoResponse) => {
    await sb.from('crop_photo_diagnosis').update({ ...fields, completed_at: new Date().toISOString() }).eq('id', diagnosisId);
    return response;
  };

  const { error: linkErr } = await sb.from('crop_photo_diagnosis_photo').insert(
    args.photos.map((p, i) => ({ diagnosis_id: diagnosisId, upload_id: p.upload_id, photo_index: i, shot_role: p.shot_role })),
  );
  if (linkErr) return finish({ status: 'failed', error_code: 'PHOTO_LINK_FAILED', error_detail: linkErr.message },
    { diagnosis_id: diagnosisId, status: 'failed', error_code: 'PHOTO_LINK_FAILED' });

  // Crop identity is resolved by the database at capture; unresolved = fail closed.
  const cropValue: string | null = byId.get(ids[0])?.crop_value ?? null;
  if (!cropValue) {
    return finish({ status: 'crop_unresolved' }, { diagnosis_id: diagnosisId, status: 'crop_unresolved' });
  }
  if (!visionPolicyUsable(vision)) {
    return finish({ status: 'failed', error_code: 'VISION_POLICY_INCOMPLETE' },
      { diagnosis_id: diagnosisId, status: 'failed', error_code: 'VISION_POLICY_INCOMPLETE' });
  }

  // Signed read URLs (private bucket); a missing object fails here.
  const imageUrls: string[] = [];
  for (const p of args.photos) {
    const u = byId.get(p.upload_id);
    const { data: signed, error: signErr } = await sb.storage.from(u.storage_bucket).createSignedUrl(u.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      return finish({ status: 'failed', error_code: 'OBJECT_MISSING', error_detail: signErr?.message ?? null },
        { diagnosis_id: diagnosisId, status: 'failed', error_code: 'OBJECT_MISSING' });
    }
    imageUrls.push(signed.signedUrl);
  }
  await sb.from('crop_growth_uploads').update({ object_confirmed: true }).in('id', ids);

  const ctx = await buildPerceptionContext(sb, cropValue, args.photos.map((p) => p.shot_role), photo);
  const messages = buildMessages(ctx, imageUrls, vision.image_detail ?? 'auto', args.farmerText ?? null);

  const started = Date.now();
  let modelUsed = vision.primary_model;
  let fallbackUsed = false;
  let call = await callVision(modelUsed, messages, vision);
  if (!call.ok && vision.fallback_model) {
    console.warn(`[PHOTO_ENGINE] primary model failed (${call.status}) — trying fallback`);
    modelUsed = vision.fallback_model;
    fallbackUsed = true;
    call = await callVision(modelUsed, messages, vision);
  }
  const latency = Date.now() - started;
  if (!call.ok) {
    // A model outage is reported as a failure — never disguised as "retake photo".
    return finish({ status: 'failed', error_code: 'VISION_CALL_FAILED', error_detail: `${call.status} ${call.detail}`,
      model_used: modelUsed, fallback_used: fallbackUsed, latency_ms: latency },
      { diagnosis_id: diagnosisId, status: 'failed', error_code: 'VISION_CALL_FAILED' });
  }

  const priced = costUsd(modelUsed, call.usage, vision.price_usd_per_1m ?? {});
  const usage: PerceptionUsage = {
    model_requested: vision.primary_model,
    model_used: modelUsed,
    fallback_used: fallbackUsed,
    input_tokens: call.usage?.prompt_tokens ?? null,
    cached_input_tokens: call.usage?.prompt_tokens_details?.cached_tokens ?? null,
    output_tokens: call.usage?.completion_tokens ?? null,
    cost_usd: priced.cost,
    price_snapshot: priced.snapshot,
    latency_ms: latency,
  };
  const usageFields = {
    model_used: usage.model_used, fallback_used: usage.fallback_used, input_tokens: usage.input_tokens,
    cached_input_tokens: usage.cached_input_tokens, output_tokens: usage.output_tokens,
    cost_usd: usage.cost_usd, price_snapshot: usage.price_snapshot, latency_ms: usage.latency_ms,
  };

  let raw: unknown;
  try { raw = JSON.parse(call.content); } catch { raw = null; }
  const validated = validatePerception(raw, ctx);
  if (!validated.ok || !validated.perception) {
    return finish({ ...usageFields, status: 'failed', error_code: validated.error_code ?? 'PERCEPTION_SHAPE_INVALID' },
      { diagnosis_id: diagnosisId, status: 'failed', error_code: validated.error_code ?? 'PERCEPTION_SHAPE_INVALID' });
  }
  const perception = validated.perception;

  await writeEvidence(sb, {
    diagnosisId, landId: args.landId, photos: args.photos, byId, perception, ctx,
    rejected: validated.rejected_codes, modelUsed, promptVersion: vision.prompt_version ?? null,
    minConfidence: photo.observation_min_confidence,
  });

  if (!perception.image_usable) {
    return finish({ ...usageFields, status: 'retake_requested', perception, follow_up: perception.follow_up }, {
      diagnosis_id: diagnosisId, status: 'retake_requested',
      retake: { reason_code: perception.retake_reason_code, photo_index: perception.retake_photo_index },
    });
  }
  if (perception.crop_check.status === 'mismatch') {
    return finish({ ...usageFields, status: 'crop_mismatch', perception, follow_up: perception.follow_up }, {
      diagnosis_id: diagnosisId, status: 'crop_mismatch',
      crop_mismatch: { registered_crop_code: cropValue, seen_crop_code: perception.crop_check.seen_crop_code },
    });
  }
  return finish({ ...usageFields, status: 'completed', perception, follow_up: perception.follow_up },
    { diagnosis_id: diagnosisId, status: 'completed', follow_up: perception.follow_up });
}

// ── Evidence writes: annotations, land observations, vocabulary gaps ───────

async function writeEvidence(sb: Db, a: {
  diagnosisId: string; landId: string; photos: Array<{ upload_id: string; shot_role: ShotRole }>;
  byId: Map<string, any>; perception: PerceptionOutput; ctx: PerceptionContext;
  rejected: Array<{ field: string; value: string }>; modelUsed: string; promptVersion: string | null;
  minConfidence: number;
}) {
  const p = a.perception;
  const base = {
    diagnosis_id: a.diagnosisId, source_tier: 'model_proposed', labeller_type: 'model',
    labeller_ref: `${a.modelUsed}@${a.promptVersion ?? 'unversioned'}`,
    model_name: a.modelUsed, model_version: DIAGNOSIS_ENGINE_VERSION, prompt_version: a.promptVersion,
  };
  const uploadAt = (i: number) => a.photos[i]?.upload_id;
  // Symptom-level labels belong to the close-up; fall back to the first photo.
  const symptomIdx = a.photos.findIndex((x) => x.shot_role === 'symptom_closeup');
  const primaryUpload = uploadAt(symptomIdx >= 0 ? symptomIdx : 0);
  const rows: any[] = [];

  a.photos.forEach((ph, i) => {
    const quality = !p.image_usable && p.retake_photo_index === i && p.retake_reason_code ? p.retake_reason_code : 'usable';
    rows.push({ ...base, upload_id: ph.upload_id, annotation_type: 'image_quality', value_code: quality });
    if (p.crop_check.seen_crop_code) {
      rows.push({ ...base, upload_id: ph.upload_id, annotation_type: 'crop', value_code: p.crop_check.seen_crop_code,
        confidence: p.crop_check.confidence });
    }
    if (p.stage_observation.stage_code) {
      rows.push({ ...base, upload_id: ph.upload_id, annotation_type: 'growth_stage', value_code: p.stage_observation.stage_code,
        confidence: p.stage_observation.confidence });
    }
  });
  if (p.plant_part_code) rows.push({ ...base, upload_id: primaryUpload, annotation_type: 'plant_part', value_code: p.plant_part_code });
  for (const o of p.observations) {
    rows.push({ ...base, upload_id: uploadAt(o.photo_index), annotation_type: 'observation', value_code: o.observation_code,
      value_text: o.seen_en || null, confidence: o.confidence });
  }
  for (const u of p.unmapped_signs) {
    rows.push({ ...base, upload_id: uploadAt(u.photo_index), annotation_type: 'unmapped_sign', value_text: u.seen_en });
  }
  for (const c of p.candidate_problems) {
    if (c.hypothesis_code) {
      rows.push({ ...base, upload_id: primaryUpload, annotation_type: 'cause', value_code: c.hypothesis_code,
        value_text: c.label_en || null, confidence: c.confidence });
    }
  }
  if (rows.length) {
    const { error } = await sb.from('crop_photo_annotation').insert(rows);
    if (error) console.error('[PHOTO_ENGINE] annotation insert failed:', error.message);
  }

  // Confirmed observations become land evidence the farm-state bridge reads:
  // measurement_type = observation_code (build_land_farm_state keeps one row
  // per measurement_type), observation_category from observation_master.
  const confirmed = p.observations.filter((o) => o.confidence >= a.minConfidence);
  if (confirmed.length) {
    const { data: cats } = await sb.from('observation_master').select('observation_code, observation_category')
      .in('observation_code', confirmed.map((o) => o.observation_code));
    const catBy = new Map<string, string | null>((cats ?? []).map((c: any) => [c.observation_code, c.observation_category ?? null]));
    const { error } = await sb.from('land_observation').insert(confirmed.map((o) => {
      const up = a.byId.get(uploadAt(o.photo_index));
      return {
        land_id: a.landId,
        observed_at: up?.captured_at ?? new Date().toISOString(),
        measurement_type: o.observation_code,
        observation_code: o.observation_code,
        observation_category: catBy.get(o.observation_code) ?? null,
        value_text: o.seen_en || null,
        confidence: o.confidence,
        source: 'scan',
        media_url: up?.storage_path ?? null,
        photo_upload_id: up?.id ?? null,
        photo_diagnosis_id: a.diagnosisId,
      };
    }));
    if (error) console.error('[PHOTO_ENGINE] land_observation insert failed:', error.message);
  }

  // Unmapped signs and rejected codes are vocabulary work, never invented observations.
  const gaps = [
    ...p.unmapped_signs.map((u) => ({ raw: u.seen_en, kind: 'unmapped_sign', part: u.plant_part_code })),
    ...a.rejected.filter((r) => r.field.startsWith('observations')).map((r) => ({ raw: r.value, kind: 'rejected_code', part: null })),
  ];
  if (gaps.length) {
    const { error } = await sb.from('observation_vocabulary_gaps').upsert(gaps.map((g) => ({
      token_raw: g.raw,
      token_normalized: g.raw.trim().toLowerCase().replace(/\s+/g, ' '),
      language: 'en',
      source: 'PHOTO_VISION',
      metadata: { kind: g.kind, crop: a.ctx.registered_crop_code, plant_part: g.part, diagnosis_id: a.diagnosisId },
    })), { onConflict: 'token_normalized,language,source', ignoreDuplicates: true });
    if (error) console.error('[PHOTO_ENGINE] vocabulary gap upsert failed:', error.message);
  }
}

// ── Public: load a completed diagnosis for the brain turn ──────────────────

export async function loadPhotoEvidenceForTurn(
  sb: Db,
  args: { diagnosisId: string; farmerId: string; landId: string | null },
): Promise<BrainPhotoEvidence | null> {
  const { data: d } = await sb.from('crop_photo_diagnosis')
    .select('id, farmer_id, land_id, status, perception')
    .eq('id', args.diagnosisId).maybeSingle();
  if (!d || d.farmer_id !== args.farmerId || (args.landId && d.land_id !== args.landId)) return null;
  if (d.status !== 'completed' || !d.perception) return null;
  const { data: links } = await sb.from('crop_photo_diagnosis_photo').select('upload_id, photo_index')
    .eq('diagnosis_id', d.id).order('photo_index', { ascending: true });
  const { photo } = await loadPolicies(sb);
  if (!photo) return null;
  return buildBrainPhotoEvidence(
    d.perception as PerceptionOutput,
    d.id,
    (links ?? []).map((l: any) => l.upload_id),
    photo.observation_min_confidence,
  );
}

/** Link the Decision Brain's answer back to the diagnosis it came from. */
export async function recordDecisionForDiagnosis(
  sb: Db,
  args: { diagnosisId: string; farmerId: string; traceId: string; summary: Record<string, unknown> },
): Promise<void> {
  const { error } = await sb.from('crop_photo_diagnosis')
    .update({ decision_trace_id: args.traceId, decision_summary: args.summary })
    .eq('id', args.diagnosisId).eq('farmer_id', args.farmerId);
  if (error) console.error('[PHOTO_ENGINE] decision link failed:', error.message);
}

export { RETAKE_REASONS };

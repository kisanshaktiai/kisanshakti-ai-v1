/**
 * General Scan (land-less identification) — validator, server status rule,
 * and route guards. REPO: kisanshaktiai/kisanshakti-ai-v1
 * PATH: tests/unit/generalScan.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../supabase/functions/ai-agriculture-chat/photo/perception-engine.ts', () => ({
  runPhotoDiagnosis: vi.fn(),
  loadPolicies: vi.fn(),
  visionPolicyUsable: vi.fn(),
}));
const { runGeneralScan } = vi.hoisted(() => ({
  runGeneralScan: vi.fn(async (..._args: unknown[]) => ({ diagnosis_id: 'd-1', status: 'completed' })),
}));
vi.mock('../../supabase/functions/ai-agriculture-chat/photo/general-scan.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runGeneralScan,
}));

import {
  applyRegulatoryGate, checkLocalLanguage, decideGeneralStatus, dropForeignLocalNames, languageInfo,
  localTextSlots, scriptShare, validateGeneralScan, withholdProductsUnlessSure,
} from '../../supabase/functions/ai-agriculture-chat/photo/general-scan';
import { handlePhotoAction } from '../../supabase/functions/ai-agriculture-chat/photo/photo-routes';

const FARMER = '10197c15-786e-4aff-acab-2d94b2ff8e59';
const TENANT = '20197c15-786e-4aff-acab-2d94b2ff8e59';
const UPLOAD = '30197c15-786e-4aff-acab-2d94b2ff8e59';

function modelOutput(over: Record<string, unknown> = {}) {
  return {
    image_usable: true,
    retake_reason_code: null,
    retake_photo_index: null,
    observed_features_en: ['  elongated grey lesions  ', '', 'yellow halo'],
    category: 'fungal_disease',
    primary: { common_name_en: 'Leaf blast', scientific_name: 'Pyricularia oryzae', local_name: null, confidence: 0.91, taxon_rank: 'species' },
    host_crop: { common_name_en: null, scientific_name: null, local_name: null, confidence: 0 },
    alternatives: [
      { common_name_en: 'Brown spot', scientific_name: 'Bipolaris oryzae', local_name: null, confidence: 0.2, category: 'fungal_disease', how_to_tell_apart_local: 'round brown spots' },
      { common_name_en: null, scientific_name: null, local_name: null, confidence: 0.1, category: 'unknown', how_to_tell_apart_local: null },
    ],
    farmer_card: {
      summary_local: 'summary', identification_marks_local: ['mark'], life_cycle_local: null,
      damage_or_role_local: 'damage', spread_conditions_local: null, field_checks_local: ['check'],
    },
    another_photo: { needed: false, shot_role: null, reason_local: null },
    management: {
      applicable: true,
      prevention_local: ['remove infected leaves'],
      biological: [{ agent: 'Pseudomonas fluorescens', how_local: 'seed treatment' }],
      chemical: [
        { active_ingredient: 'tricyclazole', moa_group: 'FRAC 16.1', how_local: 'at first spots' },
        { active_ingredient: '  ', moa_group: null, how_local: null },
      ],
      action_threshold_local: 'when spots appear',
      safety_local: 'wear gloves',
    },
    abstained: false,
    ...over,
  };
}

describe('validateGeneralScan', () => {
  it('accepts a well-formed result, trims text, drops empty names and unnamed host crop', () => {
    const v = validateGeneralScan(modelOutput(), 1);
    expect(v.ok).toBe(true);
    expect(v.identification?.observed_features_en).toEqual(['elongated grey lesions', 'yellow halo']);
    expect(v.identification?.host_crop).toBeNull();
    expect(v.identification?.alternatives).toHaveLength(1);
    expect(v.identification?.primary.taxon_rank).toBe('species');
  });

  it('fails closed on an unknown category or missing farmer card', () => {
    expect(validateGeneralScan(modelOutput({ category: 'alien' }), 1)).toMatchObject({ ok: false, error_code: 'GENERAL_SCAN_SHAPE_INVALID' });
    expect(validateGeneralScan(modelOutput({ farmer_card: null }), 1).ok).toBe(false);
    expect(validateGeneralScan(null, 1).ok).toBe(false);
  });

  it('keeps a retake index only when it points at a sent photo', () => {
    const bad = validateGeneralScan(modelOutput({ image_usable: false, retake_reason_code: 'blurred', retake_photo_index: 5, abstained: true }), 2);
    expect(bad.identification?.retake_photo_index).toBeNull();
    const good = validateGeneralScan(modelOutput({ image_usable: false, retake_reason_code: 'blurred', retake_photo_index: 1, abstained: true }), 2);
    expect(good.identification?.retake_photo_index).toBe(1);
    expect(good.identification?.retake_reason_code).toBe('blurred');
  });

  it('clamps confidence into 0..1', () => {
    const v = validateGeneralScan(modelOutput({ primary: { common_name_en: 'x', scientific_name: null, local_name: null, confidence: 7, taxon_rank: 'genus' } }), 1);
    expect(v.identification?.primary.confidence).toBe(1);
  });
});

describe('management from the model', () => {
  it('keeps prevention, agents and named ingredients; drops empty ingredients', () => {
    const m = validateGeneralScan(modelOutput(), 1).identification!.management;
    expect(m.applicable).toBe(true);
    expect(m.chemical.map((c) => c.active_ingredient)).toEqual(['tricyclazole']);
    expect(m.biological).toHaveLength(1);
  });

  it('carries no measures for a non-actionable category even when the model sent some', () => {
    const m = validateGeneralScan(modelOutput({ category: 'crop_plant' }), 1).identification!.management;
    expect(m).toMatchObject({ applicable: false, prevention_local: [], biological: [], chemical: [], safety_local: null });
  });

  it('fails closed when management is missing', () => {
    expect(validateGeneralScan(modelOutput({ management: null }), 1).ok).toBe(false);
  });

  it('withholds agents and ingredients unless the server marked the result completed', () => {
    const m = validateGeneralScan(modelOutput(), 1).identification!.management;
    expect(withholdProductsUnlessSure(m, 'completed')).toBe(m);
    const held = withholdProductsUnlessSure(m, 'needs_follow_up');
    expect(held).toMatchObject({ biological: [], chemical: [], products_withheld: 'not_sure' });
    expect(held.prevention_local).toEqual(m.prevention_local);
  });
});

describe('regulatory gate (chemical_regulatory_status)', () => {
  const base = (names: string[]) => ({
    applicable: true, prevention_local: [], biological: [], action_threshold_local: null, safety_local: null,
    chemical: names.map((n) => ({ active_ingredient: n, moa_group: 'model-guess', how_local: null })),
  });
  const reg = [
    { chemical_name: 'Monocrotophos', status: 'banned' },
    { chemical_name: 'methyl parathion', status: 'banned' },
    { chemical_name: 'paraquat', status: 'restricted' },
    { chemical_name: 'mancozeb', status: 'watch_list' },
  ];
  const rot = [{ chemical_name: 'Tricyclazole', moa_code: '16.1', moa_system: 'FRAC' }];

  it('removes banned and restricted ingredients, including inside a mixture, flags watch-list ones', () => {
    const out = applyRegulatoryGate(base(['monocrotophos', 'Methyl-parathion', 'chlorpyrifos + paraquat', 'mancozeb', 'tricyclazole', 'parathion-ethyl free name']), reg, rot);
    expect(out.chemical.map((c) => c.active_ingredient)).toEqual(['mancozeb', 'tricyclazole', 'parathion-ethyl free name']);
    expect(out.chemical[0].watch_list).toBe(true);
  });

  it('takes the mode-of-action group from chemical_rotation_group when listed', () => {
    const out = applyRegulatoryGate(base(['tricyclazole', 'azoxystrobin']), reg, rot);
    expect(out.chemical.map((c) => c.moa_group)).toEqual(['FRAC 16.1', 'model-guess']);
  });

  it('fails closed when the regulatory list cannot be read', () => {
    expect(applyRegulatoryGate(base(['tricyclazole']), null, rot)).toMatchObject({ chemical: [], products_withheld: 'regulatory_unavailable' });
  });
});

describe('farmer-language check (script from ICU, ratio from config)', () => {
  it('derives name and script from the code alone', () => {
    expect(languageInfo('mr')).toMatchObject({ code: 'mr', englishName: 'Marathi', script: 'Deva' });
    expect(languageInfo('ta').script).toBe('Taml');
    expect(languageInfo('not a code!').code).toBe('en');
  });

  it('flags English text written for a Marathi farmer and accepts Marathi text', () => {
    const info = languageInfo('mr');
    expect(checkLocalLanguage(['A fungal disease of rice leaves.'], info, 0.6)).toBe('mismatch');
    expect(checkLocalLanguage(['भाताच्या पानांवरील बुरशीजन्य रोग.'], info, 0.6)).toBe('ok');
    expect(scriptShare(['भात rice'], 'Deva')).toBeGreaterThan(0.3);
  });

  it('does not check Latin-script languages or when the ratio is not configured', () => {
    expect(checkLocalLanguage(['anything'], languageInfo('en'), 0.6)).toBe('not_checked');
    expect(checkLocalLanguage(['anything'], languageInfo('mr'), null)).toBe('not_checked');
  });

  it('drops a local name that is not in the farmer\'s script (never rewrites names)', () => {
    const id = validateGeneralScan(modelOutput({
      primary: { common_name_en: 'Leaf blast', scientific_name: null, local_name: 'Leaf blast', confidence: 0.9, taxon_rank: 'species' },
    }), 1).identification!;
    dropForeignLocalNames(id, languageInfo('mr'), 0.6);
    expect(id.primary.local_name).toBeNull();
  });

  it('lists every *_local text once and writes rewrites back in place', () => {
    const id = validateGeneralScan(modelOutput(), 1).identification!;
    const slots = localTextSlots(id);
    const texts = slots.map((s) => s.get());
    expect(texts).toContain('summary');
    expect(texts).toContain('remove infected leaves');
    expect(texts).toContain('at first spots');
    expect(texts).not.toContain('tricyclazole');
    slots.forEach((s, i) => s.set(`R${i}`));
    expect(id.farmer_card.summary_local).toBe('R0');
    expect(id.management.chemical[0].active_ingredient).toBe('tricyclazole');
  });
});

describe('decideGeneralStatus (server decides, floor comes from config)', () => {
  const base = { image_usable: true, abstained: false, category: 'weed' as const, primary: { common_name_en: 'x', scientific_name: null, local_name: null, confidence: 0.8, taxon_rank: 'species' } };
  it('unusable image → retake', () => expect(decideGeneralStatus({ ...base, image_usable: false }, 0.75)).toBe('retake_requested'));
  it('abstained → follow up', () => expect(decideGeneralStatus({ ...base, abstained: true }, 0.75)).toBe('needs_follow_up'));
  it('unknown category → follow up', () => expect(decideGeneralStatus({ ...base, category: 'unknown' }, 0.75)).toBe('needs_follow_up'));
  it('below floor → follow up', () => expect(decideGeneralStatus(base, 0.9)).toBe('needs_follow_up'));
  it('at or above floor → completed', () => expect(decideGeneralStatus(base, 0.8)).toBe('completed'));
});

describe('general scan routes', () => {
  const ctx = { supabase: { from: vi.fn() }, farmerId: FARMER, tenantId: TENANT, isServiceRole: false };
  const begin = {
    scan_scope: 'general', client_capture_id: '40197c15-786e-4aff-acab-2d94b2ff8e59', purpose: 'instascan', shot_role: 'symptom_closeup',
    content_sha256: 'a'.repeat(64), mime_type: 'image/jpeg', bytes: 1200, width_px: 100, height_px: 100, captured_at: '2026-11-22T10:00:00Z',
  };

  it('rejects an unknown scan scope', async () => {
    const r = await handlePhotoAction('diagnose_photo', { scan_scope: 'everything' }, ctx as never, {});
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe('PHOTO_REQUEST_INVALID');
  });

  it.each(['land_id', 'schedule_id', 'task_id'])('rejects a general upload that carries %s', async (key) => {
    const r = await handlePhotoAction('photo_begin_upload', { ...begin, [key]: UPLOAD }, ctx as never, {});
    expect(r.status).toBe(400);
    expect(ctx.supabase.from).not.toHaveBeenCalled();
  });

  it('refuses when the farmer/tenant identity is not resolved', async () => {
    const r = await handlePhotoAction('photo_begin_upload', begin, { ...ctx, farmerId: 'service', tenantId: 'service' } as never, {});
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('FARMER_NOT_RESOLVED');
  });

  it('routes a valid general diagnosis to the general engine with the guarded identity', async () => {
    const r = await handlePhotoAction('diagnose_photo', {
      scan_scope: 'general', purpose: 'instascan', language: 'mr', farmer_text: null,
      photos: [{ upload_id: UPLOAD, shot_role: 'symptom_closeup' }],
    }, ctx as never, {});
    expect(r.status).toBe(200);
    expect(runGeneralScan).toHaveBeenCalledWith(ctx.supabase, expect.objectContaining({ farmerId: FARMER, tenantId: TENANT, purpose: 'instascan' }));
  });

  it('rejects a general diagnosis that names a land', async () => {
    runGeneralScan.mockClear();
    const r = await handlePhotoAction('diagnose_photo', {
      scan_scope: 'general', land_id: UPLOAD, purpose: 'instascan', photos: [{ upload_id: UPLOAD, shot_role: 'symptom_closeup' }],
    }, ctx as never, {});
    expect(r.status).toBe(400);
    expect(runGeneralScan).not.toHaveBeenCalled();
  });
});

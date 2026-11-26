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
  applyRegulatoryGate, applyRegulatoryGateToSpray, buildGeneralMessages, checkLocalLanguage, cleanSprayPlan,
  decideGeneralStatus, dropForeignLocalNames, farmerLanguageLine, gateSprayPlan, GENERAL_SCAN_SYSTEM_PROMPT,
  languageInfo, localTextSlots, scriptShare, sprayDefaultsFrom, validateGeneralScan, withholdProductsUnlessSure,
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
      summary_local: 'summary', identification_marks_local: ['mark'],
      damage_or_role_local: 'damage', field_checks_local: ['check'],
    },
    root_cause: { primary_en: 'Pyricularia oryzae', contributing_factors_local: ['dew'], life_cycle_local: 'cycle' },
    spray_plan: {
      needed: true, water_volume: 200, water_unit: 'l_per_acre', clash_note_local: 'clash',
      components: [
        { role: 'fungicide', active_ingredient: 'tricyclazole', formulation: '75 WP', dose_value: 120, dose_unit: 'g_per_acre', phi_days: 21, moa_group: 'FRAC 16.1' },
        { role: 'adjuvant', active_ingredient: 'non-ionic surfactant', formulation: null, dose_value: 0.5, dose_unit: 'ml_per_litre', phi_days: null, moa_group: null },
      ],
    },
    another_photo: { needed: false, shot_role: null, reason_local: null },
    management: {
      applicable: true,
      prevention_local: ['remove infected leaves'],
      biological: [{ agent: 'Pseudomonas fluorescens', how_local: 'seed treatment' }],
      chemical: [
        { active_ingredient: 'tricyclazole', type: 'fungicide', application: 'foliar_spray', moa_group: 'FRAC 16.1', how_local: 'at first spots' },
        { active_ingredient: '  ', type: 'fungicide', application: 'foliar_spray', moa_group: null, how_local: null },
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

describe('v1.3 — product classes and spelling-proof banned list', () => {
  const comp = (o: Record<string, unknown>) => ({ role: 'fungicide', active_ingredient: 'x', formulation: null, dose_value: null,
    dose_unit: null, phi_days: null, moa_group: null, ...o });
  it('keeps the product class and application of each chemical; unknown values become null', () => {
    const m = validateGeneralScan(modelOutput(), 1).identification!.management;
    expect(m.chemical[0]).toMatchObject({ type: 'fungicide', application: 'foliar_spray' });
    const odd = validateGeneralScan(modelOutput({ category: 'animal_damage', management: {
      applicable: true, prevention_local: [], biological: [], action_threshold_local: null, safety_local: null,
      chemical: [{ active_ingredient: 'zinc phosphide', type: 'rodenticide', application: 'bait', moa_group: null, how_local: null },
        { active_ingredient: 'y', type: 'magic', application: 'air', moa_group: null, how_local: null }] } }), 1).identification!.management;
    expect(odd.chemical.map((c) => [c.type, c.application])).toEqual([['rodenticide', 'bait'], [null, null]]);
  });
  it('a rodenticide or molluscicide can never be a spray component', () => {
    const p = cleanSprayPlan({ needed: true, water_volume: 100, water_unit: 'l_per_acre', clash_note_local: null, components: [
      comp({ role: 'rodenticide', active_ingredient: 'zinc phosphide' }), comp({ role: 'molluscicide', active_ingredient: 'metaldehyde' }),
      comp({ role: 'micronutrient', active_ingredient: 'zinc sulphate' })] }, 'animal_damage', true);
    expect(p.components.map((c) => c.active_ingredient)).toEqual(['zinc sulphate']);
  });
  it('drops a live biopesticide from a tank that holds a fungicide', () => {
    const tank = (roles: string[]) => cleanSprayPlan({ needed: true, water_volume: 100, water_unit: 'l_per_acre', clash_note_local: null,
      components: roles.map((r) => comp({ role: r, active_ingredient: r })) }, 'fungal_disease', true).components.map((c) => c.role);
    expect(tank(['fungicide', 'biopesticide', 'biostimulant'])).toEqual(['fungicide', 'biostimulant']);
    expect(tank(['insecticide', 'biopesticide'])).toEqual(['insecticide', 'biopesticide']);
  });
  it('blocks a banned or restricted ingredient whatever the spelling', () => {
    const m = { applicable: true, prevention_local: [], biological: [], action_threshold_local: null, safety_local: null,
      chemical: ['Chlorpyriphos 20 EC', 'triazofos', 'paraquat dimethyl sulfate', 'profenofos + cypermethrin', 'azoxystrobin']
        .map((n) => ({ active_ingredient: n, type: null, application: null, moa_group: null, how_local: null })) };
    const reg = [{ chemical_name: 'chlorpyrifos', status: 'restricted' }, { chemical_name: 'triazophos', status: 'banned' },
      { chemical_name: 'paraquat dimethyl sulphate', status: 'banned' }, { chemical_name: 'profenophos', status: 'restricted' }];
    expect(applyRegulatoryGate(m, reg, []).chemical.map((c) => c.active_ingredient)).toEqual(['azoxystrobin']);
  });
  it('prompt @5 names every product class and bars baits and seed treatments from the tank', () => {
    for (const w of ['rodenticide', 'molluscicide', 'biopesticide', 'micronutrient', 'biostimulant', 'never in the spray plan', 'streptomycin or tetracycline'])
      expect(GENERAL_SCAN_SYSTEM_PROMPT).toContain(w);
  });
});

describe('regulatory gate (chemical_regulatory_status)', () => {
  const base = (names: string[]) => ({
    applicable: true, prevention_local: [], biological: [], action_threshold_local: null, safety_local: null,
    chemical: names.map((n) => ({ active_ingredient: n, type: null, application: null, moa_group: 'model-guess', how_local: null })),
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
    expect(texts).toContain('dew');
    expect(texts).toContain('cycle');
    expect(texts).toContain('clash');
    expect(texts).not.toContain('tricyclazole');
    slots.forEach((s, i) => s.set(`R${i}`));
    expect(id.farmer_card.summary_local).toBe('R0');
    expect(id.management.chemical[0].active_ingredient).toBe('tricyclazole');
  });
});

describe('v1.2 prompt — static, cache-friendly; language only in the user message', () => {
  it('system prompt is identical for every language and carries the agri gate and spray rules', () => {
    const mr = buildGeneralMessages(['data:x'], ['symptom_closeup'], 'high', 'mr', null);
    const ta = buildGeneralMessages(['data:x'], ['symptom_closeup'], 'high', 'ta', 'words');
    expect(mr[0].content).toBe(GENERAL_SCAN_SYSTEM_PROMPT);
    expect(ta[0].content).toBe(GENERAL_SCAN_SYSTEM_PROMPT);
    expect(GENERAL_SCAN_SYSTEM_PROMPT).toContain('STEP 0');
    expect(GENERAL_SCAN_SYSTEM_PROMPT).toContain('Do no arithmetic');
    // prompt @4 — live-audit fixes: paired dose/water, crop local name, full MoA codes.
    expect(GENERAL_SCAN_SYSTEM_PROMPT).toContain('same end of any range');
    expect(GENERAL_SCAN_SYSTEM_PROMPT).toContain('everyday crop name');
    expect(GENERAL_SCAN_SYSTEM_PROMPT).toContain('FRAC M03');
    expect((mr[1].content as Array<{ type: string; text?: string }>)[0].text).toBe(farmerLanguageLine('mr'));
    expect(farmerLanguageLine('mr')).toBe('Farmer language: Marathi (मराठी), code mr, script Deva.');
  });
});

describe('agri gate', () => {
  it('a non-farm photo keeps only the category and counts as a complete answer', () => {
    const v = validateGeneralScan(modelOutput({ category: 'not_agricultural', abstained: true }), 1).identification!;
    expect(v.farmer_card.summary_local).toBeNull();
    expect(v.alternatives).toEqual([]);
    expect(v.root_cause.contributing_factors_local).toEqual([]);
    expect(v.spray_plan.needed).toBe(false);
    expect(v.management.applicable).toBe(false);
    expect(decideGeneralStatus(v, 0.75)).toBe('completed');
  });
});

describe('spray plan (model copies the label; server keeps the tank sane)', () => {
  const comp = (o: Record<string, unknown>) => ({ role: 'fungicide', active_ingredient: 'x', formulation: null, dose_value: null,
    dose_unit: null, phi_days: null, moa_group: null, ...o });
  it('keeps label dose and unit as given, products before the adjuvant', () => {
    const p = validateGeneralScan(modelOutput(), 1).identification!.spray_plan;
    expect(p).toMatchObject({ needed: true, water_volume: 200, water_unit: 'l_per_acre', clash_note_local: 'clash' });
    expect(p.components.map((c) => [c.active_ingredient, c.dose_value, c.dose_unit, c.phi_days])).toEqual([
      ['tricyclazole', 120, 'g_per_acre', 21], ['non-ionic surfactant', 0.5, 'ml_per_litre', null]]);
  });
  it('drops granules, duplicate MoA groups, extra products and extra adjuvants; a dose needs a unit', () => {
    const p = cleanSprayPlan({ needed: true, water_volume: 150, water_unit: 'l_per_acre', clash_note_local: null, components: [
      comp({ active_ingredient: 'g1', formulation: '3 GR' }),
      comp({ active_ingredient: 'a', moa_group: 'FRAC 3', dose_value: 5, dose_unit: null }),
      comp({ active_ingredient: 'b', moa_group: 'frac-3' }),
      comp({ active_ingredient: 'c', role: 'insecticide', moa_group: 'IRAC 4A' }),
      comp({ active_ingredient: 'd', role: 'micronutrient' }),
      comp({ active_ingredient: 'e', role: 'acaricide', moa_group: 'IRAC 6' }),
      comp({ active_ingredient: 's1', role: 'adjuvant' }), comp({ active_ingredient: 's2', role: 'adjuvant' }),
    ] }, 'fungal_disease', true);
    expect(p.components.map((c) => c.active_ingredient)).toEqual(['a', 'c', 'd', 's1']);
    expect(p.components[0]).toMatchObject({ dose_value: null, dose_unit: null });
  });
  it('a herbicide is sprayed alone, and only for a weed', () => {
    const tank = { needed: true, water_volume: 150, water_unit: 'l_per_acre', clash_note_local: null, components: [
      comp({ active_ingredient: 'h', role: 'herbicide', moa_group: 'HRAC 9' }), comp({ active_ingredient: 'i', role: 'insecticide' }),
      comp({ active_ingredient: 's', role: 'adjuvant' })] };
    expect(cleanSprayPlan(tank, 'weed', true).components.map((c) => c.active_ingredient)).toEqual(['h', 's']);
    expect(cleanSprayPlan(tank, 'insect_pest', true).components.map((c) => c.active_ingredient)).toEqual(['i', 's']);
  });
  it('no plan for a non-actionable result, or when water has no unit the volume is dropped', () => {
    expect(cleanSprayPlan({ needed: true, components: [comp({})] }, 'crop_plant', false).needed).toBe(false);
    const p = cleanSprayPlan({ needed: true, water_volume: 150, water_unit: null, clash_note_local: null, components: [comp({})] }, 'fungal_disease', true);
    expect(p).toMatchObject({ needed: true, water_volume: null, water_unit: null });
  });
  it('withheld unless completed; doses removed when the crop is not named', () => {
    const p = validateGeneralScan(modelOutput(), 1).identification!.spray_plan;
    expect(gateSprayPlan(p, 'needs_follow_up', true)).toMatchObject({ needed: false, components: [], withheld: 'not_sure' });
    const noCrop = gateSprayPlan(p, 'completed', false);
    expect(noCrop.dose_withheld).toBe('crop_unknown');
    expect(noCrop.components.every((c) => c.dose_value === null)).toBe(true);
    expect(gateSprayPlan(p, 'completed', true)).toBe(p);
  });
  it('banned / restricted ingredients leave the tank; adjuvants pass; fails closed', () => {
    const p = cleanSprayPlan({ needed: true, water_volume: 150, water_unit: 'l_per_acre', clash_note_local: null, components: [
      comp({ active_ingredient: 'streptomycin + tetracycline', role: 'bactericide' }), comp({ active_ingredient: 'copper oxychloride' }),
      comp({ active_ingredient: 'sticker', role: 'adjuvant' })] }, 'bacterial_disease', true);
    const reg = [{ chemical_name: 'streptomycin', status: 'banned' }];
    const rot = [{ chemical_name: 'copper oxychloride', moa_code: 'M01', moa_system: 'FRAC' }];
    const out = applyRegulatoryGateToSpray(p, reg, rot);
    expect(out.components.map((c) => [c.active_ingredient, c.moa_group])).toEqual([['copper oxychloride', 'FRAC M01'], ['sticker', null]]);
    expect(applyRegulatoryGateToSpray(p, null, rot)).toMatchObject({ needed: false, withheld: 'regulatory_unavailable' });
    const onlyBanned = cleanSprayPlan({ needed: true, components: [comp({ active_ingredient: 'streptomycin' }), comp({ role: 'adjuvant' })] }, 'bacterial_disease', true);
    expect(applyRegulatoryGateToSpray(onlyBanned, reg, rot).needed).toBe(false);
  });
  it('spray defaults come from config and are all-or-nothing', () => {
    expect(sprayDefaultsFrom({ pump_sizes_l: [16, 18, 20], default_pump_l: 18, stock_l_per_pump: 1, stock_min_dilution: 10 }))
      .toEqual({ pump_sizes_l: [16, 18, 20], default_pump_l: 18, stock_l_per_pump: 1, stock_min_dilution: 10 });
    expect(sprayDefaultsFrom({ pump_sizes_l: [16], default_pump_l: 16 })).toBeNull();
    expect(sprayDefaultsFrom(null)).toBeNull();
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

  it.each([
    ['23503', 'land <NULL> not found or has no owner', 503, 'GENERAL_SCAN_NOT_CONFIGURED'],
    ['23503', 'general photo requires a farmer that belongs to the tenant', 500, 'PHOTO_REGISTER_FAILED'],
    ['57014', 'canceling statement due to statement timeout', 500, 'PHOTO_REGISTER_FAILED'],
  ])('classifies registration failure %s / %s without bypassing isolation', async (code, message, status, responseCode) => {
    const insert = vi.fn(async () => ({ error: { code, message } }));
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null })), insert,
    };
    const createSignedUploadUrl = vi.fn();
    const sb = { from: vi.fn(() => query), storage: { from: vi.fn(() => ({ createSignedUploadUrl })) } };
    const r = await handlePhotoAction('photo_begin_upload', begin, { ...ctx, supabase: sb }, {});
    expect(r.status).toBe(status);
    expect((await r.json()).code).toBe(responseCode);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ land_id: null, farmer_id: FARMER, tenant_id: TENANT, upload_type: 'general' }));
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
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

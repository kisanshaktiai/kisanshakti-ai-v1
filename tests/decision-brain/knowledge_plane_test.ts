// Knowledge Plane — deterministic DB fact answers (2026-10-10 surgical fix).
// Fixture rows are copied from the live project (qfklkkzxemsbeniyugiz) on
// 2026-10-10: rice crop row, rice crop_stage_master (both lanes),
// rice crop_stage_knowledge, rice etl_standards, approved/pending fertilizer
// rows, approved weed rows, chemical_regulatory_status rows.
// Run from repo root:
//   deno test --allow-read --allow-env --allow-net --no-lock --no-check tests/decision-brain/knowledge_plane_test.ts
import { makeMockSupabase } from './mock_supabase.ts';
import { assert, assertEquals } from './assert.ts';
import { queryKnowledgePlane } from '../../supabase/functions/ai-agriculture-chat/agents/knowledge-query-engine.ts';

const stageRow = (growth_stage: string, cultivation_method: string, phenology_index: number | null, das_min: number, das_max: number) => ({
  id: `${cultivation_method}_${growth_stage}`, crop_code: 'rice', growth_stage, stage_code: null,
  das_min, das_max, stage_description: null, phenology_index, cultivation_method, is_active: true,
});

const FIXTURE: Record<string, any[]> = {
  crops: [{
    value: 'rice', label: 'Rice', label_mr: 'भात / तांदूळ', label_hi: 'चावल / धान', label_ta: 'அரிசி / நெல்',
    description: null, season: 'kharif', duration_days: 120, is_active: true,
  }],
  crop_stage_master: [
    stageRow('germination', 'direct_seeded', 1.0, 0, 9),
    stageRow('seedling', 'direct_seeded', 2.0, 10, 20),
    stageRow('early_vegetative', 'direct_seeded', 2.5, 21, 34),
    stageRow('tillering', 'direct_seeded', 4.0, 35, 59),
    stageRow('panicle_initiation', 'direct_seeded', 5.0, 60, 74),
    stageRow('booting', 'direct_seeded', 6.0, 75, 89),
    stageRow('heading', 'direct_seeded', 7.0, 90, 99),
    stageRow('flowering', 'direct_seeded', 8.0, 100, 109),
    stageRow('grain_filling', 'direct_seeded', 9.0, 110, 129),
    stageRow('maturity', 'direct_seeded', 10.0, 130, 150),
    stageRow('harvest', 'direct_seeded', 11.0, 140, 160),
    stageRow('post_harvest', 'direct_seeded', 11.5, 160, 190),
    stageRow('nursery', 'transplanted', 1.5, 0, 24),
    stageRow('transplanting', 'transplanted', 3.0, 25, 35),
    stageRow('transplant_establishment', 'transplanted', 3.2, 0, 9),
    stageRow('tillering', 'transplanted', 4.0, 10, 34),
    stageRow('panicle_initiation', 'transplanted', 5.0, 35, 49),
    stageRow('booting', 'transplanted', 6.0, 50, 59),
    stageRow('heading', 'transplanted', 7.0, 60, 69),
    stageRow('flowering', 'transplanted', 8.0, 70, 79),
    stageRow('grain_filling', 'transplanted', 9.0, 80, 99),
    stageRow('maturity', 'transplanted', 10.0, 100, 115),
    stageRow('harvest', 'transplanted', 11.0, 110, 125),
    stageRow('post_harvest', 'transplanted', 11.5, 125, 155),
    { ...stageRow('land_preparation', 'transplanted', null, 15, 30) },
  ],
  crop_stage_knowledge: [
    { id: 'csk_gf', crop_code: 'rice', growth_stage: 'grain_filling',
      water: 'Maintain 2-3 cm water. Begin drainage 10-15 days before harvest.', fertilizer: 'No application.',
      pest_watch: ['BPH (hopper burn)'], disease_watch: ['Sheath rot', 'Grain discoloration'],
      critical_actions: ['Monitor BPH population'], avoid_actions: ['Early drainage'],
      source: 'icar_pop_seed', reviewed_by_agronomist: true },
    { id: 'csk_boot', crop_code: 'rice', growth_stage: 'booting',
      water: 'Maintain 5 cm standing water.', fertilizer: 'Top-dress 30 kg N per hectare as Urea.',
      pest_watch: ['bph_hopper_burn', 'ysb_dead_hearts', 'leaf_folder'], disease_watch: ['sheath_blight_expanding'],
      critical_actions: ['top_dress_N_at_booting'], avoid_actions: ['do_not_drain_field_at_booting'],
      source: 'rice_brain_fix_v2:ICAR-IIRR PoP 2024 §6.1', reviewed_by_agronomist: true },
    { id: 'csk_germ', crop_code: 'rice', growth_stage: 'germination',
      water: 'UNREVIEWED ROW — must never be served', fertilizer: null,
      pest_watch: ['Stem borer egg masses'], disease_watch: [], critical_actions: [], avoid_actions: [],
      source: 'pending agronomist review', reviewed_by_agronomist: false },
  ],
  etl_standards: [
    { id: 'etl_bph', pest_code: 'BPH', pest_name_en: 'Brown Planthopper', pest_name_hi: 'भूरा फुदका', pest_name_mr: 'तपकिरी तुडतुडा',
      crop_code: 'rice', growth_stage: ['tillering', 'panicle_initiation', 'booting', 'heading', 'flowering', 'grain_filling'],
      etl_value: 10, etl_unit: 'hoppers_per_hill', sampling_unit: 'hoppers per hill', action_threshold: 20,
      sampling_method: 'Sample 20 random hills; tap base of plant onto enamel tray and count BPH adults+nymphs.',
      icar_source: 'ICAR-IIRR Hyderabad AICRIP', is_active: true },
    { id: 'etl_wbph', pest_code: 'WBPH', pest_name_en: 'White-backed Planthopper', pest_name_hi: 'सफेद पीठ वाला फुदका', pest_name_mr: 'पांढरीपाठ तुडतुडा',
      crop_code: 'rice', growth_stage: ['tillering', 'panicle_initiation', 'booting'],
      etl_value: 5, etl_unit: 'hoppers_per_hill', sampling_unit: 'hoppers/hill', action_threshold: 10,
      sampling_method: 'Sample 20 random hills.', icar_source: 'ICAR-IIRR Hyderabad AICRIP', is_active: true },
    { id: 'etl_gundhi', pest_code: 'GUNDHI_BUG_RICE', pest_name_en: 'Gundhi Bug / Rice Earhead Bug', pest_name_hi: 'गंधी बग', pest_name_mr: 'गंधी ढेकूण',
      crop_code: 'rice', growth_stage: ['flowering', 'grain_filling'],
      etl_value: 1, etl_unit: 'bugs_per_hill', sampling_unit: 'bugs per hill', action_threshold: 2,
      sampling_method: 'Sample 20 random hills at panicle emergence to grain filling.', icar_source: 'ICAR-IIRR Hyderabad AICRIP', is_active: true },
    { id: 'etl_lf', pest_code: 'LEAF_FOLDER', pest_name_en: 'Leaf Folder', pest_name_hi: 'पत्ती लपेटक', pest_name_mr: 'पाने गुंडाळणारी अळी',
      crop_code: 'rice', growth_stage: ['tillering', 'panicle_initiation', 'booting'],
      etl_value: 1, etl_unit: 'damaged_leaves_per_hill', sampling_unit: 'damaged leaves per hill', action_threshold: 2,
      sampling_method: 'Sample 20 random hills.', icar_source: 'ICAR-IIRR Hyderabad AICRIP', is_active: true },
  ],
  pest_master: [
    { pest_code: 'BPH', pest_name_en: 'Brown Planthopper', pest_name_hi: 'भूरा फुदका', pest_name_mr: 'तपकिरी तुडतुडा', is_active: true },
    { pest_code: 'WBPH', pest_name_en: 'White-backed Planthopper', pest_name_hi: 'सफेद पीठ वाला फुदका', pest_name_mr: 'पांढरीपाठ तुडतुडा', is_active: true },
  ],
  fertilizer_recommendation_master: [
    { id: 'fert_rice', crop_code: 'rice', region_code: 'IN-MH', soil_fertility_class: 'medium',
      n_kg_ha: 100, p2o5_kg_ha: 50, k2o_kg_ha: 50,
      split_schedule: '[{"stage":"transplanting","nutrient":"N","percent":50},{"stage":"transplanting","nutrient":"P2O5","percent":100},{"stage":"transplanting","nutrient":"K2O","percent":50},{"stage":"tillering","nutrient":"N","percent":25},{"stage":"tillering","nutrient":"K2O","percent":25},{"stage":"panicle_initiation","nutrient":"N","percent":25},{"stage":"panicle_initiation","nutrient":"K2O","percent":25}]',
      cultivation_context: 'transplanted irrigated', source: 'MPKV Rahuri Paddy 100:50:50; N&K 50/25/25, P basal',
      authority: 'MPKV Rahuri', publication_year: 2020, confidence: 0.8, review_status: 'approved' },
    { id: 'fert_tomato', crop_code: 'tomato', region_code: 'IN-MH', soil_fertility_class: 'medium',
      n_kg_ha: 200, p2o5_kg_ha: 100, k2o_kg_ha: 100, split_schedule: '[]', cultivation_context: 'transplanted',
      source: 'TNAU (hybrid)', authority: 'TNAU', publication_year: 2024, confidence: 0.85, review_status: 'pending_agronomist' },
  ],
  weed_master: [
    { weed_code: 'echinochloa_crus_galli', scientific_name: 'Echinochloa crus-galli', common_names: ['barnyard grass', 'samak'],
      weed_type: 'grass', lifecycle: 'annual', season: 'kharif', crop_associations: ['rice'], resistance_notes: null,
      management_note: 'Rice mimic in early stages', source: 'ICAR-DWR', authority: 'ICAR-DWR', confidence: 0.85,
      review_status: 'approved', is_active: true },
    { weed_code: 'echinochloa_colona', scientific_name: 'Echinochloa colona', common_names: ['jungle rice'],
      weed_type: 'grass', lifecycle: 'annual', season: 'kharif', crop_associations: ['rice', 'maize', 'soybean'], resistance_notes: null,
      management_note: 'Co-dominant with E. crus-galli in Indian rice', source: 'ICAR-DWR', authority: 'ICAR-DWR', confidence: 0.85,
      review_status: 'approved', is_active: true },
    { weed_code: 'cynodon_dactylon', scientific_name: 'Cynodon dactylon', common_names: ['bermuda grass', 'doob'],
      weed_type: 'grass', lifecycle: 'perennial', season: 'all_season', crop_associations: ['sugarcane', 'cotton', 'orchards', 'all crops'],
      resistance_notes: null, management_note: 'Stoloniferous perennial; survives tillage', source: 'ICAR-DWR', authority: 'ICAR-DWR',
      confidence: 0.9, review_status: 'approved', is_active: true },
    { weed_code: 'parthenium_hysterophorus', scientific_name: 'Parthenium hysterophorus', common_names: ['congress grass', 'gajar ghas'],
      weed_type: 'broadleaf', lifecycle: 'annual', season: 'all_season', crop_associations: ['fallows', 'field bunds', 'all crops (edge ingress)'],
      resistance_notes: null, management_note: 'Invasive alien; health hazard', source: 'ICAR-DWR', authority: 'ICAR-DWR',
      confidence: 0.9, review_status: 'approved', is_active: true },
    { weed_code: 'phalaris_minor', scientific_name: 'Phalaris minor', common_names: ['littleseed canarygrass', 'gulli danda'],
      weed_type: 'grass', lifecycle: 'annual', season: 'rabi', crop_associations: ['wheat'], resistance_notes: 'Herbicide rotation mandatory.',
      management_note: 'Rice-wheat system weed', source: 'ICAR-DWR / PAU', authority: 'ICAR-DWR/PAU', confidence: 0.9,
      review_status: 'approved', is_active: true },
  ],
  chemical_regulatory_status: [
    { id: 'chem_24d', chemical_name: '2,4-d', status: 'restricted', regulatory_body: 'CIB&RC', ban_date: null,
      reason: 'License required - hormonal herbicide', source_ref: 'NPOP Annex 3 review 2026-08-20.', effective_from: null },
    { id: 'chem_alachlor', chemical_name: 'alachlor', status: 'banned', regulatory_body: 'CIB&RC', ban_date: null,
      reason: 'Carcinogenic herbicide', source_ref: null, effective_from: null },
  ],
};

// The live land of the audit: rice, direct seeded, grain filling, 122 DAS.
const LAND = {
  current_crop: 'Rice', growth_stage: 'grain_filling', days_since_sowing: 122,
  state: 'Maharashtra', soil_type: null, cultivation_method: 'direct_seeded',
};

function run(message: string, subject: any, opts: { language?: string; land?: any } = {}) {
  const { client } = makeMockSupabase(FIXTURE);
  return queryKnowledgePlane({
    farmer_message: message,
    language: opts.language ?? 'en',
    intent_code: 'GENERAL_CROP_INFO',
    intent_category: 'GENERAL',
    execution_mode: 'KNOWLEDGE',
    knowledge_subject: subject,
    land_context: opts.land === undefined ? LAND : opts.land,
    supabase: client,
  });
}

Deno.test('K1 stage list follows the land lane (direct seeded) and marks the current stage', async () => {
  const r = await run('rice growth stages?', 'STAGE');
  assert(r.handled, 'handled');
  assertEquals(r.response_type, 'CROP_STAGE_KNOWLEDGE');
  const text = String(r.response);
  assert(text.includes('Crop stages of RICE (direct seeded):') || /Crop stages of .* \(direct seeded\):/.test(text), 'lane label: ' + text);
  assert(!text.includes('transplant_establishment') && !text.includes('- transplanting'), 'no transplanted-lane stage leaked');
  assert(text.includes('- tillering (35–59 days)'), 'DSR tillering window, not the transplanted 10–34');
  assert(!text.includes('(10–34 days)'), 'transplanted tillering window must not appear');
  assert(text.includes('- grain filling (110–129 days) ← your crop is here now'), 'current stage marked');
  assert(text.includes('Begin drainage 10-15 days before harvest'), 'reviewed current-stage guidance served');
  assertEquals((r.facts as any).stages.length, 12, 'twelve DSR stages');
});

Deno.test('K2 two lanes and the land lane unknown → no merged list, current-stage guidance only', async () => {
  const r = await run('growth stages', 'STAGE', { land: { ...LAND, cultivation_method: null } });
  assert(r.handled);
  const text = String(r.response);
  assert(!text.includes('Crop stages of'), 'no mixed-lane list: ' + text);
  assert(text.includes('Current stage: grain filling'), 'current stage guidance');
});

Deno.test('K3 unreviewed crop_stage_knowledge rows are never served', async () => {
  const r = await run('stage', 'STAGE', { land: { ...LAND, growth_stage: 'germination', days_since_sowing: 5 } });
  assert(r.handled);
  assert(!String(r.response).includes('UNREVIEWED ROW'), 'unreviewed row leaked');
});

Deno.test('K4 "which pests attack rice" (no pest named) → ICAR ETL list, current-stage pests first, local names', async () => {
  const r = await run('भातावर कोणत्या किडी येतात?', 'PEST', { language: 'mr' });
  assert(r.handled);
  assertEquals(r.response_type, 'PEST_KNOWLEDGE');
  const text = String(r.response);
  const lines = text.split('\n');
  assert(lines[0].startsWith('Main pests of'), text);
  assert(lines[1].includes('Brown Planthopper (तपकिरी तुडतुडा) — ETL 10 hoppers per hill (watch now at grain filling)'), lines[1]);
  assert(lines[2].includes('Gundhi Bug') && lines[2].includes('watch now'), 'second current-stage pest: ' + lines[2]);
  assert(text.includes('Leaf Folder (पाने गुंडाळणारी अळी) — ETL 1 damaged leaves per hill'), 'non-current pests listed too');
  assert(!lines[3].includes('watch now') && !lines[4].includes('watch now'), 'only grain-filling pests are flagged');
});

Deno.test('K5 a named pest → identity, stages, ETL, action threshold, how to check', async () => {
  const r = await run('what is BPH', 'PEST');
  assert(r.handled);
  const text = String(r.response);
  assert(text.startsWith('Pest: Brown Planthopper (BPH)'), text);
  assert(text.includes('this includes your crop\'s current stage'), 'current stage note');
  assert(text.includes('Economic threshold level (ETL): 10 hoppers per hill'), 'ETL');
  assert(text.includes('Action threshold: 20 hoppers per hill'), 'action threshold');
  assert(text.includes('How to check: Sample 20 random hills'), 'sampling');
  assertEquals((r.provenance as any)[0].table, 'etl_standards');
});

Deno.test('K6 approved fertilizer row → readable split schedule (no raw JSON)', async () => {
  const r = await run('rice fertilizer', 'FERTILIZER');
  assert(r.handled);
  assertEquals(r.response_type, 'FERTILIZER_KNOWLEDGE');
  const text = String(r.response);
  assert(!text.includes('[{'), 'raw JSON leaked: ' + text);
  assert(text.includes('N: 100 kg/ha') && text.includes('P2O5: 50 kg/ha') && text.includes('K2O: 50 kg/ha'), 'NPK');
  assert(text.includes('at transplanting: N 50%, P2O5 100%, K2O 50%; at tillering: N 25%, K2O 25%; at panicle initiation: N 25%, K2O 25%'), text);
  assert(text.includes('Cultivation context: transplanted irrigated'), 'context stays visible');
});

Deno.test('K7 fertilizer row still pending agronomist review → evidence gap, never served', async () => {
  const r = await run('tomato fertilizer', 'FERTILIZER', { land: { ...LAND, current_crop: 'tomato', growth_stage: 'flowering' } });
  assert(r.handled);
  assertEquals(r.response_type, 'KNOWLEDGE_GAP');
  assert(!String(r.response).includes('200'), 'pending dose leaked');
});

Deno.test('K8 weeds for rice include "all crops" and "all crops (edge ingress)" associations, not wheat-only weeds', async () => {
  const r = await run('weeds in rice', 'WEED');
  assert(r.handled);
  const codes = ((r.facts as any).weeds as any[]).map((w) => w.weed_code).sort();
  assertEquals(codes, ['cynodon_dactylon', 'echinochloa_colona', 'echinochloa_crus_galli', 'parthenium_hysterophorus']);
});

Deno.test('K9 chemical subject: named chemical → status; no chemical named → evidence gap (never crop facts)', async () => {
  const named = await run('is 2,4-D allowed?', 'CHEMICAL');
  assertEquals(named.response_type, 'CHEMICAL_STATUS');
  assert(String(named.response).includes('2,4-d: restricted'), String(named.response));
  const unnamed = await run('which herbicide is banned?', 'CHEMICAL');
  assertEquals(unnamed.response_type, 'KNOWLEDGE_GAP');
  assertEquals(unnamed.reason, 'NO_NAMED_CHEMICAL_IN_REGISTRY');
});

Deno.test('K10 crop subject → land crop facts, local label for any of the 14 languages', async () => {
  const mr = await run('ya ranat konate pik aahe', 'CROP', { language: 'mr' });
  assertEquals(mr.response_type, 'CROP_INFO');
  assert(String(mr.response).startsWith('Crop: भात / तांदूळ'), String(mr.response));
  assert(String(mr.response).includes('Your field: grain filling stage (122 days after sowing).'), String(mr.response));
  const ta = await run('which crop', 'CROP', { language: 'ta' });
  assert(String(ta.response).startsWith('Crop: அரிசி / நெல்'), 'label_ta used: ' + String(ta.response));
});

Deno.test('K11 non-KNOWLEDGE execution mode is never handled', async () => {
  const { client } = makeMockSupabase(FIXTURE);
  const r = await queryKnowledgePlane({
    farmer_message: 'BPH on my rice, what to spray', language: 'en', intent_code: 'PEST_PRESENCE_VISIBLE',
    execution_mode: 'DECISION', knowledge_subject: 'PEST', land_context: LAND, supabase: client,
  });
  assertEquals(r.handled, false);
});

Deno.test('K12 source guards: no target-language vocabulary in the engine; orchestrator wiring', async () => {
  const engine = await Deno.readTextFile(new URL('../../supabase/functions/ai-agriculture-chat/agents/knowledge-query-engine.ts', import.meta.url));
  assert(!/[ऀ-ॿ]/.test(engine), 'Devanagari text in knowledge-query-engine.ts');
  assert(!/_TERMS\s*=\s*\[/.test(engine), 'keyword term list in knowledge-query-engine.ts');
  const orchSource = await Deno.readTextFile(new URL('../../supabase/functions/ai-agriculture-chat/agents/orchestrator.ts', import.meta.url));
  // Code only — line comments (change logs) may name the old identifier.
  const orch = orchSource.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert(!/\bcurrentObservations\b/.test(orch), 'undeclared currentObservations is back (ReferenceError on every diagnostic turn)');
  assert(/farmerTextObsCount === 0 &&/.test(orch), 'Knowledge Plane gate must use farmer-text evidence');
  assert(/isAdvisoryLike && farmerTextObsCount > 0/.test(orch), 'advisory override must use farmer-text evidence');
  assert(!orch.includes('fallbackAdvice = `[i18n:'), 'raw i18n placeholder fallback is back');
});

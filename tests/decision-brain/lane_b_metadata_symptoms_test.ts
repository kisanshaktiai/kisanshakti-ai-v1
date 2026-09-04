// deno test --allow-read --allow-env --no-lock --node-modules-dir=none --no-check lane_b_metadata_symptoms_test.ts
// Reproduces live trace_mtmm5w7f_fldzgc (2026-09-04): "आता कोणते खत द्यावे", rice/booting/DAS 88.
// Induction enrichment produced symptoms=[AFFECTED_PART_LEAF, SEVERITY_MEDIUM] (metadata only);
// the DIRECT/0 contract held (text-only symptoms = 0) but Lane B eligibility used the raw
// enriched array and evaluated false → 0 rules → PHOTO_REQUEST.
import { assertEquals, assert } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const ev = await import(`${BASE}/runtime/evidence-classifier.ts`);

const LIVE_ENRICHED = ['AFFECTED_PART_LEAF', 'SEVERITY_MEDIUM'];          // from the live log
const LIVE_KEYS = ['CROP_IDENTIFIED','AFFECTED_PART_UNKNOWN','DISTRIBUTION_UNKNOWN','SEVERITY_UNKNOWN','TIMING_UNKNOWN','ACTION_NONE','PHOTO_NOT_PROVIDED'];

Deno.test('M1 enrichment metadata (AFFECTED_PART_LEAF, SEVERITY_MEDIUM) is NOT real evidence', () => {
  for (const c of LIVE_ENRICHED) assertEquals(ev.isRealObservation(c), false, c);
  const cls = ev.classifyEvidence(LIVE_ENRICHED);
  assertEquals(cls.real_symptom_count, 0); assertEquals(cls.ignored_metadata_count, 2);
});

Deno.test('M2 all live metadata keys are ignored; a real code and distribution_variability still count', () => {
  for (const c of LIVE_KEYS) assertEquals(ev.isRealObservation(c), false, c);
  assertEquals(ev.isRealObservation('k_deficiency_rice'), true);
  assertEquals(ev.isRealObservation('distribution_variability'), true); // real observation_master code — must not be swept by the regex
  assertEquals(ev.isRealObservation('AFFECTED_PART_ROOT'), false);
});

Deno.test('M3 Lane B eligibility as computed by the orchestrator: metadata-only symptoms → eligible', () => {
  // exact expression from agents/orchestrator.ts (post-fix), with the live inputs
  const inductionSymptoms = LIVE_ENRICHED.map((symbol) => ({ symbol }));
  const isSymptomFreeRoute = true;                 // route FERTILIZER_NUTRITION is in symptomFreeRoutes
  const directContractNoSymptoms = true;           // [DIRECT_CONTRACT_HELD] in the live log
  const textOnlySymptomCount = 0;                  // computed pre-enrichment in the live turn
  const hasSymptomsRaw = inductionSymptoms.length > 0;   // the pre-fix input: TRUE
  const real = inductionSymptoms.filter((s: any) => ev.isRealObservation(String(s?.symbol ?? s))).length;
  const preFix = (isSymptomFreeRoute || directContractNoSymptoms) && !hasSymptomsRaw && textOnlySymptomCount === 0;
  const postFix = (isSymptomFreeRoute || directContractNoSymptoms) && real === 0 && textOnlySymptomCount === 0;
  assertEquals(preFix, false);   // reproduces the live failure
  assertEquals(postFix, true);   // fix
});

Deno.test('M4 a real farmer symptom still disables Lane B (diagnosis owns the turn)', () => {
  const symptoms = [{ symbol: 'k_deficiency_rice' }, { symbol: 'SEVERITY_MEDIUM' }];
  const real = symptoms.filter((s) => ev.isRealObservation(s.symbol)).length;
  assert(real === 1);
  const eligible = true && real === 0 && 1 === 1;
  assertEquals(eligible, false);
});

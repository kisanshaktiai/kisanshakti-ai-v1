// 2026-09-09 — the LLM is an EXPLAINER: it may reword the DB facts, never add agronomy or numbers.
import { assertEquals, assert } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const ac = await import(`${BASE}/agents/advisor-card.ts`);
const decision = { primary_decision: { rule_id: 'RICE_IRRIG_DROUGHT_RESPONSE_001', action_type: 'urgent_action', cause: 'Water stress',
  application_details: { action_text: 'IRRIGATE IMMEDIATELY. If irrigation is impossible, spray potassium sulphate 1%.',
    reason_text: 'Rolled leaves and dry soil mean the crop cannot take up water.', active_ingredient: 'Potassium Sulphate (foliar)',
    dosage_per_acre: '2 kg per acre in 200 L water (1% foliar spray)', application_method: 'foliar_spray', water_volume_per_acre: '200 L/acre',
    phi_days: null, success_indicators: ['Leaves unroll within 2–3 days of irrigation'],
    failure_indicators: ['Leaves stay rolled after two irrigations'], organic_alternative: 'Mulch the field and irrigate at night',
    alternatives: ['Alternate furrow irrigation'], roi_yield_gain_pct: 12, input_cost_per_acre_min: 300, input_cost_per_acre_max: 500,
    scientific_source: 'ICAR-IIRR rice PoP — water management', scientific_basis: 'Moisture stress at heading causes sterility',
    university_source: 'TNAU', mode_of_action: 'improves stomatal regulation', resistance_group: null, regulatory_status: 'approved',
    phi_source: 'PHI not applicable (nutrient spray)', knowledge_text: 'brain-only differential note' } }, secondary_decisions: [], blocked_actions: [] };
const supa = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) };
Deno.test('AC1 no explainer → template card keeps DB facts in the fixed order', async () => {
  const c = await ac.buildAdvisorCard({ decision, lang: 'mr', supabase: supa, landContext: { area_acres: 0.72 } });
  assert(c); assertEquals(c!.kind, 'ADVICE'); assertEquals(c!.source.explained_by, 'FACTS_ONLY');
  assert(c!.why.includes('cannot take up water')); assert(c!.how_lines.some(l => l.includes('2 kg per acre')));
});
Deno.test('AC2 explainer output with an invented dose is REJECTED (template used)', async () => {
  const llm = async () => JSON.stringify({ what_happened: 'x', why: 'y', how_to_fix: 'फवारणी करा', how_lines: ['युरिया 5 kg प्रति एकर'] });
  const c = await ac.buildAdvisorCard({ decision, lang: 'mr', supabase: supa, landContext: { area_acres: 0.72 }, llm });
  assertEquals(c!.source.explained_by, 'FACTS_ONLY');
});
Deno.test('AC3 explainer output that only rewords the facts is ACCEPTED, incl. land-scaled total', async () => {
  const llm = async () => JSON.stringify({ what_happened: 'पिकाला पाण्याचा ताण आहे', why: 'पानं गुंडाळली आहेत', how_to_fix: 'लगेच पाणी द्या',
    how_lines: ['पोटॅशियम सल्फेट — 2 kg प्रति एकर (तुमच्या 0.72 एकरसाठी 1.44 kg)'] });
  const c = await ac.buildAdvisorCard({ decision, lang: 'mr', supabase: supa, landContext: { area_acres: 0.72 }, llm });
  assertEquals(c!.source.explained_by, 'LLM');
  assert(c!.how_lines[0].includes('1.44'));
});
Deno.test('AC4 a block rule renders as DO_NOT with no product/how lines', async () => {
  const blk = { primary_decision: { rule_id: 'RICE_NUTR_LATE_N_BLOCK_001', action_type: 'block',
    application_details: { rule_intent: 'block', action_text: 'Do not apply nitrogen after booting', reason_text: 'Late N causes lodging and disease' } }, secondary_decisions: [], blocked_actions: [] };
  const c = await ac.buildAdvisorCard({ decision: blk, lang: 'mr', supabase: supa });
  assertEquals(c!.kind, 'DO_NOT'); assertEquals(c!.how_lines.length, 0);
});

Deno.test('AC5 explainability columns are wired: failure indicators, options, economics and provenance', async () => {
  const c = await ac.buildAdvisorCard({ decision, lang: 'mr', supabase: supa, landContext: { area_acres: 0.72 } });
  assert(c!.how_lines.some(l => l.includes('stay rolled')), 'failure_indicators must reach the farmer');
  assertEquals(c!.options.length, 2);                                   // alternatives + organic_alternative
  assertEquals(c!.economics?.yield_gain_pct, 12);
  assertEquals(c!.provenance.scientific_source, 'ICAR-IIRR rice PoP — water management');
  assertEquals(c!.provenance.university_source, 'TNAU');
  assertEquals(c!.provenance.mode_of_action, 'improves stomatal regulation');
  assertEquals(c!.provenance.regulatory_status, 'approved');
  assertEquals(c!.provenance.phi_source, 'PHI not applicable (nutrient spray)');
  // knowledge_text stays brain-only: it is carried for audit, never in the farmer text
  assertEquals(c!.provenance.knowledge_text, 'brain-only differential note');
  const farmerText = [c!.what_happened, c!.why, c!.how_to_fix, ...c!.how_lines].join(' ');
  assert(!farmerText.includes('brain-only differential note'), 'knowledge_text must not reach the farmer');
});

Deno.test('AC6 land context and greeting fallback reach the card (live cards had crop/stage/das null and a blank greeting)', async () => {
  const c = await ac.buildAdvisorCard({ decision, lang: 'mr', supabase: supa,
    landContext: { current_crop: 'rice', growth_stage: 'heading', days_since_sowing: 93, area_acres: 0.72 },
    greetingFallback: 'नमस्कार शेतकरी मित्रा' });
  assertEquals(c!.crop, 'rice'); assertEquals(c!.stage, 'heading'); assertEquals(c!.das, 93);
  assertEquals(c!.greeting, 'नमस्कार शेतकरी मित्रा');
});

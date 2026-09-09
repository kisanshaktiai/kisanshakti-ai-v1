// 2026-09-09 — layer 3 contract: the explainer may reword facts, never invent; verification is language-agnostic
// (no word lists, no per-language branches — the tests use an invented language code "zz" on purpose).
import { assertEquals, assert } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const ex = await import(`${BASE}/agents/explainer.ts`);
const frame = { kind: 'ADVICE', crop: 'rice', stage: 'heading', das: 91, area_acres: 0.72, rule_id: 'R1', facts: [
  { role: 'situation', gloss: 'Water stress' },
  { role: 'cause', gloss: 'Rolled leaves and dry soil mean the crop cannot take up water.' },
  { role: 'action', gloss: 'Irrigate immediately.' },
  { role: 'input', concept: 'product', gloss: 'Potassium Sulphate — 2 kg per acre in 200 L water', quantities: [{ value: 2, unit: 'kg' }, { value: 200, unit: 'L' }] },
  { role: 'safety', gloss: 'PHI 21 days', quantities: [{ value: 21, unit: 'days' }] },
]} as any;
const base = { greeting: '', what_happened: 'Water stress', why: 'dry soil', how_to_fix: 'Irrigate immediately.', how_lines: ['Potassium Sulphate — 2 kg per acre in 200 L water'], extras: [] };

Deno.test('EX1 numbers: fact values, land-scaled totals and DAS pass; anything else is an invention', () => {
  assertEquals(ex.numbersBacked('2 kg मध्ये 200 L पाणी, 21 days', frame).ok, true);
  assertEquals(ex.numbersBacked('तुमच्या 0.72 एकरसाठी 1.44 kg', frame).ok, true);   // 2 × 0.72
  const bad = ex.numbersBacked('युरिया 5 kg प्रति एकर', frame);
  assertEquals(bad.ok, false); assert(bad.offending.some((o: string) => o.startsWith('5')));
});
Deno.test('EX2 script integrity needs no vocabulary: only Latin words present in the FACTS are allowed', () => {
  const ok = ex.scriptIntegrity('पोटॅशियम सल्फेट 2 kg, 200 L पाणी', frame, false);
  assertEquals(ok.ok, true);                                   // kg / L appear in the facts
  const leak = ex.scriptIntegrity('BPH साठी top-dressing करा, ETL पहा', frame, false);
  assertEquals(leak.ok, false);
  for (const w of ['BPH', 'top-dressing', 'ETL']) assert(leak.leaks.some((l: string) => l.includes(w.split('-')[0])), `missed ${w}`);
});
Deno.test('EX3 a clean draft in an arbitrary language is accepted on the first pass', async () => {
  const llm = async (sys: string) => sys.startsWith('You check text')
    ? JSON.stringify({ flags: [] })
    : JSON.stringify({ greeting: 'ग', what_happened: 'पाण्याचा ताण', why: 'माती कोरडी', how_to_fix: 'लगेच पाणी द्या', how_lines: ['2 kg, 200 L'], extras: [] });
  const r = await ex.explainDecision({ frame, lang: 'zz', llm, factsOnlyCard: base });
  assertEquals(r.explained_by, 'LLM'); assertEquals(r.verification.attempts, 1);
});
Deno.test('EX4 leaked English + critic flags trigger ONE repair pass, then accept', async () => {
  let gen = 0;
  const llm = async (sys: string) => {
    if (sys.startsWith('You check text')) return JSON.stringify({ flags: gen === 1 ? [{ span: 'हॉपर्स', fix: 'तुडतुडे' }] : [] });
    gen++;
    return gen === 1
      ? JSON.stringify({ greeting: 'ग', what_happened: 'BPH हॉपर्स', why: 'x', how_to_fix: 'y', how_lines: ['2 kg, 200 L'], extras: [] })
      : JSON.stringify({ greeting: 'ग', what_happened: 'तुडतुडे', why: 'x', how_to_fix: 'y', how_lines: ['2 kg, 200 L'], extras: [] });
  };
  const r = await ex.explainDecision({ frame, lang: 'zz', llm, factsOnlyCard: base });
  assertEquals(r.explained_by, 'LLM_REPAIRED'); assertEquals(r.verification.attempts, 2);
  assert(!r.what_happened.includes('BPH'));
});
Deno.test('EX5 an invented number is never repaired — the facts-only card is served', async () => {
  const llm = async (sys: string) => sys.startsWith('You check text') ? JSON.stringify({ flags: [] })
    : JSON.stringify({ greeting: 'ग', what_happened: 'x', why: 'y', how_to_fix: 'z', how_lines: ['युरिया 5 kg प्रति एकर'], extras: [] });
  const r = await ex.explainDecision({ frame, lang: 'zz', llm, factsOnlyCard: base });
  assertEquals(r.explained_by, 'FACTS_ONLY'); assertEquals(r.verification.numbers_ok, false);
  assertEquals(r.how_lines, base.how_lines);
});
Deno.test('EX6 no LLM at all → facts-only card, never an empty reply', async () => {
  const r = await ex.explainDecision({ frame, lang: 'zz', llm: async () => { throw new Error('down'); }, factsOnlyCard: base });
  assertEquals(r.explained_by, 'FACTS_ONLY'); assertEquals(r.how_to_fix, 'Irrigate immediately.');
});

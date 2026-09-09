// 2026-09-07 — STAGE GATE: intent_assertion_pattern.stage_compatibility / das window now reach the contradiction engine
import { assertEquals } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const ce = await import(`${BASE}/runtime/contradiction-engine.ts`);
function mock(rows: any[]) {
  const q: any = { data: rows, error: null };
  q.select = () => q; q.eq = () => q; q.limit = () => Promise.resolve({ data: rows, error: null });
  return { from: () => q };
}
const HARVEST = { intent_code: 'HARVEST_TIMING', obs_code_regex: '.*', assertion_strength: 'LITERAL', notes: 'Stage gate', stage_compatibility: ['grain_filling','maturity','harvest'], crop_compatibility: null, das_min: null, das_max: null };
Deno.test('SG1 "when to harvest" at panicle initiation (DAS 60) → STAGE_MISMATCH with the allowed stages', async () => {
  const c = await ce.detectContradiction({ supabase: mock([HARVEST]), intent_code: 'HARVEST_TIMING', crop_code: 'rice', growth_stage: 'panicle_initiation', das: 60, trace_id: 't', observations: [] });
  assertEquals(c?.kind, 'STAGE_MISMATCH');
  assertEquals(c?.expected, ['grain_filling','maturity','harvest']);
});
Deno.test('SG2 the same question at grain filling (DAS 105) → no contradiction', async () => {
  const c = await ce.detectContradiction({ supabase: mock([HARVEST]), intent_code: 'HARVEST_TIMING', crop_code: 'rice', growth_stage: 'grain_filling', das: 105, trace_id: 't', observations: [] });
  assertEquals(c, null);
});
Deno.test('SG3 DAS window fires when the stage list passes but DAS is outside it', async () => {
  const row = { ...HARVEST, stage_compatibility: null, das_min: 90, das_max: 140 };
  const c = await ce.detectContradiction({ supabase: mock([row]), intent_code: 'HARVEST_TIMING', crop_code: 'rice', growth_stage: 'tillering', das: 40, trace_id: 't', observations: [] });
  assertEquals(c?.kind, 'STAGE_MISMATCH');
  assertEquals(c?.context_field, 'days_since_sowing');
});
Deno.test('SG4 an intent with no stage contract never fires', async () => {
  const row = { ...HARVEST, intent_code: 'FERTILIZER_SCHEDULE', stage_compatibility: null };
  const c = await ce.detectContradiction({ supabase: mock([row]), intent_code: 'FERTILIZER_SCHEDULE', crop_code: 'rice', growth_stage: 'tillering', das: 40, trace_id: 't', observations: [] });
  assertEquals(c, null);
});

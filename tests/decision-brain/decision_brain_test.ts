// deno test --allow-read --allow-env --no-lock --node-modules-dir=none --no-check decision_brain_test.ts
// Exercises the REAL branch modules (context-rule-selector.ts, conversation-state.ts,
// rule-repository.ts constant) against a fixture pulled from the live DB (all
// IN-MH/global CONTEXT rows plus a representative other-state subset; IOM rows for
// FERTILIZER_SCHEDULE / HARVEST_TIMING). No LLM, no network. The mock models only
// the PostgREST subset these modules use and throws on anything unmodelled.
import { assertEquals, assert } from './assert.ts';
import { makeMockSupabase } from './mock_supabase.ts';

const FIX = JSON.parse(await Deno.readTextFile(new URL('./fixture.json', import.meta.url)));
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const sel = await import(`${BASE}/decision/context-rule-selector.ts`);
const conv = await import(`${BASE}/runtime/conversation-state.ts`);
const repo = await import(`${BASE}/data/rule-repository.ts`);

const MH = { cropCode: 'rice', cultivationMethod: 'direct_seeded', regionCode: 'IN-MH' };
const rule = (id: string) => FIX.decision_rules.find((r: any) => r.rule_id === id);
/** Fixture copy where one row's is_safety_block is flipped — test-only; no new rule, no new agronomy. */
function withSafetyFlag(id: string, flag: boolean) {
  return { ...FIX, decision_rules: FIX.decision_rules.map((r: any) => r.rule_id === id ? { ...r, is_safety_block: flag } : r) };
}

// ── M0: mock fidelity guard — SERVABILITY_OR on the mock == SQL predicate row-for-row
Deno.test('M0 mock .or(SERVABILITY_OR) equals the SQL predicate on the fixture rows', async () => {
  const { client } = makeMockSupabase(FIX);
  const { data } = await client.from('decision_rules').select('*').eq('is_active', true).or(repo.SERVABILITY_OR);
  const expected = FIX.decision_rules.filter((r: any) => r.is_active && (r.is_farmer_servable || r.rule_intent === 'block' || r.is_safety_block === true)).map((r: any) => r.rule_id).sort();
  assertEquals(data.map((r: any) => r.rule_id).sort(), expected);
  assert(expected.length < FIX.decision_rules.length, 'fixture must hold at least one non-servable row');
});

// ── T1: DIRECT/0 advisory — conversation-state
Deno.test('T1 DIRECT/0, no farmer-text symptoms: pure route = ADVISORY (no clarification); synthetic-only codes flip to MIXED (the case the orchestrator exemption keeps on contract)', () => {
  const base = { trace_id: 't', intent: 'FERTILIZER_SCHEDULE', intent_confidence: 0.9, advisory_intent: true, confirmed: [], hypotheses: [], stage: 'grain_filling', stage_source: 'landContext', crop: 'RICE', das: 82, semantic_status: 'OK', authority_status: 'UNCONFIRMED' };
  const pure = conv.buildConversationState({ ...base, inferred: [] });
  assertEquals(pure.mode, 'ADVISORY');
  assertEquals(pure.clarification_required, false);
  const synthetic = conv.buildConversationState({ ...base, inferred: ['NDVI_HEALTHY'] });
  assertEquals(synthetic.mode, 'MIXED');
  assertEquals(synthetic.clarification_required, true);
});

// ── T2 / N1 / N2: Lane B for the real IN-MH rice land
const STAGES: [string, number][] = [['nursery', 10], ['transplanting', 28], ['tillering', 45], ['panicle_initiation', 65], ['booting', 78], ['heading', 85], ['grain_filling', 95], ['maturity', 115]];
Deno.test('T2/N1/N2 Lane B (IN-MH rice, direct_seeded): only global + IN-MH + servable/block rows across all stages', async () => {
  const { client } = makeMockSupabase(FIX);
  const table: Record<string, string[]> = {};
  for (const [stage, das] of STAGES) {
    const r = await sel.selectContextRules(client, { ...MH, growthStage: stage, das, traceId: 'T2' });
    table[stage] = r.applicable.map((x: any) => x.rule_id);
    for (const id of table[stage]) {
      const row = rule(id);
      assert(!row.region_code || row.region_code === 'IN-MH', `N2 wrong region: ${id} (${row.region_code})`);
      assert(row.is_farmer_servable || row.rule_intent === 'block' || row.is_safety_block === true, `N1 non-servable recommendation served: ${id}`);
    }
  }
  assertEquals(table['tillering'], ['RICE_NUTR_N_TOP1_001', 'RICE_NUTR_LCC_001']);
  assertEquals(table['grain_filling'], []);
  assert(!table['transplanting'].includes('RICE_NUTR_ORGANIC_001'), 'N1: RICE_NUTR_ORGANIC_001 is active but not farmer-servable');
});

// ── T2b / N3: missing land region — scoped excluded, global retained
Deno.test('T2b/N3 land region NULL: region-scoped rows excluded, global rows still eligible', async () => {
  const { client } = makeMockSupabase(FIX);
  const r = await sel.selectContextRules(client, { cropCode: 'rice', growthStage: 'tillering', das: 45, cultivationMethod: 'any', regionCode: null, traceId: 'T2b' });
  const ids = r.applicable.map((x: any) => x.rule_id);
  const scopedApplicable = ['RICE_PEST_ETL_MONITOR_TN_001', 'RICE_PEST_ETL_MONITOR_KL_001', 'RICE_IRRIG_WATER_MANAGEMENT_KL_001']; // would pass every non-region gate
  for (const id of scopedApplicable) { assert(rule(id).region_code, 'sanity'); assert(!ids.includes(id), `N3: region-scoped ${id} served with land region NULL`); }
  assert(ids.includes('RICE_NUTR_N_TOP1_001') && ids.includes('RICE_NUTR_LCC_001'), 'global rules must remain eligible when region is unknown');
  for (const id of ids) assert(!rule(id).region_code, `N3: ${id} has region_code=${rule(id).region_code}`);
  const blocks = await sel.selectContextBlocks(client, { cropCode: 'rice', growthStage: 'grain_filling', das: 82, cultivationMethod: 'any', regionCode: null });
  assertEquals(blocks.map((b: any) => b.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']); // global block stays eligible on the block path too
});

Deno.test('T2c region invariant matrix: scoped row IN-TN vs land IN-TN / IN-KA / NULL; global row vs land NULL', async () => {
  const { client } = makeMockSupabase(FIX);
  const has = async (regionCode: string | null, id: string) =>
    (await sel.selectContextRules(client, { cropCode: 'rice', growthStage: 'grain_filling', das: 95, cultivationMethod: 'any', regionCode })).applicable.some((x: any) => x.rule_id === id);
  assertEquals(await has('IN-TN', 'RICE_HARVEST_TIMING_TN_001'), true);
  assertEquals(await has('IN-KA', 'RICE_HARVEST_TIMING_TN_001'), false);
  assertEquals(await has(null, 'RICE_HARVEST_TIMING_TN_001'), false);
  const g = await sel.selectContextRules(client, { cropCode: 'rice', growthStage: 'tillering', das: 45, cultivationMethod: 'any', regionCode: null });
  assert(g.applicable.some((x: any) => x.rule_id === 'RICE_NUTR_N_TOP1_001'));
});

// ── T3 / N4 / N5 / N7: late-N block on a zero-candidate advisory turn
Deno.test('T3/N4/N5/N7 FERTILIZER_SCHEDULE @ grain_filling DAS 82, zero candidates: block relevant via IOM, leads as advisory, safety_blocks EMPTY, no treatment fabricated', async () => {
  const { client } = makeMockSupabase(FIX);
  const q = { ...MH, growthStage: 'grain_filling', das: 82, traceId: 'T3' };
  const gate = await sel.applyContextBlockGate(client, q, [], { intentCode: 'FERTILIZER_SCHEDULE', hypothesisIds: [], observationCodes: [] });
  const ev = gate.evaluations.find((e: any) => e.rule_id === 'RICE_NUTR_LATE_N_BLOCK_001');
  assert(ev && ev.intent_match && ev.relevant);
  assertEquals(ev.safety_authority, false);
  assertEquals(gate.advisoryResponses.map((r: any) => r.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
  assertEquals(gate.safetyBlocks.length, 0);                    // N4
  assertEquals(gate.conflictBlocks.length, 0);
  const out = sel.resolveContextGateOutcome(gate, { priorPrimary: null, zeroCandidateLaneB: true }); // orchestrator selection path
  assertEquals(out.nextPrimary?.rule_id, 'RICE_NUTR_LATE_N_BLOCK_001');
  assertEquals(out.advisoryLeadReason, 'zero_candidate_lane_b');
  assertEquals(out.safetyBlockEntries, []);                     // N5: cannot drive BLOCKED
  assertEquals(out.nextPrimary.action_type, 'block');           // N7: a block row, not a treatment
  assertEquals(out.nextPrimary.dosage_per_acre ?? null, null);  // N7: no dose fabricated
  assertEquals(out.nextMatched.map((m: any) => m.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
  const out2 = sel.resolveContextGateOutcome(gate, { priorPrimary: null, zeroCandidateLaneB: false }); // not Lane B → no lead
  assertEquals(out2.nextPrimary, null);
});

Deno.test('T3b HARVEST_TIMING @ grain_filling: late-N block not relevant → dropped, nothing leads', async () => {
  const { client } = makeMockSupabase(FIX);
  const gate = await sel.applyContextBlockGate(client, { ...MH, growthStage: 'grain_filling', das: 82 }, [], { intentCode: 'HARVEST_TIMING' });
  assertEquals(gate.dropped.map((r: any) => r.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
  const out = sel.resolveContextGateOutcome(gate, { priorPrimary: null, zeroCandidateLaneB: true });
  assertEquals(out.nextPrimary, null);
  assertEquals(out.safetyBlockEntries, []);
});

Deno.test('T3c tillering DAS 45: N_TOP1 + LCC kept, block not context-eligible, primary = candidate', async () => {
  const { client } = makeMockSupabase(FIX);
  const q = { ...MH, growthStage: 'tillering', das: 45 };
  const cands = (await sel.selectContextRules(client, q)).applicable.map(sel.toMatchedResponse);
  const gate = await sel.applyContextBlockGate(client, q, cands, { intentCode: 'FERTILIZER_SCHEDULE' });
  assertEquals(gate.kept.map((c: any) => c.rule_id), ['RICE_NUTR_N_TOP1_001', 'RICE_NUTR_LCC_001']);
  const out = sel.resolveContextGateOutcome(gate, { priorPrimary: cands[0], zeroCandidateLaneB: false });
  assertEquals(out.nextPrimary.rule_id, 'RICE_NUTR_N_TOP1_001');
  assertEquals(out.safetyBlockEntries, []);
});

// ── T5 / N4 / N6: explicit blocks_rule_ids conflict, both safety flavours
Deno.test('T5a explicit conflict, is_safety_block=false: LCC suppressed, block leads, safety_blocks EMPTY (A/B/C, N4/N5)', async () => {
  const { client } = makeMockSupabase(FIX);
  const q = { ...MH, growthStage: 'booting', das: 78 };
  const cands = (await sel.selectContextRules(client, q)).applicable.map(sel.toMatchedResponse);
  assertEquals(cands.map((c: any) => c.rule_id), ['RICE_NUTR_LCC_001']);
  const gate = await sel.applyContextBlockGate(client, q, cands, { intentCode: 'FERTILIZER_SCHEDULE' });
  assertEquals(gate.suppressed.map((c: any) => c.rule_id), ['RICE_NUTR_LCC_001']);
  assertEquals(gate.hardBlocks.map((b: any) => b.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
  assertEquals(gate.conflictBlocks.map((b: any) => b.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
  assertEquals(gate.safetyBlocks, []);
  const out = sel.resolveContextGateOutcome(gate, { priorPrimary: cands[0], zeroCandidateLaneB: false });
  assertEquals(out.nextPrimary.rule_id, 'RICE_NUTR_LATE_N_BLOCK_001');   // suppressed LCC never remains primary
  assertEquals(out.nextPrimary.is_safety_block, false);
  assertEquals(out.safetyBlockEntries, []);
  assertEquals(out.conflictBlockIds, ['RICE_NUTR_LATE_N_BLOCK_001']);
  assert(!out.nextMatched.some((m: any) => m.rule_id === 'RICE_NUTR_LCC_001'));
});

Deno.test('T5b same conflict, is_safety_block=true (test-only flag flip): suppression identical, block IS a safety block (N6)', async () => {
  const { client } = makeMockSupabase(withSafetyFlag('RICE_NUTR_LATE_N_BLOCK_001', true));
  const q = { ...MH, growthStage: 'booting', das: 78 };
  const cands = (await sel.selectContextRules(client, q)).applicable.map(sel.toMatchedResponse);
  const gate = await sel.applyContextBlockGate(client, q, cands, { intentCode: 'FERTILIZER_SCHEDULE' });
  assertEquals(gate.suppressed.map((c: any) => c.rule_id), ['RICE_NUTR_LCC_001']);
  assertEquals(gate.safetyBlocks.map((b: any) => b.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
  assertEquals(gate.conflictBlocks, []);
  const out = sel.resolveContextGateOutcome(gate, { priorPrimary: cands[0], zeroCandidateLaneB: false });
  assertEquals(out.nextPrimary.rule_id, 'RICE_NUTR_LATE_N_BLOCK_001');
  assertEquals(out.nextPrimary.is_safety_block, true);
  assertEquals(out.safetyBlockEntries.map((e: any) => e.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
  assertEquals(out.safetyBlockEntries[0].reason, 'CONTEXT_BLOCK');
});

Deno.test('T5c safety block, zero candidates, Lane B: standalone hard block leads; never an advisory lead', async () => {
  const { client } = makeMockSupabase(withSafetyFlag('RICE_NUTR_LATE_N_BLOCK_001', true));
  const gate = await sel.applyContextBlockGate(client, { ...MH, growthStage: 'grain_filling', das: 82 }, [], { intentCode: 'FERTILIZER_SCHEDULE' });
  assertEquals(gate.hardBlocks.map((b: any) => b.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
  assertEquals(gate.advisoryResponses, []);
  const out = sel.resolveContextGateOutcome(gate, { priorPrimary: null, zeroCandidateLaneB: true });
  assertEquals(out.advisoryLead, null);
  assertEquals(out.nextPrimary.rule_id, 'RICE_NUTR_LATE_N_BLOCK_001');
  assertEquals(out.safetyBlockEntries.map((e: any) => e.rule_id), ['RICE_NUTR_LATE_N_BLOCK_001']);
});

// ── T4: crop-agnostic shape
Deno.test('T4 crops with no CONTEXT rows (sugarcane, groundnut): Lane B and block gate return nothing; nothing invented', async () => {
  const { client } = makeMockSupabase(FIX);
  for (const crop of ['sugarcane', 'groundnut']) {
    const q = { cropCode: crop, growthStage: 'grand_growth', das: 120, cultivationMethod: 'any', regionCode: 'IN-MH' };
    assertEquals((await sel.selectContextRules(client, q)).applicable.length, 0);
    const g = await sel.applyContextBlockGate(client, q, [], { intentCode: 'FERTILIZER_SCHEDULE' });
    const out = sel.resolveContextGateOutcome(g, { priorPrimary: null, zeroCandidateLaneB: true });
    assertEquals(out.nextPrimary, null);
    assertEquals(out.nextMatched, []);
  }
});

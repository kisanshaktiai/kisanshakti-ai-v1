// Reproduces live trace_mtmoo4of_29uzwf: FERTILIZER_SCHEDULE lock filtered the LATE-N block.
import { assertEquals } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const il = await import(`${BASE}/agents/intent-lock.ts`);
const lock = il.lockIntent('FERTILIZER_SCHEDULE', 0.9, 'fert-test');
Deno.test('IL1 block action (RICE_NUTR_LATE_N_BLOCK_001.action_type=block) passes the FERTILIZER_SCHEDULE lock', () => {
  const r = il.filterActionsByIntentLock([{ action_type: 'block', rule_id: 'RICE_NUTR_LATE_N_BLOCK_001' }], lock);
  assertEquals(r.filtered_actions.length, 1);
});
Deno.test('IL2 no_action_required and ESCALATE_TO_EXPERT pass; a forbidden action still blocks', () => {
  assertEquals(il.validateActionType('no_action_required', lock).allowed, true);
  assertEquals(il.validateActionType('ESCALATE_TO_EXPERT', lock).allowed, true);
  const forb = (lock.forbidden_action_types || [])[0];
  if (forb) assertEquals(il.validateActionType(forb, lock).allowed, false);
});
Deno.test('IL3 an unrelated treatment action is still filtered for a fertilizer intent', () => {
  const r = il.validateActionType('SPRAY_PESTICIDE', lock);
  assertEquals(r.allowed, false);
});

// 2026-09-06 — loader PHI invariant: an unverified-PHI chemical must not be loaded even if is_farmer_servable=true
import { assertEquals, assert } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const repo = await import(`${BASE}/data/rule-repository.ts`);
Deno.test('PI1 constants: servability OR unchanged, invariant OR present', () => {
  assertEquals(repo.SERVABILITY_OR, 'is_farmer_servable.eq.true,rule_intent.eq.block,is_safety_block.eq.true');
  assert(repo.PHI_INVARIANT_OR.includes('active_ingredient.is.null'));
  assert(repo.PHI_INVARIANT_OR.includes('PHI_REQUIRED_VERIFIED') && repo.PHI_INVARIANT_OR.includes('PHI_NOT_APPLICABLE'));
  assert(!repo.PHI_INVARIANT_OR.includes('PHI_REQUIRED_UNVERIFIED'));
});
Deno.test('PI2 semantics on rows (mirrors the PostgREST OR): chemical+verified passes, chemical+unverified fails, non-product passes, block passes', () => {
  const passes = (r: any) => r.active_ingredient == null || ['PHI_REQUIRED_VERIFIED','PHI_NOT_APPLICABLE'].includes(r.phi_status);
  assertEquals(passes({ active_ingredient: 'Pymetrozine 50 WG', phi_status: 'PHI_REQUIRED_VERIFIED' }), true);
  assertEquals(passes({ active_ingredient: 'Cartap 50 SP', phi_status: 'PHI_REQUIRED_UNVERIFIED' }), false);
  assertEquals(passes({ active_ingredient: 'Cartap 50 SP', phi_status: 'PHI_REQUIRED_MISSING' }), false);
  assertEquals(passes({ active_ingredient: null, phi_status: 'PHI_REQUIRED_UNVERIFIED' }), true);   // non-product rule
  assertEquals(passes({ active_ingredient: null, phi_status: null, rule_intent: 'block' }), true);   // block
});

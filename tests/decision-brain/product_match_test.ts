// 2026-09-06 — exact-ingredient product matching (live: "Potash, Gromor NPK" offered for Potassium Sulphate foliar)
import { assertEquals } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const m = await import(`${BASE}/agents/market-product-lookup.ts`);
const MOP  = [{ name: 'Muriate of Potash (Potassium Chloride)', percentage: 60 }];
const NPK  = [{ name: 'NPK 19:19:19 with Potassium', percentage: 19 }];
const SOP  = [{ name: 'Potassium Sulphate', percentage: 50 }];
const SOPus= [{ name: 'Potassium sulfate (SOP)', percentage: 50 }];
Deno.test('P1 tokens: percentage, formulation and parenthetical stripped; spelling folded', () => {
  assertEquals(m.extractIngredientTokens('Potassium Sulphate (foliar)'), ['potassium','sulfate']);
  assertEquals(m.extractIngredientTokens('Azoxystrobin 18.2% + Difenoconazole 11.4% SC'), ['azoxystrobin','difenoconazole']);
  assertEquals(m.extractIngredientTokens('Cartap Hydrochloride 50 SP'), ['cartap','hcl']);
});
Deno.test('P2 potassium sulphate must NOT match MOP or NPK; matches SOP in either spelling', () => {
  const t = m.extractIngredientTokens('Potassium Sulphate (foliar)');
  assertEquals(m.productMatchesIngredient(MOP, t), false);
  assertEquals(m.productMatchesIngredient(NPK, t), false);
  assertEquals(m.productMatchesIngredient(SOP, t), true);
  assertEquals(m.productMatchesIngredient(SOPus, t), true);
});
Deno.test('P3 combination product requires both actives', () => {
  const t = m.extractIngredientTokens('Azoxystrobin 18.2% + Difenoconazole 11.4% SC');
  assertEquals(m.productMatchesIngredient([{name:'Azoxystrobin 23% SC'}], t), false);
  assertEquals(m.productMatchesIngredient([{name:'Azoxystrobin 18.2% + Difenoconazole 11.4% SC'}], t), true);
});

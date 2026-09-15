// 2026-09-11 — Lovable issue 2: the product lookup must select only columns that exist on master_products,
// map company_id → master_companies.name, and read available_pack_sizes / images / status.
import { assertEquals, assert } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const m = await import(`${BASE}/agents/market-product-lookup.ts`);
const REAL = new Set(['id','name','brand','company_id','active_ingredients','available_pack_sizes','images','status','ai_recommendable','label_hi','label_mr','translations']);
function mock() {
  const calls: string[] = [];
  const products = [{ id: 'p1', name: 'SOP Foliar 0:0:50', brand: 'SOP', company_id: 'c1', active_ingredients: [{ name: 'Potassium Sulphate', percentage: 50 }],
    available_pack_sizes: ['1 kg', '5 kg'], images: [{ url: 'https://x/p1.webp', is_primary: true }], status: 'active', ai_recommendable: true, label_hi: null, label_mr: 'एसओपी फवारणी', translations: null },
    { id: 'p2', name: 'MOP', brand: 'Potash', company_id: 'c1', active_ingredients: [{ name: 'Potassium Chloride', percentage: 60 }], available_pack_sizes: [], images: [], status: 'active', ai_recommendable: true }];
  const companies = [{ id: 'c1', name: 'Kisan Agro Ltd' }];
  const client = { from: (t: string) => ({
    select: (cols: string) => { calls.push(`${t}:${cols}`); const q: any = {
      eq: () => q, in: () => q, limit: () => Promise.resolve({ data: t === 'master_products' ? products : companies, error: null }),
      then: (r: any) => r({ data: t === 'master_products' ? products : companies, error: null }) }; return q; } }) };
  return { client, calls };
}
Deno.test('PL1 selects only real master_products columns', async () => {
  const { client, calls } = mock();
  await m.lookupMarketProductDetails(client, 'Potassium Sulphate (foliar)', 'mr');
  const sel = calls.find(c => c.startsWith('master_products:'))!.split(':')[1].split(',').map(s => s.trim());
  for (const c of sel) assert(REAL.has(c), `unknown column selected: ${c}`);
  assert(!sel.includes('company_name') && !sel.includes('pack_sizes') && !sel.includes('is_active'));
});
Deno.test('PL2 exact-ingredient match, company name joined, packs/image/label mapped', async () => {
  const { client } = mock();
  const r = await m.lookupMarketProductDetails(client, 'Potassium Sulphate (foliar)', 'mr');
  assertEquals(r.length, 1); assertEquals(r[0].name, 'SOP Foliar 0:0:50');
  assertEquals(r[0].company, 'Kisan Agro Ltd'); assertEquals(r[0].pack_sizes, '1 kg, 5 kg');
  assertEquals(r[0].image_url, 'https://x/p1.webp'); assertEquals(r[0].label, 'एसओपी फवारणी');
});

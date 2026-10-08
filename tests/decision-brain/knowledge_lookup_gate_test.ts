import { assert, assertEquals } from './assert.ts';
import { resolveKnowledgeLookup } from '../../supabase/functions/ai-agriculture-chat/agents/knowledge-lookup-gate.ts';

function mockSupabase() {
  return {
    from(table: string) {
      const q: any = {
        _table: table,
        select: () => q,
        eq: () => q,
        ilike: () => q,
        limit: () => q,
        not: () => q,
        in: () => q,
        maybeSingle: async () => ({
          data: table === 'crop_baseline_guidelines'
            ? {
                common_pests: [
                  { pest: 'Brown Planthopper', scientific_name: 'Nilaparvata lugens', critical_stage: 'TILLERING', etl: '5-10 hoppers per hill' }
                ],
                common_diseases: [],
              }
            : null,
          error: null,
        }),
        then: (resolve: any) => resolve({
          data:
            table === 'pest_master'
              ? [{ pest_code: 'BPH', pest_name_en: 'Brown Planthopper', pest_name_hi: 'भूरा प्लांट हॉपर', pest_name_mr: 'तपकिरी तुडतुडा' }]
              : [],
          error: null,
        }),
      };
      return q;
    },
  };
}

Deno.test('knowledge lookup returns DB-backed pest taxonomy without diagnosis', async () => {
  const result = await resolveKnowledgeLookup({
    farmer_message: 'Which pests attack rice?',
    language: 'en',
    crop_code: 'rice',
    cultivation_method: 'direct_seeded',
    supabase: mockSupabase(),
  });

  assert(result.handled);
  assertEquals(result.kind, 'PEST_LIST');
  assertEquals(result.crop_code, 'rice');
  assertEquals(result.items?.[0]?.english_name, 'Brown Planthopper');
  assert(result.response_by_language?.en.includes('Brown Planthopper'));
});

Deno.test('knowledge lookup returns false when the message is diagnostic', async () => {
  const result = await resolveKnowledgeLookup({
    farmer_message: 'BPH is on my rice, what should I spray?',
    language: 'en',
    crop_code: 'rice',
    cultivation_method: 'direct_seeded',
    supabase: mockSupabase(),
  });

  assertEquals(result.handled, false);
});

// CHANGE LOG (newest first)
// 2026-10-27 17:50 UTC — Regression: direct scope must prevent stage-only unrelated advice across crops.
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  loadDirectIntentScope, filterDirectIntentCandidates,
} from '../../../../supabase/functions/ai-agriculture-chat/decision/direct-intent-rule-scope.ts';

function stub(rows: Array<{ intent_code: string; rule_category: string; is_active: boolean }>, error: string | null = null) {
  const filters: Array<(row: typeof rows[number]) => boolean> = [];
  return {
    from(table: string) {
      assertEquals(table, 'direct_intent_rule_scope');
      return {
        select() { return this; },
        eq(column: 'intent_code' | 'is_active', value: unknown) {
          filters.push((row) => row[column] === value);
          return this;
        },
        order() { return this; },
        async limit() { return { data: rows.filter((row) => filters.every((f) => f(row)), error: error ? { message: error } : null }; },
      };
    },
  };
}
const rules = [
  { rule_id: 'GOOD', category: 'management', trigger_class: 'CONTEXT_SCHEDULE' },
  { rule_id: 'WRONG', category: 'harvest', trigger_class: 'CONTEXT_SCHEDULE' },
  { rule_id: 'BLOCK', category: 'safety', trigger_class: 'CONTEXT_BLOCK' },
];
Deno.test('DIRECT best practice cannot select unrelated harvest advice', async () => {
  const scope = await loadDirectIntentScope(stub([
    { intent_code: 'BEST_PRACTICE_GENERAL', rule_category: 'management', is_active: true },
    { intent_code: 'BEST_PRACTICE_GENERAL', rule_category: 'best_practice', is_active: true },
  ]), 'BEST_PRACTICE_GENERAL', true);
  assertEquals(scope.state, 'READY');
  assertEquals(filterDirectIntentCandidates(rules, scope).map((r) => r.rule_id), ['GOOD', 'BLOCK']);
});
Deno.test('DIRECT missing scope and database failures deny advice, retain safety constraints', async () => {
  for (const db of [stub([]), stub([], 'db unavailable')]) {
    const scope = await loadDirectIntentScope(db, 'GENERAL_CROP_INFO', true);
    assertEquals(filterDirectIntentCandidates(rules, scope).map((r) => r.rule_id), ['BLOCK']);
  }
});
Deno.test('non-DIRECT hypothesis and clarification lanes remain unchanged', async () => {
  const scope = await loadDirectIntentScope(null, 'LEAF_MARKS_OR_SPOTS', false);
  assertEquals(scope.state, 'NOT_DIRECT');
  assertEquals(filterDirectIntentCandidates(rules, scope), rules);
});

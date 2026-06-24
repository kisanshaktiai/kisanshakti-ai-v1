/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WAVE-S REGRESSION — Canonical vocabulary resolver + orphan gap tracker
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These tests exercise the live Supabase resolver. They require
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment. When the
 *   creds are missing, the tests no-op (skip) instead of failing — same
 *   pattern as Wave-R safety-metrics tests.
 *
 * Run:
 *   deno test supabase/functions/ai-agriculture-chat/_tests/wave_s_vocabulary_and_gate_test.ts --allow-net --allow-env
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveObservationCanonical,
  recordVocabularyGap,
} from '../runtime/observation-resolver.ts';

function credsPresent(): boolean {
  return !!(Deno.env.get('SUPABASE_URL') && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

Deno.test('resolveObservationCanonical: empty input → []', async () => {
  assertEquals(await resolveObservationCanonical(''), []);
  assertEquals(await resolveObservationCanonical('   '), []);
});

Deno.test('resolveObservationCanonical: exact match on English canonical phrase', async () => {
  if (!credsPresent()) { console.warn('[skip] no Supabase creds'); return; }
  const matches = await resolveObservationCanonical(
    'Rice has not germinated yet',
    { language: 'en' },
  );
  assert(matches.length > 0, 'expected at least one match');
  assertEquals(matches[0].match_type, 'exact');
  assertEquals(matches[0].canonical_code, 'obs_rice_no_emergence');
});

Deno.test('resolveObservationCanonical: exact match on Marathi alias', async () => {
  if (!credsPresent()) { console.warn('[skip] no Supabase creds'); return; }
  const matches = await resolveObservationCanonical(
    'भात अजून उगवले नाही',
    { language: 'mr' },
  );
  assert(matches.length > 0);
  assertEquals(matches[0].match_type, 'exact');
  assertEquals(matches[0].canonical_code, 'obs_rice_no_emergence');
});

Deno.test('resolveObservationCanonical: language fallback to und when lang not in aliases', async () => {
  if (!credsPresent()) { console.warn('[skip] no Supabase creds'); return; }
  // Master description is stored with language='und'; query with arbitrary lang
  // should still resolve via the und fallback rank.
  const matches = await resolveObservationCanonical(
    'No germination — seedlings not emerging from soil after sowing',
    { language: 'ta' },
  );
  assert(matches.length > 0);
  assertEquals(matches[0].canonical_code, 'obs_rice_no_emergence');
});

Deno.test('resolveObservationCanonical: orphan farmer phrase → [] AND logs a gap', async () => {
  if (!credsPresent()) { console.warn('[skip] no Supabase creds'); return; }
  // This phrase is precisely the audit's failing query — generic Marathi
  // "crop hasn't emerged yet" with no rice-specific noun.
  const orphan = 'पिक अद्याप उगवले नाही — wave-s-test-' + Date.now();
  const matches = await resolveObservationCanonical(orphan, { language: 'mr' });
  assertEquals(matches.length, 0);
  // resolver also fires recordVocabularyGap; double-confirm direct path works
  await recordVocabularyGap(orphan, 'mr', 'farmer_utterance', { test: true });
});

Deno.test('resolveObservationCanonical: case + whitespace insensitive', async () => {
  if (!credsPresent()) { console.warn('[skip] no Supabase creds'); return; }
  const a = await resolveObservationCanonical('  RICE HAS NOT GERMINATED YET  ', { language: 'en' });
  const b = await resolveObservationCanonical('rice has not germinated yet', { language: 'en' });
  assert(a.length > 0 && b.length > 0);
  assertEquals(a[0].canonical_code, b[0].canonical_code);
});

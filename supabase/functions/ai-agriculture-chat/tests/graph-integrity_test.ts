/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILE:      supabase/functions/ai-agriculture-chat/tests/graph-integrity_test.ts
 * ROLE:      PR-7 regression suite — decision-brain graph invariants
 * AUTHORITY: Test-only. Guards F1/F5/F6/F7 fixes against reintroduction.
 * VERSION:   1.0.0 (PR-7)
 * STAMPED:   2026-07-07
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { lockIntent } from '../agents/intent-lock.ts';
import { stagesEquivalent, stageFamily } from '../runtime/stage-family-shim.ts';

// ───────────────────────────────────────────────────────────────────────────
// Test 1 (F6) — Rice weed query must never accept a COTTON_* intent lock.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-7 F6 · COTTON_* intent locking onto Rice land is flagged crop_scope_rejected', () => {
  const lock = lockIntent('COTTON_SQUARE_BOLL_DROP_QUERY', 0.9, { crop: 'rice' });
  assertEquals(lock.crop_scope_rejected, true, 'COTTON intent on Rice land must be rejected');
  assertExists(lock.crop_scope_reason);
});

Deno.test('PR-7 F6 · matching crop prefix does not trigger rejection', () => {
  const lock = lockIntent('RICE_TUNGRO_QUERY', 0.9, { crop: 'rice' });
  assertEquals(lock.crop_scope_rejected, undefined);
});

Deno.test('PR-7 F6 · intents without a crop prefix pass regardless of land crop', () => {
  const lock = lockIntent('PEST_PROBLEM', 0.9, { crop: 'rice' });
  assertEquals(lock.crop_scope_rejected, undefined);
});

// ───────────────────────────────────────────────────────────────────────────
// Test 2 (F5) — Stage-family shim resolves rice transplanting↔tillering.
// This is the DB edge the layered evaluator needs so the stage gate stops
// soft-bypassing every rule.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-7 F5 · tillering and vegetative are equivalent via shared shim', () => {
  assert(stagesEquivalent('tillering', 'vegetative'));
  assert(stagesEquivalent('vegetative', 'tillering'));
});

Deno.test('PR-7 F5 · tillering family contains itself and vegetative', () => {
  const fam = stageFamily('tillering');
  assert(fam.includes('tillering'));
  assert(fam.includes('vegetative'));
});

Deno.test('PR-7 F5 · maturity and tillering are NOT equivalent (guard against over-broad match)', () => {
  assertEquals(stagesEquivalent('maturity', 'tillering'), false);
});

// ───────────────────────────────────────────────────────────────────────────
// Test 3 (F6b) — the reconciled ICAR rice calendar puts DAS 28 in
// TRANSPLANTING (matches crop_stage_master), not TILLERING.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-7 F6b · rice DAS 28 maps to TRANSPLANTING per reconciled ICAR calendar', async () => {
  const src = await Deno.readTextFile(
    new URL('../decision/context-validator.ts', import.meta.url),
  );
  // Structural check on the reconciled rice entry: TRANSPLANTING window
  // must cover 28 DAS, TILLERING window must start ≥ 35.
  assert(
    /stage:\s*'TRANSPLANTING'[^}]*max_days:\s*3[0-9]/.test(src) ||
      /min_days:\s*21[^}]*max_days:\s*3[0-9][^}]*stage:\s*'TRANSPLANTING'/.test(src),
    'ICAR rice calendar must contain a TRANSPLANTING window covering DAS 28',
  );
  assert(
    /min_days:\s*35[^}]*stage:\s*'TILLERING'/.test(src),
    'ICAR rice TILLERING must start at DAS 35 (aligned with crop_stage_master)',
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 4 (F1) — layered-rule-evaluator must attach `_sourceRule` on
// primary_decision so prescription-gate-enforcer Gate 0a stops being dead
// code. Structural test: the file contains the exact wiring line.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-7 F1 · primary_decision literal exposes _sourceRule for Gate 0a', async () => {
  const src = await Deno.readTextFile(
    new URL('../agents/layered-rule-evaluator.ts', import.meta.url),
  );
  assert(
    /_sourceRule:\s*best/.test(src),
    'layered-rule-evaluator.ts must attach `_sourceRule: best` on primary_decision',
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 5 (F7) — `ndvi_authority_gate` must be a registered category.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-7 F7 · ndvi_authority_gate has an explicit mapping', async () => {
  const src = await Deno.readTextFile(
    new URL('../agents/layered-rule-evaluator.ts', import.meta.url),
  );
  assert(
    /'ndvi_authority_gate'\s*:\s*RuleCategory\./.test(src),
    'ndvi_authority_gate must have an explicit RuleCategory mapping',
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 6 (F2) — GENERAL_INFO must NOT be on symptomFreeRoutes.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-7 F2 · GENERAL_INFO is removed from symptomFreeRoutes', async () => {
  const src = await Deno.readTextFile(
    new URL('../agents/orchestrator.ts', import.meta.url),
  );
  const listMatch = src.match(/const symptomFreeRoutes\s*=\s*\[[^\]]+\]/);
  assertExists(listMatch, 'symptomFreeRoutes declaration must exist');
  assertEquals(
    /['"]GENERAL_INFO['"]/.test(listMatch![0]),
    false,
    'GENERAL_INFO must not appear on the symptomFreeRoutes allowlist',
  );
});

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
import { evaluateHypothesisGraph } from '../decision/hypothesis-graph-evaluator.ts';

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
// Test 2 (F5) — Stage-family shim MUST come from `public.crop_stage_graph`
// via stage-knowledge-cache. The old hardcoded STAGE_FAMILIES map has been
// removed; without a crop argument the shim MUST fall back to strict
// equality (no TS-side family bridging). With a crop, resolution depends on
// the DB cache being loaded, which is a runtime concern outside this unit
// test — asserted at the integration layer instead.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-7 F5 · without crop, only identity is equivalent (no hardcoded bridge)', () => {
  assertEquals(stagesEquivalent('tillering', 'vegetative'), false, 'no crop → strict equality only');
  assertEquals(stagesEquivalent('tillering', 'tillering'), true);
});

Deno.test('PR-7 F5 · stageFamily without crop returns singleton', () => {
  const fam = stageFamily('tillering');
  assertEquals(fam.length, 1);
  assert(fam.includes('tillering'));
});

Deno.test('PR-7 F5 · maturity and tillering are NOT equivalent (guard against over-broad match)', () => {
  assertEquals(stagesEquivalent('maturity', 'tillering'), false);
});

// ───────────────────────────────────────────────────────────────────────────
// PR-4 · Context validator must consume BiologicalState/land_state stage and
// must not reintroduce a local DAS→stage calculator.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-4 · context-validator consumes biological_state and never imports getStageByDAS', async () => {
  const src = await Deno.readTextFile(
    new URL('../decision/context-validator.ts', import.meta.url),
  );
  assert(
    /biological_state/.test(src) && /bioState\?\.growth_stage/.test(src),
    'context-validator must read biological_state.growth_stage as the locked stage authority',
  );
  assertEquals(
    /import\s*\{[^}]*getStageByDAS/.test(src) || /getStageByDAS\s*\(/.test(src),
    false,
    'context-validator must not import or call getStageByDAS',
  );
});

Deno.test('PR-4 · DB-required stage exhaustion returns graph result instead of throwing', async () => {
  const rowsByTable: Record<string, any[]> = {
    hypothesis_conditions: [
      {
        hypothesis_id: 'RICE_GERMINATION_FAILURE',
        condition_type: 'OBSERVATION',
        condition_key: 'obs_rice_no_emergence',
        operator: 'EQ',
        value_json: true,
        is_required: true,
        is_quarantined: false,
        weight: 1,
      },
      {
        hypothesis_id: 'RICE_GERMINATION_FAILURE',
        condition_type: 'STAGE',
        condition_key: 'growth_stage',
        operator: 'IN',
        value_json: ['germination', 'nursery', 'seedling', 'emergence', 'establishment'],
        is_required: true,
        is_quarantined: false,
        weight: 1,
      },
    ],
    hypothesis_master: [
      {
        hypothesis_id: 'RICE_GERMINATION_FAILURE',
        crop_group: 'rice',
        canonical_group: 'GERMINATION_FAILURE',
        cause_name_en: 'Germination failure',
        cause_name_hi: null,
        cause_name_mr: null,
        severity_model: null,
        is_active: true,
      },
    ],
    hypothesis_rule_mapping: [],
  };

  class Query {
    private filters: Array<(row: any) => boolean> = [];
    private rangeBounds: [number, number] | null = null;
    constructor(private rows: any[]) {}
    select() { return this; }
    eq(column: string, value: any) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    in(column: string, values: any[]) {
      const allowed = new Set(values.map(String));
      this.filters.push((row) => allowed.has(String(row[column])));
      return this;
    }
    order() { return this; }
    range(from: number, to: number) {
      this.rangeBounds = [from, to];
      return Promise.resolve(this.run());
    }
    then(resolve: (value: any) => void) {
      resolve(this.run());
    }
    private run() {
      let data = this.rows.filter((row) => this.filters.every((fn) => fn(row)));
      if (this.rangeBounds) data = data.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
      return { data, error: null };
    }
  }

  const fakeSupabase = {
    from(table: string) {
      return new Query(rowsByTable[table] ?? []);
    },
  };

  const result = await evaluateHypothesisGraph({
    crop_code: 'RICE',
    crop_group: 'RICE',
    growth_stage: 'transplanting',
    das: 30,
    observation_codes: ['obs_rice_no_emergence'],
    supabase: fakeSupabase,
    trace_id: 'test_stage_required_exhaustion',
  });

  assertEquals(result.candidates.length, 0);
  assertEquals(result.eliminated.length, 1);
  assert(String(result.eliminated[0].eliminated_reason).startsWith('REQUIRED_STAGE_FAILED'));
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

// ───────────────────────────────────────────────────────────────────────────
// PR-1 · authoritative-state-loader MUST consume resolve_crop_phenology
// (variety-aware SSOT) instead of the crop-agnostic DAS ladder.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-1 · authoritative-state-loader calls resolve_crop_phenology RPC', async () => {
  const src = await Deno.readTextFile(
    new URL('../decision/authoritative-state-loader.ts', import.meta.url),
  );
  assert(
    /supabase\.rpc\(\s*['"]resolve_crop_phenology['"]/.test(src),
    'authoritative-state-loader must call supabase.rpc("resolve_crop_phenology", ...)',
  );
});

Deno.test('PR-1 · growth_stage prefers phenology RPC over DAS ladder', async () => {
  const src = await Deno.readTextFile(
    new URL('../decision/authoritative-state-loader.ts', import.meta.url),
  );
  assert(
    /phenologyRow\?\.growth_stage/.test(src),
    'growth_stage assignment must read phenologyRow.growth_stage first',
  );
  assert(
    /stageSource\s*[:=]\s*['"]phenology_rpc['"]/.test(src) ||
      /['"]phenology_rpc['"]/.test(src),
    'stage source must be tagged as phenology_rpc when RPC returns a row',
  );
});

// ───────────────────────────────────────────────────────────────────────────
// PR-2 · Orchestrator must honor intentLock.crop_scope_rejected — the flag
// must gate the IOM fallback path so a mis-scoped intent cannot fan out
// observations from the wrong crop taxonomy.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-2 · orchestrator gates IOM fallback on crop_scope_rejected', async () => {
  const src = await Deno.readTextFile(
    new URL('../agents/orchestrator.ts', import.meta.url),
  );
  assert(
    /_intentLock\?\.crop_scope_rejected/.test(src),
    'orchestrator must read intentLock.crop_scope_rejected before IOM fallback',
  );
  assert(
    /INTENT_IOM_FALLBACK.*crop_scope_rejected/.test(src),
    'orchestrator must log/skip IOM fallback when crop_scope_rejected is true',
  );
});

// ───────────────────────────────────────────────────────────────────────────
// PR-5 · The deprecated generateLLMResponse wrapper must delegate to the
// safe symbolic narrator (generateNarratedResponse). Any regression that
// re-routes it to a raw LLM call would let hallucinated agronomy through.
// ───────────────────────────────────────────────────────────────────────────
Deno.test('PR-5 · generateLLMResponse delegates to generateNarratedResponse', async () => {
  const src = await Deno.readTextFile(
    new URL('../agents/llm-response-generator.ts', import.meta.url),
  );
  const wrapperIdx = src.indexOf('export async function generateLLMResponse');
  assert(wrapperIdx > 0, 'generateLLMResponse wrapper must still exist');
  const tail = src.slice(wrapperIdx);
  assert(
    /generateNarratedResponse\s*\(/.test(tail),
    'generateLLMResponse body must call generateNarratedResponse (no raw LLM fallback)',
  );
});


// ═══════════════════════════════════════════════════════════════════════════
// PR-8 · Pagination guard. iom-gate and hypothesis-evaluator must page past
// the PostgREST 1000-row cap. A single .limit() call is a regression.
// ═══════════════════════════════════════════════════════════════════════════
Deno.test('PR-8 · iom-gate paginates intent_observation_mapping via .range()', async () => {
  const src = await Deno.readTextFile(
    new URL('../decision/iom-gate.ts', import.meta.url),
  );
  assert(/\.range\(\s*from\s*,\s*to\s*\)/.test(src), 'iom-gate must use .range() pagination');
  assert(!/\.limit\(\s*\d+\s*\)/.test(src), 'iom-gate must not use raw .limit() (silently truncates)');
});

Deno.test('PR-8 · hypothesis-evaluator paginates decision_rules via .range()', async () => {
  const src = await Deno.readTextFile(
    new URL('../decision/hypothesis-evaluator.ts', import.meta.url),
  );
  assert(/\.range\(\s*from\s*,\s*to\s*\)/.test(src), 'hypothesis-evaluator must paginate decision_rules');
  assert(
    !/\.limit\(\s*800\s*\)/.test(src),
    'the fixed .limit(800) truncation must be gone',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PR-9 · Dead code sweep. intent-router.ts is not wired into the orchestrator
// or any live path; it must live under _deadcode/, never under agents/.
// ═══════════════════════════════════════════════════════════════════════════
Deno.test('PR-9 · agents/intent-router.ts is quarantined (not in live agents/)', async () => {
  let liveExists = true;
  try {
    await Deno.stat(new URL('../agents/intent-router.ts', import.meta.url));
  } catch {
    liveExists = false;
  }
  assertEquals(liveExists, false, 'intent-router.ts must be moved out of agents/ (quarantined)');
});

// ═══════════════════════════════════════════════════════════════════════════
// PR-10 · Intent classifier empty-registry safety. When the DB-driven
// registry has not loaded, we must NOT emit hardcoded intent codes.
// ═══════════════════════════════════════════════════════════════════════════
Deno.test('PR-10 · intent-classifier emit() refuses to leak hardcoded codes on empty registry', async () => {
  const src = await Deno.readTextFile(
    new URL('../agents/intent-classifier.ts', import.meta.url),
  );
  const emitIdx = src.indexOf('function emit(');
  assert(emitIdx > 0, 'emit() must still exist');
  const body = src.slice(emitIdx, emitIdx + 800);
  assert(
    /validCodes\.size\s*===\s*0/.test(body) && /GENERAL_CROP_INFO/.test(body) && /0\.1/.test(body),
    'emit() must return GENERAL_CROP_INFO@0.1 when validCodes is empty',
  );
});

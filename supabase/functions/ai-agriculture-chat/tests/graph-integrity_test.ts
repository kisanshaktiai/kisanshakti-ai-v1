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
import { buildHypothesisClarificationOptions } from '../decision/hypothesis-clarification-builder.ts';
import { resolveHypothesesFromObservations } from '../decision/observation-hypothesis-resolver.ts';
import { resolveObservationSymbol, sameNode } from '../decision/symbol-resolver.ts';

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
  const executableSrc = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert(
    /biological_state/.test(src) && /bioState\?\.growth_stage/.test(src),
    'context-validator must read biological_state.growth_stage as the locked stage authority',
  );
  assertEquals(
    /import\s*\{[^}]*getStageByDAS/.test(executableSrc) || /getStageByDAS\s*\(/.test(executableSrc),
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

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH-CONTRACT · Clarification options must be hypothesis-graph owned.
// ═══════════════════════════════════════════════════════════════════════════

class GraphQuery {
  private filters: Array<(row: any) => boolean> = [];
  private rangeBounds: [number, number] | null = null;
  private orderColumn: string | null = null;
  constructor(private rows: any[]) {}
  select() { return this; }
  eq(column: string, value: any) { this.filters.push((row) => row[column] === value); return this; }
  in(column: string, values: any[]) { const s = new Set(values.map(String)); this.filters.push((row) => s.has(String(row[column]))); return this; }
  or() { return this; }
  ilike(column: string, value: string) { this.filters.push((row) => String(row[column] ?? '').toLowerCase() === String(value).toLowerCase()); return this; }
  not() { return this; }
  limit() { return this; }
  order(column: string) { this.orderColumn = column; return this; }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data[0] ?? null, error: null }); }
  single() { const r = this.run(); return Promise.resolve({ data: r.data[0] ?? null, error: null }); }
  range(from: number, to: number) { this.rangeBounds = [from, to]; return Promise.resolve(this.run()); }
  then(resolve: (value: any) => void) { resolve(this.run()); }
  private run() {
    let data = this.rows.filter((row) => this.filters.every((fn) => fn(row)));
    if (this.orderColumn) data = [...data].sort((a, b) => Number(a[this.orderColumn!] ?? 0) - Number(b[this.orderColumn!] ?? 0));
    if (this.rangeBounds) data = data.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
    return { data, error: null };
  }
}

function makeGraphSupabase() {
  const rowsByTable: Record<string, any[]> = {
    intent_observation_mapping: [
      { intent_code: 'EMERGENCE_FAILURE', crop_code: 'rice', growth_stage: 'transplanting', das_min: 0, das_max: 60, observation_code: 'uneven_emergence', confidence_rank: 1, assertion_strength: 'LITERAL', is_active: true },
      { intent_code: 'EMERGENCE_FAILURE', crop_code: 'cotton', growth_stage: 'vegetative', das_min: 0, das_max: 60, observation_code: 'cotton_square_drop', confidence_rank: 1, assertion_strength: 'LITERAL', is_active: true },
      { intent_code: 'EMERGENCE_FAILURE', crop_code: 'sugarcane', growth_stage: 'grand_growth', das_min: 0, das_max: 180, observation_code: 'stunted_tillers', confidence_rank: 1, assertion_strength: 'LITERAL', is_active: true },
    ],
    observation_aliases: [
      { alias_code: 'UNEVEN_EMERGENCE', alias_normalized: 'uneven_emergence', canonical_code: 'uneven_emergence', active: true },
      { alias_code: 'कमी रोपे बाहेर आले', alias_normalized: 'कमी रोपे बाहेर आले', canonical_code: 'uneven_emergence', active: true },
    ],
    observation_master: [
      { observation_code: 'uneven_emergence', description: 'Uneven emergence', is_active: true, is_farmer_observable: true, can_generate_question: true },
      { observation_code: 'crop_stand_low', description: 'Low crop stand', is_active: true, is_farmer_observable: true, can_generate_question: true },
      { observation_code: 'cotton_square_drop', description: 'Cotton square drop', is_active: true, is_farmer_observable: true, can_generate_question: true },
      { observation_code: 'stunted_tillers', description: 'Stunted tillers', is_active: true, is_farmer_observable: true, can_generate_question: true },
    ],
    observation_translations: [
      { observation_code: 'uneven_emergence', language_code: 'en', display_text: 'Uneven emergence', description_text: null },
      { observation_code: 'crop_stand_low', language_code: 'en', display_text: 'Low crop stand', description_text: null },
      { observation_code: 'cotton_square_drop', language_code: 'en', display_text: 'Cotton square drop', description_text: null },
      { observation_code: 'stunted_tillers', language_code: 'en', display_text: 'Stunted tillers', description_text: null },
    ],
    hypothesis_master: [
      { hypothesis_id: 'RICE_STAND_ESTABLISHMENT_STRESS', crop_group: 'rice', canonical_group: 'establishment', cause_name_en: 'Stand establishment stress', cause_name_hi: null, cause_name_mr: null, severity_model: null, is_active: true },
      { hypothesis_id: 'COTTON_ESTABLISHMENT_STRESS', crop_group: 'cotton', canonical_group: 'establishment', cause_name_en: 'Cotton establishment stress', cause_name_hi: null, cause_name_mr: null, severity_model: null, is_active: true },
      { hypothesis_id: 'SUGARCANE_ESTABLISHMENT_STRESS', crop_group: 'sugarcane', canonical_group: 'establishment', cause_name_en: 'Sugarcane establishment stress', cause_name_hi: null, cause_name_mr: null, severity_model: null, is_active: true },
    ],
    hypothesis_conditions: [
      { id: 'rice_obs_1', hypothesis_id: 'RICE_STAND_ESTABLISHMENT_STRESS', condition_type: 'OBSERVATION', condition_key: 'reported_codes', operator: 'CONTAINS', value_json: ['uneven_emergence', 'crop_stand_low'], is_required: true, is_discriminator: true, weight: 1, is_quarantined: false },
      { id: 'rice_stage_1', hypothesis_id: 'RICE_STAND_ESTABLISHMENT_STRESS', condition_type: 'STAGE', condition_key: 'growth_stage', operator: 'IN', value_json: ['transplanting'], is_required: true, is_discriminator: false, weight: 1, is_quarantined: false },
      { id: 'cotton_obs_1', hypothesis_id: 'COTTON_ESTABLISHMENT_STRESS', condition_type: 'OBSERVATION', condition_key: 'reported_codes', operator: 'CONTAINS', value_json: ['cotton_square_drop'], is_required: true, is_discriminator: true, weight: 1, is_quarantined: false },
      { id: 'cotton_stage_1', hypothesis_id: 'COTTON_ESTABLISHMENT_STRESS', condition_type: 'STAGE', condition_key: 'growth_stage', operator: 'IN', value_json: ['vegetative'], is_required: true, is_discriminator: false, weight: 1, is_quarantined: false },
      { id: 'sugar_obs_1', hypothesis_id: 'SUGARCANE_ESTABLISHMENT_STRESS', condition_type: 'OBSERVATION', condition_key: 'reported_codes', operator: 'CONTAINS', value_json: ['stunted_tillers'], is_required: true, is_discriminator: true, weight: 1, is_quarantined: false },
      { id: 'sugar_stage_1', hypothesis_id: 'SUGARCANE_ESTABLISHMENT_STRESS', condition_type: 'STAGE', condition_key: 'growth_stage', operator: 'IN', value_json: ['grand_growth'], is_required: true, is_discriminator: false, weight: 1, is_quarantined: false },
    ],
    hypothesis_rule_mapping: [
      { hypothesis_id: 'RICE_STAND_ESTABLISHMENT_STRESS', rule_id: 'RICE_RULE_1', priority: 1 },
      { hypothesis_id: 'COTTON_ESTABLISHMENT_STRESS', rule_id: 'COTTON_RULE_1', priority: 1 },
      { hypothesis_id: 'SUGARCANE_ESTABLISHMENT_STRESS', rule_id: 'SUGARCANE_RULE_1', priority: 1 },
    ],
  };
  return { from(table: string) { return new GraphQuery(rowsByTable[table] ?? []); } };
}

Deno.test('GRAPH-CONTRACT · clarification options are hypothesis_graph sourced', async () => {
  const res = await buildHypothesisClarificationOptions({
    supabase: makeGraphSupabase(),
    intent_code: 'EMERGENCE_FAILURE',
    crop_code: 'rice',
    crop_stage: 'transplanting',
    DAS: 30,
    language: 'en',
  });
  assert(res.options.length > 0, 'graph must produce stage-valid options');
  assertEquals(res.options.every((o) => o.source === 'hypothesis_graph'), true);
  assertEquals(res.options.some((o) => o.hypothesis_id === 'RICE_STAND_ESTABLISHMENT_STRESS'), true);
});

Deno.test('GRAPH-CONTRACT · confirmed observation resolves to hypotheses or contract error', async () => {
  const res = await resolveHypothesesFromObservations({
    supabase: makeGraphSupabase(),
    observations: ['UNEVEN_EMERGENCE'],
    crop_context: { crop_code: 'rice', crop_group: 'rice', growth_stage: 'transplanting', das: 30 },
  });
  assertEquals(res.graph_contract_error, null);
  assert(res.hypotheses.length > 0, 'confirmed observation must resolve to candidate hypotheses');
});

Deno.test('GRAPH-CONTRACT · symbol resolver uses DB aliases for same node', async () => {
  const db = makeGraphSupabase();
  const upper = await resolveObservationSymbol(db, 'UNEVEN_EMERGENCE');
  const lower = await resolveObservationSymbol(db, 'uneven_emergence');
  assertEquals(upper.canonical_observation_code, 'uneven_emergence');
  assertEquals(lower.canonical_observation_code, 'uneven_emergence');
  assertEquals(await sameNode(db, 'UNEVEN_EMERGENCE', 'कमी रोपे बाहेर आले'), true);
});

Deno.test('GRAPH-CONTRACT · same intent differs by crop/stage graph', async () => {
  const db = makeGraphSupabase();
  const rice = await buildHypothesisClarificationOptions({ supabase: db, intent_code: 'EMERGENCE_FAILURE', crop_code: 'rice', crop_stage: 'transplanting', DAS: 30, language: 'en' });
  const cotton = await buildHypothesisClarificationOptions({ supabase: db, intent_code: 'EMERGENCE_FAILURE', crop_code: 'cotton', crop_stage: 'vegetative', DAS: 30, language: 'en' });
  const sugar = await buildHypothesisClarificationOptions({ supabase: db, intent_code: 'EMERGENCE_FAILURE', crop_code: 'sugarcane', crop_stage: 'grand_growth', DAS: 90, language: 'en' });
  assert(rice.options.map((o) => o.observation_code).join(',') !== cotton.options.map((o) => o.observation_code).join(','));
  assert(cotton.options.map((o) => o.observation_code).join(',') !== sugar.options.map((o) => o.observation_code).join(','));
});

Deno.test('GRAPH-CONTRACT · live clarification contract must not stamp IOM as UI authority', async () => {
  const selector = await Deno.readTextFile(new URL('../runtime/observation-selector-contract.ts', import.meta.url));
  assertEquals(selector.includes('INTENT_OBSERVATION_MAPPING_SSOT'), false);
});

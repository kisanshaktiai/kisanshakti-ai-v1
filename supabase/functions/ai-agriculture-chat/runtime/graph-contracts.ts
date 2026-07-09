/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH CONTRACTS — crop-agnostic Neuro-Symbolic invariants
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CHANGE LOG (newest first):
 *   2026-07-09 04:10 UTC — Initial. Implements v4 crop-agnostic patches:
 *     P5 SYMBOL_IDENTITY_CONTRACT      (runs first)
 *     P1 BIOLOGICAL_SCOPE_CONTRACT     (runs after identity)
 *     P2 GRAPH_AUTHORITY_GATE          (pure function; caller enforces)
 *     P3 GRAPH_ONLY_RULE_FIREWALL      (pure function; caller enforces)
 *     P4 DECISION_OUTPUT_CONTRACT      (pure function; caller enforces)
 *
 * DESIGN CONTRACT:
 *   - NO hardcoded agronomy, crops, families, or stages.
 *   - Every scope / identity signal comes from Postgres master tables:
 *       observation_master  (crop_group, applicable_crop_groups, is_active)
 *       hypothesis_master   (hypothesis_id, is_active)
 *       decision_rules      (rule_id, is_active)
 *       crops               (value, crop_group_id)
 *   - LLM is never consulted for identity or scope.
 *   - Failing symbols/scope drop out with structured logs; the runtime
 *     never fabricates replacements.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { normalize } from './symbol-contract.ts';

// ───────────────────────────── shared types ──────────────────────────────

export type SupabaseLike = {
  from: (t: string) => any;
};

export interface CropContext {
  /** Farmer land crop code (e.g. "rice", "sugarcane"). Lowercased for compare. */
  crop_code: string | null | undefined;
  /** Optional pre-resolved crop group (e.g. "cereals"). If absent, resolved from DB. */
  crop_group?: string | null;
}

export interface ScopeReject {
  code: string;
  reason: 'CROSS_CROP_SCOPE_VIOLATION' | 'UNKNOWN_OBSERVATION_SYMBOL';
  detail?: string;
}

export interface ScopeFilterResult {
  accepted: string[];
  dropped_cross_crop: ScopeReject[];
  dropped_unknown: ScopeReject[];
}

// ──────────────────── PATCH 5 · SYMBOL_IDENTITY_CONTRACT ──────────────────

async function fetchExistingKeys(
  supabase: SupabaseLike,
  table: string,
  column: string,
  needles: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!needles.length) return out;
  const uniq = Array.from(new Set(needles.map((n) => String(n))));
  try {
    // Chunk to avoid PostgREST url overflow at large fan-out.
    const CHUNK = 500;
    for (let i = 0; i < uniq.length; i += CHUNK) {
      const slice = uniq.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .in(column, slice);
      if (error) {
        console.warn(`[SYMBOL_IDENTITY][DB_ERROR] table=${table} col=${column} error=${error.message}`);
        continue;
      }
      for (const r of (data ?? []) as any[]) {
        const v = r?.[column];
        if (v != null) out.add(String(v));
      }
    }
  } catch (e) {
    console.warn(`[SYMBOL_IDENTITY][EXCEPTION] table=${table} error=${(e as Error).message}`);
  }
  return out;
}

export interface IdentityCheckResult {
  known: string[];
  unknown: string[];
}

export async function assertObservationsExist(
  supabase: SupabaseLike,
  codes: ReadonlyArray<string>,
): Promise<IdentityCheckResult> {
  const list = Array.from(new Set((codes ?? []).filter(Boolean).map(String)));
  if (list.length === 0) return { known: [], unknown: [] };
  const present = await fetchExistingKeys(supabase, 'observation_master', 'observation_code', list);
  const known: string[] = [];
  const unknown: string[] = [];
  for (const c of list) {
    if (present.has(c)) known.push(c);
    else unknown.push(c);
  }
  if (unknown.length) {
    console.warn(`[UNKNOWN_OBSERVATION_SYMBOL] count=${unknown.length} codes=[${unknown.join(',')}]`);
  }
  return { known, unknown };
}

export async function assertHypothesesExist(
  supabase: SupabaseLike,
  ids: ReadonlyArray<string>,
): Promise<IdentityCheckResult> {
  const list = Array.from(new Set((ids ?? []).filter(Boolean).map(String)));
  if (list.length === 0) return { known: [], unknown: [] };
  const present = await fetchExistingKeys(supabase, 'hypothesis_master', 'hypothesis_id', list);
  const known: string[] = [];
  const unknown: string[] = [];
  for (const c of list) {
    if (present.has(c)) known.push(c);
    else unknown.push(c);
  }
  if (unknown.length) {
    console.warn(`[UNKNOWN_HYPOTHESIS_SYMBOL] count=${unknown.length} ids=[${unknown.join(',')}]`);
  }
  return { known, unknown };
}

export async function assertRulesExist(
  supabase: SupabaseLike,
  ids: ReadonlyArray<string>,
): Promise<IdentityCheckResult> {
  const list = Array.from(new Set((ids ?? []).filter(Boolean).map(String)));
  if (list.length === 0) return { known: [], unknown: [] };
  const present = await fetchExistingKeys(supabase, 'decision_rules', 'rule_id', list);
  const known: string[] = [];
  const unknown: string[] = [];
  for (const c of list) {
    if (present.has(c)) known.push(c);
    else unknown.push(c);
  }
  if (unknown.length) {
    console.warn(`[UNKNOWN_RULE_SYMBOL] count=${unknown.length} ids=[${unknown.join(',')}]`);
  }
  return { known, unknown };
}

// ─────────────────── PATCH 1 · BIOLOGICAL_SCOPE_CONTRACT ──────────────────

/**
 * Resolve the crop_group for a farmer crop_code from the `crops` table.
 * Returns lower-cased string when found, null otherwise. Zero hardcoding.
 */
export async function resolveCropGroup(
  supabase: SupabaseLike,
  cropCode: string | null | undefined,
): Promise<string | null> {
  const key = String(cropCode ?? '').trim().toLowerCase();
  if (!key || key === 'unknown') return null;
  try {
    // `crops.value` holds the machine code (e.g. 'rice'), joined to crop_groups.
    const { data, error } = await supabase
      .from('crops')
      .select('value, crop_group_id, crop_groups:crop_group_id(name, code)')
      .ilike('value', key)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const grp = (data as any)?.crop_groups?.code
      ?? (data as any)?.crop_groups?.name
      ?? null;
    return grp ? String(grp).toLowerCase() : null;
  } catch {
    return null;
  }
}

interface ObservationScopeRow {
  observation_code: string;
  crop_group: string | null;
  applicable_crop_groups: string[] | null;
  observation_type: string | null;
  is_active: boolean | null;
}

async function fetchObservationScopeRows(
  supabase: SupabaseLike,
  codes: string[],
): Promise<Map<string, ObservationScopeRow>> {
  const map = new Map<string, ObservationScopeRow>();
  if (!codes.length) return map;
  const CHUNK = 500;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase
        .from('observation_master')
        .select('observation_code, crop_group, applicable_crop_groups, observation_type, is_active')
        .in('observation_code', slice);
      if (error) {
        console.warn(`[OBSERVATION_SCOPE][DB_ERROR] error=${error.message}`);
        continue;
      }
      for (const r of (data ?? []) as ObservationScopeRow[]) {
        if (r?.observation_code) map.set(String(r.observation_code), r);
      }
    } catch (e) {
      console.warn(`[OBSERVATION_SCOPE][EXCEPTION] error=${(e as Error).message}`);
    }
  }
  return map;
}

/**
 * BIOLOGICAL_SCOPE_CONTRACT — decide whether each canonical observation code
 * is permissible in the current biological context.
 *
 * Accepts when ANY of:
 *   - master row missing scope metadata (universal by omission)
 *   - crop_code / crop_group / 'universal' ∈ applicable_crop_groups
 *   - observation_master.crop_group ∈ { crop_code, crop_group }
 *   - observation_master.crop_group == null
 *   - observation_type == 'GENERIC'         (biological symptom, cross-crop)
 *
 * Rejects when observation is scoped to a different crop / family and the
 * current context is not in that scope.
 *
 * Unknown symbols (not in observation_master) are dropped with the
 * `UNKNOWN_OBSERVATION_SYMBOL` reason so callers can distinguish scope
 * violation from graph-integrity violation.
 */
export async function filterByBiologicalScope(
  supabase: SupabaseLike,
  ctx: CropContext,
  codes: ReadonlyArray<string>,
): Promise<ScopeFilterResult> {
  const list = Array.from(new Set((codes ?? []).filter(Boolean).map(String)));
  const result: ScopeFilterResult = {
    accepted: [],
    dropped_cross_crop: [],
    dropped_unknown: [],
  };
  if (list.length === 0) return result;

  const cropCode = String(ctx.crop_code ?? '').trim().toLowerCase();
  let cropGroup = String(ctx.crop_group ?? '').trim().toLowerCase();
  if (!cropGroup && cropCode) {
    cropGroup = (await resolveCropGroup(supabase, cropCode)) ?? '';
  }

  const contextSet = new Set<string>(['universal']);
  if (cropCode) contextSet.add(cropCode);
  if (cropGroup) contextSet.add(cropGroup);

  const rows = await fetchObservationScopeRows(supabase, list);

  for (const code of list) {
    const row = rows.get(code);
    if (!row) {
      // Symbol not in observation_master → identity failure. Drop.
      result.dropped_unknown.push({ code, reason: 'UNKNOWN_OBSERVATION_SYMBOL' });
      continue;
    }
    const rowGroup = String(row.crop_group ?? '').toLowerCase();
    const applicable = (row.applicable_crop_groups ?? []).map((g) => String(g).toLowerCase());
    const obsType = String(row.observation_type ?? '').toUpperCase();

    // No context provided → cannot enforce scope; accept.
    if (contextSet.size === 1 && contextSet.has('universal') && !cropCode) {
      result.accepted.push(code);
      continue;
    }

    // Rule 1: master row leaves scope open → universal by omission.
    if (!rowGroup && applicable.length === 0) { result.accepted.push(code); continue; }

    // Rule 2: master row explicitly lists 'universal' or a matching group.
    if (applicable.some((g) => contextSet.has(g))) { result.accepted.push(code); continue; }

    // Rule 3: master row's own crop_group is in context or is 'universal'.
    if (rowGroup && (contextSet.has(rowGroup) || rowGroup === 'universal')) {
      result.accepted.push(code);
      continue;
    }

    // Rule 4: biological/generic symptom (crop-organ-agnostic) is cross-crop.
    if (obsType === 'GENERIC' || obsType === 'GENERIC_SYMPTOM' || obsType === 'UNIVERSAL') {
      result.accepted.push(code);
      continue;
    }

    // Otherwise: scoped to a foreign crop/family.
    result.dropped_cross_crop.push({
      code,
      reason: 'CROSS_CROP_SCOPE_VIOLATION',
      detail: `row_group=${rowGroup || 'null'} applicable=[${applicable.join(',')}] type=${obsType || 'null'}`,
    });
  }

  if (result.dropped_cross_crop.length || result.dropped_unknown.length) {
    console.warn(
      `[OBS_SCOPE_REJECT] crop=${cropCode || 'UNKNOWN'} group=${cropGroup || 'UNKNOWN'} ` +
      `dropped_cross_crop=[${result.dropped_cross_crop.map((d) => d.code).join(',')}] ` +
      `dropped_unknown=[${result.dropped_unknown.map((d) => d.code).join(',')}] ` +
      `reason=CROSS_CROP_SCOPE_VIOLATION`,
    );
  }

  return result;
}

// ─────────────────── PATCH 2 · GRAPH_AUTHORITY_GATE ───────────────────────

export interface GraphAuthorityInput {
  is_diagnostic_intent: boolean;
  graph_executed: boolean;
  confirmed_observations_count: number;
  hypotheses_count: number;
}

export interface GraphAuthorityDecision {
  block_rule_evaluator: boolean;
  reason: 'OK' | 'NO_HYPOTHESIS_EDGE' | 'NOT_DIAGNOSTIC' | 'GRAPH_NOT_EXECUTED' | 'NO_EVIDENCE';
  outcome: 'INSUFFICIENT_KNOWLEDGE' | 'PROCEED';
  gap_reason?: 'NO_HYPOTHESIS_EDGE';
}

export function graphAuthorityGate(input: GraphAuthorityInput): GraphAuthorityDecision {
  if (!input.is_diagnostic_intent) return { block_rule_evaluator: false, reason: 'NOT_DIAGNOSTIC', outcome: 'PROCEED' };
  if (!input.graph_executed) return { block_rule_evaluator: false, reason: 'GRAPH_NOT_EXECUTED', outcome: 'PROCEED' };
  if (input.confirmed_observations_count <= 0) return { block_rule_evaluator: false, reason: 'NO_EVIDENCE', outcome: 'PROCEED' };
  if (input.hypotheses_count === 0) {
    console.warn('[GRAPH_AUTHORITY_GATE] blocked=RULE_EVALUATOR reason=NO_HYPOTHESIS_EDGE');
    return {
      block_rule_evaluator: true,
      reason: 'NO_HYPOTHESIS_EDGE',
      outcome: 'INSUFFICIENT_KNOWLEDGE',
      gap_reason: 'NO_HYPOTHESIS_EDGE',
    };
  }
  return { block_rule_evaluator: false, reason: 'OK', outcome: 'PROCEED' };
}

// ─────────────── PATCH 3 · GRAPH_ONLY_RULE_FIREWALL ───────────────────────

export interface RuleFirewallInput<T extends { rule_id?: string; id?: string }> {
  is_diagnostic_intent: boolean;
  snapshot_rule_ids: ReadonlyArray<string>;
  candidate_rules: ReadonlyArray<T>;
  allow_orphan_discovery?: boolean;
}

export interface RuleFirewallResult<T> {
  admitted: T[];
  rejected_ids: string[];
  edge_missing: string[];
}

export function enforceGraphOnlyRules<T extends { rule_id?: string; id?: string; category?: string }>(
  input: RuleFirewallInput<T>,
): RuleFirewallResult<T> {
  const orphanDebug = !!input.allow_orphan_discovery;
  if (!input.is_diagnostic_intent) {
    return { admitted: [...input.candidate_rules], rejected_ids: [], edge_missing: [] };
  }
  const allowed = new Set(input.snapshot_rule_ids.map((s) => String(s)));
  const admitted: T[] = [];
  const rejected_ids: string[] = [];
  for (const r of input.candidate_rules) {
    const id = String(r?.rule_id ?? r?.id ?? '');
    if (!id) continue;
    if (allowed.has(id)) { admitted.push(r); continue; }
    rejected_ids.push(id);
  }
  // Missing edge = data-quality signal. Never a runtime fallback.
  const edge_missing = allowed.size === 0
    ? []
    : Array.from(allowed).filter((id) => !admitted.some((r) => String(r?.rule_id ?? r?.id) === id));
  if (rejected_ids.length) {
    console.log(`[GRAPH_ONLY_RULE_FIREWALL] rejected=${rejected_ids.length} admitted=${admitted.length} debug_orphan=${orphanDebug}`);
  }
  if (edge_missing.length) {
    console.warn(`[GRAPH_EDGE_MISSING] hypotheses_have_rule_id=but_not_in_candidate_pool ids=[${edge_missing.join(',')}] reason=NO_RULE_EDGE`);
  }
  return { admitted, rejected_ids, edge_missing };
}

// ─────────────── PATCH 4 · DECISION_OUTPUT_CONTRACT ───────────────────────

export type DecisionOutputKind =
  | 'ACTION'
  | 'MONITORING_PLAN'
  | 'CLARIFICATION_REQUEST'
  | 'NO_ACTION_REASON';

export interface DecisionOutputCandidate {
  kind?: DecisionOutputKind | string | null;
  rule_id?: string | null;
  action_type?: string | null;
  action_text?: string | null;
  reason_text?: string | null;
  monitoring_window_days?: number | null;
  clarification_questions?: unknown[] | null;
  no_action_reason?: string | null;
}

export interface DecisionOutputVerdict {
  valid: boolean;
  kind: DecisionOutputKind | 'NONE';
  missing: string[];
}

export function validateDecisionOutput(d: DecisionOutputCandidate | null | undefined): DecisionOutputVerdict {
  if (!d) return { valid: false, kind: 'NONE', missing: ['decision'] };
  const kind = String(d.kind ?? '').toUpperCase() as DecisionOutputKind;
  const missing: string[] = [];
  switch (kind) {
    case 'ACTION': {
      if (!d.rule_id) missing.push('rule_id');
      if (!d.action_type) missing.push('action_type');
      if (!d.action_text) missing.push('action_text');
      if (!d.reason_text) missing.push('reason_text');
      break;
    }
    case 'MONITORING_PLAN': {
      if (!d.reason_text) missing.push('reason_text');
      if (d.monitoring_window_days == null) missing.push('monitoring_window_days');
      break;
    }
    case 'CLARIFICATION_REQUEST': {
      if (!Array.isArray(d.clarification_questions) || d.clarification_questions.length === 0) {
        missing.push('clarification_questions');
      }
      break;
    }
    case 'NO_ACTION_REASON': {
      if (!d.no_action_reason) missing.push('no_action_reason');
      if (!d.reason_text) missing.push('reason_text');
      break;
    }
    default:
      return { valid: false, kind: 'NONE', missing: ['kind'] };
  }
  if (missing.length) {
    console.warn(`[DECISION_OUTPUT_CONTRACT_VIOLATION] kind=${kind} missing=[${missing.join(',')}]`);
    return { valid: false, kind, missing };
  }
  return { valid: true, kind, missing: [] };
}

export const GraphContracts = {
  assertObservationsExist,
  assertHypothesesExist,
  assertRulesExist,
  resolveCropGroup,
  filterByBiologicalScope,
  graphAuthorityGate,
  enforceGraphOnlyRules,
  validateDecisionOutput,
  normalize,
};

export default GraphContracts;

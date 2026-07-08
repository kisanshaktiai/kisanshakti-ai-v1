/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NAVIGATOR ADAPTER — v3 Phase 2 (shadow) + Phase 3 (flag-gated)
 * ═══════════════════════════════════════════════════════════════════════════
 * Single bridge between the live RuntimeGraphState and the pure
 * DecisionGraphNavigator. No reasoning here — only:
 *   1. Read frozen snapshot of RuntimeGraphState.
 *   2. Load farmer-observable allowlist (IOM ∩ master) for the turn.
 *   3. Run ContradictionEngine (sets contradictionFlagged).
 *   4. Map RuleCandidate[] → GraphNode[]   (requires = missing observations,
 *                                            confirmed = matched observations).
 *   5. Call navigate(); return NavigationResult.
 *   6. Stamp result onto RuntimeTraceCollector under `navigator_*` keys.
 *
 * The orchestrator decides whether to use the result (Phase 3 flag).
 *
 * Failures are swallowed; shadow logging must never break a turn.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { GraphRuntimeState } from './graph-runtime-state.ts';
import { detectContradiction } from './contradiction-engine.ts';
import {
  navigate,
  type GraphNode,
  type NavigationResult,
  type NavigatorInput,
} from './decision-graph-navigator.ts';
import { resolveNavigatorFlag, type NavigatorFlagState } from './navigator-flag.ts';
import { canonicalizeObservationKey } from './clarification-contract.ts';
// Stage adjacency is loaded from `public.crop_stage_graph` via the
// stage-knowledge-cache and read through stage-family-shim. NO hardcoded
// stage family lives in this file (or in the shim).
import { stageFamily } from './stage-family-shim.ts';

function stageVariants(stage?: string | null, crop?: string | null): string[] {
  if (!stage) return ['all'];
  const fam = stageFamily(stage, crop) as string[];
  return Array.from(new Set([...fam, 'all']));
}

// ─── Load farmer-observable allowlist for the turn ───────────────────────
async function loadAllowedEvidenceKeys(
  supabase: any,
  args: { intent_code: string; crop_code: string; growth_stage?: string | null; das?: number | null },
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase || !args.intent_code || !args.crop_code) return out;



  try {
    const intentUpper = String(args.intent_code).trim().toUpperCase();
    const cropLower   = String(args.crop_code).trim().toLowerCase();
    const cropVariants  = Array.from(new Set([cropLower, 'all', 'universal'].filter(Boolean)));
    const stages = stageVariants(args.growth_stage);

    const { data: iomRows, error: iomErr } = await supabase
      .from('intent_observation_mapping')
      .select('observation_code, das_min, das_max')
      .eq('is_active', true)
      .eq('intent_code', intentUpper)
      .in('crop_code', cropVariants)
      .in('growth_stage', stages);
    if (iomErr) return out;

    const das = args.das;
    const codes = new Set<string>();
    for (const r of iomRows || []) {
      if (das != null && Number.isFinite(das as number)) {
        const lo = typeof r.das_min === 'number' ? r.das_min : 0;
        const hi = typeof r.das_max === 'number' ? r.das_max : 9999;
        if ((das as number) < lo || (das as number) > hi) continue;
      }
      const k = canonicalizeObservationKey(r.observation_code);
      if (k) codes.add(k);
    }
    if (codes.size === 0) return out;

    const { data: masterRows, error: mErr } = await supabase
      .from('observation_master')
      .select('observation_code, is_active, is_farmer_observable')
      .in('observation_code', Array.from(codes));
    if (mErr) return out;

    for (const m of masterRows || []) {
      const k = canonicalizeObservationKey(m.observation_code);
      if (!k) continue;
      if (m.is_active === false) continue;
      if (m.is_farmer_observable === false) continue;
      if (codes.has(k)) out.add(k);
    }
  } catch {
    /* swallow — shadow path must not throw */
  }
  return out;
}

// ─── Map GraphRuntimeState → NavigatorInput ──────────────────────────────
function buildGraphNodes(graph: GraphRuntimeState): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const c of graph.hypothesis_graph) {
    if (c.status === 'DROPPED') continue;
    const requires = (c.missing_observations || [])
      .map(canonicalizeObservationKey)
      .filter(Boolean);
    const posterior = Math.max(
      0,
      Math.min(1, Number(c.semantic_score) || 0),
    );
    nodes.push(Object.freeze({
      id: c.rule_id,
      prior: 0,
      posterior,
      requires: Object.freeze(requires),
      blocks: Object.freeze([]),
      predicates: Object.freeze(requires),
    }) as GraphNode);
  }
  return nodes;
}

function buildConfirmedDenied(graph: GraphRuntimeState): { confirmed: Set<string>; denied: Set<string> } {
  const confirmed = new Set<string>();
  const denied    = new Set<string>();
  const latest = graph.observation_ledger.latestByCode();
  for (const [code, node] of latest) {
    const k = canonicalizeObservationKey(code);
    if (!k) continue;
    if (node.rejected) denied.add(k);
    else if (node.confirmed) confirmed.add(k);
  }
  return { confirmed, denied };
}

// ─── Public entrypoint ────────────────────────────────────────────────────
export interface NavigatorAdapterInput {
  supabase: any;
  graph: GraphRuntimeState;
  intent_code: string;
  /** Per-turn counter (1-indexed). */
  turn: number;
  /** Stage-margin threshold (default 0.15). */
  stage_margin?: number;
  /** Max clarification rounds (from intent contract). */
  max_clarification_rounds?: number;
  /** Per-tenant flag input. */
  tenant_id?: string | null;
  /** Optional pre-attached runtimeTrace collector for shadow stamping. */
  runtimeTrace?: { mergeGraph(p: Record<string, any>): void } | null;
}

export interface NavigatorAdapterOutput {
  readonly flag: NavigatorFlagState;
  /** null when prerequisites are missing (no context, no hypotheses, etc). */
  readonly result: NavigationResult | null;
  readonly contradiction: Awaited<ReturnType<typeof detectContradiction>> | null;
  readonly allowedKeyCount: number;
  readonly ran: boolean;
  readonly skip_reason?: string;
}

export async function runNavigator(input: NavigatorAdapterInput): Promise<NavigatorAdapterOutput> {
  const flag = resolveNavigatorFlag({ tenant_id: input.tenant_id });

  // If both active and shadow are off, skip entirely.
  if (!flag.active && !flag.shadow) {
    return Object.freeze({
      flag, result: null, contradiction: null, allowedKeyCount: 0,
      ran: false, skip_reason: 'flag_off_and_shadow_off',
    });
  }

  const ctx = input.graph.canonical_context;
  if (!ctx || !ctx.crop_code) {
    return finalize(input, flag, null, null, 0, false, 'no_canonical_context');
  }
  if (input.graph.hypothesis_graph.length === 0) {
    return finalize(input, flag, null, null, 0, false, 'empty_hypothesis_graph');
  }
  if (!input.intent_code) {
    return finalize(input, flag, null, null, 0, false, 'no_intent_code');
  }

  try {
    // 1. Contradiction check.
    let contradiction = null;
    try {
      // FIX 1: pass confirmed observations so biological-impossibility check
      // fires (e.g. NO_GERMINATION asserted while BiologicalState=TILLERING).
      const confirmedObservations: string[] = [];
      try {
        const latest = input.graph.observation_ledger.latestByCode();
        for (const [code, node] of latest) {
          if (!node.rejected && node.confirmed) confirmedObservations.push(String(code));
        }
      } catch {/* non-fatal */}
      contradiction = await detectContradiction({
        supabase: input.supabase,
        intent_code: input.intent_code,
        crop_code: ctx.crop_code,
        growth_stage: ctx.growth_stage || '',
        das: ctx.days_since_sowing ?? null,
        trace_id: input.graph.trace_id,
        observations: confirmedObservations,
      });
    } catch (e) {
      console.warn(`[NAV_ADAPTER][${input.graph.trace_id}] contradiction_engine failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2. Allowed evidence keys.
    const allowed = await loadAllowedEvidenceKeys(input.supabase, {
      intent_code: input.intent_code,
      crop_code: ctx.crop_code,
      growth_stage: ctx.growth_stage || null,
      das: ctx.days_since_sowing ?? null,
    });

    // 3. Build NavigatorInput.
    const nodes = buildGraphNodes(input.graph);
    const { confirmed, denied } = buildConfirmedDenied(input.graph);

    const navInput: NavigatorInput = {
      hypotheses: nodes,
      confirmed,
      denied,
      context: {
        crop_code: String(ctx.crop_code),
        growth_stage: String(ctx.growth_stage || ''),
      },
      allowedEvidenceKeys: allowed,
      thresholds: {
        stage_margin: typeof input.stage_margin === 'number' ? input.stage_margin : 0.15,
        max_clarification_rounds:
          typeof input.max_clarification_rounds === 'number' ? input.max_clarification_rounds : 2,
      },
      turn: Math.max(1, Number(input.turn) || 1),
      contradictionFlagged: !!contradiction,
    };

    // 4. Navigate.
    const result = navigate(navInput);

    console.log(
      `[CLARIFICATION_OWNER][${input.graph.trace_id}] producer=DECISION_GRAPH_NAVIGATOR ` +
      `mode=${flag.active ? 'ACTIVE' : 'SHADOW'} decision=${result.decision} ` +
      `active=${result.activeNodeIds.length} ranked=${result.ranked.length} ` +
      `allowed=${allowed.size} confirmed=${confirmed.size} denied=${denied.size} ` +
      `contradiction=${contradiction ? contradiction.kind : 'none'} reason=${result.reason}`,
    );

    return finalize(input, flag, result, contradiction, allowed.size, true);
  } catch (e) {
    console.warn(`[NAV_ADAPTER][${input.graph.trace_id}] non-fatal: ${e instanceof Error ? e.message : String(e)}`);
    return finalize(input, flag, null, null, 0, false, 'exception');
  }
}

function finalize(
  input: NavigatorAdapterInput,
  flag: NavigatorFlagState,
  result: NavigationResult | null,
  contradiction: any,
  allowedKeyCount: number,
  ran: boolean,
  skip_reason?: string,
): NavigatorAdapterOutput {
  // Stamp onto runtime trace for forensic persistence.
  try {
    input.runtimeTrace?.mergeGraph({
      navigator_shadow: {
        flag,
        ran,
        skip_reason: skip_reason ?? null,
        allowed_evidence_key_count: allowedKeyCount,
        contradiction: contradiction ?? null,
        result: result
          ? {
              decision: result.decision,
              reason: result.reason,
              active_node_ids: result.activeNodeIds,
              stopping: result.stopping,
              ranked: result.ranked.map(r => ({
                evidence_key: r.evidence_key,
                prunes: r.prunes_hypotheses,
                confirms: r.confirms_hypotheses,
                score: r.graph_pruning_score,
              })),
            }
          : null,
        captured_at: Date.now(),
      },
    });
  } catch {
    /* swallow */
  }
  return Object.freeze({ flag, result, contradiction, allowedKeyCount, ran, skip_reason });
}

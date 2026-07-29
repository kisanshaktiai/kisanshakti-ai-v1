// NAVIGATOR RESPONSE — v3 Phase 4 (flag-gated active mode)

import { buildOptions, assertClarificationContract } from './clarification-contract.ts';
import type { NavigatorAdapterOutput } from './navigator-adapter.ts';

export interface NavigatorOverride {
  readonly override: boolean;
  readonly decision?: 'ASK' | 'INSUFFICIENT_EVIDENCE' | 'CONTEXT_CONTRADICTION' | 'PROCEED';
  readonly options?: Array<{ observation_key: string; label: string; confidence_rank: number }>;
  readonly observation_keys?: string[];
  readonly labels?: string[];
  readonly reason?: string;
  readonly skip_reason?: string;
}

const NO_OVERRIDE: NavigatorOverride = Object.freeze({ override: false });

export interface BuildNavigatorOverrideInput {
  supabase: any;
  navOutput: NavigatorAdapterOutput | null | undefined;
  language: string;
  max?: number;
  /** Optional override of allowlist; defaults to navigator-ranked keys. */
  allowedKeys?: Set<string>;
  ctx?: { intent?: string; crop?: string; stage?: string | null; das?: number | null };
}

export async function buildNavigatorOverride(
  input: BuildNavigatorOverrideInput,
): Promise<NavigatorOverride> {
  const { supabase, navOutput, language, max = 3, ctx = {} } = input;
  if (!navOutput || !navOutput.flag?.active) return NO_OVERRIDE;
  if (!navOutput.ran || !navOutput.result) {
    return Object.freeze({ override: false, skip_reason: navOutput?.skip_reason || 'no_result' });
  }

  const result = navOutput.result;
  const decision = result.decision;

  if (decision === 'PROCEED') {
    // Navigator says proceed — don't override; downstream rule evaluator runs.
    return Object.freeze({ override: false, decision, reason: result.reason });
  }

  if (decision === 'CONTEXT_CONTRADICTION') {
    return Object.freeze({
      override: true,
      decision,
      options: [],
      observation_keys: [],
      labels: [],
      reason: result.reason || 'context_contradiction',
    });
  }

  if (decision === 'INSUFFICIENT_EVIDENCE') {
    return Object.freeze({
      override: true,
      decision,
      options: [],
      observation_keys: [],
      labels: [],
      reason: result.reason || 'insufficient_evidence',
    });
  }

  // ASK — build farmer-ready options from ranked evidence keys.
  const rankedKeys = (result.ranked || [])
    .slice(0, Math.max(1, max))
    .map(r => r.evidence_key)
    .filter(Boolean);

  if (rankedKeys.length === 0) {
    return Object.freeze({
      override: true,
      decision: 'INSUFFICIENT_EVIDENCE',
      options: [],
      observation_keys: [],
      labels: [],
      reason: 'no_ranked_evidence',
    });
  }

  try {
    const built = await buildOptions({
      supabase,
      evidence_keys: rankedKeys,
      language,
      max,
    });
    const allowed = input.allowedKeys && input.allowedKeys.size > 0
      ? input.allowedKeys
      : new Set(rankedKeys);
    const gated = assertClarificationContract(built, allowed, ctx);

    if (gated.length === 0) {
      console.warn(
        `[NAV_OVERRIDE] ASK produced 0 gated options (ranked=${rankedKeys.length}) — degrading to INSUFFICIENT_EVIDENCE`,
      );
      return Object.freeze({
        override: true,
        decision: 'INSUFFICIENT_EVIDENCE',
        options: [],
        observation_keys: [],
        labels: [],
        reason: 'all_options_dropped_by_contract',
      });
    }

    console.log(
      `[NAV_OVERRIDE] ACTIVE decision=ASK options=${gated.length} ` +
      `keys=[${gated.map(o => o.observation_key).join(',')}] reason=${result.reason}`,
    );

    return Object.freeze({
      override: true,
      decision: 'ASK',
      options: gated,
      observation_keys: gated.map(o => o.observation_key),
      labels: gated.map(o => o.label),
      reason: result.reason,
    });
  } catch (e) {
    // v4.0: FAIL-CLOSED. Graph errors MUST NOT silently fall back to the
    console.error(
      `[NAV_OVERRIDE] GRAPH_RESPONSE_FAILURE: ${e instanceof Error ? e.message : String(e)} — failing closed`,
    );
    return Object.freeze({
      override: true,
      decision: 'INSUFFICIENT_EVIDENCE',
      options: [],
      observation_keys: [],
      labels: [],
      reason: 'GRAPH_RESPONSE_FAILURE',
    });
  }
}

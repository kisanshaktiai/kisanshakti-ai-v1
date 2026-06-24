/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FEATURE FLAGS — Phase 2 Wave A.5 rollout control
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for gate-strictness rollout flags. Read from Deno
 * env so they can be flipped per-environment without redeploys triggering
 * code review.
 *
 * Default for every "STRICT_MODE" flag is `shadow` — the new (correct) logic
 * runs in parallel and LOGS what it would have done, but the OLD behaviour
 * is preserved. Flip to `enforce` once dashboards confirm the new logic is
 * safe.
 *
 *   GATE_STRICT_MODE         → suppression-guard, clarification-gate,
 *                              weather-gate fail-closed behaviour
 *   CLARIFICATION_INVARIANT  → always on. Strips treatment payload when
 *                              clarification_required=true. This is the
 *                              fix for the reported emergence-failure bug.
 *   DECISION_LOG_MODE        → 'on' | 'off' for ai_decision_log inserts.
 *   RULE_SOURCE              → 'db' | 'bundled' | 'shadow' (Wave B placeholder)
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type StrictMode = 'shadow' | 'enforce' | 'off';
export type RuleSource = 'db' | 'bundled' | 'shadow';

function readEnv(key: string, fallback: string): string {
  try {
    const v = Deno.env.get(key);
    return (v && v.length > 0) ? v.toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

export function getGateStrictMode(): StrictMode {
  const v = readEnv('GATE_STRICT_MODE', 'shadow');
  return (['shadow', 'enforce', 'off'].includes(v) ? v : 'shadow') as StrictMode;
}

/**
 * Clarification-action invariant. ALWAYS ON unless explicitly disabled.
 * This is the production-bug fix from the user's report — never default off.
 */
export function getClarificationInvariantEnabled(): boolean {
  return readEnv('CLARIFICATION_INVARIANT', 'on') !== 'off';
}

export function getDecisionLogEnabled(): boolean {
  return readEnv('DECISION_LOG_MODE', 'on') !== 'off';
}

export function getRuleSource(): RuleSource {
  const v = readEnv('RULE_SOURCE', 'bundled');
  return (['db', 'bundled', 'shadow'].includes(v) ? v : 'bundled') as RuleSource;
}

/**
 * Convenience: should gate downgrades from FAIL→PASS via suppression guard
 * be ENFORCED (i.e. blocked)?  In shadow we still apply the override but log
 * loudly so we can audit. In enforce we refuse to reverse without an explicit
 * token.
 */
export function shouldEnforceSuppressionGuardLockdown(): boolean {
  return getGateStrictMode() === 'enforce';
}

export function shouldEnforceClarificationFailClosed(): boolean {
  return getGateStrictMode() === 'enforce';
}

export function shouldEnforceWeatherFailClosed(): boolean {
  return getGateStrictMode() === 'enforce';
}

export const FEATURE_FLAGS_VERSION = '2.0.0-waveA';

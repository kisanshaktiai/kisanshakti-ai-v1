/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULES-FIRED — SINGLE SOURCE OF TRUTH (Wave-R)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The symbolic invariant "no rule fired → no treatment" depends on a SINGLE
 * unambiguous definition of "rules_fired". Historically the codebase derived
 * this counter from multiple shapes:
 *
 *   - decisionOutput.rules_applied
 *   - decisionOutput.layered_rule_result.rules_applied
 *   - decisionOutput.matched_responses
 *   - decisionOutput.candidate_rules
 *   - orchestratorResponse.metadata.rulesFired
 *   - observationRuleHit
 *
 * `matched_responses` and `candidate_rules` are NOT fired rules — they are
 * candidates surfaced by lookups (observation→rule, hypothesis enricher).
 * Treating them as "fired" inflated the counter and reopened safety gates.
 *
 * This module exposes ONE function. Every Wave-R consumer MUST use it.
 * No OR-chain fallbacks. No metadata fallbacks. No advisory-lookup fallbacks.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface RuleFiredEntry {
  rule_id?: string | null;
  // any other fields ignored
}

/**
 * Returns the list of rule_ids the symbolic engine ACTUALLY fired
 * (i.e. evaluator output `rules_applied`). Falls back ONLY to the
 * layered evaluator's nested `rules_applied` — never to candidates,
 * matched_responses, or metadata.
 */
export function firedRuleIds(decisionOutput: unknown): string[] {
  const dec = (decisionOutput || {}) as Record<string, unknown>;
  const raw =
    (dec.rules_applied as unknown) ??
    ((dec.layered_rule_result as Record<string, unknown> | undefined)?.rules_applied as unknown);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (typeof r === 'string') return r;
      if (r && typeof r === 'object') {
        const rid = (r as RuleFiredEntry).rule_id;
        return typeof rid === 'string' ? rid : null;
      }
      return null;
    })
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

/**
 * Returns the count of rules that actually fired. SSOT.
 */
export function rulesActuallyFired(decisionOutput: unknown): number {
  return firedRuleIds(decisionOutput).length;
}

/**
 * Returns true iff the given rule_id is in the fired set.
 * Used by the rule-identity verifier to block emission of rules
 * that were merely surfaced as candidates / matched_responses.
 */
export function isRuleFired(decisionOutput: unknown, ruleId: string | null | undefined): boolean {
  if (!ruleId || typeof ruleId !== 'string') return false;
  const fired = new Set(firedRuleIds(decisionOutput));
  return fired.has(ruleId);
}

export const RULES_FIRED_SSOT_VERSION = '1.0.0';

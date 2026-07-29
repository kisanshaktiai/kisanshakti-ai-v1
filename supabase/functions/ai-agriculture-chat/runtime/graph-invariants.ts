// GRAPH INVARIANTS — Runtime assertions guarding the symbolic pipeline

export interface InvariantSnapshot {
  trace_id: string;
  crop: string | null;
  bio_state_locked: boolean;
  real_observation_count: number;
  hypotheses_count: number;
  rules_loaded: number;
  rules_matched: number;
  symbolic_decision_available: boolean;
  diagnosis_available: boolean;
  final_source: 'symbolic_decision_graph' | 'clarification_graph' | 'diagnosis_graph' | 'generic_template' | string;
  fallback_reason: string | null;
  system_error: boolean;
}

export type FallbackReason =
  | 'NO_CROP'
  | 'NO_OBSERVATION'
  | 'NO_HYPOTHESIS'
  | 'SYSTEM_ERROR';

// Only these four reasons legitimately produce `generic_template`.
export function isLegitimateFallback(reason: string | null | undefined): reason is FallbackReason {
  if (!reason) return false;
  return ['NO_CROP', 'NO_OBSERVATION', 'NO_HYPOTHESIS', 'SYSTEM_ERROR'].includes(reason);
}

export interface InvariantResult {
  ok: boolean;
  violations: string[];
  /** When set, orchestrator must override the outgoing source to this value. */
  force_source?: 'symbolic_decision_graph';
}

export function checkGraphInvariants(s: InvariantSnapshot): InvariantResult {
  const violations: string[] = [];
  let force_source: 'symbolic_decision_graph' | undefined;

  // TEST 1: symbolic decision available → generic fallback forbidden.
  if (
    s.symbolic_decision_available &&
    s.final_source === 'generic_template' &&
    !isLegitimateFallback(s.fallback_reason)
  ) {
    violations.push(
      `symbolic_decision_available but final_source=generic_template with illegitimate reason=${s.fallback_reason ?? 'null'}`,
    );
    force_source = 'symbolic_decision_graph';
  }

  // TEST 2: rules loaded > 0 but zero matched → must not be silent
  if (s.rules_loaded > 0 && s.rules_matched === 0 && s.final_source === 'generic_template' && !s.system_error) {
    violations.push(`rules_loaded=${s.rules_loaded} matched=0 without explicit block_reason trace`);
  }

  // TEST 3: bio-locked + real observations → generic fallback forbidden
  if (
    s.bio_state_locked &&
    s.real_observation_count > 0 &&
    s.final_source === 'generic_template' &&
    !isLegitimateFallback(s.fallback_reason)
  ) {
    violations.push(
      `bio_locked=true real_obs=${s.real_observation_count} but final_source=generic_template reason=${s.fallback_reason ?? 'null'}`,
    );
    force_source = 'symbolic_decision_graph';
  }

  // TEST 4: observation exists but hypothesis graph empty and unlogged
  if (s.real_observation_count > 0 && s.hypotheses_count === 0 && !s.system_error) {
    violations.push(
      `real_obs=${s.real_observation_count} but hypotheses=0 — hypothesis engine silent`,
    );
  }

  if (violations.length > 0) {
    console.error(
      `[GRAPH_INVARIANT_VIOLATION][${s.trace_id}] ${violations.length} violation(s):\n  - ${violations.join('\n  - ')}`,
    );
  }

  return { ok: violations.length === 0, violations, force_source };
}

// Emit the FINAL_RESPONSE_CONTRACT trace exactly once per turn.
export function emitFinalResponseContract(s: InvariantSnapshot): void {
  console.log(
    `[FINAL_RESPONSE_CONTRACT][${s.trace_id}] ` +
      JSON.stringify({
        symbolic_decision_available: s.symbolic_decision_available,
        diagnosis_available: s.diagnosis_available,
        fallback_trigger: s.final_source === 'generic_template',
        fallback_reason: s.fallback_reason,
        source: s.final_source,
      }),
  );
}

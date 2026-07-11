/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION STATE CONTRACT (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG
 *   2026-07-11 UTC — v4-P7 wire-up: filter intent codes out of confirmed/
 *     inferred sets via `assertNotAnIntentCode` before they can enter the
 *     hypothesis graph. Non-throwing: leaks are dropped + logged.
 *   2026-07-09 07:55 UTC — Introduced three-state observation contract.
 *     Separates candidate (UI options), inferred (ranking priors) and
 *     confirmed (only class allowed to enter OBS_TO_HYP).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Neuro-symbolic invariant:
 *   INFERRED observations (alias expansion, IOM LITERAL peers, LLM guesses,
 *   cross-crop injections) MUST NOT be counted as farmer evidence.
 *   Only CONFIRMED observations (farmer selection, explicit statement, photo,
 *   pattern-match on farmer's own text) enter the hypothesis graph.
 *
 *   Prior bug: ClarificationTrigger read `inferred + confirmed` as
 *   `symptom_count`, flipped `should_clarify=false SUFFICIENT_SYMPTOM_COVERAGE`
 *   and executed the graph with 0 real evidence.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  AuthoredObservationSet,
  ObservationAuthority,
} from '../utils/observation-authority.ts';

export interface ObservationState {
  readonly candidate_observations: ReadonlyArray<string>;
  readonly inferred_observations:  ReadonlyArray<string>;
  readonly confirmed_observations: ReadonlyArray<string>;
}

export interface BuildObservationStateInput {
  authored?: AuthoredObservationSet | null;
  candidate_codes?: Iterable<string>;
}

/**
 * Split an AuthoredObservationSet into the three-state contract.
 *
 * Authority mapping:
 *   CONFIRMED → confirmed_observations (farmer tap / explicit statement / photo)
 *   EXTRACTED → confirmed_observations (regex/language pattern on farmer's own text)
 *   INFERRED  → inferred_observations  (alias expansion, IOM LITERAL peer, LLM)
 *   SYNTHETIC → inferred_observations  (cross-crop mapper, router fallback)
 *
 * Candidate codes are the IOM/observation_master options currently offered to
 * the farmer for selection — they are NEVER evidence until the farmer picks
 * one (at which point the caller must re-add them at CONFIRMED authority).
 */
export function buildObservationState(i: BuildObservationStateInput): ObservationState {
  const confirmed = new Set<string>();
  const inferred  = new Set<string>();
  const candidate = new Set<string>();

  if (i.authored) {
    for (const obs of i.authored.toArray()) {
      switch (obs.authority) {
        case ObservationAuthority.CONFIRMED:
        case ObservationAuthority.EXTRACTED:
          confirmed.add(obs.code);
          break;
        case ObservationAuthority.INFERRED:
        case ObservationAuthority.SYNTHETIC:
          inferred.add(obs.code);
          break;
      }
    }
  }

  if (i.candidate_codes) {
    for (const c of i.candidate_codes) {
      if (!confirmed.has(c) && !inferred.has(c)) candidate.add(c);
    }
  }

  return Object.freeze({
    candidate_observations: Object.freeze([...candidate]),
    inferred_observations:  Object.freeze([...inferred]),
    confirmed_observations: Object.freeze([...confirmed]),
  });
}

/**
 * Symbolic gate: a diagnostic turn MUST have at least one confirmed
 * observation before it may enter OBS_TO_HYP. Returns the routing decision.
 */
export interface ObservationGateResult {
  readonly proceed: boolean;
  readonly state:  'WAITING_FOR_OBSERVATION' | 'READY_FOR_GRAPH';
  readonly source: 'intent_observation_mapping' | 'confirmed_evidence';
  readonly candidate_observations: ReadonlyArray<string>;
  readonly reason: string;
}

export function evaluateObservationGate(
  diagnosticIntent: boolean,
  state: ObservationState,
): ObservationGateResult {
  if (diagnosticIntent && state.confirmed_observations.length === 0) {
    return Object.freeze({
      proceed: false,
      state: 'WAITING_FOR_OBSERVATION',
      source: 'intent_observation_mapping',
      candidate_observations: state.candidate_observations,
      reason: 'no_confirmed_observations',
    });
  }
  return Object.freeze({
    proceed: true,
    state: 'READY_FOR_GRAPH',
    source: 'confirmed_evidence',
    candidate_observations: state.candidate_observations,
    reason: 'confirmed_observations_present',
  });
}

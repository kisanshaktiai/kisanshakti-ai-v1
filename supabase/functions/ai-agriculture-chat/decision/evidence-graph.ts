/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVIDENCE GRAPH — strict separation of confirmed vs candidate observations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Symbolic Decision Brain invariant:
 *
 *   Observation → Hypothesis → Clarification → Diagnosis → Recommendation
 *
 * The reverse arrow (Hypothesis → Observation) MUST NEVER be allowed to
 * promote a candidate into the confirmed lane without an explicit farmer
 * clarification answer, sensor reading, or photo verification.
 *
 * This module is a thin, dependency-free runtime contract that the
 * orchestrator and downstream gates can use to enforce the rule and to emit
 * structured `OBSERVATION_CONTAMINATION_ERROR` events when violated.
 *
 * NOTE: this file intentionally has no DB or framework imports so it can be
 * unit-tested in isolation.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type ObservationProvenance =
  | 'FARMER_ASSERTED'         // farmer's raw text — confirmed
  | 'SENSOR'                  // land / weather / soil sensor — confirmed
  | 'VISION_VERIFIED'         // photo analysis — confirmed
  | 'CLARIFICATION_CONFIRMED' // farmer answered a clarification — confirmed
  | 'INTENT_MAP'              // intent_observation_mapping DB row — candidate
  | 'HYPOTHESIS'              // hypothesis_master differential — candidate
  | 'ALIAS_EXPAND_CANONICAL_TO_ALIAS'; // canonical→alias fan-out — candidate

const CONFIRMED_PROVENANCES = new Set<ObservationProvenance>([
  'FARMER_ASSERTED',
  'SENSOR',
  'VISION_VERIFIED',
  'CLARIFICATION_CONFIRMED'
]);

export class ObservationIntegrityViolation extends Error {
  readonly code: string;
  readonly provenance: ObservationProvenance;
  constructor(code: string, provenance: ObservationProvenance, msg?: string) {
    super(msg ?? `OBSERVATION_CONTAMINATION_ERROR: code=${code} provenance=${provenance} is not a confirmed source`);
    this.name = 'ObservationIntegrityViolation';
    this.code = code;
    this.provenance = provenance;
  }
}

export interface EvidenceNode {
  code: string;
  provenance: ObservationProvenance;
  source_module: string;
  confidence?: number;
}

export class EvidenceGraph {
  readonly confirmed = new Map<string, EvidenceNode>();
  readonly candidate = new Map<string, EvidenceNode>();
  readonly violations: ObservationIntegrityViolation[] = [];

  addConfirmed(node: EvidenceNode): void {
    if (!CONFIRMED_PROVENANCES.has(node.provenance)) {
      const v = new ObservationIntegrityViolation(node.code, node.provenance);
      this.violations.push(v);
      // Structured log so prod traces capture every contamination attempt.
      // eslint-disable-next-line no-console
      console.error(`[OBSERVATION_CONTAMINATION_ERROR] ${v.message} source=${node.source_module}`);
      // Fail-safe: route into candidate lane instead of throwing so the
      // pipeline keeps running but never lies about confirmation.
      this.addCandidate(node);
      return;
    }
    // Candidate lane never wins over confirmed.
    this.candidate.delete(node.code);
    const existing = this.confirmed.get(node.code);
    if (!existing || (node.confidence ?? 0) > (existing.confidence ?? 0)) {
      this.confirmed.set(node.code, node);
    }
  }

  addCandidate(node: EvidenceNode): void {
    if (this.confirmed.has(node.code)) return; // confirmed wins, never demote
    const existing = this.candidate.get(node.code);
    if (!existing || (node.confidence ?? 0) > (existing.confidence ?? 0)) {
      this.candidate.set(node.code, node);
    }
  }

  /** Promote a candidate to confirmed when farmer answers a clarification. */
  promoteToConfirmed(code: string, source_module: string): boolean {
    const c = this.candidate.get(code);
    if (!c) return false;
    this.candidate.delete(code);
    this.confirmed.set(code, {
      ...c,
      provenance: 'CLARIFICATION_CONFIRMED',
      source_module
    });
    return true;
  }

  confirmedCodes(): string[] { return [...this.confirmed.keys()]; }
  candidateCodes(): string[] { return [...this.candidate.keys()]; }

  /** Sanity invariant: confirmed ∩ candidate = ∅ */
  assertDisjoint(): void {
    for (const c of this.candidate.keys()) {
      if (this.confirmed.has(c)) {
        const v = new ObservationIntegrityViolation(c, this.candidate.get(c)!.provenance,
          `OBSERVATION_CONTAMINATION_ERROR: ${c} appears in both confirmed and candidate lanes`);
        this.violations.push(v);
        this.candidate.delete(c);
      }
    }
  }
}

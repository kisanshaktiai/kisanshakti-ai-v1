/**
 * Graph loader public types.
 *
 * STRICT: no crop / pest / disease / stage / symptom literals in this file.
 * Types only reference node categories: INTENT, OBSERVATION, HYPOTHESIS,
 * RULE, CLARIFICATION, DECISION.
 *
 * All string-typed identifiers are opaque codes owned by the database.
 */

// ── Opaque code aliases (documentation only; not enforced at compile time)
export type IntentCode        = string;
export type ObservationCode   = string;
export type HypothesisId      = string;
export type RuleId            = string;
export type ClarificationId   = string;
export type CropCode          = string;
export type StageCode         = string;

export interface GraphContext {
  intent_code:   IntentCode | null;
  crop_code:     CropCode   | null;
  stage_code:    StageCode  | null;
  das:           number     | null;
  trace_id:      string;
}

// ── OBSERVATION node
export interface ObservationNode {
  observation_code: ObservationCode;
  scope:            'UNIVERSAL' | 'CROP_SPECIFIC';
  category:         string | null;
  severity_class:   string | null;
  metadata:         Record<string, unknown>;
}

export interface ObservationValidation {
  observation_code: ObservationCode;
  valid:            boolean;
  confidence:       number;             // 0–1
  reason:           string;             // machine token, never farmer-facing
  relationship:     'IOM_ANCHORED' | 'ALIAS_MATCH' | 'UNIVERSAL' | 'UNKNOWN';
}

// ── HYPOTHESIS node
export interface HypothesisCandidate {
  hypothesis_id:      HypothesisId;
  canonical_group:    string | null;
  required_evidence:  ObservationCode[];
  supporting_evidence: ObservationCode[];
  contradicting_evidence: ObservationCode[];
  candidate_rule_ids: RuleId[];
  raw_score:          number;
}

// ── RULE node
export interface RuleNode {
  rule_id:     RuleId;
  category:    string | null;
  metadata:    Record<string, unknown>;
  product_ids: string[];
}

// ── CLARIFICATION node
export interface ClarificationEdge {
  clarification_id: ClarificationId;
  observation_code: ObservationCode | null;
  hypothesis_id:    HypothesisId    | null;
  question_key:     string;              // opaque; text lives in i18n tables
  option_keys:      string[];
}

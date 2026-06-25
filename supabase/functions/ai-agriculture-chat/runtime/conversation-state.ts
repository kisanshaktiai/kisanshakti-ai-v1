/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase H — CANONICAL CONVERSATION STATE (Single Runtime Authority)
 * ═══════════════════════════════════════════════════════════════════════════
 * Computed exactly once per request, immediately after observation extraction.
 * Frozen. Every downstream module reads from this object instead of
 * independently recomputing intent / clarification / coverage / stage / mode.
 *
 * No DB IO. No mutation. Pure function.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { computeCoverage, INFORMATIVE_PLACEHOLDERS } from './evidence-coverage.ts';

export type ConversationMode = 'ADVISORY' | 'DIAGNOSIS' | 'MIXED';
export type SemanticStatus = 'OK' | 'FAIL_OPEN' | 'UNAVAILABLE' | 'SKIPPED';

export interface ConversationState {
  readonly trace_id: string;
  readonly intent: string;
  readonly intent_confidence: number;
  readonly mode: ConversationMode;

  readonly confirmed: ReadonlyArray<string>;
  readonly inferred:  ReadonlyArray<string>;
  readonly unknown:   ReadonlyArray<string>;
  readonly hypotheses: ReadonlyArray<string>;

  readonly coverage: number;       // 0..1 — confirmed-only, placeholders excluded
  readonly informative_count: number;

  readonly clarification_required: boolean;
  readonly clarification_reason: string;

  readonly stage: string | null;
  readonly stage_source: string;     // 'landContext' | 'crop_stage_master' | 'default' | …
  readonly crop:  string | null;
  readonly das:   number | null;

  readonly semantic_status: SemanticStatus;
  readonly symbolic_enabled: boolean;
  readonly direct_mode: boolean;
  readonly authority_status: string; // 'CONFIRMED' | 'UNCONFIRMED' | …
}

export interface BuildStateInput {
  trace_id: string;
  intent: string;
  intent_confidence: number;
  advisory_intent: boolean;
  confirmed: Iterable<string>;
  inferred:  Iterable<string>;
  hypotheses?: Iterable<string>;
  stage: string | null;
  stage_source: string;
  crop:  string | null;
  das:   number | null;
  semantic_status?: SemanticStatus;
  authority_status?: string;
}

const UNKNOWN_RE = /(_UNKNOWN$|^ACTION_NONE$|^PHOTO_NOT_PROVIDED$)/i;

function isUnknownPlaceholder(code: string): boolean {
  return UNKNOWN_RE.test(code);
}

export function buildConversationState(i: BuildStateInput): ConversationState {
  const confirmedAll = Array.from(new Set([...i.confirmed].filter(Boolean)));
  const inferredAll  = Array.from(new Set([...i.inferred ].filter(Boolean)));
  const hypotheses   = Array.from(new Set([...(i.hypotheses || [])].filter(Boolean)));

  // Split confirmed → informative vs unknown placeholders (Bug 2 fix)
  const confirmed: string[] = [];
  const unknown:   string[] = [];
  for (const c of confirmedAll) (isUnknownPlaceholder(c) ? unknown : confirmed).push(c);
  for (const c of inferredAll)  if (isUnknownPlaceholder(c)) unknown.push(c);

  const informative_count = confirmed.filter(c => !INFORMATIVE_PLACEHOLDERS.has(c)).length;
  const coverage = computeCoverage(confirmed);

  // Mode classification — content beats label.
  // Symptom presence (any informative confirmed OR any inferred symptom) forces DIAGNOSIS.
  const hasSymptomSignal = informative_count > 0 || inferredAll.length > 0;
  let mode: ConversationMode;
  if (hasSymptomSignal && i.advisory_intent) mode = 'MIXED';
  else if (hasSymptomSignal)                  mode = 'DIAGNOSIS';
  else if (i.advisory_intent)                 mode = 'ADVISORY';
  else                                        mode = 'DIAGNOSIS';

  // Direct mode is permitted ONLY for pure advisory with zero symptom signal.
  const direct_mode = mode === 'ADVISORY';

  // Clarification authority — single decision point.
  let clarification_required = false;
  let clarification_reason   = 'sufficient_evidence';
  if (mode === 'DIAGNOSIS' && informative_count === 0) {
    clarification_required = true;
    clarification_reason   = 'no_confirmed_observations';
  } else if (mode !== 'ADVISORY' && coverage < 0.25) {
    clarification_required = true;
    clarification_reason   = `coverage_below_threshold(${coverage.toFixed(2)})`;
  }

  const semantic_status: SemanticStatus = i.semantic_status ?? 'OK';
  const symbolic_enabled = semantic_status !== 'UNAVAILABLE';

  const state: ConversationState = {
    trace_id: i.trace_id,
    intent: i.intent,
    intent_confidence: i.intent_confidence,
    mode,
    confirmed,
    inferred: inferredAll.filter(c => !isUnknownPlaceholder(c)),
    unknown,
    hypotheses,
    coverage,
    informative_count,
    clarification_required,
    clarification_reason,
    stage: i.stage,
    stage_source: i.stage_source,
    crop:  i.crop,
    das:   i.das,
    semantic_status,
    symbolic_enabled,
    direct_mode,
    authority_status: i.authority_status ?? 'UNCONFIRMED',
  };

  return Object.freeze(state);
}

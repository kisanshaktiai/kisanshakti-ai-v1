// Phase H — CANONICAL CONVERSATION STATE (Single Runtime Authority)
//
// CHANGE LOG (newest first)
//   2026-08-08 00:00 UTC — FIX 3: presentation-string leak into evidence.
//     Clarification selections were arriving as rendered farmer-facing labels
//     (Devanagari sentences, emoji-prefixed option text, "Yellow leaves" etc.)
//     and were being counted as confirmed symbolic observations, inflating
//     informative_count and coverage with strings no rule could ever match.
//     Only canonical symbolic codes (ASCII snake/UPPER_SNAKE) are admitted;
//     everything else is dropped and logged as [EVIDENCE_PRESENTATION_LEAK].

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

// FIX 3 — a symbolic code is ASCII letters/digits/underscore only. Rendered
// labels (any non-ASCII script, whitespace, emoji, punctuation) are NOT codes.
const SYMBOLIC_CODE_RE = /^[A-Za-z][A-Za-z0-9_]{1,79}$/;

function isSymbolicCode(code: string): boolean {
  return SYMBOLIC_CODE_RE.test(code);
}

function admitCodes(raw: Iterable<string>, bucket: string, trace_id: string): string[] {
  const kept: string[] = [];
  const rejected: string[] = [];
  for (const c of new Set([...raw].filter(Boolean).map((x) => String(x).trim()))) {
    (isSymbolicCode(c) ? kept : rejected).push(c);
  }
  if (rejected.length > 0) {
    console.warn(
      `[EVIDENCE_PRESENTATION_LEAK] trace=${trace_id} bucket=${bucket} ` +
      `rejected=${rejected.length} sample=${JSON.stringify(rejected.slice(0, 3))}`,
    );
  }
  return kept;
}

export function buildConversationState(i: BuildStateInput): ConversationState {
  const confirmedAll = admitCodes(i.confirmed, 'confirmed', i.trace_id);
  const inferredAll  = admitCodes(i.inferred,  'inferred',  i.trace_id);
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

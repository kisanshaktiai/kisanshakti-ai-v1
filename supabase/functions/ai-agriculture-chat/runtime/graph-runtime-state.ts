/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH RUNTIME STATE — Phase I (Graph SSOT)
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE immutable per-request runtime graph shared by every module.
 *
 * Replaces the previous pattern where each module (extractor → mapper →
 * validator → authority → clarification → rule-eval → builder) maintained
 * its own private copy of crop / stage / observations / candidates.
 *
 * Design principles:
 *   1. The shell is frozen — slots cannot be re-assigned once set.
 *   2. ObservationLedger is APPEND-ONLY. No rename, no replace, no drop.
 *      Transformations append a new node referencing the parent.
 *   3. RuleCandidate scores accumulate in-place. Validators never rebuild
 *      candidate lists.
 *   4. assertNoGraphDrift() throws fail-fast on any divergence.
 *   5. SYMBOLIC_ID_LEAK throws if a label-shaped value sneaks into a
 *      slot that expects a canonical code.
 *
 * NOTE: This module is the BLACKBOARD. It is plain data + invariants.
 *       No new agents, no new DB tables, no LLM calls.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { CanonicalContext } from '../decision/canonical-context-contract.ts';
export type CanonicalContextContract = CanonicalContext;

// ──────────────────────────────────────────────────────────────────────────
// CANONICAL ID INVARIANT — only [A-Z0-9_]+ allowed for codes carried on
// the symbolic graph. Anything else is presentation-layer leakage.
// ──────────────────────────────────────────────────────────────────────────
const CANONICAL_ID_RE = /^[A-Z0-9_]+$/;

export class SymbolicIdLeakError extends Error {
  constructor(slot: string, value: unknown) {
    super(
      `SYMBOLIC_ID_LEAK slot=${slot} value=${JSON.stringify(value)} — ` +
        `presentation strings must never enter the symbolic graph; carry the ` +
        `canonical code (UPPER_SNAKE) instead.`
    );
    this.name = 'SymbolicIdLeakError';
  }
}

export class GraphStateDriftError extends Error {
  public readonly stage: string;
  public readonly field: string;
  public readonly before: unknown;
  public readonly after: unknown;
  constructor(stage: string, field: string, before: unknown, after: unknown) {
    super(
      `GRAPH_STATE_DRIFT stage=${stage} field=${field} ` +
        `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
    );
    this.name = 'GraphStateDriftError';
    this.stage = stage;
    this.field = field;
    this.before = before;
    this.after = after;
  }
}

function assertCanonicalCode(slot: string, code: unknown): asserts code is string {
  if (typeof code !== 'string' || !CANONICAL_ID_RE.test(code)) {
    throw new SymbolicIdLeakError(slot, code);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// OBSERVATION LEDGER (append-only)
// ──────────────────────────────────────────────────────────────────────────
export type ObservationSource =
  | 'LLM'
  | 'IOM'
  | 'CLARIFICATION'
  | 'INFERRED'
  | 'PHOTO'
  | 'SEED';

export interface ObservationNode {
  readonly observation_code: string;
  readonly source: ObservationSource;
  readonly confidence: number;
  readonly confirmed: boolean;
  readonly rejected: boolean;
  readonly rejected_reason?: string;
  readonly semantic_class?: string;
  readonly crop_applicability?: readonly string[];
  readonly parent_code?: string;
  readonly validator_trail: readonly string[];
  readonly created_at: number;
}

export class ObservationLedger {
  private readonly _entries: ObservationNode[] = [];

  append(input: {
    observation_code: string;
    source: ObservationSource;
    confidence?: number;
    semantic_class?: string;
    crop_applicability?: string[];
    parent_code?: string;
    actor: string;
  }): ObservationNode {
    assertCanonicalCode('observation_ledger.observation_code', input.observation_code);
    const node: ObservationNode = Object.freeze({
      observation_code: input.observation_code,
      source: input.source,
      confidence: input.confidence ?? 0.5,
      confirmed: false,
      rejected: false,
      semantic_class: input.semantic_class,
      crop_applicability: input.crop_applicability
        ? Object.freeze([...input.crop_applicability])
        : undefined,
      parent_code: input.parent_code,
      validator_trail: Object.freeze([input.actor]),
      created_at: Date.now(),
    });
    this._entries.push(node);
    return node;
  }

  /** Append a "confirmed" derived node referencing the parent code. */
  confirm(observation_code: string, actor: string): void {
    assertCanonicalCode('observation_ledger.confirm', observation_code);
    const parent = this._entries.find((e) => e.observation_code === observation_code);
    this._entries.push(
      Object.freeze({
        observation_code,
        source: parent?.source ?? 'CLARIFICATION',
        confidence: Math.max(0.9, parent?.confidence ?? 0.9),
        confirmed: true,
        rejected: false,
        semantic_class: parent?.semantic_class,
        crop_applicability: parent?.crop_applicability,
        parent_code: parent?.observation_code,
        validator_trail: Object.freeze([...(parent?.validator_trail ?? []), actor]),
        created_at: Date.now(),
      })
    );
  }

  /** Append a "rejected" derived node — never removes the parent. */
  reject(observation_code: string, reason: string, actor: string): void {
    assertCanonicalCode('observation_ledger.reject', observation_code);
    const parent = this._entries.find((e) => e.observation_code === observation_code);
    this._entries.push(
      Object.freeze({
        observation_code,
        source: parent?.source ?? 'INFERRED',
        confidence: 0,
        confirmed: false,
        rejected: true,
        rejected_reason: reason,
        semantic_class: parent?.semantic_class,
        crop_applicability: parent?.crop_applicability,
        parent_code: parent?.observation_code,
        validator_trail: Object.freeze([...(parent?.validator_trail ?? []), actor]),
        created_at: Date.now(),
      })
    );
  }

  /** Frozen, append-only view. Length is monotonically non-decreasing. */
  view(): readonly ObservationNode[] {
    return Object.freeze([...this._entries]);
  }

  size(): number {
    return this._entries.length;
  }

  /** Latest status per observation_code (most recent node wins). */
  latestByCode(): Map<string, ObservationNode> {
    const out = new Map<string, ObservationNode>();
    for (const node of this._entries) out.set(node.observation_code, node);
    return out;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// RULE CANDIDATE GRAPH (in-place scoring)
// ──────────────────────────────────────────────────────────────────────────
export type RuleStatus = 'CANDIDATE' | 'WINNER' | 'DROPPED';

export class RuleCandidate {
  public readonly rule_id: string;
  public semantic_score = 0;
  public authority_score = 0;
  public scientific_score = 0;
  public completeness_score = 0;
  public matched_observations: string[] = [];
  public missing_observations: string[] = [];
  public ranking = 0;
  public status: RuleStatus = 'CANDIDATE';
  public drop_reason?: string;

  constructor(rule_id: string) {
    assertCanonicalCode('rule_candidate.rule_id', rule_id);
    this.rule_id = rule_id;
  }

  score(dim: 'semantic' | 'authority' | 'scientific' | 'completeness', value: number): void {
    switch (dim) {
      case 'semantic':     this.semantic_score = value; break;
      case 'authority':    this.authority_score = value; break;
      case 'scientific':   this.scientific_score = value; break;
      case 'completeness': this.completeness_score = value; break;
    }
  }

  drop(reason: string): void {
    this.status = 'DROPPED';
    this.drop_reason = reason;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// SNAPSHOT VERSIONS (Phase D.5 — per-request replayability)
// ──────────────────────────────────────────────────────────────────────────
export interface SnapshotVersions {
  readonly ontology_version: string | null;
  readonly iom_version: string | null;
  readonly rules_bundle_version: string | null;
  readonly translation_version: string | null;
  readonly canonical_context_hash: string | null;
  readonly language: string | null;
  readonly captured_at: number;
}

// ──────────────────────────────────────────────────────────────────────────
// GRAPH RUNTIME STATE (the blackboard)
// ──────────────────────────────────────────────────────────────────────────
export interface IntentNode {
  readonly intent_code: string;
  readonly confidence: number;
  readonly source: string;
}

export interface DecisionNode {
  readonly winner_rule_id: string | null;
  readonly decision_kind: 'DIAGNOSIS' | 'ADVISORY' | 'CLARIFICATION' | 'FALLBACK';
  readonly metadata: Record<string, unknown>;
}

export class GraphRuntimeState {
  public readonly trace_id: string;
  public readonly started_at: number;
  public readonly observation_ledger: ObservationLedger;
  public readonly hypothesis_graph: RuleCandidate[];

  private _canonical_context: CanonicalContextContract | null = null;
  private _snapshot_versions: SnapshotVersions | null = null;
  private _intent_node: IntentNode | null = null;
  private _decision_node: DecisionNode | null = null;
  private _presentation_set = false;

  constructor(trace_id: string) {
    this.trace_id = trace_id;
    this.started_at = Date.now();
    this.observation_ledger = new ObservationLedger();
    this.hypothesis_graph = [];
  }

  // ── Canonical context (Land SSOT) ────────────────────────────────────
  freezeCanonicalContext(ctx: CanonicalContextContract | null): void {
    if (this._canonical_context !== null) {
      throw new GraphStateDriftError(
        'GRAPH_FREEZE',
        'canonical_context',
        this._canonical_context,
        ctx
      );
    }
    this._canonical_context = ctx;
    if (ctx) {
      console.log(
        `[GRAPH_FREEZE][${this.trace_id}] canonical_context locked ` +
          `crop=${ctx.crop_code} stage=${ctx.growth_stage} ` +
          `das=${ctx.days_since_sowing} source=${ctx.source}`
      );
    } else {
      console.log(`[GRAPH_FREEZE][${this.trace_id}] canonical_context=NULL (general-query mode)`);
    }
  }

  get canonical_context(): CanonicalContextContract | null {
    return this._canonical_context;
  }

  // ── Snapshot versions ────────────────────────────────────────────────
  setSnapshotVersions(s: SnapshotVersions): void {
    if (this._snapshot_versions) {
      throw new GraphStateDriftError(
        'SNAPSHOT_FREEZE',
        'snapshot_versions',
        this._snapshot_versions,
        s
      );
    }
    this._snapshot_versions = Object.freeze(s);
  }

  get snapshot_versions(): SnapshotVersions | null {
    return this._snapshot_versions;
  }

  // ── Intent ───────────────────────────────────────────────────────────
  setIntent(node: IntentNode): void {
    assertCanonicalCode('intent_node.intent_code', node.intent_code);
    if (this._intent_node) {
      // Intent may only change with a hard re-derivation — currently disallowed.
      throw new GraphStateDriftError(
        'INTENT_SET',
        'intent_code',
        this._intent_node.intent_code,
        node.intent_code
      );
    }
    this._intent_node = Object.freeze(node);
  }

  get intent_node(): IntentNode | null {
    return this._intent_node;
  }

  // ── Decision ─────────────────────────────────────────────────────────
  setDecision(node: DecisionNode): void {
    if (node.winner_rule_id) assertCanonicalCode('decision_node.winner_rule_id', node.winner_rule_id);
    if (this._decision_node) {
      throw new GraphStateDriftError(
        'DECISION_SET',
        'decision_node',
        this._decision_node,
        node
      );
    }
    this._decision_node = Object.freeze({ ...node, metadata: { ...node.metadata } });
  }

  get decision_node(): DecisionNode | null {
    return this._decision_node;
  }

  // ── Presentation (terminal) ──────────────────────────────────────────
  markPresentationEmitted(): void {
    if (this._presentation_set) {
      throw new GraphStateDriftError('PRESENTATION_EMIT', 'presentation_node', true, true);
    }
    this._presentation_set = true;
  }

  // ── Snapshot for replay / persistence ────────────────────────────────
  snapshot() {
    return {
      trace_id: this.trace_id,
      started_at: this.started_at,
      elapsed_ms: Date.now() - this.started_at,
      canonical_context: this._canonical_context,
      snapshot_versions: this._snapshot_versions,
      intent: this._intent_node,
      decision: this._decision_node,
      observations: this.observation_ledger.view(),
      hypothesis_graph: this.hypothesis_graph.map((c) => ({
        rule_id: c.rule_id,
        semantic_score: c.semantic_score,
        authority_score: c.authority_score,
        scientific_score: c.scientific_score,
        completeness_score: c.completeness_score,
        matched: c.matched_observations,
        missing: c.missing_observations,
        ranking: c.ranking,
        status: c.status,
        drop_reason: c.drop_reason,
      })),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// DRIFT GUARD — call at the boundary of each pipeline phase.
// ──────────────────────────────────────────────────────────────────────────
export interface PhaseCheckpoint {
  observation_count: number;
  hypothesis_count: number;
  canonical_crop: string | null;
  canonical_stage: string | null;
  canonical_das: number | null;
  language: string | null;
  intent_code: string | null;
}

export function checkpoint(graph: GraphRuntimeState): PhaseCheckpoint {
  const c = graph.canonical_context;
  return {
    observation_count: graph.observation_ledger.size(),
    hypothesis_count: graph.hypothesis_graph.length,
    canonical_crop: c?.crop_code ?? null,
    canonical_stage: c?.growth_stage ?? null,
    canonical_das: c?.days_since_sowing ?? null,
    language: graph.snapshot_versions?.language ?? null,
    intent_code: graph.intent_node?.intent_code ?? null,
  };
}

export function assertNoGraphDrift(
  graph: GraphRuntimeState,
  previous: PhaseCheckpoint,
  stage: string
): PhaseCheckpoint {
  const now = checkpoint(graph);

  // Canonical context is locked — these may never change once set.
  if (previous.canonical_crop !== null && previous.canonical_crop !== now.canonical_crop) {
    throw new GraphStateDriftError(stage, 'canonical_context.crop_code', previous.canonical_crop, now.canonical_crop);
  }
  if (previous.canonical_stage !== null && previous.canonical_stage !== now.canonical_stage) {
    throw new GraphStateDriftError(stage, 'canonical_context.growth_stage', previous.canonical_stage, now.canonical_stage);
  }
  if (previous.canonical_das !== null && previous.canonical_das !== now.canonical_das) {
    throw new GraphStateDriftError(stage, 'canonical_context.days_since_sowing', previous.canonical_das, now.canonical_das);
  }
  if (previous.language !== null && previous.language !== now.language) {
    throw new GraphStateDriftError(stage, 'language', previous.language, now.language);
  }
  if (previous.intent_code !== null && previous.intent_code !== now.intent_code) {
    throw new GraphStateDriftError(stage, 'intent_node.intent_code', previous.intent_code, now.intent_code);
  }
  // Observation ledger is APPEND-ONLY — shrinking is forbidden.
  if (now.observation_count < previous.observation_count) {
    throw new GraphStateDriftError(
      stage,
      'observation_ledger.size',
      previous.observation_count,
      now.observation_count
    );
  }
  // Hypothesis graph entries may transition status but must not disappear
  // without a recorded drop_reason. (Length-only check here is sufficient
  // since RuleCandidate.drop() never removes the entry.)
  if (now.hypothesis_count < previous.hypothesis_count) {
    throw new GraphStateDriftError(
      stage,
      'hypothesis_graph.size',
      previous.hypothesis_count,
      now.hypothesis_count
    );
  }
  return now;
}

// ──────────────────────────────────────────────────────────────────────────
// SNAPSHOT VERSION LOADER — single 60s-cached round-trip.
// ──────────────────────────────────────────────────────────────────────────
let _snapshotCache: { at: number; data: Omit<SnapshotVersions, 'canonical_context_hash' | 'language' | 'captured_at'> } | null = null;
const SNAPSHOT_TTL_MS = 60_000;

export async function loadSnapshotVersions(
  supabase: { rpc: (...args: unknown[]) => Promise<unknown>; from: (t: string) => any },
  opts: { language: string | null; canonicalContextHash: string | null; rulesBundleVersion?: string | null }
): Promise<SnapshotVersions> {
  const now = Date.now();
  if (_snapshotCache && now - _snapshotCache.at < SNAPSHOT_TTL_MS) {
    return Object.freeze({
      ..._snapshotCache.data,
      canonical_context_hash: opts.canonicalContextHash,
      language: opts.language,
      captured_at: now,
    });
  }

  const safeMax = async (table: string, col: string): Promise<string | null> => {
    try {
      const { data } = await supabase.from(table).select(col).order(col, { ascending: false }).limit(1);
      const row = Array.isArray(data) ? data[0] : null;
      return row ? String(row[col]) : null;
    } catch {
      return null;
    }
  };

  const [ontology, iom, translations] = await Promise.all([
    safeMax('observation_master', 'updated_at'),
    safeMax('intent_observation_mapping', 'updated_at'),
    safeMax('observation_translations', 'updated_at'),
  ]);

  const data = {
    ontology_version: ontology,
    iom_version: iom,
    translation_version: translations,
    rules_bundle_version: opts.rulesBundleVersion ?? null,
  };
  _snapshotCache = { at: now, data };
  return Object.freeze({
    ...data,
    canonical_context_hash: opts.canonicalContextHash,
    language: opts.language,
    captured_at: now,
  });
}

/** Cheap deterministic hash for canonical context — used in SnapshotVersions. */
export function hashCanonicalContext(ctx: CanonicalContextContract | null): string | null {
  if (!ctx) return null;
  const parts = [
    ctx.crop_code ?? '',
    ctx.growth_stage ?? '',
    String(ctx.days_since_sowing ?? ''),
    String(ctx.ndvi?.value ?? ''),
    ctx.source ?? '',
  ].join('|');
  let h = 0;
  for (let i = 0; i < parts.length; i++) {
    h = ((h << 5) - h + parts.charCodeAt(i)) | 0;
  }
  return `cc_${(h >>> 0).toString(36)}`;
}

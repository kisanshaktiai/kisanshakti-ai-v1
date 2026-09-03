/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Lane B — CONTEXT rule selector (zero-observation advisory)
 * ───────────────────────────────────────────────────────────────────────────
 * CHANGE LOG (newest first)
 *   2026-09-03 — SAFETY/CONFLICT SEPARATION: gate result now carries
 *     `safetyBlocks` (is_safety_block=true only) and `conflictBlocks`
 *     (non-safety hard blocks). `resolveContextGateOutcome()` is the single
 *     post-gate selection used by the orchestrator (nextMatched / nextPrimary /
 *     safety_blocks entries / advisory lead), so tests execute the runtime path.
 *   2026-09-03 — EXPLICIT-EDGE LEAD (deno test T5 on live rows): a CONTEXT_BLOCK
 *     that suppressed a candidate through an authored graph edge now leads
 *     even when is_safety_block=false; previously it was demoted to an
 *     advisory and the suppressed candidate stayed primary_decision.
 *     hardBlockResponses.is_safety_block now reports the row's real flag.
 *   2026-09-03 — SERVABILITY + REGION GATES (live-DB verified). (a) Both
 *     decision_rules reads now require is_farmer_servable OR block rows
 *     (RICE_NUTR_ORGANIC_001 is an active, non-servable CONTEXT_SCHEDULE row
 *     that was previously selectable). (b) New ContextRuleQuery.regionCode:
 *     rows with a region_code must match the land's v_land_region code;
 *     unresolved region fails closed. All 8 rice grain_filling
 *     CONTEXT_SCHEDULE rows in the live DB are state-scoped (IN-TN/KL/JK/AS)
 *     and were being offered to IN-MH lands. Mirrors layered-rule-evaluator
 *     FIX 4 so Lane A and Lane B share one region semantics.
 *   2026-08-28 — FIX 7 (single context authority + strict override):
 *     (a) selectContextRules() is DISCOVERY ONLY — no condition_code
 *         suppression, no blocks-first ordering, CONTEXT_BLOCK rows never
 *         enter the candidate stream from Lane B. applyContextBlockGate() is
 *         the one context-decision authority.
 *     (b) condition_code_dose_fallback is SHADOW MODE — telemetry only
 *         (would_have_suppressed), never suppresses. No explicit graph edge
 *         → no suppression, without exception.
 *     (c) A hard safety block may LEAD only when it established an explicit
 *         graph conflict with a candidate, or when no candidate survives.
 *         A merely-relevant safety block becomes a CONTEXT_SAFETY_OVERLAY —
 *         farmer-visible, never primary.
 *   2026-08-27 — FIX 6 (P1 decision-correctness): CONTEXT_BLOCK GATE REWRITE.
 *     Root cause of "pest question answered with an unrelated late-N warning":
 *     applyContextBlockGate() treated *context eligibility* (crop/stage/DAS)
 *     as *decision authority* — any applicable block was prepended to
 *     matched_responses and became primary_decision, and candidates were
 *     suppressed on loose identity tokens (category / cause). The gate now
 *     enforces the decision-brain invariant:
 *       A rule may override or suppress another rule ONLY when the graph
 *       explicitly establishes the relationship AND the block is
 *       semantically relevant to this turn AND (for primary override) the
 *       row is an authorised hard safety block (is_safety_block = true).
 *     Gates G1 context / G2 relevance / G3 explicit conflict / G4 authority —
 *     see the FIX 6 section at the bottom of this file. category / cause /
 *     observation_code are never conflict keys any more.
 *     cultivationMatches() is now fail-CLOSED for an unknown method.
 *   2026-08-26 14:40 UTC — Fix 5 (agronomic safety): added
 *     `selectContextBlocks()` + `applyContextBlockGate()`. CONTEXT_BLOCK rows
 *     applicable to the current crop/stage/DAS/cultivation now suppress ANY
 *     emitted rule that carries the same condition_code or category, in every
 *     lane (not only Lane B). The block row itself becomes the primary
 *     response so the farmer receives the prohibition, never the dose.
 *     NO agronomy is hardcoded: applicability and identity come from the DB row.
 *   2026-08-20 10:10 UTC — Initial. Selects decision_rules rows whose
 *     trigger_class is CONTEXT_SCHEDULE / CONTEXT_BLOCK by crop + stage + DAS +
 *     cultivation method, with NO observation / condition_code filter. Lane A
 *     (symptom-driven) is untouched. CONTEXT_BLOCK wins over a CONTEXT_SCHEDULE
 *     row that carries the same condition_code (same nutrient) — the block
 *     message is kept and the conflicting dose suppressed.
 *     NO agronomy is encoded here: every value comes from the DB row.
 * ═══════════════════════════════════════════════════════════════════════════
 */


export type ContextTriggerClass = 'CONTEXT_SCHEDULE' | 'CONTEXT_BLOCK';

export interface ContextRuleQuery {
  cropCode: string | null | undefined;
  growthStage: string | null | undefined;
  das: number | null | undefined;
  cultivationMethod?: string | null;
  /**
   * REGION GATE (2026-09-03): land region ('IN-MH' …) resolved from
   * v_land_region. null/undefined = unresolved → region-scoped rows are
   * dropped (fail-closed, same semantics as layered-rule-evaluator FIX 4).
   */
  regionCode?: string | null;
  traceId?: string;
}

/** PostgREST `or` filter: farmer-servable rows, plus block rows (see rule-repository). */
const SERVABILITY_OR = 'is_farmer_servable.eq.true,rule_intent.eq.block,is_safety_block.eq.true';

/**
 * REGION GATE (2026-09-03). decision_rules.region_code null/'' = global (passes);
 * otherwise it must equal the land region. Unknown land region → region-scoped
 * rows fail closed. No agronomy: both values are DB columns.
 */
function regionMatches(row: any, landRegion: string): boolean {
  const ruleRegion = String(row?.region_code ?? '').trim().toUpperCase();
  if (!ruleRegion) return true;
  if (!landRegion) return false;
  return ruleRegion === landRegion;
}

export interface ContextRuleSelection {
  /** Winning rule (block first, then highest priority schedule rule). */
  primary: any | null;
  /** All applicable rows after block-suppression, priority DESC. */
  applicable: any[];
  /** Rows suppressed because a CONTEXT_BLOCK owns the same condition_code. */
  suppressed: any[];
  blocks: any[];
}

const UNIVERSAL = ['universal', 'all', 'any', '*'];

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(norm).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [norm(v)];
  return [];
}

function stageMatches(row: any, stage: string): boolean {
  if (!stage) return false;
  const single = norm(row?.growth_stage);
  if (single && (single === stage || UNIVERSAL.includes(single))) return true;
  const list = arr(row?.stage_applicable);
  if (list.length === 0) return false;
  return list.includes(stage) || list.some((s) => UNIVERSAL.includes(s));
}

function dasMatches(row: any, das: number | null): boolean {
  if (das === null || !isFinite(das)) return false;
  const min = row?.crop_age_days_min;
  const max = row?.crop_age_days_max;
  if (min == null && max == null) return false;
  if (min != null && das < Number(min)) return false;
  if (max != null && das > Number(max)) return false;
  return true;
}

function cultivationMatches(row: any, method: string): boolean {
  const list = arr(row?.cultivation_method_applicable);
  if (list.length === 0) return true; // universal
  if (list.some((m) => UNIVERSAL.includes(m))) return true;
  // FIX 6: fail-CLOSED. A row that names specific methods is NOT applicable
  // when the farmer's method is unknown; only rows the DB marks universal pass.
  if (!method) return false;
  return list.includes(method);
}

/**
 * Query CONTEXT rules for the canonical crop/stage/DAS context.
 * Never throws — a failure returns an empty selection so the turn survives.
 */
export async function selectContextRules(
  supabase: any,
  q: ContextRuleQuery,
): Promise<ContextRuleSelection> {
  const empty: ContextRuleSelection = { primary: null, applicable: [], suppressed: [], blocks: [] };
  const crop = norm(q.cropCode);
  const stage = norm(q.growthStage);
  const das = typeof q.das === 'number' && isFinite(q.das) ? Math.floor(q.das) : null;
  const method = norm(q.cultivationMethod);
  const trace = q.traceId ?? 'n/a';

  if (!crop) {
    console.log(`[LANE_B_CONTEXT_RULES] trace=${trace} skipped reason=no_crop`);
    return empty;
  }

  let rows: any[] = [];
  try {
    const cropVariants = Array.from(new Set([
      crop, crop.toUpperCase(),
      ...UNIVERSAL, ...UNIVERSAL.map((u) => u.toUpperCase()),
    ]));
    const { data, error } = await supabase
      .from('decision_rules')
      .select('*')
      .eq('is_active', true)
      .or(SERVABILITY_OR) // SERVABILITY GATE (2026-09-03)
      .in('trigger_class', ['CONTEXT_SCHEDULE', 'CONTEXT_BLOCK'])
      .in('crop_code', cropVariants)
      .order('priority', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn(`[LANE_B_CONTEXT_RULES] trace=${trace} query failed: ${(e as Error).message}`);
    return empty;
  }

  // AUDIT FIX (2026-08-28, live-DB verified): applicability semantics follow the
  // AUTHORING of each row, generically. All 52 active CONTEXT rows author
  // stage_applicable; 6 (all N-schedule rows incl. RICE_NUTR_N_TOP1/TOP2/BASAL,
  // LCC, ORGANIC, LATE_N_BLOCK) ALSO author crop_age_days_min/max; 0 author DAS
  // alone. The previous OR let a calendar-DAS window override a biological-stage
  // mismatch (stage SSOT), e.g. a tillering-only top-dress offered at DAS 50
  // while the field is at panicle_initiation. Rule: every authored dimension
  // must pass — stage when authored, DAS window when authored; a dimension the
  // author left empty does not constrain.
  const landRegion = String(q.regionCode ?? '').trim().toUpperCase();
  const droppedByRegion: string[] = [];
  const applicableRaw = rows.filter((r) => {
    const hasStage = !!norm(r?.growth_stage) || arr(r?.stage_applicable).length > 0;
    const hasDas = r?.crop_age_days_min != null || r?.crop_age_days_max != null;
    if (!hasStage && !hasDas) return false; // unauthored applicability never matches
    if (hasStage && !stageMatches(r, stage)) return false;
    if (hasDas && !dasMatches(r, das)) return false;
    if (!cultivationMatches(r, method)) return false;
    // REGION GATE (2026-09-03): a state-PoP row (IN-TN, IN-KL …) must never be
    // offered to a land in another state; unresolved land region fails closed.
    if (!regionMatches(r, landRegion)) { droppedByRegion.push(String(r?.rule_id ?? '')); return false; }
    return true;
  });

  // FIX 7 (2026-08-28): Lane B is DISCOVERY ONLY. This selector no longer
  // suppresses by condition_code and no longer leads with blocks — there is
  // exactly ONE context-decision authority (applyContextBlockGate). Only
  // CONTEXT_SCHEDULE rows enter the candidate stream; CONTEXT_BLOCK rows are
  // returned in `blocks` for telemetry and are injected (or not) by the gate
  // under its G1–G4 contract.
  const blocks = applicableRaw.filter((r) => norm(r?.trigger_class) === 'context_block');
  const suppressed: any[] = [];
  const kept = applicableRaw
    .filter((r) => norm(r?.trigger_class) !== 'context_block')
    .sort((a, b) => Number(b?.priority ?? 0) - Number(a?.priority ?? 0));

  console.log(
    `[LANE_B_CONTEXT_RULES] trace=${trace} crop=${crop} stage=${stage || 'null'} das=${das ?? 'null'} ` +
    `cultivation=${method || 'null'} region=${landRegion || 'UNRESOLVED'} fetched=${rows.length} applicable=${kept.length} ` +
    `dropped_by_region=${droppedByRegion.join(',') || 'none'} ` +
    `blocks=${blocks.map((b) => b.rule_id).join(',') || 'none'} ` +
    `suppressed=${suppressed.map((s) => s.rule_id).join(',') || 'none'} ` +
    `winner=${kept[0]?.rule_id ?? 'none'}`,
  );

  return { primary: kept[0] ?? null, applicable: kept, suppressed, blocks };
}

/** Project a decision_rules row into the evaluator's matched_response shape. */
export function toMatchedResponse(row: any): any {
  return {
    ...row,
    rule_id: row?.rule_id,
    action_type: row?.action_type ?? (norm(row?.trigger_class) === 'context_block' ? 'AVOID' : 'APPLY'),
    action_text: row?.action_text ?? null,
    reason_text: row?.reason_text ?? null,
    cause: row?.cause ?? row?.condition_code ?? null,
    observation_code: row?.condition_code ?? null,
    condition_code: row?.condition_code ?? null,
    dosage_per_acre: row?.dosage_per_acre ?? null,
    organic_alternative: row?.organic_alternative ?? null,
    priority: Number(row?.priority ?? 0),
    confidence_score: 0.9,
    weighted_confidence: 0.9,
    application_details: { ...row, rule_id: row?.rule_id },
    trigger_class: row?.trigger_class ?? null,
    lane: 'CONTEXT',
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FIX 6 (2026-08-27) — CONTEXT_BLOCK GATE (graph-authoritative rewrite)
 *
 * Invariant enforced here:
 *   A rule may override or suppress another rule only when the decision graph
 *   explicitly establishes the relationship and the overriding rule is
 *   semantically relevant to the farmer's turn. Everything else is advisory.
 *
 * Nothing agronomic is encoded: crops, nutrients, stages, hypotheses, intents
 * and every edge come from decision_rules / hypothesis_rule_mapping /
 * intent_observation_mapping / rule_conflict_matrix rows.
 * ═════════════════════════════════════════════════════════════════════════ */

/** Turn-level semantic context the gate needs to prove relevance. */
export interface ContextBlockTurnContext {
  /** Locked intent code for this turn (e.g. from IntentLock.locked_intent). */
  intentCode?: string | null;
  /** Hypothesis IDs the graph produced for this turn (candidates). */
  hypothesisIds?: string[] | null;
  /** Confirmed + extracted observation codes for this turn. */
  observationCodes?: string[] | null;
}

export type ConflictSource =
  | 'blocks_rule_ids'
  | 'contraindications'
  | 'mutually_exclusive_with'
  | 'rule_conflict_matrix'
  | 'condition_code_dose_fallback';

export interface ContextBlockEvaluation {
  rule_id: string;
  context_match: boolean;
  intent_match: boolean;
  hypothesis_match: boolean;
  observation_match: boolean;
  candidate_condition_match: boolean;
  relevant: boolean;
  safety_authority: boolean;
  suppressed_rule_ids: string[];
  /** Shadow-mode fallback hits (missing graph edge) — telemetry, no suppression. */
  would_have_suppressed: string[];
  conflict_sources: ConflictSource[];
  has_authored_edges: boolean;
}

export interface ContextBlockGateResult {
  /** Candidates that survive suppression — primary_decision MUST come from here. */
  kept: any[];
  /** Candidates removed by an explicit graph conflict. */
  suppressed: any[];
  /** Hard blocks that ESTABLISHED an explicit conflict (or stand alone) — may lead. */
  hardBlocks: any[];
  /** Relevant hard safety blocks WITHOUT an established conflict — safety overlays. */
  overlays: any[];
  /** Relevant blocks WITHOUT safety authority (appended after kept, never primary). */
  advisories: any[];
  /** Applicable-but-irrelevant blocks that were dropped (telemetry only). */
  dropped: any[];
  /** Leading hard blocks projected as matched_responses. */
  hardBlockResponses: any[];
  /** Safety overlays projected as matched_responses (after kept, before advisories). */
  overlayResponses: any[];
  /** Advisory blocks projected as matched_responses (lane=CONTEXT_ADVISORY). */
  advisoryResponses: any[];
  evaluations: ContextBlockEvaluation[];
  /** Anomaly counters — should trend to zero after DB remediation. */
  anomalies: Record<string, number>;
  /**
   * 2026-09-03 — SAFETY vs CONFLICT SEPARATION.
   * `safetyBlocks`: the ONLY rows allowed into runtime `safety_blocks` —
   *   hardBlocks ∪ overlays restricted to is_safety_block === true.
   * `conflictBlocks`: hardBlocks with is_safety_block !== true — they
   *   suppressed a candidate through an authored edge (telemetry / lead
   *   only, never safety status).
   */
  safetyBlocks: any[];
  conflictBlocks: any[];
  /** @deprecated kept for older call sites: hardBlockResponses */
  blockResponses: any[];
  /** @deprecated kept for older call sites: hardBlocks ∪ advisories */
  blocks: any[];
}

/** Runtime `safety_blocks` entry shape produced by the gate outcome (orchestrator contract). */
export interface ContextSafetyBlockEntry {
  rule_id: string;
  reason: 'CONTEXT_BLOCK';
  condition_code: string | null;
  message: string | null;
}

export interface ContextGateOutcome {
  nextMatched: any[];
  nextPrimary: any | null;
  /** is_safety_block === true rows only, projected for layeredRuleResult.safety_blocks. */
  safetyBlockEntries: ContextSafetyBlockEntry[];
  /** Non-safety rows that suppressed a candidate — telemetry, never safety status. */
  conflictBlockIds: string[];
  advisoryLead: any | null;
  advisoryLeadReason: 'zero_candidate_lane_b' | null;
}

/**
 * 2026-09-03 — Single selection authority for the orchestrator's post-gate
 * merge (extracted so a test can execute the SAME code the runtime runs).
 *
 *   primary  = hard block (explicit conflict / standalone safety) → kept
 *              candidate → zero-candidate Lane-B advisory lead → prior
 *              primary unless it was suppressed → null.
 *   safety   = is_safety_block === true rows only.
 *   conflict = non-safety hard blocks (candidate suppression, telemetry).
 *
 * A safety block can never fall through to `advisoryLead` (advisories are
 * non-safety by construction, and a safety row that suppressed or stands
 * alone is already a hard block and wins the first branch).
 */
export function resolveContextGateOutcome(
  gate: ContextBlockGateResult,
  opts: { priorPrimary?: any | null; zeroCandidateLaneB?: boolean },
): ContextGateOutcome {
  const zeroCandidateLaneB = opts?.zeroCandidateLaneB === true;
  const priorPrimary = opts?.priorPrimary ?? null;
  const nextMatched = [
    ...gate.hardBlockResponses, ...gate.kept, ...gate.overlayResponses, ...gate.advisoryResponses,
  ];
  const advisoryLead =
    zeroCandidateLaneB && gate.kept.length === 0 && gate.hardBlockResponses.length === 0
      ? (gate.advisoryResponses.find((r: any) => r?.is_safety_block !== true) ?? null)
      : null;
  const suppressedIds = new Set(gate.suppressed.map((s: any) => String(s?.rule_id ?? '')));
  const priorId = String(priorPrimary?.rule_id ?? '');
  const nextPrimary =
    gate.hardBlockResponses[0] ??
    gate.kept[0] ??
    advisoryLead ??
    (priorPrimary && !suppressedIds.has(priorId) ? priorPrimary : null) ??
    null;
  const safetyBlockEntries: ContextSafetyBlockEntry[] = gate.safetyBlocks.map((b: any) => ({
    rule_id: String(b?.rule_id ?? ''),
    reason: 'CONTEXT_BLOCK',
    condition_code: b?.condition_code ?? null,
    message: b?.action_text ?? b?.reason_text ?? null,
  }));
  return {
    nextMatched, nextPrimary, safetyBlockEntries,
    conflictBlockIds: gate.conflictBlocks.map((b: any) => String(b?.rule_id ?? '')),
    advisoryLead, advisoryLeadReason: advisoryLead ? 'zero_candidate_lane_b' : null,
  };
}

function strArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function upperSet(v: unknown): Set<string> {
  return new Set(strArr(v).map((x) => x.toUpperCase()));
}

/** Observation codes a CONTEXT_BLOCK row declares in conditions_json. */
function blockPredicateObservations(row: any): string[] {
  const cj = row?.conditions_json;
  const obs = cj && typeof cj === 'object' ? (cj as any).observations : null;
  return strArr(obs).map((o) => o.toLowerCase());
}

/** True when a candidate carries an input dose (the thing a block prohibits). */
function candidateCarriesDose(c: any): boolean {
  const ic = norm(c?.input_class);
  if (ic && ic !== 'none') return true;
  if (norm(c?.dosage_per_acre)) return true;
  if (norm(c?.active_ingredient)) return true;
  return false;
}

/** G1 — context eligibility. Fetch CONTEXT_BLOCK rows for crop/stage/DAS/method. */
export async function selectContextBlocks(
  supabase: any,
  q: ContextRuleQuery,
): Promise<any[]> {
  const crop = norm(q.cropCode);
  const stage = norm(q.growthStage);
  const das = typeof q.das === 'number' && isFinite(q.das) ? Math.floor(q.das) : null;
  const method = norm(q.cultivationMethod);
  const trace = q.traceId ?? 'n/a';
  if (!crop) return [];

  try {
    const cropVariants = Array.from(new Set([
      crop, crop.toUpperCase(),
      ...UNIVERSAL, ...UNIVERSAL.map((u) => u.toUpperCase()),
    ]));
    const { data, error } = await supabase
      .from('decision_rules')
      .select('*')
      .eq('is_active', true)
      .or(SERVABILITY_OR) // SERVABILITY GATE (2026-09-03) — blocks always pass
      .eq('trigger_class', 'CONTEXT_BLOCK')
      .in('crop_code', cropVariants)
      .order('priority', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];
    const landRegion = String(q.regionCode ?? '').trim().toUpperCase();
    return rows.filter((r) =>
      // REGION GATE (2026-09-03): same rule as Lane B discovery.
      regionMatches(r, landRegion) &&
      // AUDIT FIX (2026-08-28): same authored-dimension conjunction as Lane B
      // discovery. A CONTEXT_BLOCK (e.g. RICE_NUTR_LATE_N_BLOCK_001, which
      // authors BOTH stages and DAS 75-130) must not become applicable from a
      // calendar-DAS window when the biological stage disagrees with the SSOT.
      ((): boolean => {
        const hasStage = !!norm(r?.growth_stage) || arr(r?.stage_applicable).length > 0;
        const hasDas = r?.crop_age_days_min != null || r?.crop_age_days_max != null;
        if (!hasStage && !hasDas) return false;
        if (hasStage && !stageMatches(r, stage)) return false;
        if (hasDas && !dasMatches(r, das)) return false;
        return cultivationMatches(r, method);
      })()
    );
  } catch (e) {
    console.warn(`[CONTEXT_BLOCK_GATE] trace=${trace} query failed: ${(e as Error).message}`);
    return [];
  }
}

/** Load the full decision_rules rows for candidate rule_ids (graph edges live there). */
async function loadCandidateRows(supabase: any, ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('decision_rules')
      .select('id,rule_id,condition_code,category,input_class,dosage_per_acre,active_ingredient,blocks_rule_ids,contraindications,mutually_exclusive_with,is_safety_block')
      .in('rule_id', ids)
      .limit(500);
    if (error) throw new Error(error.message);
    for (const r of (Array.isArray(data) ? data : [])) out.set(String(r.rule_id), r);
  } catch (e) {
    console.warn(`[CONTEXT_BLOCK_GATE] candidate row load failed: ${(e as Error).message}`);
  }
  return out;
}

/** Hypothesis edges for block rule_ids → Map<rule_id, Set<hypothesis_id>>. */
async function loadHypothesisEdges(supabase: any, blockIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (blockIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('hypothesis_rule_mapping')
      .select('rule_id,hypothesis_id')
      .in('rule_id', blockIds)
      .limit(1000);
    if (error) throw new Error(error.message);
    for (const r of (Array.isArray(data) ? data : [])) {
      const k = String(r.rule_id);
      if (!out.has(k)) out.set(k, new Set());
      out.get(k)!.add(String(r.hypothesis_id).toUpperCase());
    }
  } catch (e) {
    console.warn(`[CONTEXT_BLOCK_GATE] hypothesis edge load failed: ${(e as Error).message}`);
  }
  return out;
}

/** Observation codes the turn intent maps to (intent_observation_mapping), lower-cased. */
async function loadIntentObservationCodes(
  supabase: any, intentCode: string | null | undefined, cropCode: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  const intent = String(intentCode ?? '').trim().toUpperCase();
  if (!intent) return out;
  try {
    const cropVariants = Array.from(new Set([
      cropCode, cropCode.toUpperCase(),
      ...UNIVERSAL, ...UNIVERSAL.map((u) => u.toUpperCase()),
    ]));
    const { data, error } = await supabase
      .from('intent_observation_mapping')
      .select('observation_code,crop_code')
      .eq('is_active', true)
      .eq('intent_code', intent)
      .in('crop_code', cropVariants)
      .limit(1000);
    if (error) throw new Error(error.message);
    for (const r of (Array.isArray(data) ? data : [])) out.add(norm(r.observation_code));
  } catch (e) {
    console.warn(`[CONTEXT_BLOCK_GATE] intent→observation load failed: ${(e as Error).message}`);
  }
  return out;
}

/**
 * Explicit conflict pairs from rule_conflict_matrix. The table keys on
 * decision_rules.id (UUID), so callers pass a uuid→rule_id lookup covering the
 * blocks and candidates; the result maps text rule_ids on both sides.
 */
async function loadConflictMatrix(
  supabase: any,
  uuidToRuleId: Map<string, string>,
  blockUuids: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (blockUuids.length === 0) return out;
  try {
    const list = `(${blockUuids.join(',')})`;
    const { data, error } = await supabase
      .from('rule_conflict_matrix')
      .select('rule_a_id,rule_b_id,resolved')
      .or(`rule_a_id.in.${list},rule_b_id.in.${list}`)
      .limit(1000);
    if (error) throw new Error(error.message);
    for (const r of (Array.isArray(data) ? data : [])) {
      if (r.resolved === true) continue;
      const a = uuidToRuleId.get(String(r.rule_a_id)) ?? String(r.rule_a_id);
      const b = uuidToRuleId.get(String(r.rule_b_id)) ?? String(r.rule_b_id);
      if (!out.has(a)) out.set(a, new Set());
      if (!out.has(b)) out.set(b, new Set());
      out.get(a)!.add(b);
      out.get(b)!.add(a);
    }
  } catch {
    /* table may be empty or absent — explicit edges elsewhere still apply */
  }
  return out;
}

/**
 * Four-gate CONTEXT_BLOCK evaluation. Never throws — a failure returns the
 * input intact with no blocks admitted.
 */
export async function applyContextBlockGate(
  supabase: any,
  q: ContextRuleQuery,
  candidates: any[],
  turn: ContextBlockTurnContext = {},
): Promise<ContextBlockGateResult> {
  const list = Array.isArray(candidates) ? candidates : [];
  const trace = q.traceId ?? 'n/a';
  const anomalies: Record<string, number> = {
    context_block_not_relevant_dropped: 0,
    context_block_without_conflict_edge: 0,
    context_block_without_intent_match: 0,
    context_block_lead_without_safety_flag: 0,
    context_block_advisory_only: 0,
    context_block_promoted_to_primary: 0,
    candidate_suppressed_by_condition_code_fallback: 0,
  };
  const passthrough = (): ContextBlockGateResult => ({
    kept: list, suppressed: [], hardBlocks: [], overlays: [], advisories: [], dropped: [],
    hardBlockResponses: [], overlayResponses: [], advisoryResponses: [], evaluations: [], anomalies,
    safetyBlocks: [], conflictBlocks: [],
    blockResponses: [], blocks: [],
  });

  // G1 — context eligibility
  const eligible = await selectContextBlocks(supabase, q);
  if (eligible.length === 0) return passthrough();

  const crop = norm(q.cropCode);
  const blockIds = eligible.map((b) => String(b?.rule_id ?? '')).filter(Boolean);
  const candidateIds = Array.from(new Set(list.map((c) => String(c?.rule_id ?? '')).filter(Boolean)));

  const [candRows, hypEdges, intentObs] = await Promise.all([
    loadCandidateRows(supabase, candidateIds.filter((id) => !blockIds.includes(id))),
    loadHypothesisEdges(supabase, blockIds),
    loadIntentObservationCodes(supabase, turn.intentCode, crop),
  ]);
  // rule_conflict_matrix keys on decision_rules.id (UUID) — build the lookup
  // from the block rows (select *) and the candidate rows just loaded.
  const uuidToRuleId = new Map<string, string>();
  const blockUuids: string[] = [];
  for (const b of eligible) {
    const u = String((b as any)?.id ?? '');
    if (u) { uuidToRuleId.set(u, String(b?.rule_id ?? u)); blockUuids.push(u); }
  }
  for (const [rid, row] of candRows) {
    const u = String((row as any)?.id ?? '');
    if (u) uuidToRuleId.set(u, rid);
  }
  const conflictMatrix = await loadConflictMatrix(supabase, uuidToRuleId, blockUuids);

  const turnHyps = upperSet(turn.hypothesisIds);
  const turnObs = new Set(strArr(turn.observationCodes).map((o) => o.toLowerCase()));
  const candidateConditionCodes = new Set<string>();
  for (const id of candidateIds) {
    const row = candRows.get(id);
    const cc = norm(row?.condition_code ?? list.find((c) => String(c?.rule_id) === id)?.condition_code);
    if (cc) candidateConditionCodes.add(cc);
  }

  const evaluations: ContextBlockEvaluation[] = [];
  const hardBlocks: any[] = [];
  const overlays: any[] = [];
  const advisories: any[] = [];
  const dropped: any[] = [];
  const suppressedIds = new Map<string, { by: string; source: ConflictSource }>();

  for (const b of eligible) {
    const bid = String(b?.rule_id ?? '');
    const bCond = norm(b?.condition_code);
    const bObs = blockPredicateObservations(b);
    const semanticKeys = new Set<string>([bCond, ...bObs].filter(Boolean));

    // G2 — semantic relevance (any one proof suffices; all are DB-derived)
    const hypothesis_match = [...(hypEdges.get(bid) ?? [])].some((h) => turnHyps.has(h));
    const intent_match = [...semanticKeys].some((k) => intentObs.has(k));
    const observation_match = [...semanticKeys].some((k) => turnObs.has(k));
    const candidate_condition_match = Boolean(bCond) && candidateConditionCodes.has(bCond);
    const relevant = hypothesis_match || intent_match || observation_match || candidate_condition_match;
    if (!intent_match) anomalies.context_block_without_intent_match++;

    const safety_authority = b?.is_safety_block === true;
    const bBlocks = upperSet(b?.blocks_rule_ids);
    const hasAuthoredEdges = bBlocks.size > 0 || (conflictMatrix.get(bid)?.size ?? 0) > 0;

    const ev: ContextBlockEvaluation = {
      rule_id: bid, context_match: true, intent_match, hypothesis_match, observation_match,
      candidate_condition_match, relevant, safety_authority, suppressed_rule_ids: [],
      would_have_suppressed: [], conflict_sources: [], has_authored_edges: hasAuthoredEdges,
    };

    if (!relevant) {
      anomalies.context_block_not_relevant_dropped++;
      dropped.push(b);
      evaluations.push(ev);
      continue;
    }

    // G3 — explicit conflict resolution against each candidate
    for (const c of list) {
      const cid = String(c?.rule_id ?? '');
      if (!cid || cid === bid || suppressedIds.has(cid)) continue;
      const row = candRows.get(cid) ?? c;
      let source: ConflictSource | null = null;
      if (bBlocks.has(cid.toUpperCase())) source = 'blocks_rule_ids';
      else if (upperSet(row?.contraindications).has(bid.toUpperCase())) source = 'contraindications';
      else if (upperSet(row?.mutually_exclusive_with).has(bid.toUpperCase())) source = 'mutually_exclusive_with';
      else if (conflictMatrix.get(bid)?.has(cid)) source = 'rule_conflict_matrix';
      else if (!hasAuthoredEdges && bCond && norm(row?.condition_code) === bCond && candidateCarriesDose(row)) {
        // FIX 7: SHADOW MODE ONLY. A shared condition_code is an inferred
        // relationship, not a graph edge — it never suppresses in production.
        // It is logged as telemetry so DB curation authors the missing edge.
        ev.would_have_suppressed.push(cid);
        anomalies.candidate_suppressed_by_condition_code_fallback++;
        console.warn(
          `[CONTEXT_BLOCK_SHADOW] trace=${trace} block=${bid} candidate=${cid} ` +
          `would_have_suppressed=true reason=missing_graph_edge condition=${bCond}`,
        );
      }
      if (source) {
        suppressedIds.set(cid, { by: bid, source });
        ev.suppressed_rule_ids.push(cid);
        if (!ev.conflict_sources.includes(source)) ev.conflict_sources.push(source);
      }
    }
    if (!hasAuthoredEdges) anomalies.context_block_without_conflict_edge++;

    // G4 — authority. A hard block may LEAD only when it established an
    // explicit conflict with a candidate (it invalidated the requested
    // decision) — relevance alone never demotes an unrelated answer. Hard
    // blocks without an established conflict become SAFETY OVERLAYS; the
    // no-candidate case is resolved after the kept list is known.
    // 2026-09-03 (deno test T5, live rows): a block that ESTABLISHED an explicit
    // graph conflict (blocks_rule_ids / contraindications / mutually_exclusive /
    // rule_conflict_matrix) has invalidated the candidate whether or not the
    // row is flagged is_safety_block — the authored edge is the authority.
    // Leaving it as an advisory let the SUPPRESSED candidate stay primary
    // (RICE_NUTR_LATE_N_BLOCK_001 vs RICE_NUTR_LCC_001 at booting DAS 78).
    if (ev.suppressed_rule_ids.length > 0) {
      hardBlocks.push(b);
      anomalies.context_block_promoted_to_primary++;
      if (!safety_authority) anomalies.context_block_lead_without_safety_flag++;
    } else if (safety_authority) {
      overlays.push(b);
    } else {
      advisories.push(b);
      anomalies.context_block_advisory_only++;
    }
    evaluations.push(ev);
  }

  const kept: any[] = [];
  const suppressed: any[] = [];
  for (const c of list) {
    const cid = String(c?.rule_id ?? '');
    if (suppressedIds.has(cid)) suppressed.push(c); else kept.push(c);
  }

  // No surviving candidate → a relevant hard safety block IS the answer.
  if (kept.length === 0 && overlays.length > 0) {
    hardBlocks.push(...overlays.splice(0, overlays.length));
  }

  const notAlreadyCandidate = (b: any) =>
    !list.some((c: any) => String(c?.rule_id ?? '') === String(b?.rule_id ?? ''));
  const hardBlockResponses = hardBlocks.filter(notAlreadyCandidate).map((b) => ({
    ...toMatchedResponse(b), lane: 'CONTEXT_HARD_BLOCK', is_safety_block: b?.is_safety_block === true,
  }));
  const overlayResponses = overlays.filter(notAlreadyCandidate).map((b) => ({
    ...toMatchedResponse(b), lane: 'CONTEXT_SAFETY_OVERLAY', is_safety_block: true, advisory: true,
  }));
  const advisoryResponses = advisories.filter(notAlreadyCandidate).map((b) => ({
    ...toMatchedResponse(b), lane: 'CONTEXT_ADVISORY', is_safety_block: false, advisory: true,
  }));

  console.log(
    `[CONTEXT_BLOCK_GATE] trace=${trace} intent=${turn.intentCode ?? 'null'} ` +
    `eligible=${blockIds.join(',') || 'none'} ` +
    `hard=${hardBlocks.map((b) => b.rule_id).join(',') || 'none'} ` +
    `overlay=${overlays.map((b) => b.rule_id).join(',') || 'none'} ` +
    `advisory=${advisories.map((b) => b.rule_id).join(',') || 'none'} ` +
    `dropped=${dropped.map((b) => b.rule_id).join(',') || 'none'} ` +
    `suppressed=${[...suppressedIds].map(([id, m]) => `${id}<${m.source}:${m.by}`).join(',') || 'none'} ` +
    `candidates=${list.length} kept=${kept.length}`,
  );
  for (const ev of evaluations) {
    console.log(`[CONTEXT_BLOCK_EVAL] trace=${trace} ${JSON.stringify(ev)}`);
  }

  // 2026-09-03 — safety authority is the DB flag, never the conflict outcome.
  const isSafety = (b: any) => b?.is_safety_block === true;
  const safetyBlocks = [...hardBlocks.filter(isSafety), ...overlays.filter(isSafety)];
  const conflictBlocks = hardBlocks.filter((b) => !isSafety(b));

  return {
    kept, suppressed, hardBlocks, overlays, advisories, dropped,
    hardBlockResponses, overlayResponses, advisoryResponses,
    evaluations, anomalies,
    safetyBlocks, conflictBlocks,
    blockResponses: hardBlockResponses,
    blocks: [...hardBlocks, ...overlays, ...advisories],
  };
}

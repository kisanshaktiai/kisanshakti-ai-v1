// REPO: kisanshaktiai/kisanshakti-ai-v1 (farmer app)  BRANCH: decision-brain-update  (NEW FILE)
// PATH: supabase/functions/ai-agriculture-chat/agents/concept-retriever.ts
//
// CHANGE LOG
// 2026-10-11 — Decision Brain target flow, STEP 1 in SHADOW mode.
//   "pgvector and trigram search return the candidate codes from the database."
//   For each chat turn (only while feature flag `brain_concept_shadow` is on for the farmer):
//     1. the farmer's text is embedded with the model on registry route `brain.embed`
//        (embedForTask in _shared/embeddingProvider.ts — no model name in code);
//     2. RPC brain_concept_search() returns the closest observation and intent codes
//        (meaning + spelling, merged with Reciprocal Rank Fusion), from the concept index
//        built out of observation_aliases / observation_translations / intent_translations;
//     3. one row goes to brain_concept_shadow_log with those candidates NEXT TO the intent and
//        observations the brain actually used on that turn.
//   SHADOW CONTRACT: nothing here is read by the answer path. The work starts as a detached
//   promise and the log write is handed to EdgeRuntime.waitUntil, so the farmer's answer is
//   neither changed nor delayed. Every failure is swallowed into a status row ('error' /
//   'skipped'); nothing throws into the orchestrator.
//   LANGUAGE/CROP AGNOSTIC: no farmer word, crop or stage appears in this file. The script
//   class is computed from Unicode script properties only.

import { isFlagEnabled } from '../../_shared/featureFlags.ts';
import { embedForTask } from '../../_shared/embeddingProvider.ts';
import {
  classifyScript,
  conceptQueryText,
  searchConceptIndex,
  type ConceptCandidate,
  type ScriptClass,
} from '../../_shared/conceptIndex.ts';

export { classifyScript };
export type { ConceptCandidate, ScriptClass };

export const CONCEPT_RETRIEVER_VERSION = '1.0.0';
export const CONCEPT_SHADOW_FLAG = 'brain_concept_shadow';
export const CONCEPT_EMBED_TASK = 'brain.embed';

/** Candidates kept per turn in the shadow log. */
const SHADOW_LIMIT = 20;
/** Whole budget for embedding + search; the turn never waits on it. */
const SHADOW_TIMEOUT_MS = 8000;
/** Farmer text longer than this is cut before embedding (a question, not a document). */
const MAX_QUERY_CHARS = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConceptShadowOutcome {
  status: 'ok' | 'skipped' | 'error';
  detail: string | null;
  scriptClass: ScriptClass;
  modelKey: string | null;
  embedMs: number | null;
  searchMs: number | null;
  candidates: ConceptCandidate[];
}

export interface ConceptShadowStart {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  text: string;
  farmerId?: string | null;
  tenantId?: string | null;
  sessionId?: string | null;
  traceId?: string | null;
  language?: string | null;
}

export interface ConceptShadowHandle {
  args: ConceptShadowStart;
  outcome: Promise<ConceptShadowOutcome>;
}

/** Runs embedding + hybrid search for one text. Never throws. */
export async function retrieveConcepts(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  text: string,
  opts: { farmerId?: string | null; functionName?: string; limit?: number; timeoutMs?: number; kinds?: Array<'observation' | 'intent'> | null } = {},
): Promise<ConceptShadowOutcome> {
  const query = conceptQueryText(text, MAX_QUERY_CHARS);
  const scriptClass = classifyScript(query);
  if (!query || scriptClass === 'none') {
    return { status: 'skipped', detail: 'empty_text', scriptClass, modelKey: null, embedMs: null, searchMs: null, candidates: [] };
  }
  try {
    const emb = await embedForTask(supabase, CONCEPT_EMBED_TASK, [query], 'query', {
      functionName: opts.functionName ?? 'ai-agriculture-chat',
      farmerId: opts.farmerId ?? null,
      timeoutMs: opts.timeoutMs ?? SHADOW_TIMEOUT_MS,
      metadata: { component: 'concept-retriever', version: CONCEPT_RETRIEVER_VERSION },
    });
    if (!emb.ok) {
      return { status: 'error', detail: `embed:${emb.reason}`, scriptClass, modelKey: emb.modelKey, embedMs: emb.latencyMs, searchMs: null, candidates: [] };
    }
    const found = await searchConceptIndex(supabase, query, emb.vectors[0], emb.modelKey, {
      limit: opts.limit ?? SHADOW_LIMIT,
      kinds: opts.kinds ?? null,
    });
    if (!found.ok) {
      return { status: 'error', detail: `search:${found.error}`, scriptClass, modelKey: emb.modelKey, embedMs: emb.latencyMs, searchMs: found.ms, candidates: [] };
    }
    return { status: 'ok', detail: null, scriptClass, modelKey: emb.modelKey, embedMs: emb.latencyMs, searchMs: found.ms, candidates: found.candidates };
  } catch (e) {
    return { status: 'error', detail: `exception:${e instanceof Error ? e.message : String(e)}`.slice(0, 300), scriptClass, modelKey: null, embedMs: null, searchMs: null, candidates: [] };
  }
}

/**
 * Starts the shadow retrieval for one turn. Returns null when the flag is off for this
 * farmer (no embedding call is made then). The returned handle's promise never rejects.
 * Call it WITHOUT awaiting the outcome; finish with finishConceptShadow().
 */
export function startConceptShadow(args: ConceptShadowStart): ConceptShadowHandle | null {
  try {
    if (!args?.supabase || typeof args.text !== 'string' || !args.text.trim()) return null;
    const outcome: Promise<ConceptShadowOutcome> = (async () => {
      const flag = await isFlagEnabled(args.supabase, CONCEPT_SHADOW_FLAG, {
        tenantId: args.tenantId ?? null,
        farmerId: args.farmerId ?? null,
      });
      if (!flag.enabled) {
        return { status: 'skipped', detail: `flag_${flag.reason}`, scriptClass: classifyScript(args.text), modelKey: null, embedMs: null, searchMs: null, candidates: [] } as ConceptShadowOutcome;
      }
      return await retrieveConcepts(args.supabase, args.text, { farmerId: args.farmerId ?? null });
    })().catch((e) => ({
      status: 'error', detail: `exception:${e instanceof Error ? e.message : String(e)}`.slice(0, 300),
      scriptClass: classifyScript(args.text), modelKey: null, embedMs: null, searchMs: null, candidates: [],
    } as ConceptShadowOutcome));
    return { args, outcome };
  } catch {
    return null;
  }
}

/** What the brain actually used on this turn — logged next to the candidates. */
export interface BrainTurnDecision {
  intentCode?: string | null;
  observationCodes?: readonly string[] | null;
  responseType?: string | null;
}

/** Builds the brain_concept_shadow_log row (exported for tests). */
export function buildShadowLogRow(args: ConceptShadowStart, outcome: ConceptShadowOutcome, decision: BrainTurnDecision) {
  const uuidOrNull = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v : null);
  const obs = Array.isArray(decision?.observationCodes)
    ? [...new Set(decision.observationCodes.map((c) => String(c)).filter(Boolean))].slice(0, 50)
    : null;
  return {
    run_kind: 'chat',
    trace_id: args.traceId ?? null,
    session_id: args.sessionId ?? null,
    farmer_id: uuidOrNull(args.farmerId),
    tenant_id: uuidOrNull(args.tenantId),
    language: args.language ?? null,
    query_text: String(args.text ?? '').slice(0, MAX_QUERY_CHARS),
    script_class: outcome.scriptClass,
    status: outcome.status,
    status_detail: outcome.detail,
    embedding_model: outcome.modelKey,
    embed_ms: outcome.embedMs,
    search_ms: outcome.searchMs,
    candidates: outcome.candidates,
    brain_intent: decision?.intentCode ?? null,
    brain_observations: obs,
    response_type: decision?.responseType ?? null,
  };
}

/**
 * Waits (off the request path) for the shadow outcome and writes one log row. Rows for
 * farmers outside the flag ('skipped' with flag_*) are not written. Never throws.
 */
export function finishConceptShadow(handle: ConceptShadowHandle | null, decision: BrainTurnDecision): Promise<void> {
  if (!handle) return Promise.resolve();
  const work = (async () => {
    try {
      const outcome = await handle.outcome;
      if (outcome.status === 'skipped' && String(outcome.detail ?? '').startsWith('flag_')) return;
      const row = buildShadowLogRow(handle.args, outcome, decision);
      const { error } = await handle.args.supabase.from('brain_concept_shadow_log').insert(row);
      if (error) console.warn(`[CONCEPT_SHADOW] log_insert_failed trace=${handle.args.traceId ?? '?'} err=${error.message}`);
      else {
        const top = outcome.candidates.slice(0, 3).map((c) => `${c.kind}:${c.code}`).join(',');
        console.log(`[CONCEPT_SHADOW] trace=${handle.args.traceId ?? '?'} status=${outcome.status} script=${outcome.scriptClass} embed_ms=${outcome.embedMs ?? '-'} search_ms=${outcome.searchMs ?? '-'} top=${top || '-'} brain_intent=${decision?.intentCode ?? '-'}`);
      }
    } catch (e) {
      console.warn(`[CONCEPT_SHADOW] finish_failed err=${e instanceof Error ? e.message : String(e)}`);
    }
  })();
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') {
    rt.waitUntil(work);
    return Promise.resolve();
  }
  return work;
}

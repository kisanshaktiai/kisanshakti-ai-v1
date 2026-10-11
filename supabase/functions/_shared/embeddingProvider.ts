/**
 * embeddingProvider.ts — Embedding provider abstraction (RAG Stage 2).
 *
 * ARCHITECTURE RULE (master prompt §15/§16): the provider is replaceable.
 * Nothing outside this file may call an embedding API directly. Retrieval,
 * ingestion and general-chat depend only on the EmbeddingProvider interface.
 *
 * Current dev provider: Cohere embed-multilingual-v3.0 (1024 dims — matches
 * rag_chunks.embedding vector(1024)). Trial key = ingestion + internal
 * testing only (non-production per Cohere terms).
 *
 * To swap providers (e.g. self-hosted BGE-M3, 1024 dims): implement the
 * interface, change getEmbeddingProvider(), re-embed corpus. No schema or
 * caller changes.
 *
 * CHANGE LOG
 * 2026-10-11 — Decision Brain target flow step 1 (concept retrieval): embedForTask().
 *   A second, REGISTRY-ROUTED way to embed, used by the Decision Brain concept index
 *   (edge function brain-concept-indexer, ai-agriculture-chat agents/concept-retriever.ts).
 *   The model comes ONLY from the AI model registry route given by the caller
 *   (ai_task_route → ai_task_route_step → ai_model_catalog); the request format comes
 *   from ai_model_catalog.api_contract.embedding (api kind, dimensions, batch limit and
 *   the query/document instruction templates). The key comes from pickAIKey(), and every
 *   call writes one ai_model_metrics row through recordAITaskCall(). No model name is
 *   written in this file for it. Two request kinds are understood: 'gemini_batch_embed'
 *   (models/{id}:batchEmbedContents) and 'openai_embeddings' (/v1/embeddings), so the
 *   admin can swap provider and model by data alone. The RAG path above
 *   (getEmbeddingProvider / Cohere, rag_chunks vector(1024)) is NOT changed.
 */

import {
  classifyAIFailure,
  noteAIKeyResponse,
  pickAIKey,
  recordAITaskCall,
  resolveAITaskChain,
  type AICatalogModel,
  type AICallUsage,
} from './aiConfig.ts';

export interface EmbeddingProvider {
  /** Embed corpus chunks (input_type=search_document). Batches internally. */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Embed a farmer query (input_type=search_query). */
  embedQuery(text: string): Promise<number[]>;
  model(): string;
  dimensions(): number;
  /** provider/model/version string persisted to rag_documents.embedding_model */
  version(): string;
  available(): boolean;
}

const COHERE_ENDPOINT = 'https://api.cohere.com/v2/embed';
const COHERE_MODEL = 'embed-multilingual-v3.0';
const COHERE_DIMS = 1024;
const COHERE_MAX_BATCH = 96; // API hard limit per call
const TRIAL_THROTTLE_MS = 13_000; // trial keys are rate-limited (assume worst ~5 calls/min)

class CohereProvider implements EmbeddingProvider {
  private apiKey: string;
  private throttle: boolean;

  constructor() {
    // SECURITY (§41): read server-side only; never log; never echo in errors.
    this.apiKey = Deno.env.get('RAG_COHERE_API_KEY') || '';
    this.throttle = (Deno.env.get('RAG_EMBED_THROTTLE') ?? 'true') !== 'false';
  }

  available(): boolean {
    return this.apiKey.trim().length > 0;
  }
  model(): string {
    return COHERE_MODEL;
  }
  dimensions(): number {
    return COHERE_DIMS;
  }
  version(): string {
    return `cohere/${COHERE_MODEL}/v3.0/d${COHERE_DIMS}`;
  }

  private async call(texts: string[], inputType: 'search_document' | 'search_query'): Promise<number[][]> {
    const res = await fetch(COHERE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: COHERE_MODEL,
        texts,
        input_type: inputType,
        embedding_types: ['float'],
      }),
    });
    if (!res.ok) {
      const status = res.status;
      // Do not include response body wholesale — avoid any chance of key echo in logs.
      throw new Error(`EMBED_HTTP_${status}`);
    }
    const json = await res.json();
    const vectors: number[][] = json?.embeddings?.float || [];
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new Error('EMBED_BAD_RESPONSE');
    }
    return vectors;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!this.available()) throw new Error('EMBED_PROVIDER_UNCONFIGURED');
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += COHERE_MAX_BATCH) {
      const batch = texts.slice(i, i + COHERE_MAX_BATCH);
      out.push(...(await this.call(batch, 'search_document')));
      const more = i + COHERE_MAX_BATCH < texts.length;
      if (more && this.throttle) {
        await new Promise((r) => setTimeout(r, TRIAL_THROTTLE_MS));
      }
    }
    return out;
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!this.available()) throw new Error('EMBED_PROVIDER_UNCONFIGURED');
    const [v] = await this.call([text], 'search_query');
    return v;
  }
}

/** Factory — the single switch point for provider replacement. */
export function getEmbeddingProvider(): EmbeddingProvider {
  return new CohereProvider();
}

// ═══════════════════════════════════════════════════════════════════════════
// 2026-10-11 — REGISTRY-ROUTED EMBEDDINGS (Decision Brain concept retrieval)
// ═══════════════════════════════════════════════════════════════════════════

/** Service-role Supabase client — the same shape the AI registry reads with. */
// deno-lint-ignore no-explicit-any
type EmbedDb = { from(table: string): any; rpc?(fn: string, args?: Record<string, unknown>): any };

/** What the text is used for: the farmer's question, or a phrase stored in an index. */
export type EmbedPurpose = 'query' | 'document';

/** ai_model_catalog.api_contract.embedding — the request format of one embedding model. */
export interface EmbeddingContract {
  api: 'gemini_batch_embed' | 'openai_embeddings';
  dimensions: number;
  batch_limit: number;
  /** '{text}' is replaced by the text; absent ⇒ the text is sent as it is */
  query_template?: string;
  document_template?: string;
}

export type TaskEmbedResult =
  | { ok: true; vectors: number[][]; modelKey: string; dimensions: number; latencyMs: number; inputTokens: number }
  | { ok: false; reason: string; modelKey: string | null; httpStatus: number | null; latencyMs: number };

const EMBED_API_KINDS = new Set(['gemini_batch_embed', 'openai_embeddings']);

/** Reads and validates the embedding contract of a catalog model; null when the model is not an embedding model. */
export function readEmbeddingContract(model: Pick<AICatalogModel, 'api_contract'> | null | undefined): EmbeddingContract | null {
  // deno-lint-ignore no-explicit-any
  const e = (model?.api_contract as any)?.embedding;
  if (!e || typeof e !== 'object') return null;
  const dims = Number(e.dimensions);
  const batch = Number(e.batch_limit);
  if (!EMBED_API_KINDS.has(String(e.api)) || !Number.isInteger(dims) || dims <= 0) return null;
  return {
    api: e.api,
    dimensions: dims,
    batch_limit: Number.isInteger(batch) && batch > 0 ? batch : 1,
    query_template: typeof e.query_template === 'string' ? e.query_template : undefined,
    document_template: typeof e.document_template === 'string' ? e.document_template : undefined,
  };
}

/** Applies the model's instruction template for the purpose ('{text}' placeholder). */
export function applyEmbedTemplate(contract: EmbeddingContract, purpose: EmbedPurpose, text: string): string {
  const tpl = purpose === 'query' ? contract.query_template : contract.document_template;
  return tpl && tpl.includes('{text}') ? tpl.split('{text}').join(text) : text;
}

/** Unit length, so cosine distance is the same whatever the provider returns. */
export function l2Normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  return n > 0 ? v.map((x) => x / n) : v;
}

interface ProviderReply { ok: boolean; status: number; vectors: number[][]; inputTokens: number; bodyText: string; retryAfter: string | null }

async function callEmbeddingApi(
  model: AICatalogModel,
  contract: EmbeddingContract,
  apiKey: string,
  inputs: string[],
  signal: AbortSignal,
): Promise<ProviderReply> {
  let res: Response;
  if (contract.api === 'gemini_batch_embed') {
    const id = encodeURIComponent(model.api_model_id);
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${id}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        requests: inputs.map((text) => ({
          model: `models/${model.api_model_id}`,
          content: { parts: [{ text }] },
          outputDimensionality: contract.dimensions,
        })),
      }),
      signal,
    });
  } else {
    res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model.api_model_id, input: inputs, dimensions: contract.dimensions }),
      signal,
    });
  }
  const bodyText = await res.text();
  if (!res.ok) return { ok: false, status: res.status, vectors: [], inputTokens: 0, bodyText, retryAfter: res.headers.get('retry-after') };
  // deno-lint-ignore no-explicit-any
  let json: any = null;
  try { json = JSON.parse(bodyText); } catch { /* handled below */ }
  let vectors: number[][] = [];
  let inputTokens = 0;
  if (contract.api === 'gemini_batch_embed') {
    // deno-lint-ignore no-explicit-any
    vectors = Array.isArray(json?.embeddings) ? json.embeddings.map((e: any) => e?.values) : [];
    const u = json?.usageMetadata ?? {};
    inputTokens = Number(u.promptTokenCount ?? u.totalTokenCount ?? 0) || 0;
  } else {
    // deno-lint-ignore no-explicit-any
    const data = Array.isArray(json?.data) ? [...json.data].sort((a: any, b: any) => (a?.index ?? 0) - (b?.index ?? 0)) : [];
    // deno-lint-ignore no-explicit-any
    vectors = data.map((d: any) => d?.embedding);
    inputTokens = Number(json?.usage?.prompt_tokens ?? 0) || 0;
  }
  return { ok: true, status: res.status, vectors, inputTokens, bodyText: '', retryAfter: null };
}

/**
 * Embeds `texts` with the model on registry route `task`. Tries the route's steps in order; a step
 * whose catalog row has no valid api_contract.embedding is skipped (a chat model cannot embed).
 * All vectors of one result come from ONE model (modelKey) — vectors of two models are never mixed.
 * Never throws: failures come back as { ok: false, reason }.
 */
export async function embedForTask(
  db: EmbedDb,
  task: string,
  texts: string[],
  purpose: EmbedPurpose,
  opts: { functionName: string; farmerId?: string | null; timeoutMs?: number; metadata?: Record<string, unknown> },
): Promise<TaskEmbedResult> {
  const t0 = Date.now();
  if (!Array.isArray(texts) || texts.length === 0) return { ok: false, reason: 'no_input', modelKey: null, httpStatus: null, latencyMs: 0 };
  let chainRes;
  try {
    chainRes = await resolveAITaskChain(db, task);
  } catch (e) {
    return { ok: false, reason: `registry_error:${e instanceof Error ? e.message : String(e)}`, modelKey: null, httpStatus: null, latencyMs: Date.now() - t0 };
  }
  if (!chainRes.ok) return { ok: false, reason: chainRes.errorClass, modelKey: null, httpStatus: null, latencyMs: Date.now() - t0 };
  if (chainRes.emergency) return { ok: false, reason: 'registry_unavailable', modelKey: null, httpStatus: null, latencyMs: Date.now() - t0 };

  let last: TaskEmbedResult = { ok: false, reason: 'no_embedding_model_on_route', modelKey: null, httpStatus: null, latencyMs: 0 };
  const deadline = t0 + Math.max(1000, opts.timeoutMs ?? 30_000);
  for (const model of chainRes.chain) {
    const contract = readEmbeddingContract(model);
    if (!contract) continue;
    const key = await pickAIKey(db, model);
    if (!key.apiKey || key.slot === null) {
      last = { ok: false, reason: `key_${'reason' in key ? key.reason : 'missing'}`, modelKey: model.model_key, httpStatus: null, latencyMs: Date.now() - t0 };
      continue;
    }
    const all: number[][] = [];
    let tokens = 0;
    let failed: TaskEmbedResult | null = null;
    for (let i = 0; i < texts.length; i += contract.batch_limit) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { failed = { ok: false, reason: 'timeout', modelKey: model.model_key, httpStatus: null, latencyMs: Date.now() - t0 }; break; }
      const batch = texts.slice(i, i + contract.batch_limit).map((t) => applyEmbedTemplate(contract, purpose, String(t ?? '')));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), remaining);
      const c0 = Date.now();
      let reply: ProviderReply;
      try {
        reply = await callEmbeddingApi(model, contract, key.apiKey, batch, ctrl.signal);
      } catch (e) {
        reply = { ok: false, status: 0, vectors: [], inputTokens: 0, bodyText: e instanceof Error ? e.message : String(e), retryAfter: null };
      } finally {
        clearTimeout(timer);
      }
      const usage: AICallUsage = { input_tokens: reply.inputTokens, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0 };
      const badShape = reply.ok && (reply.vectors.length !== batch.length ||
        reply.vectors.some((v) => !Array.isArray(v) || v.length !== contract.dimensions));
      const okCall = reply.ok && !badShape;
      await recordAITaskCall(db, {
        task, functionName: opts.functionName, model, modelRequested: chainRes.chain[0], ok: okCall,
        errorClass: okCall ? undefined : (reply.ok ? 'empty_output' : (reply.status ? classifyAIFailure(reply.status, reply.bodyText) : (ctrl.signal.aborted ? 'timeout' : 'network'))), httpStatus: reply.status || null,
        latencyMs: Date.now() - c0, usage, farmerId: opts.farmerId ?? null,
        metadata: { ...(opts.metadata ?? {}), purpose, batch_size: batch.length, ...(badShape ? { error: 'dimension_or_count_mismatch' } : {}) },
        key: { slot: key.slot, pool: key.pool, group: key.group },
      });
      if (!reply.ok) {
        if (reply.status) noteAIKeyResponse(model.provider, key.slot, reply.status, reply.bodyText, reply.retryAfter);
        failed = { ok: false, reason: reply.status ? `http_${reply.status}` : 'network_or_timeout', modelKey: model.model_key, httpStatus: reply.status || null, latencyMs: Date.now() - t0 };
        break;
      }
      if (badShape) {
        failed = { ok: false, reason: 'dimension_or_count_mismatch', modelKey: model.model_key, httpStatus: reply.status, latencyMs: Date.now() - t0 };
        break;
      }
      for (const v of reply.vectors) all.push(l2Normalize(v.map(Number)));
      tokens += reply.inputTokens;
    }
    if (!failed) {
      return { ok: true, vectors: all, modelKey: model.model_key, dimensions: contract.dimensions, latencyMs: Date.now() - t0, inputTokens: tokens };
    }
    last = failed;
    if (failed.reason === 'timeout') break;
  }
  return last;
}

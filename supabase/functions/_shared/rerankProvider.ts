// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: supabase/functions/_shared/rerankProvider.ts
//
// CHANGE LOG
// 2026-09-21 — RAG PHASE 0 (design v2 §4.3): cross-encoder reranker behind the
//   same replaceable-provider shape as embeddingProvider.ts. Retrieval depends
//   only on the RerankProvider interface; nothing outside this file calls a
//   rerank API. The current provider is Cohere Rerank v3.5 (multilingual), read
//   through the same server-side key the embedding provider already uses, so no
//   new secret is introduced. To swap (for example a self-hosted
//   bge-reranker-v2-m3): implement the interface, change getRerankProvider().

export interface RerankHit {
  /** index into the `documents` array passed to rerank() */
  index: number;
  /** relevance in [0, 1]; higher is more relevant to the query */
  score: number;
}

export interface RerankProvider {
  /**
   * Score `documents` against `query` and return the `topN` most relevant,
   * best first. The caller decides what to do with the order and the scores;
   * this never throws for an empty document list.
   */
  rerank(query: string, documents: string[], topN: number): Promise<RerankHit[]>;
  /** provider/model string recorded in rag_retrieval_logs.candidates */
  version(): string;
  available(): boolean;
}

const COHERE_ENDPOINT = 'https://api.cohere.com/v2/rerank';
const COHERE_MODEL = 'rerank-v3.5';
const COHERE_MAX_DOCS = 1000; // API hard limit per call
const TIMEOUT_MS = 6000;

class CohereRerankProvider implements RerankProvider {
  private apiKey: string;

  constructor() {
    // SECURITY (§41): read server-side only; never log; never echo in errors.
    this.apiKey = Deno.env.get('RAG_COHERE_API_KEY') || '';
  }

  available(): boolean {
    return this.apiKey.trim().length > 0;
  }
  version(): string {
    return `cohere/${COHERE_MODEL}`;
  }

  async rerank(query: string, documents: string[], topN: number): Promise<RerankHit[]> {
    if (!this.available()) throw new Error('RERANK_PROVIDER_UNCONFIGURED');
    if (!documents.length) return [];
    const docs = documents.slice(0, COHERE_MAX_DOCS);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(COHERE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: COHERE_MODEL,
          query,
          documents: docs,
          top_n: Math.max(1, Math.min(topN, docs.length)),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Do not include response body wholesale — avoid any chance of key echo in logs.
        throw new Error(`RERANK_HTTP_${res.status}`);
      }
      const json = await res.json();
      const results = json?.results;
      if (!Array.isArray(results)) throw new Error('RERANK_BAD_RESPONSE');
      const hits: RerankHit[] = [];
      for (const r of results) {
        const index = Number(r?.index);
        const score = Number(r?.relevance_score);
        if (Number.isInteger(index) && index >= 0 && index < docs.length && Number.isFinite(score)) {
          hits.push({ index, score });
        }
      }
      if (!hits.length) throw new Error('RERANK_BAD_RESPONSE');
      return hits.sort((a, b) => b.score - a.score);
    } finally {
      clearTimeout(t);
    }
  }
}

/** Factory — the single switch point for provider replacement. */
export function getRerankProvider(): RerankProvider {
  return new CohereRerankProvider();
}

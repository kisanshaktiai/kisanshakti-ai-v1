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
 */

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

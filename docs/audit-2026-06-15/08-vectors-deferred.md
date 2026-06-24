# Phase 8 — Vectors & Embeddings

**Status: DEFERRED.** No `pgvector` extension or vector column present in the live schema as of 2026-06-15. The Symbolic Decision Brain is fully deterministic (rules + hypotheses + intent maps), so retrieval-augmented generation is not yet needed.

## Recommended schema when RAG is introduced

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.ai_knowledge_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NULL,            -- NULL = global; else tenant-scoped
  source_type text NOT NULL,        -- 'rule' | 'hypothesis' | 'observation' | 'doc'
  source_id   text NOT NULL,
  language_code text NOT NULL DEFAULT 'en',
  crop_code   text,
  content     text NOT NULL,
  embedding   vector(3072) NOT NULL,         -- google/gemini-embedding-001 default
  metadata    jsonb NOT NULL DEFAULT '{}',
  version_hash text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_knowledge_chunks_embedding_idx
  ON public.ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ai_knowledge_chunks_tenant_idx
  ON public.ai_knowledge_chunks (tenant_id, source_type, crop_code);

GRANT SELECT ON public.ai_knowledge_chunks TO authenticated;
GRANT ALL ON public.ai_knowledge_chunks TO service_role;
ALTER TABLE public.ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_kc_read ON public.ai_knowledge_chunks FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

**Metadata contract (all keys lowercase_snake_case):**
```json
{
  "tenant_id": "uuid|null",
  "crop_code": "rice",
  "observation_code": "obs_rice_no_emergence",
  "language_code": "mr",
  "source": "rule|hypothesis|observation|doc",
  "created_at": "iso8601"
}
```

**Use `google/gemini-embedding-001`** (default per platform guidance). Embed via the Lovable AI Gateway from edge functions only — never from the client. Re-embed when switching models.

No action required this engagement.

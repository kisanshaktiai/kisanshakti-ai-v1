-- RAG hybrid retrieval RPCs (ALREADY APPLIED to live DB on 2026-08-08 via
-- Claude/Supabase MCP as migration 'rag_search_functions'. This file keeps the
-- repo in sync — running it again is safe: CREATE OR REPLACE.)
-- Fulltext leg: pgroonga (multilingual). Vector leg: pgvector cosine.

CREATE OR REPLACE FUNCTION public.rag_search_fulltext(
  p_query text,
  p_limit int DEFAULT 20,
  p_states text[] DEFAULT NULL,
  p_crops text[] DEFAULT NULL,
  p_doc_types text[] DEFAULT NULL,
  p_tenant uuid DEFAULT NULL
) RETURNS TABLE (
  chunk_id uuid, document_id uuid, chunk_text text, section_path text,
  page_number int, language varchar, score double precision,
  title text, publisher text, authority_tier text, doc_type text, doc_version text
) LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT c.id, c.document_id, c.chunk_text, c.section_path,
         c.page_number, c.language,
         pgroonga_score(c.tableoid, c.ctid)::double precision AS score,
         d.title, r.publisher, r.authority_tier, d.doc_type, d.doc_version
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  JOIN rag_source_registry r ON r.id = d.source_id
  WHERE c.is_active AND d.is_active AND r.is_active
    AND c.chunk_text &@ p_query
    AND (d.tenant_id IS NULL OR d.tenant_id = p_tenant)
    AND (p_states IS NULL OR d.state_codes IS NULL OR d.state_codes && p_states)
    AND (p_doc_types IS NULL OR d.doc_type = ANY(p_doc_types))
    AND (p_crops IS NULL OR c.crop_codes && p_crops OR d.crop_codes && p_crops
         OR (c.crop_codes IS NULL AND d.crop_codes IS NULL))
  ORDER BY score DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.rag_search_vector(
  p_embedding extensions.vector(1024),
  p_limit int DEFAULT 20,
  p_states text[] DEFAULT NULL,
  p_crops text[] DEFAULT NULL,
  p_doc_types text[] DEFAULT NULL,
  p_tenant uuid DEFAULT NULL
) RETURNS TABLE (
  chunk_id uuid, document_id uuid, chunk_text text, section_path text,
  page_number int, language varchar, score double precision,
  title text, publisher text, authority_tier text, doc_type text, doc_version text
) LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT c.id, c.document_id, c.chunk_text, c.section_path,
         c.page_number, c.language,
         (1 - (c.embedding OPERATOR(extensions.<=>) p_embedding))::double precision AS score,
         d.title, r.publisher, r.authority_tier, d.doc_type, d.doc_version
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  JOIN rag_source_registry r ON r.id = d.source_id
  WHERE c.is_active AND d.is_active AND r.is_active
    AND c.embedding IS NOT NULL
    AND (d.tenant_id IS NULL OR d.tenant_id = p_tenant)
    AND (p_states IS NULL OR d.state_codes IS NULL OR d.state_codes && p_states)
    AND (p_doc_types IS NULL OR d.doc_type = ANY(p_doc_types))
    AND (p_crops IS NULL OR c.crop_codes && p_crops OR d.crop_codes && p_crops
         OR (c.crop_codes IS NULL AND d.crop_codes IS NULL))
  ORDER BY c.embedding OPERATOR(extensions.<=>) p_embedding
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.rag_search_fulltext(text,int,text[],text[],text[],uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rag_search_vector(extensions.vector,int,text[],text[],text[],uuid) FROM anon;

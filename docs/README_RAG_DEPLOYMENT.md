# RAG Stage 1–3 — Deployment Package

Code aligned with the LIVE database state (verified 2026-08-08): tables
`rag_source_registry` / `rag_documents` / `rag_chunks` / partitioned
`rag_retrieval_logs`, extensions `vector` + `pgroonga` enabled, bucket
`rag-documents` created, secret `RAG_COHERE_API_KEY` configured, RPCs
`rag_search_fulltext` / `rag_search_vector` ALREADY APPLIED to the live DB.

## Files in this package → repo destinations (paths match repo layout 1:1)

| File | Action |
|---|---|
| `supabase/functions/_shared/embeddingProvider.ts` | NEW |
| `supabase/functions/_shared/ragRetrieval.ts` | NEW |
| `supabase/functions/rag-ingest/index.ts` | NEW function |
| `supabase/functions/ai-general-chat/index.ts` | REPLACES existing (full file; flag OFF ⇒ identical behavior) |
| `supabase/migrations/20260808120000_rag_search_functions.sql` | NEW (repo-sync only; already applied live) |

## Manual edits required (2 lines)

Append to `supabase/config.toml`:
```toml
[functions.rag-ingest]
verify_jwt = false
```
(Matches ai-agriculture-chat convention; the function requires the service
context anyway and is ops-triggered, not farmer-facing.)

## Deploy

```bash
supabase functions deploy rag-ingest
supabase functions deploy ai-general-chat
```
No env changes needed — `RAG_COHERE_API_KEY` already set; LLM keys unchanged.

## Enable (per-tenant feature flag)

```sql
INSERT INTO feature_flags (flag_name, description, is_enabled, target_tenants)
VALUES ('rag_general_chat', 'RAG grounding for ai-general-chat', true,
        ARRAY['<TEST_TENANT_UUID>']::uuid[]);
```
Empty `target_tenants` = all tenants. Flag missing/false = pre-RAG behavior,
byte-identical. **Rollback = set is_enabled=false. Nothing else needed.**

## Stage 1 validation (do this before enabling the flag for anyone)

1. Upload a real PDF via Dashboard → Storage → `rag-documents`
   (e.g. `pmkisan/guidelines_2026.pdf`).
2. Register its source (once per publisher document series):
```sql
INSERT INTO rag_source_registry (source_code, publisher, authority_tier, doc_type, state_codes, default_language, source_url)
VALUES ('PMKISAN_GUIDELINES','Ministry of Agriculture & Farmers Welfare','central_govt','scheme',NULL,'en','https://pmkisan.gov.in');
```
3. Ingest (Stage 1 = no embedding):
```bash
curl -X POST "$SUPABASE_URL/functions/v1/rag-ingest" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{"action":"ingest","storagePath":"pmkisan/guidelines_2026.pdf",
       "sourceCode":"PMKISAN_GUIDELINES","title":"PM-KISAN Operational Guidelines",
       "docVersion":"2026","language":"en"}'
```
4. Verify chunks + retrieval:
```sql
SELECT chunk_index, page_number, section_path, left(chunk_text,80)
FROM rag_chunks ORDER BY chunk_index LIMIT 10;
SELECT title, page_number, section_path, score
FROM rag_search_fulltext('PM Kisan installment', 5);
```
5. Enable flag for the test tenant and test in General chat.
   IMPORTANT (Stage 1 = fulltext-only): ask in the SAME LANGUAGE as the
   ingested document. English PDF → ask "Who gets PM Kisan money?" → answer
   must end with a Sources block citing the real document. A Hindi question
   against an English-only corpus will correctly take the honest
   no-verified-source path in Stage 1 — cross-language matching is exactly
   what Stage 2 embeddings add (re-test the Hindi question after backfill
   to see hybrid retrieval working). Out-of-corpus question in any language
   ("तुरमेरिक भाव?") → honest answer, no citations.

## Stage 2 (embeddings — after Stage 1 validated)

```bash
curl -X POST "$SUPABASE_URL/functions/v1/rag-ingest" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{"action":"backfill_embeddings","maxChunks":288}'
```
Repeat until `remainingHint=false`. Trial-key throttling is built in
(13s between batches; disable with secret `RAG_EMBED_THROTTLE=false` on a
production key). Retrieval automatically becomes `hybrid` once embeddings
exist — check `rag_retrieval_logs.retrieval_mode`.

## Architecture guarantees preserved (master prompt)

- §2/§39/§45: `ai-agriculture-chat` untouched. RAG only in general chat.
- §15/§16: provider swappable via `embeddingProvider.ts` factory; model
  version persisted per document. 1024 dims fits Cohere v3 / BGE-M3 / e5-large.
- §22: citations appended in code from retrieval metadata; LLM forbidden
  from writing sources — page numbers cannot be fabricated.
- §23: high-risk (pesticide/dose/PHI) queries get informational boundary +
  routing note to land-specific verified chat.
- §31: embedding failure ⇒ fulltext; retrieval failure ⇒ pre-RAG behavior;
  weak retrieval ⇒ coded insufficient-evidence mode. General chat never breaks.
- §30: every retrieval logged to partitioned `rag_retrieval_logs`
  (below_threshold=true rows = weekly corpus-gap review).

## Known limitations (honest, §11/§44-R)

- Scanned PDFs: detected and marked `failed` with OCR note. OCR not implemented.
- Chunker: heading-heuristic based; complex multi-column PoP tables may chunk
  imperfectly — inspect first ingestions and report samples for tuning.
- Entity dictionaries read `crop_synonyms` / `chemical_regulatory_status`
  with tolerant column fallbacks; verify tag quality on first document.
- Ingestion of very large PDFs (300+ pages) may approach the 60s edge
  function limit — split such documents or move ingestion to a queued job later.
- Ops: monthly pg_cron partition creation for `rag_retrieval_logs_YYYYMM`
  still needs scheduling (partitions pre-created through 2027-01).

## Note for Lovable merge

All files are drop-in; only `ai-general-chat/index.ts` replaces an existing
file — replace wholesale, do not line-merge (the change log header documents
the diff). Do not modify anything under `ai-agriculture-chat/` for this merge.

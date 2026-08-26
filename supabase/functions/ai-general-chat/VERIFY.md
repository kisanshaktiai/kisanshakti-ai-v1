# ai-general-chat RAG — deploy & verify (no step may be skipped)

## 0. Pre-deploy facts (already verified 2026-08-24)
- Deployed `ai-general-chat` v79 has NO retrieval; this change adds it behind `rag_general_chat`.
- Corpus: 1 doc / 41 chunks / 0 embeddings. Full-text works (English). Vector returns nothing until
  `RAG_COHERE_API_KEY` is set and `rag-ingest {action:'backfill_embeddings'}` has run.
- `rag_general_chat` row: is_enabled=true, rollout_percentage=0 ⇒ OFF for everyone after migration.

## 1. Apply migration
```
supabase db push   # or paste supabase/migrations/20260824_rag_general_chat_p0.sql in SQL editor
```
Check:
```sql
select column_name from information_schema.columns
 where table_name='rag_retrieval_logs' and column_name in ('retrieval_purpose','document_ids','chunk_ids');  -- 3 rows
select grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('rag_chunks','decision_rules') and grantee in ('anon','authenticated') and privilege_type<>'SELECT'; -- 0 rows
select flag_name,is_enabled,rollout_percentage,target_users from public.feature_flags where flag_name='rag_general_chat';
```

## 2. Deploy
```
supabase functions deploy ai-general-chat --no-verify-jwt
```
Verify the DEPLOYED bundle (not the repo) contains the retrieval import:
```
supabase functions download ai-general-chat   # or MCP get_edge_function
grep -l "ragRetrieval" supabase/functions/_shared/ragRetrieval.ts functions/ai-general-chat/index.ts
```
Gate: `_shared/ragRetrieval.ts` and `_shared/featureFlags.ts` present in the bundle file list.

## 3. Flag OFF regression (behaviour must be identical to v79)
```
curl -s -X POST "$SUPABASE_URL/functions/v1/ai-general-chat" \
  -H "apikey: $ANON_KEY" -H "x-tenant-id: $TENANT" -H "x-farmer-id: $FARMER" -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is rice blast?"}],"language":"en"}' | jq .metadata.orchestrator_type
# expect "GENERAL_LLM_DIRECT"
```
```sql
select count(*) from rag_retrieval_logs where created_at > now() - interval '5 minutes'; -- 0
```

## 4. Flag ON for one farmer only
```sql
update public.feature_flags set target_users = array['<FARMER_UUID>']::uuid[] where flag_name='rag_general_chat';
```
Test A — evidence exists (the only ingested doc is soybean, English):
```
... -d '{"messages":[{"role":"user","content":"What seed rate and spacing for soybean sowing?"}],"language":"en"}'
```
Expect: `orchestrator_type = GENERAL_RAG_GROUNDED`, `metadata.citations[]` non-empty, answer ends with a
"Sources:" block, every number in the answer also appears in `metadata.rag.chunk_ids` chunk texts:
```sql
select trace_id, retrieval_mode, retrieval_purpose, below_threshold, top_score, chunk_ids, latency_ms
  from rag_retrieval_logs order by created_at desc limit 1;
select metadata->'rag'->>'below_threshold', metadata->'fidelity' from ai_chat_messages
 where role='assistant' order by created_at desc limit 1;   -- fidelity.unsupported = []
```
Test B — no evidence (corpus has no rice):
```
... -d '{"messages":[{"role":"user","content":"How much urea per acre for rice at tillering?"}],"language":"mr"}'
```
Expect: `GENERAL_RAG_NO_EVIDENCE`, `below_threshold=true`, answer in Marathi with **no digits**
(`select content ~ '[0-9०-९]' from ai_chat_messages ... limit 1` → false), ends with KVK advice.

Test C — Marathi query on English corpus: `"सोयाबीन पेरणी"` → expect `below_threshold=true` today
(documented limitation until a Marathi document is ingested — this is the P2 gate, not a bug here).

## 5. Rollout
target_users → target_tenants (test tenant) → rollout_percentage 5 → 25 → 100.
Do not raise rollout until Test A/B pass on ≥ 20 questions each with 0 unsupported numbers.

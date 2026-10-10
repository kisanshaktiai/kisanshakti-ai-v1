-- ════════════════════════════════════════════════════════════════════════
-- 02_retrieval_baseline_readonly.sql  (2026-10-10)
-- Repo: kisanshakti-ai-v1 (farmer app) · Supabase project qfklkkzxemsbeniyugiz
--
-- READ-ONLY. No INSERT/UPDATE/DELETE/DDL. The SET lines are session-only.
--
-- WHAT IT MEASURES
--   How often plain spelling-similarity search (pg_trgm) finds the right meaning.
--   This is the "before" number. Run the same test again after embeddings are added
--   to see the gain.
--
--   Test A: leave-one-out over observation_aliases. Take 100 aliases each in
--   mr / hi / en (fixed sample, seed42). Search all *other* alias texts. Check where
--   the alias's own canonical_code ranks.
--   Result on 2026-10-10:
--     en: top1 29/100, top10 50/100
--     hi: top1 27/100, top10 64/100
--     mr: top1 33/100, top10 68/100
--
--   Test B: real farmer questions from ai_chat_messages (see query B below).
-- ════════════════════════════════════════════════════════════════════════

-- A) leave-one-out alias retrieval
set pg_trgm.similarity_threshold = 0.1;
set statement_timeout = '110s';
with q as (
  select * from (
    select a.alias_code, a.canonical_code, a.language, a.alias_normalized,
           row_number() over (partition by language order by md5(alias_code||'seed42')) rn
    from observation_aliases a where active and language in ('mr','hi','en')
  ) s where rn <= 100
),
res as (
  select q.alias_code, q.language, q.canonical_code gold,
    (select r from (
        select cand, rank() over (order by sim desc) r from (
          select o.canonical_code cand, max(similarity(o.alias_normalized, q.alias_normalized)) sim
          from observation_aliases o
          where o.active and o.alias_normalized % q.alias_normalized
            and o.alias_normalized <> q.alias_normalized
          group by 1) c) rr where cand = q.canonical_code) gr
  from q
)
select language, count(*) n,
  count(*) filter (where gr = 1)  top1,
  count(*) filter (where gr <= 10) top10
from res group by language order by language;

-- B) real farmer questions: top 3 observation codes and top 3 intent codes per question
set statement_timeout = '110s';
with q as (
  select distinct on (lower(trim(content))) lower(trim(content)) qt
  from ai_chat_messages
  where role = 'user' and length(content) between 8 and 160
    and content not like '%[obs_keys:%'          -- typed questions only, not chip clicks
  order by lower(trim(content)), created_at desc
)
select q.qt,
 (select string_agg(cand||' '||round(sim::numeric,2), ' | ' order by sim desc) from (
    select o.canonical_code cand, max(word_similarity(o.alias_normalized, q.qt)) sim
    from observation_aliases o where o.active group by 1 order by 2 desc limit 3) c) top3_observation,
 (select string_agg(intent_code||' '||round(sim::numeric,2), ' | ' order by sim desc) from (
    select intent_code, max(greatest(word_similarity(lower(coalesce(display_text,'')),  q.qt),
                                     word_similarity(lower(coalesce(question_text,'')), q.qt))) sim
    from intent_translations group by 1 order by 2 desc limit 3) c) top3_intent
from q
order by q.qt;

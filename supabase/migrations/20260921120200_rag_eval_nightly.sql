-- ============================================================================
-- REPO: kisanshaktiai/kisanshakti-ai-v1   (farmer app / serving plane)
-- PATH: supabase/migrations/20260921120200_rag_eval_nightly.sql
--
-- RAG Phase 0 — nightly golden-set evaluation schedule.
--
-- Depends on the admin-panel migration 20260921120100_rag_golden_set.sql
-- (tables rag_golden_questions / rag_eval_runs) and on the farmer app edge
-- function `rag-eval` being deployed. Apply after both.
--
-- Follows the repo's sweep convention (20260908193339): the cron job cannot
-- hold the service-role key, so it signs with a vault secret that
-- public.get_sweep_key() hands only to service_role callers, and the function
-- accepts that key. get_sweep_key keeps an explicit allow-list of secret
-- names, so the list is extended here rather than opened.
--
-- Idempotent; every statement stands alone.
-- ============================================================================


-- 1. Extend the allow-list of sweep keys with rag_eval_key.
CREATE OR REPLACE FUNCTION public.get_sweep_key(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v text;
BEGIN
  IF p_name IS NULL OR p_name NOT IN ('schedule_narrate_key', 'schedule_reconciler_key', 'rag_eval_key') THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sweep_key(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_sweep_key(text) TO service_role;


-- 2. Create the secret once. The value is random; nothing outside the vault
--    ever needs to know it — the cron job reads it through get_sweep_key at
--    fire time and rag-eval compares it through the same function.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'rag_eval_key') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'rag_eval_key', 'Bearer key the nightly rag-eval cron presents to the rag-eval edge function');
  END IF;
END $$;


-- 3. Nightly run at 02:45 UTC (the repo's nightly window is 01:30–04:30 UTC).
--    The URL is the project's own functions endpoint, as the other http_post
--    jobs use. 300 s timeout matches the function's own budget.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rag-eval-nightly') THEN
    PERFORM cron.unschedule('rag-eval-nightly');
  END IF;
  PERFORM cron.schedule(
    'rag-eval-nightly',
    '45 2 * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/rag-eval',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public.get_sweep_key('rag_eval_key')
        ),
        body := '{"trigger":"nightly"}'::jsonb,
        timeout_milliseconds := 300000
      );
    $cron$
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20260923_chat_attachments_verified_write.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED. Production action A5 in the design.
--
-- Problem (audit P0-3, live policies read 2026-09-23):
--   chat_attachments_insert/update/delete_custom_auth accept
--   get_request_farmer_id() = first path segment. get_request_farmer_id()
--   returns the raw x-farmer-id request header, so any anon-key holder can
--   write, overwrite (chatImageStorage.ts uploads with upsert:true) or delete
--   objects in another farmer's folder.
--
-- Fix: the same three policies, with the header check replaced by
--   get_current_farmer_id(), which resolves the farmer from the hashed
--   x-session-token through verified_session_context(). The auth.uid()
--   branch is kept unchanged. ALTER POLICY only — nothing is dropped.
--
-- NOT changed here, on purpose:
--   chat_attachments_select_public and the bucket's public=true flag. Chat
--   voice and video (chatImageStorage.ts L532-L540, L616) are served by
--   public URLs; making the bucket private breaks them. Once diagnostic
--   photos move to the private crop-growth-media bucket (action A4), public
--   read of chat voice/video is a separate decision for you.
--
-- Pre-apply check (must pass first, on a test farmer):
--   the farmer app sends x-session-token on storage calls
--   (supabaseWithAuth in src/integrations/supabase/client.ts adds it when
--   globalSessionToken is set). The 38 existing objects in farmer folders
--   show storage requests do carry request.headers to Postgres, but the
--   session-token path itself has not been exercised on storage — test one
--   chat voice upload right after applying, and roll back if it fails.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY chat_attachments_insert_custom_auth ON storage.objects
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (
      (public.get_current_farmer_id())::text = split_part(name, '/', 1)
      OR (auth.uid() IS NOT NULL AND (auth.uid())::text = split_part(name, '/', 1))
    )
  );

ALTER POLICY chat_attachments_update_custom_auth ON storage.objects
  USING (
    bucket_id = 'chat-attachments'
    AND (
      (public.get_current_farmer_id())::text = split_part(name, '/', 1)
      OR (auth.uid() IS NOT NULL AND (auth.uid())::text = split_part(name, '/', 1))
    )
  );

ALTER POLICY chat_attachments_delete_custom_auth ON storage.objects
  USING (
    bucket_id = 'chat-attachments'
    AND (
      (public.get_current_farmer_id())::text = split_part(name, '/', 1)
      OR (auth.uid() IS NOT NULL AND (auth.uid())::text = split_part(name, '/', 1))
    )
  );

-- Verify (read-only): no chat-attachments write policy may still reference
-- get_request_farmer_id.
SELECT policyname, cmd,
       (coalesce(qual,'') || coalesce(with_check,'')) ~ 'get_request_farmer_id' AS still_trusts_header,
       (coalesce(qual,'') || coalesce(with_check,'')) ~ 'get_current_farmer_id' AS uses_verified_session
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname LIKE 'chat_attachments_%';

-- ROLLBACK (only if the post-apply voice upload test fails) — restores the
-- exact live definitions read on 2026-09-23:
-- ALTER POLICY chat_attachments_insert_custom_auth ON storage.objects
--   WITH CHECK ((bucket_id = 'chat-attachments'::text) AND ((get_request_farmer_id() = split_part(name, '/'::text, 1)) OR ((auth.uid() IS NOT NULL) AND ((auth.uid())::text = split_part(name, '/'::text, 1)))));
-- ALTER POLICY chat_attachments_update_custom_auth ON storage.objects
--   USING ((bucket_id = 'chat-attachments'::text) AND ((get_request_farmer_id() = split_part(name, '/'::text, 1)) OR ((auth.uid() IS NOT NULL) AND ((auth.uid())::text = split_part(name, '/'::text, 1)))));
-- ALTER POLICY chat_attachments_delete_custom_auth ON storage.objects
--   USING ((bucket_id = 'chat-attachments'::text) AND ((get_request_farmer_id() = split_part(name, '/'::text, 1)) OR ((auth.uid() IS NOT NULL) AND ((auth.uid())::text = split_part(name, '/'::text, 1)))));

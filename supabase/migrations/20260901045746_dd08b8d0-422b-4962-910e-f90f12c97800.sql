
-- =========================================================
-- P0-1: Verified session identity
-- =========================================================

CREATE OR REPLACE FUNCTION public.hash_session_token(_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN _token IS NULL OR _token = '' THEN NULL
              ELSE encode(sha256(convert_to(_token, 'UTF8')), 'hex') END
$$;

-- Resolves the caller's verified identity from the x-session-token header.
CREATE OR REPLACE FUNCTION public.verified_session_context()
RETURNS TABLE(session_id uuid, farmer_id uuid, tenant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, f.id, f.tenant_id
  FROM public.user_sessions s
  JOIN public.farmers f ON f.id = s.user_id
  WHERE s.access_token_hash = public.hash_session_token(
          current_setting('request.headers', true)::json ->> 'x-session-token')
    AND s.is_active = true
    AND s.expires_at > now()
    AND f.is_active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.verified_farmer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT farmer_id FROM public.verified_session_context() $$;

CREATE OR REPLACE FUNCTION public.verified_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT tenant_id FROM public.verified_session_context() $$;

-- Staged cutover: the verified session wins whenever a valid token is present.
-- The legacy header is only consulted when no verified session exists at all.
CREATE OR REPLACE FUNCTION public.get_current_farmer_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified uuid;
BEGIN
  SELECT farmer_id INTO v_verified FROM public.verified_session_context();
  IF v_verified IS NOT NULL THEN
    RETURN v_verified;
  END IF;
  RETURN NULLIF(current_setting('request.headers', true)::json ->> 'x-farmer-id', '')::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified uuid;
BEGIN
  SELECT tenant_id INTO v_verified FROM public.verified_session_context();
  IF v_verified IS NOT NULL THEN
    RETURN v_verified;
  END IF;
  RETURN COALESCE(
    NULLIF(current_setting('request.headers', true)::json ->> 'x-tenant-id', '')::uuid,
    NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- =========================================================
-- P0-2: farmers table - close account-takeover paths
-- =========================================================

DROP POLICY IF EXISTS "Allow pre-auth PIN setup by mobile and tenant" ON public.farmers;
DROP POLICY IF EXISTS "Allow tenant-scoped farmer registration" ON public.farmers;
DROP POLICY IF EXISTS "Auth: lookup by mobile within tenant" ON public.farmers;

-- =========================================================
-- P0-3: farmer_gamification - remove world-writable policy
-- =========================================================

DROP POLICY IF EXISTS "System can update gamification" ON public.farmer_gamification;

CREATE POLICY "Farmers manage own gamification"
ON public.farmer_gamification FOR ALL
USING (farmer_id = public.get_current_farmer_id())
WITH CHECK (farmer_id = public.get_current_farmer_id());

CREATE POLICY "Service role manages gamification"
ON public.farmer_gamification FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- =========================================================
-- P0-4: NDVI visibility for farmer sessions (tenant scoped)
-- =========================================================

DROP POLICY IF EXISTS "System can insert NDVI micro tiles" ON public.ndvi_micro_tiles;
DROP POLICY IF EXISTS "System can update NDVI micro tiles" ON public.ndvi_micro_tiles;

CREATE POLICY "Tenant sessions can view NDVI micro tiles"
ON public.ndvi_micro_tiles FOR SELECT
USING (public.has_tenant_access(tenant_id));

CREATE POLICY "Service role manages NDVI micro tiles"
ON public.ndvi_micro_tiles FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Tenant sessions can view NDVI processing logs"
ON public.ndvi_processing_logs FOR SELECT
USING (tenant_id IS NOT NULL AND public.has_tenant_access(tenant_id));

CREATE POLICY "Service role manages NDVI processing logs"
ON public.ndvi_processing_logs FOR ALL
TO service_role
USING (true) WITH CHECK (true);

GRANT SELECT ON public.ndvi_micro_tiles TO authenticated, anon;
GRANT SELECT ON public.ndvi_processing_logs TO authenticated, anon;
GRANT ALL ON public.ndvi_micro_tiles TO service_role;
GRANT ALL ON public.ndvi_processing_logs TO service_role;

-- =========================================================
-- P0-5: session store hygiene
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash
  ON public.user_sessions (access_token_hash) WHERE is_active;

GRANT ALL ON public.user_sessions TO service_role;

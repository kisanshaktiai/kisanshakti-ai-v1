
-- =========================================================================
-- SPRINT 1: SECURITY HARDENING (CORRECTED)
-- =========================================================================

-- Drop existing functions with conflicting return types first
DROP FUNCTION IF EXISTS public.validate_admin_registration_token(text);
DROP FUNCTION IF EXISTS public.validate_invite_token(text);

-- ---------------------------------------------------------------
-- 1. OTP SESSIONS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow verification of OTP" ON public.otp_sessions;

CREATE OR REPLACE FUNCTION public.verify_otp_session(p_session_id uuid, p_otp text)
RETURNS TABLE(id uuid, user_id uuid, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.user_id,
         (s.otp = p_otp AND (s.expires_at IS NULL OR s.expires_at > now())) AS is_valid
  FROM public.otp_sessions s
  WHERE s.id = p_session_id
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_otp_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_otp_session(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------
-- 2. ADMIN INVITES
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read invites by token" ON public.admin_invites;

CREATE OR REPLACE FUNCTION public.validate_admin_invite_token(p_token text)
RETURNS TABLE(id uuid, email text, role text, status text, expires_at timestamptz, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.email, i.role, i.status, i.expires_at,
         (i.status = 'pending' AND (i.expires_at IS NULL OR i.expires_at > now()) AND i.accepted_at IS NULL) AS is_valid
  FROM public.admin_invites i
  WHERE i.invite_token = p_token
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_admin_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_invite_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------
-- 3. ADMIN REGISTRATION TOKENS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public can validate registration tokens" ON public.admin_registration_tokens;

CREATE FUNCTION public.validate_admin_registration_token(p_token text)
RETURNS TABLE(id uuid, email text, role text, expires_at timestamptz, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.email, t.role, t.expires_at,
         (t.used_at IS NULL AND t.expires_at > now()) AS is_valid
  FROM public.admin_registration_tokens t
  WHERE t.token = p_token
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_admin_registration_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_registration_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------
-- 4. INVITES (staff)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view invites by token for verification" ON public.invites;

CREATE FUNCTION public.validate_invite_token(p_token text)
RETURNS TABLE(id uuid, email text, role text, expires_at timestamptz, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.email, i.role, i.expires_at,
         (i.used_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > now())) AS is_valid
  FROM public.invites i
  WHERE i.token = p_token
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invite_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------
-- 5. TEAM INVITATIONS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read invitations by token" ON public.team_invitations;

CREATE OR REPLACE FUNCTION public.validate_team_invitation_token(p_token text)
RETURNS TABLE(id uuid, email text, role text, tenant_id uuid, expires_at timestamptz, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.email, t.role, t.tenant_id, t.expires_at,
         (t.accepted_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())) AS is_valid
  FROM public.team_invitations t
  WHERE t.invitation_token = p_token
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_team_invitation_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_team_invitation_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------
-- 6. AI DECISION LOG
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view decision logs" ON public.ai_decision_log;

CREATE POLICY "Admins or owning farmer can view decision logs"
ON public.ai_decision_log
FOR SELECT
TO public
USING (
  public.is_current_user_admin()
  OR (farmer_id IS NOT NULL AND farmer_id = public.get_current_farmer_id())
);

-- ---------------------------------------------------------------
-- 7. COMMUNITY MEMBERS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on community_members" ON public.community_members;
DROP POLICY IF EXISTS "Anyone can join communities" ON public.community_members;
DROP POLICY IF EXISTS "Anyone can leave communities" ON public.community_members;
DROP POLICY IF EXISTS "Anyone can update memberships" ON public.community_members;
DROP POLICY IF EXISTS "Anyone can view community memberships" ON public.community_members;
DROP POLICY IF EXISTS "Everyone can manage community members" ON public.community_members;
DROP POLICY IF EXISTS "Everyone can view community members" ON public.community_members;

DROP POLICY IF EXISTS "Farmers can view their own memberships" ON public.community_members;
CREATE POLICY "Farmers can view their own memberships"
ON public.community_members
FOR SELECT
TO public
USING (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Farmers can join communities" ON public.community_members;
CREATE POLICY "Farmers can join communities"
ON public.community_members
FOR INSERT
TO public
WITH CHECK (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Farmers can update own memberships" ON public.community_members;
CREATE POLICY "Farmers can update own memberships"
ON public.community_members
FOR UPDATE
TO public
USING (farmer_id = public.get_current_farmer_id())
WITH CHECK (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Members can leave communities" ON public.community_members;
CREATE POLICY "Members can leave communities"
ON public.community_members
FOR DELETE
TO public
USING (farmer_id = public.get_current_farmer_id());

-- ---------------------------------------------------------------
-- 8. FARMER ALERTS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Farmers can view their alerts" ON public.farmer_alerts;
DROP POLICY IF EXISTS "Farmers can update alert status" ON public.farmer_alerts;

CREATE POLICY "Farmers can view their own alerts"
ON public.farmer_alerts
FOR SELECT
TO public
USING (farmer_id = public.get_current_farmer_id());

CREATE POLICY "Farmers can update their own alerts"
ON public.farmer_alerts
FOR UPDATE
TO public
USING (farmer_id = public.get_current_farmer_id())
WITH CHECK (farmer_id = public.get_current_farmer_id());

-- ---------------------------------------------------------------
-- 9. LAND WEATHER METRICS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read land weather metrics for their tenant" ON public.land_weather_metrics;

CREATE POLICY "Farmers can read weather metrics for their lands"
ON public.land_weather_metrics
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1 FROM public.lands l
    WHERE l.id = land_weather_metrics.land_id
      AND l.farmer_id = public.get_current_farmer_id()
  )
);

-- ---------------------------------------------------------------
-- 10. LEADS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admin can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Admin can update all leads" ON public.leads;
DROP POLICY IF EXISTS "Admin can delete all leads" ON public.leads;
DROP POLICY IF EXISTS "Admin can insert leads" ON public.leads;

CREATE POLICY "Platform admins can view leads"
ON public.leads
FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

CREATE POLICY "Platform admins can update leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

CREATE POLICY "Platform admins can delete leads"
ON public.leads
FOR DELETE
TO authenticated
USING (public.is_current_user_admin());

CREATE POLICY "Platform admins can insert leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (public.is_current_user_admin());

-- ---------------------------------------------------------------
-- 11. PROFILES
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- ---------------------------------------------------------------
-- 12. PROACTIVE ALERTS / EVENTS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Service select proactive_alerts" ON public.proactive_alerts;
DROP POLICY IF EXISTS "Service update proactive_alerts" ON public.proactive_alerts;
DROP POLICY IF EXISTS "Service can insert proactive alerts" ON public.proactive_alerts;

CREATE POLICY "Service role manages proactive_alerts"
ON public.proactive_alerts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Farmers can read own proactive alerts (header)" ON public.proactive_alerts;
CREATE POLICY "Farmers can read own proactive alerts (header)"
ON public.proactive_alerts
FOR SELECT
TO public
USING (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Farmers can update own proactive alerts (header)" ON public.proactive_alerts;
CREATE POLICY "Farmers can update own proactive alerts (header)"
ON public.proactive_alerts
FOR UPDATE
TO public
USING (farmer_id = public.get_current_farmer_id())
WITH CHECK (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Service select proactive_events" ON public.proactive_events;
DROP POLICY IF EXISTS "Service update proactive_events" ON public.proactive_events;
DROP POLICY IF EXISTS "Service can insert proactive events" ON public.proactive_events;
DROP POLICY IF EXISTS "Service insert proactive_events" ON public.proactive_events;

CREATE POLICY "Service role manages proactive_events"
ON public.proactive_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Farmers can read own proactive events (header)" ON public.proactive_events;
CREATE POLICY "Farmers can read own proactive events (header)"
ON public.proactive_events
FOR SELECT
TO public
USING (farmer_id = public.get_current_farmer_id());

-- ---------------------------------------------------------------
-- 13. WEATHER ALERTS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public can insert weather cache" ON public.weather_alerts;
DROP POLICY IF EXISTS "Public can update weather cache" ON public.weather_alerts;
DROP POLICY IF EXISTS "Public can delete weather cache" ON public.weather_alerts;
DROP POLICY IF EXISTS "Public can read weather cache" ON public.weather_alerts;
DROP POLICY IF EXISTS "Anyone can view weather alerts" ON public.weather_alerts;

CREATE POLICY "Farmers can read tenant weather alerts"
ON public.weather_alerts
FOR SELECT
TO public
USING (
  tenant_id IS NULL
  OR tenant_id = public.get_current_tenant_id()
);

CREATE POLICY "Service role manages weather alerts"
ON public.weather_alerts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------
-- 14. HYPOTHESIS INTEGRITY ALERTS
-- ---------------------------------------------------------------
ALTER TABLE public.hypothesis_integrity_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage hypothesis integrity alerts" ON public.hypothesis_integrity_alerts;
CREATE POLICY "Admins manage hypothesis integrity alerts"
ON public.hypothesis_integrity_alerts
FOR ALL
TO authenticated
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Service role manages hypothesis integrity alerts" ON public.hypothesis_integrity_alerts;
CREATE POLICY "Service role manages hypothesis integrity alerts"
ON public.hypothesis_integrity_alerts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------
-- 15. WHITE LABEL CONFIGS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access by tenant" ON public.white_label_configs;

CREATE POLICY "Anon can read active white label branding"
ON public.white_label_configs
FOR SELECT
TO anon, authenticated
USING (COALESCE(is_active, true) = true);

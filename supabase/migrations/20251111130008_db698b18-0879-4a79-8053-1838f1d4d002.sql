-- ============================================
-- CRITICAL SECURITY FIXES MIGRATION - PART 1
-- RLS Policies for tables without them
-- ============================================

-- 1. ADD RLS POLICIES FOR TABLES WITHOUT THEM
-- agro_climatic_zones - Read-only public data
CREATE POLICY "Anyone can view agro climatic zones"
ON public.agro_climatic_zones
FOR SELECT
TO public
USING (true);

-- edge_invocation_logs - Admin only access
CREATE POLICY "Platform admins can view edge invocation logs"
ON public.edge_invocation_logs
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.id = auth.uid()
    AND admin_users.is_active = true
    AND admin_users.role IN ('super_admin', 'platform_admin')
  )
);

CREATE POLICY "System can insert edge invocation logs"
ON public.edge_invocation_logs
FOR INSERT
TO public
WITH CHECK (true);

-- 2. CONVERT EXISTING SECURITY DEFINER FUNCTIONS TO SECURITY INVOKER
-- Only for utility/read-only functions that don't need elevated privileges

ALTER FUNCTION calculate_area_km2(geometry) SECURITY INVOKER;
ALTER FUNCTION calculate_evapotranspiration(numeric, integer, numeric, numeric) SECURITY INVOKER;
ALTER FUNCTION calculate_growing_degree_days(numeric, numeric, numeric) SECURITY INVOKER;
ALTER FUNCTION check_mobile_number_exists(text) SECURITY INVOKER;
ALTER FUNCTION get_current_farmer_id() SECURITY INVOKER;
ALTER FUNCTION get_current_tenant_id() SECURITY INVOKER;
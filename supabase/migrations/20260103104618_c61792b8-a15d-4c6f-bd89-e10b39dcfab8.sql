
-- =====================================================
-- FIX AI CHAT RLS POLICIES FOR CUSTOM PIN AUTHENTICATION
-- Multi-tenant SaaS: Farmers (CRUD own), Tenant Admins (read tenant), SaaS Admins (read all)
-- =====================================================

-- =====================================================
-- STEP 1: DROP BROKEN POLICIES (using auth.uid())
-- =====================================================

-- Drop broken tenant_isolation policies that use auth.uid()
DROP POLICY IF EXISTS "tenant_isolation_messages_select" ON ai_chat_messages;
DROP POLICY IF EXISTS "tenant_isolation_messages_insert" ON ai_chat_messages;
DROP POLICY IF EXISTS "tenant_isolation_messages_update" ON ai_chat_messages;
DROP POLICY IF EXISTS "tenant_isolation_sessions_select" ON ai_chat_sessions;
DROP POLICY IF EXISTS "tenant_isolation_sessions_insert" ON ai_chat_sessions;
DROP POLICY IF EXISTS "tenant_isolation_sessions_update" ON ai_chat_sessions;

-- Drop old Farmers policies that use app.* settings without proper fallback
DROP POLICY IF EXISTS "Farmers can create own messages" ON ai_chat_messages;
DROP POLICY IF EXISTS "Farmers can create own sessions" ON ai_chat_sessions;

-- =====================================================
-- STEP 2: CREATE CLEAN POLICIES FOR ai_chat_sessions
-- =====================================================

-- Farmers can SELECT their own sessions (using header-based auth)
CREATE POLICY "farmers_select_own_sessions" ON ai_chat_sessions
FOR SELECT USING (
  -- Service role bypass
  auth.role() = 'service_role'
  OR
  -- Farmer can see own sessions within their active tenant
  (
    tenant_id = get_current_tenant_id()
    AND farmer_id = get_current_farmer_id()
    AND is_tenant_active(tenant_id)
  )
  OR
  -- Tenant admins can see all sessions in their tenant (for analysis)
  (
    tenant_id = get_current_tenant_id()
    AND is_tenant_admin()
    AND is_tenant_active(tenant_id)
  )
  OR
  -- SaaS super admins can see all sessions
  is_super_admin()
);

-- Farmers can INSERT their own sessions
CREATE POLICY "farmers_insert_own_sessions" ON ai_chat_sessions
FOR INSERT WITH CHECK (
  auth.role() = 'service_role'
  OR
  (
    tenant_id = get_current_tenant_id()
    AND farmer_id = get_current_farmer_id()
    AND is_tenant_active(tenant_id)
  )
);

-- Farmers can UPDATE their own sessions
CREATE POLICY "farmers_update_own_sessions" ON ai_chat_sessions
FOR UPDATE USING (
  auth.role() = 'service_role'
  OR
  (
    tenant_id = get_current_tenant_id()
    AND farmer_id = get_current_farmer_id()
  )
) WITH CHECK (
  auth.role() = 'service_role'
  OR
  (
    tenant_id = get_current_tenant_id()
    AND farmer_id = get_current_farmer_id()
    AND is_tenant_active(tenant_id)
  )
);

-- =====================================================
-- STEP 3: CREATE CLEAN POLICIES FOR ai_chat_messages
-- =====================================================

-- Farmers can SELECT their own messages
CREATE POLICY "farmers_select_own_messages" ON ai_chat_messages
FOR SELECT USING (
  -- Service role bypass
  auth.role() = 'service_role'
  OR
  -- Farmer can see own messages within their active tenant
  (
    tenant_id = get_current_tenant_id()
    AND farmer_id = get_current_farmer_id()
    AND is_tenant_active(tenant_id)
  )
  OR
  -- Tenant admins can see all messages in their tenant (for analysis)
  (
    tenant_id = get_current_tenant_id()
    AND is_tenant_admin()
    AND is_tenant_active(tenant_id)
  )
  OR
  -- SaaS super admins can see all messages
  is_super_admin()
);

-- Farmers can INSERT their own messages
CREATE POLICY "farmers_insert_own_messages" ON ai_chat_messages
FOR INSERT WITH CHECK (
  auth.role() = 'service_role'
  OR
  (
    tenant_id = get_current_tenant_id()
    AND farmer_id = get_current_farmer_id()
    AND is_tenant_active(tenant_id)
  )
);

-- Farmers can UPDATE their own messages (for feedback, edits)
CREATE POLICY "farmers_update_own_messages" ON ai_chat_messages
FOR UPDATE USING (
  auth.role() = 'service_role'
  OR
  (
    tenant_id = get_current_tenant_id()
    AND farmer_id = get_current_farmer_id()
  )
) WITH CHECK (
  auth.role() = 'service_role'
  OR
  (
    tenant_id = get_current_tenant_id()
    AND farmer_id = get_current_farmer_id()
    AND is_tenant_active(tenant_id)
  )
);

-- =====================================================
-- STEP 4: DROP REDUNDANT POLICIES (now we have clean ones)
-- =====================================================

-- Drop the complex access_policy since we now have cleaner separated policies
DROP POLICY IF EXISTS "ai_chat_messages_access_policy" ON ai_chat_messages;
DROP POLICY IF EXISTS "ai_chat_sessions_access_policy" ON ai_chat_sessions;

-- Keep the service_role policies as they are simple and correct
-- "Service role full access" and "Service role full access sessions" remain

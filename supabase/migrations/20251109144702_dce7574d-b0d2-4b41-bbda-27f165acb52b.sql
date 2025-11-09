-- Phase 4: Critical Security - Enforce Data Isolation for AI Chat (Corrected)

-- Step 1: Create security definer function to get user's tenant_id from user_profiles
-- This prevents infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id 
  FROM public.user_profiles 
  WHERE id = _user_id
  LIMIT 1
$$;

-- Step 2: Enable RLS on ai_chat_messages if not already enabled
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Farmers can view own messages" ON ai_chat_messages;
DROP POLICY IF EXISTS "Farmers can insert own messages" ON ai_chat_messages;
DROP POLICY IF EXISTS "Farmers can update own messages" ON ai_chat_messages;
DROP POLICY IF EXISTS "Service role full access" ON ai_chat_messages;

-- Step 4: Create strict RLS policies for farmers
-- Policy: Farmers can only view their own messages within their tenant
CREATE POLICY "Farmers can view own messages"
ON ai_chat_messages 
FOR SELECT
TO authenticated
USING (
  farmer_id = auth.uid() 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

-- Policy: Farmers can only insert messages with their own IDs
CREATE POLICY "Farmers can insert own messages"
ON ai_chat_messages 
FOR INSERT
TO authenticated
WITH CHECK (
  farmer_id = auth.uid() 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

-- Policy: Farmers can update only their own messages (for feedback)
CREATE POLICY "Farmers can update own messages"
ON ai_chat_messages 
FOR UPDATE
TO authenticated
USING (
  farmer_id = auth.uid() 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
)
WITH CHECK (
  farmer_id = auth.uid() 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

-- Policy: Service role has full access (for edge functions)
CREATE POLICY "Service role full access"
ON ai_chat_messages 
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Step 5: Add the same security for ai_chat_sessions
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Farmers can view own sessions" ON ai_chat_sessions;
DROP POLICY IF EXISTS "Farmers can insert own sessions" ON ai_chat_sessions;
DROP POLICY IF EXISTS "Farmers can update own sessions" ON ai_chat_sessions;
DROP POLICY IF EXISTS "Service role full access sessions" ON ai_chat_sessions;

CREATE POLICY "Farmers can view own sessions"
ON ai_chat_sessions 
FOR SELECT
TO authenticated
USING (
  farmer_id = auth.uid() 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

CREATE POLICY "Farmers can insert own sessions"
ON ai_chat_sessions 
FOR INSERT
TO authenticated
WITH CHECK (
  farmer_id = auth.uid() 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

CREATE POLICY "Farmers can update own sessions"
ON ai_chat_sessions 
FOR UPDATE
TO authenticated
USING (
  farmer_id = auth.uid() 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
)
WITH CHECK (
  farmer_id = auth.uid() 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

CREATE POLICY "Service role full access sessions"
ON ai_chat_sessions 
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_isolation 
ON ai_chat_messages(tenant_id, farmer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_isolation 
ON ai_chat_sessions(tenant_id, farmer_id, updated_at DESC);

-- Step 7: Add comments for documentation
COMMENT ON FUNCTION public.get_user_tenant_id IS 'Security definer function to get user tenant_id from user_profiles without causing RLS recursion';
COMMENT ON POLICY "Farmers can view own messages" ON ai_chat_messages IS 'Strict isolation: farmers can only view messages they created within their tenant';
COMMENT ON POLICY "Farmers can insert own messages" ON ai_chat_messages IS 'Strict isolation: farmers can only insert messages with their own farmer_id and tenant_id';
COMMENT ON POLICY "Service role full access" ON ai_chat_messages IS 'Edge functions using service role key can access all messages for AI processing';
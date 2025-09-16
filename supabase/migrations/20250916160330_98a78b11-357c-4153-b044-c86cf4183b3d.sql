-- Create helper functions for JWT-based tenant and farmer isolation
CREATE OR REPLACE FUNCTION public.get_jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid,
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'tenant_id')::uuid
  );
$$;

-- Already exists but ensure it's created
CREATE OR REPLACE FUNCTION public.get_jwt_farmer_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'farmer_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

-- Add tenant_id to tables that need it
ALTER TABLE public.marketplace_products 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.chat_sessions 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.product_reviews 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.cart_items 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.marketplace_orders 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.community_messages 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add farmer_id to tables that need it
ALTER TABLE public.marketplace_products 
ADD COLUMN IF NOT EXISTS farmer_id uuid REFERENCES public.farmers(id);

ALTER TABLE public.product_reviews 
ADD COLUMN IF NOT EXISTS farmer_id uuid REFERENCES public.farmers(id);

ALTER TABLE public.cart_items 
ADD COLUMN IF NOT EXISTS farmer_id uuid REFERENCES public.farmers(id);

ALTER TABLE public.marketplace_orders 
ADD COLUMN IF NOT EXISTS farmer_id uuid REFERENCES public.farmers(id);

ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS farmer_id uuid REFERENCES public.farmers(id);

-- Update existing records to have tenant_id from related farmers table
UPDATE public.marketplace_products mp
SET tenant_id = f.tenant_id
FROM public.farmers f
WHERE mp.seller_id = f.id AND mp.tenant_id IS NULL;

UPDATE public.chat_sessions cs
SET tenant_id = f.tenant_id
FROM public.farmers f
WHERE cs.user_id = f.id AND cs.tenant_id IS NULL;

-- Fix product_reviews update - use buyer_id instead of non-existent reviewer_id
UPDATE public.product_reviews pr
SET tenant_id = mp.tenant_id, farmer_id = pr.buyer_id
FROM public.marketplace_products mp
WHERE pr.product_id = mp.id 
AND pr.tenant_id IS NULL;

UPDATE public.cart_items ci
SET tenant_id = f.tenant_id, farmer_id = ci.user_id
FROM public.farmers f
WHERE ci.user_id = f.id AND ci.tenant_id IS NULL;

UPDATE public.marketplace_orders mo
SET tenant_id = f.tenant_id, farmer_id = mo.buyer_id
FROM public.farmers f
WHERE mo.buyer_id = f.id AND mo.tenant_id IS NULL;

UPDATE public.community_messages cm
SET tenant_id = f.tenant_id
FROM public.farmers f
WHERE cm.farmer_id = f.id AND cm.tenant_id IS NULL;

-- Create RLS policies for marketplace_products
DROP POLICY IF EXISTS "Anyone can view products" ON public.marketplace_products;
DROP POLICY IF EXISTS "Sellers can manage their products" ON public.marketplace_products;

CREATE POLICY "Tenant isolated product access" ON public.marketplace_products
FOR SELECT USING (tenant_id = get_jwt_tenant_id());

CREATE POLICY "Farmers can manage their products" ON public.marketplace_products
FOR ALL USING (
  tenant_id = get_jwt_tenant_id() 
  AND seller_id = get_jwt_farmer_id()
);

-- Create RLS policies for chat_sessions
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON public.chat_sessions;

CREATE POLICY "Tenant isolated chat session access" ON public.chat_sessions
FOR ALL USING (
  tenant_id = get_jwt_tenant_id() 
  AND user_id = get_jwt_farmer_id()
);

-- Create RLS policies for chat_messages
DROP POLICY IF EXISTS "Users can view messages from their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can create messages in their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update messages in their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete messages from their sessions" ON public.chat_messages;

CREATE POLICY "Tenant isolated chat message access" ON public.chat_messages
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.chat_sessions cs
    WHERE cs.id = chat_messages.session_id
    AND cs.tenant_id = get_jwt_tenant_id()
    AND cs.user_id = get_jwt_farmer_id()
  )
);

-- Create RLS policies for product_reviews
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Users can manage their reviews" ON public.product_reviews;

CREATE POLICY "Tenant isolated review access" ON public.product_reviews
FOR SELECT USING (tenant_id = get_jwt_tenant_id());

CREATE POLICY "Farmers can manage their reviews" ON public.product_reviews
FOR ALL USING (
  tenant_id = get_jwt_tenant_id() 
  AND farmer_id = get_jwt_farmer_id()
);

-- Create RLS policies for cart_items
DROP POLICY IF EXISTS "Users can manage their cart" ON public.cart_items;

CREATE POLICY "Tenant isolated cart access" ON public.cart_items
FOR ALL USING (
  tenant_id = get_jwt_tenant_id() 
  AND farmer_id = get_jwt_farmer_id()
);

-- Create RLS policies for marketplace_orders
DROP POLICY IF EXISTS "Users can view their orders" ON public.marketplace_orders;

CREATE POLICY "Tenant isolated order access" ON public.marketplace_orders
FOR ALL USING (
  tenant_id = get_jwt_tenant_id() 
  AND (farmer_id = get_jwt_farmer_id() OR seller_id = get_jwt_farmer_id())
);

-- Create RLS policies for community_messages
DROP POLICY IF EXISTS "Community members can view messages" ON public.community_messages;
DROP POLICY IF EXISTS "Community members can create messages" ON public.community_messages;

CREATE POLICY "Tenant isolated community message access" ON public.community_messages
FOR SELECT USING (
  tenant_id = get_jwt_tenant_id() OR 
  community_id IN (SELECT id FROM public.communities WHERE is_global = true)
);

CREATE POLICY "Farmers can create community messages" ON public.community_messages
FOR INSERT WITH CHECK (
  tenant_id = get_jwt_tenant_id() 
  AND farmer_id = get_jwt_farmer_id()
);

CREATE POLICY "Farmers can update their messages" ON public.community_messages
FOR UPDATE USING (
  tenant_id = get_jwt_tenant_id() 
  AND farmer_id = get_jwt_farmer_id()
);

CREATE POLICY "Farmers can delete their messages" ON public.community_messages
FOR DELETE USING (
  tenant_id = get_jwt_tenant_id() 
  AND farmer_id = get_jwt_farmer_id()
);

-- Create function to set tenant and farmer context for edge functions
CREATE OR REPLACE FUNCTION public.set_app_session(
  p_tenant_id uuid,
  p_farmer_id uuid,
  p_session_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Set session variables for RLS
  PERFORM set_config('request.jwt.claims', json_build_object(
    'tenant_id', p_tenant_id,
    'farmer_id', p_farmer_id,
    'session_token', p_session_token
  )::text, true);
END;
$$;
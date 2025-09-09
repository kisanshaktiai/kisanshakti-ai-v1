-- First, drop ALL existing policies on farmers table
DROP POLICY IF EXISTS "Farmers can update their own data" ON public.farmers;
DROP POLICY IF EXISTS "Farmers can delete their own data" ON public.farmers;
DROP POLICY IF EXISTS "Farmers can manage their own data" ON public.farmers;
DROP POLICY IF EXISTS "Tenant users can manage farmers" ON public.farmers;
DROP POLICY IF EXISTS "Allow anonymous farmer lookup" ON public.farmers;
DROP POLICY IF EXISTS "Allow farmer creation" ON public.farmers;
DROP POLICY IF EXISTS "Allow anonymous farmer lookup for auth" ON public.farmers;
DROP POLICY IF EXISTS "Allow anonymous farmer creation" ON public.farmers;

-- Create simple RLS policies for authentication flow
-- IMPORTANT: During auth, users are NOT authenticated yet, so we need to allow anonymous access

-- 1. Allow ALL SELECT operations (needed for auth checks)
CREATE POLICY "Public read for auth checks" 
ON public.farmers 
FOR SELECT 
USING (true);

-- 2. Allow ALL INSERT operations (needed for registration)
CREATE POLICY "Public create for registration" 
ON public.farmers 
FOR INSERT 
WITH CHECK (true);

-- 3. Allow ALL UPDATE operations (needed for PIN updates)
CREATE POLICY "Public update for PIN" 
ON public.farmers 
FOR UPDATE 
USING (true)
WITH CHECK (true);

-- Also fix user_profiles RLS
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow anonymous profile creation" ON public.user_profiles;

-- Allow all operations on user_profiles for auth flow
CREATE POLICY "Public access for auth flow" 
ON public.user_profiles 
FOR ALL 
USING (true)
WITH CHECK (true);
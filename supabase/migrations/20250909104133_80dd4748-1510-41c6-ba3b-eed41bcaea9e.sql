-- Drop existing RLS policies for farmers table
DROP POLICY IF EXISTS "Farmers can manage their own data" ON public.farmers;
DROP POLICY IF EXISTS "Tenant users can manage farmers" ON public.farmers;
DROP POLICY IF EXISTS "Allow anonymous farmer lookup" ON public.farmers;
DROP POLICY IF EXISTS "Allow farmer creation" ON public.farmers;

-- Create new RLS policies that allow anonymous access for authentication flow
-- 1. Allow anonymous read for authentication check (mobile + tenant lookup)
CREATE POLICY "Allow anonymous farmer lookup for auth" 
ON public.farmers 
FOR SELECT 
USING (true);  -- Allow all reads for authentication purposes

-- 2. Allow anonymous creation for registration
CREATE POLICY "Allow anonymous farmer creation" 
ON public.farmers 
FOR INSERT 
WITH CHECK (true);  -- Allow creation for new registrations

-- 3. Allow authenticated farmers to update their own data
CREATE POLICY "Farmers can update their own data" 
ON public.farmers 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Allow authenticated farmers to delete their own data
CREATE POLICY "Farmers can delete their own data" 
ON public.farmers 
FOR DELETE 
USING (auth.uid() = id);

-- Also fix user_profiles RLS
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON public.user_profiles;

-- Allow anonymous profile creation during registration
CREATE POLICY "Allow anonymous profile creation" 
ON public.user_profiles 
FOR INSERT 
WITH CHECK (true);

-- Allow users to manage their own profiles
CREATE POLICY "Users can manage their own profile" 
ON public.user_profiles 
FOR ALL 
USING (auth.uid() = farmer_id)
WITH CHECK (auth.uid() = farmer_id);
-- Add mobile_number and farmer_code columns to user_profiles table if they don't exist
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS mobile_number TEXT,
ADD COLUMN IF NOT EXISTS farmer_code TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_mobile_number ON public.user_profiles(mobile_number);
CREATE INDEX IF NOT EXISTS idx_user_profiles_farmer_code ON public.user_profiles(farmer_code);

-- Update existing records to populate mobile_number and farmer_code from farmers table
UPDATE public.user_profiles up
SET 
  mobile_number = f.mobile_number,
  farmer_code = f.farmer_code
FROM public.farmers f
WHERE up.farmer_id = f.id
AND (up.mobile_number IS NULL OR up.farmer_code IS NULL);
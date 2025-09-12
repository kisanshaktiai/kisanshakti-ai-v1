-- Create migration to add crop selection data and fix land columns
-- Add crop_id columns to lands table if they don't exist
ALTER TABLE public.lands 
ADD COLUMN IF NOT EXISTS current_crop_id UUID REFERENCES public.crops(id),
ADD COLUMN IF NOT EXISTS previous_crop_id UUID REFERENCES public.crops(id),
ADD COLUMN IF NOT EXISTS planting_date DATE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lands_current_crop_id ON public.lands(current_crop_id);
CREATE INDEX IF NOT EXISTS idx_lands_previous_crop_id ON public.lands(previous_crop_id);
CREATE INDEX IF NOT EXISTS idx_lands_farmer_tenant ON public.lands(farmer_id, tenant_id);

-- Create index on crop_groups and crops for faster lookups
CREATE INDEX IF NOT EXISTS idx_crops_group_id ON public.crops(crop_group_id);
CREATE INDEX IF NOT EXISTS idx_crops_active ON public.crops(is_active);
CREATE INDEX IF NOT EXISTS idx_crop_groups_active ON public.crop_groups(is_active);
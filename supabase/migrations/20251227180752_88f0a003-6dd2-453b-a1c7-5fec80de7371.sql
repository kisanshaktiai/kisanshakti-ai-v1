-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION: Multi-Crop Support & Land-Schedule Sync
-- Purpose: 
--   1. Add land_crops table for multiple crops per land (major, intercrop, border, relay)
--   2. Add previous_crop tracking columns to lands table
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add previous_crop columns to lands table for crop rotation tracking
ALTER TABLE public.lands 
  ADD COLUMN IF NOT EXISTS previous_crop TEXT,
  ADD COLUMN IF NOT EXISTS previous_crop_id UUID,
  ADD COLUMN IF NOT EXISTS last_harvest_date DATE;

-- Add comment for clarity
COMMENT ON COLUMN public.lands.previous_crop IS 'Previous crop grown on this land (for rotation tracking)';
COMMENT ON COLUMN public.lands.previous_crop_id IS 'Reference to previous crop in crops table';
COMMENT ON COLUMN public.lands.last_harvest_date IS 'Date when previous crop was harvested';

-- 2. Create land_crops table for multi-crop support
CREATE TABLE IF NOT EXISTS public.land_crops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id UUID NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  
  -- Crop identification
  crop_name TEXT NOT NULL,
  crop_name_local TEXT, -- Localized name (Hindi/Marathi)
  crop_id UUID, -- Reference to crops table if exists
  crop_variety TEXT,
  
  -- Crop type classification
  crop_type TEXT NOT NULL DEFAULT 'major' CHECK (crop_type IN ('major', 'intercrop', 'border', 'relay', 'companion')),
  
  -- Timing
  sowing_date DATE,
  expected_harvest_date DATE,
  actual_harvest_date DATE,
  
  -- Area allocation
  area_percentage NUMERIC DEFAULT 100 CHECK (area_percentage >= 0 AND area_percentage <= 100),
  area_acres NUMERIC,
  
  -- Schedule reference
  schedule_id UUID REFERENCES public.crop_schedules(id) ON DELETE SET NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'growing' CHECK (status IN ('planned', 'sowing', 'growing', 'harvesting', 'harvested', 'failed')),
  
  -- Metadata
  farming_type TEXT DEFAULT 'organic_fertilizer' CHECK (farming_type IN ('organic_only', 'fertilizer_pesticide', 'organic_fertilizer')),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_land_crops_land_id ON public.land_crops(land_id);
CREATE INDEX IF NOT EXISTS idx_land_crops_tenant_id ON public.land_crops(tenant_id);
CREATE INDEX IF NOT EXISTS idx_land_crops_farmer_id ON public.land_crops(farmer_id);
CREATE INDEX IF NOT EXISTS idx_land_crops_is_active ON public.land_crops(is_active);
CREATE INDEX IF NOT EXISTS idx_land_crops_crop_type ON public.land_crops(crop_type);

-- Enable RLS
ALTER TABLE public.land_crops ENABLE ROW LEVEL SECURITY;

-- RLS Policies for land_crops
CREATE POLICY "Farmers can view their own land crops" 
  ON public.land_crops 
  FOR SELECT 
  USING (farmer_id = auth.uid() OR tenant_id IN (
    SELECT tenant_id FROM public.farmers WHERE id = auth.uid()
  ));

CREATE POLICY "Farmers can insert their own land crops" 
  ON public.land_crops 
  FOR INSERT 
  WITH CHECK (farmer_id = auth.uid() OR tenant_id IN (
    SELECT tenant_id FROM public.farmers WHERE id = auth.uid()
  ));

CREATE POLICY "Farmers can update their own land crops" 
  ON public.land_crops 
  FOR UPDATE 
  USING (farmer_id = auth.uid() OR tenant_id IN (
    SELECT tenant_id FROM public.farmers WHERE id = auth.uid()
  ));

CREATE POLICY "Farmers can delete their own land crops" 
  ON public.land_crops 
  FOR DELETE 
  USING (farmer_id = auth.uid() OR tenant_id IN (
    SELECT tenant_id FROM public.farmers WHERE id = auth.uid()
  ));

-- 3. Create function to update timestamp on land_crops
CREATE OR REPLACE FUNCTION update_land_crops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_land_crops_updated_at ON public.land_crops;
CREATE TRIGGER update_land_crops_updated_at
  BEFORE UPDATE ON public.land_crops
  FOR EACH ROW
  EXECUTE FUNCTION update_land_crops_updated_at();

-- 4. Create function to sync major crop to lands.current_crop
CREATE OR REPLACE FUNCTION sync_major_crop_to_land()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if this is a major crop and is active
  IF NEW.crop_type = 'major' AND NEW.is_active = true THEN
    UPDATE public.lands SET
      current_crop = NEW.crop_name,
      current_crop_id = NEW.crop_id,
      planting_date = NEW.sowing_date,
      expected_harvest_date = NEW.expected_harvest_date,
      updated_at = now()
    WHERE id = NEW.land_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-sync major crop
DROP TRIGGER IF EXISTS sync_major_crop_trigger ON public.land_crops;
CREATE TRIGGER sync_major_crop_trigger
  AFTER INSERT OR UPDATE ON public.land_crops
  FOR EACH ROW
  WHEN (NEW.crop_type = 'major' AND NEW.is_active = true)
  EXECUTE FUNCTION sync_major_crop_to_land();
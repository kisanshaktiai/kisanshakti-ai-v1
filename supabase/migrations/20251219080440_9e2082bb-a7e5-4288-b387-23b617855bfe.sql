-- Add columns to crop_growth_uploads for schedule/task integration
ALTER TABLE public.crop_growth_uploads 
ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.crop_schedules(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.schedule_tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS upload_type TEXT DEFAULT 'crop' CHECK (upload_type IN ('crop', 'soil', 'land_preparation', 'irrigation', 'pest', 'fertilizer', 'harvest', 'general')),
ADD COLUMN IF NOT EXISTS location_validated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS distance_from_land_meters NUMERIC;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_crop_growth_uploads_schedule_id ON public.crop_growth_uploads(schedule_id);
CREATE INDEX IF NOT EXISTS idx_crop_growth_uploads_task_id ON public.crop_growth_uploads(task_id);
CREATE INDEX IF NOT EXISTS idx_crop_growth_uploads_upload_type ON public.crop_growth_uploads(upload_type);

-- Function to validate photo location against land boundary
CREATE OR REPLACE FUNCTION public.validate_photo_location(
  p_land_id UUID,
  p_lat NUMERIC,
  p_lon NUMERIC,
  p_tolerance_meters NUMERIC DEFAULT 500
)
RETURNS TABLE (
  is_valid BOOLEAN,
  distance_meters NUMERIC,
  validation_level TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_land_center_lat NUMERIC;
  v_land_center_lon NUMERIC;
  v_distance NUMERIC;
BEGIN
  -- Get land center coordinates
  SELECT 
    center_lat,
    center_lon
  INTO v_land_center_lat, v_land_center_lon
  FROM lands
  WHERE id = p_land_id;
  
  IF v_land_center_lat IS NULL OR v_land_center_lon IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'no_land_coordinates'::TEXT;
    RETURN;
  END IF;
  
  -- Calculate distance using Haversine formula (in meters)
  v_distance := 6371000 * 2 * ASIN(
    SQRT(
      POWER(SIN(RADIANS(p_lat - v_land_center_lat) / 2), 2) +
      COS(RADIANS(v_land_center_lat)) * COS(RADIANS(p_lat)) *
      POWER(SIN(RADIANS(p_lon - v_land_center_lon) / 2), 2)
    )
  );
  
  -- Determine validation level
  IF v_distance <= 100 THEN
    RETURN QUERY SELECT TRUE, v_distance, 'at_land'::TEXT;
  ELSIF v_distance <= p_tolerance_meters THEN
    RETURN QUERY SELECT TRUE, v_distance, 'nearby'::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, v_distance, 'far'::TEXT;
  END IF;
END;
$$;
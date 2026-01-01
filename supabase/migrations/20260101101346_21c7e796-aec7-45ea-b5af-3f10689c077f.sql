-- ═══════════════════════════════════════════════════════════════════════════
-- CROP SCHEDULE INTEGRITY MIGRATION
-- Ensures single active crop schedule per land, proper date constraints, and indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create function to enforce single active crop schedule per land
CREATE OR REPLACE FUNCTION public.enforce_single_active_crop_schedule()
RETURNS TRIGGER AS $$
BEGIN
  -- When activating a crop schedule, deactivate all others for the same land
  IF NEW.is_active = true AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_active = false)) THEN
    UPDATE public.crop_schedules
    SET is_active = false, updated_at = NOW()
    WHERE land_id = NEW.land_id 
      AND id != NEW.id 
      AND is_active = true;
    
    RAISE NOTICE 'Deactivated other crop schedules for land_id: %', NEW.land_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Create trigger for single active enforcement
DROP TRIGGER IF EXISTS trigger_single_active_crop ON public.crop_schedules;
CREATE TRIGGER trigger_single_active_crop
  BEFORE INSERT OR UPDATE OF is_active ON public.crop_schedules
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.enforce_single_active_crop_schedule();

-- 3. Create function to validate crop schedule dates
CREATE OR REPLACE FUNCTION public.validate_crop_schedule_dates()
RETURNS TRIGGER AS $$
BEGIN
  -- Sowing date should not be more than 7 days in the future (allow some flexibility)
  IF NEW.sowing_date > (CURRENT_DATE + INTERVAL '7 days') THEN
    RAISE EXCEPTION 'Sowing date cannot be more than 7 days in the future. Got: %', NEW.sowing_date;
  END IF;
  
  -- Expected harvest date must be after sowing date
  IF NEW.expected_harvest_date IS NOT NULL AND NEW.expected_harvest_date <= NEW.sowing_date THEN
    RAISE EXCEPTION 'Expected harvest date must be after sowing date. Sowing: %, Harvest: %', 
      NEW.sowing_date, NEW.expected_harvest_date;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Create trigger for date validation
DROP TRIGGER IF EXISTS trigger_validate_crop_dates ON public.crop_schedules;
CREATE TRIGGER trigger_validate_crop_dates
  BEFORE INSERT OR UPDATE OF sowing_date, expected_harvest_date ON public.crop_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_crop_schedule_dates();

-- 5. Create optimized index for AI orchestrator queries
-- This supports rapid context retrieval: active schedule for a specific land, ordered by sowing date
CREATE INDEX IF NOT EXISTS idx_crop_schedules_land_active_sowing 
  ON public.crop_schedules (land_id, is_active, sowing_date DESC)
  WHERE is_active = true;

-- 6. Create index for farmer-level schedule lookup
CREATE INDEX IF NOT EXISTS idx_crop_schedules_farmer_active
  ON public.crop_schedules (farmer_id, is_active)
  WHERE is_active = true;

-- 7. Add comment explaining the single-active constraint
COMMENT ON TRIGGER trigger_single_active_crop ON public.crop_schedules IS 
  'Ensures only one active crop schedule exists per land at any time. When a new schedule is activated, all other schedules for the same land are automatically deactivated.';

COMMENT ON TRIGGER trigger_validate_crop_dates ON public.crop_schedules IS 
  'Validates that sowing_date is not too far in the future and expected_harvest_date is after sowing_date.';
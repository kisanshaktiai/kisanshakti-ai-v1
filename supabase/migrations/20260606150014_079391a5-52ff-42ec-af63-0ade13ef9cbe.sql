
-- ============================================================
-- Harvest Confirmation & Land Release Engine — Step 1 Schema
-- ============================================================

-- 1. Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.land_lifecycle_status AS ENUM (
    'AVAILABLE','PREPARING','CROP_ACTIVE','READY_FOR_HARVEST',
    'WAITING_HARVEST_CONFIRMATION','HARVEST_COMPLETED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crop_schedule_lifecycle_status AS ENUM (
    'PLANNED','SOWN','GROWING','MATURITY_REACHED',
    'WAITING_HARVEST_CONFIRMATION','HARVESTED','ABANDONED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.harvest_status AS ENUM (
    'NOT_STARTED','PARTIALLY_HARVESTED','FULLY_HARVESTED','ABANDONED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.harvest_confirmation_request_status AS ENUM (
    'PENDING','RESPONDED','EXPIRED','CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend lands -------------------------------------------------------
ALTER TABLE public.lands
  ADD COLUMN IF NOT EXISTS lifecycle_status public.land_lifecycle_status NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS active_schedule_id uuid NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at timestamptz NOT NULL DEFAULT now();

-- 3. Extend crop_schedules ---------------------------------------------
ALTER TABLE public.crop_schedules
  ADD COLUMN IF NOT EXISTS harvest_status public.harvest_status NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS harvest_confirmed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS harvest_confirmed_by uuid NULL,
  ADD COLUMN IF NOT EXISTS harvest_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lifecycle_status public.crop_schedule_lifecycle_status NOT NULL DEFAULT 'PLANNED';

-- FK for lands.active_schedule_id (deferred so backfill works)
DO $$ BEGIN
  ALTER TABLE public.lands
    ADD CONSTRAINT lands_active_schedule_fk
    FOREIGN KEY (active_schedule_id) REFERENCES public.crop_schedules(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Audit log table ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crop_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  land_id uuid NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  schedule_id uuid NULL REFERENCES public.crop_schedules(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_land ON public.crop_lifecycle_events(land_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_tenant ON public.crop_lifecycle_events(tenant_id, created_at DESC);

GRANT SELECT, INSERT ON public.crop_lifecycle_events TO authenticated;
GRANT ALL ON public.crop_lifecycle_events TO service_role;
ALTER TABLE public.crop_lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY lifecycle_events_select ON public.crop_lifecycle_events
  FOR SELECT TO authenticated
  USING (
    (auth.role() = 'service_role') OR
    (public.has_tenant_access(tenant_id) AND farmer_id = public.get_current_farmer_id()) OR
    public.is_tenant_admin()
  );

CREATE POLICY lifecycle_events_insert ON public.crop_lifecycle_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.role() = 'service_role') OR
    (public.has_tenant_access(tenant_id) AND farmer_id = public.get_current_farmer_id())
  );

-- 5. Harvest confirmation requests -------------------------------------
CREATE TABLE IF NOT EXISTS public.harvest_confirmation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  land_id uuid NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.crop_schedules(id) ON DELETE CASCADE,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NULL,
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminded_at timestamptz NULL,
  channel jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.harvest_confirmation_request_status NOT NULL DEFAULT 'PENDING',
  response public.harvest_status NULL,
  responded_at timestamptz NULL,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hcr_schedule ON public.harvest_confirmation_requests(schedule_id);
CREATE INDEX IF NOT EXISTS idx_hcr_status ON public.harvest_confirmation_requests(status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hcr_open_per_schedule
  ON public.harvest_confirmation_requests(schedule_id) WHERE status = 'PENDING';

GRANT SELECT, INSERT, UPDATE ON public.harvest_confirmation_requests TO authenticated;
GRANT ALL ON public.harvest_confirmation_requests TO service_role;
ALTER TABLE public.harvest_confirmation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY hcr_select ON public.harvest_confirmation_requests
  FOR SELECT TO authenticated
  USING (
    (auth.role() = 'service_role') OR
    (public.has_tenant_access(tenant_id) AND farmer_id = public.get_current_farmer_id()) OR
    public.is_tenant_admin()
  );

CREATE POLICY hcr_insert ON public.harvest_confirmation_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.role() = 'service_role') OR
    (public.has_tenant_access(tenant_id) AND farmer_id = public.get_current_farmer_id())
  );

CREATE POLICY hcr_update ON public.harvest_confirmation_requests
  FOR UPDATE TO authenticated
  USING (
    (auth.role() = 'service_role') OR
    (public.has_tenant_access(tenant_id) AND farmer_id = public.get_current_farmer_id())
  );

-- 6. updated_at trigger -------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_hcr_touch ON public.harvest_confirmation_requests;
CREATE TRIGGER trg_hcr_touch BEFORE UPDATE ON public.harvest_confirmation_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Harvest cascade trigger -------------------------------------------
-- When a schedule is marked FULLY_HARVESTED with an actual_harvest_date,
-- release the land and copy archival fields. Never use planned harvest date.
CREATE OR REPLACE FUNCTION public.fn_cascade_harvest_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_land_id uuid;
BEGIN
  IF NEW.harvest_status = 'FULLY_HARVESTED'
     AND NEW.actual_harvest_date IS NOT NULL
     AND (OLD.harvest_status IS DISTINCT FROM NEW.harvest_status
          OR OLD.actual_harvest_date IS DISTINCT FROM NEW.actual_harvest_date) THEN

    NEW.lifecycle_status := 'HARVESTED';
    NEW.is_active := false;
    NEW.status := COALESCE(NEW.status, 'completed');
    IF NEW.harvest_confirmed_at IS NULL THEN
      NEW.harvest_confirmed_at := now();
    END IF;

    v_land_id := NEW.land_id;

    UPDATE public.lands
       SET lifecycle_status = 'AVAILABLE',
           lifecycle_changed_at = now(),
           active_schedule_id = NULL,
           previous_crop_id = current_crop_id,
           previous_crop = current_crop,
           last_crop = current_crop,
           last_harvest_date = NEW.actual_harvest_date,
           current_crop_id = NULL,
           current_crop_variety_id = NULL,
           current_crop = NULL,
           crop_stage = NULL,
           harvest_date = NEW.actual_harvest_date::timestamptz,
           updated_at = now()
     WHERE id = v_land_id;

    INSERT INTO public.crop_lifecycle_events
      (tenant_id, farmer_id, land_id, schedule_id, event_type, from_status, to_status, payload, actor)
    VALUES
      (NEW.tenant_id, NEW.farmer_id, v_land_id, NEW.id, 'HARVEST_COMPLETED',
       COALESCE(OLD.lifecycle_status::text, 'UNKNOWN'), 'HARVESTED',
       jsonb_build_object(
         'actual_harvest_date', NEW.actual_harvest_date,
         'harvest_response', NEW.harvest_response
       ),
       NEW.harvest_confirmed_by);

    -- Close pending confirmation request
    UPDATE public.harvest_confirmation_requests
       SET status = 'RESPONDED',
           response = 'FULLY_HARVESTED',
           responded_at = now(),
           response_payload = NEW.harvest_response
     WHERE schedule_id = NEW.id AND status = 'PENDING';

  ELSIF NEW.harvest_status = 'ABANDONED'
        AND OLD.harvest_status IS DISTINCT FROM NEW.harvest_status THEN
    NEW.lifecycle_status := 'ABANDONED';
    NEW.is_active := false;

    UPDATE public.lands
       SET lifecycle_status = 'AVAILABLE',
           lifecycle_changed_at = now(),
           active_schedule_id = NULL,
           previous_crop_id = current_crop_id,
           previous_crop = current_crop,
           current_crop_id = NULL,
           current_crop_variety_id = NULL,
           current_crop = NULL,
           updated_at = now()
     WHERE id = NEW.land_id;

    INSERT INTO public.crop_lifecycle_events
      (tenant_id, farmer_id, land_id, schedule_id, event_type, from_status, to_status, payload, actor)
    VALUES
      (NEW.tenant_id, NEW.farmer_id, NEW.land_id, NEW.id, 'CROP_ABANDONED',
       COALESCE(OLD.lifecycle_status::text,'UNKNOWN'), 'ABANDONED',
       NEW.harvest_response, NEW.harvest_confirmed_by);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cascade_harvest_completion ON public.crop_schedules;
CREATE TRIGGER trg_cascade_harvest_completion
  BEFORE UPDATE ON public.crop_schedules
  FOR EACH ROW EXECUTE FUNCTION public.fn_cascade_harvest_completion();

-- 8. Block double-active trigger ---------------------------------------
CREATE OR REPLACE FUNCTION public.fn_block_double_active_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_land_status public.land_lifecycle_status;
  v_other_active integer;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT lifecycle_status INTO v_land_status FROM public.lands WHERE id = NEW.land_id;

  IF v_land_status IS NOT NULL
     AND v_land_status NOT IN ('AVAILABLE','PREPARING','HARVEST_COMPLETED') THEN
    -- allow update on the same schedule row
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'LAND_NOT_AVAILABLE: land % is in lifecycle_status % — confirm previous harvest before starting a new crop',
        NEW.land_id, v_land_status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- guard duplicate active schedule per land
  SELECT count(*) INTO v_other_active
    FROM public.crop_schedules
    WHERE land_id = NEW.land_id
      AND is_active = true
      AND id <> NEW.id;

  IF v_other_active > 0 THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_SCHEDULE: land % already has an active schedule', NEW.land_id
      USING ERRCODE = 'unique_violation';
  END IF;

  -- promote land lifecycle on first active schedule
  UPDATE public.lands
     SET lifecycle_status = CASE
           WHEN lifecycle_status IN ('AVAILABLE','PREPARING','HARVEST_COMPLETED') THEN 'CROP_ACTIVE'::public.land_lifecycle_status
           ELSE lifecycle_status END,
         active_schedule_id = NEW.id,
         lifecycle_changed_at = now()
   WHERE id = NEW.land_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_double_active_schedule ON public.crop_schedules;
CREATE TRIGGER trg_block_double_active_schedule
  BEFORE INSERT OR UPDATE OF is_active, land_id ON public.crop_schedules
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_double_active_schedule();

-- 9. Backfill -----------------------------------------------------------
-- crop_schedules: derive lifecycle_status + harvest_status from existing data
UPDATE public.crop_schedules
   SET harvest_status = 'FULLY_HARVESTED',
       lifecycle_status = 'HARVESTED'
 WHERE actual_harvest_date IS NOT NULL
   AND harvest_status = 'NOT_STARTED';

UPDATE public.crop_schedules
   SET lifecycle_status = CASE
         WHEN is_active = true AND expected_harvest_date IS NOT NULL AND expected_harvest_date <= CURRENT_DATE
           THEN 'MATURITY_REACHED'::public.crop_schedule_lifecycle_status
         WHEN is_active = true
           THEN 'GROWING'::public.crop_schedule_lifecycle_status
         ELSE lifecycle_status END
 WHERE lifecycle_status = 'PLANNED';

-- lands: derive lifecycle_status + active_schedule_id
WITH active AS (
  SELECT DISTINCT ON (land_id) land_id, id AS schedule_id, expected_harvest_date
  FROM public.crop_schedules
  WHERE is_active = true
  ORDER BY land_id, created_at DESC
)
UPDATE public.lands l
   SET active_schedule_id = a.schedule_id,
       lifecycle_status = CASE
         WHEN a.expected_harvest_date IS NOT NULL AND a.expected_harvest_date <= CURRENT_DATE
           THEN 'WAITING_HARVEST_CONFIRMATION'::public.land_lifecycle_status
         ELSE 'CROP_ACTIVE'::public.land_lifecycle_status END,
       lifecycle_changed_at = now()
  FROM active a
 WHERE l.id = a.land_id;

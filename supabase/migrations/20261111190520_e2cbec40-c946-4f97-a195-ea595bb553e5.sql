CREATE TABLE public.crop_schedule_review_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 farmer_id uuid NOT NULL,
 land_id uuid NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
 crop_name text NOT NULL,
 requested_language text NOT NULL,
 crop_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
 blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
 source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 review_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.crop_schedule_review_drafts TO service_role;
REVOKE ALL ON public.crop_schedule_review_drafts FROM anon, authenticated;
ALTER TABLE public.crop_schedule_review_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_drafts_server_only ON public.crop_schedule_review_drafts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX crop_schedule_review_drafts_owner_land ON public.crop_schedule_review_drafts (tenant_id, farmer_id, land_id, created_at DESC);
CREATE FUNCTION public.touch_crop_schedule_review_draft() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER touch_crop_schedule_review_draft BEFORE UPDATE ON public.crop_schedule_review_drafts FOR EACH ROW EXECUTE FUNCTION public.touch_crop_schedule_review_draft();
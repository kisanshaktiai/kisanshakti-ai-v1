
CREATE TABLE IF NOT EXISTS public.variety_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  crop_id uuid REFERENCES public.crops(id) ON DELETE SET NULL,
  proposed_name text NOT NULL,
  local_name text,
  season text,
  maturity_days_min int,
  maturity_days_max int,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  approved_variety_id uuid REFERENCES public.master_products(id) ON DELETE SET NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT variety_submissions_status_chk
    CHECK (status IN ('pending','approved','rejected','merged')),
  CONSTRAINT variety_submissions_maturity_chk
    CHECK (maturity_days_min IS NULL OR maturity_days_max IS NULL
           OR maturity_days_min <= maturity_days_max)
);

GRANT SELECT, INSERT ON public.variety_submissions TO authenticated;
GRANT ALL ON public.variety_submissions TO service_role;

ALTER TABLE public.variety_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farmer inserts own submission"
ON public.variety_submissions
FOR INSERT TO authenticated
WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "farmer reads own submission"
ON public.variety_submissions
FOR SELECT TO authenticated
USING (submitted_by = auth.uid());

CREATE POLICY "tenant admin reads tenant submissions"
ON public.variety_submissions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.tenant_id = variety_submissions.tenant_id
    AND ur.role IN ('tenant_admin'::public.app_role, 'super_admin'::public.app_role)
));

CREATE POLICY "tenant admin updates submissions"
ON public.variety_submissions
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.tenant_id = variety_submissions.tenant_id
    AND ur.role IN ('tenant_admin'::public.app_role, 'super_admin'::public.app_role)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.tenant_id = variety_submissions.tenant_id
    AND ur.role IN ('tenant_admin'::public.app_role, 'super_admin'::public.app_role)
));

CREATE INDEX IF NOT EXISTS variety_submissions_pending_idx
  ON public.variety_submissions(tenant_id, created_at DESC)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.tg_variety_submissions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variety_submissions_updated_at ON public.variety_submissions;
CREATE TRIGGER variety_submissions_updated_at
BEFORE UPDATE ON public.variety_submissions
FOR EACH ROW EXECUTE FUNCTION public.tg_variety_submissions_updated_at();

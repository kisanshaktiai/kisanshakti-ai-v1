
-- YouTube engagement tracking for official channel reels (multi-tenant)
CREATE TABLE IF NOT EXISTS public.youtube_reel_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  video_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('view','like','comment','save','share','open_youtube','watch_complete')),
  channel text DEFAULT 'kisanshaktiai',
  watched_seconds numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yt_engagement_tenant_farmer ON public.youtube_reel_engagement(tenant_id, farmer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yt_engagement_video_action ON public.youtube_reel_engagement(video_id, action);
CREATE INDEX IF NOT EXISTS idx_yt_engagement_tenant_video ON public.youtube_reel_engagement(tenant_id, video_id);

GRANT SELECT, INSERT ON public.youtube_reel_engagement TO authenticated;
GRANT ALL ON public.youtube_reel_engagement TO service_role;

ALTER TABLE public.youtube_reel_engagement ENABLE ROW LEVEL SECURITY;

-- Farmers can insert their own engagement, scoped to their tenant
CREATE POLICY "farmer inserts own yt engagement in tenant"
ON public.youtube_reel_engagement
FOR INSERT
TO authenticated
WITH CHECK (
  farmer_id = public.get_current_farmer_id()
  AND tenant_id IN (
    SELECT f.tenant_id FROM public.farmers f
    WHERE f.id = public.get_current_farmer_id()
  )
);

-- Farmers can read their own engagement, scoped to their tenant
CREATE POLICY "farmer reads own yt engagement in tenant"
ON public.youtube_reel_engagement
FOR SELECT
TO authenticated
USING (
  farmer_id = public.get_current_farmer_id()
  AND tenant_id IN (
    SELECT f.tenant_id FROM public.farmers f
    WHERE f.id = public.get_current_farmer_id()
  )
);

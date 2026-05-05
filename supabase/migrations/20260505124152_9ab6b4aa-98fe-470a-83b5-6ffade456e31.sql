
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  parent_id UUID,
  content TEXT NOT NULL,
  language_code TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments(post_id, created_at);
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments read" ON public.post_comments FOR SELECT
  USING (tenant_id = NULLIF(current_setting('request.headers', true)::json->>'x-tenant-id','')::uuid);
CREATE POLICY "comments insert" ON public.post_comments FOR INSERT
  WITH CHECK (farmer_id = NULLIF(current_setting('request.headers', true)::json->>'x-farmer-id','')::uuid);
CREATE POLICY "comments update own" ON public.post_comments FOR UPDATE
  USING (farmer_id = NULLIF(current_setting('request.headers', true)::json->>'x-farmer-id','')::uuid);
CREATE POLICY "comments delete own" ON public.post_comments FOR DELETE
  USING (farmer_id = NULLIF(current_setting('request.headers', true)::json->>'x-farmer-id','')::uuid);

CREATE TABLE IF NOT EXISTS public.post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.post_reports ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_reports ON public.post_reports(post_id, farmer_id);
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports read own" ON public.post_reports FOR SELECT
  USING (farmer_id = NULLIF(current_setting('request.headers', true)::json->>'x-farmer-id','')::uuid);
CREATE POLICY "reports insert" ON public.post_reports FOR INSERT
  WITH CHECK (farmer_id = NULLIF(current_setting('request.headers', true)::json->>'x-farmer-id','')::uuid);

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id UUID, p_farmer_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existed BOOLEAN := false;
BEGIN
  DELETE FROM public.post_likes WHERE post_id = p_post_id AND farmer_id = p_farmer_id
  RETURNING true INTO v_existed;
  IF v_existed THEN
    UPDATE public.social_posts SET likes_count = GREATEST(0, COALESCE(likes_count,0) - 1) WHERE id = p_post_id;
    RETURN false;
  ELSE
    INSERT INTO public.post_likes(post_id, farmer_id) VALUES (p_post_id, p_farmer_id) ON CONFLICT DO NOTHING;
    UPDATE public.social_posts SET likes_count = COALESCE(likes_count,0) + 1 WHERE id = p_post_id;
    RETURN true;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_post_save(p_post_id UUID, p_farmer_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existed BOOLEAN := false;
BEGIN
  DELETE FROM public.post_saves WHERE post_id = p_post_id AND farmer_id = p_farmer_id
  RETURNING true INTO v_existed;
  IF v_existed THEN
    UPDATE public.social_posts SET saves_count = GREATEST(0, COALESCE(saves_count,0) - 1) WHERE id = p_post_id;
    RETURN false;
  ELSE
    INSERT INTO public.post_saves(post_id, farmer_id) VALUES (p_post_id, p_farmer_id) ON CONFLICT DO NOTHING;
    UPDATE public.social_posts SET saves_count = COALESCE(saves_count,0) + 1 WHERE id = p_post_id;
    RETURN true;
  END IF;
END $$;

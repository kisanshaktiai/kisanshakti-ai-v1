
-- ============================================================
-- KisanShakti Reels — P1 Foundation
-- Multi-tenant short-video platform with engagement + moderation
-- ============================================================

-- ---------- ENUMS ----------
CREATE TYPE public.reel_visibility AS ENUM ('global', 'tenant');
CREATE TYPE public.reel_uploader_role AS ENUM ('saas_admin', 'tenant_admin');
CREATE TYPE public.reel_publish_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.reel_moderation_status AS ENUM ('pending', 'approved', 'rejected', 'flagged');
CREATE TYPE public.reel_transcoding_status AS ENUM ('not_required', 'queued', 'processing', 'ready', 'failed');
CREATE TYPE public.reel_video_source AS ENUM ('youtube', 'upload', 'external');
CREATE TYPE public.reel_report_reason AS ENUM ('spam', 'misinformation', 'abuse', 'copyright', 'unsafe', 'other');

-- ---------- CATEGORIES ----------
CREATE TABLE public.reels_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {en:"...", hi:"...", mr:"..."}
  description_i18n JSONB DEFAULT '{}'::jsonb,
  icon TEXT,
  color TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reels_categories_active_sort ON public.reels_categories(is_active, sort_order);

-- ---------- REELS VIDEOS (core) ----------
CREATE TABLE public.reels_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scope
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  visibility_scope reel_visibility NOT NULL DEFAULT 'global',
  uploader_role reel_uploader_role NOT NULL,
  created_by UUID,                                -- admin_users.id or auth.uid()

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.reels_categories(id) ON DELETE SET NULL,
  language_code TEXT NOT NULL DEFAULT 'en',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Media
  source reel_video_source NOT NULL DEFAULT 'youtube',
  video_url TEXT NOT NULL,
  hls_url TEXT,
  thumbnail_url TEXT,
  preview_webp_url TEXT,
  duration_seconds INT,
  width INT,
  height INT,
  aspect_ratio TEXT DEFAULT '9:16',

  -- Pipeline
  transcoding_status reel_transcoding_status NOT NULL DEFAULT 'not_required',
  moderation_status reel_moderation_status NOT NULL DEFAULT 'approved',
  moderation_notes TEXT,
  publish_status reel_publish_status NOT NULL DEFAULT 'published',
  is_featured BOOLEAN NOT NULL DEFAULT false,

  -- AI ready
  ai_tags JSONB DEFAULT '[]'::jsonb,
  ai_transcript JSONB DEFAULT '{}'::jsonb,        -- { lang_code: "transcript text" }

  -- Denormalized engagement (maintained by triggers)
  total_views BIGINT NOT NULL DEFAULT 0,
  total_likes BIGINT NOT NULL DEFAULT 0,
  total_comments BIGINT NOT NULL DEFAULT 0,
  total_shares BIGINT NOT NULL DEFAULT 0,
  total_saves BIGINT NOT NULL DEFAULT 0,
  avg_watch_time NUMERIC(10,2) DEFAULT 0,
  completion_rate NUMERIC(5,2) DEFAULT 0,
  engagement_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  trending_score NUMERIC(10,2) NOT NULL DEFAULT 0,

  published_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reels_videos_scope_chk CHECK (
    (visibility_scope = 'global' AND tenant_id IS NULL) OR
    (visibility_scope = 'tenant' AND tenant_id IS NOT NULL)
  )
);

-- Feed indexes (cursor pagination friendly)
CREATE INDEX idx_reels_feed_global
  ON public.reels_videos(trending_score DESC, id DESC)
  WHERE visibility_scope = 'global' AND publish_status = 'published' AND moderation_status = 'approved';
CREATE INDEX idx_reels_feed_tenant
  ON public.reels_videos(tenant_id, trending_score DESC, id DESC)
  WHERE visibility_scope = 'tenant' AND publish_status = 'published' AND moderation_status = 'approved';
CREATE INDEX idx_reels_videos_category_lang ON public.reels_videos(category_id, language_code);
CREATE INDEX idx_reels_videos_featured ON public.reels_videos(is_featured) WHERE is_featured = true;
CREATE INDEX idx_reels_videos_tags ON public.reels_videos USING GIN(tags);
CREATE INDEX idx_reels_videos_ai_tags ON public.reels_videos USING GIN(ai_tags);
CREATE INDEX idx_reels_videos_created_by ON public.reels_videos(created_by);

-- ---------- ENGAGEMENT TABLES ----------
CREATE TABLE public.reels_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels_videos(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reel_id, farmer_id)
);
CREATE INDEX idx_reels_likes_reel ON public.reels_likes(reel_id);
CREATE INDEX idx_reels_likes_farmer ON public.reels_likes(farmer_id, created_at DESC);

CREATE TABLE public.reels_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels_videos(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reel_id, farmer_id)
);
CREATE INDEX idx_reels_saves_farmer ON public.reels_saves(farmer_id, created_at DESC);

CREATE TABLE public.reels_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels_videos(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  channel TEXT,                  -- whatsapp, copy_link, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reels_shares_reel ON public.reels_shares(reel_id);

CREATE TABLE public.reels_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels_videos(id) ON DELETE CASCADE,
  farmer_id UUID REFERENCES public.farmers(id) ON DELETE SET NULL,
  watched_seconds NUMERIC(10,2) DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reels_views_reel_created ON public.reels_views(reel_id, created_at DESC);
CREATE INDEX idx_reels_views_farmer ON public.reels_views(farmer_id, created_at DESC);

CREATE TABLE public.reels_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels_videos(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.reels_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  language_code TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reels_comments_reel ON public.reels_comments(reel_id, created_at DESC) WHERE is_hidden = false;

CREATE TABLE public.reels_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels_videos(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  reason reel_report_reason NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reel_id, farmer_id, reason)
);
CREATE INDEX idx_reels_reports_status ON public.reels_reports(status, created_at DESC);

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_reels_categories_uat BEFORE UPDATE ON public.reels_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_reels_videos_uat BEFORE UPDATE ON public.reels_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_reels_comments_uat BEFORE UPDATE ON public.reels_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Counter maintenance triggers ----------
CREATE OR REPLACE FUNCTION public.reels_bump_counter(_reel_id UUID, _col TEXT, _delta INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE format('UPDATE public.reels_videos SET %I = GREATEST(0, %I + $1), updated_at = now() WHERE id = $2', _col, _col)
    USING _delta, _reel_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_reels_likes_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN PERFORM public.reels_bump_counter(NEW.reel_id, 'total_likes', 1);
  ELSIF TG_OP = 'DELETE' THEN PERFORM public.reels_bump_counter(OLD.reel_id, 'total_likes', -1);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_reels_likes_aiu AFTER INSERT OR DELETE ON public.reels_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_reels_likes_count();

CREATE OR REPLACE FUNCTION public.trg_reels_saves_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN PERFORM public.reels_bump_counter(NEW.reel_id, 'total_saves', 1);
  ELSIF TG_OP = 'DELETE' THEN PERFORM public.reels_bump_counter(OLD.reel_id, 'total_saves', -1);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_reels_saves_aiu AFTER INSERT OR DELETE ON public.reels_saves
  FOR EACH ROW EXECUTE FUNCTION public.trg_reels_saves_count();

CREATE OR REPLACE FUNCTION public.trg_reels_shares_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.reels_bump_counter(NEW.reel_id, 'total_shares', 1);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_reels_shares_ai AFTER INSERT ON public.reels_shares
  FOR EACH ROW EXECUTE FUNCTION public.trg_reels_shares_count();

CREATE OR REPLACE FUNCTION public.trg_reels_comments_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN PERFORM public.reels_bump_counter(NEW.reel_id, 'total_comments', 1);
  ELSIF TG_OP = 'DELETE' THEN PERFORM public.reels_bump_counter(OLD.reel_id, 'total_comments', -1);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_reels_comments_aiu AFTER INSERT OR DELETE ON public.reels_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_reels_comments_count();

-- View atomic increment RPC (replaces racy client-side read-modify-write)
CREATE OR REPLACE FUNCTION public.reels_record_view(_reel_id UUID, _farmer_id UUID, _watched_seconds NUMERIC DEFAULT 0, _completed BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.reels_views(reel_id, farmer_id, watched_seconds, completed)
    VALUES (_reel_id, _farmer_id, _watched_seconds, _completed);
  PERFORM public.reels_bump_counter(_reel_id, 'total_views', 1);
END $$;

-- ---------- RLS Helper: can the current farmer see this reel? ----------
CREATE OR REPLACE FUNCTION public.reels_visible_to_farmer(_reel_id UUID, _farmer_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reels_videos rv
    LEFT JOIN public.farmers f ON f.id = _farmer_id
    WHERE rv.id = _reel_id
      AND rv.publish_status = 'published'
      AND rv.moderation_status = 'approved'
      AND (
        rv.visibility_scope = 'global'
        OR (rv.visibility_scope = 'tenant' AND rv.tenant_id = f.tenant_id)
      )
  );
$$;

-- ---------- ENABLE RLS ----------
ALTER TABLE public.reels_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_videos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_likes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_saves      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_shares     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_views      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_reports    ENABLE ROW LEVEL SECURITY;

-- ---------- POLICIES: categories ----------
CREATE POLICY "reels_categories_read_active" ON public.reels_categories
  FOR SELECT USING (is_active = true);
CREATE POLICY "reels_categories_admin_write" ON public.reels_categories
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------- POLICIES: videos ----------
-- Read: global to all authenticated; tenant to that tenant's farmers; admins/uploaders see own
CREATE POLICY "reels_videos_read_visible" ON public.reels_videos
  FOR SELECT USING (
    publish_status = 'published'
    AND moderation_status = 'approved'
    AND (
      visibility_scope = 'global'
      OR (
        visibility_scope = 'tenant'
        AND tenant_id = public.get_user_tenant_id(auth.uid())
      )
    )
  );

CREATE POLICY "reels_videos_admin_read_all" ON public.reels_videos
  FOR SELECT USING (
    public.is_super_admin()
    OR (visibility_scope = 'tenant' AND public.is_tenant_admin(tenant_id))
  );

CREATE POLICY "reels_videos_saas_admin_insert_global" ON public.reels_videos
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    AND visibility_scope = 'global'
    AND tenant_id IS NULL
    AND uploader_role = 'saas_admin'
  );

CREATE POLICY "reels_videos_tenant_admin_insert_own" ON public.reels_videos
  FOR INSERT WITH CHECK (
    visibility_scope = 'tenant'
    AND tenant_id IS NOT NULL
    AND uploader_role = 'tenant_admin'
    AND public.is_tenant_admin(tenant_id)
  );

CREATE POLICY "reels_videos_admin_update" ON public.reels_videos
  FOR UPDATE USING (
    public.is_super_admin()
    OR (visibility_scope = 'tenant' AND public.is_tenant_admin(tenant_id))
  );

CREATE POLICY "reels_videos_admin_delete" ON public.reels_videos
  FOR DELETE USING (
    public.is_super_admin()
    OR (visibility_scope = 'tenant' AND public.is_tenant_admin(tenant_id))
  );

-- ---------- POLICIES: engagement (farmer-owned) ----------
-- Likes
CREATE POLICY "reels_likes_self_read" ON public.reels_likes
  FOR SELECT USING (farmer_id = auth.uid() OR public.reels_visible_to_farmer(reel_id, auth.uid()));
CREATE POLICY "reels_likes_self_insert" ON public.reels_likes
  FOR INSERT WITH CHECK (farmer_id = auth.uid() AND public.reels_visible_to_farmer(reel_id, auth.uid()));
CREATE POLICY "reels_likes_self_delete" ON public.reels_likes
  FOR DELETE USING (farmer_id = auth.uid());

-- Saves
CREATE POLICY "reels_saves_self_read" ON public.reels_saves
  FOR SELECT USING (farmer_id = auth.uid());
CREATE POLICY "reels_saves_self_insert" ON public.reels_saves
  FOR INSERT WITH CHECK (farmer_id = auth.uid() AND public.reels_visible_to_farmer(reel_id, auth.uid()));
CREATE POLICY "reels_saves_self_delete" ON public.reels_saves
  FOR DELETE USING (farmer_id = auth.uid());

-- Shares
CREATE POLICY "reels_shares_self_insert" ON public.reels_shares
  FOR INSERT WITH CHECK (farmer_id = auth.uid() AND public.reels_visible_to_farmer(reel_id, auth.uid()));
CREATE POLICY "reels_shares_admin_read" ON public.reels_shares
  FOR SELECT USING (public.is_super_admin());

-- Views (for analytics; farmers can insert via RPC)
CREATE POLICY "reels_views_self_insert" ON public.reels_views
  FOR INSERT WITH CHECK (farmer_id = auth.uid() OR farmer_id IS NULL);
CREATE POLICY "reels_views_admin_read" ON public.reels_views
  FOR SELECT USING (public.is_super_admin());

-- Comments
CREATE POLICY "reels_comments_read_visible" ON public.reels_comments
  FOR SELECT USING (is_hidden = false AND public.reels_visible_to_farmer(reel_id, auth.uid()));
CREATE POLICY "reels_comments_self_insert" ON public.reels_comments
  FOR INSERT WITH CHECK (farmer_id = auth.uid() AND public.reels_visible_to_farmer(reel_id, auth.uid()));
CREATE POLICY "reels_comments_self_update" ON public.reels_comments
  FOR UPDATE USING (farmer_id = auth.uid());
CREATE POLICY "reels_comments_self_delete" ON public.reels_comments
  FOR DELETE USING (farmer_id = auth.uid() OR public.is_super_admin());

-- Reports
CREATE POLICY "reels_reports_self_insert" ON public.reels_reports
  FOR INSERT WITH CHECK (farmer_id = auth.uid());
CREATE POLICY "reels_reports_admin_read" ON public.reels_reports
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY "reels_reports_admin_update" ON public.reels_reports
  FOR UPDATE USING (public.is_super_admin());

-- ============================================================
-- SEED CATEGORIES (multi-lingual)
-- ============================================================
INSERT INTO public.reels_categories (slug, name_i18n, icon, color, sort_order) VALUES
  ('crop_advisory',       '{"en":"Crop Advisory","hi":"फसल सलाह","mr":"पीक सल्ला"}'::jsonb, '🌾', 'hsl(142 70% 45%)', 10),
  ('organic_farming',     '{"en":"Organic Farming","hi":"जैविक खेती","mr":"सेंद्रिय शेती"}'::jsonb, '🌱', 'hsl(120 60% 40%)', 20),
  ('fertilizer',          '{"en":"Fertilizer","hi":"उर्वरक","mr":"खत"}'::jsonb, '💊', 'hsl(35 85% 55%)', 30),
  ('pest_management',     '{"en":"Pest Management","hi":"कीट नियंत्रण","mr":"कीड नियंत्रण"}'::jsonb, '🐛', 'hsl(15 80% 55%)', 40),
  ('machinery',           '{"en":"Machinery","hi":"कृषि यंत्र","mr":"यंत्रसामग्री"}'::jsonb, '🚜', 'hsl(220 60% 50%)', 50),
  ('government_schemes',  '{"en":"Government Schemes","hi":"सरकारी योजनाएं","mr":"सरकारी योजना"}'::jsonb, '🏛️', 'hsl(260 60% 55%)', 60),
  ('weather_advisory',    '{"en":"Weather Advisory","hi":"मौसम सलाह","mr":"हवामान सल्ला"}'::jsonb, '🌦️', 'hsl(200 75% 50%)', 70),
  ('irrigation',          '{"en":"Irrigation","hi":"सिंचाई","mr":"पाणीपुरवठा"}'::jsonb, '💧', 'hsl(195 80% 50%)', 80),
  ('dairy_farming',       '{"en":"Dairy Farming","hi":"डेयरी","mr":"दुग्धव्यवसाय"}'::jsonb, '🐄', 'hsl(40 70% 60%)', 90),
  ('poultry_farming',     '{"en":"Poultry","hi":"मुर्गी पालन","mr":"कुक्कुटपालन"}'::jsonb, '🐔', 'hsl(30 80% 55%)', 100),
  ('success_stories',     '{"en":"Success Stories","hi":"सफलता की कहानियां","mr":"यशोगाथा"}'::jsonb, '🏆', 'hsl(45 90% 55%)', 110),
  ('market_intelligence', '{"en":"Market Prices","hi":"बाजार भाव","mr":"बाजार भाव"}'::jsonb, '📈', 'hsl(160 65% 45%)', 120),
  ('ai_farming',          '{"en":"AI Farming Tips","hi":"AI टिप्स","mr":"AI टिप्स"}'::jsonb, '🤖', 'hsl(280 70% 60%)', 130),
  ('seasonal',            '{"en":"Seasonal Advisory","hi":"मौसमी सलाह","mr":"हंगामी सल्ला"}'::jsonb, '📅', 'hsl(180 60% 45%)', 140),
  ('emergency_alerts',    '{"en":"Emergency Alerts","hi":"आपातकालीन अलर्ट","mr":"आपत्कालीन इशारा"}'::jsonb, '🚨', 'hsl(0 85% 55%)', 150);

-- ============================================================
-- BACKFILL: migrate existing video_tutorials -> reels_videos (global)
-- ============================================================
INSERT INTO public.reels_videos (
  tenant_id, visibility_scope, uploader_role, created_by,
  title, description, category_id, language_code, tags,
  source, video_url, thumbnail_url, duration_seconds,
  publish_status, moderation_status, is_featured,
  total_views, published_at, created_at
)
SELECT
  NULL, 'global'::reel_visibility, 'saas_admin'::reel_uploader_role, NULL,
  vt.title, vt.description,
  (SELECT id FROM public.reels_categories
     WHERE slug = CASE
       WHEN vt.category = 'pesticide' THEN 'pest_management'
       WHEN vt.category = 'harvest'   THEN 'crop_advisory'
       WHEN vt.category = 'weeding'   THEN 'crop_advisory'
       ELSE vt.category
     END
   LIMIT 1),
  COALESCE(vt.language, 'en'),
  COALESCE(vt.tags, ARRAY[]::TEXT[]),
  'youtube'::reel_video_source,
  vt.video_url, vt.thumbnail_url,
  COALESCE(vt.duration_minutes, 0) * 60,
  CASE WHEN vt.is_active THEN 'published'::reel_publish_status ELSE 'archived'::reel_publish_status END,
  'approved'::reel_moderation_status,
  COALESCE(vt.is_featured, false),
  COALESCE(vt.view_count, 0),
  COALESCE(vt.created_at, now()),
  COALESCE(vt.created_at, now())
FROM public.video_tutorials vt;
